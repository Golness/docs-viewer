/**
 * 需求分析引擎
 * 分析需求文档，生成 .meta.json 元数据
 * 
 * 所有 LLM 调用统一委托给 DSH Subagent
 */

import { join } from 'node:path';
import { loadConfig } from './config.js';
import { readRequirementDocs, writeMetaJson } from './doc-reader.js';
import { validateMeta } from './meta.js';
import { executeTask } from './task-executor.js';
import { parseAIResponse } from './ai-engine.js';
import { log } from './logger.js';

/**
 * 分析单个需求文档，生成 .meta.json
 * 
 * @param {Object} options
 * @param {Object} options.ctx - DSH 上下文
 * @param {Object} options.llm - LLM 服务
 * @param {Object} options.config - 配置
 * @param {Object} options.parentAgent - 父 Agent（DSH 会话）
 * @param {string} options.reqPath - 需求目录的完整路径
 * @param {string} options.requirementId - 需求 ID
 * @param {string} options.cwd - 工作目录
 * @param {Object} [options.scopedSkills] - 可选的 scoped skills
 * @returns {Promise<{success: boolean, meta?: Object, error?: string, elapsed?: number}>}
 */
export async function analyzeRequirement(options) {
  const { ctx, llm, config, parentAgent, reqPath, requirementId, cwd, scopedSkills } = options;
  const startTime = Date.now();

  try {
    // 1. 读取文档
    const docsContent = await readRequirementDocs(reqPath);
    if (!docsContent) {
      return { success: false, error: '无支持的文档文件' };
    }

    // 2. 委托 Subagent 分析
    const variables = {
      requirementId,
      docsContent,
    };

    const result = await executeTask(ctx, llm, config, {
      promptKey: 'analyze',
      variables,
      parentAgent,
      cwd,
      scopedSkills,
      description: `分析需求文档: ${requirementId}`,
    });

    if (result.isError) {
      throw new Error(result.diagnostic || '分析失败');
    }

    // 3. 解析和验证
    const parsed = parseAIResponse(result.output);
    const validated = validateMeta(parsed);

    // 4. 检查结果有效性
    if (!parsed || typeof parsed !== 'object' || (!parsed.summary && !parsed.features?.length && parsed.type === 'unknown')) {
      return { success: false, error: '分析结果无效：未能提取有效的需求信息' };
    }

    // 5. 写入 .meta.json（注意：writeMetaJson 需要文件路径）
    const metaFilePath = join(reqPath, '.meta.json');
    await writeMetaJson(metaFilePath, validated);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.analysis.info(`分析完成: ${requirementId} (${elapsed}s)`);

    return { success: true, meta: validated, elapsed };
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.analysis.error(`分析失败: ${requirementId} - ${e.message}`);
    return { success: false, error: e.message, elapsed };
  }
}
