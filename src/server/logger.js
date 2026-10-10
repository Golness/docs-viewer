/**
 * 日志管理模块
 * 提供操作日志的记录和查询功能
 */

const operationLogs = [];
const MAX_LOGS = 100;

/**
 * 添加日志记录
 * @param {'info'|'success'|'warning'|'error'} type - 日志类型
 * @param {string} message - 日志消息
 * @param {any} data - 附加数据
 */
export function addLog(type, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  };
  operationLogs.unshift(entry);
  if (operationLogs.length > MAX_LOGS) {
    operationLogs.pop();
  }
}

/**
 * 获取所有日志
 * @returns {Array} 日志数组
 */
export function getLogs() {
  return operationLogs;
}

/**
 * 清空日志
 */
export function clearLogs() {
  operationLogs.length = 0;
}
