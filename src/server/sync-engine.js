/**
 * 文档同步引擎模块
 * 负责从 Git 分支获取变更并生成同步文档
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getPrompt } from './prompts.js';
import { addLog } from './logger.js';
import { validateBranchName, parseBranchName } from './utils.js';

const execAsync = promisify(exec);

/**
 * 根据需求目录名查找对应的 Git 分支
 * @param {string} repoPath - 仓库路径
 * @param {string} requirementId - 需求目录名（如 "2026-10-10-费用管理-门店租金"）
 * @returns {Promise<string|null>} 分支名称，如果未找到则返回 null
 */
export async function findBranchByRequirement(repoPath, requirementId) {
  try {
    // 获取所有分支（本地 + 远程）
    const { stdout } = await execAsync('git branch -a --format="%(refname:short)"', { cwd: repoPath });
    const branches = stdout.trim().split('\n').filter(Boolean);
    
    // 查找包含 requirementId 的分支
    // 分支格式可能是: feature/developer/2026-10-10-xxx 或 feature/developer-2026-10-10-xxx 或 2026-10-10-xxx
    for (const branch of branches) {
      // 移除 origin/ 前缀
      const cleanBranch = branch.replace(/^origin\//, '');
      
      // 使用统一的分支名解析
      const parsed = parseBranchName(cleanBranch);
      if (parsed && parsed.requirementId === requirementId) {
        return cleanBranch;
      }
      
      // 尝试更宽松的匹配：只匹配日期部分
      const reqParsed = parseBranchName(requirementId);
      if (reqParsed) {
        const { date, title } = reqParsed;
        // 检查分支是否包含日期和标题的一部分
        if (cleanBranch.includes(date) && cleanBranch.includes(title.substring(0, 10))) {
          return cleanBranch;
        }
      }
    }
    
    return null;
  } catch (e) {
    addLog('error', `❌ 查找分支失败: ${e.message}`);
    return null;
  }
}

/**
 * 检测仓库中存在的基准分支（main / master）
 * @param {string} repoPath - 仓库路径
 * @returns {Promise<string[]>} 存在的基准分支名称列表
 */
async function detectBaseBranches(repoPath) {
  const candidates = ['main', 'master'];
  const existing = [];
  for (const name of candidates) {
    try {
      const { stdout } = await execAsync(`git rev-parse --verify "${name}"`, { cwd: repoPath });
      if (stdout.trim()) existing.push(name);
    } catch { /* branch does not exist */ }
  }
  return existing;
}

/**
 * 获取分支的提交记录
 * @param {string} repoPath - 仓库路径
 * @param {string} branchName - 分支名称
 * @returns {Promise<Array<{hash: string, subject: string, author: string, date: string}>>} 提交记录
 */
export async function getBranchCommits(repoPath, branchName) {
  validateBranchName(branchName);
  
  try {
    // Check if branch exists locally
    const { stdout: branchCheck } = await execAsync(`git branch --list "${branchName}"`, { cwd: repoPath });
    let targetBranch = branchName;
    
    if (!branchCheck.trim()) {
      // Try with origin/ prefix
      const { stdout: remoteCheck } = await execAsync(`git branch -r --list "origin/${branchName}"`, { cwd: repoPath });
      if (!remoteCheck.trim()) {
        throw new Error(`Branch "${branchName}" does not exist`);
      }
      targetBranch = `origin/${branchName}`;
    }

    // Detect which base branches exist
    const baseBranches = await detectBaseBranches(repoPath);
    if (baseBranches.length === 0) {
      // No base branch found, just list all commits on this branch
      const { stdout } = await execAsync(
        `git log ${targetBranch} --pretty=format:"%H|%s|%an|%ad" --date=short`,
        { cwd: repoPath, maxBuffer: 1024 * 1024 * 10 }
      );
      if (!stdout.trim()) return [];
      return stdout.trim().split('\n').map(line => {
        const [hash, subject, author, date] = line.split('|');
        return { hash, subject, author, date };
      });
    }

    const notClause = baseBranches.map(b => `--not ${b}`).join(' ');
    const { stdout } = await execAsync(
      `git log ${targetBranch} ${notClause} --pretty=format:"%H|%s|%an|%ad" --date=short`,
      { cwd: repoPath, maxBuffer: 1024 * 1024 * 10 }
    );

    if (!stdout.trim()) return [];

    return stdout.trim().split('\n').map(line => {
      const [hash, subject, author, date] = line.split('|');
      return { hash, subject, author, date };
    });
  } catch (e) {
    addLog('error', `❌ 获取提交失败: ${e.message}`);
    throw new Error(`获取提交失败: ${e.message}`);
  }
}

/**
 * 获取分支的代码差异
 * @param {string} repoPath - 仓库路径
 * @param {string} branchName - 分支名称
 * @returns {Promise<string>} 差异内容
 */
export async function getBranchCodeDiff(repoPath, branchName) {
  validateBranchName(branchName);
  
  try {
    // Check if branch exists locally or remotely
    let targetBranch = branchName;
    const { stdout: branchCheck } = await execAsync(`git branch --list "${branchName}"`, { cwd: repoPath });
    
    if (!branchCheck.trim()) {
      const { stdout: remoteCheck } = await execAsync(`git branch -r --list "origin/${branchName}"`, { cwd: repoPath });
      if (!remoteCheck.trim()) {
        throw new Error(`Branch "${branchName}" does not exist`);
      }
      targetBranch = `origin/${branchName}`;
    }

    // Detect which base branches exist
    const baseBranches = await detectBaseBranches(repoPath);
    let baseBranch;
    
    if (baseBranches.length === 0) {
      // No base branch found, use first commit as base
      const { stdout: firstCommit } = await execAsync(
        `git rev-list --max-parents=0 HEAD`,
        { cwd: repoPath }
      );
      baseBranch = firstCommit.trim().split('\n')[0];
      if (!baseBranch) {
        throw new Error('No base branch or commits found');
      }
    } else {
      // Use main if available, otherwise master
      baseBranch = baseBranches.includes('main') ? 'main' : baseBranches[0];
    }

    // Get diff between base and this branch
    const { stdout } = await execAsync(
      `git diff ${baseBranch}...${targetBranch} --stat && echo "===DIFF===" && git diff ${baseBranch}...${targetBranch}`,
      { cwd: repoPath, maxBuffer: 1024 * 1024 * 50 }
    );

    // Truncate if too large
    if (stdout.length > 100000) {
      return stdout.substring(0, 100000) + '\n\n[... 内容已截断 ...]';
    }
    return stdout;
  } catch (e) {
    addLog('error', `❌ 获取代码差异失败: ${e.message}`);
    throw new Error(`获取代码差异失败: ${e.message}`);
  }
}

/**
 * 构建同步提示词
 * @param {string} docType - 文档类型
 * @param {string} currentDoc - 当前文档内容
 * @param {Array} commits - 提交记录
 * @param {string} codeDiff - 代码差异
 * @param {Object} config - 配置对象
 * @returns {string} 提示词
 */
export function buildSyncPrompt(docType, currentDoc, commits, codeDiff, config) {
  const docTypeName = docType === 'requirement' ? '需求文档' : '技术文档';
  const commitList = commits.map(c => `- ${c.hash.substring(0, 7)} ${c.subject} (${c.author}, ${c.date})`).join('\n');
  const template = getPrompt(config, 'sync');

  return template
    .replace(/\{docTypeName\}/g, docTypeName)
    .replace(/\{currentDoc\}/g, currentDoc)
    .replace(/\{commitList\}/g, commitList)
    .replace(/\{codeDiff\}/g, codeDiff)
    .replace(/\{date\}/g, new Date().toISOString().split('T')[0])
    .replace(/\{commitCount\}/g, String(commits.length));
}

/**
 * 解析同步响应
 * @param {string} content - AI 响应内容
 * @returns {{updatedDocument: string, changes: string[], additions: string[]}}
 */
export function parseSyncResponse(content) {
  // Extract the document content (everything before the sync log section)
  const syncLogMatch = content.match(/---\s*\n\s*## 📝 同步记录/);
  
  let updatedDocument = content;
  let changes = [];
  let additions = [];

  if (syncLogMatch) {
    updatedDocument = content.substring(0, syncLogMatch.index + 3); // Include the ---
    const syncLog = content.substring(syncLogMatch.index);
    
    // Parse changes from sync log
    const changesMatch = syncLog.match(/### 本次同步内容：\s*\n([\s\S]*?)(?=###|$)/);
    if (changesMatch) {
      changes = changesMatch[1].split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().match(/^\d+\./))
        .map(line => line.replace(/^[\d.\-\s]+/, '').trim())
        .filter(Boolean);
    }

    const additionsMatch = syncLog.match(/### 详细变更：\s*\n([\s\S]*?)$/);
    if (additionsMatch) {
      additions = additionsMatch[1].split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(Boolean);
    }
  }

  return {
    updatedDocument,
    changes,
    additions,
  };
}

/**
 * 构建同步日志
 * @param {string} docType - 文档类型
 * @param {Array} commits - 提交记录
 * @param {Object} syncResult - 同步结果
 * @returns {string} 日志内容
 */
export function buildSyncLog(docType, commits, syncResult) {
  const docTypeName = docType === 'requirement' ? '需求文档' : '技术文档';
  const now = new Date().toISOString();
  
  return `# ${docTypeName}同步日志

**同步时间**: ${now}
**文档类型**: ${docTypeName}
**提交数量**: ${commits.length} 个

## 同步的提交

${commits.map(c => `- \`${c.hash.substring(0, 7)}\` ${c.subject} (${c.author}, ${c.date})`).join('\n')}

## 本次同步内容

${syncResult.changes.map(c => `- ${c}`).join('\n') || '无变更'}

## 详细变更

${syncResult.additions.map(a => `- ${a}`).join('\n') || '无详细变更'}

---
*此日志由 docs-viewer 自动生成*
`;
}
