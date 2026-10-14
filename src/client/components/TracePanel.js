'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect } = React;
const { createIconComponents } = require('../icons.js');
const { getDocIcon } = require('../utils/getDocIcon.js');

const { IconClipboard, IconDesign, IconSearch, IconFile, IconCheck, IconCalendar } = createIconComponents(h);

const { ROUTE } = require('../constants.js');

// ─── Timeline (3.4, 3.5, 3.15) ──────────────────────────────────
function Timeline({ requirement }) {
  if (!requirement?.meta?.timeline || requirement.meta.timeline.length === 0) {
    return h('div', { className: 'rh-empty', style: { padding: 20 } },
      h('span', { className: 'rh-empty-icon' }, h(IconCalendar, { size: 32 })),
      '暂无时间线数据'
    );
  }

  const typeIcons = {
    requirement: IconClipboard,
    design: IconDesign,
    cr: IconSearch,
    release: IconCheck,
  };

  return h('div', { className: 'rh-timeline' },
    requirement.meta.timeline.map((item, idx) =>
      h('div', { key: idx, className: 'rh-tl-item' },
        h('div', { className: `rh-tl-dot ${item.type || 'other'}` },
          h(typeIcons[item.type] || IconFile, { size: 12 })
        ),
        h('div', { className: 'rh-tl-content' },
          h('div', { className: 'rh-tl-date' }, item.date),
          h('div', { className: 'rh-tl-title' }, item.title),
          // 3.15: Description
          item.description && h('div', { className: 'rh-tl-desc' }, item.description)
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
    return h('div', { className: 'rh-empty', style: { padding: 20 } },
      h('span', { className: 'rh-empty-icon' }, h(IconSearch, { size: 32 })),
      '选择一个需求目录以查看追溯信息'
    );
  }

  // Debug: 打印 currentReq 到控制台
  console.log('TracePanel currentReq:', currentReq);

  return h('div', { style: { padding: 16 } },
    loading && h('div', { style: { textAlign: 'center', padding: 8, color: 'var(--dsw-alias-label-secondary)', fontSize: 11 } }, '刷新中...'),
    h('div', { className: 'rh-op-info' },
      h('div', null, '开发者：', currentReq.developer),
      h('div', null, '日期：', currentReq.date),
      h('div', null, '文档数：', currentReq.fileCount),
      h('div', null, '分析状态：',
        currentReq.hasMeta
          ? h('span', { className: 'rh-badge rh-badge-success' }, '已分析')
          : h('span', { className: 'rh-badge rh-badge-warn' }, '未分析')
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
    }, '该需求尚未分析，无法展示时间线。请前往左侧操作栏点击「分析」按钮进行分析。'),
    // Show timeline if analyzed
    currentReq.hasMeta && (() => {
      const hasTimeline = currentReq.meta?.timeline && currentReq.meta.timeline.length > 0;
      console.log('hasTimeline:', hasTimeline, 'meta:', currentReq.meta);
      return hasTimeline
        ? h(Timeline, { requirement: currentReq })
        : h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--dsw-alias-label-secondary)' } },
            h('span', { style: { fontSize: 24 } }, h(IconCalendar, { size: 24 })),
            h('div', { style: { marginTop: 8 } }, '该需求已分析，但时间线数据为空')
          );
    })()
  );
}

module.exports = { TracePanel };
