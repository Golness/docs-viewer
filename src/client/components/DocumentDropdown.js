'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect } = React;
const { ROUTE } = require('../constants.js');

function getDocIcon(type) {
  const icons = { requirement: '📋', design: '📐', cr: '🔍', other: '📄' };
  return icons[type] || '📄';
}

function DocumentDropdown({ workspaceId, selectedReq, onSelectFile, onClose }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspaceId)}&t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTree(data.tree);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Get files from selected requirement only
  const allFiles = [];
  if (tree?.developers && selectedReq) {
    for (const dev of tree.developers) {
      for (const req of dev.requirements) {
        if (req.id === selectedReq.id) {
          for (const file of req.files) {
            allFiles.push({
              ...file,
              reqId: req.id,
              reqTitle: req.title,
              reqDate: req.date,
              developer: dev.name,
              path: req.path,
            });
          }
          break;
        }
      }
      if (allFiles.length > 0) break;
    }
  }

  return h('div', { className: 'dv-modal-overlay', onClick: onClose },
    h('div', { className: 'dv-modal', onClick: e => e.stopPropagation(), style: { minWidth: 400 } },
      h('div', { className: 'dv-modal-title' }, '📄 查看文档'),
      loading
        ? h('div', { className: 'dv-empty' }, '加载中...')
        : !selectedReq
          ? h('div', { className: 'dv-empty' }, '请先选择需求目录')
          : allFiles.length === 0
            ? h('div', { className: 'dv-empty' }, '当前需求目录下暂无文档')
            : h('div', { className: 'dv-modal-list', style: { maxHeight: 400 } },
                allFiles.map((file, idx) => {
                  const docTypeLabels = { requirement: '需求', design: '技术方案', cr: 'CR', other: '文档' };
                  return h('div', {
                    key: `${file.reqId}-${file.name}-${idx}`,
                    className: 'dv-modal-item',
                    onClick: () => { onSelectFile(file); onClose(); },
                  },
                    h('span', { className: 'dv-modal-item-icon' }, getDocIcon(file.type)),
                    h('span', { className: 'dv-modal-item-name' },
                      h('span', { style: { fontWeight: 600 } }, file.name),
                      h('span', { className: `dv-doctype-tag ${file.type}` }, docTypeLabels[file.type] || '文档'),
                      h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, marginLeft: 8 } },
                        `${file.developer} / ${file.reqDate.slice(5)} ${file.reqTitle}`)
                    )
                  );
                })
              ),
      h('div', { className: 'dv-modal-actions' },
        h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
      )
    )
  );
}

module.exports = { DocumentDropdown };
