'use strict';

const React = require('react');
const h = React.createElement;

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return h('div', { className: 'dv-modal-overlay', onClick: onCancel },
    h('div', { className: 'dv-modal', onClick: e => e.stopPropagation() },
      h('div', { className: 'dv-modal-title' }, title),
      h('div', { style: { marginBottom: 16, fontSize: '13px', color: 'var(--dsw-alias-label-primary)', lineHeight: '1.5' } }, message),
      h('div', { className: 'dv-modal-actions' },
        h('button', { className: 'dv-btn', onClick: onCancel }, '否'),
        h('button', { className: 'dv-btn dv-btn-primary', onClick: onConfirm }, '是')
      )
    )
  );
}

module.exports = { ConfirmModal };
