/**
 * 搜索相关路由
 */

import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { buildTree } from '../tree.js';
import { loadIndex } from '../index-manager.js';
import { callLLM, parseAIResponse } from '../ai-engine.js';
import { json, readBody } from '../utils.js';
import { addLog } from '../logger.js';

export function createSearchRoutes(registry, llm) {
  return [
    // GET /search - 精确搜索
    {
      kind: 'exact',
      path: '/docs-viewer/search',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
        const type = url.searchParams.get('type') || 'all';

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
        const index = await loadIndex(docsRoot);

        if (!index) {
          json(res, { results: [], total: 0, indexBuilt: false });
          return;
        }

        const results = [];
        const queryLower = query.toLowerCase();

        for (const req of index.requirements) {
          let matched = false;
          const matchedFields = [];
          const matchedFeatures = [];
          const matchedTags = [];

          if (type === 'all' || type === 'feature') {
            for (const feature of req.features || []) {
              if (feature.toLowerCase().includes(queryLower)) {
                matched = true;
                matchedFeatures.push(feature);
              }
            }
          }

          if (type === 'all' || type === 'field') {
            for (const field of req.fields || []) {
              if (field.toLowerCase().includes(queryLower)) {
                matched = true;
                matchedFields.push(field);
              }
            }
          }

          if (type === 'all' || type === 'tag') {
            for (const tag of req.tags || []) {
              if (tag.toLowerCase().includes(queryLower)) {
                matched = true;
                matchedTags.push(tag);
              }
            }
          }

          if (matched) {
            results.push({
              id: req.id,
              developer: req.developer,
              date: req.date,
              title: req.title,
              matchedFeatures,
              matchedFields,
              matchedTags
            });
          }
        }

        json(res, { results, total: results.length, indexBuilt: true });
      }
    },

    // POST /ai-search - AI 语义搜索
    {
      kind: 'exact',
      path: '/docs-viewer/ai-search',
      async handler(req, res) {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          const body = await readBody(req);
          const { workspaceId, query } = JSON.parse(body);

          if (!workspaceId || !query) {
            json(res, { error: 'missing workspaceId or query' }, 400);
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
          const index = await loadIndex(docsRoot);

          if (!index) {
            json(res, { error: 'index not built' }, 400);
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

          sendEvent({ type: 'status', text: '🧠 AI 正在分析...' });

          // Build prompt
          const requirementsSummary = index.requirements.map(r => 
            `- ${r.id}: ${r.title} (${r.developer})`
          ).join('\n');

          const prompt = `你是一个需求搜索助手。用户查询: "${query}"

可用需求列表:
${requirementsSummary}

请分析哪些需求与用户查询最相关，返回 JSON 格式:
{
  "results": [
    {
      "id": "需求ID",
      "relevance": 0-100,
      "reason": "相关原因"
    }
  ]
}

只返回 JSON，不要其他文字。`;

          sendEvent({ type: 'stream_start' });

          try {
            const rawResponse = await callLLM(llm, prompt, config, {
              onStream: (text) => {
                sendEvent({ type: 'stream_delta', text });
              }
            });

            sendEvent({ type: 'stream_end' });

            const aiResult = parseAIResponse(rawResponse);
            if (!aiResult || !aiResult.results) {
              sendEvent({ type: 'error', error: 'AI 返回格式错误' });
              res.end();
              return;
            }

            // Build full results
            const results = aiResult.results.map(r => {
              const req = index.requirements.find(req => req.id === r.id);
              return {
                id: r.id,
                relevance: r.relevance,
                reason: r.reason,
                developer: req?.developer,
                date: req?.date,
                title: req?.title,
                features: req?.features || [],
                fields: req?.fields || [],
                tags: req?.tags || []
              };
            });

            sendEvent({
              type: 'done',
              results,
              total: results.length
            });

            res.end();
          } catch (e) {
            sendEvent({ type: 'error', error: e.message });
            res.end();
          }
        } catch (e) {
          addLog('error', `❌ AI 搜索失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /index-status - 获取索引状态
    {
      kind: 'exact',
      path: '/docs-viewer/index-status',
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

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        const index = await loadIndex(docsRoot);

        if (!index) {
          json(res, { built: false });
          return;
        }

        json(res, {
          built: true,
          builtAt: index.builtAt,
          stats: {
            requirements: index.requirements?.length || 0,
            features: Object.keys(index.featureIndex || {}).length,
            fields: Object.keys(index.fieldIndex || {}).length,
            tags: Object.keys(index.tagIndex || {}).length
          }
        });
      }
    },

    // POST /rebuild-index - 重建索引
    {
      kind: 'exact',
      path: '/docs-viewer/rebuild-index',
      async handler(req, res) {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          const body = await readBody(req);
          const { workspaceId } = JSON.parse(body);

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

          addLog('info', '🔨 开始重建索引...');
          const startTime = Date.now();
          
          const index = await rebuildIndex(docsRoot, tree);
          
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          addLog('success', `✅ 索引重建完成 (${elapsed}s)`);

          json(res, {
            success: true,
            elapsed: parseFloat(elapsed),
            stats: {
              requirements: index.requirements.length,
              features: Object.keys(index.featureIndex).length,
              fields: Object.keys(index.fieldIndex).length,
              tags: Object.keys(index.tagIndex).length
            }
          });
        } catch (e) {
          addLog('error', `❌ 重建索引失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /index-data - 获取索引数据
    {
      kind: 'exact',
      path: '/docs-viewer/index-data',
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

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        const index = await loadIndex(docsRoot);

        if (!index) {
          json(res, { error: 'index not built' }, 400);
          return;
        }

        json(res, index);
      }
    }
  ];
}
