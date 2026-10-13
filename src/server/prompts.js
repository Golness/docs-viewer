/**
 * Prompt 管理模块
 * 负责 Prompt 的注册、获取和管理
 * 支持从 DSH skills 加载 prompt
 */

// 缓存 skill 内容
let skillsService = null;
let skillsCache = new Map();

/**
 * 设置 skills 服务引用（由 index.js 调用）
 * @param {Object} skills - DSH skills 服务
 */
export function setSkillsService(skills) {
  skillsService = skills;
  // 清空缓存
  skillsCache.clear();
}

/**
 * 获取 skills 服务
 * @returns {Object|null}
 */
export function getSkillsService() {
  return skillsService;
}

/**
 * 获取可用的 skills 列表
 * @param {string} cwd - 工作目录
 * @returns {Promise<Array<{name: string, description: string}>>}
 */
export async function getAvailableSkills(cwd) {
  if (!skillsService) return [];
  try {
    const skills = await skillsService.list({ cwd });
    return skills.map(s => ({
      name: s.name,
      description: s.description,
      whenToUse: s.whenToUse
    }));
  } catch (e) {
    return [];
  }
}

const DEFAULT_ANALYZE_PROMPT = `你是一个需求分析专家。请分析以下需求文档内容，并返回 JSON 格式的结构化数据。

需求目录名: {requirementId}

以下是需求文档内容:

{docsContent}

返回格式要求（严格 JSON，不要包含其他文字）：
{
  "type": "large" | "medium" | "small",  // 需求规模
  "summary": "一句话摘要",
  "features": ["功能点1", "功能点2"],     // 提取的功能点
  "fields": ["table.field"],              // 涉及的数据库字段
  "tags": ["标签1", "标签2"],             // 关键词标签
  "timeline": [                           // 时间线事件（请提取文档中所有相关的时间节点，不要遗漏）
    {
      "date": "YYYY-MM-DD",
      "title": "事件标题",
      "type": "requirement" | "design" | "cr" | "release",
      "description": "事件描述"
    }
  ]
}

重要提示：
1. timeline 数组必须包含文档中提到的所有时间节点，不要只提取部分事件
2. 如果文档中有多个版本迭代、评审、发布等事件，都要包含在 timeline 中
3. 按时间顺序排列所有事件

请基于文档内容进行全面分析，提取所有关键信息。`;

const DEFAULT_SYNC_PROMPT = `你是一个专业的文档工程师。请根据代码变更来同步{docTypeName}。

## 当前{docTypeName}
\`\`\`markdown
{currentDoc}
\`\`\`

## 分支提交记录
{commitList}

## 代码变更
\`\`\`diff
{codeDiff}
\`\`\`

## 任务
请分析代码变更与当前{docTypeName}的差异，以代码实现为准，更新{docTypeName}。

### 要求：
1. **以代码为准**：如果文档描述与代码实现不一致，以代码为准
2. **补充缺漏**：代码中新增的功能/接口/字段，在文档中补充说明
3. **修正错误**：文档中已废弃或已修改的内容，根据代码进行修正
4. **保持结构**：尽量保持原有文档结构，只修改必要的内容
5. **详细记录**：在文档末尾添加同步记录，说明本次修改的内容

### 输出格式：
请返回完整的更新后的文档内容（Markdown格式），在文档末尾添加：

---

## 📝 同步记录

**同步时间**: {date}
**同步分支**: 当前分支
**提交数量**: {commitCount} 个

### 本次同步内容：
1. [列出本次同步的主要变更]
2. [例如：新增接口说明、修正字段定义、补充功能描述等]

### 详细变更：
- [具体变更1]
- [具体变更2]

请直接返回完整的文档内容，不要包含其他解释。`;

const DEFAULT_TEMPLATE_PROMPT = `基于以下需求目录信息，生成{docTypeName}模板：
目录名：{requirementId}
路径：{path}

请生成完整的 Markdown 文档内容。`;

// ═══════════════════════════════════════════════════════════════
// 分阶段同步 Prompt - 需求文档
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CODE_ANALYSIS_REQUIREMENT_PROMPT = `你是一个资深需求分析师。请对比代码变更与当前需求文档，找出所有差异点。{chunkLabel}

## 当前需求文档
\`\`\`markdown
{currentDoc}
\`\`\`

## 分支提交记录
{commitList}

## 代码变更
\`\`\`diff
{codeDiff}
\`\`\`

## 任务
请逐一对比代码变更与当前需求文档，列出所有**差异点**。只关注代码相对于文档的变化，不需要重写文档。

### 差异点类型：
1. **新增**：代码中实现了文档未提及的功能
2. **修改**：代码实现与文档描述不一致，需要更新
3. **删除/废弃**：文档中描述了但代码已移除或不再使用的功能

### 输出格式（严格遵守，必须输出 Markdown）：

# 代码差异点{chunkSuffix}

## 新增功能

### [功能名称]
**代码位置**：[文件路径/模块]
**功能描述**：[从代码推断的功能说明]
**业务场景**：[推断的使用场景]
**验收标准**：
- Given [前置条件], When [操作], Then [预期结果]

## 需更新内容

### [文档章节/功能名称]
**原文档描述**：[文档中的描述，如果有的话]
**代码实际实现**：[代码中的实际行为]
**差异说明**：[具体差异点]

## 已废弃内容

### [功能名称]
**原文档描述**：[文档中的描述]
**废弃原因**：[从代码推断的原因]

注意：
- 只输出差异点，不要输出完整的文档内容
- 不要包含代码片段，只输出分析结论
- 请直接输出 Markdown 文本，不要用 \`\`\`json 代码块包裹。`;

const DEFAULT_CODE_ANALYSIS_DESIGN_PROMPT = `你是一个资深技术架构师。请对比代码变更与当前技术文档，找出所有差异点。{chunkLabel}

## 当前技术文档
\`\`\`markdown
{currentDoc}
\`\`\`

## 分支提交记录
{commitList}

## 代码变更
\`\`\`diff
{codeDiff}
\`\`\`

## 任务
请逐一对比代码变更与当前技术文档，列出所有**差异点**。只关注代码相对于文档的变化，不需要重写文档。

### 差异点类型：
1. **新增**：代码中实现了文档未提及的接口、数据模型、架构组件
2. **修改**：代码实现与文档描述不一致，需要更新
3. **删除/废弃**：文档中描述了但代码已移除或不再使用的内容

### 输出格式（严格遵守，必须输出 Markdown）：

# 代码差异点{chunkSuffix}

## 新增接口

### [接口名称]
**接口路径**：[METHOD] /api/xxx
**参数变更**：[新增/修改的参数]
**响应变更**：[新增/修改的响应字段]

## 新增数据模型

### [表名/实体名]
**字段说明**：[字段列表及类型]
**关联关系**：[与其他表的关系]

## 需更新内容

### [文档章节/模块名称]
**原文档描述**：[文档中的描述，如果有的话]
**代码实际实现**：[代码中的实际行为]
**差异说明**：[具体差异点]

## 已废弃内容

### [接口/模块名称]
**原文档描述**：[文档中的描述]
**废弃原因**：[从代码推断的原因]

注意：
- 只输出差异点，不要输出完整的文档内容
- 不要包含代码片段，只输出分析结论
- 请直接输出 Markdown 文本，不要用 \`\`\`json 代码块包裹。`;

const DEFAULT_DISCUSSION_ANALYSIS_REQUIREMENT_PROMPT = `你是一个资深需求分析师。请对比讨论记录与当前需求文档，找出所有差异点。{chunkLabel}

## 当前需求文档
\`\`\`markdown
{currentDoc}
\`\`\`

## 讨论记录
{sessionContent}

## 任务
请逐一对比讨论记录与当前需求文档，列出所有**差异点**。只关注讨论中提到的相对于文档的变化，不需要重写文档。

### 差异点类型：
1. **新增**：讨论中提到了文档未提及的需求或功能
2. **修改**：讨论中决定要修改文档中的某些内容
3. **删除/废弃**：讨论中决定移除或不再使用的功能
4. **待确认**：讨论中提出但尚未确定的问题

### 输出格式（严格遵守，必须输出 Markdown）：

# 讨论差异点{chunkSuffix}

## 新增需求

### [需求名称]
**来源**：[轮次/时间]
**需求描述**：[讨论中提到的需求]
**业务价值**：[讨论中提到的价值]

## 需修改内容

### [文档章节/功能名称]
**原文档内容**：[文档中的描述，如果有的话]
**讨论决定**：[讨论中决定的修改]
**修改原因**：[为什么要改]

## 需删除内容

### [功能名称]
**原文档内容**：[文档中的描述]
**删除原因**：[讨论中提到的原因]

## 待确认问题

- [ ] [问题描述] - 影响范围：[哪些功能/章节]

注意：
- 只输出差异点，不要输出完整的文档内容
- 请直接输出 Markdown 文本，不要用 \`\`\`json 代码块包裹。`;

const DEFAULT_DISCUSSION_ANALYSIS_DESIGN_PROMPT = `你是一个资深技术架构师。请对比讨论记录与当前技术文档，找出所有差异点。{chunkLabel}

## 当前技术文档
\`\`\`markdown
{currentDoc}
\`\`\`

## 讨论记录
{sessionContent}

## 任务
请逐一对比讨论记录与当前技术文档，列出所有**差异点**。只关注讨论中提到的相对于文档的变化，不需要重写文档。

### 差异点类型：
1. **新增**：讨论中提到了文档未提及的技术方案、接口、数据模型
2. **修改**：讨论中决定要修改文档中的某些技术设计
3. **删除/废弃**：讨论中决定移除或不再使用的技术方案
4. **待确认**：讨论中提出但尚未确定的技术问题

### 输出格式（严格遵守，必须输出 Markdown）：

# 讨论差异点{chunkSuffix}

## 新增技术方案

### [方案名称]
**来源**：[轮次/时间]
**方案描述**：[讨论中提到的技术方案]
**技术选型**：[讨论中提到的技术选择]

## 需修改内容

### [文档章节/模块名称]
**原文档内容**：[文档中的描述，如果有的话]
**讨论决定**：[讨论中决定的修改]
**修改原因**：[为什么要改]

## 需删除内容

### [接口/模块名称]
**原文档内容**：[文档中的描述]
**删除原因**：[讨论中提到的原因]

## 待确认问题

- [ ] [技术问题描述] - 影响范围：[哪些模块/接口]

注意：
- 只输出差异点，不要输出完整的文档内容
- 请直接输出 Markdown 文本，不要用 \`\`\`json 代码块包裹。`;

// ═══════════════════════════════════════════════════════════════
// 分阶段同步 Prompt - 增量合并
// ═══════════════════════════════════════════════════════════════

const DEFAULT_MERGE_REQUIREMENT_PROMPT = `你是一个资深需求文档工程师。请根据差异点清单更新原需求文档。

## 原需求文档
\`\`\`markdown
{originalDoc}
\`\`\`

## 代码差异点
\`\`\`markdown
{codeDoc}
\`\`\`

## 讨论差异点
\`\`\`markdown
{discussionDoc}
\`\`\`

## 任务
请根据上述差异点清单，对原需求文档进行更新，输出**完整的更新后文档**。

### 重要要求：
1. **直接输出文档内容**：不要说"已完成"、"已保存"、"完成情况总结"等，直接输出完整的 Markdown 文档
2. **输出完整文档**：必须包含所有章节的完整内容，不是目录或概览
3. **保持原文档结构**：尽量在原文档基础上修改，不要大幅重组

### 合并规则：
1. **新增功能**：在原文档合适位置插入新章节，包含完整的描述
2. **需更新内容**：找到原文档对应章节，根据差异点修改
3. **已废弃内容**：从原文档中移除或标注为已废弃
4. **讨论差异点中的"待确认问题"**：在文档末尾单独列出
5. **冲突处理**：代码差异点和讨论差异点冲突时，以代码为准

### 输出格式：
直接输出完整的更新后文档（Markdown 格式），第一行必须是文档标题（如 # 需求文档），末尾追加变更记录：

---

## 📝 同步记录

**同步时间**: {date}
**同步类型**: 分阶段同步（代码 + 讨论）

| 位置 | 变更类型 | 变更内容 | 来源 |
|------|----------|----------|------|
| [章节] | 新增/修改/删除 | [描述] | 代码/讨论 |`;

const DEFAULT_MERGE_DESIGN_PROMPT = `你是一个资深技术文档工程师。请根据差异点清单更新原技术文档。

## 原技术文档
\`\`\`markdown
{originalDoc}
\`\`\`

## 代码差异点
\`\`\`markdown
{codeDoc}
\`\`\`

## 讨论差异点
\`\`\`markdown
{discussionDoc}
\`\`\`

## 任务
请根据上述差异点清单，对原技术文档进行更新，输出**完整的更新后文档**。

### 重要要求：
1. **直接输出文档内容**：不要说"已完成"、"已保存"、"完成情况总结"等，直接输出完整的 Markdown 文档
2. **输出完整文档**：必须包含所有章节的完整内容，不是目录或概览
3. **保持原文档结构**：尽量在原文档基础上修改，不要大幅重组

### 合并规则：
1. **新增接口/数据模型**：在原文档合适位置插入新章节，包含完整描述
2. **需更新内容**：找到原文档对应章节，根据差异点修改
3. **已废弃内容**：从原文档中移除或标注为已废弃
4. **讨论差异点中的"待确认问题"**：在文档末尾单独列出
5. **冲突处理**：代码差异点和讨论差异点冲突时，以代码为准

### 输出格式：
直接输出完整的更新后文档（Markdown 格式），第一行必须是文档标题（如 # 技术方案），末尾追加变更记录：

---

## 📝 同步记录

**同步时间**: {date}
**同步类型**: 分阶段同步（代码 + 讨论）

| 位置 | 变更类型 | 变更内容 | 来源 |
|------|----------|----------|------|
| [章节] | 新增/修改/删除 | [描述] | 代码/讨论 |`;

/**
 * Prompt 注册表
 * 每个条目包含：
 * - label: 显示名称
 * - description: 功能描述
 * - default: 默认模板
 * - variables: 支持的变量列表
 * - outputFormat: 输出格式要求
 * - requirements: 模板必须满足的要求
 */
export const PROMPT_REGISTRY = {
  analyze: {
    label: '需求分析',
    description: '分析需求文档，提取结构化数据',
    default: DEFAULT_ANALYZE_PROMPT,
    variables: [
      { name: 'requirementId', description: '需求目录名/ID', required: true },
      { name: 'docsContent', description: '需求文档内容', required: true },
    ],
    outputFormat: 'JSON',
    requirements: [
      '必须返回严格的 JSON 格式',
      'JSON 必须包含 type, summary, features, fields, tags, timeline 字段',
      'timeline 必须是数组，包含所有时间节点',
    ],
  },
  sync: {
    label: '文档同步',
    description: '根据代码变更同步文档',
    default: DEFAULT_SYNC_PROMPT,
    variables: [
      { name: 'docTypeName', description: '文档类型名称（需求文档/技术文档）', required: true },
      { name: 'currentDoc', description: '当前文档内容', required: true },
      { name: 'commitList', description: '提交记录列表', required: false },
      { name: 'codeDiff', description: '代码变更内容', required: true },
      { name: 'date', description: '当前日期', required: true },
      { name: 'commitCount', description: '提交数量', required: false },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '必须返回完整的更新后文档（Markdown 格式）',
      '文档末尾必须添加同步记录',
      '以代码实现为准，不要臆造',
    ],
  },
  template: {
    label: '模板生成',
    description: 'AI 生成文档模板',
    default: DEFAULT_TEMPLATE_PROMPT,
    variables: [
      { name: 'docTypeName', description: '文档类型名称', required: true },
      { name: 'requirementId', description: '需求目录名/ID', required: true },
      { name: 'path', description: '文档路径', required: true },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '必须返回完整的 Markdown 文档',
    ],
  },
  search: {
    label: 'AI 语义搜索',
    description: '根据用户查询搜索相关需求',
    default: null, // 在后面定义
    variables: [
      { name: 'query', description: '用户搜索查询', required: true },
      { name: 'requirementsSummary', description: '可用需求列表', required: true },
    ],
    outputFormat: 'JSON',
    requirements: [
      '必须返回严格的 JSON 格式',
      'JSON 必须包含 results 数组',
      '每个结果必须包含 id, relevance, reason 字段',
    ],
  },
  // 分阶段同步
  'phased-code-analysis-requirement': {
    label: '代码差异分析（需求文档）',
    description: '对比代码变更与当前需求文档，找出差异点',
    default: DEFAULT_CODE_ANALYSIS_REQUIREMENT_PROMPT,
    category: 'phased-sync',
    variables: [
      { name: 'chunkLabel', description: '分块标签（分块时使用）', required: false },
      { name: 'currentDoc', description: '当前文档内容', required: true },
      { name: 'commitList', description: '提交记录列表', required: false },
      { name: 'codeDiff', description: '代码变更内容', required: true },
      { name: 'chunkSuffix', description: '分块后缀', required: false },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '必须输出 Markdown 格式',
      '只输出差异点清单（新增/需更新/已废弃），不输出完整文档',
      '不包含代码片段',
    ],
  },
  'phased-code-analysis-design': {
    label: '代码差异分析（技术文档）',
    description: '对比代码变更与当前技术文档，找出差异点',
    default: DEFAULT_CODE_ANALYSIS_DESIGN_PROMPT,
    category: 'phased-sync',
    variables: [
      { name: 'chunkLabel', description: '分块标签', required: false },
      { name: 'currentDoc', description: '当前文档内容', required: true },
      { name: 'commitList', description: '提交记录列表', required: false },
      { name: 'codeDiff', description: '代码变更内容', required: true },
      { name: 'chunkSuffix', description: '分块后缀', required: false },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '必须输出 Markdown 格式',
      '只输出差异点清单（新增接口/数据模型/需更新/已废弃），不输出完整文档',
      '不包含代码片段',
    ],
  },
  'phased-discussion-analysis-requirement': {
    label: '讨论差异分析（需求文档）',
    description: '对比讨论记录与当前需求文档，找出差异点',
    default: DEFAULT_DISCUSSION_ANALYSIS_REQUIREMENT_PROMPT,
    category: 'phased-sync',
    variables: [
      { name: 'chunkLabel', description: '分块标签', required: false },
      { name: 'currentDoc', description: '当前文档内容', required: true },
      { name: 'sessionContent', description: '会话/讨论内容', required: true },
      { name: 'chunkSuffix', description: '分块后缀', required: false },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '必须输出 Markdown 格式',
      '只输出差异点清单（新增需求/需修改/需删除/待确认），不输出完整文档',
    ],
  },
  'phased-discussion-analysis-design': {
    label: '讨论差异分析（技术文档）',
    description: '对比讨论记录与当前技术文档，找出差异点',
    default: DEFAULT_DISCUSSION_ANALYSIS_DESIGN_PROMPT,
    category: 'phased-sync',
    variables: [
      { name: 'chunkLabel', description: '分块标签', required: false },
      { name: 'currentDoc', description: '当前文档内容', required: true },
      { name: 'sessionContent', description: '会话/讨论内容', required: true },
      { name: 'chunkSuffix', description: '分块后缀', required: false },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '必须输出 Markdown 格式',
      '只输出差异点清单（新增技术方案/需修改/需删除/待确认），不输出完整文档',
    ],
  },
  'phased-merge-requirement': {
    label: '增量合并（需求文档）',
    description: '根据差异点清单更新原需求文档',
    default: DEFAULT_MERGE_REQUIREMENT_PROMPT,
    category: 'phased-sync',
    variables: [
      { name: 'originalDoc', description: '原始文档内容', required: true },
      { name: 'codeDoc', description: '代码差异点', required: false },
      { name: 'discussionDoc', description: '讨论差异点', required: false },
      { name: 'date', description: '当前日期', required: true },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '必须返回完整的更新后文档',
      '根据差异点清单更新原文档',
      '保持原文档结构和格式',
    ],
  },
  'phased-merge-design': {
    label: '增量合并（技术文档）',
    description: '根据差异点清单更新原技术文档',
    default: DEFAULT_MERGE_DESIGN_PROMPT,
    category: 'phased-sync',
    variables: [
      { name: 'originalDoc', description: '原始文档内容', required: true },
      { name: 'codeDoc', description: '代码差异点', required: false },
      { name: 'discussionDoc', description: '讨论差异点', required: false },
      { name: 'date', description: '当前日期', required: true },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '必须返回完整的更新后文档',
      '根据差异点清单更新原文档',
    ],
  },
  // 合并分析结果
  'phased-code-analysis-merge-requirement': {
    label: '代码差异点合并（需求文档）',
    description: '合并多个代码差异点分析结果',
    default: `你是文档分析专家。请将以下多个代码差异点分析结果合并成一份完整的差异点清单。

## {analysisCount} 个差异点片段

{analysisContent}

## 任务
合并并去重所有差异点，输出一份**完整的差异点清单**。

### 重要要求：
1. **输出完整内容**：必须列出每个差异点的详细信息，不要只输出统计概览
2. **按类型归类**：将所有差异点按"新增功能"、"需更新内容"、"已废弃内容"三类重新归类
3. **去重**：多个片段中描述同一差异点的，只保留一份
4. **保留详细信息**：每个差异点必须包含：功能名称、代码位置、功能描述、业务场景、验收标准
5. **不要输出总结性语言**：不要说"已完成"、"已保存"、"概览"等，直接输出差异点清单

### 输出格式（严格遵守）：

# 代码差异点清单

## 新增功能

### [功能名称]
**代码位置**：[文件路径/模块]
**功能描述**：[从代码推断的功能说明]
**业务场景**：[推断的使用场景]
**验收标准**：
- Given [前置条件], When [操作], Then [预期结果]

## 需更新内容

### [文档章节/功能名称]
**原文档描述**：[文档中的描述]
**代码实际实现**：[代码中的实际行为]
**差异说明**：[具体差异点]

## 已废弃内容

### [功能名称]
**原文档描述**：[文档中的描述]
**废弃原因**：[从代码推断的原因]`,
    category: 'phased-sync',
    variables: [
      { name: 'analysisCount', description: '分析片段数量', required: true },
      { name: 'analysisContent', description: '所有差异点片段内容', required: true },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '合并多个差异点片段，去重',
      '按差异类型归类',
      '输出每个差异点的完整详细信息',
      '不要只输出统计概览',
    ],
  },
  'phased-code-analysis-merge-design': {
    label: '代码差异点合并（技术文档）',
    description: '合并多个代码差异点分析结果',
    default: `你是文档分析专家。请将以下多个代码差异点分析结果合并成一份完整的差异点清单。

## {analysisCount} 个差异点片段

{analysisContent}

## 任务
合并并去重所有差异点，输出一份**完整的差异点清单**。

### 重要要求：
1. **输出完整内容**：必须列出每个差异点的详细信息，不要只输出统计概览
2. **按类型归类**：将所有差异点按"新增接口"、"新增数据模型"、"需更新内容"、"已废弃内容"四类重新归类
3. **去重**：多个片段中描述同一差异点的，只保留一份
4. **保留详细信息**：每个差异点必须包含完整的技术细节
5. **不要输出总结性语言**：不要说"已完成"、"已保存"、"概览"等，直接输出差异点清单

### 输出格式（严格遵守）：

# 代码差异点清单

## 新增接口

### [接口名称]
**接口路径**：[METHOD] /api/xxx
**参数变更**：[新增/修改的参数]
**响应变更**：[新增/修改的响应字段]

## 新增数据模型

### [表名/实体名]
**字段说明**：[字段列表及类型]
**关联关系**：[与其他表的关系]

## 需更新内容

### [文档章节/模块名称]
**原文档描述**：[文档中的描述]
**代码实际实现**：[代码中的实际行为]
**差异说明**：[具体差异点]

## 已废弃内容

### [接口/模块名称]
**原文档描述**：[文档中的描述]
**废弃原因**：[从代码推断的原因]`,
    category: 'phased-sync',
    variables: [
      { name: 'analysisCount', description: '分析片段数量', required: true },
      { name: 'analysisContent', description: '所有差异点片段内容', required: true },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '合并多个差异点片段，去重',
      '按差异类型归类',
      '输出每个差异点的完整详细信息',
      '不要只输出统计概览',
    ],
  },
  'phased-discussion-analysis-merge-requirement': {
    label: '讨论差异点合并（需求文档）',
    description: '合并多个讨论差异点分析结果',
    default: `你是文档分析专家。请将以下多个讨论差异点分析结果合并成一份完整的差异点清单。

## {analysisCount} 个差异点片段

{analysisContent}

## 任务
合并并去重所有差异点，输出一份**完整的差异点清单**。

### 重要要求：
1. **输出完整内容**：必须列出每个差异点的详细信息，不要只输出统计概览
2. **按类型归类**：将所有差异点按"新增需求"、"需修改内容"、"需删除内容"、"待确认问题"四类重新归类
3. **去重**：多个片段中描述同一差异点的，只保留一份
4. **保留详细信息**：每个差异点必须包含完整的需求描述
5. **不要输出总结性语言**：不要说"已完成"、"已保存"、"概览"等，直接输出差异点清单

### 输出格式（严格遵守）：

# 讨论差异点清单

## 新增需求

### [需求名称]
**来源**：[轮次/时间]
**需求描述**：[讨论中提到的需求]
**业务价值**：[讨论中提到的价值]

## 需修改内容

### [文档章节/功能名称]
**原文档内容**：[文档中的描述]
**讨论决定**：[讨论中决定的修改]
**修改原因**：[为什么要改]

## 需删除内容

### [功能名称]
**原文档内容**：[文档中的描述]
**删除原因**：[讨论中提到的原因]

## 待确认问题

- [ ] [问题描述] - 影响范围：[哪些功能/章节]`,
    category: 'phased-sync',
    variables: [
      { name: 'analysisCount', description: '分析片段数量', required: true },
      { name: 'analysisContent', description: '所有差异点片段内容', required: true },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '合并多个差异点片段，去重',
      '按差异类型归类',
      '输出每个差异点的完整详细信息',
      '不要只输出统计概览',
    ],
  },
  'phased-discussion-analysis-merge-design': {
    label: '讨论差异点合并（技术文档）',
    description: '合并多个讨论差异点分析结果',
    default: `你是文档分析专家。请将以下多个讨论差异点分析结果合并成一份完整的差异点清单。

## {analysisCount} 个差异点片段

{analysisContent}

## 任务
合并并去重所有差异点，输出一份**完整的差异点清单**。

### 重要要求：
1. **输出完整内容**：必须列出每个差异点的详细信息，不要只输出统计概览
2. **按类型归类**：将所有差异点按"新增技术方案"、"需修改内容"、"需删除内容"、"待确认问题"四类重新归类
3. **去重**：多个片段中描述同一差异点的，只保留一份
4. **保留详细信息**：每个差异点必须包含完整的技术描述
5. **不要输出总结性语言**：不要说"已完成"、"已保存"、"概览"等，直接输出差异点清单

### 输出格式（严格遵守）：

# 讨论差异点清单

## 新增技术方案

### [方案名称]
**来源**：[轮次/时间]
**方案描述**：[讨论中提到的技术方案]
**技术选型**：[讨论中提到的技术选择]

## 需修改内容

### [文档章节/模块名称]
**原文档内容**：[文档中的描述]
**讨论决定**：[讨论中决定的修改]
**修改原因**：[为什么要改]

## 需删除内容

### [接口/模块名称]
**原文档内容**：[文档中的描述]
**删除原因**：[讨论中提到的原因]

## 待确认问题

- [ ] [技术问题描述] - 影响范围：[哪些模块/接口]`,
    category: 'phased-sync',
    variables: [
      { name: 'analysisCount', description: '分析片段数量', required: true },
      { name: 'analysisContent', description: '所有差异点片段内容', required: true },
    ],
    outputFormat: 'Markdown',
    requirements: [
      '合并多个差异点片段，去重',
      '按差异类型归类',
      '输出每个差异点的完整详细信息',
      '不要只输出统计概览',
    ],
  },
  // AI 搜索
  'search': {
    label: 'AI 语义搜索',
    description: '根据用户查询搜索相关需求',
    default: `你是一个需求搜索助手。用户查询: "{query}"

可用需求列表:
{requirementsSummary}

请分析哪些需求与用户查询最相关，返回 JSON 格式:
{
  "results": [
    {
      "id": "需求ID",
      "relevance": 0-100,
      "reason": "相关原因"
    }
  ]
}

只返回 JSON，不要其他文字。`,
    category: 'search',
    variables: [
      { name: 'query', description: '用户搜索查询', required: true },
      { name: 'requirementsSummary', description: '可用需求列表', required: true },
    ],
    outputFormat: 'JSON',
    requirements: [
      '必须返回严格的 JSON 格式',
      'JSON 必须包含 results 数组',
      '每个结果必须包含 id, relevance, reason 字段',
    ],
  },
};

/**
 * 获取 scoped skills 服务
 * 参考 SessionSkillCatalog 的逻辑
 * @param {string} sessionId - 会话 ID
 * @param {Object} sessionQuery - sessionQuery 服务
 * @param {Object} agents - agents 服务
 * @param {Object} agentPresets - agentPresets 服务
 * @returns {Promise<{skills: Object, scope: any}|null>}
 */
export async function getScopedSkills(sessionId, sessionQuery, agents, agentPresets) {
  if (!sessionId || !sessionQuery || !agents || !agentPresets) {
    return null;
  }

  try {
    // 1. 获取会话信息
    const observation = await sessionQuery.observeSession(sessionId);
    if (!observation?.projections) {
      return null;
    }

    const agentPreset = observation.projections.values.agentPreset ?? undefined;

    // 2. 尝试从活跃 agent 获取 scoped skills
    const live = agents.get(sessionId);
    let scoped = live ? agentPresets.serviceFor(live, 'skills') : undefined;

    // 3. 如果没有活跃 agent，尝试从 preset 获取 scope
    if (!scoped && agentPreset) {
      try {
        const lease = await agentPresets.acquireScope(agentPreset);
        if (lease) {
          // 注意：这里返回 lease.key 作为 scope，但不返回 skills
          // 因为 scoped skills 需要从 agent preset 获取
          return null; // 暂时不支持 cold session
        }
      } catch (e) {
        // preset 不可用
        return null;
      }
    }

    if (scoped) {
      return { skills: scoped, scope: live };
    }
  } catch (e) {
    console.warn(`获取 scoped skills 失败: ${e.message}`);
  }

  return null;
}

/**
 * 获取 prompt 的元信息
 * @param {string} promptKey - Prompt 键名
 * @returns {Object|null} prompt 元信息
 */
export function getPromptMeta(promptKey) {
  const meta = PROMPT_REGISTRY[promptKey];
  if (!meta) return null;
  
  return {
    key: promptKey,
    label: meta.label,
    description: meta.description,
    variables: meta.variables || [],
    outputFormat: meta.outputFormat || 'text',
    requirements: meta.requirements || [],
    category: meta.category || 'general',
  };
}

/**
 * 获取所有 prompt 的元信息列表
 * @returns {Array} prompt 元信息列表
 */
export function getAllPromptMetas() {
  const result = [];
  
  for (const [key, meta] of Object.entries(PROMPT_REGISTRY)) {
    result.push({
      key,
      label: meta.label,
      description: meta.description,
      variableCount: meta.variables?.length || 0,
      outputFormat: meta.outputFormat || 'text',
      category: meta.category || 'general',
    });
  }
  
  return result;
}

/**
 * 验证自定义 prompt 模板
 * @param {string} promptKey - Prompt 键名
 * @param {string} template - 自定义模板
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validatePromptTemplate(promptKey, template) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
  };
  
  const meta = PROMPT_REGISTRY[promptKey];
  if (!meta) {
    result.warnings.push(`未知的 promptKey: ${promptKey}`);
    return result;
  }
  
  // 检查模板是否为空
  if (!template || template.trim().length === 0) {
    result.errors.push('模板不能为空');
    result.valid = false;
    return result;
  }
  
  // 检查必需变量是否在模板中出现
  if (meta.variables) {
    for (const varDef of meta.variables) {
      if (varDef.required) {
        const pattern = new RegExp(`\\{${varDef.name}\\}`);
        if (!pattern.test(template)) {
          result.errors.push(`模板中缺少必需变量: {${varDef.name}} (${varDef.description})`);
          result.valid = false;
        }
      }
    }
  }
  
  // 检查输出格式要求
  if (meta.outputFormat === 'JSON') {
    if (!template.includes('JSON') && !template.includes('json')) {
      result.warnings.push('此 prompt 要求返回 JSON 格式，建议在模板中明确说明');
    }
  }
  
  return result;
}

/**
 * 获取完整的 System Prompt（Skill + Prompt 组合）
 * 
 * 设计理念：
 * - Skill = 指令（"怎么做"）- 来自 DSH skills 系统
 * - Prompt = 业务数据模板（"处理什么数据"）- 本地配置
 * - 两者配合使用，Skill 作为指令层，Prompt 作为数据层
 * 
 * 组合方式：
 * 1. 有 Skill：Skill 指令 + Prompt 业务模板（变量未替换）
 * 2. 无 Skill：仅 Prompt 业务模板
 * 
 * @param {Object} config - 配置对象
 * @param {string} promptKey - Prompt 键名
 * @param {string} cwd - 工作目录（用于 skill 查找）
 * @param {Object} scopedSkills - 可选的 scoped skills 服务
 * @returns {Promise<{systemPrompt: string, promptTemplate: string, skillUsed: string|null}>}
 */
export async function getPromptAsync(config, promptKey, cwd = undefined, scopedSkills = undefined) {
  // 获取业务数据模板（自定义或默认）
  const promptTemplate = config.ai?.prompts?.[promptKey]?.trim() || PROMPT_REGISTRY[promptKey]?.default || '';
  
  // 检查是否配置了 skill
  const skillName = config.ai?.skillBindings?.[promptKey];
  
  if (skillName) {
    const skillsToUse = scopedSkills || skillsService;
    
    if (skillsToUse) {
      // 检查缓存
      const cacheKey = `${skillName}:${cwd || 'global'}:${scopedSkills ? 'scoped' : 'global'}`;
      if (skillsCache.has(cacheKey)) {
        const skillContent = skillsCache.get(cacheKey);
        return {
          systemPrompt: skillContent,
          promptTemplate,
          skillUsed: skillName,
        };
      }
      
      try {
        const skill = await skillsToUse.get(skillName, { cwd });
        if (skill?.content) {
          skillsCache.set(cacheKey, skill.content);
          return {
            systemPrompt: skill.content,
            promptTemplate,
            skillUsed: skillName,
          };
        }
      } catch (e) {
        console.warn(`Skill "${skillName}" 加载失败: ${e.message}`);
        // Skill 加载失败，仅使用 prompt 模板
        return {
          systemPrompt: '',
          promptTemplate,
          skillUsed: null,
        };
      }
    }
  }
  
  // 无 Skill，仅返回 prompt 模板
  return {
    systemPrompt: '',
    promptTemplate,
    skillUsed: null,
  };
}

/**
 * 构建完整的 LLM Prompt（组合 Skill 指令 + 业务数据）
 * @param {Object} options
 * @param {string} options.systemPrompt - Skill 指令内容
 * @param {string} options.promptTemplate - 业务数据模板（含变量）
 * @param {Object} options.variables - 变量值映射
 * @returns {string} 完整的 prompt
 */
export function buildFullPrompt(options) {
  const { systemPrompt, promptTemplate, variables = {} } = options;
  
  // 替换模板变量
  let filledTemplate = promptTemplate;
  for (const [key, value] of Object.entries(variables)) {
    filledTemplate = filledTemplate.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  
  // 组合 Skill 指令和业务数据
  if (systemPrompt) {
    return `${systemPrompt}\n\n---\n\n${filledTemplate}`;
  }
  
  return filledTemplate;
}

/**
 * 获取有效的 Prompt（同步版本，不支持 skill）
 * @deprecated 使用 getPromptAsync 替代
 * @param {Object} config - 配置对象
 * @param {string} promptKey - Prompt 键名
 * @returns {string} Prompt 内容
 */
export function getPrompt(config, promptKey) {
  const custom = config.ai?.prompts?.[promptKey];
  if (custom && custom.trim()) return custom;
  return PROMPT_REGISTRY[promptKey]?.default || '';
}



