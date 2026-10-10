/**
 * Docs Viewer 插件入口
 * 重构后的模块化架构
 */

import { createConfigRoutes } from './routes/config-routes.js';
import { createTreeRoutes } from './routes/tree-routes.js';
import { createAnalyzeRoutes } from './routes/analyze-routes.js';
import { createSearchRoutes } from './routes/search-routes.js';
import { createSyncRoutes } from './routes/sync-routes.js';
import { createTemplateRoutes } from './routes/template-routes.js';
import { addLog, getLogs, clearLogs } from './logger.js';
import { json } from './utils.js';

export const inject = ['workspaceRegistry', 'webServer', 'llm', 'sessionQuery'];

export function apply(ctx) {
  const { workspaceRegistry, webServer, llm, sessionQuery } = ctx;

  addLog('info', '🚀 Docs Viewer 插件启动 (模块化架构)');

  const disposers = [];

  // 创建所有路由
  const routes = [
    // 配置相关
    ...createConfigRoutes(workspaceRegistry, llm),
    
    // 文档树相关
    ...createTreeRoutes(workspaceRegistry),
    
    // AI 分析相关
    ...createAnalyzeRoutes(workspaceRegistry, llm),
    
    // 搜索相关
    ...createSearchRoutes(workspaceRegistry, llm),
    
    // 文档同步相关（传入 ctx 以支持 sessionQuery）
    ...createSyncRoutes(workspaceRegistry, llm, ctx),
    
    // 模板生成相关
    ...createTemplateRoutes(workspaceRegistry, llm),
    
    // 日志相关
    {
      kind: 'exact',
      path: '/docs-viewer/logs',
      handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }
        json(res, { logs: getLogs() });
      }
    },
    {
      kind: 'exact',
      path: '/docs-viewer/logs/clear',
      handler(req, res) {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        clearLogs();
        addLog('info', '🗑️ 日志已清空');
        json(res, { success: true });
      }
    }
  ];

  // 注册所有路由
  for (const route of routes) {
    try {
      const dispose = webServer.register(route);
      disposers.push(dispose);
    } catch (err) {
      if (!String(err.message).includes('duplicate')) {
        addLog('error', `❌ 路由注册失败: ${err.message}`);
      }
    }
  }

  addLog('success', `✅ 已注册 ${routes.length} 个路由`);

  // 返回清理函数
  return () => {
    for (const dispose of disposers) {
      dispose();
    }
    addLog('info', '🛑 Docs Viewer 插件卸载');
  };
}
