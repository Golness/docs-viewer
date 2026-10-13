/**
 * 分阶段同步引擎
 * 将同步过程拆分为：代码差异分析 → 讨论差异分析 → 增量合并
 * 支持大内容分块处理
 * 
 * 所有 LLM 调用统一委托给 DSH Subagent
 */

import { getPrompt } from './prompts.js';
import { log } from './logger.js';
import { executeTask } from './task-executor.js';
import { tokensToChars, charsToTokens, estimateTextTokens, CHARS_PER_TOKEN } from './token-utils.js';

// 配置常量
const CHUNK_CONFIG = {
  // 总输入最大 token 数（200k）
  maxTotalTokens: 200000,
  // 每个 chunk 的目标 token 数
  maxChunkTokens: 20000, // 约 80k 字符
  // 最大文件数限制（单块）
  maxFilesPerChunk: 10,
  // 最大消息数限制（单块）
  maxMessagesPerChunk: 50,
};

/**
 * 计算文本 token 数
 */
function countTokens(text) {
  return charsToTokens(text.length);
}

/**
 * 校验总 token 数是否超限
 * @returns {{ valid: boolean, totalTokens: number, message?: string }}
 */
function validateTotalTokens(items, getType) {
  let totalTokens = 0;
  
  for (const item of items) {
    if (getType === 'file') {
      totalTokens += countTokens(item.content);
    } else if (getType === 'message') {
      totalTokens += estimateTextTokens(item.text || '');
    }
  }
  
  if (totalTokens > CHUNK_CONFIG.maxTotalTokens) {
    return {
      valid: false,
      totalTokens,
      message: `总内容约 ${Math.round(totalTokens / 1000)}k tokens，超过 200k token 限制，请减少内容或选择更少文件/会话`,
    };
  }
  
  return { valid: true, totalTokens };
}

/**
 * 智能分块：按 token 数限制分块
 * 
 * @param {Array} items - 文件或消息数组
 * @param {string} type - 'file' | 'message'
 * @param {Object} options
 * @param {number} options.maxTokens - 每块最大 token 数
 * @param {number} options.maxItems - 每块最大数量
 * @returns {Array} 分块结果
 */
function smartChunk(items, type, options = {}) {
  const { maxTokens = CHUNK_CONFIG.maxChunkTokens, maxItems = type === 'file' ? CHUNK_CONFIG.maxFilesPerChunk : CHUNK_CONFIG.maxMessagesPerChunk } = options;
  
  if (!items || items.length === 0) {
    return [];
  }
  
  const chunks = [];
  let currentChunk = {
    items: [],
    tokens: 0,
    details: [], // 用于前端展示
  };
  
  for (const item of items) {
    const itemTokens = type === 'file' 
      ? countTokens(item.content) 
      : estimateTextTokens(item.text || '');
    
    // 检查是否需要新开一块
    const needNewChunk = 
      currentChunk.tokens + itemTokens > maxTokens || 
      currentChunk.items.length >= maxItems;
    
    if (needNewChunk && currentChunk.items.length > 0) {
      // 保存当前块
      chunks.push({
        items: currentChunk.items,
        tokens: currentChunk.tokens,
        details: currentChunk.details,
        index: chunks.length,
      });
      
      // 开新块
      currentChunk = {
        items: [],
        tokens: 0,
        details: [],
      };
    }
    
    // 添加到当前块
    currentChunk.items.push(item);
    currentChunk.tokens += itemTokens;
    
    // 记录详情
    if (type === 'file') {
      currentChunk.details.push({
        type: 'file',
        file: item.file,
        tokens: itemTokens,
        lines: item.content.split('\n').length,
      });
    } else {
      currentChunk.details.push({
        type: 'message',
        role: item.role,
        tokens: itemTokens,
        preview: (item.text || '').substring(0, 100),
        time: item.time,
      });
    }
  }
  
  // 保存最后一块
  if (currentChunk.items.length > 0) {
    chunks.push({
      items: currentChunk.items,
      tokens: currentChunk.tokens,
      details: currentChunk.details,
      index: chunks.length,
    });
  }
  
  // 添加块元信息
  const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);
  chunks.forEach((chunk, i) => {
    chunk.index = i;
    chunk.total = chunks.length;
    chunk.totalTokens = totalTokens;
  });
  
  return chunks;
}

/**
 * 将代码 diff 解析为文件数组
 */
function parseDiffToFiles(codeDiff) {
  const files = [];
  let currentFile = null;
  let currentContent = [];
  
  const lines = codeDiff.split('\n');
  
  for (const line of lines) {
    // 检测新的文件 diff 开始
    if (line.startsWith('diff --git')) {
      if (currentFile && currentContent.length > 0) {
        const content = currentContent.join('\n');
        files.push({
          file: currentFile,
          content,
          tokens: countTokens(content),
        });
      }
      // 提取文件名
      const match = line.match(/diff --git a\/(.+?) b\/(.+?)(?:\s|$)/);
      currentFile = match ? match[2] : line;
      currentContent = [line];
    } else if (line.startsWith('+++ b/')) {
      if (currentFile && currentContent.length === 1) {
        // 更新文件名
        currentFile = line.substring(6);
      }
      currentContent.push(line);
    } else {
      currentContent.push(line);
    }
  }
  
  // 最后一个文件
  if (currentFile && currentContent.length > 0) {
    const content = currentContent.join('\n');
    files.push({
      file: currentFile,
      content,
      tokens: countTokens(content),
    });
  }
  
  return files;
}

/**
 * 智能分块：代码 diff
 */
function chunkCodeDiff(files, maxTokens = CHUNK_CONFIG.maxChunkTokens) {
  return smartChunk(files, 'file', { maxTokens, maxItems: CHUNK_CONFIG.maxFilesPerChunk });
}

/**
 * 智能分块：对话轮次
 */
function chunkTurns(turns, maxTokens = CHUNK_CONFIG.maxChunkTokens) {
  if (!turns || turns.length === 0) {
    return [];
  }
  
  const chunks = [];
  let currentChunk = {
    items: [],
    tokens: 0,
    details: [],
  };
  
  for (const turn of turns) {
    const turnTokens = estimateTextTokens(turn.userInput || '') + estimateTextTokens(turn.summary || '');
    
    // 检查是否需要新开一块
    const needNewChunk = 
      currentChunk.tokens + turnTokens > maxTokens || 
      currentChunk.items.length >= CHUNK_CONFIG.maxMessagesPerChunk;
    
    if (needNewChunk && currentChunk.items.length > 0) {
      // 保存当前块
      chunks.push({
        items: currentChunk.items,
        tokens: currentChunk.tokens,
        details: currentChunk.details,
        index: chunks.length,
      });
      
      // 开新块
      currentChunk = {
        items: [],
        tokens: 0,
        details: [],
      };
    }
    
    // 添加到当前块
    currentChunk.items.push(turn);
    currentChunk.tokens += turnTokens;
    
    // 记录详情
    currentChunk.details.push({
      type: 'turn',
      turnNumber: turn.turnNumber,
      tokens: turnTokens,
      userInputPreview: (turn.userInput || '').substring(0, 100),
      time: turn.time,
    });
  }
  
  // 保存最后一块
  if (currentChunk.items.length > 0) {
    chunks.push({
      items: currentChunk.items,
      tokens: currentChunk.tokens,
      details: currentChunk.details,
      index: chunks.length,
    });
  }
  
  // 添加块元信息
  const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);
  chunks.forEach((chunk, i) => {
    chunk.index = i;
    chunk.total = chunks.length;
    chunk.totalTokens = totalTokens;
  });
  
  return chunks;
}

/**
 * 阶段 1：代码差异分析（支持分块）
 * 返回模板变量，由 executeTask 使用配置中的 prompt 模板
 */
export function buildCodeAnalysisVariables(docType, currentDoc, commits, codeDiff, config, chunkInfo = null, hasUncommitted = false) {
  // 处理提交记录
  let commitList = '';
  if (commits && commits.length > 0) {
    commitList = commits.map(c => 
      `- ${c.hash.substring(0, 7)} ${c.subject} (${c.author}, ${c.date})`
    ).join('\n');
  }

  const chunkLabel = chunkInfo 
    ? `（第 ${chunkInfo.current}/${chunkInfo.total} 部分，共 ${chunkInfo.fileCount} 个文件）`
    : '';
  
  return {
    currentDoc: currentDoc || '(空文档)',
    commitList: commitList || '(无提交记录)',
    codeDiff: codeDiff || '(无代码变更)',
    chunkLabel,
    chunkSuffix: chunkInfo ? ` (${chunkInfo.current}/${chunkInfo.total})` : '',
    hasUncommittedNote: hasUncommitted ? '\n\n**重要提示**: 代码变更中包含未提交的修改，这些是最新变更，请重点关注。' : '',
  };
}

/**
 * 代码差异分析合并 - 模板变量
 */
export function buildCodeAnalysisMergeVariables(docType, partialAnalyses, config) {
  return {
    analysisCount: partialAnalyses.length,
    analysisContent: partialAnalyses.map((a, i) => `### 片段 ${i + 1}\n${a}`).join('\n\n---\n\n'),
  };
}

/**
 * 讨论差异分析 - 模板变量
 */
export function buildDiscussionAnalysisVariables(docType, currentDoc, turns, config, chunkInfo = null) {
  // 使用轮次数据构建内容
  const sessionContent = turns.map(t => {
    const userInput = t.userInput || '(无用户输入)';
    const summary = t.summary || '(无助手回复)';
    return `### 轮次 ${t.turnNumber}
**用户输入**:
${userInput}

**助手回复摘要**:
${summary}`;
  }).join('\n\n');

  return {
    currentDoc: currentDoc || '(空文档)',
    sessionContent,
    chunkLabel: chunkInfo ? `（第 ${chunkInfo.current}/${chunkInfo.total} 部分）` : '',
    chunkSuffix: chunkInfo ? ` (${chunkInfo.current}/${chunkInfo.total})` : '',
  };
}

/**
 * 讨论差异分析合并 - 模板变量
 */
export function buildDiscussionAnalysisMergeVariables(docType, partialAnalyses, config) {
  return {
    analysisCount: partialAnalyses.length,
    analysisContent: partialAnalyses.map((a, i) => `### 片段 ${i + 1}\n${a}`).join('\n\n---\n\n'),
  };
}

/**
 * 文档合并 - 模板变量
 */
export function buildMergeVariables(docType, originalDoc, codeDoc, discussionDoc, config) {
  const date = new Date().toLocaleDateString('zh-CN');
  
  return {
    originalDoc: originalDoc || '(空文档)',
    codeDoc: codeDoc || '(无代码差异)',
    discussionDoc: discussionDoc || '(无讨论差异)',
    date,
  };
}

/**
 * 分阶段同步引擎类
 */
export class PhasedSyncEngine {
  /**
   * @param {Object} options
   * @param {Object} options.llm - LLM 服务（用于获取 provider 信息，不直接调用）
   * @param {Object} options.config - 配置对象
   * @param {string} options.cwd - 工作目录
   * @param {Object} options.ctx - DSH Context（用于 subagent）
   * @param {Object} options.parentAgent - 父 Agent（用于 subagent 委托）
   */
  constructor(options) {
    this.llm = options.llm;
    this.config = options.config;
    this.cwd = options.cwd;
    this.ctx = options.ctx;
    this.parentAgent = options.parentAgent;
  }

  /**
   * 执行分阶段同步
   */
  async sync(options) {
    const {
      docType,
      currentDoc,
      commits,
      codeDiff,
      sessionTurns, // 改为轮次数据
      hasUncommitted,
      onProgress,
    } = options;

    const result = {
      codeAnalysis: null,
      discussionAnalysis: null,
      mergedDoc: null,
      stats: {
        codeChunks: 0,
        discussionChunks: 0,
        totalLLMCalls: 0,
        totalCodeTokens: 0,
        totalDiscussionTokens: 0,
      },
      chunks: {
        code: null,
        discussion: null,
      },
      errors: [],
    };

    // 解析内容并计算 token
    let codeFiles = [];
    let turns = sessionTurns || [];
    
    // 解析代码 diff 为文件
    if (codeDiff) {
      codeFiles = parseDiffToFiles(codeDiff);
    }
    
    // 计算总 token（使用轮次数据）
    const codeTokens = codeFiles.reduce((sum, f) => sum + f.tokens, 0);
    const discussionTokens = turns.reduce((sum, t) => sum + estimateTextTokens(t.userInput || '') + estimateTextTokens(t.summary || ''), 0);
    
    result.stats.totalCodeTokens = codeTokens;
    result.stats.totalDiscussionTokens = discussionTokens;

    // ═══════════════════════════════════════════════════════════
    // 阶段 1：代码差异分析
    // ═══════════════════════════════════════════════════════════
    try {
      await onProgress?.({ 
        phase: 'code_analysis', 
        status: 'started',
        codeTokens,
        codeFiles: codeFiles.length,
      });
      
      if (codeFiles.length === 0) {
        await onProgress?.({ phase: 'code_analysis', status: 'skipped', reason: '无代码变更' });
      } else {
        // 智能分块：按 token 数限制分块
        const chunks = chunkCodeDiff(codeFiles, CHUNK_CONFIG.maxChunkTokens);
        result.stats.codeChunks = chunks.length;
        result.chunks.code = chunks; // 保存分块信息供前端展示
        
        // 通知前端分块信息
        await onProgress?.({ 
          phase: 'code_analysis', 
          status: 'chunked',
          chunks: chunks.map(c => ({
            index: c.index,
            tokens: c.tokens,
            files: c.details.map(d => ({ file: d.file, tokens: d.tokens })),
          })),
          totalChunks: chunks.length,
          totalTokens: codeTokens,
        });
        
        if (chunks.length > 1) {
          await onProgress?.({ 
            phase: 'code_analysis', 
            status: 'chunking',
            message: `代码变更较大，分成 ${chunks.length} 块处理`,
            totalChunks: chunks.length,
          });
        }
        
        // 逐块分析
        const partialAnalyses = [];
        for (const chunk of chunks) {
          const chunkContent = chunk.items.map(f => f.content).join('\n');
          const chunkInfo = {
            current: chunk.index + 1,
            total: chunk.total,
            fileCount: chunk.items.length,
            tokens: chunk.tokens,
          };
          
          await onProgress?.({ 
            phase: 'code_analysis', 
            status: 'processing_chunk',
            chunk: chunk.index + 1,
            total: chunks.length,
            message: `分析第 ${chunk.index + 1}/${chunks.length} 块代码`,
            chunkInfo: {
              tokens: chunk.tokens,
              files: chunk.details,
            },
          });
          
          // 使用模板变量
          const variables = buildCodeAnalysisVariables(docType, currentDoc, commits, chunkContent, this.config, chunkInfo, hasUncommitted);
          const promptKey = `phased-code-analysis-${docType}`;
          const analysis = await this.executeTask(promptKey, variables);
          partialAnalyses.push(analysis);
          result.stats.totalLLMCalls++;
        }
        
        // 合并多个分析结果
        if (partialAnalyses.length > 1) {
          await onProgress?.({ 
            phase: 'code_analysis', 
            status: 'merging_chunks',
            message: `合并 ${partialAnalyses.length} 个代码差异分析结果`
          });
          
          // 合并分析也需要模板化，使用 10 分钟超时
          const mergeVariables = buildCodeAnalysisMergeVariables(docType, partialAnalyses);
          result.codeAnalysis = await this.executeTask(
            `phased-code-analysis-merge-${docType}`, 
            mergeVariables,
            { timeout: 600000 } // 10 分钟
          );
          result.stats.totalLLMCalls++;
        } else {
          result.codeAnalysis = partialAnalyses[0];
        }
      }
      
      await onProgress?.({ phase: 'code_analysis', status: 'completed', content: result.codeAnalysis });
    } catch (e) {
      log.phasedSync.error(`代码差异分析失败: ${e.message}`);
      result.errors.push({ phase: 'code_analysis', error: e.message });
      await onProgress?.({ phase: 'code_analysis', status: 'failed', error: e.message });
    }

    // ═══════════════════════════════════════════════════════════
    // 阶段 2：讨论差异分析
    // ═══════════════════════════════════════════════════════════
    try {
      await onProgress?.({ phase: 'discussion_analysis', status: 'started' });
      
      if (turns.length === 0) {
        await onProgress?.({ phase: 'discussion_analysis', status: 'skipped', reason: '无相关讨论记录' });
      } else {
        // 智能分块：按 token 数限制分块（使用轮次数据）
        const chunks = chunkTurns(turns, CHUNK_CONFIG.maxChunkTokens);
        result.stats.discussionChunks = chunks.length;
        result.chunks.discussion = chunks; // 保存分块信息供前端展示
        
        // 通知前端分块信息
        await onProgress?.({ 
          phase: 'discussion_analysis', 
          status: 'chunked',
          chunks: chunks.map(c => ({
            index: c.index,
            tokens: c.tokens,
            turns: c.details.map(d => ({ 
              turnNumber: d.turnNumber,
              tokens: d.tokens, 
              userInputPreview: d.userInputPreview,
            })),
          })),
          totalChunks: chunks.length,
          totalTokens: discussionTokens,
        });
        
        if (chunks.length > 1) {
          await onProgress?.({ 
            phase: 'discussion_analysis', 
            status: 'chunking',
            message: `讨论记录较大，分成 ${chunks.length} 块处理`,
            totalChunks: chunks.length,
          });
        }
        
        // 逐块分析
        const partialAnalyses = [];
        for (const chunk of chunks) {
          const chunkInfo = {
            current: chunk.index + 1,
            total: chunk.total,
            tokens: chunk.tokens,
          };
          
          await onProgress?.({ 
            phase: 'discussion_analysis', 
            status: 'processing_chunk',
            chunk: chunk.index + 1,
            total: chunks.length,
            message: `分析第 ${chunk.index + 1}/${chunks.length} 块对话`,
            chunkInfo: {
              tokens: chunk.tokens,
              turns: chunk.details,
            },
          });
          
          // 使用模板变量
          const variables = buildDiscussionAnalysisVariables(docType, currentDoc, chunk.items, this.config, chunkInfo);
          const promptKey = `phased-discussion-analysis-${docType}`;
          const analysis = await this.executeTask(promptKey, variables);
          partialAnalyses.push(analysis);
          result.stats.totalLLMCalls++;
        }
        
        // 合并多个分析结果
        if (partialAnalyses.length > 1) {
          await onProgress?.({ 
            phase: 'discussion_analysis', 
            status: 'merging_chunks',
            message: `合并 ${partialAnalyses.length} 个讨论差异分析结果`
          });
          
          // 使用模板变量
          const mergeVariables = buildDiscussionAnalysisMergeVariables(docType, partialAnalyses);
          result.discussionAnalysis = await this.executeTask(`phased-discussion-analysis-merge-${docType}`, mergeVariables);
          result.stats.totalLLMCalls++;
        } else {
          result.discussionAnalysis = partialAnalyses[0];
        }
      }
      
      await onProgress?.({ phase: 'discussion_analysis', status: 'completed', content: result.discussionAnalysis });
    } catch (e) {
      log.phasedSync.error(`讨论差异分析失败: ${e.message}`);
      result.errors.push({ phase: 'discussion_analysis', error: e.message });
      await onProgress?.({ phase: 'discussion_analysis', status: 'failed', error: e.message });
    }

    // ═══════════════════════════════════════════════════════════
    // 阶段 3：增量合并
    // ═══════════════════════════════════════════════════════════
    try {
      if (result.codeAnalysis || result.discussionAnalysis) {
        await onProgress?.({ phase: 'merge', status: 'started' });
        
        // 使用模板变量
        const mergeVariables = buildMergeVariables(
          docType,
          currentDoc,
          result.codeAnalysis || '',
          result.discussionAnalysis || '',
          this.config
        );
        
        result.mergedDoc = await this.executeTask(`phased-merge-${docType}`, mergeVariables);
        result.stats.totalLLMCalls++;
        
        await onProgress?.({ phase: 'merge', status: 'completed', content: result.mergedDoc });
      } else {
        await onProgress?.({ phase: 'merge', status: 'skipped', reason: '无分析结果需要合并' });
      }
    } catch (e) {
      log.phasedSync.error(`合并失败: ${e.message}`);
      result.errors.push({ phase: 'merge', error: e.message });
      await onProgress?.({ phase: 'merge', status: 'failed', error: e.message });
    }

    return result;
  }

  /**
   * 执行任务（统一通过 TaskExecutor）
   * 使用配置中的 prompt 模板 + 变量
   */
  async executeTask(promptKey, variables, options = {}) {
    if (!this.parentAgent) {
      throw new Error('缺少父 Agent，无法执行任务');
    }
    if (!this.ctx?.subagents) {
      throw new Error('Subagent 服务不可用');
    }

    // 合并步骤内容量大，给更长的超时时间
    const isMerge = promptKey.includes('-merge-');
    const timeout = options.timeout || (isMerge ? 600000 : 300000); // 合并 10 分钟，普通 5 分钟

    const result = await executeTask(this.ctx, this.llm, this.config, {
      promptKey,
      variables,  // 模板变量
      parentAgent: this.parentAgent,
      cwd: this.cwd,
      description: `分阶段同步: ${promptKey}`,
      timeout,
    });

    if (result.isError) {
      throw new Error(result.diagnostic || '任务执行失败');
    }

    return result.output;
  }
}










