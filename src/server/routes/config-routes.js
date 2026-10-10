/**
 * 配置相关路由
 */

import { loadConfig, saveConfig, autoDefaultConfig } from '../config.js';
import { PROMPT_REGISTRY, getPrompt } from '../prompts.js';
import { json, readBody } from '../utils.js';
import { addLog } from '../logger.js';

export function createConfigRoutes(registry, llm) {
  return [
    // GET+POST /config - 获取/更新配置（合并为单路由，避免同路径重复注册）
    {
      kind: 'exact',
      path: '/docs-viewer/config',
      async handler(req, res) {
        if (req.method === 'GET') {
          try {
            let config = await loadConfig();
            config = await autoDefaultConfig(config, registry);
            
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'Pragma': 'no-cache'
            });
            res.end(JSON.stringify(config));
          } catch (e) {
            addLog('error', `❌ GET /config 失败: ${e.message}`);
            json(res, { error: e.message }, 500);
          }
          return;
        }

        if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            const newConfig = JSON.parse(body);
            const existing = await loadConfig();
            
            // Deep merge for ai object
            const merged = {
              ...existing,
              ...newConfig,
              ai: {
                ...existing.ai,
                ...newConfig.ai,
                prompts: {
                  ...existing.ai?.prompts,
                  ...newConfig.ai?.prompts
                }
              }
            };

            await saveConfig(merged);
            addLog('success', `✅ 配置已更新`);
            json(res, merged);
          } catch (e) {
            addLog('error', `❌ POST /config 失败: ${e.message}`);
            json(res, { error: e.message }, 500);
          }
          return;
        }

        res.writeHead(405);
        res.end();
      }
    },

    // GET /llm-config - 获取 LLM 配置
    {
      kind: 'exact',
      path: '/docs-viewer/llm-config',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          const providers = await llm.listProviders();
          if (!Array.isArray(providers) || providers.length === 0) {
            json(res, { error: 'No LLM providers configured' }, 500);
            return;
          }

          const firstProvider = providers[0];
          const providerId = firstProvider.id || firstProvider.name || firstProvider;
          const providerName = firstProvider.name || firstProvider.id || firstProvider;

          let models = [];
          try {
            const modelList = await llm.listModels(providerId);
            if (Array.isArray(modelList)) {
              models = modelList.map(m => m.id || m.name || m);
            }
          } catch (e) {
            addLog('warning', `⚠️ 获取模型列表失败: ${e.message}`);
          }

          json(res, {
            provider: providerName,
            providerId: providerId,
            models: models
          });
        } catch (e) {
          addLog('error', `❌ 获取 LLM 配置失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /ai-config - 获取 AI 配置（LLM 服务信息）
    {
      kind: 'exact',
      path: '/docs-viewer/ai-config',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          const config = await loadConfig();
          const ai = config.ai || {};
          
          // Get real provider/model info from DSH global config
          let providerName = '(未配置)';
          let selectedModel = ai.selectedModel || null;
          
          if (llm) {
            try {
              const providers = await llm.listProviders();
              if (Array.isArray(providers) && providers.length > 0) {
                const firstProvider = providers[0];
                providerName = firstProvider.name || firstProvider.id || firstProvider;
              }
            } catch { /* ignore */ }
          }

          json(res, {
            enabled: ai.enabled !== false,
            provider: providerName,
            model: selectedModel || '(未选择)',
            hasCustomPrompt: !!(ai.prompts?.analyze && ai.prompts.analyze.trim()),
          });
        } catch (e) {
          addLog('error', `❌ GET /ai-config 失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    },

    // GET /prompt-registry - 获取 Prompt 注册表
    {
      kind: 'exact',
      path: '/docs-viewer/prompt-registry',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        try {
          const config = await loadConfig();
          const result = {};
          
          for (const [key, meta] of Object.entries(PROMPT_REGISTRY)) {
            result[key] = {
              label: meta.label,
              description: meta.description,
              category: meta.category || 'default',
              default: meta.default,
              current: getPrompt(config, key),
              isCustom: !!(config.ai?.prompts?.[key] && config.ai.prompts[key].trim())
            };
          }
          
          json(res, result);
        } catch (e) {
          addLog('error', `❌ 获取 Prompt 注册表失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    }
  ];
}
