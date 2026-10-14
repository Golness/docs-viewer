'use strict';

const React = require('react');
const h = React.createElement;
const { useState } = React;
const { ROUTE } = require('../constants.js');
const { InputModal } = require('./InputModal.js');

function TopBar({ docsDir, currentWorkspace, currentReq, onEditDocsDir, onChangeWorkspace, onChangeReq, onLocateSessionReq }) {
  const [showPathModal, setShowPathModal] = useState(false);

  const handlePathConfirm = async (newDir) => {
    if (!newDir) return;
    try {
      const res = await fetch(`${ROUTE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docsDir: newDir }),
      });
      if (res.ok) {
        setShowPathModal(false);
        onEditDocsDir();
      }
    } catch { /* ignore */ }
  };

  const handleOpenInExplorer = async () => {
    if (!currentWorkspace || !currentReq) return;
    try {
      const res = await fetch(`${ROUTE}/open-in-explorer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          requirementId: currentReq.id
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '打开失败');
      }
    } catch (e) {
      alert('打开失败: ' + e.message);
    }
  };

  return h('div', { className: 'dv-topbar' },
    h('div', { className: 'dv-topbar-left' },
      // 定位到当前会话需求目录按钮
      h('button', {
        className: 'dv-btn dv-btn-primary',
        onClick: onLocateSessionReq,
        title: '自动定位到当前 DSH 会话对应的需求文档目录',
        style: { marginRight: 12, padding: '4px 12px', fontSize: 12 }
      }, '定位会话需求'),

      // 工作区
      h('span', { className: 'dv-topbar-label' }, '工作区:'),
      h('span', {
          className: `dv-topbar-value${currentWorkspace ? ' selected' : ' unselected'}`,
          onClick: onChangeWorkspace,
          title: '点击切换工作区',
        }, currentWorkspace?.title || currentWorkspace?.id || '(未选择)'),

      // 项目路径
      h('span', { className: 'dv-topbar-label' }, '项目路径:'),
      h('span', {
          className: 'dv-topbar-value selected',
          onClick: () => setShowPathModal(true),
          title: '点击修改项目 docs 路径',
        }, docsDir),

      // 需求目录
      h('span', { className: 'dv-topbar-label' }, '需求目录:'),
      h('span', {
          className: `dv-topbar-value${currentReq ? ' selected' : ' unselected'}`,
          onClick: onChangeReq,
          title: '点击选择需求目录',
        }, currentReq ? `${currentReq.date?.slice(5)} ${currentReq.title}` : '(未选择)'),

      // 在文件资源管理器中打开按钮
      currentReq && h('button', {
        className: 'dv-btn',
        onClick: handleOpenInExplorer,
        title: '在文件资源管理器中打开此需求目录',
        style: { marginLeft: 8, padding: '2px 8px', fontSize: 11 }
      }, '📂')
    ),

    // 项目路径输入弹框
    showPathModal && h(InputModal, {
      title: '修改项目路径',
      value: docsDir,
      placeholder: '请输入 docs 目录路径',
      onConfirm: handlePathConfirm,
      onCancel: () => setShowPathModal(false),
    })
  );
}

module.exports = { TopBar };
