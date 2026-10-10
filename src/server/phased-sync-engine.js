/**
 * 分阶段同步引擎
 * 将同步过程拆分为：代码分析 → 对话分析 → 增量合并
 * 支持大内容分块处理
 */

import { getPrompt } from './prompts.js';
import { addLog } from './logger.js';

// 配置常量
const CHUNK_CONFIG = {
  // LLM 上下文限制（保守估计，预留输出空间）
  maxInputTokens: 100000,
  // 每个 chunk 的目标大小（字符数，约 1 token ≈ 3-4 字符）
  maxChunkChars: 80000,
  // 代码 diff 每个 chunk 的最大文件数
  maxFilesPerChunk: 10,
  // 会话消息每个 chunk 的最大轮数
  maxMessagesPerChunk: 50,
};

/**
 * 将大内容拆分成多个块
 */
function splitIntoChunks(content, maxChars) {
  if (content.length <= maxChars) {
    return [content];
  }
  
  const chunks = [];
  let remaining = content;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }
    
    // 尝试在合适的位置分割（换行符、段落等）
    let splitIndex = remaining.lastIndexOf('\n\n', maxChars);
    if (splitIndex === -1 || splitIndex < maxChars * 0.5) {
      splitIndex = remaining.lastIndexOf('\n', maxChars);
    }
    if (splitIndex === -1 || splitIndex < maxChars * 0.5) {
      splitIndex = maxChars;
    }
    
    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex);
  }
  
  return chunks;
}

/**
 * 将代码 diff 按文件拆分成多个块
 */
function splitDiffByFiles(codeDiff, maxFilesPerChunk) {
  // 解析 diff，按文件分割
  const fileSections = [];
  let currentFile = null;
  let currentContent = [];
  
  const lines = codeDiff.split('\n');
  
  for (const line of lines) {
    // 检测新的文件 diff 开始
    if (line.startsWith('diff --git') || line.startsWith('+++ b/')) {
      if (currentFile && currentContent.length > 0) {
        fileSections.push({
          file: currentFile,
          content: currentContent.join('\n')
        });
      }
      currentFile = line;
      currentContent = [line];
    } else {
      currentContent.push(line);
    }
  }
  
  // 最后一个文件
  if (currentFile && currentContent.length > 0) {
    fileSections.push({
      file: currentFile,
      content: currentContent.join('\n')
    });
  }
  
  // 按 maxFilesPerChunk 分组
  const chunks = [];
  for (let i = 0; i < fileSections.length; i += maxFilesPerChunk) {
    const group = fileSections.slice(i, i + maxFilesPerChunk);
    const chunkContent = group.map(g => g.content).join('\n');
    const fileList = group.map(g => g.file).join('\n');
    chunks.push({
      content: chunkContent,
      fileList,
      fileCount: group.length,
    });
  }
  
  return chunks;
}

/**
 * 将会话消息按轮数拆分成多个块
 */
function splitMessagesByTurns(messages, maxMessagesPerChunk) {
  if (messages.length <= maxMessagesPerChunk) {
    return [messages];
  }
  
  const chunks = [];
  for (let i = 0; i < messages.length; i += maxMessagesPerChunk) {
    chunks.push(messages.slice(i, i + maxMessagesPerChunk));
  }
  
  return chunks;
}

/**
 * 阶段 1：代码视角分析（支持分块）
 */
export function buildCodeAnalysisPrompt(docType, currentDoc, commits, codeDiff, config, chunkInfo = null) {
  const docTypeName = docType === 'requirement' ? '需求文档' : '技术文档';
  const commitList = commits.map(c => 
    `- ${c.hash.substring(0, 7)} ${c.subject} (${c.author}, ${c.date})`
  ).join('\n');

  const chunkLabel = chunkInfo 
    ? `\n\n**注意**: 这是代码变更的第 ${chunkInfo.current}/${chunkInfo.total} 部分（共 ${chunkInfo.fileCount} 个文件）`
    : '';

  return `你是一个代码分析专家。请从代码变更的角度，分析以下代码 diff，提取与${docTypeName}相关的信息。${chunkLabel}

## 当前${docTypeName}
\`\`\`markdown
${currentDoc}
\`\`\`

## 分支提交记录
${commitList}

## 代码变更
\`\`\`diff
${codeDiff}
\`\`\`

## 任务
请从代码实现的角度，分析有哪些功能/接口/字段的变更。

### 要求：
1. **只关注代码能体现的信息**：不要猜测代码中没有的内容
2. **提取结构化信息**：
   - 新增的功能点
   - 新增/修改的接口（名称、参数、返回值）
   - 新增/修改的数据库字段
   - 新增的配置项
3. **保持客观**：只描述代码做了什么，不要解释为什么
4. **输出格式**：Markdown 格式，按类别组织

### 输出格式：
\`\`\`markdown
# 代码视角分析${chunkInfo ? ` (第 ${chunkInfo.current}/${chunkInfo.total} 部分)` : ''}

## 新增功能
- [功能1描述]
- [功能2描述]

## 接口变更
### [接口名称]
- 类型：新增/修改
- 方法：GET/POST/PUT/DELETE
- 路径：/api/xxx
- 参数：...
- 返回值：...

## 字段变更
- [表名].[字段名]：[类型] - [说明]

## 配置变更
- [配置项]：[说明]
\`\`\`

请直接输出分析结果，不要包含其他解释。`;
}

/**
 * 合并多个代码分析结果
 */
export function buildCodeAnalysisMergePrompt(docType, partialAnalyses, config) {
  const docTypeName = docType === 'requirement' ? '需求文档' : '技术文档';
  
  const partialDocs = partialAnalyses.map((analysis, i) => 
    `### 第 ${i + 1} 部分分析结果\n\`\`\`markdown\n${analysis}\n\`\`\``
  ).join('\n\n');

  return `你是一个代码分析专家。请将以下多个代码分析结果合并成一个完整的分析文档。

## 任务
将多个部分的代码分析结果合并，去除重复，整合相关信息。

${partialDocs}

## 要求：
1. **去除重复**：相同的功能/接口/字段只保留一次
2. **整合信息**：如果多个部分提到同一个功能，合并它们的描述
3. **保持结构**：按功能、接口、字段、配置分类组织
4. **输出格式**：Markdown 格式

请直接输出合并后的完整分析结果。`;
}

/**
 * 阶段 2：对话视角分析（支持分块）
 * 从 DSH 会话中提取需求背景、设计决策等信息
 */
export function buildDiscussionAnalysisPrompt(docType, currentDoc, sessionMessages, config, chunkInfo = null) {
  const docTypeName = docType === 'requirement' ? '需求文档' : '技术文档';
  
  // 格式化会话内容
  const sessionContent = sessionMessages.map(m => {
    const role = m.role === 'user' ? '用户' : 'AI';
    return `**${role}**: ${m.text}`;
  }).join('\n\n');

  const chunkLabel = chunkInfo 
    ? `\n\n**注意**: 这是讨论记录的第 ${chunkInfo.current}/${chunkInfo.total} 部分`
    : '';

  return `你是一个需求分析专家。请从讨论记录的角度，提取与${docTypeName}相关的信息。${chunkLabel}

## 当前${docTypeName}
\`\`\`markdown
${currentDoc}
\`\`\`

## 讨论记录
${sessionContent}

## 任务
请从讨论记录中，提取与${docTypeName}相关的信息。

### 要求：
1. **只关注讨论中明确提到的信息**：不要猜测或推断
2. **提取以下类型的信息**：
   - 需求背景和业务目标
   - 设计决策和技术选型
   - 功能优先级和排期
   - 约束条件和注意事项
   - 待确认的问题
3. **标注信息来源**：每条信息标注来自哪次讨论
4. **输出格式**：Markdown 格式，按类别组织

### 输出格式：
\`\`\`markdown
# 对话视角分析${chunkInfo ? ` (第 ${chunkInfo.current}/${chunkInfo.total} 部分)` : ''}

## 需求背景
- [背景描述]（来源：[会话ID/时间]）

## 设计决策
### [决策主题]
- 决策：[选择了什么]
- 原因：[为什么这样选择]
- 备选方案：[考虑过哪些其他方案]
（来源：[会话ID/时间]）

## 功能优先级
- P0：[功能列表]
- P1：[功能列表]
- P2：[功能列表]

## 约束条件
- [约束1]
- [约束2]

## 待确认问题
- [ ] [问题1]
- [ ] [问题2]
\`\`\`

请直接输出分析结果，不要包含其他解释。`;
}

/**
 * 合并多个对话分析结果
 */
export function buildDiscussionAnalysisMergePrompt(docType, partialAnalyses, config) {
  const docTypeName = docType === 'requirement' ? '需求文档' : '技术文档';
  
  const partialDocs = partialAnalyses.map((analysis, i) => 
    `### 第 ${i + 1} 部分分析结果\n\`\`\`markdown\n${analysis}\n\`\`\``
  ).join('\n\n');

  return `你是一个需求分析专家。请将以下多个对话分析结果合并成一个完整的分析文档。

## 任务
将多个部分的对话分析结果合并，去除重复，整合相关信息。

${partialDocs}

## 要求：
1. **去除重复**：相同的需求背景/设计决策只保留一次
2. **整合信息**：如果多个部分提到同一个决策，合并它们的描述
3. **保持结构**：按背景、决策、优先级、约束分类组织
4. **保留来源**：保留每条信息的来源标注
5. **输出格式**：Markdown 格式

请直接输出合并后的完整分析结果。`;
}

/**
 * 阶段 3：增量合并
 * 对比原文档和两个视角文档，生成最终文档和变更记录
 */
export function buildMergePrompt(docType, originalDoc, codeDoc, discussionDoc, config) {
  const docTypeName = docType === 'requirement' ? '需求文档' : '技术文档';

  return `你是一个文档工程师。请将两份分析结果合并到原${docTypeName}中。

## 原${docTypeName}
\`\`\`markdown
${originalDoc}
\`\`\`

## 代码视角分析
\`\`\`markdown
${codeDoc}
\`\`\`

## 对话视角分析
\`\`\`markdown
${discussionDoc}
\`\`\`

## 任务
请将代码视角和对话视角的分析结果，合并到原${docTypeName}中。

### 要求：
1. **保持原文档结构**：尽量在原文档的基础上插入/更新内容
2. **新增内容标注来源**：
   - 来自代码分析的内容标注 \\[来源: 代码\\]
   - 来自对话分析的内容标注 \\[来源: 讨论\\]
3. **处理冲突**：如果代码和对话有冲突，以代码为准，但保留对话中的背景说明
4. **追加变更记录**：在文档末尾追加详细的变更记录

### 输出格式：
第一部分：更新后的完整文档（Markdown 格式）

第二部分：变更记录（追加在文档末尾）
\`\`\`markdown
---

## 📝 同步记录

**同步时间**: ${new Date().toISOString()}
**同步类型**: 分阶段同步（代码 + 对话）

### 本次同步内容

#### 来自代码分析
- [变更1]
- [变更2]

#### 来自对话分析
- [变更1]
- [变更2]

### 详细变更

| 位置 | 变更类型 | 变更内容 | 来源 |
|------|----------|----------|------|
| [章节] | 新增/修改/删除 | [描述] | 代码/讨论 |

### 未合并的内容
- [如果有分析结果但无法合并的内容，列在这里]
\`\`\`

请直接输出完整的文档内容和变更记录。`;
}

/**
 * 解析分阶段同步的响应
 */
export function parseMergeResponse(content) {
  // 查找同步记录的分隔符
  const syncLogMatch = content.match(/---\s*\n\s*## 📝 同步记录/);
  
  let updatedDocument = content;
  let syncLog = '';

  if (syncLogMatch) {
    updatedDocument = content.substring(0, syncLogMatch.index + 3);
    syncLog = content.substring(syncLogMatch.index);
  }

  return {
    updatedDocument,
    syncLog,
  };
}

/**
 * 分阶段同步流程控制器（支持大内容分块）
 */
export class PhasedSyncEngine {
  constructor(llm, config) {
    this.llm = llm;
    this.config = config;
  }

  /**
   * 执行分阶段同步（自动处理大内容）
   * @param {Object} params - 同步参数
   * @param {string} params.docType - 文档类型
   * @param {string} params.currentDoc - 当前文档内容
   * @param {Array} params.commits - 提交记录
   * @param {string} params.codeDiff - 代码差异
   * @param {Array} params.sessionMessages - 会话消息
   * @param {Function} params.onProgress - 进度回调
   * @returns {Promise<Object>} 同步结果
   */
  async sync(params) {
    const { docType, currentDoc, commits, codeDiff, sessionMessages, onProgress } = params;
    
    const result = {
      codeAnalysis: null,
      discussionAnalysis: null,
      finalDocument: null,
      syncLog: null,
      stats: {
        codeChunks: 1,
        discussionChunks: 1,
        totalLLMCalls: 0,
      },
      errors: [],
    };

    // 阶段 1：代码分析（支持分块）
    try {
      onProgress?.({ phase: 'code_analysis', status: 'started' });
      
      // 检查是否需要分块
      const needsChunking = codeDiff.length > CHUNK_CONFIG.maxChunkChars;
      
      if (needsChunking) {
        // 分块处理
        const chunks = splitDiffByFiles(codeDiff, CHUNK_CONFIG.maxFilesPerChunk);
        result.stats.codeChunks = chunks.length;
        
        onProgress?.({ 
          phase: 'code_analysis', 
          status: 'chunking',
          message: `代码变更较大，分成 ${chunks.length} 块处理` 
        });
        
        // 逐块分析
        const partialAnalyses = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkInfo = {
            current: i + 1,
            total: chunks.length,
            fileCount: chunk.fileCount,
          };
          
          onProgress?.({ 
            phase: 'code_analysis', 
            status: 'processing_chunk',
            chunk: i + 1,
            total: chunks.length,
            message: `分析第 ${i + 1}/${chunks.length} 块代码`
          });
          
          const prompt = buildCodeAnalysisPrompt(docType, currentDoc, commits, chunk.content, this.config, chunkInfo);
          const analysis = await this.callLLM(prompt);
          partialAnalyses.push(analysis);
          result.stats.totalLLMCalls++;
        }
        
        // 合并多个分析结果
        if (partialAnalyses.length > 1) {
          onProgress?.({ 
            phase: 'code_analysis', 
            status: 'merging_chunks',
            message: `合并 ${partialAnalyses.length} 个代码分析结果`
          });
          
          const mergePrompt = buildCodeAnalysisMergePrompt(docType, partialAnalyses, this.config);
          result.codeAnalysis = await this.callLLM(mergePrompt);
          result.stats.totalLLMCalls++;
        } else {
          result.codeAnalysis = partialAnalyses[0];
        }
      } else {
        // 单块处理
        const prompt = buildCodeAnalysisPrompt(docType, currentDoc, commits, codeDiff, this.config);
        result.codeAnalysis = await this.callLLM(prompt);
        result.stats.totalLLMCalls++;
      }
      
      onProgress?.({ phase: 'code_analysis', status: 'completed', content: result.codeAnalysis });
    } catch (e) {
      addLog('error', `代码分析失败: ${e.message}`);
      result.errors.push({ phase: 'code_analysis', error: e.message });
      onProgress?.({ phase: 'code_analysis', status: 'failed', error: e.message });
    }

    // 阶段 2：对话分析（支持分块）
    try {
      onProgress?.({ phase: 'discussion_analysis', status: 'started' });
      
      // 检查是否需要分块
      const needsChunking = sessionMessages.length > CHUNK_CONFIG.maxMessagesPerChunk;
      
      if (needsChunking) {
        // 分块处理
        const chunks = splitMessagesByTurns(sessionMessages, CHUNK_CONFIG.maxMessagesPerChunk);
        result.stats.discussionChunks = chunks.length;
        
        onProgress?.({ 
          phase: 'discussion_analysis', 
          status: 'chunking',
          message: `讨论记录较大，分成 ${chunks.length} 块处理`
        });
        
        // 逐块分析
        const partialAnalyses = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkInfo = {
            current: i + 1,
            total: chunks.length,
          };
          
          onProgress?.({ 
            phase: 'discussion_analysis', 
            status: 'processing_chunk',
            chunk: i + 1,
            total: chunks.length,
            message: `分析第 ${i + 1}/${chunks.length} 块对话`
          });
          
          const prompt = buildDiscussionAnalysisPrompt(docType, currentDoc, chunk, this.config, chunkInfo);
          const analysis = await this.callLLM(prompt);
          partialAnalyses.push(analysis);
          result.stats.totalLLMCalls++;
        }
        
        // 合并多个分析结果
        if (partialAnalyses.length > 1) {
          onProgress?.({ 
            phase: 'discussion_analysis', 
            status: 'merging_chunks',
            message: `合并 ${partialAnalyses.length} 个对话分析结果`
          });
          
          const mergePrompt = buildDiscussionAnalysisMergePrompt(docType, partialAnalyses, this.config);
          result.discussionAnalysis = await this.callLLM(mergePrompt);
          result.stats.totalLLMCalls++;
        } else {
          result.discussionAnalysis = partialAnalyses[0];
        }
      } else {
        // 单块处理
        const prompt = buildDiscussionAnalysisPrompt(docType, currentDoc, sessionMessages, this.config);
        result.discussionAnalysis = await this.callLLM(prompt);
        result.stats.totalLLMCalls++;
      }
      
      onProgress?.({ phase: 'discussion_analysis', status: 'completed', content: result.discussionAnalysis });
    } catch (e) {
      addLog('error', `对话分析失败: ${e.message}`);
      result.errors.push({ phase: 'discussion_analysis', error: e.message });
      onProgress?.({ phase: 'discussion_analysis', status: 'failed', error: e.message });
    }

    // 阶段 3：增量合并
    try {
      onProgress?.({ phase: 'merge', status: 'started' });
      
      // 如果某个阶段失败，使用空文档
      const codeDoc = result.codeAnalysis || '# 代码视角分析\n\n（分析失败）';
      const discussionDoc = result.discussionAnalysis || '# 对话视角分析\n\n（分析失败）';
      
      const mergePrompt = buildMergePrompt(docType, currentDoc, codeDoc, discussionDoc, this.config);
      const mergeResult = await this.callLLM(mergePrompt);
      result.stats.totalLLMCalls++;
      
      const parsed = parseMergeResponse(mergeResult);
      result.finalDocument = parsed.updatedDocument;
      result.syncLog = parsed.syncLog;
      
      onProgress?.({ phase: 'merge', status: 'completed', content: mergeResult });
    } catch (e) {
      addLog('error', `增量合并失败: ${e.message}`);
      result.errors.push({ phase: 'merge', error: e.message });
      onProgress?.({ phase: 'merge', status: 'failed', error: e.message });
    }

    return result;
  }

  async callLLM(prompt) {
    // 调用 LLM 的通用方法
    const { callLLM } = await import('./ai-engine.js');
    return callLLM(this.llm, prompt, this.config);
  }
}
