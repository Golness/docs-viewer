import { readdir, readFile, writeFile, stat, realpath, mkdir, rename } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';

const ROUTE = '/docs-viewer';
const MAX_DEPTH = 10;
const STATS_CACHE_TTL = 30000; // 30 seconds
const CONFIG_FILE = join(import.meta.dirname, 'config.json');
const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit for request body
const MAX_DOC_CONTENT = 30000; // 5.10: document truncation threshold

// Simple in-memory cache for stats
const statsCache = new Map();

// ─── Operation Logs (in-memory, max 100) ─────────────────────────────
const operationLogs = [];
const MAX_LOGS = 100;

function addLog(type, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,      // 'info' | 'success' | 'warning' | 'error'
    message,
    data
  };
  operationLogs.unshift(entry);
  if (operationLogs.length > MAX_LOGS) {
    operationLogs.pop();
  }
}

// ─── Config ──────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const text = await readFile(CONFIG_FILE, 'utf8');
      return JSON.parse(text);
    }
  } catch {
    // Fall through to default
  }
  return { docsDir: 'docs' };
}

async function saveConfig(config) {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  statsCache.clear();
}

function getCachedStats(key) {
  const entry = statsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > STATS_CACHE_TTL) {
    statsCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedStats(key, data) {
  statsCache.set(key, { data, timestamp: Date.now() });
}

// ─── Path Safety ─────────────────────────────────────────────────────
function isInside(parent, child) {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);

  const normalizedParent = process.platform === 'win32'
    ? resolvedParent.toLowerCase()
    : resolvedParent;
  const normalizedChild = process.platform === 'win32'
    ? resolvedChild.toLowerCase()
    : resolvedChild;

  const rel = relative(normalizedParent, normalizedChild);
  return rel && !rel.startsWith('..') && !isAbsolute(rel);
}

// ─── Walk docs directory ─────────────────────────────────────────────
async function walkDocs(root, ext, maxDepth = MAX_DEPTH) {
  const results = [];
  const visited = new Set();
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (depth > maxDepth) continue;

    let realDir;
    try {
      realDir = await realpath(dir);
    } catch {
      continue;
    }

    if (visited.has(realDir)) continue;
    visited.add(realDir);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        stack.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
        if (!isInside(root, full)) continue;

        const info = await stat(full).catch(() => null);
        results.push({
          path: full,
          relative: full.slice(resolve(root).length + 1),
          name: entry.name,
          size: info?.size ?? 0,
        });
      }
    }
  }

  results.sort((a, b) => a.relative.localeCompare(b.relative));
  return results;
}

// ─── Requirement directory parsing ───────────────────────────────────
const REQ_DIR_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

function parseRequirementDir(dirName) {
  const m = dirName.match(REQ_DIR_RE);
  if (!m) return null;
  return {
    id: dirName,
    date: m[1],
    title: m[2],
  };
}

function inferDocType(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('requirement')) return 'requirement';
  if (lower.includes('design')) return 'design';
  if (lower.includes('cr')) return 'cr';
  return 'other';
}

// ─── Build tree (3-level: developer → requirement → files) ───────────
async function buildTree(docsDir) {
  const tree = { developers: [] };

  let devEntries;
  try {
    devEntries = await readdir(docsDir, { withFileTypes: true });
  } catch {
    return tree;
  }

  for (const entry of devEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const devPath = join(docsDir, entry.name);
    const devNode = {
      name: entry.name,
      requirementCount: 0,
      requirements: [],
    };

    let reqDirs;
    try {
      reqDirs = await readdir(devPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const rd of reqDirs) {
      if (!rd.isDirectory()) continue;
      const parsed = parseRequirementDir(rd.name);
      if (!parsed) continue;

      const reqPath = join(devPath, rd.name);
      let files;
      try {
        files = await readdir(reqPath);
      } catch {
        files = [];
      }

      const docFiles = files.filter(
        f => f.endsWith('.md') || f.endsWith('.html') || f.endsWith('.htm') || 
             f.endsWith('.txt') || f.endsWith('.text') || f.endsWith('.markdown')
      );
      const hasMeta = files.includes('.meta.json');

      let metaUpdatedAt = null;
      if (hasMeta) {
        try {
          const metaStat = await stat(join(reqPath, '.meta.json'));
          metaUpdatedAt = metaStat.mtime.toISOString();
        } catch { /* ignore */ }
      }

      devNode.requirements.push({
        ...parsed,
        developer: entry.name,
        path: relative(docsDir, reqPath),
        files: docFiles.map(f => ({
          name: f,
          type: inferDocType(f),
        })),
        fileCount: docFiles.length,
        hasMeta,
        metaUpdatedAt,
      });
    }

    // Sort requirements by date descending
    devNode.requirements.sort((a, b) => b.date.localeCompare(a.date));
    devNode.requirementCount = devNode.requirements.length;
    tree.developers.push(devNode);
  }

  // Sort developers alphabetically
  tree.developers.sort((a, b) => a.name.localeCompare(b.name));
  return tree;
}

// ─── Count total requirements across all developers ──────────────────
function countRequirements(tree) {
  return tree.developers.reduce((sum, d) => sum + d.requirementCount, 0);
}

// ─── Find requirement path by id ─────────────────────────────────────
function findRequirementPath(docsDir, tree, requirementId) {
  for (const dev of tree.developers) {
    for (const req of dev.requirements) {
      if (req.id === requirementId) {
        return { path: join(docsDir, req.path), req };
      }
    }
  }
  return null;
}

// ─── JSON response helper ────────────────────────────────────────────
function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ─── Read bounded request body ───────────────────────────────────────
function readBody(req, maxSize = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ─── Document Templates ──────────────────────────────────────────────
const REQUIREMENT_TEMPLATE = `# 需求文档

## 背景
描述需求的背景和原因。

## 目标
明确需求要达成的目标。

## 功能点
- [ ] 功能点 1
- [ ] 功能点 2

## 涉及字段
| 表名 | 字段名 | 变更类型 | 说明 |
|------|--------|---------|------|
|      |        |         |      |

## 验收标准
- [ ] 标准 1
- [ ] 标准 2
`;

const DESIGN_TEMPLATE = `# 技术方案

## 方案概述
简述技术方案的整体思路。

## 架构设计
描述系统架构和模块划分。

## 接口设计
### 接口 1
- 路径：
- 方法：
- 参数：
- 返回：

## 数据库变更
| 表名 | 字段 | 类型 | 说明 |
|------|------|------|------|
|      |      |      |      |

## 风险评估
- 风险 1：
- 风险 2：
`;

const CR_TEMPLATE = `# CR 记录

## CR 时间
YYYY-MM-DD

## 参与人员
- 提交人：
- 审核人：

## CR 意见
### 问题 1
- 严重程度：
- 描述：
- 建议：

### 问题 2
- 严重程度：
- 描述：
- 建议：

## 结论
- [ ] 通过
- [ ] 需修改后通过
- [ ] 不通过
`;

const TEMPLATES = {
  requirement: REQUIREMENT_TEMPLATE,
  design: DESIGN_TEMPLATE,
  cr: CR_TEMPLATE,
};

// ─── .meta.json Schema (1.4, 1.5) ───────────────────────────────────
const META_DEFAULTS = {
  type: 'unknown',
  summary: '',
  features: [],
  fields: [],
  tags: [],
  timeline: [],
};

function validateMeta(meta) {
  const result = { ...META_DEFAULTS };
  if (!meta || typeof meta !== 'object') return result;

  if (typeof meta.type === 'string') result.type = meta.type;
  if (typeof meta.summary === 'string') result.summary = meta.summary;
  if (Array.isArray(meta.features)) result.features = meta.features.filter(f => typeof f === 'string');
  if (Array.isArray(meta.fields)) result.fields = meta.fields.filter(f => typeof f === 'string');
  if (Array.isArray(meta.tags)) result.tags = meta.tags.filter(t => typeof t === 'string');
  if (Array.isArray(meta.timeline)) {
    result.timeline = meta.timeline
      .filter(t => t && typeof t === 'object')
      .map(t => ({
        date: typeof t.date === 'string' ? t.date : '',
        title: typeof t.title === 'string' ? t.title : '',
        type: typeof t.type === 'string' ? t.type : 'other',
        description: typeof t.description === 'string' ? t.description : '',
      }));
  }
  return result;
}

// ─── Default Analyze Prompt (5.6) ────────────────────────────────────
const DEFAULT_ANALYZE_PROMPT = `你是一个需求分析专家。请分析以下需求文档内容，并返回 JSON 格式的结构化数据。

返回格式要求（严格 JSON，不要包含其他文字）：
{
  "type": "large" | "medium" | "small",  // 需求规模
  "summary": "一句话摘要",
  "features": ["功能点1", "功能点2"],     // 提取的功能点
  "fields": ["table.field"],              // 涉及的数据库字段
  "tags": ["标签1", "标签2"],             // 关键词标签
  "timeline": [                           // 时间线事件
    {
      "date": "YYYY-MM-DD",
      "title": "事件标题",
      "type": "requirement" | "design" | "cr" | "release",
      "description": "事件描述"
    }
  ]
}

请基于文档内容进行分析，提取关键信息。`;

// ─── AI Analysis Engine (Module 5) ───────────────────────────────────
async function callLLM(llm, prompt, config) {
  const aiConfig = config.ai || {};
  const temperature = aiConfig.temperature ?? 0.3;
  const maxTokens = aiConfig.maxTokens ?? 4000;

  // Get available providers
  let providers;
  try {
    providers = await llm.listProviders();
    addLog('info', `📋 listProviders() 返回类型: ${typeof providers}, 是否数组: ${Array.isArray(providers)}`);
    if (Array.isArray(providers) && providers.length > 0) {
      addLog('info', `📋 第一个 provider: ${JSON.stringify(providers[0])}`);
      addLog('info', `📋 所有 providers: ${providers.map(p => p.id || p.name || JSON.stringify(p)).join(', ')}`);
    } else {
      addLog('warning', `⚠️ providers 为空或不是数组: ${JSON.stringify(providers)}`);
    }
  } catch (e) {
    addLog('error', `❌ 获取 providers 失败: ${e.message}`);
    providers = [];
  }
  
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error('No LLM providers available. Please configure an LLM provider in DSH settings.');
  }

  // Use the first available provider and its default model
  const firstProvider = providers[0];
  const provider = aiConfig.provider || firstProvider.id || firstProvider.name || firstProvider;
  
  if (!provider || typeof provider !== 'string') {
    throw new Error(`Invalid provider: ${JSON.stringify(provider)}`);
  }
  
  let model = aiConfig.model;

  // If no model specified, get the first model from the provider
  if (!model) {
    try {
      const models = await llm.listModels(provider);
      if (Array.isArray(models) && models.length > 0) {
        model = models[0].id || models[0].name || models[0];
        addLog('info', `📋 可用的 models: ${models.map(m => m.id || m.name || m).join(', ')}`);
      } else {
        throw new Error(`No models available for provider ${provider}`);
      }
    } catch (e) {
      // If listModels fails, try to use the provider's default model
      // Common default models
      const defaultModels = {
        'deepseek': 'deepseek-chat',
        'openai': 'gpt-4',
        'anthropic': 'claude-3-opus-20240229',
        'google': 'gemini-pro',
      };
      model = defaultModels[provider] || 'default';
      addLog('warning', `⚠️ 无法获取模型列表，使用默认模型: ${model}`);
    }
  }

  addLog('info', `🤖 使用模型: ${provider}/${model}`);

  // Create messages in the correct format for DSH LLM
  const systemPrompt = aiConfig.prompts?.analyze || DEFAULT_ANALYZE_PROMPT;
  const userPrompt = prompt;

  // Debug: log what we're sending
  addLog('info', `📋 准备发送 LLM 请求...`);
  addLog('info', `📋 system prompt 长度: ${systemPrompt.length}`);
  addLog('info', `📋 user prompt 长度: ${userPrompt.length}`);

  // Create the content array explicitly
  const userContent = [];
  userContent.push({ type: 'text', text: userPrompt });
  
  addLog('info', `📋 user content items: ${userContent.length}`);
  addLog('info', `📋 user content is array: ${Array.isArray(userContent)}`);

  // Define variables outside try block
  let content = '';
  let finishReason = null;

  addLog('info', `🚀 开始 LLM stream 调用...`);

  try {
    const stream = llm.stream({
      provider,
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
        // Log progress every 10 chunks
        if (chunkCount % 10 === 0) {
          addLog('info', `📥 已接收 ${chunkCount} 个 chunks, 内容长度: ${content.length}`);
        }
      } else if (chunk.type === 'finish') {
        finishReason = chunk.reason;
        addLog('info', `✅ LLM stream 完成, finishReason: ${JSON.stringify(finishReason)}`);
      }
    }
    
    addLog('info', `📊 LLM stream 结束, 共 ${chunkCount} 个 chunks, 内容长度: ${content.length}`);
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

// 5.4: JSON parse with 3-level fallback
function parseAIResponse(text) {
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

// 5.2: Read all document files in a requirement directory
// Supports: .md, .html, .htm, .txt, .text, .doc, .docx (text extraction limited)
const SUPPORTED_DOC_EXTS = ['.md', '.html', '.htm', '.txt', '.text', '.markdown'];

function isSupportedDocFile(filename) {
  const lower = filename.toLowerCase();
  return SUPPORTED_DOC_EXTS.some(ext => lower.endsWith(ext));
}

async function readRequirementDocs(reqPath) {
  let files;
  try {
    files = await readdir(reqPath);
  } catch {
    return '';
  }

  const docFiles = files.filter(f => isSupportedDocFile(f));
  const parts = [];

  for (const f of docFiles) {
    try {
      const content = await readFile(join(reqPath, f), 'utf8');
      // For HTML files, extract text content (simple approach)
      let processedContent = content;
      if (f.toLowerCase().endsWith('.html') || f.toLowerCase().endsWith('.htm')) {
        // Remove script and style tags, then extract text
        processedContent = content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      parts.push(`### ${f}\n${processedContent}`);
    } catch { /* skip unreadable */ }
  }

  let docsContent = parts.join('\n\n---\n\n');

  // 5.10: truncation protection
  if (docsContent.length > MAX_DOC_CONTENT) {
    docsContent = docsContent.slice(0, MAX_DOC_CONTENT) + '\n\n[内容已截断]';
    addLog('warning', `⚠️ 文档内容超过 ${MAX_DOC_CONTENT} 字符，已截断`);
  }

  return docsContent;
}

// 5.5: Atomic write .meta.json
async function writeMetaJson(metaPath, meta) {
  const tmpPath = metaPath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(meta, null, 2), 'utf8');
  await rename(tmpPath, metaPath);
}

// ─── Search Index (Module 6) ─────────────────────────────────────────
function getIndexPath(docsRoot) {
  return join(docsRoot, '.index', 'search-index.json');
}

async function loadIndex(docsRoot) {
  const indexPath = getIndexPath(docsRoot);
  if (!existsSync(indexPath)) return null;
  try {
    return JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    return null;
  }
}

async function saveIndex(docsRoot, index) {
  const indexPath = getIndexPath(docsRoot);
  const indexDir = join(docsRoot, '.index');
  await mkdir(indexDir, { recursive: true });
  // Atomic write
  const tmpPath = indexPath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(index, null, 2), 'utf8');
  await rename(tmpPath, indexPath);
}

// 6.4: Full rebuild index
async function rebuildIndex(docsRoot, tree) {
  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    requirements: [],
    featureIndex: {},
    fieldIndex: {},
    tagIndex: {},
  };

  for (const dev of tree.developers) {
    for (const req of dev.requirements) {
      if (!req.hasMeta) continue;

      const metaPath = join(docsRoot, req.path, '.meta.json');
      let meta;
      try {
        meta = JSON.parse(await readFile(metaPath, 'utf8'));
      } catch {
        continue;
      }

      const entry = {
        id: req.id,
        developer: dev.name,
        date: req.date,
        title: req.title,
        type: meta.type || 'unknown',
        summary: meta.summary || '',
        features: meta.features || [],
        fields: meta.fields || [],
        tags: meta.tags || [],
        timeline: meta.timeline || [],
      };

      index.requirements.push(entry);

      // Build inverted indices
      for (const feature of (meta.features || [])) {
        if (!index.featureIndex[feature]) index.featureIndex[feature] = [];
        index.featureIndex[feature].push(req.id);
      }
      for (const field of (meta.fields || [])) {
        if (!index.fieldIndex[field]) index.fieldIndex[field] = [];
        index.fieldIndex[field].push(req.id);
      }
      for (const tag of (meta.tags || [])) {
        if (!index.tagIndex[tag]) index.tagIndex[tag] = [];
        index.tagIndex[tag].push(req.id);
      }
    }
  }

  await saveIndex(docsRoot, index);
  return index;
}

// 6.3: Incremental update index entry
async function updateIndexEntry(docsRoot, reqId, devName, date, title, meta) {
  let index = await loadIndex(docsRoot);
  if (!index) return; // Index not built yet, skip

  // Remove old entry
  index.requirements = index.requirements.filter(r => r.id !== reqId);

  // Clean inverted indices
  for (const idx of ['featureIndex', 'fieldIndex', 'tagIndex']) {
    for (const key of Object.keys(index[idx] || {})) {
      index[idx][key] = (index[idx][key] || []).filter(id => id !== reqId);
      if (index[idx][key].length === 0) delete index[idx][key];
    }
  }

  // Add new entry
  const entry = {
    id: reqId,
    developer: devName,
    date,
    title,
    type: meta.type || 'unknown',
    summary: meta.summary || '',
    features: meta.features || [],
    fields: meta.fields || [],
    tags: meta.tags || [],
    timeline: meta.timeline || [],
  };
  index.requirements.push(entry);

  // Update inverted indices
  for (const feature of (meta.features || [])) {
    if (!index.featureIndex[feature]) index.featureIndex[feature] = [];
    index.featureIndex[feature].push(reqId);
  }
  for (const field of (meta.fields || [])) {
    if (!index.fieldIndex[field]) index.fieldIndex[field] = [];
    index.fieldIndex[field].push(reqId);
  }
  for (const tag of (meta.tags || [])) {
    if (!index.tagIndex[tag]) index.tagIndex[tag] = [];
    index.tagIndex[tag].push(reqId);
  }

  index.builtAt = new Date().toISOString();
  await saveIndex(docsRoot, index);
}

// ─── Plugin Entry ────────────────────────────────────────────────────
export const inject = ['workspaceRegistry', 'webServer', 'llm'];

export function apply(ctx) {
  const registry = ctx.workspaceRegistry;
  const webServer = ctx.webServer;
  const llm = ctx.llm;
  const disposers = [];

  addLog('info', '🚀 docs-viewer 插件启动 (P1)');

  const routes = [
    // ── GET /config ──────────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/config`,
      async handler(req, res) {
        if (req.method === 'GET') {
          const config = await loadConfig();
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store, no-cache, must-revalidate',
            'pragma': 'no-cache',
          });
          res.end(JSON.stringify(config));
          return;
        }
        if (req.method === 'POST') {
          try {
            const raw = await readBody(req);
            const newConfig = JSON.parse(raw);
            if (!newConfig.docsDir || typeof newConfig.docsDir !== 'string') {
              json(res, { error: 'docsDir must be a non-empty string' }, 400);
              return;
            }
            if (isAbsolute(newConfig.docsDir) || newConfig.docsDir.includes('..')) {
              json(res, { error: 'docsDir must be a relative path without ..' }, 400);
              return;
            }
            await saveConfig(newConfig);
            const verify = await loadConfig();
            addLog('success', `⚙️ 配置已更新: docsDir=${verify.docsDir}`);
            json(res, verify);
          } catch (e) {
            json(res, { error: 'Invalid JSON' }, 400);
          }
          return;
        }
        res.writeHead(405); res.end();
      },
    },

    // ── GET /workspaces ──────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/workspaces`,
      handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const workspaces = registry.list();
        const items = workspaces.map(w => ({ id: w.id, title: w.title || w.id, path: w.path }));
        json(res, items);
      },
    },

    // ── GET /stats ───────────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/stats`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

        const config = await loadConfig();
        const cacheKey = `all-workspaces:${config.docsDir}`;
        const cached = getCachedStats(cacheKey);
        if (cached) {
          json(res, cached);
          return;
        }

        const workspaces = registry.list();
        const stats = [];

        for (const w of workspaces) {
          const docsRoot = resolve(w.path, config.docsDir);
          let docCount = 0, exists = false;

          try {
            const info = await stat(docsRoot);
            if (info.isDirectory()) {
              exists = true;
              // Count all supported document types
              for (const ext of SUPPORTED_DOC_EXTS) {
                const items = await walkDocs(docsRoot, ext);
                docCount += items.length;
              }
            }
          } catch { /* ignore */ }

          stats.push({ workspaceId: w.id, title: w.title || w.id, docCount, exists });
        }

        setCachedStats(cacheKey, stats);
        json(res, stats);
      },
    },

    // ── GET /list ────────────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/list`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const ext = (url.searchParams.get('ext') || '.md').toLowerCase();

        // Support all document types
        if (!SUPPORTED_DOC_EXTS.includes(ext) && ext !== '.html') {
          json(res, { error: `ext must be one of: ${SUPPORTED_DOC_EXTS.join(', ')}` }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaceId ? workspaces.find(w => w.id === workspaceId) : null;

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        let docsStat;

        try {
          docsStat = await stat(docsRoot);
        } catch {
          json(res, { items: [], docsRoot, exists: false });
          return;
        }

        if (!docsStat.isDirectory()) {
          json(res, { items: [], docsRoot, exists: false });
          return;
        }

        const items = await walkDocs(docsRoot, ext);
        json(res, { items, docsRoot, exists: true, workspace: workspace.id });
      },
    },

    // ── GET /read ────────────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/read`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const rel = url.searchParams.get('path') || '';

        const workspaces = registry.list();
        const workspace = workspaceId ? workspaces.find(w => w.id === workspaceId) : null;

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        const target = resolve(docsRoot, rel);

        if (!isInside(docsRoot, target)) {
          json(res, { error: 'path outside docs' }, 400);
          return;
        }

        let info;
        try {
          info = await stat(target);
        } catch {
          json(res, { error: 'not found' }, 404);
          return;
        }

        if (!info.isFile()) {
          json(res, { error: 'not a file' }, 400);
          return;
        }

        const lower = target.toLowerCase();
        if (!lower.endsWith('.md') && !lower.endsWith('.html') && !lower.endsWith('.json')) {
          json(res, { error: 'unsupported file type' }, 400);
          return;
        }

        const text = await readFile(target, 'utf8');
        json(res, { text, path: target });
      },
    },

    // ── GET /tree ────────────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/tree`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');

        const workspaces = registry.list();
        const workspace = workspaceId ? workspaces.find(w => w.id === workspaceId) : null;

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);

        try {
          await stat(docsRoot);
        } catch {
          json(res, { tree: { developers: [] }, totalRequirements: 0, docsDir: config.docsDir, exists: false });
          return;
        }

        const tree = await buildTree(docsRoot);
        const totalRequirements = countRequirements(tree);

        json(res, { tree, totalRequirements, docsDir: config.docsDir, exists: true });
      },
    },

    // ── GET /git-branch ──────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/git-branch`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');

        if (!workspaceId) {
          json(res, { error: 'missing workspaceId' }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);
        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        try {
          // Try to read .git/HEAD to get current branch
          const gitHeadPath = join(workspace.path, '.git', 'HEAD');
          const headContent = await readFile(gitHeadPath, 'utf8');
          
          // HEAD content is like: "ref: refs/heads/feature/zhangsan-2026-10-08-fix-bug"
          const match = headContent.match(/ref: refs\/heads\/(.+)/);
          if (match) {
            const branchName = match[1].trim();
            json(res, { branch: branchName });
          } else {
            // Detached HEAD or no branch
            json(res, { branch: null });
          }
        } catch {
          // Not a git repo or .git/HEAD doesn't exist
          json(res, { branch: null });
        }
      },
    },

    // ── POST /create-dir ─────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/create-dir`,
      async handler(req, res) {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

        try {
          const raw = await readBody(req);
          const { workspaceId, developer, date, title } = JSON.parse(raw);

          if (!workspaceId || !developer || !date || !title) {
            json(res, { error: 'missing required fields: workspaceId, developer, date, title' }, 400);
            return;
          }

          if (/[\\/]/.test(developer) || developer.startsWith('.')) {
            json(res, { error: 'invalid developer name' }, 400);
            return;
          }

          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            json(res, { error: 'date must be YYYY-MM-DD format' }, 400);
            return;
          }

          const workspaces = registry.list();
          const workspace = workspaces.find(w => w.id === workspaceId);
          if (!workspace) {
            json(res, { error: 'workspace not found' }, 404);
            return;
          }

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const dirName = `${date}-${title}`;
          const targetPath = join(docsRoot, developer, dirName);

          if (!isInside(docsRoot, targetPath)) {
            json(res, { error: 'path outside docs' }, 400);
            return;
          }

          if (existsSync(targetPath)) {
            json(res, { error: 'directory already exists' }, 409);
            return;
          }

          await mkdir(targetPath, { recursive: true });
          addLog('success', `📁 创建目录: ${developer}/${dirName}`);
          json(res, { success: true, path: relative(docsRoot, targetPath), fullPath: targetPath });
        } catch (e) {
          addLog('error', `❌ 创建目录失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      },
    },

    // ── POST /generate-template ──────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/generate-template`,
      async handler(req, res) {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

        try {
          const raw = await readBody(req);
          const { workspaceId, requirementId, docType, useAI } = JSON.parse(raw);

          if (!workspaceId || !requirementId || !docType) {
            json(res, { error: 'missing required fields' }, 400);
            return;
          }

          if (!TEMPLATES[docType]) {
            json(res, { error: `unknown docType: ${docType}` }, 400);
            return;
          }

          const workspaces = registry.list();
          const workspace = workspaces.find(w => w.id === workspaceId);
          if (!workspace) {
            json(res, { error: 'workspace not found' }, 404);
            return;
          }

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const tree = await buildTree(docsRoot);
          const found = findRequirementPath(docsRoot, tree, requirementId);

          if (!found) {
            json(res, { error: 'requirement not found' }, 404);
            return;
          }

          let content;
          // 4.23: AI template generation
          if (useAI && llm) {
            try {
              addLog('info', `🤖 AI 生成 ${docType} 模板...`);
              const prompt = `基于以下需求目录信息，生成${docType === 'requirement' ? '需求文档' : docType === 'design' ? '技术方案' : 'CR记录'}模板：\n目录名：${requirementId}\n路径：${found.path}\n\n请生成完整的 Markdown 文档内容。`;
              content = await callLLM(llm, prompt, config);
              addLog('success', `✅ AI 生成 ${docType} 模板完成`);
            } catch (err) {
              addLog('warning', `⚠️ AI 生成失败，降级为静态模板: ${err.message}`);
              content = TEMPLATES[docType];
            }
          } else {
            content = TEMPLATES[docType];
          }

          const fileName = docType === 'cr' ? 'cr-notes.md' : `${docType}.md`;
          const filePath = join(found.path, fileName);

          if (existsSync(filePath)) {
            json(res, { error: `file already exists: ${fileName}`, alreadyExists: true }, 409);
            return;
          }

          await writeFile(filePath, content, 'utf8');
          addLog('success', `📋 生成${docType}文档模板: ${fileName}`);
          json(res, { success: true, path: filePath, fileName, content });
        } catch (e) {
          addLog('error', `❌ 生成模板失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      },
    },

    // ── POST /analyze (5.1-5.12) ─────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/analyze`,
      async handler(req, res) {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

        const startTime = Date.now();

        try {
          const raw = await readBody(req);
          const { workspaceId, requirementId } = JSON.parse(raw);

          if (!workspaceId || !requirementId) {
            json(res, { error: 'missing required fields' }, 400);
            return;
          }

          if (!llm) {
            json(res, { error: 'LLM service not available' }, 503);
            return;
          }

          const workspaces = registry.list();
          const workspace = workspaces.find(w => w.id === workspaceId);
          if (!workspace) {
            json(res, { error: 'workspace not found' }, 404);
            return;
          }

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const tree = await buildTree(docsRoot);
          const found = findRequirementPath(docsRoot, tree, requirementId);

          if (!found) {
            json(res, { error: 'requirement not found' }, 404);
            return;
          }

          // 5.8: Progress logs
          addLog('info', `📄 开始分析需求: ${requirementId}`);

          // 5.2: Read documents
          const docsContent = await readRequirementDocs(found.path);
          if (!docsContent) {
            addLog('error', `❌ 需求目录下没有支持的文档文件 (.md/.html/.txt 等)`);
            json(res, { error: 'no supported document files found in requirement directory' }, 400);
            return;
          }

          const docFiles = (await readdir(found.path)).filter(f => isSupportedDocFile(f));
          addLog('info', `📄 读取 ${docFiles.length} 个文档 (${docFiles.join(', ')})`);

          // 5.1: Call LLM
          addLog('info', '🔄 调用 ctx.llm 分析文档...');
          const prompt = `需求目录名: ${requirementId}\n\n以下是需求文档内容:\n\n${docsContent}`;
          const rawResponse = await callLLM(llm, prompt, config);

          // 5.3, 5.4: Parse with fallback
          let meta = parseAIResponse(rawResponse);
          meta = validateMeta(meta);

          // 5.5: Write .meta.json atomically
          const metaPath = join(found.path, '.meta.json');
          await writeMetaJson(metaPath, meta);

          // 6.3: Incremental index update
          await updateIndexEntry(docsRoot, requirementId, found.req.developer, found.req.date, found.req.title, meta);

          // 5.9: Timing
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          addLog('success', `✅ 分析完成: ${requirementId} (${elapsed}s)`);

          json(res, { success: true, meta, elapsed: parseFloat(elapsed) });
        } catch (e) {
          // 5.11: Error handling
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          addLog('error', `❌ 分析失败 (${elapsed}s): ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      },
    },

    // ── GET /analyze-preview ─────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/analyze-preview`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

        try {
          const url = new URL(req.url, 'http://localhost');
          const workspaceId = url.searchParams.get('workspaceId');
          const requirementId = url.searchParams.get('requirementId');

          if (!workspaceId) {
            json(res, { error: 'missing workspaceId' }, 400);
            return;
          }

          const workspaces = registry.list();
          const workspace = workspaces.find(w => w.id === workspaceId);
          if (!workspace) {
            json(res, { error: 'workspace not found' }, 404);
            return;
          }

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const tree = await buildTree(docsRoot);

          const files = [];
          
          if (requirementId) {
            // Single requirement mode
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                if (req.id === requirementId) {
                  const reqPath = join(docsRoot, req.path);
                  const docs = await readRequirementDocs(reqPath);
                  files.push({
                    id: req.id,
                    developer: dev.name,
                    path: req.path,
                    hasDocs: !!docs,
                    fileCount: req.fileCount,
                    hasMeta: req.hasMeta,
                  });
                  break;
                }
              }
            }
          } else {
            // All requirements mode
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                const reqPath = join(docsRoot, req.path);
                const docs = await readRequirementDocs(reqPath);
                files.push({
                  id: req.id,
                  developer: dev.name,
                  path: req.path,
                  hasDocs: !!docs,
                  fileCount: req.fileCount,
                  hasMeta: req.hasMeta,
                });
              }
            }
          }

          json(res, { files });
        } catch (e) {
          json(res, { error: e.message }, 500);
        }
      },
    },

    // ── GET /analyze-stream (SSE) ────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/analyze-stream`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const requirementId = url.searchParams.get('requirementId');

        if (!workspaceId) {
          json(res, { error: 'missing workspaceId' }, 400);
          return;
        }

        if (!llm) {
          json(res, { error: 'LLM service not available' }, 503);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);
        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        // Set up SSE
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const sendEvent = (data) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        const startTime = Date.now();

        try {
          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const tree = await buildTree(docsRoot);

          let total = 0, success = 0, failed = 0;

          if (requirementId) {
            // Single requirement mode
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                if (req.id === requirementId) {
                  total++;
                  const reqId = req.id;
                  const reqStartTime = Date.now();

                  sendEvent({ type: 'start', id: reqId, developer: dev.name, path: req.path });

                  try {
                    addLog('info', `📄 分析: ${dev.name}/${req.id}`);

                    const docsContent = await readRequirementDocs(join(docsRoot, req.path));
                    if (!docsContent) {
                      addLog('warning', `⚠️ 跳过: ${req.id} (无支持的文档文件)`);
                      failed++;
                      sendEvent({ type: 'failed', id: reqId, error: '无支持的文档文件' });
                      continue;
                    }

                    sendEvent({ type: 'analyzing', id: reqId });

                    const prompt = `需求目录名: ${req.id}\n\n以下是需求文档内容:\n\n${docsContent}`;
                    const rawResponse = await callLLM(llm, prompt, config);
                    let meta = parseAIResponse(rawResponse);
                    meta = validateMeta(meta);

                    const metaPath = join(docsRoot, req.path, '.meta.json');
                    await writeMetaJson(metaPath, meta);

                    const elapsed = ((Date.now() - reqStartTime) / 1000).toFixed(1);
                    addLog('success', `✅ 完成: ${req.id} (${elapsed}s)`);
                    success++;
                    sendEvent({ type: 'completed', id: reqId, elapsed });
                  } catch (e) {
                    const elapsed = ((Date.now() - reqStartTime) / 1000).toFixed(1);
                    addLog('error', `❌ 失败: ${req.id} (${elapsed}s): ${e.message}`);
                    failed++;
                    sendEvent({ type: 'failed', id: reqId, error: e.message });
                  }
                  break;
                }
              }
            }
          } else {
            // All requirements mode
            for (const dev of tree.developers) {
              for (const req of dev.requirements) {
                total++;
                const reqId = req.id;
                const reqStartTime = Date.now();

                sendEvent({ type: 'start', id: reqId, developer: dev.name, path: req.path });

                try {
                  addLog('info', `📄 [${total}] 分析: ${dev.name}/${req.id}`);

                  const docsContent = await readRequirementDocs(join(docsRoot, req.path));
                  if (!docsContent) {
                    addLog('warning', `⚠️ 跳过: ${req.id} (无支持的文档文件)`);
                    failed++;
                    sendEvent({ type: 'failed', id: reqId, error: '无支持的文档文件' });
                    continue;
                  }

                  sendEvent({ type: 'analyzing', id: reqId });

                  const prompt = `需求目录名: ${req.id}\n\n以下是需求文档内容:\n\n${docsContent}`;
                  const rawResponse = await callLLM(llm, prompt, config);
                  let meta = parseAIResponse(rawResponse);
                  meta = validateMeta(meta);

                  const metaPath = join(docsRoot, req.path, '.meta.json');
                  await writeMetaJson(metaPath, meta);

                  const elapsed = ((Date.now() - reqStartTime) / 1000).toFixed(1);
                  addLog('success', `✅ [${total}] 完成: ${req.id} (${elapsed}s)`);
                  success++;
                  sendEvent({ type: 'completed', id: reqId, elapsed });
                } catch (e) {
                  const elapsed = ((Date.now() - reqStartTime) / 1000).toFixed(1);
                  addLog('error', `❌ [${total}] 失败: ${req.id} (${elapsed}s): ${e.message}`);
                  failed++;
                  sendEvent({ type: 'failed', id: reqId, error: e.message });
                }
              }
            }
          }

          // Rebuild index after all analysis
          addLog('info', '🔨 分析完成，重建索引...');
          const updatedTree = await buildTree(docsRoot);
          await rebuildIndex(docsRoot, updatedTree);

          const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          sendEvent({ type: 'done', total, success, failed, elapsed: totalElapsed });
          res.end();
        } catch (e) {
          sendEvent({ type: 'error', error: e.message });
          res.end();
        }
      },
    },

    // ── POST /analyze-all (4.4, 5.12) ────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/analyze-all`,
      async handler(req, res) {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

        const startTime = Date.now();

        try {
          const raw = await readBody(req);
          const { workspaceId } = JSON.parse(raw);

          if (!workspaceId) {
            json(res, { error: 'missing workspaceId' }, 400);
            return;
          }

          if (!llm) {
            json(res, { error: 'LLM service not available' }, 503);
            return;
          }

          const workspaces = registry.list();
          const workspace = workspaces.find(w => w.id === workspaceId);
          if (!workspace) {
            json(res, { error: 'workspace not found' }, 404);
            return;
          }

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);
          const tree = await buildTree(docsRoot);

          let total = 0, success = 0, failed = 0;
          const results = [];

          for (const dev of tree.developers) {
            for (const req of dev.requirements) {
              total++;
              const reqStartTime = Date.now();

              try {
                addLog('info', `📄 [${total}] 分析: ${dev.name}/${req.id}`);

                const docsContent = await readRequirementDocs(join(docsRoot, req.path));
                if (!docsContent) {
                  addLog('warning', `⚠️ 跳过: ${req.id} (无支持的文档文件)`);
                  failed++;
                  results.push({ id: req.id, status: 'skipped', reason: 'no supported document files' });
                  continue;
                }

                const prompt = `需求目录名: ${req.id}\n\n以下是需求文档内容:\n\n${docsContent}`;
                const rawResponse = await callLLM(llm, prompt, config);
                let meta = parseAIResponse(rawResponse);
                meta = validateMeta(meta);

                const metaPath = join(docsRoot, req.path, '.meta.json');
                await writeMetaJson(metaPath, meta);

                const elapsed = ((Date.now() - reqStartTime) / 1000).toFixed(1);
                addLog('success', `✅ [${total}] 完成: ${req.id} (${elapsed}s)`);
                success++;
                results.push({ id: req.id, status: 'success' });
              } catch (e) {
                // 5.12: Failed requirements are skipped, not blocking
                const elapsed = ((Date.now() - reqStartTime) / 1000).toFixed(1);
                addLog('error', `❌ [${total}] 失败: ${req.id} (${elapsed}s): ${e.message}`);
                failed++;
                results.push({ id: req.id, status: 'error', error: e.message });
              }
            }
          }

          // Rebuild index after all analysis
          addLog('info', '🔨 全量分析完成，重建索引...');
          const updatedTree = await buildTree(docsRoot);
          await rebuildIndex(docsRoot, updatedTree);

          const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          addLog('success', `✅ 全量分析完成: ${success}/${total} 成功, ${failed} 失败 (${totalElapsed}s)`);

          json(res, { success: true, total, successCount: success, failedCount: failed, elapsed: parseFloat(totalElapsed), results });
        } catch (e) {
          addLog('error', `❌ 全量分析失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      },
    },

    // ── POST /rebuild-index (4.5, 6.4) ───────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/rebuild-index`,
      async handler(req, res) {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

        const startTime = Date.now();

        try {
          const raw = await readBody(req);
          const { workspaceId } = JSON.parse(raw);

          if (!workspaceId) {
            json(res, { error: 'missing workspaceId' }, 400);
            return;
          }

          const workspaces = registry.list();
          const workspace = workspaces.find(w => w.id === workspaceId);
          if (!workspace) {
            json(res, { error: 'workspace not found' }, 404);
            return;
          }

          const config = await loadConfig();
          const docsRoot = resolve(workspace.path, config.docsDir);

          addLog('info', '🔨 开始重建索引...');
          const tree = await buildTree(docsRoot);
          const index = await rebuildIndex(docsRoot, tree);

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const stats = {
            requirements: index.requirements.length,
            features: Object.keys(index.featureIndex).length,
            fields: Object.keys(index.fieldIndex).length,
            tags: Object.keys(index.tagIndex).length,
          };

          addLog('success', `🔨 索引重建完成 (${stats.requirements} req, ${stats.features} features, ${stats.fields} fields) (${elapsed}s)`);

          json(res, { success: true, stats, elapsed: parseFloat(elapsed) });
        } catch (e) {
          addLog('error', `❌ 重建索引失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      },
    },

    // ── GET /search (3.1-3.3, 3.9-3.11) ─────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/search`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const q = (url.searchParams.get('q') || '').toLowerCase().trim();
        const type = url.searchParams.get('type') || 'all'; // all | feature | field | tag

        if (!workspaceId) {
          json(res, { error: 'missing workspaceId' }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);
        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        const index = await loadIndex(docsRoot);

        if (!index) {
          json(res, { results: [], total: 0, indexBuilt: false });
          return;
        }

        // Collect matching requirement IDs
        const matchedIds = new Set();

        if (!q) {
          // No query: return all requirements
          for (const r of index.requirements) {
            matchedIds.add(r.id);
          }
        } else {
          // Search in featureIndex
          if (type === 'all' || type === 'feature') {
            for (const [key, ids] of Object.entries(index.featureIndex || {})) {
              if (key.toLowerCase().includes(q)) {
                for (const id of ids) matchedIds.add(id);
              }
            }
          }

          // Search in fieldIndex
          if (type === 'all' || type === 'field') {
            for (const [key, ids] of Object.entries(index.fieldIndex || {})) {
              if (key.toLowerCase().includes(q)) {
                for (const id of ids) matchedIds.add(id);
              }
            }
          }

          // Search in tagIndex
          if (type === 'all' || type === 'tag') {
            for (const [key, ids] of Object.entries(index.tagIndex || {})) {
              if (key.toLowerCase().includes(q)) {
                for (const id of ids) matchedIds.add(id);
              }
            }
          }

          // Also search in summary/title
          if (type === 'all') {
            for (const r of index.requirements) {
              if (r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q)) {
                matchedIds.add(r.id);
              }
            }
          }
        }

        // Build results with matched keys for snippets
        const results = [];
        for (const r of index.requirements) {
          if (!matchedIds.has(r.id)) continue;

          // Find matched features/fields/tags for highlighting
          const matchedFeatures = (r.features || []).filter(f => f.toLowerCase().includes(q));
          const matchedFields = (r.fields || []).filter(f => f.toLowerCase().includes(q));
          const matchedTags = (r.tags || []).filter(t => t.toLowerCase().includes(q));

          results.push({
            id: r.id,
            developer: r.developer,
            date: r.date,
            title: r.title,
            type: r.type,
            summary: r.summary,
            features: r.features,
            fields: r.fields,
            tags: r.tags,
            timeline: r.timeline || [],
            matchedFeatures,
            matchedFields,
            matchedTags,
          });
        }

        // Sort by date descending
        results.sort((a, b) => b.date.localeCompare(a.date));

        json(res, { results, total: results.length, indexBuilt: true });
      },
    },

    // ── GET /requirements/:id (3.4-3.5, 3.15) ───────────────────────
    {
      kind: 'prefix',
      path: `${ROUTE}/requirements/`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const reqId = decodeURIComponent(url.pathname.slice(`${ROUTE}/requirements/`.length));

        if (!workspaceId || !reqId) {
          json(res, { error: 'missing workspaceId or requirement id' }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaces.find(w => w.id === workspaceId);
        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        const tree = await buildTree(docsRoot);
        const found = findRequirementPath(docsRoot, tree, reqId);

        if (!found) {
          json(res, { error: 'requirement not found' }, 404);
          return;
        }

        // Read .meta.json if exists
        const metaPath = join(found.path, '.meta.json');
        let meta = null;
        if (existsSync(metaPath)) {
          try {
            meta = JSON.parse(await readFile(metaPath, 'utf8'));
          } catch { /* ignore */ }
        }

        json(res, {
          id: found.req.id,
          developer: found.req.developer,
          date: found.req.date,
          title: found.req.title,
          path: found.req.path,
          files: found.req.files,
          hasMeta: found.req.hasMeta,
          metaUpdatedAt: found.req.metaUpdatedAt,
          meta,
        });
      },
    },

    // ── GET /index-status ────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/index-status`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');

        const workspaces = registry.list();
        const workspace = workspaceId ? workspaces.find(w => w.id === workspaceId) : null;

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        const indexPath = getIndexPath(docsRoot);

        if (!existsSync(indexPath)) {
          json(res, { built: false, builtAt: null, stats: null });
          return;
        }

        try {
          const indexStat = await stat(indexPath);
          const index = JSON.parse(await readFile(indexPath, 'utf8'));
          json(res, {
            built: true,
            builtAt: index.builtAt || indexStat.mtime.toISOString(),
            stats: {
              requirements: (index.requirements || []).length,
              features: Object.keys(index.featureIndex || {}).length,
              fields: Object.keys(index.fieldIndex || {}).length,
              tags: Object.keys(index.tagIndex || {}).length,
            },
          });
        } catch {
          json(res, { built: false, builtAt: null, stats: null });
        }
      },
    },

    // ── GET /logs ────────────────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/logs`,
      handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        json(res, { logs: operationLogs });
      },
    },

    // ── GET /ai-config (4.16) ────────────────────────────────────────
    {
      kind: 'exact',
      path: `${ROUTE}/ai-config`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const config = await loadConfig();
        const ai = config.ai || {};
        json(res, {
          enabled: ai.enabled !== false,
          provider: ai.provider || 'deepseek',
          model: ai.model || 'deepseek-chat',
          temperature: ai.temperature ?? 0.3,
          maxTokens: ai.maxTokens ?? 4000,
          hasCustomPrompt: !!ai.prompts?.analyze,
        });
      },
    },
  ];

  for (const route of routes) {
    try {
      const dispose = webServer.register(route);
      disposers.push(dispose);
    } catch (err) {
      if (!String(err.message).includes('duplicate')) {
        throw err;
      }
    }
  }

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
    statsCache.clear();
  };
}
