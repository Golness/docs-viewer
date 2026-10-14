'use strict';

const React = require('react');
const h = React.createElement;

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return h('div', { className: 'rh-modal-overlay', onClick: onCancel, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { className: 'rh-modal', onClick: e => e.stopPropagation() },
      h('div', { className: 'rh-modal-title', id: 'confirm-modal-title' }, title),
      h('div', { style: { marginBottom: 16, fontSize: '13px', color: 'var(--dsw-alias-label-primary)', lineHeight: '1.5' } }, message),
      h('div', { className: 'rh-modal-actions' },
        h('button', { className: 'rh-btn', onClick: onCancel }, '否'),
        h('button', { className: 'rh-btn rh-btn-primary', onClick: onConfirm }, '是')
      )
    )
  );
}

module.exports = { ConfirmModal };
