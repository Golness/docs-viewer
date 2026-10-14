'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect } = React;

const { ROUTE } = require('../constants.js');
const { DocsViewerContext } = require('../context.js');

// ─── TemplatesPanel ──────────────────────────────────────────────
// Templates with tabs: 需求 (Requirement), 方案 (Design), CR
function TemplatesPanel({ workspaceId, docsDir, selectedReq, onClose }) {
  const [activeTab, setActiveTab] = useState('requirement');

  return h('div', { className: 'dv-op-panel' },
    // Tab buttons
    h('div', { style: { display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--dsw-alias-border-l1)', paddingBottom: 8 } },
      h('button', {
        className: `dv-btn ${activeTab === 'requirement' ? 'dv-btn-primary' : ''}`,
        onClick: () => setActiveTab('requirement'),
        style: { flex: 1 },
      }, '需求'),
      h('button', {
        className: `dv-btn ${activeTab === 'design' ? 'dv-btn-primary' : ''}`,
        onClick: () => setActiveTab('design'),
        style: { flex: 1 },
      }, '方案'),
      h('button', {
        className: `dv-btn ${activeTab === 'cr' ? 'dv-btn-primary' : ''}`,
        onClick: () => setActiveTab('cr'),
        style: { flex: 1 },
      }, 'CR')
    ),

    // Tab content
    h(TemplatePanel, { workspaceId, docsDir, selectedReq, docType: activeTab, onClose })
  );
}

// ─── TemplatePanel ───────────────────────────────────────────────
// Covers: 4.6, 4.7, 4.8, 4.11, 4.21, 4.22
// Templates are fetched from server to avoid duplication
function TemplatePanel({ workspaceId, docsDir, selectedReq, docType, onClose }) {
  const [templates, setTemplates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const { refreshTree } = React.useContext(DocsViewerContext);

  // Fetch templates from server on mount
  useEffect(() => {
    fetch(`${ROUTE}/templates`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setTemplates(data); })
      .catch(() => {});
  }, []);

  const tmpl = templates?.[docType];

  // Show loading while templates are being fetched
  if (!tmpl) {
    return h('div', { className: 'dv-op-panel' },
      h('div', { className: 'dv-loading' }, '加载模板...')
    );
  }

  if (!selectedReq) {
    return h('div', { className: 'dv-op-panel' },
      h('div', { style: { color: 'var(--dsw-alias-state-warning-primary)', fontSize: 12, marginBottom: 12 } },
        '请先在左侧目录树中选择一个需求目录'),
      h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
    );
  }

  const targetPath = `${docsDir}/${selectedReq.developer}/${selectedReq.id}/`;

  // 4.6-4.8: Static template generation
  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ROUTE}/generate-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, requirementId: selectedReq.id, docType, useAI: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '生成失败');
      } else {
        setSuccess(`模板已生成: ${data.fileName}`);
        refreshTree();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // 4.23: AI template generation
  const handleGenerateAI = async () => {
    setLoadingAI(true);
    setError(null);
    try {
      const res = await fetch(`${ROUTE}/generate-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, requirementId: selectedReq.id, docType, useAI: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'AI 生成失败');
      } else {
        setSuccess(`AI 模板已生成: ${data.fileName}`);
        refreshTree();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingAI(false);
    }
  };

  return h('div', { className: 'dv-op-panel' },
    // 4.21: Target info
    h('div', { className: 'dv-op-info' },
      h('div', null, '目标目录：', h('code', null, targetPath)),
      h('div', { style: { marginTop: 4 } }, '输出文件：', h('code', null, tmpl.fileName))
    ),

    // 4.22, 4.23: Generation buttons
    h('div', { className: 'dv-btn-stack', style: { marginBottom: 12 } },
      h('button', { className: 'dv-btn dv-btn-primary', onClick: handleGenerate, disabled: loading || loadingAI },
        loading ? '生成中...' : `${tmpl.icon} 生成模板`),
      h('button', { className: 'dv-btn', onClick: handleGenerateAI, disabled: loading || loadingAI },
        loadingAI ? 'AI 生成中...' : `🤖 用 AI 生成 `, h('span', { style: { fontSize: 10, color: 'var(--dsw-alias-brand-primary)' } }, 'ctx.llm')),
      h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
    ),

    error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),
    success && h('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, marginBottom: 8 } }, success),

    // 4.22: Template preview
    h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, '模板预览'),
    h('div', { className: 'dv-template-preview' }, tmpl.content)
  );
}

module.exports = { TemplatesPanel };
