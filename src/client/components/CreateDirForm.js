'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect } = React;

const { ROUTE } = require('../constants.js');
const { DocsViewerContext } = require('../context.js');

// 解析分支名，返回 { developer, date, title, requirementId } 或 null
// 与服务端 src/server/utils.js 的 parseBranchName 保持一致
// 支持格式：
// 1. feature/{developer}/{YYYY-MM-DD}-{title}  (新格式)
// 2. feature/{developer}-{YYYY-MM-DD}-{title}  (旧格式)
// 3. {YYYY-MM-DD}-{title}  (无开发者前缀)
function parseBranchName(branch) {
  if (!branch) return null;

  // 格式 1 & 2: feature/{developer}[/-]{YYYY-MM-DD}-{title}
  const match1 = branch.match(/^(?:feature\/)?([^/-]+)[/-](\d{4}-\d{2}-\d{2})-(.+)$/);
  if (match1) {
    const [, developer, date, title] = match1;
    return { developer, date, title, requirementId: `${date}-${title}` };
  }

  // 格式 3: {YYYY-MM-DD}-{title}  (无开发者前缀)
  const match2 = branch.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (match2) {
    const [, date, title] = match2;
    return { developer: null, date, title, requirementId: `${date}-${title}` };
  }

  return null;
}

// ─── CreateDirForm ───────────────────────────────────────────────
// Covers: 4.2, 4.11, 4.12, 4.13
function CreateDirForm({ workspaceId, docsDir, onClose }) {
  const [developer, setDeveloper] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const { refreshTree } = React.useContext(DocsViewerContext);

  // Fetch current git branch and auto-fill form
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${ROUTE}/git-branch?workspaceId=${encodeURIComponent(workspaceId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.branch) return;

        // 使用统一的分支名解析函数
        const parsed = parseBranchName(data.branch);
        if (parsed) {
          if (parsed.developer) setDeveloper(parsed.developer);
          setDate(parsed.date);
          setTitle(parsed.title);
        }
      } catch { /* ignore */ }
    })();
  }, [workspaceId]);

  const previewPath = developer && date && title
    ? `${docsDir}/${developer}/${date}-${title}/`
    : null;

  const handleCreate = async () => {
    if (!developer || !date || !title) {
      setError('请填写所有字段');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ROUTE}/create-dir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, developer, date, title }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '创建失败');
      } else {
        setSuccess(`目录创建成功: ${data.path}`);
        refreshTree();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return h('div', { className: 'dv-op-panel' },
    h('div', { className: 'dv-op-hint' }, '基于 Git 分支命名规范创建需求文档目录'),

    h('div', { className: 'dv-form-group' },
      h('label', { className: 'dv-form-label' }, '开发者'),
      h('input', { className: 'dv-form-input', type: 'text', placeholder: 'zhangsan', value: developer, onChange: e => setDeveloper(e.target.value) })
    ),
    h('div', { className: 'dv-form-group' },
      h('label', { className: 'dv-form-label' }, '日期'),
      h('input', { className: 'dv-form-input', type: 'date', value: date, onChange: e => setDate(e.target.value) })
    ),
    h('div', { className: 'dv-form-group' },
      h('label', { className: 'dv-form-label' }, '需求简述'),
      h('input', { className: 'dv-form-input', type: 'text', placeholder: '新增报表导出功能', value: title, onChange: e => setTitle(e.target.value) })
    ),

    previewPath && h('div', { className: 'dv-path-preview' },
      '→ 将创建目录：', h('code', null, previewPath)
    ),

    error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),
    success && h('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, marginBottom: 8 } }, success),

    h('div', { className: 'dv-btn-row' },
      h('button', { className: 'dv-btn dv-btn-primary', onClick: handleCreate, disabled: loading },
        loading ? '创建中...' : '📁 创建目录'),
      h('button', { className: 'dv-btn', onClick: onClose }, '取消')
    )
  );
}

module.exports = { CreateDirForm };
