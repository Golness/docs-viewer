'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect } = React;

const { ROUTE } = require('../constants.js');

// ─── Timeline (3.4, 3.5, 3.15) ──────────────────────────────────
function Timeline({ requirement }) {
  if (!requirement?.meta?.timeline || requirement.meta.timeline.length === 0) {
    return h('div', { className: 'dv-empty', style: { padding: 20 } },
      h('span', { className: 'dv-empty-icon' }, '📅'),
      '暂无时间线数据'
    );
  }

  const typeIcons = {
    requirement: '📋',
    design: '📐',
    cr: '🔍',
    release: '✅',
  };

  return h('div', { className: 'dv-timeline' },
    requirement.meta.timeline.map((item, idx) =>
      h('div', { key: idx, className: 'dv-tl-item' },
        h('div', { className: `dv-tl-dot ${item.type || 'other'}` },
          typeIcons[item.type] || '📄'
        ),
        h('div', { className: 'dv-tl-content' },
          h('div', { className: 'dv-tl-date' }, item.date),
          h('div', { className: 'dv-tl-title' }, item.title),
          // 3.15: Description
          item.description && h('div', { className: 'dv-tl-desc' }, item.description)
        )
      )
    )
  );
}

// ─── TracePanel (right column default view) ─────────────────────
function TracePanel({ selectedReq, workspaceId }) {
  const [currentReq, setCurrentReq] = useState(selectedReq);
  const [loading, setLoading] = useState(false);

  // Re-fetch requirement data when panel becomes visible or selectedReq changes
  useEffect(() => {
    if (!selectedReq || !workspaceId) {
      setCurrentReq(selectedReq);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Fetch the latest tree to get updated meta data
        const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspaceId)}&t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            // Find the current requirement in the tree
            for (const dev of data.tree.developers) {
              for (const req of dev.requirements) {
                if (req.id === selectedReq.id) {
                  setCurrentReq({ ...req, developer: dev.name });
                  setLoading(false);
                  return;
                }
              }
            }
            // If not found, use the original selectedReq
            setCurrentReq(selectedReq);
          }
        }
      } catch (e) {
        console.error('Failed to refresh requirement data:', e);
        if (!cancelled) {
          setCurrentReq(selectedReq);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [selectedReq?.id, workspaceId]);

  if (!currentReq) {
    return h('div', { className: 'dv-empty', style: { padding: 20 } },
      h('span', { className: 'dv-empty-icon' }, '🔍'),
      '选择一个需求目录以查看追溯信息'
    );
  }

  // Debug: 打印 currentReq 到控制台
  console.log('TracePanel currentReq:', currentReq);

  return h('div', { style: { padding: 16 } },
    loading && h('div', { style: { textAlign: 'center', padding: 8, color: 'var(--dsw-alias-label-secondary)', fontSize: 11 } }, '🔄 刷新中...'),
    h('div', { className: 'dv-op-info' },
      h('div', null, '👤 开发者：', currentReq.developer),
      h('div', null, '📅 日期：', currentReq.date),
      h('div', null, '📄 文档数：', currentReq.fileCount),
      h('div', null, '⚙ 分析状态：',
        currentReq.hasMeta
          ? h('span', { className: 'dv-badge dv-badge-success' }, '已分析')
          : h('span', { className: 'dv-badge dv-badge-warn' }, '未分析')
      ),
      currentReq.metaUpdatedAt && h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 } },
        '最后分析：', new Date(currentReq.metaUpdatedAt).toLocaleString())
    ),
    // 3.7: Unanalyzed prompt
    !currentReq.hasMeta && h('div', {
      style: {
        padding: '8px 12px', fontSize: 12, color: 'var(--dsw-alias-state-warning-primary)',
        background: 'var(--dsw-alias-state-warning-bg)', borderRadius: 6,
        border: '1px dashed var(--dsw-alias-state-warning-primary)', marginTop: 8,
      }
    }, '⚠️ 该需求尚未分析，无法展示时间线。请前往左侧操作栏点击「🔄 分析」按钮进行分析。'),
    // Show timeline if analyzed
    currentReq.hasMeta && (() => {
      const hasTimeline = currentReq.meta?.timeline && currentReq.meta.timeline.length > 0;
      console.log('hasTimeline:', hasTimeline, 'meta:', currentReq.meta);
      return hasTimeline
        ? h(Timeline, { requirement: currentReq })
        : h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--dsw-alias-label-secondary)' } },
            h('span', { style: { fontSize: 24 } }, '📅'),
            h('div', { style: { marginTop: 8 } }, '该需求已分析，但时间线数据为空')
          );
    })()
  );
}

module.exports = { TracePanel };
