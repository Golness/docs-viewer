/**
 * 文档同步相关路由
 * 所有 LLM 调用统一委托给 DSH Subagent
 */

import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { findRequirementDir } from '../doc-reader.js';
import { getBranchCommits, getBranchCodeDiff, getUncommittedChanges, getFullCodeDiff, buildSyncVariables, parseSyncResponse, buildSyncLog, findBranchByRequirement } from '../sync-engine.js';
import { PhasedSyncEngine } from '../phased-sync-engine.js';
import { listRelatedSessions } from '../session-selector.js';
import { extractSessionTurns, extractMultipleSessionTurns, calculateTurnsTokens } from '../session-utils.js';
import { executeTask } from '../task-executor.js';
import { json, readBody } from '../utils.js';
import { log } from '../logger.js';
import { 
  loadState, 
  getActiveSync, 
  setActiveSync, 
  completeSync, 
  updateSyncProgress,
  getSyncHistory, 
  getSyncById 
} from '../sync-state.js';
import { buildTree } from '../tree.js';
import { rebuildIndex } from '../index-manager.js';
import { analyzeRequirement } from '../analyze-engine.js';
import { charsToTokens, estimateTextTokens, formatTokens } from '../token-utils.js';

export function createSyncRoutes(registry, llm, sessions, agents, ctx) {
  // 从 ctx 获取 sessionQuery 服务
  const sessionQuery = ctx?.sessionQuery;
  
  return [
    // GET /git-branch - 获取 Git 分支信息
    {
      kind: 'exact',
      path: '/req-hub/git-branch',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');

        if (!workspaceId) {
          json(res, { error: 'missing workspaceId' }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        try {
          const { exec } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execAsync = promisify(exec);
          
          const { stdout } = await execAsync('git branch --show-current', { cwd: workspace.path });
          const branch = stdout.trim();
          
          json(res, { branch: branch || null });
        } catch (e) {
          json(res, { branch: null });
        }
      }
    },

    // GET /sync-branch-info - 获取同步分支信息（目标分支和基准分支）
    {
      kind: 'exact',
      path: '/req-hub/sync-branch-info',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const requirementId = url.searchParams.get('requirementId');

        if (!workspaceId || !requirementId) {
          json(res, { error: 'missing workspaceId or requirementId' }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        try {
          // Find target branch for this requirement
          const targetBranch = await findBranchByRequirement(workspace.path, requirementId);
          
          // Detect base branch
          const { exec } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execAsync = promisify(exec);
          
          let baseBranch = null;
          const candidates = ['main', 'master'];
          for (const name of candidates) {
            try {
              const { stdout } = await execAsync(`git rev-parse --verify "${name}"`, { cwd: workspace.path });
              if (stdout.trim()) {
                baseBranch = name;
                break;
              }
            } catch { /* branch does not exist */ }
          }
          
          json(res, { 
            targetBranch, 
            baseBranch,
            currentBranch: targetBranch || '未找到'
          });
        } catch (e) {
          json(res, { error: e.message });
        }
      }
    },

    // GET /sessions - 获取相关 DSH 会话列表
    {
      kind: 'exact',
      path: '/req-hub/sessions',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const query = url.searchParams.get('query') || '';
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);

        if (!workspaceId) {
          json(res, { error: 'missing workspaceId' }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        try {
          const sessionsList = await listRelatedSessions(sessions, workspace.path, { limit, query, sessionQuery });
          json(res, { sessions: sessionsList });
        } catch (e) {
          log.sync.error(`获取会话列表失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /session-info - 获取指定会话的详细信息
    {
      kind: 'exact',
      path: '/req-hub/session-info',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const sessionId = url.searchParams.get('sessionId');

        if (!sessionId) {
          json(res, { error: 'missing sessionId' }, 400);
          return;
        }

        try {
          // 优先使用 sessionQuery 服务（支持持久化会话）
          if (sessionQuery) {
            try {
              const titleObservation = await sessionQuery.readTitleSnapshot(sessionId);
              if (titleObservation && titleObservation.session) {
                const header = titleObservation.session;
                json(res, {
                  session: {
                    id: header.id,
                    title: titleObservation.title?.title || '(无标题)',
                    cwd: header.cwd || '',
                    createdAt: header.createdAt,
                    parentSession: header.parentSession || null,
                  }
                });
                return;
              }
            } catch (e) {
              // sessionQuery 失败，尝试 sessions 服务
              log.sync.debug(`sessionQuery 获取会话失败: ${e.message}，尝试 sessions 服务`);
            }
          }
          
          // 使用 sessions 服务获取活跃会话
          if (!sessions) {
            log.sync.error('sessions 和 sessionQuery 服务都不可用');
            json(res, { error: '会话服务不可用' }, 500);
            return;
          }

          // 尝试获取活跃会话
          const session = sessions.get(sessionId);
          if (!session) {
            log.sync.error(`会话不存在或已关闭: ${sessionId}`);
            json(res, { error: '会话不存在或已关闭', sessionId }, 404);
            return;
          }

          const header = session.header;
          log.sync.debug(`获取到活跃会话`, { sessionId, cwd: header.cwd });

          // 返回会话信息
          json(res, {
            session: {
              id: header.id,
              title: '(当前会话)', // 活跃会话没有标题存储
              cwd: header.cwd || '',
              createdAt: header.createdAt,
              parentSession: header.parentSession || null,
            }
          });
        } catch (e) {
          log.sync.error(`获取会话详情失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /current-session - 获取当前会话信息（最近的会话）
    {
      kind: 'exact',
      path: '/req-hub/current-session',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          // 优先使用 sessionQuery 服务
          if (sessionQuery) {
            try {
              const allRecords = await sessionQuery.listSessions();
              
              if (!allRecords || allRecords.length === 0) {
                json(res, { session: null, debug: { message: '没有找到任何会话' } });
                return;
              }

              // 过滤主会话（没有 parentSession）
              const mainRecords = allRecords
                .filter(r => !r.header.parentSession)
                .sort((a, b) => (b.header.createdAt || 0) - (a.header.createdAt || 0));

              if (mainRecords.length === 0) {
                json(res, { session: null, debug: { message: '没有找到主会话' } });
                return;
              }

              const latest = mainRecords[0];
              const header = latest.header;

              // 获取标题
              let title = '(无标题)';
              try {
                const titleSnapshot = await sessionQuery.readTitle(header.id);
                title = titleSnapshot?.title || '(无标题)';
              } catch (e) {}

              json(res, {
                session: {
                  id: header.id,
                  title,
                  cwd: header.cwd || '',
                  createdAt: header.createdAt,
                  parentSession: header.parentSession || null,
                  isLive: latest.live,
                }
              });
              return;
            } catch (e) {
              log.sync.debug(`sessionQuery 获取当前会话失败: ${e.message}，尝试 sessions 服务`);
            }
          }
          
          // 后备：使用 sessions 服务
          if (!sessions) {
            json(res, { error: 'sessions 和 sessionQuery 服务都不可用' }, 500);
            return;
          }

          // 获取所有活跃会话
          const allSessions = sessions.list();
          
          if (!allSessions || allSessions.length === 0) {
            json(res, { session: null, debug: { message: '没有找到任何活跃会话' } });
            return;
          }

          // 过滤出主会话（没有 parentSession）并按创建时间排序
          const mainSessions = allSessions
            .filter(s => !s.header.parentSession)
            .sort((a, b) => (b.header.createdAt || 0) - (a.header.createdAt || 0));

          if (mainSessions.length === 0) {
            json(res, { 
              session: null, 
              debug: { 
                message: '没有找到主会话',
                totalSessions: allSessions.length
              } 
            });
            return;
          }

          // 使用最近的一个主会话
          const latestSession = mainSessions[0];
          const header = latestSession.header;

          json(res, {
            session: {
              id: header.id,
              title: '(当前会话)',
              cwd: header.cwd || '',
              createdAt: header.createdAt,
              parentSession: header.parentSession || null,
            }
          });
        } catch (e) {
          log.sync.error(`获取当前会话失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /session-turns - 获取会话的轮次内容预览
    {
      kind: 'exact',
      path: '/req-hub/session-turns',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const sessionId = url.searchParams.get('sessionId');
        const debug = url.searchParams.get('debug') === 'true';

        if (!sessionId) {
          json(res, { error: 'missing sessionId' }, 400);
          return;
        }

        try {
          // 调试模式：返回原始事件数据
          if (debug) {
            const logSnapshot = await sessionQuery.readSession(sessionId);
            const events = logSnapshot.events;
            const userMsgs = events.filter(e => e.type === 'user/message');
            json(res, {
              eventCount: events.length,
              eventTypes: [...new Set(events.map(e => e.type))],
              userMessageCount: userMsgs.length,
              firstUserMessage: userMsgs[0] || null,
              secondUserMessage: userMsgs[1] || null,
            });
            return;
          }
          
          // 使用统一的提取方法
          const turns = await extractSessionTurns(sessionQuery, sessionId);
          const totalTokens = calculateTurnsTokens(turns);
          
          json(res, {
            success: true,
            turns,
            turnCount: turns.length,
            totalTokens,
          });
        } catch (e) {
          log.sync.error(`获取会话轮次失败: ${e.message}`);
          json(res, { success: false, error: e.message }, 500);
        }
      }
    },

    // POST /sync-docs - 同步文档（传统模式）
    {
      kind: 'exact',
      path: '/req-hub/sync-docs',
      handler(req, res) {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 1024 * 1024) {
            req.destroy();
          }
        });

        req.on('end', async () => {
          try {
            const input = JSON.parse(body);
            const { workspaceId, requirementId, docType } = input;

            if (!workspaceId || !requirementId || !docType) {
              json(res, { error: 'Missing workspaceId, requirementId, or docType' }, 400);
              return;
            }

            const workspaces = registry.list();
            const workspace = workspaces.find(w => w.id === workspaceId);

            if (!workspace) {
              json(res, { error: 'Workspace not found' }, 404);
              return;
            }

            // Set up SSE
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            });

            const sendEvent = (data) => {
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            const config = await loadConfig();
            
            if (!llm) {
              sendEvent({ type: 'error', error: 'LLM not available' });
              res.end();
              return;
            }

            // Step 1: Find requirement directory
            const docsRoot = resolve(workspace.path, config.docsDir || 'docs');
            const reqDir = await findRequirementDir(docsRoot, requirementId);
            
            if (!reqDir) {
              sendEvent({ type: 'error', error: `Requirement directory not found: ${requirementId}` });
              res.end();
              return;
            }

            // Step 2: Find branch by requirement name
            sendEvent({ type: 'status', text: `🔍 查找分支: ${requirementId}` });
            const branchName = await findBranchByRequirement(workspace.path, requirementId);
            
            if (!branchName) {
              sendEvent({ type: 'error', error: `未找到包含 "${requirementId}" 的 Git 分支` });
              res.end();
              return;
            }
            
            sendEvent({ type: 'status', text: `✅ 找到分支: ${branchName}` });

            // Step 3: Get commits
            sendEvent({ type: 'status', text: '📝 获取分支提交记录...' });
            let commits;
            try {
              commits = await getBranchCommits(workspace.path, branchName);
            } catch (e) {
              sendEvent({ type: 'error', error: `获取提交记录失败: ${e.message}` });
              res.end();
              return;
            }

            if (!commits || commits.length === 0) {
              sendEvent({ type: 'error', error: '该分支没有提交记录' });
              res.end();
              return;
            }

            sendEvent({ type: 'status', text: `✅ 找到 ${commits.length} 个提交` });

            // Step 4: Get code diff
            sendEvent({ type: 'status', text: '🔧 分析代码变更...' });
            let codeDiff;
            try {
              codeDiff = await getBranchCodeDiff(workspace.path, branchName);
            } catch (e) {
              sendEvent({ type: 'error', error: `获取代码变更失败: ${e.message}` });
              res.end();
              return;
            }

            if (!codeDiff || codeDiff.trim().length === 0) {
              sendEvent({ type: 'error', error: '没有检测到代码变更' });
              res.end();
              return;
            }

            sendEvent({ type: 'status', text: `✅ 代码变更: 约 ${formatTokens(charsToTokens(codeDiff.length))} tokens` });

            // Step 5: Read current document
            sendEvent({ type: 'status', text: `📖 读取当前${docType === 'requirement' ? '需求' : '技术'}文档...` });
            const docFileName = docType === 'requirement' ? 'requirement.md' : 'design.md';
            const docPath = join(reqDir, docFileName);
            
            let currentDoc;
            try {
              currentDoc = await readFile(docPath, 'utf8');
            } catch (e) {
              if (e.code === 'ENOENT') {
                sendEvent({ type: 'error', error: `${docFileName} 不存在，请先创建${docType === 'requirement' ? '需求' : '技术'}文档` });
                res.end();
                return;
              }
              throw e;
            }

            sendEvent({ type: 'status', text: '🧠 AI 正在分析差异...' });

            // Step 6: 构建模板变量
            const variables = buildSyncVariables(docType, currentDoc, commits, codeDiff, config);

            // Step 7: Call LLM via TaskExecutor
            sendEvent({ type: 'stream_start' });
            
            // 需要获取父 Agent
            const parentAgent = agents?.get(sessionId);
            if (!parentAgent) {
              sendEvent({ type: 'error', error: '会话不存在或已结束，请在活跃的 DSH 会话中调用此功能' });
              res.end();
              return;
            }

            let content = '';
            try {
              const result = await executeTask(ctx, llm, config, {
                promptKey: 'sync',
                variables,  // 使用模板变量
                parentAgent,
                cwd: workspace.path,
                description: `同步${docType === 'requirement' ? '需求' : '技术'}文档`,
              });
              
              if (result.isError) {
                sendEvent({ type: 'error', error: result.diagnostic || 'AI 分析失败' });
                res.end();
                return;
              }
              
              content = result.output;
              sendEvent({ type: 'stream_delta', text: content });
              sendEvent({ type: 'stream_end', text: content });
            } catch (e) {
              sendEvent({ type: 'error', error: `LLM 错误: ${e.message}` });
              res.end();
              return;
            }

            // Step 8: Parse response
            sendEvent({ type: 'status', text: '📊 解析分析结果...' });
            let syncResult;
            try {
              syncResult = parseSyncResponse(content);
            } catch (e) {
              sendEvent({ type: 'error', error: `解析失败: ${e.message}` });
              res.end();
              return;
            }

            // Step 9: Update document
            sendEvent({ type: 'status', text: '💾 更新文档...' });
            const updatedDoc = syncResult.updatedDocument || currentDoc;
            await writeFile(docPath, updatedDoc, 'utf8');

            // Step 10: Create sync log
            const syncLogPath = join(reqDir, `sync-${docType}-${Date.now()}.md`);
            const syncLog = buildSyncLog(docType, commits, syncResult);
            await writeFile(syncLogPath, syncLog, 'utf8');

            log.sync.info(`${docType === 'requirement' ? '需求' : '技术'}文档同步完成`);

            sendEvent({
              type: 'done',
              docType,
              changes: syncResult.changes || [],
              additions: syncResult.additions || [],
              logFile: `sync-${docType}-${Date.now()}.md`
            });

            res.end();
          } catch (e) {
            log.sync.error(`文档同步失败: ${e.message}`);
            if (res.headersSent) {
              try {
                res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
              } catch { /* ignore */ }
            } else {
              json(res, { error: e.message }, 500);
            }
            try { res.end(); } catch { /* ignore */ }
          }
        });
      }
    },

    // POST /phased-sync - 分阶段同步（代码 + 对话）
    {
      kind: 'exact',
      path: '/req-hub/phased-sync',
      async handler(req, res) {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }

        // 从请求头获取当前会话 ID（用于获取 parentAgent）
        const sessionId = req.headers['x-session-id'];
        
        let body = '';
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 1024 * 1024 * 10) {
            req.destroy();
          }
        });

        req.on('end', async () => {
          try {
            const input = JSON.parse(body);
            const { workspaceId, requirementId, docType, sessionIds = [], runAnalysis = false, runIndex = false } = input;

            if (!workspaceId || !requirementId || !docType) {
              json(res, { error: 'Missing workspaceId, requirementId, or docType' }, 400);
              return;
            }

            const workspaces = registry.list();
            const workspace = workspaces.find(w => w.id === workspaceId);

            if (!workspace) {
              json(res, { error: 'Workspace not found' }, 404);
              return;
            }

            // Check if there's already an active sync
            const existingActive = await getActiveSync(workspaceId, requirementId);
            if (existingActive && existingActive.status === 'running') {
              // 返回活动同步信息，让前端可以跳转到进度页面
              json(res, { 
                active: true, 
                sync: existingActive,
                message: '已有同步任务正在执行中'
              }, 200);
              return;
            }

            // Create sync task
            const syncId = `sync-${Date.now()}`;
            const docTypeName = docType === 'requirement' ? '需求文档' : '技术方案';
            
            const syncTask = {
              id: syncId,
              workspaceId,
              requirementId,
              docType,
              docTypeName,
              sessionIds,
              startedAt: Date.now(),
              status: 'running', // running | completed | failed
              steps: [
                { phase: 'init', label: '初始化', status: 'pending', text: '', files: [], chunks: null },
                { phase: 'session_extract', label: '会话提取', status: 'pending', text: '', files: [], chunks: null },
                { phase: 'code_analysis', label: '代码差异分析', status: 'pending', text: '', files: [], chunks: null },
                { phase: 'discussion_analysis', label: '讨论差异分析', status: 'pending', text: '', files: [], chunks: null },
                { phase: 'merge', label: '增量合并', status: 'pending', text: '', files: [], chunks: null },
                { phase: 'save', label: '保存文件', status: 'pending', text: '', files: [], chunks: null },
                ...(runAnalysis ? [{ phase: 'analysis', label: '构建分析', status: 'pending', text: '', files: [], chunks: null }] : []),
                ...(runIndex ? [{ phase: 'index', label: '构建索引', status: 'pending', text: '', files: [], chunks: null }] : []),
              ],
              generatedFiles: [],
              runAnalysis,
              runIndex,
            };

            // Set up SSE
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            });

            const sendEvent = (data) => {
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            // Helper to update step and persist
            const updateStep = async (phase, updates) => {
              const step = syncTask.steps.find(s => s.phase === phase);
              if (step) {
                Object.assign(step, updates);
              }
              await updateSyncProgress(syncId, { steps: syncTask.steps, generatedFiles: syncTask.generatedFiles });
              sendEvent({ type: 'step', phase, ...updates });
            };

            const addFile = async (phase, fileName) => {
              const step = syncTask.steps.find(s => s.phase === phase);
              if (step) {
                step.files.push(fileName);
              }
              syncTask.generatedFiles.push({ phase, fileName });
              await updateSyncProgress(syncId, { steps: syncTask.steps, generatedFiles: syncTask.generatedFiles });
              sendEvent({ type: 'file', phase, fileName });
            };

            const config = await loadConfig();
            
            if (!llm) {
              await updateStep('init', { status: 'failed', text: 'LLM 不可用' });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: 'LLM not available' });
              res.end();
              return;
            }

            // ─── Step 1: Init ─────────────────────────────────────
            await updateStep('init', { status: 'running', text: '查找分支和提交记录...' });

            const docsRoot = resolve(workspace.path, config.docsDir || 'docs');
            const reqDir = await findRequirementDir(docsRoot, requirementId);
            
            if (!reqDir) {
              await updateStep('init', { status: 'failed', text: `需求目录未找到: ${requirementId}` });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: `Requirement directory not found: ${requirementId}` });
              res.end();
              return;
            }
            
            // 现在有了 reqDir，保存活动同步
            await setActiveSync(syncTask, reqDir);

            // Find branch by requirement name
            const branchName = await findBranchByRequirement(workspace.path, requirementId);
            if (!branchName) {
              await updateStep('init', { status: 'failed', text: `未找到包含 "${requirementId}" 的 Git 分支` });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: `未找到包含 "${requirementId}" 的 Git 分支` });
              res.end();
              return;
            }
            
            await updateStep('init', { status: 'running', text: `找到分支: ${branchName}` });

            let commits;
            try {
              commits = await getBranchCommits(workspace.path, branchName);
            } catch (e) {
              await updateStep('init', { status: 'failed', text: `获取提交记录失败: ${e.message}` });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: `获取提交记录失败: ${e.message}` });
              res.end();
              return;
            }

            // 获取完整代码差异（包括已提交和未提交的）
            let fullCodeDiff;
            try {
              fullCodeDiff = await getFullCodeDiff(workspace.path, branchName);
            } catch (e) {
              await updateStep('init', { status: 'failed', text: `获取代码变更失败: ${e.message}` });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: `获取代码变更失败: ${e.message}` });
              res.end();
              return;
            }

            const { committedDiff, uncommittedChanges, combined: codeDiff } = fullCodeDiff;

            // 只要有代码变更（已提交或未提交），就继续
            if (!codeDiff || codeDiff.trim().length === 0) {
              await updateStep('init', { status: 'failed', text: '没有检测到代码变更' });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: '没有检测到代码变更' });
              res.end();
              return;
            }

            // Read current document
            const docFileName = docType === 'requirement' ? 'requirement.md' : 'design.md';
            const docPath = join(reqDir, docFileName);
            
            let currentDoc;
            let isNewDoc = false;
            try {
              currentDoc = await readFile(docPath, 'utf8');
            } catch (e) {
              if (e.code === 'ENOENT') {
                currentDoc = '';
                isNewDoc = true;
              } else {
                throw e;
              }
            }

            // 构建初始化完成信息
            let initText = '';
            if (commits && commits.length > 0) {
              initText = `${commits.length} 个提交`;
            } else {
              initText = '无提交记录';
            }
            if (uncommittedChanges.hasChanges) {
              const parts = [];
              if (uncommittedChanges.staged) parts.push('已暂存');
              if (uncommittedChanges.unstaged) parts.push('未暂存');
              if (uncommittedChanges.untracked.length > 0) parts.push(`${uncommittedChanges.untracked.length} 个新文件`);
              initText += `，未提交变更: ${parts.join('、')}`;
            }
            initText += `，代码变更约 ${formatTokens(charsToTokens(codeDiff.length))} tokens`;
            if (isNewDoc) initText += '，新建文档';

            await updateStep('init', { 
              status: 'completed', 
              text: initText,
              hasUncommitted: uncommittedChanges.hasChanges,
            });

            // ─── Step 2: Session Extract ──────────────────────────
            let sessionTurns = [];
            if (sessionIds.length > 0) {
              await updateStep('session_extract', { status: 'running', text: `提取 ${sessionIds.length} 个会话内容...` });
              
              try {
                // 使用统一的提取方法，分析时不截断摘要（maxSummaryChars: -1）
                const result = await extractMultipleSessionTurns(sessionQuery, sessionIds, { 
                  maxSummaryChars: -1 // 不截断
                });
                sessionTurns = result.turns;
                
                await updateStep('session_extract', { 
                  status: 'completed', 
                  text: `${sessionTurns.length} 个轮次，约 ${formatTokens(result.totalTokens)} tokens` 
                });
              } catch (e) {
                log.sync.warn(`提取会话内容失败: ${e.message}`);
                await updateStep('session_extract', { status: 'failed', text: `提取失败: ${e.message}` });
              }
            } else {
              await updateStep('session_extract', { status: 'skipped', text: '未选择会话' });
            }

            // ─── Step 3-5: Run phased sync engine ────────────────
            // 创建同步目录（提前创建，用于保存中间结果）
            const timestamp = Date.now();
            const syncDirName = `sync-${timestamp}`;
            const syncBaseDir = join(reqDir, 'sync-logs');
            const syncDir = join(syncBaseDir, syncDirName);
            const { mkdir } = await import('node:fs/promises');
            await mkdir(syncBaseDir, { recursive: true });
            await mkdir(syncDir, { recursive: true });

            // 获取父 Agent（用于 subagent 委托）
            const parentAgent = agents?.get(sessionId);
            if (!parentAgent) {
              await updateStep('code_analysis', { status: 'failed', text: '会话不存在或已结束，请在活跃的 DSH 会话中调用此功能' });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: '会话不存在或已结束，请在活跃的 DSH 会话中调用此功能' });
              res.end();
              return;
            }

            const engine = new PhasedSyncEngine({
              llm,
              config,
              cwd: workspace.path,
              ctx,
              parentAgent,
            });
            
            const result = await engine.sync({
              docType,
              currentDoc,
              commits,
              codeDiff,
              sessionTurns,
              hasUncommitted: uncommittedChanges.hasChanges,
              onProgress: async (progress) => {
                // Map engine progress to our step system
                const { phase, status, content } = progress;
                
                // 处理 code_analysis 阶段
                if (phase === 'code_analysis') {
                  if (status === 'started') {
                    updateStep('code_analysis', { 
                      status: 'running', 
                      text: `AI 分析代码差异点... (约 ${formatTokens(progress.codeTokens)} tokens，${progress.codeFiles} 个文件)`,
                    });
                  } else if (status === 'chunked') {
                    // 分块信息
                    updateStep('code_analysis', { 
                      text: `代码分块完成，共 ${progress.totalChunks} 块`,
                      chunks: progress.chunks,
                      totalTokens: progress.totalTokens,
                    });
                  } else if (status === 'processing_chunk') {
                    updateStep('code_analysis', { 
                      text: progress.message || '分析差异点中...',
                      chunkInfo: progress.chunkInfo,
                    });
                  } else if (status === 'merging_chunks') {
                    updateStep('code_analysis', { text: '合并差异点...' });
                  } else if (status === 'completed') {
                    updateStep('code_analysis', { status: 'completed', text: '代码差异分析完成' });
                    // 立即保存代码差异分析文件
                    if (content) {
                      const codeAnalysisPath = join(syncDir, 'code-diffs.md');
                      await writeFile(codeAnalysisPath, content, 'utf8');
                      await addFile('code_analysis', `sync-logs/${syncDirName}/code-diffs.md`);
                    }
                  } else if (status === 'failed') {
                    updateStep('code_analysis', { status: 'failed', text: '代码差异分析失败' });
                  }
                } 
                // 处理 discussion_analysis 阶段
                else if (phase === 'discussion_analysis') {
                  if (status === 'started') {
                    updateStep('discussion_analysis', { status: 'running', text: 'AI 分析讨论差异点...' });
                  } else if (status === 'chunked') {
                    // 分块信息
                    updateStep('discussion_analysis', { 
                      text: `讨论分块完成，共 ${progress.totalChunks} 块`,
                      chunks: progress.chunks,
                      totalTokens: progress.totalTokens,
                    });
                  } else if (status === 'processing_chunk') {
                    updateStep('discussion_analysis', { 
                      text: progress.message || '分析差异点中...',
                      chunkInfo: progress.chunkInfo,
                    });
                  } else if (status === 'merging_chunks') {
                    updateStep('discussion_analysis', { text: '合并差异点...' });
                  } else if (status === 'completed') {
                    updateStep('discussion_analysis', { status: 'completed', text: '讨论差异分析完成' });
                    // 立即保存讨论差异分析文件
                    if (content) {
                      const discussionAnalysisPath = join(syncDir, 'discussion-diffs.md');
                      await writeFile(discussionAnalysisPath, content, 'utf8');
                      await addFile('discussion_analysis', `sync-logs/${syncDirName}/discussion-diffs.md`);
                    }
                  } else if (status === 'failed') {
                    updateStep('discussion_analysis', { status: 'failed', text: '讨论差异分析失败' });
                  }
                } else if (phase === 'merge') {
                  if (status === 'started') {
                    updateStep('merge', { status: 'running', text: 'AI 合并变更到文档...' });
                  } else if (status === 'completed') {
                    updateStep('merge', { status: 'completed', text: '文档合并完成' });
                  } else if (status === 'failed') {
                    updateStep('merge', { status: 'failed', text: '文档合并失败' });
                  }
                }
              }
            });

            // Update discussion_analysis step if no session turns
            if (sessionTurns.length === 0) {
              await updateStep('discussion_analysis', { status: 'skipped', text: '无对话内容' });
            }

            // ─── Step 6: Save files ──────────────────────────────
            if (!result.mergedDoc) {
              await updateStep('save', { status: 'failed', text: '同步失败：未能生成最终文档' });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: '同步失败：未能生成最终文档' });
              res.end();
              return;
            }

            await updateStep('save', { status: 'running', text: '保存文件...' });

            // Save main document (always in reqDir root)
            await writeFile(docPath, result.mergedDoc, 'utf8');
            await addFile('save', docFileName);

            // Create sync log in sync subdirectory
            if (result.syncLog) {
              const syncLogPath = join(syncDir, 'sync-log.md');
              await writeFile(syncLogPath, result.syncLog, 'utf8');
              await addFile('save', `sync-logs/${syncDirName}/sync-log.md`);
            }

            await updateStep('save', { status: 'completed', text: `所有文件已保存到 sync-logs/${syncDirName}/` });

            // ─── Step 7: Build Analysis (optional) ─────────────────
            if (runAnalysis) {
              try {
                await updateStep('analysis', { status: 'running', text: 'AI 分析需求文档...' });
                
                const docsRoot = resolve(workspace.path, config.docsDir || 'docs');
                const tree = await buildTree(docsRoot);
                
                // Find the requirement in tree
                let reqInfo = null;
                for (const dev of tree.developers) {
                  for (const req of dev.requirements) {
                    if (req.id === requirementId) {
                      reqInfo = { id: req.id, developer: dev.name, path: req.path };
                      break;
                    }
                  }
                  if (reqInfo) break;
                }
                
                if (!reqInfo) {
                  await updateStep('analysis', { status: 'failed', text: '未找到需求目录' });
                } else {
                  const parentAgent = agents?.get(sessionId);
                  if (!parentAgent) {
                    await updateStep('analysis', { status: 'failed', text: '会话不存在或已结束' });
                  } else {
                    const reqPath = join(docsRoot, reqInfo.path);
                    const result = await analyzeRequirement({
                      ctx,
                      llm,
                      config,
                      parentAgent,
                      reqPath,
                      requirementId,
                      cwd: workspace.path,
                    });

                    if (result.success) {
                      await addFile('analysis', '.meta.json');
                      await updateStep('analysis', { status: 'completed', text: `分析完成：${result.meta?.summary || '已生成'}` });
                    } else {
                      await updateStep('analysis', { status: 'failed', text: result.error || '分析失败' });
                    }
                  }
                }
              } catch (e) {
                log.analysis.error(`构建分析失败: ${e.message}`);
                await updateStep('analysis', { status: 'failed', text: `分析失败: ${e.message}` });
              }
            }

            // ─── Step 8: Build Index (optional) ─────────────────
            if (runIndex) {
              try {
                await updateStep('index', { status: 'running', text: '重建搜索索引...' });
                
                const docsRoot = resolve(workspace.path, config.docsDir || 'docs');
                const tree = await buildTree(docsRoot);
                const index = await rebuildIndex(docsRoot, tree);
                
                await updateStep('index', { 
                  status: 'completed', 
                  text: `索引重建完成：${index.requirements.length} 需求，${Object.keys(index.featureIndex).length} 功能点` 
                });
              } catch (e) {
                log.index.error(`构建索引失败: ${e.message}`);
                await updateStep('index', { status: 'failed', text: `索引失败: ${e.message}` });
              }
            }

            // Mark sync as completed
            syncTask.status = 'completed';
            syncTask.stats = result.stats;
            await completeSync(syncId);

            log.sync.info(`${docTypeName}分阶段同步完成`);

            sendEvent({
              type: 'done',
              syncId,
              docType,
              stats: result.stats,
              files: syncTask.generatedFiles,
            });

            res.end();
          } catch (e) {
            log.sync.error(`分阶段同步失败: ${e.message}`);
            
            // 标记任务失败并清理状态
            syncTask.status = 'failed';
            await completeSync(syncId);
            
            if (res.headersSent) {
              try {
                res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
              } catch { /* ignore */ }
            } else {
              json(res, { error: e.message }, 500);
            }
            try { res.end(); } catch { /* ignore */ }
          }
        });
      }
    },

    // GET /sync-active - Get active sync task
    {
      kind: 'exact',
      path: '/req-hub/sync-active',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const requirementId = url.searchParams.get('requirementId');

        if (!workspaceId || !requirementId) {
          json(res, { error: 'missing workspaceId or requirementId' }, 400);
          return;
        }

        try {
          // 先找到 requirement 路径，然后加载状态
          const workspace = registry.list().find(w => w.id === workspaceId);
          if (!workspace) {
            json(res, { active: false, sync: null });
            return;
          }

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir || 'docs');
          const reqDir = await findRequirementDir(docsRoot, requirementId);
          
          if (reqDir) {
            // 加载状态
            await loadState(workspaceId, requirementId, reqDir);
          }

          const activeSync = await getActiveSync(workspaceId, requirementId);
          json(res, { active: !!activeSync, sync: activeSync });
        } catch (e) {
          log.sync.error(`获取活动同步失败: ${e.message}`);
          json(res, { active: false, sync: null });
        }
      }
    },

    // GET /sync-history - Get sync history list
    {
      kind: 'exact',
      path: '/req-hub/sync-history',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const requirementId = url.searchParams.get('requirementId');

        if (!workspaceId || !requirementId) {
          json(res, { error: 'missing workspaceId or requirementId' }, 400);
          return;
        }

        try {
          // Find workspace and requirement directory to load state from disk
          const workspace = registry.list().find(w => w.id === workspaceId);
          if (workspace) {
            const config = await loadConfig();
            const docsRoot = resolve(workspace.path, config.docsDir || 'docs');
            const reqDir = await findRequirementDir(docsRoot, requirementId);

            if (reqDir) {
              // Load state from disk before querying history
              await loadState(workspaceId, requirementId, reqDir);
            }
          }

          const history = await getSyncHistory(workspaceId, requirementId);
          json(res, { history });
        } catch (e) {
          log.sync.error(`获取同步历史失败: ${e.message}`);
          json(res, { history: [] });
        }
      }
    },

    // GET /sync-history/:id - Get specific sync detail
    {
      kind: 'exact',
      path: '/req-hub/sync-detail',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const syncId = url.searchParams.get('id');
        const workspaceId = url.searchParams.get('workspaceId');
        const requirementId = url.searchParams.get('requirementId');

        if (!syncId || !workspaceId || !requirementId) {
          json(res, { error: 'missing sync id, workspaceId, or requirementId' }, 400);
          return;
        }

        const sync = await getSyncById(syncId, workspaceId, requirementId);

        if (!sync) {
          json(res, { error: 'sync not found' }, 404);
          return;
        }

        json(res, { sync });
      }
    },

    // GET /sync-file - Read a generated file
    {
      kind: 'exact',
      path: '/req-hub/sync-file',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const requirementId = url.searchParams.get('requirementId');
        const fileName = url.searchParams.get('fileName');

        if (!workspaceId || !requirementId || !fileName) {
          json(res, { error: 'missing parameters' }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        try {
          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir || 'docs');
          const reqDir = await findRequirementDir(docsRoot, requirementId);

          if (!reqDir) {
            json(res, { error: 'requirement directory not found' }, 404);
            return;
          }

          const filePath = join(reqDir, fileName);
          const content = await readFile(filePath, 'utf8');
          json(res, { content, fileName });
        } catch (e) {
          log.sync.error(`Failed to read sync file: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    }
  ];
}



































