# ReqHub — 需求中心

> DeepSeek Harness 插件：需求文档管理、AI 分析、文档同步、需求追溯

## 1. 插件定位

ReqHub 是面向 **DeepSeek Harness（DSH）** 的需求管理插件，解决以下核心问题：

- **需求文档散落** — 需求文档、技术方案、CR 记录分散在代码仓库中，缺乏统一管理
- **代码与文档脱节** — 代码变更后，需求文档没有同步更新，导致文档过期
- **需求追溯困难** — 无法快速定位某个功能点对应的需求文档和代码变更
- **AI 分析缺失** — 需求文档缺乏结构化元数据（功能点、字段、标签），无法智能搜索

ReqHub 将需求文档组织为 **开发者 → 需求 → 文件** 三级目录结构，通过 AI 分析提取结构化元数据，支持代码变更自动同步到文档，并提供全文搜索和 AI 语义搜索能力。

---

## 2. 功能概览

### 2.1 需求目录管理

- **三级目录树**：开发者 → 需求（日期-标题）→ 文档文件
- **Git 分支自动解析**：从 `feature/<开发者>/<日期>-<标题>` 格式分支名自动创建需求目录
- **多工作区支持**：切换不同 DSH 工作区，每个工作区独立管理需求文档
- **文件预览**：支持 Markdown、HTML、TXT 文件预览，含 Mermaid 图表和代码高亮

### 2.2 AI 分析

- **单需求 / 全量分析**：对单个需求或所有需求执行 AI 分析
- **SSE 实时进度**：分析过程通过 Server-Sent Events 实时推送进度
- **结构化元数据**：提取功能点、字段、标签、摘要，写入 `.meta.json`
- **自定义 Prompt**：支持自定义 AI 分析提示词模板
- **可取消**：长时间分析任务支持中途取消

### 2.3 文档同步

- **分阶段同步**：代码差异分析 → 会话提取 → 讨论差异分析 → 增量合并 → 保存文件
- **Git 代码差异**：自动分析分支与基准分支的代码变更
- **DSH 会话集成**：提取相关 DSH 会话的对话内容，分析讨论差异
- **增量合并**：AI 将代码变更智能合并到现有文档，而非覆盖
- **同步历史**：记录每次同步的完整过程和结果，支持回溯查看
- **构建分析 & 索引**：同步完成后可选执行 AI 分析和搜索索引重建

### 2.4 搜索

- **精确搜索**：基于搜索索引，按功能点、字段、标签精确匹配
- **AI 语义搜索**：通过 LLM 理解自然语言查询，返回相关需求
- **索引管理**：查看索引状态、统计信息，支持重建索引

### 2.5 模板生成

- **三种模板**：需求文档、技术方案、CR 记录
- **AI 辅助生成**：基于模板和上下文自动生成文档内容
- **预览与编辑**：生成后可预览和编辑

### 2.6 需求追溯

- **时间线视图**：展示需求从创建到同步的完整时间线
- **会话关联**：查看与需求相关的 DSH 会话
- **文件变更追踪**：追踪需求文档的历次变更

### 2.7 其他功能

- **日志系统**：分类日志（级别 + 标签），实时查看和过滤
- **技能浏览**：查看 DSH 技能列表和内容预览
- **设置管理**：AI 配置、模型选择、Prompt 模板管理
- **文件树侧边栏**：可拖拽调整宽度的文件列表，支持按类型过滤和排序

---

## 3. 架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    DeepSeek Harness                      │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │   Client     │    │   Server     │                   │
│  │  (Browser)   │◄──►│  (Node.js)   │                   │
│  │              │    │              │                   │
│  │  React UI    │    │  HTTP Routes │                   │
│  │  25 组件     │    │  42 路由     │                   │
│  │  CJS 格式    │    │  ESM 格式    │                   │
│  └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                            │
│         │         ┌─────────▼─────────┐                 │
│         │         │   服务层 (14 模块)  │                 │
│         │         │  ai-engine, sync,  │                 │
│         │         │  tree, index, ...  │                 │
│         │         └────────────────────┘                 │
│         │                   │                            │
│         │         ┌─────────▼─────────┐                 │
│         │         │   文件系统          │                 │
│         │         │  docs/<dev>/<req>/ │                 │
│         │         │  sync-logs/        │                 │
│         │         │  .meta.json        │                 │
│         │         └────────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

### 3.2 客户端架构

```
src/client/
├── index.js              # Cordis 插件入口（注册 Tab、Slot、触发按钮）
├── constants.js          # 常量定义（路由前缀、Tab ID、脚本 ID）
├── context.js            # React Context（跨组件通信）
├── icons.js              # SVG 图标系统（38+ 图标，工厂模式）
├── styles/               # 6 个 CSS 文件（tokens/base/layout/components/markdown/animations）
├── components/           # 25 个 React 组件
│   ├── DocsViewerBody.js # 主布局容器（三区域布局）
│   ├── FileTreeSidebar.js# 文件树侧边栏（可拖拽、过滤、排序）
│   ├── TopBar.js         # 顶部工具栏
│   ├── panels/           # 各功能面板
│   │   ├── SyncPanel.js       # 文档同步
│   │   ├── AnalyzePanel.js    # AI 分析
│   │   ├── SearchPanel.js     # 搜索
│   │   ├── IndexPanel.js      # 索引管理
│   │   ├── TemplatesPanel.js  # 模板生成
│   │   ├── TracePanel.js      # 需求追溯
│   │   ├── LogPanel.js        # 日志查看
│   │   └── SettingsPanel.js   # 设置
│   ── shared/           # 共享组件（Modal、Spinner 等）
├── hooks/                # 自定义 Hooks
│   ├── useAnalysis.js    # AI 分析逻辑
│   ├── useSearch.js      # 搜索逻辑
│   └── useScript.js      # CDN 脚本懒加载
└── utils/                # 工具函数
    ├── getDocIcon.js     # 文件类型图标映射
    ├── getMermaidTheme.js# Mermaid 主题切换
    ├── parseBranchName.js# Git 分支名解析
    └── sanitizeHtml.js   # HTML 净化
```

**构建流程**：

- 使用 `tsdown`（基于 Rolldown）构建
- 入口：`src/client/index.js` → 输出：`lib/client.js`（CJS 格式）
- CSS 通过 Rolldown 插件内联为 `<style>` 标签
- 外部依赖：React、ReactDOM、Cordis、DSH UI 组件库（由宿主提供）
- CDN 依赖：`marked`、`mermaid`、`highlight.js`（运行时懒加载）

### 3.3 服务端架构

```
src/server/
├── index.js              # 插件入口（注入 10 个 DSH 服务，注册路由）
├── routes/               # 6 个路由模块（42 个 API 端点）
│   ├── config-routes.js  # 配置、LLM、Prompt 相关（6 路由）
│   ├── tree-routes.js    # 目录树、工作区、索引、文件读写（10+ 路由）
│   ├── analyze-routes.js # AI 分析（5 路由，含 SSE 流）
│   ├── search-routes.js  # 搜索（2 路由：精确 + AI）
│   ├── sync-routes.js    # 文档同步（12+ 路由，含 SSE 流）
│   └── template-routes.js# 模板生成（2 路由）
└── 服务模块（14 个）
    ├── ai-engine.js          # AI/LLM 交互核心
    ├── analyze-engine.js     # 需求分析编排
    ├── phased-sync-engine.js # 分阶段同步引擎
    ├── sync-engine.js        # Git 差异、分支分析
    ├── sync-state.js         # 同步状态持久化
    ├── session-selector.js   # 会话关联查找
    ├── session-utils.js      # 会话对话提取
    ├── content-extractor.js  # 内容提取
    ├── doc-reader.js         # 文档读取
    ├── tree.js               # 目录树构建
    ├── index-manager.js      # 搜索索引管理
    ├── config.js             # 配置加载/保存
    ├── prompts.js            # Prompt 模板管理
    ├── task-executor.js      # 子代理任务执行
    ├── token-utils.js        # Token 估算
    ├── cache.js              # 内存缓存
    ├── meta.js               # .meta.json 读写
    ├── logger.js             # 分类日志
    └── utils.js              # 通用工具
```

### 3.4 API 路由总览

| 模块 | 路由数 | 关键端点 |
|------|--------|----------|
| 配置 | 6 | `/config`, `/llm-config`, `/ai-config`, `/prompt-registry` |
| 目录树 | 10+ | `/workspaces`, `/tree`, `/read`, `/create-dir`, `/rebuild-index`, `/index-status` |
| AI 分析 | 5 | `/analyze-preview`, `/analyze-stream` (SSE), `/analysis-status`, `/analysis-cancel` |
| 搜索 | 2 | `/search` (精确), `/ai-search` (语义) |
| 同步 | 12+ | `/phased-sync` (SSE), `/sync-docs`, `/sync-history`, `/sync-detail` |
| 模板 | 2 | `/templates`, `/generate-template` |
| 内联 | 5 | `/logs`, `/skills`, `/skill-content` |

### 3.5 数据流

```
用户操作 → React 组件 → fetch('/req-hub/xxx') → 路由处理 → 服务模块 → 文件系统/LLM/Git
                                                              ↓
                                                         SSE 流式返回 → 组件实时更新
```

### 3.6 目录约定

```
docs/
├── <开发者A>/
│   ├── 2026-10-10-包材报价管理-增加导出功能/
│   │   ├── 需求文档.md
│   │   ├── 技术方案.md
│   │   ├── CR-2026-10-12.md
│   │   ├── .meta.json          # AI 分析元数据
│   │   └── sync-logs/          # 同步历史
│   │       ├── .sync-state.json
│   │       └── sync-<timestamp>/
│   └── 2026-10-08-xxx/
├── <开发者B>/
│   └── ...
└── .index/
    └── search-index.json       # 搜索索引
```

**Git 分支命名规范**：
- `feature/<开发者>/<日期>-<标题>` → 自动解析为需求目录
- 支持 `YYYY-MM-DD` 和 `YYYYMMDD` 两种日期格式

---

## 4. 使用流程

### 4.1 安装

1. 将插件放入 DSH 的插件目录
2. 确保 `cordis.patch.yml` 已配置：
   ```yaml
   - insert:
       - id: req-hub
         name: '@local/req-hub'
   ```
3. 构建客户端：
   ```bash
   pnpm install
   pnpm run build
   ```
4. 重启 DSH，在右侧边栏找到 "Req Hub" 按钮

### 4.2 初始化

1. **选择工作区**：点击顶部"工作区"下拉框，选择目标 DSH 工作区
2. **设置文档路径**：点击"项目路径"，配置需求文档根目录（默认 `docs`）
3. **创建需求目录**：
   - 确保 Git 分支名符合 `feature/<开发者>/<日期>-<标题>` 格式
   - 点击 Rail 栏"新建"按钮，自动解析分支名并创建目录
   - 或手动在 `docs/<开发者>/` 下创建 `YYYY-MM-DD-标题` 格式目录

### 4.3 日常使用

#### 查看和编辑文档

1. 在左侧目录树中选择需求
2. 点击 Rail 栏"查看"按钮，打开文件树侧边栏
3. 在文件树中点击文件，右侧面板显示预览
4. 支持 Markdown 渲染、Mermaid 图表、代码高亮

#### AI 分析

1. 在左侧目录树中选择需求（或不选以全量分析）
2. 点击 Rail 栏"工作台" → "分析"标签页
3. 选择分析范围（当前需求 / 全部需求）
4. 点击"开始分析"，实时查看进度
5. 分析完成后，`.meta.json` 自动写入需求目录

#### 文档同步

1. 确保当前 Git 分支对应目标需求
2. 在左侧目录树中选择需求
3. 点击 Rail 栏"同步"按钮
4. 选择同步类型（需求文档 / 技术方案）
5. 系统自动执行分阶段同步：
   - **初始化**：检测代码变更
   - **会话提取**：提取相关 DSH 会话对话
   - **代码差异分析**：分析代码变更内容
   - **讨论差异分析**：分析会话中的讨论内容
   - **增量合并**：AI 将变更合并到文档
   - **保存文件**：写入更新后的文档
6. 同步完成后可在"同步历史"中查看详细信息

#### 搜索

1. 点击 Rail 栏"工作台" → "搜索"标签页
2. **精确搜索**：输入功能点、字段名或标签名
3. **AI 搜索**：输入自然语言描述，LLM 理解后返回相关需求
4. 搜索结果点击可在右侧面板预览

#### 模板生成

1. 点击 Rail 栏"模板"按钮
2. 选择模板类型（需求 / 方案 / CR）
3. 填写必要信息
4. AI 自动生成文档内容
5. 预览并保存到需求目录

#### 需求追溯

1. 在左侧目录树中选择需求
2. 点击 Rail 栏"追溯"按钮
3. 查看需求时间线：创建、同步、分析等事件
4. 点击事件可查看详细信息

### 4.4 配置

通过顶部"设置"按钮或编辑 `config.json` 配置：

```json
{
  "docsDir": "docs",
  "workspaceId": "<工作区 ID>",
  "developerName": "<开发者名>",
  "requirementId": "<需求 ID>",
  "ai": {
    "selectedModel": "<模型名>",
    "prompts": {
      "<prompt-key>": "<自定义提示词>"
    },
    "skillBindings": {
      "phased-code-analysis-requirement": null
    }
  }
}
```

### 4.5 开发模式

```bash
# 监听模式（自动重新构建）
pnpm run dev

# 单次构建
pnpm run build
```

修改客户端代码后，DSH 会自动热重载（HMR）。修改服务端代码后需要重启 DSH。

---

## 5. 技术栈

| 层面 | 技术 |
|------|------|
| 客户端框架 | React（通过 DSH 宿主提供） |
| 客户端构建 | tsdown（Rolldown） |
| 客户端样式 | 原生 CSS + DSH Token 体系 |
| 服务端运行时 | Node.js（DSH 插件机制） |
| 依赖注入 | Cordis |
| AI/LLM | DSH LLM 服务（可配置模型） |
| 文档渲染 | marked + mermaid + highlight.js（CDN） |
| 版本控制 | Git（代码差异分析） |
| 实时通信 | SSE（Server-Sent Events） |
