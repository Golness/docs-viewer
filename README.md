# Docs Viewer

一个用于 DeepSeek Harness (DSH) 的需求文档管理插件，提供需求目录管理、AI 分析、文档同步、需求追溯等功能。

## 功能特性

### 📁 需求目录管理
- **三级目录结构**：开发者 → 需求 → 文件，清晰组织需求文档
- **自动创建目录**：基于 Git 分支命名规范（如 `feature/developer/2026-10-08-title`）自动创建需求目录
- **多种文档格式**：支持 Markdown、HTML、TXT 等多种文档格式

### 🤖 AI 分析引擎
- **智能分析**：自动提取需求摘要、功能点、涉及字段、标签等
- **批量处理**：支持单个需求或全量需求分析
- **实时进度**：通过 SSE 实时展示分析进度

### 🔄 文档同步
- **分阶段同步**：代码分析 → 对话分析 → 增量合并
- **大内容分块**：自动处理大量代码变更和会话内容
- **DSH 会话集成**：从当前会话提取需求背景和设计决策

### 🔍 搜索与索引
- **全文搜索**：按功能点、字段、标签搜索需求
- **智能索引**：自动构建和更新搜索索引

### 📋 模板生成
- **多种模板**：需求文档、技术方案、CR 记录
- **AI 增强**：支持 AI 辅助生成模板内容

### 📍 定位会话需求
- **一键定位**：根据当前 DSH 会话的工作目录和 Git 分支，自动定位对应的需求目录
- **智能匹配**：支持多种分支命名格式，自动展开树节点

## 目录规范

### 需求目录结构
```
docs/
├── {developer}/                    # 开发者目录
│   └── {YYYY-MM-DD}-{title}/       # 需求目录
│       ├── requirement.md           # 需求文档
│       ├── design.md                # 技术方案
│       ├── cr-notes.md              # CR 记录
│       └── .meta.json               # AI 分析元数据
```

### Git 分支命名规范
支持三种格式：
1. `feature/{developer}/{YYYY-MM-DD}-{title}` - 新格式（推荐）
2. `feature/{developer}-{YYYY-MM-DD}-{title}` - 旧格式
3. `{YYYY-MM-DD}-{title}` - 无开发者前缀

## 安装

```bash
# 在 DSH 中安装本地插件
# 将插件目录放置在 DSH 的插件目录下，或通过 DSH 配置加载
```

## 使用方法

### 基本操作
1. 在 DSH 侧边栏点击 "Docs" 按钮打开插件
2. 顶部工具栏显示当前项目路径、工作区、需求目录
3. 点击 **定位会话需求** 按钮自动定位到当前会话对应的需求

### 创建需求目录
1. 点击 **新建** 按钮
2. 自动从当前 Git 分支解析开发者、日期、标题
3. 确认后自动创建目录

### AI 分析
1. 点击 **工作台** → **分析**
2. 选择单需求分析或全量分析
3. 查看实时分析进度

### 文档同步
1. 点击 **同步** 按钮
2. 选择同步需求文档或技术方案
3. 系统自动分析代码变更和会话内容，增量更新文档

## 配置

配置文件 `config.json`：

```json
{
  "docsDir": "docs",
  "workspaceId": "workspace-id",
  "developerName": "developer-name",
  "requirementId": "2026-10-08-requirement-title",
  "ai": {
    "enabled": true,
    "provider": "deepseek",
    "model": "deepseek-chat",
    "prompts": {
      "analyze": "自定义分析提示词..."
    }
  }
}
```

## 项目结构

```
docs-viewer/
├── package.json           # 包配置
├── config.json            # 插件配置
├── cordis.patch.yml       # Cordis 补丁
├── README.md              # 项目文档
└── src/
    ├── client/
    │   └── index.js       # 客户端 UI (React)
    └── server/
        ├── index.js       # 服务端入口
        ├── ai-engine.js   # AI 分析引擎
        ├── config.js      # 配置管理
        ├── doc-reader.js  # 文档读取
        ├── tree.js        # 目录树构建
        ├── sync-engine.js # 同步引擎
        ├── phased-sync-engine.js  # 分阶段同步
        ├── session-selector.js    # 会话选择器
        ├── content-extractor.js   # 内容提取器
        └── routes/
            ├── config-routes.js   # 配置路由
            ├── tree-routes.js     # 目录树路由
            ├── analyze-routes.js  # 分析路由
            ├── search-routes.js   # 搜索路由
            ├── sync-routes.js     # 同步路由
            └── template-routes.js # 模板路由
```

## API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/docs-viewer/config` | GET/POST | 获取/更新配置 |
| `/docs-viewer/workspaces` | GET | 列出可用工作区 |
| `/docs-viewer/tree` | GET | 获取需求目录树 |
| `/docs-viewer/read` | GET | 读取文件内容 |
| `/docs-viewer/git-branch` | GET | 获取当前 Git 分支 |
| `/docs-viewer/create-dir` | POST | 创建需求目录 |
| `/docs-viewer/analyze-stream` | GET (SSE) | AI 分析流式接口 |
| `/docs-viewer/sync` | POST | 文档同步 |
| `/docs-viewer/search` | GET | 搜索需求 |
| `/docs-viewer/templates` | GET | 获取模板列表 |
| `/docs-viewer/session-info` | GET | 获取会话信息 |

## 依赖注入

插件需要以下 DSH 服务：
- `workspaceRegistry` - 工作区注册表
- `webServer` - Web 服务器
- `llm` - LLM 服务
- `sessionQuery` - 会话查询服务

## License

MIT