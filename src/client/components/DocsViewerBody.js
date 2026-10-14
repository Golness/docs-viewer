'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect, useRef } = React;

const { ROUTE } = require('../constants.js');
const { DocsViewerContext } = require('../context.js');
const { createIconComponents } = require('../icons.js');

const { IconFolder, IconSync, IconFile, IconSearch, IconWrench, IconClipboard, IconScroll, IconSettings, IconClose } = createIconComponents(h);

const { parseBranchName } = require('../utils/parseBranchName.js');
const { TopBar } = require('./TopBar.js');
const { CreateDirForm } = require('./CreateDirForm.js');
const { FilePreview } = require('./FilePreview.js');
const { SyncPanel } = require('./SyncPanel.js');
const { TracePanel } = require('./TracePanel.js');
const { WorkbenchPanel } = require('./WorkbenchPanel.js');
const { TemplatesPanel } = require('./TemplatesPanel.js');
const { LogPanel } = require('./LogPanel.js');
const { SettingsPanel } = require('./SettingsPanel.js');
const { WorkspaceModal } = require('./WorkspaceModal.js');
const { RequirementDirModal } = require('./RequirementDirModal.js');
const { FileTreeSidebar } = require('./FileTreeSidebar.js');
const { ConfirmModal } = require('./ConfirmModal.js');
const { AnalyzePanel } = require('./AnalyzePanel.js');
const { IndexPanel } = require('./IndexPanel.js');
const { SearchPanel } = require('./SearchPanel.js');

function DocsViewerBody({ workspace, docsDir, onConfigChange, workspaces, onSelectWorkspace, initialReqId }) {
  const [activePanel, setActivePanel] = useState(null);
  const [selectedReq, setSelectedReq] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [totalReqs, setTotalReqs] = useState(0);
  const [indexStatus, setIndexStatus] = useState(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showReqDirModal, setShowReqDirModal] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null); // 'workbench' | 'templates' | null
  const threeZoneRef = useRef(null);

  // Refs for cross-component communication
  const refreshTreeRef = useRef(() => {});
  const refreshSelectedReqRef = useRef(() => {});

  // Auto-select requirement from config (initialReqId) or first available
  const isInitialMount = useRef(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspace.id)}&t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.tree?.developers) return;

        let found = null;

        // Try to restore from config
        if (initialReqId) {
          for (const dev of data.tree.developers) {
            for (const req of dev.requirements) {
              if (req.id === initialReqId) {
                found = { ...req, developer: dev.name };
                break;
              }
            }
            if (found) break;
          }
        }

        // Fallback: first requirement of first developer (only on initial mount)
        if (!found && isInitialMount.current && data.tree.developers.length > 0) {
          const firstDev = data.tree.developers[0];
          if (firstDev.requirements.length > 0) {
            found = { ...firstDev.requirements[0], developer: firstDev.name };
          }
        }

        isInitialMount.current = false;

        if (found) setSelectedReq(found);
        else setSelectedReq(null);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [workspace.id, initialReqId]);

  // Fetch index status
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ROUTE}/index-status?workspaceId=${encodeURIComponent(workspace.id)}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setIndexStatus(data);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [workspace.id]);

  // Fetch total requirements count
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspace.id)}&t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTotalReqs(data.totalRequirements || 0);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [workspace.id]);

  const refreshIndexStatus = () => {
    fetch(`${ROUTE}/index-status?workspaceId=${encodeURIComponent(workspace.id)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setIndexStatus(data); })
      .catch(() => {});
  };

  const handleSelectReq = async (req) => {
    setSelectedReq(req);
    setSelectedFile(null);
    // Save to config (只保存需求选择，不触发重新加载)
    if (req) {
      try {
        await fetch(`${ROUTE}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: workspace.id,
            developerName: req.developer,
            requirementId: req.id
          }),
        });
      } catch { /* ignore */ }
    }
  };

  // Refresh selected requirement from server
  const refreshSelectedReq = async () => {
    if (!selectedReq) return;
    try {
      const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspace.id)}&t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.tree?.developers) return;

      // Find the updated requirement
      for (const dev of data.tree.developers) {
        for (const req of dev.requirements) {
          if (req.id === selectedReq.id) {
            setSelectedReq({ ...req, developer: dev.name });
            return;
          }
        }
      }
    } catch { /* ignore */ }
  };

  // Store refresh function in ref for use in hooks
  useEffect(() => {
    refreshSelectedReqRef.current = refreshSelectedReq;
  }, [refreshSelectedReq]);

  const handleSelectFile = (file) => {
    setActivePanel(null);
    setSelectedFile(file);
  };

  const handlePanelClose = () => {
    // If viewing a file, just close the file preview
    if (selectedFile) {
      setSelectedFile(null);
    } else {
      // Otherwise close the active panel
      setActivePanel(null);
    }
  };

  // 定位到当前会话需求目录
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [pendingCreateReq, setPendingCreateReq] = useState(null);

  const doCreateAndSwitch = async (targetWorkspace, developer, date, title, requirementId) => {
    try {
      const createRes = await fetch(`${ROUTE}/create-dir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: targetWorkspace.id, developer, date, title }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        return;
      }

      await refreshTree();
      await new Promise(resolve => setTimeout(resolve, 300));

      const newTreeRes = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(targetWorkspace.id)}&t=${Date.now()}`);
      if (newTreeRes.ok) {
        const newTreeData = await newTreeRes.json();
        if (newTreeData.tree?.developers) {
          for (const dev of newTreeData.tree.developers) {
            if (dev.name === developer) {
              for (const req of dev.requirements) {
                if (req.id === requirementId) {
                  await handleSelectReq({ ...req, developer: dev.name });
                  return;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('创建需求目录失败:', e);
    }
  };

  const handleLocateSessionReq = async () => {
    console.log('[定位会话需求] 开始执行');
    try {
      // 1. 获取当前会话 ID（从 DSH 上下文获取）
      const ctx = window.__DSH_CTX__;
      if (!ctx) {
        console.error('[定位会话需求] 无法获取 DSH 上下文');
        return;
      }

      // 从 uiWorkspace.selection 获取当前选择的会话（当前页面显示的会话）
      let currentSessionId = null;
      try {
        const uiWorkspace = ctx.get?.('uiWorkspace');
        if (uiWorkspace) {
          // 尝试从 selection 属性获取
          if (uiWorkspace.selection && typeof uiWorkspace.selection.getSnapshot === 'function') {
            const selection = uiWorkspace.selection.getSnapshot();
            console.log('[定位会话需求] uiWorkspace.selection:', selection);
            if (selection?.sessionId) {
              currentSessionId = selection.sessionId;
            }
          }
        }
      } catch (e) {
        console.error('[定位会话需求] 获取 uiWorkspace.selection 失败:', e);
      }

      // 备用方案：从 sessions 服务获取最新的主会话
      if (!currentSessionId) {
        try {
          const sessions = ctx.get?.('sessions');
          if (sessions && typeof sessions.list?.getSnapshot === 'function') {
            const snapshot = sessions.list.getSnapshot();
            console.log('[定位会话需求] sessions.list:', snapshot?.ids?.slice(0, 3));
            if (snapshot?.ids && snapshot.ids.length > 0) {
              currentSessionId = snapshot.ids[0];
            }
          }
        } catch (e) {
          console.error('[定位会话需求] 获取 sessions 失败:', e);
        }
      }

      if (!currentSessionId) {
        console.error('[定位会话需求] 无法获取当前会话 ID');
        return;
      }

      console.log('[定位会话需求] 当前会话 ID:', currentSessionId);

      // 2. 获取会话详情
      const sessionRes = await fetch(`${ROUTE}/session-info?sessionId=${encodeURIComponent(currentSessionId)}`);
      if (!sessionRes.ok) {
        console.error('[定位会话需求] 获取会话详情失败:', sessionRes.status);
        return;
      }
      const sessionData = await sessionRes.json();
      console.log('[定位会话需求] 会话数据:', sessionData);

      if (!sessionData.session) {
        console.error('[定位会话需求] 没有找到会话');
        return;
      }

      const session = sessionData.session;
      const sessionCwd = session.cwd;
      console.log('[定位会话需求] 会话工作目录:', sessionCwd);

      if (!sessionCwd) {
        console.error('[定位会话需求] 会话没有工作目录信息');
        return;
      }

      // 3. 根据会话的工作目录找到对应的工作区
      console.log('[定位会话需求] 查找匹配的工作区...');
      console.log('[定位会话需求] 可用工作区:', workspaces.map(w => ({ id: w.id, path: w.path, title: w.title })));

      let targetWorkspace = null;
      for (const ws of workspaces) {
        // 比较路径（可能需要处理路径格式差异）
        const wsPath = ws.path.replace(/\\/g, '/').toLowerCase();
        const cwdPath = sessionCwd.replace(/\\/g, '/').toLowerCase();
        if (wsPath === cwdPath || wsPath.endsWith('/' + cwdPath) || cwdPath.endsWith('/' + wsPath)) {
          targetWorkspace = ws;
          break;
        }
      }

      if (!targetWorkspace) {
        console.error('[定位会话需求] 没有找到匹配的工作区，会话 cwd:', sessionCwd);
        return;
      }

      console.log('[定位会话需求] 找到匹配的工作区:', targetWorkspace);

      // 4. 如果工作区不匹配，先切换工作区并持久化
      if (targetWorkspace.id !== workspace.id) {
        console.log('[定位会话需求] 切换工作区到:', targetWorkspace.id);

        // 更新配置（持久化工作区选择）
        try {
          await fetch(`${ROUTE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId: targetWorkspace.id }),
          });
          console.log('[定位会话需求] 工作区配置已持久化');
        } catch (e) {
          console.error('[定位会话需求] 持久化工作区配置失败:', e);
        }

        // 切换工作区（更新 React 状态）
        onSelectWorkspace(targetWorkspace);

        // 等待状态更新
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 5. 获取工作区的 Git 分支
      console.log('[定位会话需求] 获取 Git 分支...');
      const branchRes = await fetch(`${ROUTE}/git-branch?workspaceId=${encodeURIComponent(targetWorkspace.id)}`);
      if (!branchRes.ok) {
        console.error('[定位会话需求] 获取分支失败:', branchRes.status);
        return;
      }
      const branchData = await branchRes.json();
      console.log('[定位会话需求] 分支数据:', branchData);
      if (!branchData.branch) {
        console.error('[定位会话需求] 没有分支信息');
        return;
      }

      // 6. 解析分支名（支持三种格式）
      const branch = branchData.branch;
      const parsed = parseBranchName(branch);
      console.log('[定位会话需求] 分支解析结果:', parsed);
      if (!parsed) {
        console.error('[定位会话需求] 分支名格式不匹配:', branch);
        return;
      }

      const { developer, date, title, requirementId } = parsed;
      console.log('[定位会话需求] 解析结果 - 开发者:', developer, '日期:', date, '标题:', title, '需求ID:', requirementId);

      // 7. 获取目录树
      console.log('[定位会话需求] 获取目录树...');
      const treeRes = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(targetWorkspace.id)}&t=${Date.now()}`);
      if (!treeRes.ok) {
        console.error('[定位会话需求] 获取目录树失败:', treeRes.status);
        return;
      }
      const treeData = await treeRes.json();
      console.log('[定位会话需求] 目录树数据:', treeData);

      // 7. 查找需求目录
      let existingReq = null;
      if (treeData.tree?.developers) {
        // 如果 developer 为 null（格式 3），在所有开发者中查找
        const devsToSearch = developer
          ? treeData.tree.developers.filter(dev => dev.name === developer)
          : treeData.tree.developers;

        for (const dev of devsToSearch) {
          console.log('[定位会话需求] 检查开发者:', dev.name);
          for (const req of dev.requirements) {
            console.log('[定位会话需求] 检查需求:', req.id, 'vs', requirementId);
            if (req.id === requirementId) {
              existingReq = { ...req, developer: dev.name };
              console.log('[定位会话需求] 找到匹配的需求:', existingReq);
              break;
            }
          }
          if (existingReq) break;
        }
      }

      if (existingReq) {
        console.log('[定位会话需求] 切换到已存在的需求:', existingReq);
        setSelectedReq(existingReq);
        setSelectedFile(null);
        // 保存到配置
        try {
          await fetch(`${ROUTE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId: targetWorkspace.id,
              developerName: existingReq.developer,
              requirementId: existingReq.id
            }),
          });
        } catch (e) {
          console.error('[定位会话需求] 保存配置失败:', e);
        }
        console.log('[定位会话需求] 切换完成');
        return;
      }

      console.log('[定位会话需求] 需求不存在，显示确认弹窗');
      // 8. 目录不存在，弹出确认弹窗
      setPendingCreateReq({ workspace: targetWorkspace, developer, date, title, requirementId });
      setShowCreateConfirm(true);
    } catch (e) {
      console.error('[定位会话需求] 异常:', e);
    }
  };

  // Context value for child components
  const contextValue = {
    refreshTree: () => refreshTreeRef.current?.(),
    refreshSelectedReq: () => refreshSelectedReqRef.current?.(),
  };

  // Rail buttons config
  const topButtons = [
    { id: 'create', icon: h(IconFolder, { size: 18 }), label: '新建' },
    { id: 'sync', icon: h(IconSync, { size: 18 }), label: '同步' },
    { id: 'view', icon: h(IconFile, { size: 18 }), label: '查看' },
    { id: 'trace', icon: h(IconSearch, { size: 18 }), label: '追溯' },
    { id: 'workbench', icon: h(IconWrench, { size: 18 }), label: '工作台' },
    { id: 'templates', icon: h(IconClipboard, { size: 18 }), label: '模板' },
  ];
  const bottomButtons = [
    { id: 'log', icon: h(IconScroll, { size: 18 }), label: '日志' },
    { id: 'settings', icon: h(IconSettings, { size: 18 }), label: '设置' },
  ];

  const renderPanel = () => {
    if (!activePanel) return null;
    if (activePanel === 'create') {
      return h(CreateDirForm, { workspaceId: workspace.id, docsDir, onClose: handlePanelClose });
    }
    if (activePanel === 'trace') {
      return h(TracePanel, { selectedReq, workspaceId: workspace.id });
    }
    if (activePanel === 'workbench') {
      return h(WorkbenchPanel, {
        workspaceId: workspace.id,
        selectedReq,
        indexStatus,
        onRefreshIndex: refreshIndexStatus,
        onClose: handlePanelClose,
        AnalyzePanel,
        IndexPanel,
        SearchPanel,
      });
    }
    if (activePanel === 'templates') {
      return h(TemplatesPanel, {
        workspaceId: workspace.id,
        docsDir,
        selectedReq,
        onClose: handlePanelClose
      });
    }
    if (activePanel === 'sync') {
      return h(SyncPanel, {
        workspaceId: workspace.id, selectedReq,
        onClose: handlePanelClose,
      });
    }
    if (activePanel === 'log') {
      return h(LogPanel, { onClose: handlePanelClose });
    }
    if (activePanel === 'settings') {
      return h(SettingsPanel, { workspaceId: workspace.id, onClose: handlePanelClose });
    }
    return null;
  };

  // Right panel content
  const renderRightContent = () => {
    if (activePanel) {
      return renderPanel();
    }
    // Show file preview when no panel is active but a file is selected
    if (selectedFile) {
      return h(FilePreview, {
        workspaceId: workspace.id,
        relPath: `${selectedFile.path || selectedReq?.path || ''}/${selectedFile.name}`,
        name: selectedFile.name,
        requirement: selectedReq ? { title: selectedReq.title, date: selectedReq.date, type: selectedFile.type } : null,
        onBack: () => setSelectedFile(null),
      });
    }
    // No panel selected - show empty state
    return h('div', null);
  };

  const rightHeaderTitle = activePanel
    ? (activePanel === 'create' ? '创建需求目录'
      : activePanel === 'trace' ? '需求追溯'
      : activePanel === 'workbench' ? '工作台'
      : activePanel === 'templates' ? '模板'
      : activePanel === 'sync' ? '同步文档'
      : activePanel === 'log' ? '操作日志'
      : activePanel === 'settings' ? '设置'
      : '')
    : selectedFile
      ? selectedFile.name
      : '';

  return h(DocsViewerContext.Provider, { value: contextValue },
    h('div', { className: 'rh-root' },
      // ── Top bar ──
      h(TopBar, {
        docsDir,
        currentWorkspace: workspace,
        currentReq: selectedReq,
        onEditDocsDir: onConfigChange,
        onChangeWorkspace: () => setShowWorkspaceModal(true),
        onChangeReq: () => setShowReqDirModal(true),
        onLocateSessionReq: handleLocateSessionReq,
      }),

      h('div', { className: 'rh-three-zone', ref: threeZoneRef },
        // ── Left: Rail toolbar ──
        h('div', { className: 'rh-rail' },
          topButtons.map(btn => {
            // Group button with sub-buttons (workbench / templates)
            if (btn.group) {
              const isGroupExpanded = expandedGroup === btn.group;
              const isSubActive = btn.subButtons.some(sb => activePanel === sb.id);
              return h('div', { key: btn.id, className: 'rh-rail-group' },
                h('button', {
                  className: `rh-rail-btn${isSubActive ? ' active' : ''}${isGroupExpanded ? ' expanded' : ''}`,
                  onClick: () => {
                    if (isGroupExpanded) {
                      setExpandedGroup(null);
                    } else {
                      setExpandedGroup(btn.group);
                    }
                  },
                },
                h('span', null, btn.icon),
                h('span', { className: 'rh-rail-label' }, btn.label),
                h('span', { className: 'rh-rail-arrow' }, isGroupExpanded ? '▾' : '▸')
                ),
                isGroupExpanded && h('div', { className: 'rh-rail-sub' },
                  btn.subButtons.map(sb =>
                    h('button', {
                      key: sb.id,
                      className: `rh-rail-sub-btn${activePanel === sb.id ? ' active' : ''}`,
                      onClick: () => setActivePanel(activePanel === sb.id ? null : sb.id),
                    },
                    h('span', null, sb.icon),
                    h('span', { className: 'rh-rail-label' }, sb.label)
                    )
                  )
                )
              );
            }
            // Regular button
            return h('button', {
              key: btn.id,
              className: `rh-rail-btn${btn.id === 'view' && showFileTree ? ' active' : ''}${btn.id !== 'view' && activePanel === btn.id ? ' active' : ''}`,
              onClick: () => {
                if (btn.id === 'view') {
                  // Toggle file tree sidebar
                  if (showFileTree) {
                    setShowFileTree(false);
                  } else {
                    setShowFileTree(true);
                    setActivePanel(null);
                  }
                } else {
                  setExpandedGroup(null);
                  // Close file tree, open this panel (always, no toggle)
                  if (showFileTree) setShowFileTree(false);
                  setActivePanel(btn.id);
                }
              },
            },
              h('span', null, btn.icon),
              h('span', { className: 'rh-rail-label' }, btn.label)
            );
          }),
          h('div', { className: 'rh-rail-bottom' },
            bottomButtons.map(btn =>
              h('button', {
                key: btn.id,
                className: `rh-rail-btn${activePanel === btn.id ? ' active' : ''}`,
                onClick: () => {
                  setExpandedGroup(null);
                  // Close file tree, open this panel (always, no toggle)
                  if (showFileTree) setShowFileTree(false);
                  setActivePanel(btn.id);
                },
              },
                h('span', null, btn.icon),
                h('span', { className: 'rh-rail-label' }, btn.label)
              )
            )
          )
        ),

        // ── File Tree Sidebar (only when view is active) ──
        showFileTree && h(FileTreeSidebar, {
          workspaceId: workspace.id,
          selectedReq,
          onSelectFile: (file) => {
            setSelectedFile(file);
            setActivePanel(null);
          },
        }),

        // ── Right: Trace / Operations / File Preview ──
        h('div', {
          className: 'rh-right-panel',
          style: { flex: 1 }
        },
          h('div', { className: 'rh-right-header' },
            h('span', null, rightHeaderTitle),
            (activePanel || selectedFile) && h('span', { className: 'rh-right-close', onClick: handlePanelClose, role: 'button', 'aria-label': '关闭面板' }, h(IconClose, { size: 14 }), ' 关闭')
          ),
          h('div', { className: 'rh-right-body' }, renderRightContent())
        )
      ),

      // ── Status bar (4.24) ──
      h('div', { className: 'rh-statusbar' },
        h('span', null, 'ReqHub v1.0'),
        h('span', null,
          `docsDir: ${docsDir} · `,
          h('span', { style: { fontWeight: 600 } }, `${totalReqs} requirements`),
          ' · ',
          indexStatus?.built
            ? h('span', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, 'index: built')
            : h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, 'index: not built')
        )
      ),

      // ── Workspace modal ──
      showWorkspaceModal && h(WorkspaceModal, {
        workspaces,
        selectedId: workspace.id,
        onSelect: async (ws) => {
          onSelectWorkspace(ws);
          // Save to config and clear requirement selection
          try {
            await fetch(`${ROUTE}/config`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workspaceId: ws.id,
                developerName: null,
                requirementId: null
              }),
            });
            onConfigChange();
          } catch { /* ignore */ }
        },
        onClose: () => setShowWorkspaceModal(false),
      }),

      // ── Requirement directory modal ──
      showReqDirModal && h(RequirementDirModal, {
        workspaceId: workspace.id,
        selectedReqId: selectedReq?.id || null,
        onSelect: handleSelectReq,
        onClose: () => setShowReqDirModal(false),
      }),

      // ─ Create requirement confirm modal ──
      showCreateConfirm && pendingCreateReq && h(ConfirmModal, {
        title: '创建需求目录',
        message: `需求目录不存在: ${pendingCreateReq.developer}/${pendingCreateReq.requirementId}\n\n是否创建该目录？`,
        onConfirm: () => {
          setShowCreateConfirm(false);
          const { workspace: ws, developer, date, title, requirementId } = pendingCreateReq;
          setPendingCreateReq(null);
          doCreateAndSwitch(ws, developer, date, title, requirementId);
        },
        onCancel: () => {
          setShowCreateConfirm(false);
          setPendingCreateReq(null);
        },
      })
    )
  );
}

module.exports = { DocsViewerBody };
