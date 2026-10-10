/**
 * 文档同步相关路由
 */

import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { findRequirementDir } from '../doc-reader.js';
import { getBranchCommits, getBranchCodeDiff, buildSyncPrompt, parseSyncResponse, buildSyncLog, findBranchByRequirement } from '../sync-engine.js';
import { PhasedSyncEngine } from '../phased-sync-engine.js';
import { listRelatedSessions } from '../session-selector.js';
import { extractMultipleSessions } from '../content-extractor.js';
import { callLLM } from '../ai-engine.js';
import { json, readBody } from '../utils.js';
import { addLog } from '../logger.js';
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
import { readRequirementDocs, writeMetaJson } from '../doc-reader.js';
import { validateMeta } from '../meta.js';
import { parseAIResponse } from '../ai-engine.js';

export function createSyncRoutes(registry, llm, ctx) {
  return [
    // GET /git-branch - 获取 Git 分支信息
    {
      kind: 'exact',
      path: '/docs-viewer/git-branch',
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
      path: '/docs-viewer/sync-branch-info',
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
      path: '/docs-viewer/sessions',
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
          const sessions = await listRelatedSessions(ctx, workspace.path, { limit, query });
          json(res, { sessions });
        } catch (e) {
          addLog('error', `❌ 获取会话列表失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /session-info - 获取指定会话的详细信息
    {
      kind: 'exact',
      path: '/docs-viewer/session-info',
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
          const sessionQuery = ctx?.sessionQuery;
          if (!sessionQuery) {
            json(res, { error: 'sessionQuery 服务不可用' }, 500);
            return;
          }

          // 读取会话详情
          const snapshot = await sessionQuery.readSession(sessionId);
          const header = snapshot.session;

          // 获取会话标题
          let title;
          try {
            const titleData = await sessionQuery.readTitle(header.id);
            if (titleData && typeof titleData === 'string') {
              title = titleData;
            } else if (titleData && typeof titleData === 'object') {
              title = titleData.text || titleData.title || titleData.name || '(无标题)';
            }
          } catch (e) {
            title = '(无标题)';
          }

          json(res, {
            session: {
              id: header.id,
              title,
              cwd: header.cwd || '',
              createdAt: header.createdAt,
              parentSession: header.parentSession || null,
            }
          });
        } catch (e) {
          console.error('[DEBUG] 获取会话详情失败:', e);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /current-session - 获取当前会话信息（最近的会话）
    {
      kind: 'exact',
      path: '/docs-viewer/current-session',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          const sessionQuery = ctx?.sessionQuery;
          if (!sessionQuery) {
            json(res, { error: 'sessionQuery 服务不可用' }, 500);
            return;
          }

          // 获取所有会话（参考同步功能的实现）
          const allSessions = await sessionQuery.filterSessions([]);
          
          if (!allSessions || allSessions.length === 0) {
            json(res, { session: null, debug: { message: '没有找到任何会话' } });
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

          // 获取会话标题
          let title;
          try {
            const titleData = await sessionQuery.readTitle(header.id);
            if (titleData && typeof titleData === 'string') {
              title = titleData;
            } else if (titleData && typeof titleData === 'object') {
              title = titleData.text || titleData.title || titleData.name || '(无标题)';
            }
          } catch (e) {
            title = '(无标题)';
          }

          json(res, {
            session: {
              id: header.id,
              title,
              cwd: header.cwd || '',
              createdAt: header.createdAt,
            },
            debug: {
              totalSessions: allSessions.length,
              mainSessions: mainSessions.length,
              matchedSession: {
                id: header.id,
                cwd: header.cwd,
                parentSession: header.parentSession
              }
            }
          });
        } catch (e) {
          console.error('[DEBUG] 获取当前会话失败:', e);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /session-turns - 获取会话的轮次内容预览
    {
      kind: 'exact',
      path: '/docs-viewer/session-turns',
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
          const { getSessionTurnsPreview } = await import('../content-extractor.js');
          const preview = await getSessionTurnsPreview(ctx, sessionId);
          json(res, preview);
        } catch (e) {
          addLog('error', `❌ 获取会话轮次失败: ${e.message}`);
          json(res, { success: false, error: e.message }, 500);
        }
      }
    },

    // POST /sync-docs - 同步文档（传统模式）
    {
      kind: 'exact',
      path: '/docs-viewer/sync-docs',
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

            sendEvent({ type: 'status', text: `✅ 代码变更: ${codeDiff.length} 字符` });

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

            // Step 6: Build prompt
            const prompt = buildSyncPrompt(docType, currentDoc, commits, codeDiff, config);

            // Step 7: Call LLM
            sendEvent({ type: 'stream_start' });
            let content = '';
            try {
              content = await callLLM(llm, prompt, config, {
                onStream: (text) => {
                  sendEvent({ type: 'stream_delta', text });
                }
              });
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

            addLog('success', `✅ ${docType === 'requirement' ? '需求' : '技术'}文档同步完成`);

            sendEvent({
              type: 'done',
              docType,
              changes: syncResult.changes || [],
              additions: syncResult.additions || [],
              logFile: `sync-${docType}-${Date.now()}.md`
            });

            res.end();
          } catch (e) {
            addLog('error', `❌ 文档同步失败: ${e.message}`);
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
      path: '/docs-viewer/phased-sync',
      async handler(req, res) {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }

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
            const existingActive = getActiveSync();
            if (existingActive) {
              json(res, { error: '已有同步任务正在执行中', syncId: existingActive.id }, 409);
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
                { phase: 'init', label: '🔧 初始化', status: 'pending', text: '', files: [] },
                { phase: 'session_extract', label: '📖 会话提取', status: 'pending', text: '', files: [] },
                { phase: 'code_analysis', label: '💻 代码分析', status: 'pending', text: '', files: [] },
                { phase: 'discussion_analysis', label: '💬 对话分析', status: 'pending', text: '', files: [] },
                { phase: 'merge', label: '🔀 增量合并', status: 'pending', text: '', files: [] },
                { phase: 'save', label: '💾 保存文件', status: 'pending', text: '', files: [] },
                ...(runAnalysis ? [{ phase: 'analysis', label: '🧠 构建分析', status: 'pending', text: '', files: [] }] : []),
                ...(runIndex ? [{ phase: 'index', label: '📊 构建索引', status: 'pending', text: '', files: [] }] : []),
              ],
              generatedFiles: [],
              runAnalysis,
              runIndex,
            };

            await setActiveSync(syncTask, reqDir);

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

            if (!commits || commits.length === 0) {
              await updateStep('init', { status: 'failed', text: '该分支没有提交记录' });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: '该分支没有提交记录' });
              res.end();
              return;
            }

            let codeDiff;
            try {
              codeDiff = await getBranchCodeDiff(workspace.path, branchName);
            } catch (e) {
              await updateStep('init', { status: 'failed', text: `获取代码变更失败: ${e.message}` });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: `获取代码变更失败: ${e.message}` });
              res.end();
              return;
            }

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

            await updateStep('init', { 
              status: 'completed', 
              text: `${commits.length} 个提交，代码变更 ${codeDiff.length} 字符${isNewDoc ? '，新建文档' : ''}` 
            });

            // ─── Step 2: Session Extract ──────────────────────────
            let sessionMessages = [];
            if (sessionIds.length > 0) {
              await updateStep('session_extract', { status: 'running', text: `提取 ${sessionIds.length} 个会话内容...` });
              
              try {
                const extracted = await extractMultipleSessions(ctx, sessionIds, {
                  maxContentLength: 100000,
                });
                
                sessionMessages = [];
                for (const turn of extracted.turns) {
                  if (turn.userInput) {
                    sessionMessages.push({
                      role: 'user',
                      text: turn.userInput,
                      time: turn.time,
                      sessionId: turn.sessionId,
                      turnNumber: turn.turnNumber,
                    });
                  }
                  if (turn.summary) {
                    sessionMessages.push({
                      role: 'assistant',
                      text: turn.summary,
                      time: turn.endTime || turn.time,
                      sessionId: turn.sessionId,
                      turnNumber: turn.turnNumber,
                      isSummary: true,
                    });
                  }
                }
                
                await updateStep('session_extract', { 
                  status: 'completed', 
                  text: `${extracted.turns.length} 个轮次，${extracted.totalLength} 字符` 
                });
              } catch (e) {
                addLog('warning', `⚠️ 提取会话内容失败: ${e.message}`);
                await updateStep('session_extract', { status: 'failed', text: `提取失败: ${e.message}` });
              }
            } else {
              await updateStep('session_extract', { status: 'skipped', text: '未选择会话' });
            }

            // ─── Step 3-5: Run phased sync engine ────────────────
            await updateStep('code_analysis', { status: 'running', text: 'AI 分析代码变更...' });

            // 创建同步目录（提前创建，用于保存中间结果）
            const timestamp = Date.now();
            const syncDirName = `sync-${timestamp}`;
            const syncBaseDir = join(reqDir, 'sync-logs');
            const syncDir = join(syncBaseDir, syncDirName);
            const { mkdir } = await import('node:fs/promises');
            await mkdir(syncBaseDir, { recursive: true });
            await mkdir(syncDir, { recursive: true });

            const engine = new PhasedSyncEngine(llm, config);
            
            const result = await engine.sync({
              docType,
              currentDoc,
              commits,
              codeDiff,
              sessionMessages,
              onProgress: async (progress) => {
                // Map engine progress to our step system
                const { phase, status, content } = progress;
                if (phase === 'code_analysis') {
                  if (status === 'started') {
                    updateStep('code_analysis', { status: 'running', text: 'AI 分析代码变更...' });
                  } else if (status === 'processing_chunk') {
                    updateStep('code_analysis', { text: progress.message || '分析中...' });
                  } else if (status === 'merging_chunks') {
                    updateStep('code_analysis', { text: '合并分析结果...' });
                  } else if (status === 'completed') {
                    updateStep('code_analysis', { status: 'completed', text: '代码分析完成' });
                    // 立即保存代码分析文件
                    if (content) {
                      const codeAnalysisPath = join(syncDir, 'code-analysis.md');
                      await writeFile(codeAnalysisPath, content, 'utf8');
                      await addFile('code_analysis', `sync-logs/${syncDirName}/code-analysis.md`);
                    }
                  } else if (status === 'failed') {
                    updateStep('code_analysis', { status: 'failed', text: '代码分析失败' });
                  }
                } else if (phase === 'discussion_analysis') {
                  if (status === 'started') {
                    updateStep('discussion_analysis', { status: 'running', text: 'AI 分析对话内容...' });
                  } else if (status === 'processing_chunk') {
                    updateStep('discussion_analysis', { text: progress.message || '分析中...' });
                  } else if (status === 'merging_chunks') {
                    updateStep('discussion_analysis', { text: '合并分析结果...' });
                  } else if (status === 'completed') {
                    updateStep('discussion_analysis', { status: 'completed', text: '对话分析完成' });
                    // 立即保存对话分析文件
                    if (content) {
                      const discussionAnalysisPath = join(syncDir, 'discussion-analysis.md');
                      await writeFile(discussionAnalysisPath, content, 'utf8');
                      await addFile('discussion_analysis', `sync-logs/${syncDirName}/discussion-analysis.md`);
                    }
                  } else if (status === 'failed') {
                    updateStep('discussion_analysis', { status: 'failed', text: '对话分析失败' });
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

            // Update discussion_analysis step if no session messages
            if (sessionMessages.length === 0) {
              await updateStep('discussion_analysis', { status: 'skipped', text: '无对话内容' });
            }

            // ─── Step 6: Save files ──────────────────────────────
            if (!result.finalDocument) {
              await updateStep('save', { status: 'failed', text: '同步失败：未能生成最终文档' });
              syncTask.status = 'failed';
              await completeSync(syncId);
              sendEvent({ type: 'error', error: '同步失败：未能生成最终文档' });
              res.end();
              return;
            }

            await updateStep('save', { status: 'running', text: '保存文件...' });

            // Save main document (always in reqDir root)
            await writeFile(docPath, result.finalDocument, 'utf8');
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
                  const reqPath = join(docsRoot, reqInfo.path);
                  const docs = await readRequirementDocs(reqPath);
                  
                  if (!docs) {
                    await updateStep('analysis', { status: 'failed', text: '未找到文档' });
                  } else {
                    // Call LLM for analysis
                    const { getPrompt } = await import('../prompts.js');
                    const promptTemplate = getPrompt(config, 'analyze');
                    
                    const analysisResult = await callLLM(llm, docs, config, {
                      systemPrompt: promptTemplate,
                    });
                    
                    // Parse and validate
                    const parsed = parseAIResponse(analysisResult);
                    const validation = validateMeta(parsed);
                    
                    if (validation.valid) {
                      // Write .meta.json
                      await writeMetaJson(reqPath, parsed);
                      await addFile('analysis', '.meta.json');
                      await updateStep('analysis', { status: 'completed', text: `分析完成：${parsed.summary || '已生成'}` });
                    } else {
                      await updateStep('analysis', { status: 'failed', text: `分析结果无效：${validation.errors.join(', ')}` });
                    }
                  }
                }
              } catch (e) {
                addLog('error', `❌ 构建分析失败: ${e.message}`);
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
                addLog('error', `❌ 构建索引失败: ${e.message}`);
                await updateStep('index', { status: 'failed', text: `索引失败: ${e.message}` });
              }
            }

            // Mark sync as completed
            syncTask.status = 'completed';
            syncTask.stats = result.stats;
            await completeSync(syncId);

            addLog('success', `✅ ${docTypeName}分阶段同步完成`);

            sendEvent({
              type: 'done',
              syncId,
              docType,
              stats: result.stats,
              files: syncTask.generatedFiles,
            });

            res.end();
          } catch (e) {
            addLog('error', `❌ 分阶段同步失败: ${e.message}`);
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
      path: '/docs-viewer/sync-active',
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

        const activeSync = await getActiveSync(workspaceId, requirementId);
        json(res, { active: !!activeSync, sync: activeSync });
      }
    },

    // GET /sync-history - Get sync history list
    {
      kind: 'exact',
      path: '/docs-viewer/sync-history',
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

        const history = await getSyncHistory(workspaceId, requirementId);
        json(res, { history });
      }
    },

    // GET /sync-history/:id - Get specific sync detail
    {
      kind: 'exact',
      path: '/docs-viewer/sync-detail',
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
      path: '/docs-viewer/sync-file',
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
          addLog('error', `Failed to read sync file: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    }
  ];
}
