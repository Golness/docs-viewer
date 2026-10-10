/**
 * 文档树管理模块
 * 负责构建和查询文档目录树结构
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REQ_DIR_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

/**
 * 解析需求目录名
 * @param {string} dirName - 目录名
 * @returns {Object|null} 解析结果
 */
function parseRequirementDir(dirName) {
  const m = dirName.match(REQ_DIR_RE);
  if (!m) return null;
  return {
    id: dirName,
    date: m[1],
    title: m[2],
  };
}

/**
 * 推断文档类型
 * @param {string} filename - 文件名
 * @returns {string} 文档类型
 */
function inferDocType(filename) {
  const lower = filename.toLowerCase();
  if (/\bcr\b/.test(lower) || lower.includes('code review') || lower.includes('codereview')) return 'cr';
  if (lower.includes('技术') || lower.includes('design') || lower.includes('tech') || lower.includes('technical')) return 'design';
  if (lower.includes('需求') || lower.includes('require') || lower.includes('prd')) return 'requirement';
  return 'other';
}

/**
 * 构建文档树
 * @param {string} docsDir - 文档根目录
 * @returns {Promise<Object>} 文档树
 */
export async function buildTree(docsDir) {
  const tree = { developers: [] };

  let devEntries;
  try {
    devEntries = await readdir(docsDir, { withFileTypes: true });
  } catch {
    return tree;
  }

  for (const entry of devEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const devPath = join(docsDir, entry.name);
    const devNode = {
      name: entry.name,
      requirementCount: 0,
      requirements: [],
    };

    let reqDirs;
    try {
      reqDirs = await readdir(devPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const rd of reqDirs) {
      if (!rd.isDirectory()) continue;
      const parsed = parseRequirementDir(rd.name);
      if (!parsed) continue;

      const reqPath = join(devPath, rd.name);
      let files;
      try {
        files = await readdir(reqPath);
      } catch {
        files = [];
      }

      const docFiles = files.filter(
        f => f.endsWith('.md') || f.endsWith('.html') || f.endsWith('.htm') || 
             f.endsWith('.txt') || f.endsWith('.text') || f.endsWith('.markdown')
      );
      const hasMeta = files.includes('.meta.json');

      let metaUpdatedAt = null;
      let meta = null;
      if (hasMeta) {
        try {
          const metaStat = await stat(join(reqPath, '.meta.json'));
          metaUpdatedAt = metaStat.mtime.toISOString();
          const metaContent = await readFile(join(reqPath, '.meta.json'), 'utf8');
          meta = JSON.parse(metaContent);
        } catch { /* ignore */ }
      }

      devNode.requirements.push({
        ...parsed,
        developer: entry.name,
        path: relative(docsDir, reqPath),
        files: docFiles.map(f => ({
          name: f,
          type: inferDocType(f),
        })),
        fileCount: docFiles.length,
        hasMeta,
        metaUpdatedAt,
        meta,
      });
    }

    devNode.requirements.sort((a, b) => b.date.localeCompare(a.date));
    devNode.requirementCount = devNode.requirements.length;
    tree.developers.push(devNode);
  }

  tree.developers.sort((a, b) => a.name.localeCompare(b.name));
  return tree;
}

/**
 * 统计需求总数
 * @param {Object} tree - 文档树
 * @returns {number} 需求总数
 */
export function countRequirements(tree) {
  return tree.developers.reduce((sum, d) => sum + d.requirementCount, 0);
}

/**
 * 根据 ID 查找需求路径
 * @param {string} docsDir - 文档根目录
 * @param {Object} tree - 文档树
 * @param {string} requirementId - 需求 ID
 * @returns {Object|null} 需求信息
 */
export function findRequirementPath(docsDir, tree, requirementId) {
  for (const dev of tree.developers) {
    for (const req of dev.requirements) {
      if (req.id === requirementId) {
        return { path: join(docsDir, req.path), req };
      }
    }
  }
  return null;
}

/**
 * 支持的文档扩展名
 */
export const SUPPORTED_DOC_EXTS = ['.md', '.html', '.htm', '.txt', '.text', '.markdown'];
