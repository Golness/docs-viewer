'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect } = React;
const { ROUTE } = require('../constants.js');

function RequirementDirModal({ workspaceId, selectedReqId, onSelect, onClose }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedDevs, setExpandedDevs] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspaceId)}&t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.tree?.developers) {
            setTree(data.tree);
            // Default: expand first developer
            if (data.tree.developers.length > 0) {
              setExpandedDevs({ [data.tree.developers[0].name]: true });
            }
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const toggleDev = (devName) => {
    setExpandedDevs(prev => ({ ...prev, [devName]: !prev[devName] }));
  };

  return h('div', { className: 'dv-modal-overlay', onClick: onClose },
    h('div', { className: 'dv-modal', onClick: e => e.stopPropagation(), style: { minWidth: 400 } },
      h('div', { className: 'dv-modal-title' }, '📂 选择需求目录'),
      loading
        ? h('div', { className: 'dv-empty' }, '加载中...')
        : !tree || tree.developers.length === 0
          ? h('div', { className: 'dv-empty' }, '暂无需求目录')
          : h('div', { className: 'dv-modal-list', style: { maxHeight: 400 } },
              tree.developers.map(dev =>
                h('div', { key: dev.name },
                  h('div', {
                    className: 'dv-modal-item',
                    onClick: () => toggleDev(dev.name),
                    style: { fontWeight: 600 }
                  },
                    h('span', { className: 'dv-modal-item-icon' }, expandedDevs[dev.name] ? '▼' : '▶'),
                    h('span', { className: 'dv-modal-item-name' }, dev.name),
                    h('span', { className: 'dv-modal-item-count' }, `(${dev.requirementCount})`)
                  ),
                  expandedDevs[dev.name] && dev.requirements.map(req =>
                    h('div', {
                      key: req.id,
                      className: `dv-modal-item${selectedReqId === req.id ? ' selected' : ''}`,
                      style: { paddingLeft: 32 },
                      onClick: () => { onSelect(req); onClose(); },
                    },
                      h('span', { className: 'dv-modal-item-icon' }, '📂'),
                      h('span', { className: 'dv-modal-item-name' }, `${req.date.slice(5)} ${req.title}`),
                      h('span', { className: 'dv-modal-item-count' }, `📄 ${req.fileCount}`)
                    )
                  )
                )
              )
            ),
      h('div', { className: 'dv-modal-actions' },
        h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
      )
    )
  );
}

module.exports = { RequirementDirModal };
