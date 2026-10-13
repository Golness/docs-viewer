/**
 * 会话选择器模块
 * 负责列出和筛选与当前工作区相关的 DSH 会话
 */

import { log } from './logger.js';

/**
 * 列出与当前工作区相关的 DSH 会话（包括活跃和持久化的会话）
 * @param {Object} sessions - DSH sessions 服务（用于活跃会话）
 * @param {string} workspacePath - 工作区路径
 * @param {Object} options - 选项
 * @param {number} options.limit - 最大返回数量
 * @param {string} options.query - 搜索关键词
 * @param {Object} options.sessionQuery - DSH sessionQuery 服务（用于持久化会话）
 * @returns {Promise<Array<Object>>} 会话列表
 */
export async function listRelatedSessions(sessions, workspacePath, options = {}) {
  const { limit = 20, query, sessionQuery } = options;
  
  // 使用 sessionQuery 服务获取所有会话（包括持久化的）
  if (sessionQuery) {
    try {
      // 获取所有会话记录
      const allRecords = await sessionQuery.listSessions();
      
      // 标准化路径用于比较
      const wsPath = workspacePath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
      
      // 按工作目录过滤：只匹配工作区路径本身或其子目录，且只取父会话
      const filtered = allRecords.filter(record => {
        const cwd = record.header.cwd || '';
        const sessionPath = cwd.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
        // 会话路径必须等于工作区路径，或者是工作区路径的子目录
        // 且必须是父会话（没有 parentSession）
        const pathMatch = sessionPath === wsPath || sessionPath.startsWith(wsPath + '/');
        const isParentSession = !record.header.parentSession;
        return pathMatch && isParentSession;
      });
      
      // 并行获取会话标题
      const titlePromises = filtered.slice(0, limit).map(async (record) => {
        let title = '(无标题)';
        try {
          const titleSnapshot = await sessionQuery.readTitle(record.header.id);
          title = titleSnapshot?.title || '(无标题)';
        } catch (e) {
          // 标题读取失败，使用默认
        }
        
        return {
          id: record.header.id,
          title,
          createdAt: record.header.createdAt,
          cwd: record.header.cwd || '',
          parentSession: record.header.parentSession || null,
          isLive: record.live,
          isPersisted: record.persisted,
        };
      });
      
      const sessionsWithDetails = await Promise.all(titlePromises);
      
      // 按创建时间倒序
      sessionsWithDetails.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      log.session.info(`找到 ${sessionsWithDetails.length} 个相关会话（使用 sessionQuery）`);
      return sessionsWithDetails;
    } catch (e) {
      log.session.error(`sessionQuery 列出会话失败: ${e.message}`);
      // 继续使用 sessions 服务作为后备
    }
  }
  
  // 后备：使用 sessions 服务（仅活跃会话）
  if (!sessions) {
    log.session.warn('sessions 和 sessionQuery 服务都不可用，无法列出会话');
    return [];
  }

  try {
    // 获取所有活跃会话
    const allSessions = sessions.list();
    
    // 标准化路径用于比较
    const wsPath = workspacePath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    
    // 按工作目录过滤：只匹配工作区路径本身或其子目录，且只取父会话
    const filtered = allSessions.filter(s => {
      const cwd = s.header.cwd || '';
      const sessionPath = cwd.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
      // 会话路径必须等于工作区路径，或者是工作区路径的子目录
      // 且必须是父会话（没有 parentSession）
      const pathMatch = sessionPath === wsPath || sessionPath.startsWith(wsPath + '/');
      const isParentSession = !s.header.parentSession;
      return pathMatch && isParentSession;
    });
    
    // 转换为统一格式
    const sessionsWithDetails = filtered.slice(0, limit).map(s => ({
      id: s.header.id,
      title: '(活跃会话)',
      createdAt: s.header.createdAt,
      eventCount: s.seq || 0,
      cwd: s.header.cwd || '',
      parentSession: s.header.parentSession || null,
      isLive: true,
      isPersisted: false,
    }));
    
    // 按创建时间倒序
    sessionsWithDetails.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    log.session.info(`找到 ${sessionsWithDetails.length} 个相关活跃会话（使用 sessions 服务）`);
    return sessionsWithDetails;
  } catch (e) {
    log.session.error(`列出会话失败: ${e.message}`);
    return [];
  }
}

/**
 * 列出所有会话
 * @param {Object} sessions - DSH sessions 服务
 * @param {Object} options - 选项
 * @param {Object} options.sessionQuery - DSH sessionQuery 服务
 * @returns {Promise<Array<Object>>} 会话列表
 */
export async function listAllSessions(sessions, options = {}) {
  const { limit = 50, sessionQuery } = options;
  
  // 使用 sessionQuery 服务
  if (sessionQuery) {
    try {
      const allRecords = await sessionQuery.listSessions();
      
      const titlePromises = allRecords.slice(0, limit).map(async (record) => {
        let title = '(无标题)';
        try {
          const titleSnapshot = await sessionQuery.readTitle(record.header.id);
          title = titleSnapshot?.title || '(无标题)';
        } catch (e) {
          // 标题读取失败
        }
        
        return {
          id: record.header.id,
          title,
          createdAt: record.header.createdAt,
          cwd: record.header.cwd || '',
          parentSession: record.header.parentSession || null,
          isLive: record.live,
          isPersisted: record.persisted,
        };
      });
      
      const result = await Promise.all(titlePromises);
      result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return result;
    } catch (e) {
      log.session.error(`sessionQuery 列出会话失败: ${e.message}`);
    }
  }
  
  // 后备：使用 sessions 服务
  if (!sessions) {
    log.session.warn('sessions 服务不可用');
    return [];
  }

  try {
    const allSessions = sessions.list();
    const result = allSessions.slice(0, limit).map(s => ({
      id: s.header.id,
      title: '(活跃会话)',
      createdAt: s.header.createdAt,
      eventCount: s.seq || 0,
      cwd: s.header.cwd || '',
      isLive: true,
      isPersisted: false,
    }));
    
    result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return result;
  } catch (e) {
    log.session.error(`列出会话失败: ${e.message}`);
    return [];
  }
}
