'use strict';

const React = require('react');
const h = React.createElement;

function WorkspaceModal({ workspaces, selectedId, onSelect, onClose }) {
  return h('div', { className: 'dv-modal-overlay', onClick: onClose },
    h('div', { className: 'dv-modal', onClick: e => e.stopPropagation() },
      h('div', { className: 'dv-modal-title' }, '📂 选择工作区'),
      workspaces.length === 0
        ? h('div', { className: 'dv-empty' }, '暂无工作区')
        : h('div', { className: 'dv-modal-list' },
            workspaces.map(ws =>
              h('div', {
                key: ws.id,
                className: `dv-modal-item${selectedId === ws.id ? ' selected' : ''}`,
                onClick: () => { onSelect(ws); onClose(); },
              },
                h('span', { className: 'dv-modal-item-icon' }, '📁'),
                h('span', { className: 'dv-modal-item-name' }, ws.title || ws.id)
              )
            )
          ),
      h('div', { className: 'dv-modal-actions' },
        h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
      )
    )
  );
}

module.exports = { WorkspaceModal };
