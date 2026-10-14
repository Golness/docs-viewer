'use strict';

const React = require('react');
const h = React.createElement;
const { createIconComponents } = require('../icons.js');

const { IconFolderOpen, IconFolder } = createIconComponents(h);

function WorkspaceModal({ workspaces, selectedId, onSelect, onClose }) {
  return h('div', { className: 'rh-modal-overlay', onClick: onClose, role: 'dialog', 'aria-modal': 'true', 'aria-label': '选择工作区' },
    h('div', { className: 'rh-modal', onClick: e => e.stopPropagation() },
      h('div', { className: 'rh-modal-title', style: { display: 'flex', alignItems: 'center', gap: 6 } }, h(IconFolderOpen, { size: 16 }), ' 选择工作区'),
      workspaces.length === 0
        ? h('div', { className: 'rh-empty' }, '暂无工作区')
        : h('div', { className: 'rh-modal-list', role: 'listbox' },
            workspaces.map(ws =>
              h('div', {
                key: ws.id,
                className: `rh-modal-item${selectedId === ws.id ? ' selected' : ''}`,
                role: 'option',
                'aria-selected': selectedId === ws.id ? 'true' : 'false',
                onClick: () => { onSelect(ws); onClose(); },
              },
                h('span', { className: 'rh-modal-item-icon' }, h(IconFolder, { size: 14 })),
                h('span', { className: 'rh-modal-item-name' }, ws.title || ws.id)
              )
            )
          ),
      h('div', { className: 'rh-modal-actions' },
        h('button', { className: 'rh-btn', onClick: onClose }, '关闭')
      )
    )
  );
}

module.exports = { WorkspaceModal };
