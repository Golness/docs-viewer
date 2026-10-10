/**
 * 内容提取器模块
 * 从 DSH 会话中提取有用的上下文信息
 */

import { addLog } from './logger.js';

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
 * @param {Object} ctx - DSH 上下文
 * @param {string} sessionId - 会话 ID
 * @param {Object} options - 选项
 * @param {boolean} options.includeToolCalls - 是否包含工具调用
 * @param {number} options.maxContentLength - 最大内容长度（字符数）
 * @returns {Promise<Object>} 提取的内容
 */
export async function extractSessionContent(ctx, sessionId, options = {}) {
  const {
    includeToolCalls = false,
    maxContentLength = 50000,
  } = options;
  
  const sessionQuery = ctx?.sessionQuery;
  if (!sessionQuery) {
    addLog('warning', '⚠️ sessionQuery 服务不可用，无法提取会话内容');
    return {
      messages: [],
      toolCalls: [],
      totalLength: 0,
    };
  }

  try {
    // 读取完整会话
    const snapshot = await sessionQuery.readSession(sessionId);
    const events = snapshot.events;
    
    // 提取关键内容
    const content = {
      messages: [],
      toolCalls: [],
      totalLength: 0,
    };
    
    for (const event of events) {
      switch (event.type) {
        case 'user/message': {
          const text = extractText(event.data.message.content);
          if (text) {
            content.messages.push({
              role: 'user',
              text,
              time: event.time,
            });
            content.totalLength += text.length;
          }
          break;
        }
        
        case 'assistant/message': {
          const text = extractText(event.data.message.content);
          if (text) {
            content.messages.push({
              role: 'assistant',
              text,
              time: event.time,
            });
            content.totalLength += text.length;
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
      if (content.totalLength > maxContentLength) {
        addLog('warning', `⚠️ 会话内容超过 ${maxContentLength} 字符，已截断`);
        break;
      }
    }
    
    addLog('info', `📖 从会话 ${sessionId} 提取了 ${content.messages.length} 条消息，${content.totalLength} 字符`);
    return content;
  } catch (e) {
    addLog('error', `❌ 提取会话内容失败: ${e.message}`);
    return {
      messages: [],
      toolCalls: [],
      totalLength: 0,
      error: e.message,
    };
  }
}

/**
 * 从多个会话中提取内容并合并
 * @param {Object} ctx - DSH 上下文
 * @param {Array<string>} sessionIds - 会话 ID 列表
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 合并后的内容
 */
export async function extractMultipleSessions(ctx, sessionIds, options = {}) {
  const {
    includeToolCalls = false,
    maxContentLength = 50000,
  } = options;
  
  const allMessages = [];
  const allToolCalls = [];
  let totalLength = 0;
  
  for (const sessionId of sessionIds) {
    const content = await extractSessionContent(ctx, sessionId, {
      includeToolCalls,
      maxContentLength: maxContentLength - totalLength,
    });
    
    // 添加会话标识
    const sessionMessages = content.messages.map(msg => ({
      ...msg,
      sessionId,
    }));
    
    allMessages.push(...sessionMessages);
    allToolCalls.push(...content.toolCalls);
    totalLength += content.totalLength;
    
    // 如果超过限制，停止提取
    if (totalLength >= maxContentLength) {
      addLog('warning', `⚠️ 多会话内容超过 ${maxContentLength} 字符，停止提取`);
      break;
    }
  }
  
  // 按时间排序
  allMessages.sort((a, b) => a.time - b.time);
  allToolCalls.sort((a, b) => a.time - b.time);
  
  return {
    messages: allMessages,
    toolCalls: allToolCalls,
    totalLength,
    sessionCount: sessionIds.length,
  };
}
