/**
 * 缓存管理模块
 * 提供简单的内存缓存功能
 */

const cache = new Map();
const DEFAULT_TTL = 30000; // 30 seconds

/**
 * 获取缓存值
 * @param {string} key - 缓存键
 * @returns {any|null} 缓存值或 null
 */
export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DEFAULT_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * 设置缓存值
 * @param {string} key - 缓存键
 * @param {any} data - 缓存数据
 */
export function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * 清空所有缓存
 */
export function clearCache() {
  cache.clear();
}
