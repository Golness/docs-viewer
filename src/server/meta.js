/**
 * Meta 数据验证模块
 * 负责 .meta.json 文件的验证和标准化
 */

const META_DEFAULTS = {
  type: 'unknown',
  summary: '',
  features: [],
  fields: [],
  tags: [],
  timeline: [],
};

/**
 * 验证并标准化 meta 数据
 * @param {Object} meta - 原始 meta 数据
 * @returns {Object} 验证后的 meta 数据
 */
export function validateMeta(meta) {
  const result = { ...META_DEFAULTS };
  if (!meta || typeof meta !== 'object') return result;

  if (typeof meta.type === 'string') result.type = meta.type;
  if (typeof meta.summary === 'string') result.summary = meta.summary;
  if (Array.isArray(meta.features)) result.features = meta.features.filter(f => typeof f === 'string');
  if (Array.isArray(meta.fields)) result.fields = meta.fields.filter(f => typeof f === 'string');
  if (Array.isArray(meta.tags)) result.tags = meta.tags.filter(t => typeof t === 'string');
  if (Array.isArray(meta.timeline)) {
    result.timeline = meta.timeline
      .filter(t => t && typeof t === 'object')
      .map(t => ({
        date: typeof t.date === 'string' ? t.date : '',
        title: typeof t.title === 'string' ? t.title : '',
        type: typeof t.type === 'string' ? t.type : 'other',
        description: typeof t.description === 'string' ? t.description : '',
      }));
  }
  return result;
}
