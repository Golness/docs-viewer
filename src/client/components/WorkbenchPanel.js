'use strict';

const React = require('react');
const h = React.createElement;
const { useState } = React;

// ─── WorkbenchPanel ──────────────────────────────────────────────
// Workbench with tabs: 分析 (Analyze), 索引 (Index), 搜索 (Search)
// NOTE: AnalyzePanel, IndexPanel, SearchPanel must be injected or imported by the consumer
function WorkbenchPanel({ workspaceId, selectedReq, indexStatus, onRefreshIndex, onClose, AnalyzePanel, IndexPanel, SearchPanel }) {
  const [activeTab, setActiveTab] = useState('analyze');

  return h('div', { className: 'dv-op-panel' },
    // Tab buttons
    h('div', { style: { display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--dsw-alias-border-l1)', paddingBottom: 8 } },
      h('button', {
        className: `dv-btn ${activeTab === 'analyze' ? 'dv-btn-primary' : ''}`,
        onClick: () => setActiveTab('analyze'),
        style: { flex: 1 },
      }, '🔄 分析'),
      h('button', {
        className: `dv-btn ${activeTab === 'index' ? 'dv-btn-primary' : ''}`,
        onClick: () => setActiveTab('index'),
        style: { flex: 1 },
      }, '🔨 索引'),
      h('button', {
        className: `dv-btn ${activeTab === 'search' ? 'dv-btn-primary' : ''}`,
        onClick: () => setActiveTab('search'),
        style: { flex: 1 },
      }, '🔎 搜索')
    ),

    // Tab content
    activeTab === 'analyze' && h(AnalyzePanel, { workspaceId, selectedReq, onClose }),
    activeTab === 'index' && h(IndexPanel, { workspaceId, indexStatus, onRefresh: onRefreshIndex, onClose }),
    activeTab === 'search' && h(SearchPanel, { workspaceId, onSelectReq: null })
  );
}

module.exports = { WorkbenchPanel };
