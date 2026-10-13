/**
 * Token 计算工具
 * 使用 DSH 的 token 估算方法
 */

/**
 * 每字符对应的 token 数（DSH 使用 4 字符/token）
 */
export const CHARS_PER_TOKEN = 4;

/**
 * 每个块的 JSON 结构开销
 */
export const BLOCK_OVERHEAD = 4;

/**
 * 角色 framing 开销
 */
export const ROLE_OVERHEAD = 4;

/**
 * 估算文本的 token 数
 * @param {string} text - 文本内容
 * @returns {number} 估算的 token 数
 */
export function estimateTextTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * 估算内容块的 token 数
 * @param {Array} blocks - 内容块数组
 * @returns {number} 估算的 token 数
 */
export function estimateContentTokens(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return 0;
  
  let tokens = 0;
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
      case 'reasoning':
        tokens += Math.ceil((block.text?.length || 0) / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
        break;
      case 'tool-call':
        tokens += Math.ceil((block.name?.length || 0) / CHARS_PER_TOKEN)
          + Math.ceil((block.arguments?.length || 0) / CHARS_PER_TOKEN)
          + BLOCK_OVERHEAD;
        break;
      default:
        // 其他类型使用 JSON 结构估算
        tokens += BLOCK_OVERHEAD + Math.ceil(JSON.stringify(block).length / CHARS_PER_TOKEN);
    }
  }
  return tokens;
}

/**
 * 估算消息的 token 数
 * @param {Object} message - 消息对象
 * @param {string} message.role - 消息角色
 * @param {Array| string} message.content - 消息内容
 * @returns {number} 估算的 token 数
 */
export function estimateMessageTokens(message) {
  if (!message) return 0;
  
  const content = message.content;
  let tokens = 0;
  
  if (typeof content === 'string') {
    tokens = Math.ceil(content.length / CHARS_PER_TOKEN) + ROLE_OVERHEAD;
  } else if (Array.isArray(content)) {
    tokens = estimateContentTokens(content) + ROLE_OVERHEAD;
  }
  
  return tokens;
}

/**
 * 估算多条消息的总 token 数
 * @param {Array} messages - 消息数组
 * @returns {number} 总 token 数
 */
export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * 格式化 token 数为可读字符串
 * @param {number} tokens - token 数
 * @returns {string} 格式化后的字符串
 */
export function formatTokens(tokens) {
  if (typeof tokens !== 'number' || isNaN(tokens)) return '0';
  
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toLocaleString();
}

/**
 * 字符数转 token 数
 * @param {number} chars - 字符数
 * @returns {number} token 数
 */
export function charsToTokens(chars) {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * token 数转字符数（估算）
 * @param {number} tokens - token 数
 * @returns {number} 字符数
 */
export function tokensToChars(tokens) {
  return tokens * CHARS_PER_TOKEN;
}

