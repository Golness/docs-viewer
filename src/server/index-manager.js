/**
 * 搜索索引管理模块
 * 负责搜索索引的构建、加载和保存
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * 获取索引文件路径
 * @param {string} docsRoot - 文档根目录
 * @returns {string} 索引文件路径
 */
function getIndexPath(docsRoot) {
  return join(docsRoot, '.index', 'search-index.json');
}

/**
 * 加载搜索索引
 * @param {string} docsRoot - 文档根目录
 * @returns {Promise<Object|null>} 索引对象或 null
 */
export async function loadIndex(docsRoot) {
  const indexPath = getIndexPath(docsRoot);
  if (!existsSync(indexPath)) return null;
  try {
    return JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 保存搜索索引
 * @param {string} docsRoot - 文档根目录
 * @param {Object} index - 索引对象
 */
export async function saveIndex(docsRoot, index) {
  const indexPath = getIndexPath(docsRoot);
  const indexDir = join(docsRoot, '.index');
  await mkdir(indexDir, { recursive: true });
  // Atomic write
  const tmpPath = indexPath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(index, null, 2), 'utf8');
  await rename(tmpPath, indexPath);
}

/**
 * 重建搜索索引
 * @param {string} docsRoot - 文档根目录
 * @param {Object} tree - 文档树
 * @returns {Promise<Object>} 新索引
 */
export async function rebuildIndex(docsRoot, tree) {
  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    requirements: [],
    featureIndex: {},
    fieldIndex: {},
    tagIndex: {},
  };

  for (const dev of tree.developers) {
    for (const req of dev.requirements) {
      if (!req.hasMeta) continue;

      const metaPath = join(docsRoot, req.path, '.meta.json');
      let meta;
      try {
        meta = JSON.parse(await readFile(metaPath, 'utf8'));
      } catch {
        continue;
      }

      const entry = {
        id: req.id,
        developer: dev.name,
        date: req.date,
        title: req.title,
        type: meta.type || 'unknown',
        summary: meta.summary || '',
        features: meta.features || [],
        fields: meta.fields || [],
        tags: meta.tags || [],
        timeline: meta.timeline || [],
      };

      index.requirements.push(entry);

      // Build inverted indices
      for (const feature of (meta.features || [])) {
        if (!index.featureIndex[feature]) index.featureIndex[feature] = [];
        index.featureIndex[feature].push(req.id);
      }
      for (const field of (meta.fields || [])) {
        if (!index.fieldIndex[field]) index.fieldIndex[field] = [];
        index.fieldIndex[field].push(req.id);
      }
      for (const tag of (meta.tags || [])) {
        if (!index.tagIndex[tag]) index.tagIndex[tag] = [];
        index.tagIndex[tag].push(req.id);
      }
    }
  }

  await saveIndex(docsRoot, index);
  return index;
}
