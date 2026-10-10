/**
 * AI 分析相关路由
 */

import { resolve, join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { buildTree, findRequirementPath } from '../tree.js';
import { callLLM, parseAIResponse } from '../ai-engine.js';
import { validateMeta } from '../meta.js';
import { readRequirementDocs, writeMetaJson } from '../doc-reader.js';
import { rebuildIndex } from '../index-manager.js';
import { json, readBody } from '../utils.js';
import { addLog } from '../logger.js';

// In-memory analysis task state
let currentAnalysisTask = null;

export function createAnalyzeRoutes(registry, llm) {
  return [
    // GET /analyze-preview - 获取分析预览文件列表
    {
      kind: 'exact',
      path: '/req-hub/analyze-preview',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          const url = new URL(req.url, 'http://localhost');
          const workspaceId = url.searchParams.get('workspaceId');
          const requirementId = url.searchParams.get('requirementId');

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

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const tree = await buildTree(docsRoot);

          const files = [];
          
          if (requirementId) {
            // Single requirement mode
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                if (req.id === requirementId) {
                  const reqPath = join(docsRoot, req.path);
                  const docs = await readRequirementDocs(reqPath);
                  files.push({
                    id: req.id,
                    developer: dev.name,
                    path: req.path,
                    hasDocs: !!docs,
                    fileCount: req.fileCount,
                    hasMeta: req.hasMeta,
                  });
                  break;
                }
              }
            }
          } else {
            // All requirements mode
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                const reqPath = join(docsRoot, req.path);
                const docs = await readRequirementDocs(reqPath);
                files.push({
                  id: req.id,
                  developer: dev.name,
                  path: req.path,
                  hasDocs: !!docs,
                  fileCount: req.fileCount,
                  hasMeta: req.hasMeta,
                });
              }
            }
          }

          json(res, { files });
        } catch (e) {
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /analyze-stream (SSE) - 流式分析
    {
      kind: 'exact',
      path: '/req-hub/analyze-stream',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const requirementId = url.searchParams.get('requirementId');

        if (!workspaceId) {
          json(res, { error: 'missing workspaceId' }, 400);
          return;
        }

        if (!llm) {
          json(res, { error: 'LLM service not available' }, 503);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);
        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        // Set up SSE
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const sendEvent = (data) => {
          try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
          } catch { /* client disconnected */ }
        };

        const startTime = Date.now();
        const mode = requirementId ? 'single' : 'all';

        // Initialize task state
        currentAnalysisTask = {
          mode,
          requirementId,
          workspaceId,
          status: {},
          files: [],
          startTime,
          completed: false,
          cancelled: false,
        };

        try {
          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const tree = await buildTree(docsRoot);

          let total = 0, success = 0, failed = 0;

          // Pre-populate file list for recovery
          if (requirementId) {
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                if (req.id === requirementId) {
                  currentAnalysisTask.files.push({
                    id: req.id,
                    developer: dev.name,
                    path: req.path,
                    hasDocs: true,
                  });
                }
              }
            }
          } else {
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                currentAnalysisTask.files.push({
                  id: req.id,
                  developer: dev.name,
                  path: req.path,
                  hasDocs: true,
                });
              }
            }
          }

          if (requirementId) {
            // Single requirement mode
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                if (req.id === requirementId) {
                  total++;
                  const reqId = req.id;
                  const reqStartTime = Date.now();

                  currentAnalysisTask.status[reqId] = { status: 'analyzing' };
                  try { sendEvent({ type: 'start', id: reqId, developer: dev.name, path: req.path }); } catch { break; }

                  try {
                    addLog('info', `📄 分析: ${dev.name}/${req.id}`);

                    const docsContent = await readRequirementDocs(join(docsRoot, req.path));
                    if (!docsContent) {
                      addLog('warning', `⚠️ 跳过: ${req.id} (无支持的文档文件)`);
                      failed++;
                      currentAnalysisTask.status[reqId] = { status: 'failed', error: '无支持的文档文件' };
                      try { sendEvent({ type: 'failed', id: reqId, error: '无支持的文档文件' }); } catch { break; }
                      continue;
                    }

                    try { sendEvent({ type: 'analyzing', id: reqId }); } catch { break; }

                    const prompt = `需求目录名: ${req.id}\n\n以下是需求文档内容:\n\n${docsContent}`;
                    const rawResponse = await callLLM(llm, prompt, config);
                    let meta = parseAIResponse(rawResponse);
                    meta = validateMeta(meta);

                    const metaPath = join(docsRoot, req.path, '.meta.json');
                    await writeMetaJson(metaPath, meta);

                    success++;
                    const elapsed = ((Date.now() - reqStartTime) / 1000).toFixed(1);
                    currentAnalysisTask.status[reqId] = { status: 'completed', elapsed };
                    try { sendEvent({ type: 'completed', id: reqId, elapsed }); } catch { break; }
                    addLog('success', `✅ 分析完成: ${req.id} (${elapsed}s)`);
                  } catch (e) {
                    failed++;
                    currentAnalysisTask.status[reqId] = { status: 'failed', error: e.message };
                    try { sendEvent({ type: 'failed', id: reqId, error: e.message }); } catch { break; }
                    addLog('error', `❌ 分析失败: ${req.id} - ${e.message}`);
                  }
                }
              }
            }
          } else {
            // All requirements mode
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                if (currentAnalysisTask.cancelled) {
                  addLog('warning', '⚠️ 分析已取消');
                  break;
                }

                total++;
                const reqId = req.id;
                const reqStartTime = Date.now();

                currentAnalysisTask.status[reqId] = { status: 'analyzing' };
                try { sendEvent({ type: 'start', id: reqId, developer: dev.name, path: req.path }); } catch { break; }

                try {
                  addLog('info', `📄 分析: ${dev.name}/${req.id}`);

                  const docsContent = await readRequirementDocs(join(docsRoot, req.path));
                  if (!docsContent) {
                    addLog('warning', `⚠️ 跳过: ${req.id} (无支持的文档文件)`);
                    failed++;
                    currentAnalysisTask.status[reqId] = { status: 'failed', error: '无支持的文档文件' };
                    try { sendEvent({ type: 'failed', id: reqId, error: '无支持的文档文件' }); } catch { break; }
                    continue;
                  }

                  try { sendEvent({ type: 'analyzing', id: reqId }); } catch { break; }

                  const prompt = `需求目录名: ${req.id}\n\n以下是需求文档内容:\n\n${docsContent}`;
                  const rawResponse = await callLLM(llm, prompt, config);
                  let meta = parseAIResponse(rawResponse);
                  meta = validateMeta(meta);

                  const metaPath = join(docsRoot, req.path, '.meta.json');
                  await writeMetaJson(metaPath, meta);

                  success++;
                  const elapsed = ((Date.now() - reqStartTime) / 1000).toFixed(1);
                  currentAnalysisTask.status[reqId] = { status: 'completed', elapsed };
                  try { sendEvent({ type: 'completed', id: reqId, elapsed }); } catch { break; }
                  addLog('success', `✅ 分析完成: ${req.id} (${elapsed}s)`);
                } catch (e) {
                  failed++;
                  currentAnalysisTask.status[reqId] = { status: 'failed', error: e.message };
                  try { sendEvent({ type: 'failed', id: reqId, error: e.message }); } catch { break; }
                  addLog('error', `❌ 分析失败: ${req.id} - ${e.message}`);
                }
              }
              if (currentAnalysisTask.cancelled) break;
            }
          }

          const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          currentAnalysisTask.completed = true;
          currentAnalysisTask.endTime = Date.now();
          currentAnalysisTask.successCount = success;
          currentAnalysisTask.totalCount = total;

          if (currentAnalysisTask.cancelled) {
            try { sendEvent({ type: 'cancelled', total, success, failed, elapsed: totalElapsed }); } catch { /* ignore */ }
          } else {
            try { sendEvent({ type: 'done', total, success, failed, elapsed: totalElapsed }); } catch { /* ignore */ }
          }
          try { res.end(); } catch { /* client already disconnected */ }
        } catch (e) {
          // Mark task as completed even on error
          if (currentAnalysisTask) {
            currentAnalysisTask.completed = true;
            currentAnalysisTask.endTime = Date.now();
            currentAnalysisTask.error = e.message;
          }
          try {
            sendEvent({ type: 'error', error: e.message });
            res.end();
          } catch { /* client already disconnected */ }
        }
      }
    },

    // GET /analysis-status - 获取分析任务状态（用于页面重载后恢复）
    {
      kind: 'exact',
      path: '/req-hub/analysis-status',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }
        
        if (!currentAnalysisTask || currentAnalysisTask.completed) {
          json(res, { active: false });
          return;
        }

        json(res, {
          active: true,
          mode: currentAnalysisTask.mode,
          requirementId: currentAnalysisTask.requirementId,
          status: currentAnalysisTask.status,
          files: currentAnalysisTask.files || [],
          startTime: currentAnalysisTask.startTime,
          successCount: currentAnalysisTask.successCount || 0,
          totalCount: currentAnalysisTask.totalCount || 0,
        });
      }
    },

    // POST /analysis-cancel - 取消分析任务
    {
      kind: 'exact',
      path: '/req-hub/analysis-cancel',
      async handler(req, res) {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        
        if (!currentAnalysisTask || currentAnalysisTask.completed) {
          json(res, { success: false, message: '没有正在进行的分析任务' });
          return;
        }

        currentAnalysisTask.cancelled = true;
        currentAnalysisTask.completed = true;
        
        addLog('warning', '⚠️ 用户取消了分析任务');
        json(res, { success: true, message: '分析任务已取消' });
      }
    },

    // GET /meta - 获取 meta 数据
    {
      kind: 'exact',
      path: '/req-hub/meta',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          const url = new URL(req.url, 'http://localhost');
          const workspaceId = url.searchParams.get('workspaceId');
          const reqPath = url.searchParams.get('path');

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

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const tree = await buildTree(docsRoot);

          if (reqPath) {
            // Single requirement meta
            const found = findRequirementPath(docsRoot, tree, reqPath);
            if (!found) {
              json(res, { error: 'requirement not found' }, 404);
              return;
            }

            const metaPath = found.path + '/.meta.json';
            const metaContent = await readFile(metaPath, 'utf-8');
            const statInfo = await stat(metaPath);

            json(res, {
              path: found.req.path,
              meta: JSON.parse(metaContent),
              updatedAt: statInfo.mtime.toISOString()
            });
          } else {
            // All requirements meta
            const items = [];
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                if (req.hasMeta && req.meta) {
                  items.push({
                    id: req.id,
                    title: req.title,
                    developer: dev.name,
                    date: req.date,
                    meta: req.meta
                  });
                }
              }
            }
            json(res, { items });
          }
        } catch (e) {
          json(res, { error: e.message }, 500);
        }
      }
    }
  ];
}
