/**
 * 会话工具模块
 * 提取会话轮次数据的统一方法
 */

import { estimateTextTokens } from './token-utils.js';

/**
 * 从会话事件中提取轮次数据
 * @param {Array} events - 会话事件数组
 * @param {Object} options - 选项
 * @param {number} options.maxSummaryChars - 摘要最大字符数（默认 800，约 200 tokens）。设为 -1 表示不截断
 * @param {string} options.sessionId - 可选，附加到每个轮次
 * @returns {Array} 轮次数组
 */
export function extractTurnsFromEvents(events, options = {}) {
  const { maxSummaryChars = 800, sessionId = null } = options;
  const truncate = maxSummaryChars >= 0; // -1 表示不截断
  
  const turns = [];
  let currentTurn = null;
  
  for (const event of events) {
    if (event.type === 'turn/start') {
      currentTurn = {
        turnNumber: event.data.turn,
        time: event.time,
        userInput: '',
        summary: '',
      };
      if (sessionId) {
        currentTurn.sessionId = sessionId;
      }
    } else if (event.type === 'turn/end' && currentTurn) {
      currentTurn.endTime = event.time;
      turns.push(currentTurn);
      currentTurn = null;
    } else if (event.type === 'user/message' && currentTurn) {
      // user/message 的 content 在顶层 event.data.content
      const content = event.data?.content;
      if (typeof content === 'string') {
        currentTurn.userInput = content;
      } else if (Array.isArray(content)) {
        currentTurn.userInput = content
          .filter(p => p.type === 'text')
          .map(p => p.text)
          .join('\n');
      }
    } else if (event.type === 'assistant/message' && currentTurn) {
      // assistant/message 的 content 在 event.data.message.content
      const content = event.data?.message?.content;
      let text = '';
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .filter(p => p.type === 'text')
          .map(p => p.text)
          .join('\n');
      }
      // 根据选项决定是否截断
      if (text) {
        const newSummary = truncate 
          ? (text.substring(0, maxSummaryChars) + (text.length > maxSummaryChars ? '...' : ''))
          : text;
        // 如果当前摘要为空，或者新文本更长（取更完整的），则更新
        if (currentTurn.summary === '' || text.length > currentTurn.summary.length) {
          currentTurn.summary = newSummary;
        }
      }
    }
  }
  
  return turns;
}

/**
 * 从单个会话提取轮次数据
 * @param {Object} sessionQuery - sessionQuery 服务
 * @param {string} sessionId - 会话 ID
 * @param {Object} options - 选项
 * @returns {Promise<Array>} 轮次数组
 */
export async function extractSessionTurns(sessionQuery, sessionId, options = {}) {
  if (!sessionQuery) {
    return [];
  }
  
  try {
    const logSnapshot = await sessionQuery.readSession(sessionId);
    const events = logSnapshot.events;
    
    return extractTurnsFromEvents(events, { ...options, sessionId });
  } catch (e) {
    console.error(`提取会话轮次失败: ${e.message}`);
    return [];
  }
}

/**
 * 从多个会话提取轮次数据并合并
 * @param {Object} sessionQuery - sessionQuery 服务
 * @param {Array<string>} sessionIds - 会话 ID 数组
 * @param {Object} options - 选项
 * @returns {Promise<{turns: Array, totalTokens: number}>} 轮次数据和总 token 数
 */
export async function extractMultipleSessionTurns(sessionQuery, sessionIds, options = {}) {
  const allTurns = [];
  
  for (const sessionId of sessionIds) {
    const turns = await extractSessionTurns(sessionQuery, sessionId, options);
    allTurns.push(...turns);
  }
  
  // 按时间排序
  allTurns.sort((a, b) => a.time - b.time);
  
  // 计算总 token
  const totalTokens = allTurns.reduce(
    (sum, t) => sum + estimateTextTokens(t.userInput) + estimateTextTokens(t.summary), 
    0
  );
  
  return { turns: allTurns, totalTokens };
}

/**
 * 计算轮次数组的总 token 数
 * @param {Array} turns - 轮次数组
 * @returns {number} 总 token 数
 */
export function calculateTurnsTokens(turns) {
  return turns.reduce(
    (sum, t) => sum + estimateTextTokens(t.userInput || '') + estimateTextTokens(t.summary || ''), 
    0
  );
}

