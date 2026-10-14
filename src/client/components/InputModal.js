'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect } = React;

function InputModal({ title, value, placeholder, onConfirm, onCancel }) {
  const [inputValue, setInputValue] = useState(value || '');

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleConfirm = () => {
    onConfirm(inputValue.trim());
  };

  return h('div', { className: 'rh-modal-overlay', onClick: onCancel, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { className: 'rh-modal', onClick: e => e.stopPropagation() },
      h('div', { className: 'rh-modal-title' }, title),
      h('div', { style: { marginBottom: 12 } },
        h('input', {
          type: 'text',
          value: inputValue,
          onChange: e => setInputValue(e.target.value),
          onKeyDown: e => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          },
          placeholder: placeholder || '请输入...',
          'aria-label': title,
          autoFocus: true,
          style: {
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--dsw-alias-border-l1)',
            borderRadius: '6px',
            fontSize: '12px',
            background: 'var(--dsw-alias-bg-layer-2)',
            color: 'var(--dsw-alias-label-primary)',
            outline: 'none',
            boxSizing: 'border-box',
          }
        })
      ),
      h('div', { className: 'rh-modal-actions' },
        h('button', { className: 'rh-btn', onClick: onCancel }, '取消'),
        h('button', { className: 'rh-btn rh-btn-primary', onClick: handleConfirm }, '确定')
      )
    )
  );
}

module.exports = { InputModal };
