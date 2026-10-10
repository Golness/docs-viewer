/**
 * AI 引擎模块
 * 负责 LLM 调用和响应解析
 */

import { getPrompt } from './prompts.js';
import { addLog } from './logger.js';

/**
 * 调用 LLM 进行推理
 * @param {Object} llm - LLM 服务实例
 * @param {string} prompt - 用户提示
 * @param {Object} config - 配置对象
 * @param {Object} options - 选项
 * @param {string} options.systemPrompt - 系统提示
 * @param {Function} options.onStream - 流式回调
 * @returns {Promise<string>} LLM 响应文本
 */
export async function callLLM(llm, prompt, config, options = {}) {
  const { systemPrompt: customSystemPrompt, onStream } = options;
  const aiConfig = config.ai || {};
  const temperature = aiConfig.temperature ?? 0.3;
  const maxTokens = aiConfig.maxTokens ?? 4000;

  // Get available providers from DSH global config
  let providers;
  try {
    providers = await llm.listProviders();
  } catch (e) {
    addLog('error', `❌ 获取 providers 失败: ${e.message}`);
    providers = [];
  }
  
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error('No LLM providers available. Please configure an LLM provider in DSH settings.');
  }

  // Use the first available provider
  const firstProvider = providers[0];
  const providerId = firstProvider.id || firstProvider.name || firstProvider;
  const providerName = firstProvider.name || firstProvider.id || firstProvider;
  
  if (!providerId || typeof providerId !== 'string') {
    throw new Error(`Invalid provider: ${JSON.stringify(firstProvider)}`);
  }
  
  // Get all available models
  let availableModels = [];
  try {
    const models = await llm.listModels(providerId);
    if (Array.isArray(models) && models.length > 0) {
      availableModels = models.map(m => m.id || m.name || m);
    } else {
      throw new Error(`No models available for provider ${providerId}`);
    }
  } catch (e) {
    addLog('warning', `⚠️ 无法获取模型列表: ${e.message}`);
  }

  // Use selectedModel from config directly, or fallback to first available model
  let model = aiConfig.selectedModel;
  addLog('info', `📋 配置的模型: ${model || '(未配置)'}`);
  
  if (!model) {
    // No model configured, use first available
    if (availableModels.length > 0) {
      model = availableModels[0];
      addLog('info', `ℹ️ 未配置模型，使用第一个可用模型: ${model}`);
    } else {
      const defaultModels = {
        'deepseek': 'deepseek-chat',
        'openai': 'gpt-4',
        'anthropic': 'claude-3-opus-20240229',
        'google': 'gemini-pro',
      };
      model = defaultModels[providerId] || 'default';
      addLog('warning', `⚠️ 无法获取模型列表，使用默认模型: ${model}`);
    }
  } else {
    addLog('info', `✅ 使用配置的模型: ${model}`);
  }

  addLog('info', `🤖 使用模型: ${providerName}/${model}`);

  // Create messages in the correct format for DSH LLM
  const systemPrompt = customSystemPrompt || getPrompt(config, 'analyze');
  const userPrompt = prompt;

  // Create the content array explicitly
  const userContent = [];
  userContent.push({ type: 'text', text: userPrompt });

  // Define variables outside try block
  let content = '';
  let finishReason = null;

  try {
    const stream = llm.stream({
      provider: providerId,
      model,
      system: systemPrompt,  // System prompt as separate parameter
      messages: [
        { 
          role: 'user', 
          content: userContent  // Send as array
        },
      ],
      temperature,
      maxTokens,
    });

    let chunkCount = 0;
    for await (const chunk of stream) {
      chunkCount++;
      if (chunk.type === 'text-delta' || chunk.type === 'delta') {
        const text = chunk.text || chunk.delta?.text || '';
        content += text;
        // Call onStream callback if provided (for ai-search progress display)
        if (onStream && chunkCount % 3 === 0) {
          onStream(content, chunkCount);
        }
      } else if (chunk.type === 'finish') {
        finishReason = chunk.reason;
      }
    }
    
    addLog('info', `✅ LLM 调用完成, ${chunkCount} chunks, ${content.length} chars`);
  } catch (e) {
    addLog('error', `❌ LLM stream 错误: ${e.message}`);
    throw e;
  }

  // 5.13: max-tokens truncation warning
  if (finishReason?.kind === 'max-tokens') {
    addLog('warning', '⚠️ AI 输出被截断，建议增加 maxTokens 配置');
  }
  if (finishReason?.kind === 'error') {
    throw new Error(`LLM error: ${finishReason.failure?.message || 'unknown error'}`);
  }

  return content;
}

/**
 * 解析 AI 响应（JSON 格式）
 * @param {string} text - AI 响应文本
 * @returns {Object|null} 解析后的对象或 null
 */
export function parseAIResponse(text) {
  // Level 1: direct parse
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Level 2: extract from ```json code block
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch { /* continue */ }
  }

  // Level 3: try to find any JSON object in the text
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch { /* continue */ }
  }

  // Level 4: return defaults
  addLog('warning', '⚠️ AI 输出无法解析为 JSON，使用默认值');
  return null;
}
