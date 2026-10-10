/**
 * 通用工具模块
 * 提供路径安全、文件遍历、请求处理、分支校验等通用功能
 */

import { readdir, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';

const MAX_DEPTH = 10;
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const MAX_DOC_CONTENT = 10000000; // 10MB

/**
 * 解析 Git 分支名，提取开发者、日期、标题等信息
 * 支持三种格式：
 * 1. feature/{developer}/{YYYY-MM-DD}-{title}  (新格式)
 * 2. feature/{developer}-{YYYY-MM-DD}-{title}  (旧格式)
 * 3. {YYYY-MM-DD}-{title}  (无开发者前缀)
 * @param {string} branch - 分支名称
 * @returns {{ developer: string|null, date: string, title: string, requirementId: string }|null} 解析结果
 */
export function parseBranchName(branch) {
  if (!branch) return null;

  // 格式 1 & 2: feature/{developer}[/-]{YYYY-MM-DD}-{title}
  const match1 = branch.match(/^(?:feature\/)?([^/-]+)[/-](\d{4}-\d{2}-\d{2})-(.+)$/);
  if (match1) {
    const [, developer, date, title] = match1;
    return { developer, date, title, requirementId: `${date}-${title}` };
  }

  // 格式 3: {YYYY-MM-DD}-{title}  (无开发者前缀)
  const match2 = branch.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (match2) {
    const [, date, title] = match2;
    return { developer: null, date, title, requirementId: `${date}-${title}` };
  }

  return null;
}

/**
 * 验证 Git 分支名称
 * 支持 Unicode 字符（包括中文），拒绝危险的路径遍历模式
 * @param {string} branchName - 分支名称
 * @throws {Error} 如果分支名称无效
 */
export function validateBranchName(branchName) {
  if (!branchName || branchName.trim().length === 0) {
    throw new Error('Invalid branch name');
  }
  // Reject path traversal and absolute paths
  if (branchName.includes('..') || branchName.startsWith('/') || branchName.startsWith('\\')) {
    throw new Error('Invalid branch name');
  }
  // Reject control characters and whitespace
  if (/[\x00-\x1f\s]/.test(branchName)) {
    throw new Error('Invalid branch name');
  }
}

/**
 * 检查子路径是否在父路径内
 * @param {string} parent - 父路径
 * @param {string} child - 子路径
 * @returns {boolean} 是否安全
 */
export function isInside(parent, child) {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);

  const normalizedParent = process.platform === 'win32'
    ? resolvedParent.toLowerCase()
    : resolvedParent;
  const normalizedChild = process.platform === 'win32'
    ? resolvedChild.toLowerCase()
    : resolvedChild;

  const rel = relative(normalizedParent, normalizedChild);
  return rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * 遍历文档目录
 * @param {string} root - 根目录
 * @param {string} ext - 文件扩展名
 * @param {number} maxDepth - 最大深度
 * @returns {Promise<Array>} 文件列表
 */
export async function walkDocs(root, ext, maxDepth = MAX_DEPTH) {
  const results = [];
  const visited = new Set();
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (depth > maxDepth) continue;

    let realDir;
    try {
      realDir = await resolve(dir);
    } catch {
      continue;
    }

    if (visited.has(realDir)) continue;
    visited.add(realDir);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = `${dir}/${entry.name}`;

      if (entry.isDirectory()) {
        stack.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
        if (!isInside(root, full)) continue;

        const info = await stat(full).catch(() => null);
        results.push({
          path: full,
          relative: full.slice(resolve(root).length + 1),
          name: entry.name,
          size: info?.size ?? 0,
        });
      }
    }
  }

  results.sort((a, b) => a.relative.localeCompare(b.relative));
  return results;
}

/**
 * 发送 JSON 响应
 * @param {Object} res - HTTP 响应对象
 * @param {any} data - 响应数据
 * @param {number} status - HTTP 状态码
 */
export function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * 读取请求体
 * @param {Object} req - HTTP 请求对象
 * @param {number} maxSize - 最大大小
 * @returns {Promise<string>} 请求体字符串
 */
export function readBody(req, maxSize = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * 截断长文本
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
export function truncateText(text, maxLength = MAX_DOC_CONTENT) {
  if (text.length > maxLength) {
    return text.slice(0, maxLength) + '\n\n[内容已截断]';
  }
  return text;
}
