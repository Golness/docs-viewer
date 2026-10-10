/**
 * 文档读写模块
 * 负责文档文件的读取和写入
 */

import { readdir, readFile, writeFile, stat, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { addLog } from './logger.js';

const MAX_DOC_CONTENT = 10000000; // 10MB
const SUPPORTED_DOC_EXTS = ['.md', '.html', '.htm', '.txt', '.text', '.markdown'];

/**
 * 检查文件是否为支持的文档类型
 * @param {string} filename - 文件名
 * @returns {boolean}
 */
export function isSupportedDocFile(filename) {
  const lower = filename.toLowerCase();
  return SUPPORTED_DOC_EXTS.some(ext => lower.endsWith(ext));
}

/**
 * 读取需求目录下的所有文档
 * @param {string} reqPath - 需求目录路径
 * @returns {Promise<string>} 合并后的文档内容
 */
export async function readRequirementDocs(reqPath) {
  let files;
  try {
    files = await readdir(reqPath);
  } catch {
    return '';
  }

  const docFiles = files.filter(f => isSupportedDocFile(f));
  const parts = [];

  for (const f of docFiles) {
    try {
      const content = await readFile(join(reqPath, f), 'utf8');
      let processedContent = content;
      
      // For HTML files, extract text content
      if (f.toLowerCase().endsWith('.html') || f.toLowerCase().endsWith('.htm')) {
        processedContent = content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      parts.push(`### ${f}\n${processedContent}`);
    } catch { /* skip unreadable */ }
  }

  let docsContent = parts.join('\n\n---\n\n');

  // Truncation protection
  if (docsContent.length > MAX_DOC_CONTENT) {
    docsContent = docsContent.slice(0, MAX_DOC_CONTENT) + '\n\n[内容已截断]';
    addLog('warning', `⚠️ 文档内容超过 ${MAX_DOC_CONTENT} 字符，已截断`);
  }

  return docsContent;
}

/**
 * 原子写入 .meta.json 文件
 * @param {string} metaPath - 目标路径
 * @param {Object} meta - meta 数据
 */
export async function writeMetaJson(metaPath, meta) {
  const tmpPath = metaPath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(meta, null, 2), 'utf8');
  await rename(tmpPath, metaPath);
}

/**
 * 查找需求目录
 * @param {string} docsRoot - 文档根目录
 * @param {string} requirementId - 需求 ID
 * @returns {Promise<string|null>} 需求目录路径或 null
 */
export async function findRequirementDir(docsRoot, requirementId) {
  try {
    const developers = await readdir(docsRoot, { withFileTypes: true });
    for (const dev of developers) {
      if (!dev.isDirectory() || dev.name.startsWith('.')) continue;
      const devPath = join(docsRoot, dev.name);
      const reqs = await readdir(devPath, { withFileTypes: true });
      for (const req of reqs) {
        if (req.isDirectory() && req.name === requirementId) {
          return join(devPath, req.name);
        }
      }
    }
  } catch (e) {
    addLog('error', `findRequirementDir error: ${e.message}`);
  }
  return null;
}
