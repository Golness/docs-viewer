/**
 * 日志管理模块
 * 提供操作日志的记录和查询功能
 * 
 * 日志等级: debug < info < warn < error
 * 日志标签: 标识日志来源的功能模块
 */

const operationLogs = [];
const MAX_LOGS = 200;

/**
 * 日志等级定义
 * 数值越大，优先级越高
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * 日志标签定义
 * key: 标签ID
 * value: 显示名称
 */
const LOG_TAGS = {
  startup: '启动',
  config: '配置',
  tree: '目录',
  sync: '同步',
  'sync-engine': '同步引擎',
  'phased-sync': '分阶段同步',
  analysis: 'AI分析',
  'ai-engine': 'AI引擎',
  'task-executor': '任务执行器',
  session: '会话',
  search: '搜索',
  template: '模板',
  index: '索引',
  doc: '文档',
  state: '状态',
};

/**
 * 内部添加日志记录
 * @param {string} level - 日志等级 (debug/info/warn/error)
 * @param {string} tag - 日志标签
 * @param {string} message - 日志消息
 * @param {any} data - 附加数据
 */
function _addLog(level, tag, message, data = null) {
  const entry = {
    ts: Date.now(),
    timestamp: new Date().toISOString(),
    level,
    tag,
    message,
    data
  };
  operationLogs.unshift(entry);
  if (operationLogs.length > MAX_LOGS) {
    operationLogs.pop();
  }
}

/**
 * 创建带标签的日志记录器
 * @param {string} tag - 日志标签
 * @returns {Object} 包含各等级日志方法的对象
 */
export function createLogger(tag) {
  return {
    /**
     * 记录 debug 级别日志
     * 用于详细的调试信息，生产环境通常不显示
     */
    debug: (message, data = null) => _addLog('debug', tag, message, data),
    
    /**
     * 记录 info 级别日志
     * 用于常规操作信息，如启动、完成、进度等
     */
    info: (message, data = null) => _addLog('info', tag, message, data),
    
    /**
     * 记录 warn 级别日志
     * 用于警告信息，如降级处理、非致命错误等
     */
    warn: (message, data = null) => _addLog('warn', tag, message, data),
    
    /**
     * 记录 error 级别日志
     * 用于错误信息，如操作失败、异常等
     */
    error: (message, data = null) => _addLog('error', tag, message, data),
  };
}

/**
 * 获取所有日志
 * @param {Object} options - 筛选选项
 * @param {string[]} options.levels - 日志等级过滤
 * @param {string[]} options.tags - 日志标签过滤
 * @returns {Array} 日志数组
 */
export function getLogs(options = {}) {
  const { levels = [], tags = [] } = options;
  
  let filtered = operationLogs;
  
  // 按等级筛选
  if (levels.length > 0) {
    filtered = filtered.filter(log => levels.includes(log.level));
  }
  
  // 按标签筛选
  if (tags.length > 0) {
    filtered = filtered.filter(log => tags.includes(log.tag));
  }
  
  return filtered;
}

/**
 * 获取所有可用的日志等级
 * @returns {Object} 日志等级映射
 */
export function getLogLevels() {
  return { ...LOG_LEVELS };
}

/**
 * 获取所有可用的日志标签
 * @returns {Object} 日志标签映射
 */
export function getLogTags() {
  return { ...LOG_TAGS };
}

/**
 * 清空日志
 */
export function clearLogs() {
  operationLogs.length = 0;
}

/**
 * 兼容旧版 addLog 函数
 * @deprecated 请使用 createLogger(tag) 创建的日志记录器
 * @param {'info'|'success'|'warning'|'error'} type - 日志类型
 * @param {string} message - 日志消息
 * @param {any} data - 附加数据
 */
export function addLog(type, message, data = null) {
  // 旧类型映射到新等级
  const typeToLevel = {
    success: 'info',
    info: 'info',
    warning: 'warn',
    error: 'error',
  };
  
  // 从消息中尝试提取标签（兼容旧行为）
  let level = typeToLevel[type] || 'info';
  let tag = 'startup'; // 默认标签
  
  // 根据消息内容推断标签
  if (message.includes('配置') || message.includes('LLM')) {
    tag = 'config';
  } else if (message.includes('同步') || message.includes('Sync')) {
    tag = 'sync';
  } else if (message.includes('分析') || message.includes('AI')) {
    tag = 'analysis';
  } else if (message.includes('索引')) {
    tag = 'index';
  } else if (message.includes('会话') || message.includes('session')) {
    tag = 'session';
  } else if (message.includes('目录') || message.includes('创建')) {
    tag = 'tree';
  } else if (message.includes('模板')) {
    tag = 'template';
  } else if (message.includes('启动') || message.includes('卸载')) {
    tag = 'startup';
  }
  
  _addLog(level, tag, message, data);
}

// 导出预定义的日志记录器，方便直接使用
export const log = {
  startup: createLogger('startup'),
  config: createLogger('config'),
  tree: createLogger('tree'),
  sync: createLogger('sync'),
  syncEngine: createLogger('sync-engine'),
  phasedSync: createLogger('phased-sync'),
  analysis: createLogger('analysis'),
  aiEngine: createLogger('ai-engine'),
  taskExecutor: createLogger('task-executor'),
  session: createLogger('session'),
  search: createLogger('search'),
  template: createLogger('template'),
  index: createLogger('index'),
  doc: createLogger('doc'),
  state: createLogger('state'),
};
