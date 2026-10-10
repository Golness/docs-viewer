/**
 * 会话选择器模块
 * 负责列出和筛选与当前工作区相关的 DSH 会话
 */

import { addLog } from './logger.js';

/**
 * 列出与当前工作区相关的 DSH 会话
 * @param {Object} ctx - DSH 上下文
 * @param {string} workspacePath - 工作区路径
 * @param {Object} options - 选项
 * @param {number} options.limit - 最大返回数量
 * @param {string} options.query - 搜索关键词
 * @returns {Promise<Array<Object>>} 会话列表
 */
export async function listRelatedSessions(ctx, workspacePath, options = {}) {
  const { limit = 20, query } = options;
  
  const sessionQuery = ctx?.sessionQuery;
  if (!sessionQuery) {
    addLog('warning', '⚠️ sessionQuery 服务不可用，无法列出会话');
    return [];
  }

  try {
    // 按工作目录过滤
    const filters = [
      { kind: 'cwd', values: [workspacePath] }
    ];
    
    let sessions;
    if (query && query.trim()) {
      // 全文搜索
      const results = await sessionQuery.searchSessions({
        query: query.trim(),
        sessionFilters: filters,
        limit,
      });
      sessions = results.items;
    } else {
      // 列出所有相关会话
      const allSessions = await sessionQuery.filterSessions(filters);
      sessions = allSessions.slice(0, limit);
    }
    
    // 获取标题和基本信息
    const sessionsWithDetails = await Promise.all(
      sessions.map(async (s) => {
        let title;
        try {
          title = await sessionQuery.readTitle(s.header.id);
        } catch {
          title = undefined;
        }
        return {
          id: s.header.id,
          title: title?.text || '(无标题)',
          createdAt: s.header.createdAt,
          eventCount: s.header.seq || 0,
          cwd: s.header.cwd || '',
          parentSession: s.header.parentSession || null,
        };
      })
    );
    
    // 按创建时间倒序
    sessionsWithDetails.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    addLog('info', `📋 找到 ${sessionsWithDetails.length} 个相关会话`);
    return sessionsWithDetails;
  } catch (e) {
    addLog('error', `❌ 列出会话失败: ${e.message}`);
    return [];
  }
}

/**
 * 列出所有会话（不限工作区）
 * @param {Object} ctx - DSH 上下文
 * @param {Object} options - 选项
 * @returns {Promise<Array<Object>>} 会话列表
 */
export async function listAllSessions(ctx, options = {}) {
  const { limit = 50 } = options;
  
  const sessionQuery = ctx?.sessionQuery;
  if (!sessionQuery) {
    addLog('warning', '⚠️ sessionQuery 服务不可用');
    return [];
  }

  try {
    const allSessions = await sessionQuery.listSessions();
    const sessions = allSessions.slice(0, limit);
    
    const sessionsWithDetails = await Promise.all(
      sessions.map(async (s) => {
        let title;
        try {
          title = await sessionQuery.readTitle(s.header.id);
        } catch {
          title = undefined;
        }
        return {
          id: s.header.id,
          title: title?.text || '(无标题)',
          createdAt: s.header.createdAt,
          eventCount: s.header.seq || 0,
          cwd: s.header.cwd || '',
        };
      })
    );
    
    sessionsWithDetails.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return sessionsWithDetails;
  } catch (e) {
    addLog('error', `❌ 列出会话失败: ${e.message}`);
    return [];
  }
}
