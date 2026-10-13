/**
 * 任务执行器模块
 * 所有 LLM 任务统一委托给 DSH Subagent 执行
 * 
 * 设计理念：
 * 1. 所有需要 LLM 的地方都通过 subagent 委托
 * 2. Skill 作为指令层，Prompt 作为数据层
 * 3. Subagent 自动拥有 DSH 全套工具能力
 */

import { parseAIResponse } from './ai-engine.js';
import { getPromptAsync, buildFullPrompt, PROMPT_REGISTRY } from './prompts.js';
import { log } from './logger.js';
import { stat } from 'node:fs/promises';
import { charsToTokens, estimateTextTokens, formatTokens, CHARS_PER_TOKEN } from './token-utils.js';

/**
 * 任务执行器错误码
 */
export const TaskExecutorErrorCode = {
  // 一、前置条件
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  MISSING_PARENT_AGENT: 'MISSING_PARENT_AGENT',
  PARENT_AGENT_STOPPED: 'PARENT_AGENT_STOPPED',
  PARENT_AGENT_NOT_RUNNING: 'PARENT_AGENT_NOT_RUNNING',
  PARENT_AGENT_NO_SESSION: 'PARENT_AGENT_NO_SESSION',
  SUBAGENT_UNAVAILABLE: 'SUBAGENT_UNAVAILABLE',
  TASK_CANCELLED: 'TASK_CANCELLED',
  INVALID_PROMPT_KEY: 'INVALID_PROMPT_KEY',
  EMPTY_USER_PROMPT: 'EMPTY_USER_PROMPT',
  INVALID_CWD: 'INVALID_CWD',
  INVALID_AGENT_OPTIONS: 'INVALID_AGENT_OPTIONS',
  
  // 二、Skill/Prompt
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  SKILL_CONTENT_EMPTY: 'SKILL_CONTENT_EMPTY',
  SKILL_TOO_LARGE: 'SKILL_TOO_LARGE',
  TEMPLATE_VARIABLE_MISSING: 'TEMPLATE_VARIABLE_MISSING',
  TEMPLATE_RENDER_FAILED: 'TEMPLATE_RENDER_FAILED',
  
  // 三、Provider
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  PROVIDER_CAPABILITY_MISSING: 'PROVIDER_CAPABILITY_MISSING',
  MAX_DEPTH_REACHED: 'MAX_DEPTH_REACHED',
  SUBAGENT_POOL_FULL: 'SUBAGENT_POOL_FULL',
  START_TIMEOUT: 'START_TIMEOUT',
  
  // 四、执行
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  EXECUTION_INTERRUPTED: 'EXECUTION_INTERRUPTED',
  MAX_TOKENS_REACHED: 'MAX_TOKENS_REACHED',
  REFUSAL: 'REFUSAL',
  
  // 五、资源
  DISPOSE_FAILED: 'DISPOSE_FAILED',
};

/**
 * 任务执行器配置
 */
export const TaskExecutorConfig = {
  // 默认 provider
  defaultProvider: 'spawn',
  // 默认 agent options
  defaultAgentOptions: {
    provider: undefined,  // 继承父 agent
    model: undefined,     // 继承父 agent
    maxTokens: 8000,
  },
  // 默认超时（毫秒）
  defaultTimeout: 300000, // 5 分钟
  // 最小超时
  minTimeout: 30000,
  // 最大超时
  maxTimeout: 600000, // 10 分钟
  // Skill 最大 token 数
  maxSkillTokens: 25000, // 约 100k 字符
  // Prompt 最大 token 数
  maxPromptTokens: 50000, // 约 200k 字符
};

/**
 * 任务执行器错误
 */
export class TaskExecutorError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'TaskExecutorError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 任务执行结果
 */
export class TaskResult {
  constructor(options) {
    this.success = options.success ?? true;
    this.output = options.output || '';
    this.structured = options.structured || null;
    this.deliverables = options.deliverables || [];
    this.sessionId = options.sessionId || null;
    this.stopReason = options.stopReason || 'completed';
    this.diagnostic = options.diagnostic || null;
    this.skillUsed = options.skillUsed || null;
    this.elapsed = options.elapsed || 0;
    this.errorCode = options.errorCode || null;
    this.warnings = options.warnings || [];
  }

  get isError() {
    return !this.success || this.stopReason !== 'completed';
  }

  toSimpleString() {
    return this.output;
  }
  
  /**
   * 获取用户友好的错误提示
   */
  getUserMessage() {
    if (!this.isError) {
      return '任务执行成功';
    }
    
    switch (this.stopReason) {
      case 'aborted':
        return '任务被中断';
      case 'max-tokens':
        return '输出达到长度限制，请尝试增加 maxTokens 配置';
      case 'refusal':
        return '模型拒绝执行此任务，请检查任务描述是否合规';
      case 'error':
        return this.diagnostic || '执行过程中发生错误';
      default:
        return this.diagnostic || '任务执行失败';
    }
  }
}

/**
 * 任务执行器
 */
export class TaskExecutor {
  /**
   * @param {Object} options
   * @param {Object} options.ctx - DSH Context（包含 subagents 等服务）
   * @param {Object} options.llm - LLM 服务（用于获取 provider 信息，不直接调用）
   * @param {Object} options.config - 插件配置
   * @param {Object} options.parentAgent - 父 Agent（用于 subagent 委托，必需）
   * @param {string} options.cwd - 工作目录
   * @param {AbortSignal} options.signal - 取消信号
   * @param {Object} options.callbacks - 回调函数
   */
  constructor(options) {
    this.ctx = options.ctx;
    this.llm = options.llm;
    this.config = options.config || {};
    this.parentAgent = options.parentAgent;
    this.cwd = options.cwd;
    this.signal = options.signal || new AbortController().signal;
    this.scopedSkills = options.scopedSkills;
    this.callbacks = options.callbacks || {};
    this.warnings = [];
  }

  /**
   * 添加警告
   */
  addWarning(code, message) {
    this.warnings.push({ code, message, timestamp: Date.now() });
    log.taskExecutor.warn(message, { code });
  }

  /**
   * 执行任务（统一通过 Subagent）
   */
  async execute(options) {
    const { promptKey, variables = {}, description, agentOptions, timeout } = options;
    const startTime = Date.now();
    this.warnings = [];

    // 回调：任务开始
    this.callbacks.onStart?.({
      promptKey,
      description: description || promptKey,
      timestamp: Date.now()
    });

    // ====== 一、前置条件验证 ======
    const validationErrors = await this.validatePreconditions(options);
    if (validationErrors.length > 0) {
      const firstError = validationErrors[0];
      const result = new TaskResult({
        success: false,
        stopReason: 'error',
        diagnostic: firstError.message,
        errorCode: firstError.code,
        elapsed: Date.now() - startTime,
        warnings: this.warnings,
      });
      
      this.callbacks.onError?.({ error: firstError, result });
      return result;
    }

    log.taskExecutor.info(`任务执行`, {
      promptKey,
      description: description || promptKey,
      hasParentAgent: !!this.parentAgent,
      timeout: timeout || TaskExecutorConfig.defaultTimeout,
    });

    return this.executeViaSubagent(options, startTime);
  }

  /**
   * 一、验证前置条件
   */
  async validatePreconditions(options) {
    const errors = [];

    // 1.1 Context 验证
    if (!this.ctx) {
      errors.push({
        code: TaskExecutorErrorCode.INVALID_CONTEXT,
        message: 'Context 不可用，无法委托任务',
      });
      return errors;
    }

    if (!this.ctx.subagents) {
      errors.push({
        code: TaskExecutorErrorCode.SUBAGENT_UNAVAILABLE,
        message: 'Subagent 服务不可用',
      });
      return errors;
    }

    // ctx.skills 不可用时记录警告
    if (!this.ctx.skills) {
      this.addWarning('SKILLS_UNAVAILABLE', 'Skills 服务不可用，Skill 绑定将被忽略');
    }

    // 1.2 Agent 验证
    if (!this.parentAgent) {
      errors.push({
        code: TaskExecutorErrorCode.MISSING_PARENT_AGENT,
        message: '缺少父 Agent，无法委托任务',
      });
      return errors;
    }

    // 检查 Agent 状态
    const status = this.parentAgent.status;
    if (status === 'stopped') {
      errors.push({
        code: TaskExecutorErrorCode.PARENT_AGENT_STOPPED,
        message: `父 Agent 已停止，当前状态: ${status}`,
        details: { status },
      });
      return errors;
    }
    
    // 注意：idle 状态也是可以执行任务的，只有 stopped 才是真正的错误
    // 因为父 agent 可能处于 idle 状态等待新的任务

    // 检查 Agent 是否有 session
    if (!this.parentAgent.session) {
      errors.push({
        code: TaskExecutorErrorCode.PARENT_AGENT_NO_SESSION,
        message: '父 Agent 没有 session',
      });
      return errors;
    }

    // 1.3 参数验证
    // promptKey 验证
    if (options.promptKey && !PROMPT_REGISTRY[options.promptKey]) {
      // promptKey 不在注册表中，但允许自定义 promptKey
      this.addWarning('UNKNOWN_PROMPT_KEY', `promptKey "${options.promptKey}" 不在预设列表中`);
    }

    // 1.4 必需变量验证
    const variableErrors = this.validateRequiredVariables(options.promptKey, options.variables || {});
    if (variableErrors.length > 0) {
      // 必需变量缺失是错误，不是警告
      for (const err of variableErrors) {
        errors.push(err);
      }
      return errors;
    }

    // Signal 取消检查
    if (this.signal?.aborted) {
      errors.push({
        code: TaskExecutorErrorCode.TASK_CANCELLED,
        message: '任务已被取消',
      });
      return errors;
    }

    // cwd 验证
    if (this.cwd) {
      try {
        await stat(this.cwd);
      } catch (e) {
        errors.push({
          code: TaskExecutorErrorCode.INVALID_CWD,
          message: `工作目录不存在: ${this.cwd}`,
          details: { cwd: this.cwd, error: e.message },
        });
        return errors;
      }
    }

    // 1.4 配置验证
    const delegationConfig = this.config?.ai?.delegation;
    if (!delegationConfig) {
      this.addWarning('NO_DELEGATION_CONFIG', '未配置 delegation，使用默认值');
    }

    // agentOptions 验证
    if (options.agentOptions) {
      const { provider, model, maxTokens } = options.agentOptions;
      if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens <= 0)) {
        errors.push({
          code: TaskExecutorErrorCode.INVALID_AGENT_OPTIONS,
          message: 'agentOptions.maxTokens 必须是正数',
          details: { maxTokens },
        });
      }
    }

    return errors;
  }

  /**
   * 二、Skill/Prompt 加载
   */
  async loadPrompt(options) {
    const { promptKey, variables = {} } = options;
    const result = {
      fullPrompt: '',
      skillUsed: null,
      skillContent: null,
      promptTemplate: null,
    };

    // 加载 Skill + Prompt 组合
    try {
      this.callbacks.onProgress?.({ stage: 'skill_loading', promptKey });

      const promptResult = await getPromptAsync(this.config, promptKey, this.cwd, this.scopedSkills);
      const { systemPrompt, promptTemplate, skillUsed } = promptResult;

      result.skillUsed = skillUsed;
      result.skillContent = systemPrompt;
      result.promptTemplate = promptTemplate;

      log.taskExecutor.debug(`加载 prompt`, {
        promptKey,
        hasTemplate: !!promptTemplate,
        templateLength: promptTemplate?.length || 0,
        variablesCount: Object.keys(variables).length,
      });

      // Skill 验证
      if (skillUsed && systemPrompt) {
        // Skill 内容为空
        if (systemPrompt.trim().length === 0) {
          this.addWarning('SKILL_CONTENT_EMPTY', `Skill "${skillUsed}" 内容为空`);
          result.skillContent = null;
          result.skillUsed = null;
        }
        // Skill 内容过大
        else if (charsToTokens(systemPrompt.length) > TaskExecutorConfig.maxSkillTokens) {
          this.addWarning('SKILL_TOO_LARGE', `Skill "${skillUsed}" 内容过大 (约 ${formatTokens(charsToTokens(systemPrompt.length))} tokens)，可能影响性能`);
        }
      }

      this.callbacks.onProgress?.({ 
        stage: 'skill_loaded', 
        skillUsed,
        hasSkill: !!skillUsed,
      });

    } catch (e) {
      // Skill 加载失败
      this.addWarning('SKILL_LOAD_FAILED', `Skill 加载失败: ${e.message}`);
      log.taskExecutor.warn(`Skill/Prompt 加载失败: ${e.message}`);
    }

    // 构建完整 prompt
    let fullPrompt = '';
    
    if (result.promptTemplate) {
      try {
        // 检查模板变量
        const variableErrors = this.validateTemplateVariables(result.promptTemplate, variables);
        if (variableErrors.length > 0) {
          this.addWarning('TEMPLATE_VARIABLE_MISSING', `模板变量缺失: ${variableErrors.join(', ')}`);
          log.taskExecutor.warn(`模板变量缺失: ${variableErrors.join(', ')}`);
        }

        fullPrompt = buildFullPrompt({ 
          systemPrompt: result.skillContent || '', 
          promptTemplate: result.promptTemplate, 
          variables 
        });
        
        log.taskExecutor.debug(`构建 prompt 完成`, {
          promptKey,
          fullPromptLength: fullPrompt.length,
          fullPromptTokens: charsToTokens(fullPrompt.length),
        });
      } catch (e) {
        this.addWarning('TEMPLATE_RENDER_FAILED', `模板渲染失败: ${e.message}`);
        log.taskExecutor.error(`模板渲染失败: ${e.message}`);
      }
    } else {
      // 没有模板，这是错误
      const errorMsg = `promptKey "${promptKey}" 没有对应的模板`;
      this.addWarning('NO_TEMPLATE', errorMsg);
      log.taskExecutor.error(errorMsg);
    }

    // 如果有 Skill，嵌入到 prompt 中
    if (result.skillContent) {
      fullPrompt = this.buildSubagentPrompt(fullPrompt, {
        skillContent: result.skillContent,
        skillName: result.skillUsed,
      });
    }

    // 检查 prompt 是否为空
    if (!fullPrompt || fullPrompt.trim().length === 0) {
      log.taskExecutor.error(`构建的 prompt 为空`, { promptKey, variables });
    }

    // 检查 prompt token 数
    if (charsToTokens(fullPrompt.length) > TaskExecutorConfig.maxPromptTokens) {
      this.addWarning('PROMPT_TOO_LARGE', `Prompt 过长 (约 ${formatTokens(charsToTokens(fullPrompt.length))} tokens)`);
    }

    result.fullPrompt = fullPrompt;
    return result;
  }

  /**
   * 验证模板变量
   * 检查模板中使用的变量是否都已提供
   */
  validateTemplateVariables(template, variables) {
    const missing = [];
    const variablePattern = /\{(\w+)\}/g;
    let match;
    
    while ((match = variablePattern.exec(template)) !== null) {
      const varName = match[1];
      if (!(varName in variables)) {
        missing.push(varName);
      }
    }
    
    return missing;
  }

  /**
   * 验证必需变量
   * 根据 PROMPT_REGISTRY 中定义的必需变量检查
   */
  validateRequiredVariables(promptKey, variables) {
    const errors = [];
    const promptMeta = PROMPT_REGISTRY[promptKey];
    
    if (!promptMeta || !promptMeta.variables) {
      return errors;
    }
    
    // 检查必需变量
    for (const varDef of promptMeta.variables) {
      if (varDef.required) {
        if (!(varDef.name in variables) || variables[varDef.name] === undefined || variables[varDef.name] === '') {
          errors.push({
            code: 'MISSING_REQUIRED_VARIABLE',
            message: `缺少必需变量: ${varDef.name} (${varDef.description})`,
            details: { variable: varDef.name, description: varDef.description },
          });
        }
      }
    }
    
    return errors;
  }

  /**
   * 三、Subagent 启动
   */
  async startSubagent(options, promptData) {
    const { promptKey, description, agentOptions, timeout } = options;
    const { fullPrompt, skillUsed } = promptData;

    // 获取 provider
    const provider = this.config?.ai?.delegation?.provider || TaskExecutorConfig.defaultProvider;

    // 检查 provider 可用性
    const providerInstance = this.ctx.subagents.getProvider(provider);
    if (!providerInstance) {
      const availableProviders = this.ctx.subagents.list() || [];
      throw new TaskExecutorError(
        `Subagent provider "${provider}" 未注册，可用: ${availableProviders.join(', ') || '(无)'}`,
        TaskExecutorErrorCode.PROVIDER_NOT_FOUND,
        { availableProviders }
      );
    }

    // 3.1 Provider 能力检查
    const capabilities = providerInstance.capabilities || {};
    
    if (agentOptions && !capabilities.agentOptions) {
      throw new TaskExecutorError(
        `Provider "${provider}" 不支持 agentOptions`,
        TaskExecutorErrorCode.PROVIDER_CAPABILITY_MISSING,
        { capability: 'agentOptions', available: Object.keys(capabilities) }
      );
    }

    if (options.outputSchema && !capabilities.outputSchema) {
      this.addWarning('OUTPUT_SCHEMA_UNSUPPORTED', `Provider "${provider}" 不支持 outputSchema，将被忽略`);
    }

    if (options.toolFilter && !capabilities.toolFilter) {
      this.addWarning('TOOL_FILTER_UNSUPPORTED', `Provider "${provider}" 不支持 toolFilter，将被忽略`);
    }

    // 3.2 检查深度限制
    const maxDepth = this.config?.ai?.delegation?.maxDepth;
    if (maxDepth !== undefined && maxDepth <= 0) {
      throw new TaskExecutorError(
        '已达到最大委托深度',
        TaskExecutorErrorCode.MAX_DEPTH_REACHED,
        { maxDepth }
      );
    }

    // 回调：Subagent 启动中
    this.callbacks.onProgress?.({ 
      stage: 'subagent_starting', 
      provider,
    });

    log.taskExecutor.info(`启动 Subagent`, {
      provider,
      description: description || promptKey,
      skillUsed,
      promptLength: fullPrompt.length,
    });

    // 合并 agent options，过滤掉 undefined 值（避免覆盖父 agent 的 provider/model）
    const mergedAgentOptions = Object.fromEntries(
      Object.entries({
        ...TaskExecutorConfig.defaultAgentOptions,
        ...this.config?.ai?.delegation?.agentOptions,
        ...agentOptions,
      }).filter(([_, v]) => v !== undefined)
    );

    // 启动 subagent
    const startPromise = this.ctx.subagents.start(provider, {
      label: description || promptKey,
      prompt: [{ type: 'text', text: fullPrompt }],
      parent: this.parentAgent,
      signal: this.signal,
      ...Object.values(mergedAgentOptions).some(v => v !== undefined) ? { agentOptions: mergedAgentOptions } : {},
    });

    // 设置启动超时
    const startTimeoutMs = 30000; // 30 秒启动超时
    const startTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new TaskExecutorError(
        `Subagent 启动超时 (${startTimeoutMs}ms)`,
        TaskExecutorErrorCode.START_TIMEOUT
      )), startTimeoutMs);
    });

    try {
      const run = await Promise.race([startPromise, startTimeoutPromise]);
      return { run, provider };
    } catch (e) {
      if (e.code === TaskExecutorErrorCode.START_TIMEOUT) {
        throw e;
      }
      // 检查是否是池满错误
      if (e.message?.includes('pool') || e.message?.includes('maxActiveSubagents')) {
        throw new TaskExecutorError(
          'Subagent 池已满，无法创建新的子代理',
          TaskExecutorErrorCode.SUBAGENT_POOL_FULL,
          { originalError: e.message }
        );
      }
      throw e;
    }
  }

  /**
   * 四、Subagent 执行
   */
  async executeSubagent(run, options) {
    const { timeout } = options;
    const sessionId = run.id;

    // 回调：Subagent 执行中
    this.callbacks.onProgress?.({ 
      stage: 'executing', 
      sessionId,
    });

    log.taskExecutor.debug(`Subagent 已启动`, { sessionId });

    // 设置执行超时
    const timeoutMs = Math.min(
      Math.max(timeout || TaskExecutorConfig.defaultTimeout, TaskExecutorConfig.minTimeout),
      TaskExecutorConfig.maxTimeout
    );
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new TaskExecutorError(
        `执行超时 (${timeoutMs}ms)`,
        TaskExecutorErrorCode.EXECUTION_TIMEOUT
      )), timeoutMs);
    });

    // 等待结果（带超时）
    const result = await Promise.race([
      run.result,
      timeoutPromise,
    ]);

    // 记录原始结果 - 使用 info 级别确保能看到
    log.taskExecutor.info(`Subagent 原始结果`, {
      stopReason: result.stopReason,
      hasOutput: !!result.output,
      outputType: result.output ? (Array.isArray(result.output) ? 'array' : typeof result.output) : 'null',
      outputLength: result.output ? (Array.isArray(result.output) ? result.output.length : result.output.length) : 0,
      hasDiagnostic: !!result.diagnostic,
      diagnostic: result.diagnostic ? result.diagnostic.substring(0, 500) : null,
      hasError: !!result.error,
      errorMessage: result.error?.message,
    });

    return { result, sessionId };
  }

  /**
   * 通过 Subagent 执行
   */
  async executeViaSubagent(options, startTime) {
    const { promptKey, description } = options;
    let run = null;

    try {
      // ====== 二、Skill/Prompt 加载 ======
      const promptData = await this.loadPrompt(options);

      // ====== 三、Subagent 启动 ======
      const startResult = await this.startSubagent(options, promptData);
      run = startResult.run;
      const { provider } = startResult;

      // ====== 四、Subagent 执行 ======
      const execResult = await this.executeSubagent(run, options);
      const { result, sessionId } = execResult;

      // 提取输出
      const output = this.extractOutput(result.output);
      
      // 记录详细结果
      log.taskExecutor.debug(`Subagent 执行结果`, {
        stopReason: result.stopReason,
        outputLength: output.length,
        hasDiagnostic: !!result.diagnostic,
        diagnostic: result.diagnostic,
        structured: result.structured ? Object.keys(result.structured) : null,
        rawOutputType: result.output ? (Array.isArray(result.output) ? 'array' : typeof result.output) : 'null',
        rawOutputLength: result.output ? result.output.length : 0,
      });

      // 回调：交付物收集中
      this.callbacks.onProgress?.({ 
        stage: 'collecting_deliverables', 
      });

      // ====== 六、交付物收集 ======
      const deliverables = await this.collectDeliverables(sessionId);

      const elapsed = Date.now() - startTime;

      log.taskExecutor.info(`Subagent 完成`, {
        sessionId,
        stopReason: result.stopReason,
        elapsed,
        outputLength: output.length,
        deliverablesCount: deliverables.length,
        diagnostic: result.diagnostic,
        structured: result.structured ? Object.keys(result.structured) : null,
      });

      const taskResult = new TaskResult({
        success: result.stopReason === 'completed',
        output,
        structured: result.structured,
        deliverables,
        sessionId,
        stopReason: result.stopReason,
        diagnostic: result.diagnostic,
        skillUsed: promptData.skillUsed,
        elapsed,
        errorCode: this.getErrorCodeFromStopReason(result.stopReason),
        warnings: this.warnings,
      });

      // ====== 九、监控诊断 ======
      this.recordMetrics(taskResult, provider, promptKey);

      // 回调：任务完成
      this.callbacks.onComplete?.({ result: taskResult });

      return taskResult;
    } catch (e) {
      const elapsed = Date.now() - startTime;
      
      const errorCode = e instanceof TaskExecutorError 
        ? e.code 
        : TaskExecutorErrorCode.EXECUTION_ERROR;

      log.taskExecutor.error(`Subagent 执行失败: ${e.message}`, { 
        code: errorCode,
        stack: e.stack,
        elapsed,
      });

      const result = new TaskResult({
        success: false,
        output: '',
        diagnostic: e.message,
        stopReason: 'error',
        elapsed,
        errorCode,
        warnings: this.warnings,
      });

      // ====== 九、监控诊断 ======
      this.recordMetrics(result, null, promptKey);

      // 回调：错误
      this.callbacks.onError?.({ error: e, result });

      return result;
    } finally {
      // ====== 五、资源释放 ======
      await this.disposeRun(run);
    }
  }

  /**
   * 五、资源释放
   */
  async disposeRun(run) {
    if (!run) return;

    try {
      await run.dispose();
      log.taskExecutor.debug(`Subagent 资源已释放`);
    } catch (disposeError) {
      log.taskExecutor.warn(`资源释放失败: ${disposeError.message}`);
      // 不抛出错误，只记录警告
    }
  }

  /**
   * 从 stopReason 获取错误码
   */
  getErrorCodeFromStopReason(stopReason) {
    switch (stopReason) {
      case 'completed':
        return null;
      case 'aborted':
        return TaskExecutorErrorCode.EXECUTION_INTERRUPTED;
      case 'max-tokens':
        return TaskExecutorErrorCode.MAX_TOKENS_REACHED;
      case 'refusal':
        return TaskExecutorErrorCode.REFUSAL;
      case 'error':
      default:
        return TaskExecutorErrorCode.EXECUTION_ERROR;
    }
  }

  /**
   * 提取输出文本
   */
  extractOutput(outputBlocks) {
    if (!Array.isArray(outputBlocks) || outputBlocks.length === 0) {
      log.taskExecutor.warn(`Subagent 输出为空`);
      return '';
    }

    // 提取文本块
    const textOutput = outputBlocks
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // 记录非文本块
    const nonTextBlocks = outputBlocks.filter(block => block.type !== 'text');
    if (nonTextBlocks.length > 0) {
      log.taskExecutor.debug(`Subagent 输出包含非文本块`, {
        types: nonTextBlocks.map(b => b.type),
      });
    }

    return textOutput;
  }

  /**
   * 构建 Subagent Prompt
   */
  buildSubagentPrompt(userPrompt, options) {
    const { skillContent, skillName } = options;

    if (skillContent) {
      return `
<skill_content name="${skillName}">
${skillContent}
</skill_content>

---

## 任务数据

${userPrompt}

---

## 执行要求

1. 遵循上述 Skill 指令执行任务
2. 如果需要创建文件，使用 \`present\` 工具声明交付物
3. 返回完整的结果
`;
    }

    return userPrompt;
  }

  /**
   * 六、交付物收集
   */
  async collectDeliverables(sessionId) {
    const deliverables = [];

    if (!this.ctx?.sessionQuery) {
      log.taskExecutor.debug(`sessionQuery 不可用，跳过交付物收集`);
      return deliverables;
    }

    try {
      const observation = await this.ctx.sessionQuery.observeSession(sessionId);
      if (!observation) {
        log.taskExecutor.warn(`无法观察 session: ${sessionId}`);
        return deliverables;
      }
      
      if (observation?.events) {
        for (const event of observation.events) {
          if (event.type === 'deliverables/presented') {
            const files = event.data?.files || [];
            deliverables.push(...files);
            log.taskExecutor.debug(`发现交付物`, { count: files.length });
          }
        }
      }
    } catch (e) {
      log.taskExecutor.warn(`收集交付物失败: ${e.message}`);
    }

    return deliverables;
  }

  /**
   * 九、监控诊断 - 记录指标
   */
  recordMetrics(result, provider, promptKey) {
    // 性能指标
    const metrics = {
      timestamp: Date.now(),
      promptKey,
      provider,
      success: result.success,
      elapsed: result.elapsed,
      stopReason: result.stopReason,
      errorCode: result.errorCode,
      outputLength: result.output?.length || 0,
      deliverablesCount: result.deliverables?.length || 0,
      warningsCount: result.warnings?.length || 0,
    };

    // 记录到日志
    log.taskExecutor.info(`任务指标`, metrics);

    // TODO: 可以发送到外部监控系统
    // this.callbacks.onMetrics?.(metrics);
  }
}

/**
 * 创建任务执行器（工厂函数）
 */
export function createTaskExecutor(options) {
  return new TaskExecutor(options);
}

/**
 * 便捷方法：执行任务
 */
export async function executeTask(ctx, llm, config, options) {
  const executor = new TaskExecutor({
    ctx,
    llm,
    config,
    parentAgent: options.parentAgent,
    cwd: options.cwd,
    signal: options.signal,
    scopedSkills: options.scopedSkills,
    callbacks: options.callbacks,
  });

  return executor.execute(options);
}

/**
 * 便捷方法：执行并解析 JSON 结果
 */
export async function executeAndParse(ctx, llm, config, options) {
  const result = await executeTask(ctx, llm, config, options);

  if (result.isError) {
    return { success: false, error: result.diagnostic || result.output, result };
  }

  const parsed = parseAIResponse(result.output);
  return { success: true, data: parsed, result };
}













