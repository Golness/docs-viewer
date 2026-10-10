/**
 * Prompt 管理模块
 * 负责 Prompt 的注册、获取和管理
 */

const DEFAULT_ANALYZE_PROMPT = `你是一个需求分析专家。请分析以下需求文档内容，并返回 JSON 格式的结构化数据。

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

const DEFAULT_CODE_ANALYSIS_REQUIREMENT_PROMPT = `你是一个资深需求分析师。请从代码变更的角度，深入分析以下代码 diff，提取并补全需求文档相关信息。{chunkLabel}

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
请从代码实现反推需求，不仅要提取信息，还要补全和细化需求文档。

### 分析要求：
1. **功能点提取**：从代码中提取所有新增/修改的功能点
2. **业务场景补全**：根据代码逻辑，推断并补充完整的业务场景
3. **用户故事细化**：将功能点转化为标准的用户故事格式（As a [角色], I want [功能], so that [价值]）
4. **验收标准明确**：为每个功能点补充可验证的验收标准（Given/When/Then）
5. **业务流程梳理**：如果涉及流程变更，画出完整的业务流程（使用 Mermaid 语法）
6. **异常场景补充**：从代码的异常处理逻辑中，提取异常场景和处理方式

### 输出格式（严格遵守，必须输出 Markdown）：

# 代码视角分析{chunkSuffix}

## 功能清单

### [功能名称]
**用户故事**：As a [角色], I want [功能], so that [价值]

**业务场景**：
- 场景描述：[详细描述]
- 前置条件：[条件]
- 后置条件：[条件]

**验收标准**：
- Given [前置条件], When [操作], Then [预期结果]
- Given [前置条件], When [操作], Then [预期结果]

**异常处理**：
- 异常场景1：[描述] → 处理方式：[方式]
- 异常场景2：[描述] → 处理方式：[方式]

## 业务流程变更

\`\`\`mermaid
graph TD
    A[开始] --> B{条件判断}
    B -->|条件1| C[步骤1]
    B -->|条件2| D[步骤2]
    C --> E[结束]
    D --> E
\`\`\`

## 数据模型变更
- [实体名]：[字段变更说明]
- [关联关系]：[关系变更说明]

注意：请直接输出 Markdown 文本，不要输出 JSON，不要用 \`\`\`json 代码块包裹。`;

const DEFAULT_CODE_ANALYSIS_DESIGN_PROMPT = `你是一个资深技术架构师。请从代码变更的角度，深入分析以下代码 diff，提取并补全技术方案文档相关信息。{chunkLabel}

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
请从代码实现反推技术方案，不仅要提取信息，还要补全和细化技术文档。

### 分析要求：
1. **接口设计**：提取所有新增/修改的接口，补充完整的接口设计文档（路径、方法、参数表、响应体、错误码）
2. **数据模型**：提取数据库字段变更，补充完整的 ER 图（Mermaid erDiagram）和字段说明
3. **架构决策**：从代码结构中推断架构决策，补充 ADR（Architecture Decision Record）
4. **性能考虑**：从代码中识别性能相关的实现（缓存、索引、批量处理、分页等）
5. **安全设计**：从代码中提取安全相关的实现（认证、授权、加密、校验等）
6. **技术债务**：识别代码中的 TODO、FIXME 或临时方案，记录为技术债务

### 输出格式（严格遵守，必须输出 Markdown）：

# 代码视角分析{chunkSuffix}

## 接口设计

### [接口名称]
**接口路径**：[METHOD] /api/xxx

**请求参数**：
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| param1 | string | 是 | 参数说明 | example |

**响应格式**：
\`\`\`json
{
  "code": 200,
  "data": { "field1": "type - 说明" },
  "message": "success"
}
\`\`\`

**错误码**：
| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| 400 | 参数错误 | 检查参数格式 |

## 数据模型

\`\`\`mermaid
erDiagram
    TABLE_A ||--o{ TABLE_B : "关联关系"
    TABLE_A {
        bigint id PK
        varchar name
        datetime created_at
    }
\`\`\`

**字段变更说明**：
- [表名].[字段名]：[类型] - [说明] - [是否索引]

## 架构决策记录（ADR）

### ADR-[编号]: [决策标题]
**状态**：已实施
**背景**：[为什么需要这个决策]
**决策**：[做了什么决策]
**理由**：[优点/缺点分析]
**影响**：[这个决策带来的影响]

## 性能优化
- [优化点]：[实现方式] - [预期效果]

## 安全设计
- [安全措施]：[实现方式]

## 技术债务
- [ ] [债务描述] - 优先级：[高/中/低]

注意：请直接输出 Markdown 文本，不要输出 JSON，不要用 \`\`\`json 代码块包裹。`;

const DEFAULT_DISCUSSION_ANALYSIS_REQUIREMENT_PROMPT = `你是一个资深需求分析师。请从讨论记录中，深入提取并补全需求文档相关信息。{chunkLabel}

## 当前需求文档
\`\`\`markdown
{currentDoc}
\`\`\`

## 讨论记录
{sessionContent}

## 任务
请从讨论记录中提取需求信息，并补全和细化需求文档。

### 分析要求：
1. **需求背景**：提取业务背景、目标用户、核心价值
2. **功能需求**：提取明确的功能需求，转化为用户故事
3. **非功能需求**：提取性能、安全、可用性等非功能需求
4. **业务规则**：提取业务规则和约束条件
5. **优先级排序**：根据讨论内容，给出功能优先级（MoSCoW 方法：Must/Should/Could/Won't）
6. **风险识别**：从讨论中识别潜在风险和待确认问题
7. **验收标准**：从讨论中提取验收标准

### 输出格式：

# 对话视角分析{chunkSuffix}

## 需求背景
**业务背景**：[详细描述]（来源：[会话ID/时间]）
**目标用户**：[用户画像]
**核心价值**：[价值主张]

## 功能需求

### [功能名称]
**用户故事**：As a [角色], I want [功能], so that [价值]
**优先级**：Must have / Should have / Could have / Won't have
**验收标准**：
- [ ] [标准1]
- [ ] [标准2]

## 非功能需求
- **性能要求**：[要求描述]
- **安全要求**：[要求描述]
- **可用性要求**：[要求描述]

## 业务规则
1. [规则1]：[详细描述]
2. [规则2]：[详细描述]

## 风险与待确认
### 风险
- [风险1]：[影响] - [缓解措施]

### 待确认问题
- [ ] [问题1] - 负责人：[谁] - 截止日期：[时间]

请直接输出分析结果，不要包含其他解释。`;

const DEFAULT_DISCUSSION_ANALYSIS_DESIGN_PROMPT = `你是一个资深技术架构师。请从讨论记录中，深入提取并补全技术方案文档相关信息。{chunkLabel}

## 当前技术文档
\`\`\`markdown
{currentDoc}
\`\`\`

## 讨论记录
{sessionContent}

## 任务
请从讨论记录中提取技术方案信息，并补全和细化技术文档。

### 分析要求：
1. **架构设计**：提取系统架构、模块划分、技术选型
2. **设计决策**：提取关键技术决策，补充 ADR（Architecture Decision Record）
3. **接口设计**：提取接口设计讨论，补充完整的接口文档
4. **数据模型**：提取数据模型设计，补充 ER 图
5. **技术方案对比**：如果讨论中对比了多个方案，记录方案对比表
6. **性能设计**：提取性能相关的讨论和决策
7. **技术风险**：识别技术风险和应对措施

### 输出格式：

# 对话视角分析{chunkSuffix}

## 架构设计
**系统架构**：[架构描述]（来源：[会话ID/时间]）

\`\`\`mermaid
graph TB
    A[模块A] --> B[模块B]
    B --> C[模块C]
\`\`\`

**技术选型**：
| 技术 | 选择理由 | 备选方案 |
|------|----------|----------|
| [技术1] | [理由] | [备选] |

## 架构决策记录（ADR）

### ADR-[编号]: [决策标题]
**状态**：已决策 / 讨论中
**背景**：[为什么需要这个决策]
**决策**：[做了什么决策]

**方案对比**：
| 方案 | 优点 | 缺点 | 评分 |
|------|------|------|------|
| 方案A | [优点] | [缺点] | [分数] |
| 方案B | [优点] | [缺点] | [分数] |

**最终选择**：[选择哪个方案]
**理由**：[选择理由]

## 接口设计讨论
### [接口名称]
**设计要点**：[关键设计决策]
**争议点**：[讨论中的争议]
**最终方案**：[最终确定的方案]

## 数据模型设计
**设计要点**：[关键设计决策]

\`\`\`mermaid
erDiagram
    TABLE_A ||--o{ TABLE_B : "关系"
\`\`\`

## 性能设计
- **性能目标**：[目标]
- **实现方案**：[方案]
- **监控指标**：[指标]

## 技术风险
| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| [风险1] | [影响] | [高/中/低] | [措施] |

请直接输出分析结果，不要包含其他解释。`;

// ═══════════════════════════════════════════════════════════════
// 分阶段同步 Prompt - 增量合并
// ═══════════════════════════════════════════════════════════════

const DEFAULT_MERGE_REQUIREMENT_PROMPT = `你是一个资深需求文档工程师。请将两份分析结果合并到原需求文档中，使文档更加专业和完整。

## 原需求文档
\`\`\`markdown
{originalDoc}
\`\`\`

## 代码视角分析
\`\`\`markdown
{codeDoc}
\`\`\`

## 对话视角分析
\`\`\`markdown
{discussionDoc}
\`\`\`

## 任务
请将代码视角和对话视角的分析结果，合并到原需求文档中，使文档更加专业和完整。

### 合并要求：
1. **保持原文档结构**：尽量在原文档的基础上插入/更新内容
2. **补全缺失内容**：如果分析结果中有原文档未覆盖的内容，新增对应章节
3. **细化已有内容**：如果分析结果对已有章节有更详细的描述，补充细化
4. **新增内容标注来源**：
   - 来自代码分析的内容标注 [来源: 代码]
   - 来自对话分析的内容标注 [来源: 讨论]
5. **处理冲突**：如果代码和对话有冲突，以代码为准，但保留对话中的背景说明
6. **确保专业性**：
   - 每个功能点都要有用户故事和验收标准
   - 业务流程使用 Mermaid 流程图
   - 业务规则清晰列出
7. **追加变更记录**：在文档末尾追加详细的变更记录

### 输出格式：
第一部分：更新后的完整文档（Markdown 格式）

第二部分：变更记录（追加在文档末尾）
\`\`\`markdown
---

## 📝 同步记录

**同步时间**: {date}
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
\`\`\`

请直接输出完整的文档内容和变更记录。`;

const DEFAULT_MERGE_DESIGN_PROMPT = `你是一个资深技术文档工程师。请将两份分析结果合并到原技术文档中，使文档更加专业和完整。

## 原技术文档
\`\`\`markdown
{originalDoc}
\`\`\`

## 代码视角分析
\`\`\`markdown
{codeDoc}
\`\`\`

## 对话视角分析
\`\`\`markdown
{discussionDoc}
\`\`\`

## 任务
请将代码视角和对话视角的分析结果，合并到原技术文档中，使文档更加专业和完整。

### 合并要求：
1. **保持原文档结构**：尽量在原文档的基础上插入/更新内容
2. **补全缺失内容**：如果分析结果中有原文档未覆盖的内容，新增对应章节
3. **细化已有内容**：如果分析结果对已有章节有更详细的描述，补充细化
4. **新增内容标注来源**：
   - 来自代码分析的内容标注 [来源: 代码]
   - 来自对话分析的内容标注 [来源: 讨论]
5. **处理冲突**：如果代码和对话有冲突，以代码为准，但保留对话中的设计决策说明
6. **确保专业性**：
   - 接口文档包含完整的参数表、响应体、错误码
   - 数据模型包含 ER 图（Mermaid erDiagram）
   - 架构决策使用 ADR 格式
   - 性能设计有明确的目标和方案
7. **追加变更记录**：在文档末尾追加详细的变更记录

### 输出格式：
第一部分：更新后的完整文档（Markdown 格式）

第二部分：变更记录（追加在文档末尾）
\`\`\`markdown
---

## 📝 同步记录

**同步时间**: {date}
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
\`\`\`

请直接输出完整的文档内容和变更记录。`;

/**
 * Prompt 注册表
 */
export const PROMPT_REGISTRY = {
  analyze: {
    label: '需求分析',
    description: '分析需求文档，提取结构化数据（System Prompt）',
    default: DEFAULT_ANALYZE_PROMPT,
  },
  sync: {
    label: '文档同步',
    description: '根据代码变更同步文档（支持变量：{docTypeName} {currentDoc} {commitList} {codeDiff} {date} {commitCount}）',
    default: DEFAULT_SYNC_PROMPT,
  },
  template: {
    label: '模板生成',
    description: 'AI 生成文档模板（支持变量：{docTypeName} {requirementId} {path}）',
    default: DEFAULT_TEMPLATE_PROMPT,
  },
  // 分阶段同步 - 需求文档
  'phased-code-analysis-requirement': {
    label: '代码分析（需求文档）',
    description: '从代码变更提取需求相关信息（支持变量：{chunkLabel} {currentDoc} {commitList} {codeDiff} {chunkSuffix}）',
    default: DEFAULT_CODE_ANALYSIS_REQUIREMENT_PROMPT,
    category: 'phased-sync',
  },
  'phased-code-analysis-design': {
    label: '代码分析（技术文档）',
    description: '从代码变更提取技术相关信息（支持变量：{chunkLabel} {currentDoc} {commitList} {codeDiff} {chunkSuffix}）',
    default: DEFAULT_CODE_ANALYSIS_DESIGN_PROMPT,
    category: 'phased-sync',
  },
  'phased-discussion-analysis-requirement': {
    label: '对话分析（需求文档）',
    description: '从讨论记录提取需求相关信息（支持变量：{chunkLabel} {currentDoc} {sessionContent} {chunkSuffix}）',
    default: DEFAULT_DISCUSSION_ANALYSIS_REQUIREMENT_PROMPT,
    category: 'phased-sync',
  },
  'phased-discussion-analysis-design': {
    label: '对话分析（技术文档）',
    description: '从讨论记录提取技术相关信息（支持变量：{chunkLabel} {currentDoc} {sessionContent} {chunkSuffix}）',
    default: DEFAULT_DISCUSSION_ANALYSIS_DESIGN_PROMPT,
    category: 'phased-sync',
  },
  'phased-merge-requirement': {
    label: '增量合并（需求文档）',
    description: '将分析结果合并到需求文档（支持变量：{originalDoc} {codeDoc} {discussionDoc} {date}）',
    default: DEFAULT_MERGE_REQUIREMENT_PROMPT,
    category: 'phased-sync',
  },
  'phased-merge-design': {
    label: '增量合并（技术文档）',
    description: '将分析结果合并到技术文档（支持变量：{originalDoc} {codeDoc} {discussionDoc} {date}）',
    default: DEFAULT_MERGE_DESIGN_PROMPT,
    category: 'phased-sync',
  },
};

/**
 * 获取有效的 Prompt
 * @param {Object} config - 配置对象
 * @param {string} promptKey - Prompt 键名
 * @returns {string} Prompt 内容
 */
export function getPrompt(config, promptKey) {
  const custom = config.ai?.prompts?.[promptKey];
  if (custom && custom.trim()) return custom;
  return PROMPT_REGISTRY[promptKey]?.default || '';
}
