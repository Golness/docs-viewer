'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect, useRef, useLayoutEffect } = React;
const { ROUTE, MARKED_SCRIPT_ID, MERMAID_SCRIPT_ID, HIGHLIGHT_SCRIPT_ID } = require('../constants.js');

// ─── Script loading hook ─────────────────────────────────────────
function useScript(src, id, globalName) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (window[globalName]) { setLoaded(true); return; }
    let script = document.getElementById(id);
    if (script) {
      const checkInterval = setInterval(() => {
        if (window[globalName]) { clearInterval(checkInterval); setLoaded(true); }
      }, 100);
      const timeout = setTimeout(() => { clearInterval(checkInterval); setError(true); }, 5000);
      return () => { clearInterval(checkInterval); clearTimeout(timeout); };
    }
    script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.onload = () => setLoaded(true);
    script.onerror = () => setError(true);
    document.head.appendChild(script);
  }, [src, id, globalName]);

  return { loaded, error };
}

function getMermaidTheme() {
  const isDarkMode = document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDarkMode ? 'dark' : 'default';
}

function sanitizeHtml(html) {
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '');
  clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"vbscript:[^"]*"|'vbscript:[^']*'|vbscript:[^\s>]+)/gi, '');
  clean = clean.replace(/\ssrc\s*=\s*(?:"data:[^"]*"|'data:[^']*'|data:[^\s>]+)/gi, '');
  return clean;
}

function Spinner() {
  return h('div', { className: 'dv-loading' }, h('div', { className: 'dv-spinner' }), 'Loading…');
}

// ─── SkillPreview (Markdown + Mermaid) ───────────────
function SkillPreview({ skillName, workspaceId, onBack }) {
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);
  const [rendered, setRendered] = useState('');
  const markdownRef = useRef(null);
  const mermaidInitRef = useRef(false);
  const mermaidRenderIdRef = useRef(0);

  const { loaded: markedLoaded } = useScript(
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js', MARKED_SCRIPT_ID, 'marked',
  );
  const { loaded: mermaidLoaded } = useScript(
    'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js', MERMAID_SCRIPT_ID, 'mermaid',
  );
  const { loaded: hljsLoaded } = useScript(
    'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js', HIGHLIGHT_SCRIPT_ID, 'hljs',
  );

  useEffect(() => {
    if (!document.getElementById('req-hub-hljs-css')) {
      const link = document.createElement('link');
      link.id = 'req-hub-hljs-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/atom-one-dark.min.css';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 获取 sessionId
        let sessionId = '';
        try {
          const ctx = window.__DSH_CTX__;
          if (ctx) {
            const uiWorkspace = ctx.get?.('uiWorkspace');
            if (uiWorkspace?.selection && typeof uiWorkspace.selection.getSnapshot === 'function') {
              const selection = uiWorkspace.selection.getSnapshot();
              if (selection?.sessionId) {
                sessionId = selection.sessionId;
              }
            }
          }
        } catch (e) {
          // 忽略错误
        }

        const url = sessionId
          ? `${ROUTE}/skill-content?name=${encodeURIComponent(skillName)}&workspaceId=${encodeURIComponent(workspaceId || '')}&sessionId=${encodeURIComponent(sessionId)}`
          : `${ROUTE}/skill-content?name=${encodeURIComponent(skillName)}&workspaceId=${encodeURIComponent(workspaceId || '')}`;

        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data.error || 'load failed');
        else {
          setText(data.content || '');
          setDescription(data.description || '');
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [skillName, workspaceId]);

  useEffect(() => {
    if (mermaidLoaded && window.mermaid && !mermaidInitRef.current) {
      mermaidInitRef.current = true;
      window.mermaid.initialize({ startOnLoad: false, theme: getMermaidTheme(), securityLevel: 'strict' });
    }
  }, [mermaidLoaded]);

  useEffect(() => {
    if (!mermaidInitRef.current || !window.mermaid || !rendered) return;
    const observer = new MutationObserver(() => {
      const newTheme = getMermaidTheme();
      window.mermaid.initialize({ startOnLoad: false, theme: newTheme, securityLevel: 'strict' });
      if (markdownRef.current) {
        markdownRef.current.querySelectorAll('.mermaid-diagram').forEach(div => {
          const code = div.getAttribute('data-mermaid-code');
          if (code) {
            const id = `mermaid-rerender-${Date.now()}-${Math.random()}`;
            window.mermaid.render(id, code).then(({ svg }) => { div.innerHTML = svg; }).catch(() => {});
          }
        });
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, [rendered]);

  useEffect(() => {
    if (!text) { setRendered(''); return; }
    if (markedLoaded && window.marked) {
      setRendered(sanitizeHtml(window.marked.parse(text)));
    }
  }, [text, markedLoaded]);

  useLayoutEffect(() => {
    if (!mermaidInitRef.current || !rendered || !markdownRef.current) return;
    const mermaidBlocks = markdownRef.current.querySelectorAll('code.language-mermaid');
    if (mermaidBlocks.length === 0) return;
    mermaidRenderIdRef.current++;
    const prefix = `mermaid-skill-${mermaidRenderIdRef.current}`;
    mermaidBlocks.forEach(async (block, index) => {
      const pre = block.parentElement;
      const code = block.textContent;
      const id = `${prefix}-${index}`;
      try {
        const { svg } = await window.mermaid.render(id, code);
        const div = document.createElement('div');
        div.className = 'mermaid-diagram';
        div.setAttribute('data-mermaid-code', code);
        div.innerHTML = svg;
        pre.replaceWith(div);
      } catch (e) { /* keep original */ }
    });
  }, [rendered]);

  useLayoutEffect(() => {
    if (!hljsLoaded || !window.hljs || !rendered || !markdownRef.current) return;
    const codeBlocks = markdownRef.current.querySelectorAll('pre code:not(.language-mermaid)');
    if (codeBlocks.length === 0) return;
    codeBlocks.forEach(block => {
      window.hljs.highlightElement(block);
    });
  }, [rendered, hljsLoaded]);

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--dsw-alias-bg-base)' } },
    // Header with back button
    h('div', { style: {
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-1)'
    }},
      h('button', {
        className: 'dv-btn dv-btn-secondary',
        onClick: onBack,
        style: { fontSize: 12, padding: '4px 10px' }
      }, '← 返回设置'),
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontWeight: 600, fontSize: 14 } }, `🔗 ${skillName}`),
        description && h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 2 } }, description)
      )
    ),
    // Content
    h('div', { className: 'dv-preview-body', style: { flex: 1, overflow: 'auto' } },
      error ? h('span', { className: 'dv-error' }, 'Error: ', error)
        : text
          ? (markedLoaded && rendered)
            ? h('div', { ref: markdownRef, className: 'dv-markdown', dangerouslySetInnerHTML: { __html: rendered } })
            : h(Spinner)
          : h(Spinner)
    )
  );
}

// ─── SettingsPanel (4.10) ─────────────────────────────────────────
function SettingsPanel({ workspaceId, onClose }) {
  const [settings, setSettings] = useState({
    ai: {
      selectedModel: '',
      prompts: {},
      skillBindings: {}
    }
  });
  const [llmConfig, setLlmConfig] = useState(null);
  const [promptRegistry, setPromptRegistry] = useState(null);
  const [availableSkills, setAvailableSkills] = useState([]);
  const [expandedPrompts, setExpandedPrompts] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [previewingSkill, setPreviewingSkill] = useState(null); // 预览中的 skill 名称

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // Fetch config
        const configRes = await fetch(`${ROUTE}/config`);
        if (configRes.ok) {
          const data = await configRes.json();
          setSettings({
            ai: {
              selectedModel: data.ai?.selectedModel || '',
              prompts: data.ai?.prompts || {},
              skillBindings: data.ai?.skillBindings || {}
            }
          });
        }
      } catch (err) { console.error('Failed to fetch config:', err); }

      try {
        const llmRes = await fetch(`${ROUTE}/llm-config`);
        if (llmRes.ok) {
          setLlmConfig(await llmRes.json());
        } else {
          setLlmConfig({ error: `HTTP ${llmRes.status}` });
        }
      } catch (err) { setLlmConfig({ error: err.message }); }

      try {
        const promptRes = await fetch(`${ROUTE}/prompt-registry`);
        if (promptRes.ok) {
          const data = await promptRes.json();
          setPromptRegistry(data);
        }
      } catch (err) { console.error('Failed to fetch prompt registry:', err); }

      // Fetch available skills
      try {
        // 尝试从 DSH 上下文获取当前会话 ID
        let sessionId = null;
        try {
          const ctx = window.__DSH_CTX__;
          if (ctx) {
            const uiWorkspace = ctx.get?.('uiWorkspace');
            if (uiWorkspace?.selection && typeof uiWorkspace.selection.getSnapshot === 'function') {
              const selection = uiWorkspace.selection.getSnapshot();
              if (selection?.sessionId) {
                sessionId = selection.sessionId;
              }
            }
          }
        } catch (e) {
          // 忽略错误
        }

        // 构建 URL：优先使用 sessionId，如果没有则使用 workspaceId
        let skillsUrl;
        if (sessionId) {
          skillsUrl = `${ROUTE}/skills?sessionId=${encodeURIComponent(sessionId)}`;
          if (workspaceId) {
            skillsUrl += `&workspaceId=${encodeURIComponent(workspaceId)}`;
          }
        } else if (workspaceId) {
          skillsUrl = `${ROUTE}/skills?workspaceId=${encodeURIComponent(workspaceId)}`;
        } else {
          skillsUrl = `${ROUTE}/skills`;
        }

        console.log('Fetching skills from:', skillsUrl);
        const skillsRes = await fetch(skillsUrl);
        if (skillsRes.ok) {
          const data = await skillsRes.json();
          console.log('Skills API response:', data);
          setAvailableSkills(data.skills || []);
        } else {
          console.error('Skills API error:', skillsRes.status);
        }
      } catch (err) { console.error('Failed to fetch skills:', err); }
    };
    fetchAll();
  }, [workspaceId]);

  // Auto-select first model if none selected
  useEffect(() => {
    if (llmConfig && !llmConfig.error && llmConfig.models?.length > 0 && !settings.ai.selectedModel) {
      setSettings(prev => ({ ...prev, ai: { ...prev.ai, selectedModel: llmConfig.models[0] } }));
    }
  }, [llmConfig, settings.ai.selectedModel]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${ROUTE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '✅ 设置已保存' });
        // Refresh prompt registry to reflect saved state
        const promptRes = await fetch(`${ROUTE}/prompt-registry`);
        if (promptRes.ok) setPromptRegistry(await promptRes.json());
      } else {
        setMessage({ type: 'error', text: '保存失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const togglePrompt = (key) => {
    setExpandedPrompts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePromptChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      ai: {
        ...prev.ai,
        prompts: { ...prev.ai.prompts, [key]: value }
      }
    }));
  };

  const handleSkillBindingChange = (promptKey, skillName) => {
    setSettings(prev => ({
      ...prev,
      ai: {
        ...prev.ai,
        skillBindings: {
          ...prev.ai.skillBindings,
          [promptKey]: skillName || null
        }
      }
    }));
  };

  const handleResetPrompt = (key) => {
    setSettings(prev => {
      const newPrompts = { ...prev.ai.prompts };
      delete newPrompts[key];
      const newSkillBindings = { ...prev.ai.skillBindings };
      delete newSkillBindings[key];
      return {
        ...prev,
        ai: {
          ...prev.ai,
          prompts: newPrompts,
          skillBindings: newSkillBindings
        }
      };
    });
  };

  const handlePreviewSkill = (skillName) => {
    setPreviewingSkill(skillName);
  };

  const handleBackFromPreview = () => {
    setPreviewingSkill(null);
  };

  // 如果正在预览 skill，显示预览组件
  if (previewingSkill) {
    return h(SkillPreview, {
      skillName: previewingSkill,
      workspaceId,
      onBack: handleBackFromPreview
    });
  }

  return h('div', { className: 'dv-op-panel', style: { overflowY: 'auto' } },

    message && h('div', {
      className: `dv-alert dv-alert-${message.type}`,
      style: { marginBottom: 16 }
    }, message.text),

    // ── LLM Config Section ──
    h('div', {
      style: {
        padding: '12px', background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 6, marginBottom: 16, fontSize: 12,
        border: '1px solid var(--dsw-alias-border-l1)'
      }
    },
      h('div', { style: { fontWeight: 600, marginBottom: 8 } }, '🤖 LLM 配置（DSH 全局）'),
      llmConfig
        ? llmConfig.error
          ? h('div', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, '错误: ', llmConfig.error)
          : h('div', null,
              h('div', { style: { marginBottom: 4 } },
                h('span', { style: { fontWeight: 500 } }, 'Provider: '),
                h('code', { style: { background: 'var(--dsw-alias-bg-layer-3)', padding: '2px 6px', borderRadius: 3 } }, llmConfig.provider)
              ),
              h('div', null,
                h('span', { style: { fontWeight: 500 } }, '可用模型: '),
                h('span', { style: { fontSize: 11 } }, llmConfig.models?.join(', ') || '(无)')
              )
            )
        : h('div', null, '加载中...')
    ),

    // ── Model Selection ──
    llmConfig && !llmConfig.error && llmConfig.models?.length > 0 && h('div', { className: 'dv-form-group', style: { display: 'block', marginBottom: 16 } },
      h('label', { className: 'dv-form-label', style: { display: 'block', marginBottom: 8 } }, '选择 LLM 模型'),
      h('select', {
        className: 'dv-form-select',
        value: settings.ai.selectedModel,
        onChange: (e) => setSettings(prev => ({ ...prev, ai: { ...prev.ai, selectedModel: e.target.value } }))
      },
        llmConfig.models.map(model => h('option', { key: model, value: model }, model))
      )
    ),

    // ── Prompt Management Section ──
    h('div', { style: { marginBottom: 16 } },
      h('div', { style: { fontWeight: 600, marginBottom: 12, fontSize: 13 } }, '📝 Prompt 管理'),
      !promptRegistry
        ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '加载 Prompt 列表...')
        : (() => {
            // Group prompts by category
            const groups = {};
            Object.entries(promptRegistry).forEach(([key, meta]) => {
              const category = meta.category || 'default';
              if (!groups[category]) groups[category] = [];
              groups[category].push([key, meta]);
            });

            const categoryLabels = {
              'default': '📋 基础功能',
              'phased-sync': '🔄 分阶段同步'
            };

            return Object.entries(groups).map(([category, prompts]) =>
              h('div', { key: category, style: { marginBottom: 20 } },
                h('div', {
                  style: {
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 10,
                    padding: '6px 10px',
                    background: 'var(--dsw-alias-bg-layer-2)',
                    borderRadius: 4,
                    borderLeft: '3px solid var(--dsw-alias-color-brand)'
                  }
                }, categoryLabels[category] || category),
                prompts.map(([key, meta]) => {
                  const isExpanded = expandedPrompts[key];
                  const currentCustom = settings.ai.prompts[key] || '';
                  const isCustomized = currentCustom.trim().length > 0;
                  const hasSkillBinding = !!settings.ai.skillBindings?.[key];

                  return h('div', {
                    key,
                    style: {
                      marginBottom: 8,
                      border: '1px solid var(--dsw-alias-border-l1)',
                      borderRadius: 6,
                      overflow: 'hidden'
                    }
                  },
                    // Header row (clickable to toggle)
                    h('div', {
                      onClick: () => togglePrompt(key),
                      style: {
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px', cursor: 'pointer',
                        background: 'var(--dsw-alias-bg-layer-2)',
                        borderBottom: isExpanded ? '1px solid var(--dsw-alias-border-l1)' : 'none',
                        fontSize: 12
                      }
                    },
                      h('span', { style: { fontSize: 10, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' } }, '▶'),
                      h('span', { style: { fontWeight: 600 } }, meta.label),
                      hasSkillBinding && h('span', {
                        style: {
                          fontSize: 10, padding: '1px 6px', borderRadius: 8,
                          background: 'var(--dsw-alias-brand-primary-bg)',
                          color: 'var(--dsw-alias-brand-primary)'
                        }
                      }, `🔗 ${settings.ai.skillBindings[key]}`),
                      isCustomized && h('span', {
                        style: {
                          fontSize: 10, padding: '1px 6px', borderRadius: 8,
                          background: 'var(--dsw-alias-state-success-bg)',
                          color: 'var(--dsw-alias-state-success-primary)'
                        }
                      }, '已自定义'),
                      !isCustomized && !hasSkillBinding && h('span', {
                        style: {
                          fontSize: 10, padding: '1px 6px', borderRadius: 8,
                          background: 'var(--dsw-alias-bg-layer-3)',
                          color: 'var(--dsw-alias-label-secondary)'
                        }
                      }, '默认')
                    ),

                    // Expanded content
                    isExpanded && h('div', { style: { padding: '12px' } },
                      // 说明卡片
                      h('div', { style: { marginBottom: 12, padding: '10px 12px', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: 6, borderLeft: '3px solid var(--dsw-alias-color-brand)' } },
                        h('div', { style: { fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--dsw-alias-label-primary)' } },
                          '📋 Prompt 结构说明'
                        ),
                        h('div', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.6 } },
                          h('div', { style: { marginBottom: 6 } },
                            h('strong', null, 'Skill（指令层）'),
                            '：来自 DSH skills 系统，定义"怎么做"，包含完整的执行流程和规则。'
                          ),
                          h('div', { style: { marginBottom: 6 } },
                            h('strong', null, 'Prompt（数据层）'),
                            '：本地定义的模板，包含业务数据变量（如 {currentDoc}、{codeDiff}），定义"处理什么数据"。'
                          ),
                          h('div', null,
                            h('strong', null, '组合使用'),
                            '：两者配合，Skill 作为 system prompt，Prompt 提供具体的业务数据模板。'
                          )
                        )
                      ),

                      // Skill 选择器
                      h('div', { style: { marginBottom: 12, padding: '8px 10px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 6, border: hasSkillBinding ? '1px solid var(--dsw-alias-color-brand)' : '1px solid var(--dsw-alias-border-l2)' } },
                        h('div', { style: { fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--dsw-alias-label-primary)' } },
                          '🔗 绑定 Skill 作为指令层'
                        ),
                        h('div', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8, lineHeight: 1.5 } },
                          '选择一个 Skill 作为执行指令。Skill 定义完整的任务流程，下方的 Prompt 提供业务数据模板。'
                        ),
                        h('div', { style: { display: 'flex', gap: 8 } },
                          h('select', {
                            value: settings.ai.skillBindings?.[key] || '',
                            onChange: (e) => handleSkillBindingChange(key, e.target.value),
                            style: {
                              flex: 1,
                              padding: '6px 8px',
                              fontSize: 11,
                              borderRadius: 4,
                              border: '1px solid var(--dsw-alias-border-l2)',
                              background: 'var(--dsw-alias-bg-layer-1)',
                              color: 'var(--dsw-alias-label-primary)'
                            }
                          },
                            h('option', { value: '' }, '不绑定 Skill（仅使用下方 Prompt）'),
                            availableSkills.length === 0 && h('option', { value: '', disabled: true }, '加载中或无可用 Skill...'),
                            availableSkills.map(skill =>
                              h('option', { key: skill.name, value: skill.name },
                                skill.name + (skill.description ? ` - ${skill.description.substring(0, 30)}...` : '')
                              )
                            )
                          ),
                          // 预览按钮
                          settings.ai.skillBindings?.[key] && h('button', {
                            className: 'dv-btn dv-btn-secondary',
                            onClick: (e) => { e.stopPropagation(); handlePreviewSkill(settings.ai.skillBindings[key]); },
                            style: { fontSize: 11, padding: '6px 12px', whiteSpace: 'nowrap' }
                          }, '👁 预览')
                        )
                      ),

                      // Prompt 编辑区（数据模板）
                      h('div', { style: { marginBottom: 8, padding: '6px 8px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 6 } },
                        h('div', { style: { fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--dsw-alias-label-primary)' } },
                          '📝 Prompt 数据模板',
                          hasSkillBinding && h('span', { style: { fontSize: 10, fontWeight: 400, marginLeft: 8, color: 'var(--dsw-alias-label-secondary)' } },
                            '（配合 Skill 使用，提供业务数据）'
                          )
                        ),
                        h('div', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6, lineHeight: 1.4 } },
                          '定义业务数据模板，使用 {变量名} 插入动态内容。如：{currentDoc}、{codeDiff}、{commitList}'
                        ),
                        h('textarea', {
                          className: 'dv-form-textarea',
                          rows: 10,
                          value: currentCustom || meta.default,
                          onChange: (e) => handlePromptChange(key, e.target.value),
                          style: { fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 },
                          placeholder: '定义业务数据模板，留空使用默认'
                        })
                      ),

                      // 操作按钮
                      (isCustomized || hasSkillBinding) && h('div', { style: { marginTop: 8, textAlign: 'right' } },
                        h('button', {
                          className: 'dv-btn',
                          style: { fontSize: 11, padding: '4px 10px', color: 'var(--dsw-alias-state-warning-primary)' },
                          onClick: (e) => { e.stopPropagation(); handleResetPrompt(key); }
                        }, '↩ 恢复默认')
                      )
                    )
                  );
                })
              )
            );
          })()
    ),

    // ── Actions ──
    h('div', { className: 'dv-op-actions' },
      h('button', { className: 'dv-btn dv-btn-secondary', onClick: onClose }, '取消'),
      h('button', { className: 'dv-btn dv-btn-primary', onClick: handleSave, disabled: saving }, saving ? '保存中...' : '💾 保存')
    )
  );
}

module.exports = { SettingsPanel };
