/**
 * 内容提取器模块
 * 从 DSH 会话中提取有用的上下文信息
 */

import { log } from './logger.js';
import { charsToTokens, estimateTextTokens, formatTokens, CHARS_PER_TOKEN } from './token-utils.js';

/**
 * 从会话内容中提取文本
 * @param {string|Array} content - 会话内容（字符串或内容块数组）
 * @returns {string} 提取的文本
 */
function extractText(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n');
  }
  return '';
}

/**
 * 从 DSH 会话中提取有用的上下文信息
 * @param {Object} sessions - DSH sessions 服务
 * @param {string} sessionId - 会话 ID
 * @param {Object} options - 选项
 * @param {boolean} options.includeToolCalls - 是否包含工具调用
 * @param {number} options.maxContentTokens - 最大内容 token 数
 * @returns {Promise<Object>} 提取的内容
 */
export async function extractSessionContent(sessions, sessionId, options = {}) {
  const {
    includeToolCalls = false,
    maxContentTokens = 12500, // 约 50k 字符
  } = options;
  
  if (!sessions) {
    log.session.warn('sessions 服务不可用，无法提取会话内容');
    return {
      messages: [],
      toolCalls: [],
      totalTokens: 0,
    };
  }

  try {
    // 获取活跃会话
    const session = sessions.get(sessionId);
    if (!session) {
      log.session.warn(`会话不存在或已关闭: ${sessionId}`);
      return {
        messages: [],
        toolCalls: [],
        totalTokens: 0,
      };
    }
    
    // 获取会话事件
    const events = session.snapshotEvents();
    
    // 提取关键内容
    const content = {
      messages: [],
      toolCalls: [],
      totalTokens: 0,
    };
    
    for (const event of events) {
      switch (event.type) {
        case 'user/message': {
          // user/message 的 content 在顶层 event.data.content
          const text = extractText(event.data?.content || event.data?.message?.content);
          if (text) {
            content.messages.push({
              role: 'user',
              text,
              time: event.time,
            });
            content.totalTokens += estimateTextTokens(text);
          }
          break;
        }
        
        case 'assistant/message': {
          // assistant/message 的 content 在 event.data.message.content
          const text = extractText(event.data?.message?.content);
          if (text) {
            content.messages.push({
              role: 'assistant',
              text,
              time: event.time,
            });
            content.totalTokens += estimateTextTokens(text);
          }
          break;
        }
        
        case 'tool/call': {
          if (includeToolCalls) {
            content.toolCalls.push({
              name: event.data.name,
              arguments: event.data.arguments,
              time: event.time,
            });
          }
          break;
        }
      }
      
      // 截断保护
      if (content.totalTokens > maxContentTokens) {
        log.session.warn(`会话内容超过 ${maxContentTokens} tokens，已截断`);
        break;
      }
    }
    
    log.session.info(`从会话 ${sessionId} 提取了 ${content.messages.length} 条消息，约 ${formatTokens(content.totalTokens)} tokens`);
    return content;
  } catch (e) {
    log.session.error(`提取会话内容失败: ${e.message}`);
    return {
      messages: [],
      toolCalls: [],
      totalTokens: 0,
      error: e.message,
    };
  }
}

/**
 * 从多个会话中提取内容并合并
 * @param {Object} sessions - DSH sessions 服务
 * @param {Array<string>} sessionIds - 会话 ID 列表
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 合并后的内容
 */
export async function extractMultipleSessions(sessions, sessionIds, options = {}) {
  const {
    includeToolCalls = false,
    maxContentTokens = 12500, // 约 50k 字符
  } = options;
  
  const allMessages = [];
  const allToolCalls = [];
  let totalTokens = 0;
  
  for (const sessionId of sessionIds) {
    const content = await extractSessionContent(sessions, sessionId, {
      includeToolCalls,
      maxContentTokens: maxContentTokens - totalTokens,
    });
    
    // 添加会话标识
    const sessionMessages = content.messages.map(msg => ({
      ...msg,
      sessionId,
    }));
    
    allMessages.push(...sessionMessages);
    allToolCalls.push(...content.toolCalls);
    totalTokens += content.totalTokens;
    
    // 如果超过限制，停止提取
    if (totalTokens >= maxContentTokens) {
      log.session.warn(`多会话内容超过 ${maxContentTokens} tokens，停止提取`);
      break;
    }
  }
  
  // 按时间排序
  allMessages.sort((a, b) => a.time - b.time);
  allToolCalls.sort((a, b) => a.time - b.time);
  
  return {
    messages: allMessages,
    toolCalls: allToolCalls,
    totalTokens,
    totalLength: totalTokens * CHARS_PER_TOKEN, // 兼容旧字段
    sessionCount: sessionIds.length,
  };
}




