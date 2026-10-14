'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect } = React;
const { ROUTE } = require('../constants.js');
const { DocsViewerContext } = require('../context.js');
const { FilePreview } = require('./FilePreview.js');

// ─── SyncPanel ───────────────────────────────────────────────────
// Sync requirement or design docs with code changes from git branch
// Default to phased sync with two buttons: "同步需求文档" and "同步技术方案"
function SyncPanel({ workspaceId, selectedReq, onClose }) {
  const [syncDocType, setSyncDocType] = useState(null); // null | 'requirement' | 'design'
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState('main'); // 'main' | 'history' | 'detail'
  const [selectedHistorySync, setSelectedHistorySync] = useState(null);
  const { refreshTree } = React.useContext(DocsViewerContext);

  if (!selectedReq) {
    return h('div', { className: 'dv-op-panel' },
      h('div', { style: { color: 'var(--dsw-alias-state-warning-primary)', fontSize: 12, marginBottom: 12 } },
        '请先在左侧目录树中选择一个需求目录'),
      h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
    );
  }

  // View sync history
  if (view === 'history') {
    return h(SyncHistoryView, {
      workspaceId,
      requirementId: selectedReq.id,
      onBack: () => {
        setView('main');
        setSelectedHistorySync(null);
      },
      onSelectSync: (sync) => {
        setSelectedHistorySync(sync);
        setView('detail');
      },
    });
  }

  // View sync detail
  if (view === 'detail' && selectedHistorySync) {
    return h(SyncDetailView, {
      sync: selectedHistorySync,
      workspaceId,
      requirementPath: selectedReq.path,
      onBack: () => {
        setView('history');
        setSelectedHistorySync(null);
      },
    });
  }

  // If a sync is in progress or showing results, show the phased sync UI
  if (syncDocType) {
    return h(PhasedSyncUI, {
      workspaceId,
      selectedReq,
      activeTab: syncDocType,
      syncing,
      setSyncing,
      onClose: () => {
        setSyncDocType(null);
        setSyncing(false);
      },
      refreshTree
    });
  }

  return h('div', { className: 'dv-op-panel' },
    h('div', { className: 'dv-op-info', style: { marginBottom: 16 } },
      h('div', null, '需求目录：', h('code', null, `${selectedReq.developer}/${selectedReq.id}`)),
      h('div', { style: { marginTop: 4, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
        '分阶段同步：代码差异分析 → 讨论差异分析 → 增量合并')
    ),

    // History button at top
    h('button', {
      className: 'dv-btn',
      onClick: () => setView('history'),
      style: { width: '100%', marginBottom: 12 }
    }, '同步历史'),

    // Two buttons side by side
    h('div', { style: { display: 'flex', gap: 8 } },
      h('button', {
        className: 'dv-btn dv-btn-primary',
        onClick: () => setSyncDocType('requirement'),
        style: { flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: 600 },
      }, '同步需求文档'),
      h('button', {
        className: 'dv-btn dv-btn-primary',
        onClick: () => setSyncDocType('design'),
        style: { flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: 600 },
      }, '同步技术方案')
    ),
  );
}

// ─── TraditionalSyncUI ──────────────────────────────────────────
function TraditionalSyncUI({ workspaceId, selectedReq, activeTab, syncing, status, streamContent, error, result, docTypeName, docFileName, handleSync, onClose }) {
  return h('div', null,
    h('div', { className: 'dv-op-info' },
      h('div', null, '需求目录：', h('code', null, `${selectedReq.developer}/${selectedReq.id}`)),
      h('div', { style: { marginTop: 4 } }, '目标文件：', h('code', null, docFileName)),
      h('div', { style: { marginTop: 4, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
        '基于当前分支的 git commit 对比代码变更，以代码为准更新文档')
    ),

    h('div', { className: 'dv-btn-stack', style: { marginBottom: 12 } },
      h('button', {
        className: 'dv-btn dv-btn-primary',
        onClick: handleSync,
        disabled: syncing,
      }, syncing ? '同步中...' : `🔄 同步${docTypeName}`),
      h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
    ),

    error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),

    status && h('div', {
      style: {
        fontSize: 12,
        color: 'var(--dsw-alias-brand-primary)',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }
    },
      syncing && h('div', { className: 'dv-spinner', style: { width: 14, height: 14, margin: 0 } }),
      status
    ),

    streamContent && h('div', {
      style: {
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        padding: 12,
        fontSize: 11,
        fontFamily: 'ui-monospace, monospace',
        color: 'var(--dsw-alias-label-secondary)',
        maxHeight: 300,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        lineHeight: 1.5,
        marginBottom: 12,
      }
    }, streamContent),

    result && h('div', { className: 'dv-op-info' },
      h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--dsw-alias-state-success-primary)' } }, '同步完成'),
      result.changes && result.changes.length > 0 && h('div', null,
        h('div', { style: { fontSize: 11, fontWeight: 600, marginBottom: 4 } }, '主要变更：'),
        ...result.changes.map((c, i) =>
          h('div', { key: i, style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 8 } }, `• ${c}`)
        )
      ),
      result.logFile && h('div', { style: { marginTop: 8, fontSize: 11 } },
        '同步日志：', h('code', null, result.logFile)
      )
    )
  );
}

// ─── SessionTurnsView - 会话轮次内容查看器（二级页面）─────────────
function SessionTurnsView({ sessionId, sessionTitle, onBack }) {
  const [turnsData, setTurnsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTurns, setExpandedTurns] = useState(new Set());

  useEffect(() => {
    loadSessionTurns();
  }, [sessionId]);

  const loadSessionTurns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ROUTE}/session-turns?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTurnsData(data);
        } else {
          setError(data.error || '加载失败');
        }
      } else {
        setError('加载失败');
      }
    } catch (e) {
      console.error('Failed to load session turns:', e);
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleTurn = (turnNumber) => {
    setExpandedTurns(prev => {
      const next = new Set(prev);
      if (next.has(turnNumber)) {
        next.delete(turnNumber);
      } else {
        next.add(turnNumber);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (turnsData) {
      setExpandedTurns(new Set(turnsData.turns.map(t => t.turnNumber)));
    }
  };

  const collapseAll = () => {
    setExpandedTurns(new Set());
  };

  if (loading) {
    return h('div', { style: { padding: 20, textAlign: 'center' } },
      h('div', { style: { fontSize: 14, color: 'var(--dsw-alias-label-secondary)' } }, '加载中...')
    );
  }

  if (error) {
    return h('div', { style: { padding: 20 } },
      h('button', { className: 'dv-btn', onClick: onBack, style: { marginBottom: 12 } }, '← 返回'),
      h('div', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, '❌ ', error)
    );
  }

  if (!turnsData || !turnsData.turns || turnsData.turns.length === 0) {
    return h('div', { style: { padding: 20 } },
      h('button', { className: 'dv-btn', onClick: onBack, style: { marginBottom: 12 } }, '← 返回'),
      h('div', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic' } },
        '该会话没有对话内容')
    );
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    // Header
    h('div', { style: {
      padding: '12px 16px',
      borderBottom: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-2)',
      flexShrink: 0,
    }},
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }},
        h('button', { className: 'dv-btn', onClick: onBack, style: { fontSize: 12 } }, '← 返回'),
        h('span', { style: { fontSize: 14, fontWeight: 600, flex: 1 } }, sessionTitle || '会话内容')
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }},
        h('span', null, `共 ${turnsData.turnCount || turnsData.turns?.length || 0} 个轮次`),
        h('span', null, `•`),
        h('span', null, `约 ${((turnsData.totalTokens || 0) / 1000).toFixed(1)}k tokens`),
        h('span', { style: { marginLeft: 'auto' }},
          expandedTurns.size === turnsData.turnCount
            ? h('button', { className: 'dv-btn', onClick: collapseAll, style: { fontSize: 10, padding: '2px 8px' }}, '全部收起')
            : h('button', { className: 'dv-btn', onClick: expandAll, style: { fontSize: 10, padding: '2px 8px' }}, '全部展开')
        )
      )
    ),

    // Turns list
    h('div', { style: { flex: 1, overflow: 'auto', padding: 16 }},
      turnsData.turns.map((turn, idx) => {
        const isExpanded = expandedTurns.has(turn.turnNumber);
        const time = turn.time ? new Date(turn.time).toLocaleString() : '';
        const endTime = turn.endTime ? new Date(turn.endTime).toLocaleString() : '';
        // 兼容两种数据格式：sessionQuery 返回 content，sessions 服务返回 userInput
        const userInput = turn.userInput || turn.content || '';
        const summary = turn.summary || '';

        return h('div', {
          key: idx,
          style: {
            marginBottom: 12,
            border: '1px solid var(--dsw-alias-border-l1)',
            borderRadius: 8,
            overflow: 'hidden',
          }
        },
          // Turn header
          h('div', {
            onClick: () => toggleTurn(turn.turnNumber),
            style: {
              padding: '10px 14px',
              background: isExpanded ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-bg-layer-1)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }
          },
            h('span', { style: {
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--dsw-alias-brand-primary)',
              minWidth: 50,
            }}, `轮次 ${turn.turnNumber}`),
            h('span', { style: {
              flex: 1,
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--dsw-alias-label-primary)',
            }}, (turn.userInput || turn.content || '').substring(0, 100)),
            h('span', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)', flexShrink: 0 }}, time),
            h('span', { style: {
              fontSize: 10,
              color: 'var(--dsw-alias-label-secondary)',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}, '▼')
          ),

          // Turn content (expanded)
          isExpanded && h('div', { style: { padding: '12px 14px', background: 'var(--dsw-alias-bg-layer-1)' }},
            // User input
            h('div', { style: { marginBottom: 12 }},
              h('div', { style: {
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--dsw-alias-label-secondary)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }},
                h('span', { style: { color: 'var(--dsw-alias-brand-primary)' }}, '●'),
                '用户输入'
              ),
              h('div', {
                style: {
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  padding: '10px 12px',
                  background: 'var(--dsw-alias-bg-layer-2)',
                  borderRadius: 6,
                  borderLeft: '3px solid var(--dsw-alias-brand-primary)',
                }
              }, turn.userInput || turn.content || '(无内容)')
            ),

            // Summary
            turn.summary && h('div', null,
              h('div', { style: {
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--dsw-alias-label-secondary)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }},
                h('span', { style: { color: 'var(--dsw-alias-state-success-primary)' }}, '●'),
                '轮次总结'
              ),
              h('div', {
                style: {
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  padding: '10px 12px',
                  background: 'var(--dsw-alias-bg-layer-2)',
                  borderRadius: 6,
                  borderLeft: '3px solid var(--dsw-alias-state-success-primary)',
                }
              }, turn.summary || '(无总结)'),
              endTime && h('div', {
                style: {
                  fontSize: 10,
                  color: 'var(--dsw-alias-label-secondary)',
                  marginTop: 6,
                  textAlign: 'right',
                }
              }, `结束时间: ${endTime}`)
            )
          )
        );
      })
    )
  );
}

// ─── SyncStepList - Reusable step progress display ──────────────
// Used by both active sync view and history detail view
function SyncStepList({ steps, generatedFiles, workspaceId, requirementId, onViewFile }) {
  const [expandedChunks, setExpandedChunks] = useState({});

  const toggleChunks = (phase) => {
    setExpandedChunks(prev => ({
      ...prev,
      [phase]: !prev[phase]
    }));
  };

  const getStepIcon = (status) => {
    switch (status) {
      case 'completed': return h('span', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 16 } }, '✅');
      case 'running': return h('span', { className: 'dv-spinner', style: { display: 'inline-block', width: 14, height: 14, borderWidth: 2 } });
      case 'failed': return h('span', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 16 } }, '❌');
      case 'skipped': return h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 16 } }, '⏭️');
      default: return h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 16 } }, '⏳');
    }
  };

  const getStepColor = (status) => {
    switch (status) {
      case 'completed': return 'var(--dsw-alias-state-success-primary)';
      case 'running': return 'var(--dsw-alias-brand-primary)';
      case 'failed': return 'var(--dsw-alias-state-error-primary)';
      case 'skipped': return 'var(--dsw-alias-label-secondary)';
      default: return 'var(--dsw-alias-label-secondary)';
    }
  };

  // 格式化 token 数
  const formatTokens = (tokens) => {
    if (!tokens) return '0';
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return tokens.toString();
  };

  // Group files by phase
  const filesByPhase = {};
  if (generatedFiles) {
    for (const f of generatedFiles) {
      if (!filesByPhase[f.phase]) filesByPhase[f.phase] = [];
      filesByPhase[f.phase].push(f.fileName);
    }
  }
  // Also include files from step definition
  if (steps) {
    for (const step of steps) {
      if (step.files && step.files.length > 0) {
        if (!filesByPhase[step.phase]) filesByPhase[step.phase] = [];
        for (const f of step.files) {
          if (!filesByPhase[step.phase].includes(f)) {
            filesByPhase[step.phase].push(f);
          }
        }
      }
    }
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 }},
    (steps || []).map((step, idx) => {
      const phaseFiles = filesByPhase[step.phase] || [];
      const hasChunks = step.chunks && step.chunks.length > 0;
      const isExpanded = expandedChunks[step.phase];

      return h('div', {
        key: idx,
        style: {
          padding: '10px 14px',
          background: step.status === 'running' ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-bg-layer-1)',
          borderRadius: 6,
          border: step.status === 'running' ? '1px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-l1)',
        }
      },
        // Step header
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 }},
          getStepIcon(step.status),
          h('span', { style: { fontSize: 13, fontWeight: 600, color: getStepColor(step.status), flex: 1 }}, step.label),
          // 分块次数标签
          hasChunks && h('span', {
            onClick: () => toggleChunks(step.phase),
            style: {
              fontSize: 10,
              color: 'var(--dsw-alias-brand-primary)',
              background: 'var(--dsw-alias-bg-layer-2)',
              padding: '2px 6px',
              borderRadius: 4,
              cursor: 'pointer',
            }
          }, `${step.chunks.length} 块 ▾`),
          // Token 数标签
          step.totalTokens && h('span', {
            style: {
              fontSize: 10,
              color: 'var(--dsw-alias-label-secondary)',
              background: 'var(--dsw-alias-bg-layer-2)',
              padding: '2px 6px',
              borderRadius: 4,
            }
          }, `${formatTokens(step.totalTokens)} tokens`),
        ),
        // Step text
        step.text && h('div', {
          style: {
            fontSize: 11,
            color: 'var(--dsw-alias-label-secondary)',
            marginTop: 4,
            marginLeft: 26,
            lineHeight: 1.5,
          }
        }, step.text),

        // Chunks 详情（可展开）
        hasChunks && isExpanded && h('div', {
          style: { marginTop: 8, marginLeft: 26, display: 'flex', flexDirection: 'column', gap: 6 }
        },
          // 分块总览
          h('div', { style: {
            fontSize: 10,
            color: 'var(--dsw-alias-label-secondary)',
            borderBottom: '1px solid var(--dsw-alias-border-l1)',
            paddingBottom: 4,
            marginBottom: 4,
          }}, `共 ${step.chunks.length} 块，约 ${formatTokens(step.totalTokens)} tokens`),

          // 每块详情
          step.chunks.map((chunk, ci) =>
            h('div', {
              key: ci,
              style: {
                background: 'var(--dsw-alias-bg-layer-2)',
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 10,
              }
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }},
                h('span', { style: { fontWeight: 600 }}, `块 ${ci + 1}`),
                h('span', { style: { color: 'var(--dsw-alias-label-secondary)' }}, `${formatTokens(chunk.tokens)} tokens`),
              ),
              // 文件列表
              chunk.files && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 }},
                chunk.files.slice(0, 5).map((f, fi) =>
                  h('span', {
                    key: fi,
                    style: {
                      color: 'var(--dsw-alias-brand-primary)',
                      background: 'var(--dsw-alias-bg-layer-1)',
                      padding: '1px 4px',
                      borderRadius: 2,
                    }
                  }, f.file || f)
                ),
                chunk.files.length > 5 && h('span', {
                  style: { color: 'var(--dsw-alias-label-secondary)' }
                }, `+${chunk.files.length - 5} 个文件`)
              ),
              // 消息列表
              chunk.messages && h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 }},
                chunk.messages.slice(0, 3).map((m, mi) =>
                  h('div', {
                    key: mi,
                    style: {
                      color: m.role === 'user' ? 'var(--dsw-alias-state-info-primary)' : 'var(--dsw-alias-brand-primary)',
                    }
                  }, `${m.role === 'user' ? '👤' : '🤖'} ${m.preview?.substring(0, 30) || ''}...`)
                ),
                chunk.messages.length > 3 && h('span', {
                  style: { color: 'var(--dsw-alias-label-secondary)' }
                }, `+${chunk.messages.length - 3} 条消息`)
              )
            )
          )
        ),

        // Files
        phaseFiles.length > 0 && h('div', {
          style: { marginTop: 6, marginLeft: 26, display: 'flex', flexDirection: 'column', gap: 3 }
        },
          phaseFiles.map((fileName, fi) =>
            h('div', {
              key: fi,
              onClick: () => onViewFile && onViewFile(fileName),
              style: {
                fontSize: 11,
                color: 'var(--dsw-alias-brand-primary)',
                cursor: onViewFile ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                background: 'var(--dsw-alias-bg-layer-2)',
                borderRadius: 4,
                width: 'fit-content',
              }
            },
              h('span', null, '📄'),
              h('span', { style: { textDecoration: onViewFile ? 'underline' : 'none' }}, fileName)
            )
          )
        )
      );
    })
  );
}



// ─── SyncProgressView - Active sync progress display ────────────
function SyncProgressView({ sync, onBack, onViewFile }) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' }},
    // Header
    h('div', { style: {
      padding: '12px 16px',
      borderBottom: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-2)',
      flexShrink: 0,
    }},
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }},
        h('button', { className: 'dv-btn', onClick: onBack, style: { fontSize: 12 } }, '← 返回'),
        h('span', { style: { fontSize: 14, fontWeight: 600, flex: 1 } },
          sync.status === 'running' ? '🔄 同步进行中' : sync.status === 'completed' ? '✅ 同步完成' : '❌ 同步失败'
        ),
      ),
      h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', display: 'flex', gap: 16 }},
        h('span', null, '类型：', sync.docTypeName),
        h('span', null, '开始：', new Date(sync.startedAt).toLocaleString()),
        sync.completedAt && h('span', null, '完成：', new Date(sync.completedAt).toLocaleString()),
      )
    ),
    // Steps
    h('div', { style: { flex: 1, overflow: 'auto', padding: 16 }},
      h(SyncStepList, {
        steps: sync.steps,
        generatedFiles: sync.generatedFiles,
        workspaceId: sync.workspaceId,
        requirementId: sync.requirementId,
        onViewFile: onViewFile,
      })
    )
  );
}

// ─── SyncHistoryView - List of past syncs ───────────────────────
function SyncHistoryView({ onBack, onSelectSync, workspaceId, requirementId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${ROUTE}/sync-history?workspaceId=${workspaceId}&requirementId=${encodeURIComponent(requirementId)}`)
      .then(res => res.ok ? res.json() : { history: [] })
      .then(data => setHistory(data.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [workspaceId, requirementId]);

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' }},
    // Header
    h('div', { style: {
      padding: '12px 16px',
      borderBottom: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-2)',
      flexShrink: 0,
    }},
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 }},
        h('button', { className: 'dv-btn', onClick: onBack, style: { fontSize: 12 } }, '← 返回'),
        h('span', { style: { fontSize: 14, fontWeight: 600, flex: 1 } }, '同步历史')
      )
    ),
    // List
    h('div', { style: { flex: 1, overflow: 'auto', padding: 16 }},
      loading
        ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--dsw-alias-label-secondary)' }}, '加载中...')
        : history.length === 0
          ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic' }}, '暂无同步记录')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 }},
              history.map(sync =>
                h('div', {
                  key: sync.id,
                  onClick: () => onSelectSync(sync),
                  style: {
                    padding: '12px 16px',
                    border: '1px solid var(--dsw-alias-border-l1)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: 'var(--dsw-alias-bg-layer-1)',
                  }
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }},
                    h('span', { style: { fontSize: 16 }},
                      sync.status === 'completed' ? '✅' : sync.status === 'failed' ? '❌' : '🔄'
                    ),
                    h('span', { style: { fontSize: 13, fontWeight: 600, flex: 1 }}, sync.docTypeName),
                    h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }},
                      new Date(sync.startedAt).toLocaleString()
                    )
                  ),
                  h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', display: 'flex', gap: 12 }},
                    h('span', null, `步骤: ${(sync.steps || []).filter(s => s.status === 'completed').length}/${(sync.steps || []).length}`),
                    sync.generatedFiles && sync.generatedFiles.length > 0 && h('span', null, `文件: ${sync.generatedFiles.length} 个`),
                    sync.stats && h('span', null, `LLM: ${sync.stats.totalLLMCalls || 0} 次`),
                  )
                )
              )
            )
    )
  );
}

// ─── SyncDetailView - View a specific sync's detail ─────────────
function SyncDetailView({ sync, onBack, workspaceId, requirementPath }) {
  const [viewingFile, setViewingFile] = useState(null);

  if (viewingFile) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' }},
      h('div', { style: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        flexShrink: 0,
      }},
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 }},
          h('button', { className: 'dv-btn', onClick: () => setViewingFile(null), style: { fontSize: 12 } }, '← 返回'),
          h('span', { style: { fontSize: 14, fontWeight: 600, flex: 1 } }, '📄 ', viewingFile.split('/').pop())
        )
      ),
      h('div', { style: { flex: 1, overflow: 'hidden' }},
        h(FilePreview, {
          workspaceId,
          relPath: `${requirementPath}/${viewingFile}`,
          name: viewingFile.split('/').pop(),
          requirement: null,
        })
      )
    );
  }

  return h(SyncProgressView, {
    sync,
    onBack,
    onViewFile: (fileName) => setViewingFile(fileName),
  });
}

// ─── PhasedSyncUI - Main sync UI with session selector ──────────
function PhasedSyncUI({ workspaceId, selectedReq, activeTab, syncing, setSyncing, onClose, refreshTree }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState(null);
  const [viewingSession, setViewingSession] = useState(null);
  const [view, setView] = useState('select'); // 'select' | 'progress' | 'history' | 'detail' | 'file'
  const [currentSync, setCurrentSync] = useState(null);
  const [selectedHistorySync, setSelectedHistorySync] = useState(null);
  const [viewingFile, setViewingFile] = useState(null);
  const [branchInfo, setBranchInfo] = useState({ targetBranch: null, baseBranch: null });
  const [runAnalysis, setRunAnalysis] = useState(false);
  const [runIndex, setRunIndex] = useState(false);

  const docTypeName = activeTab === 'requirement' ? '需求文档' : '技术方案';

  // Check for active sync on mount
  useEffect(() => {
    if (!selectedReq?.id) return;
    fetch(`${ROUTE}/sync-active?workspaceId=${workspaceId}&requirementId=${encodeURIComponent(selectedReq.id)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.active && data.sync) {
          setCurrentSync(data.sync);
          setView('progress');
          if (setSyncing) setSyncing(true);
          // If sync is still running, connect to SSE to get updates
          if (data.sync.status === 'running') {
            connectToSyncSSE(data.sync.id);
          }
        }
      })
      .catch(() => {});
  }, [workspaceId, selectedReq?.id]);

  // Load branch info
  useEffect(() => {
    if (!selectedReq?.id) return;
    fetch(`${ROUTE}/sync-branch-info?workspaceId=${encodeURIComponent(workspaceId)}&requirementId=${encodeURIComponent(selectedReq.id)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setBranchInfo(data);
      })
      .catch(() => {});
  }, [workspaceId, selectedReq?.id]);

  // Load sessions
  useEffect(() => {
    loadSessions();
  }, [workspaceId, sessionSearch]);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const params = new URLSearchParams({ workspaceId, limit: '30' });
      if (sessionSearch.trim()) params.set('query', sessionSearch.trim());
      const res = await fetch(`${ROUTE}/sessions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
    } finally {
      setLoadingSessions(false);
    }
  };

  const toggleSession = (sessionId) => {
    setSelectedSessions(prev =>
      prev.includes(sessionId)
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const connectToSyncSSE = async (syncId) => {
    // The SSE connection is already established by the POST request
    // We just need to poll for updates since SSE is tied to the POST
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${ROUTE}/sync-active?workspaceId=${workspaceId}&requirementId=${encodeURIComponent(selectedReq.id)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.sync) {
            setCurrentSync({ ...data.sync });
            if (data.sync.status !== 'running') {
              clearInterval(pollInterval);
              if (setSyncing) setSyncing(false);
              refreshTree();
            }
          } else {
            // Sync completed, fetch from history
            clearInterval(pollInterval);
            if (setSyncing) setSyncing(false);
            // Try to get the completed sync
            const histRes = await fetch(`${ROUTE}/sync-detail?id=${syncId}&workspaceId=${workspaceId}&requirementId=${encodeURIComponent(selectedReq.id)}`);
            if (histRes.ok) {
              const histData = await histRes.json();
              if (histData.sync) {
                setCurrentSync(histData.sync);
              }
            }
            refreshTree();
          }
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
    }, 1000);
    return pollInterval;
  };

  const handlePhasedSync = async () => {
    setError(null);
    setView('progress');
    if (setSyncing) setSyncing(true);

    // Initialize with pending steps (including optional ones)
    const steps = [
      { phase: 'init', label: '🔧 初始化', status: 'running', text: '正在启动...', files: [], chunks: null },
      { phase: 'session_extract', label: '📖 会话提取', status: 'pending', text: '', files: [], chunks: null },
      { phase: 'code_analysis', label: '💻 代码差异分析', status: 'pending', text: '', files: [], chunks: null },
      { phase: 'discussion_analysis', label: '💬 讨论差异分析', status: 'pending', text: '', files: [], chunks: null },
      { phase: 'merge', label: '🔀 增量合并', status: 'pending', text: '', files: [], chunks: null },
      { phase: 'save', label: '💾 保存文件', status: 'pending', text: '', files: [], chunks: null },
    ];
    if (runAnalysis) steps.push({ phase: 'analysis', label: '🧠 构建分析', status: 'pending', text: '', files: [] });
    if (runIndex) steps.push({ phase: 'index', label: '📊 构建索引', status: 'pending', text: '', files: [] });

    const initialSync = {
      id: `sync-${Date.now()}`,
      workspaceId,
      requirementId: selectedReq.id,
      docType: activeTab,
      docTypeName,
      sessionIds: selectedSessions,
      startedAt: Date.now(),
      status: 'running',
      steps,
      generatedFiles: [],
      runAnalysis,
      runIndex,
    };
    setCurrentSync(initialSync);

    try {
      // 获取当前会话 ID
      let currentSessionId = '';
      try {
        const ctx = window.__DSH_CTX__;
        if (ctx) {
          const uiWorkspace = ctx.get?.('uiWorkspace');
          if (uiWorkspace?.selection && typeof uiWorkspace.selection.getSnapshot === 'function') {
            const selection = uiWorkspace.selection.getSnapshot();
            if (selection?.sessionId) {
              currentSessionId = selection.sessionId;
            }
          }
        }
      } catch (e) {
        // 忽略错误
      }

      const response = await fetch(`${ROUTE}/phased-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentSessionId ? { 'x-session-id': currentSessionId } : {}),
        },
        body: JSON.stringify({
          workspaceId,
          requirementId: selectedReq.id,
          docType: activeTab,
          sessionIds: selectedSessions,
          runAnalysis,
          runIndex,
        }),
      });

      // 检查响应类型
      const contentType = response.headers.get('content-type');

      // 如果返回 JSON，说明有正在进行的任务
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.active && data.sync) {
          setCurrentSync(data.sync);
          setView('progress');
          if (setSyncing) setSyncing(true);
          // 如果任务还在运行，开始轮询
          if (data.sync.status === 'running') {
            connectToSyncSSE(data.sync.id);
          }
        } else {
          throw new Error(data.error || data.message || '同步请求失败');
        }
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // SSE 流处理
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const eventData = JSON.parse(line.slice(6));

            if (eventData.type === 'step') {
              // Update step in current sync
              setCurrentSync(prev => {
                if (!prev) return prev;
                const newSteps = prev.steps.map(s => {
                  if (s.phase === eventData.phase) {
                    return { ...s, ...eventData };
                  }
                  return s;
                });
                return { ...prev, steps: newSteps };
              });
            } else if (eventData.type === 'file') {
              // Add file to current sync
              setCurrentSync(prev => {
                if (!prev) return prev;
                const newGeneratedFiles = [...(prev.generatedFiles || []), { phase: eventData.phase, fileName: eventData.fileName }];
                const newSteps = prev.steps.map(s => {
                  if (s.phase === eventData.phase) {
                    return { ...s, files: [...(s.files || []), eventData.fileName] };
                  }
                  return s;
                });
                return { ...prev, generatedFiles: newGeneratedFiles, steps: newSteps };
              });
            } else if (eventData.type === 'done') {
              // Sync completed - fetch final state from server
              const detailRes = await fetch(`${ROUTE}/sync-detail?id=${eventData.syncId}&workspaceId=${workspaceId}&requirementId=${encodeURIComponent(selectedReq.id)}`);
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                if (detailData.sync) {
                  setCurrentSync(detailData.sync);
                }
              }
              if (setSyncing) setSyncing(false);
              refreshTree();
            } else if (eventData.type === 'error') {
              throw new Error(eventData.error);
            }
          } catch (e) {
            if (e.message && !e.message.includes('Failed to parse')) {
              console.error('SSE parse error:', e.message);
              setError(e.message);
              if (setSyncing) setSyncing(false);
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const eventData = JSON.parse(buffer.trim().replace(/^data: /, ''));
          if (eventData.type === 'done') {
            const detailRes = await fetch(`${ROUTE}/sync-detail?id=${eventData.syncId}&workspaceId=${workspaceId}&requirementId=${encodeURIComponent(selectedReq.id)}`);
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              if (detailData.sync) {
                setCurrentSync(detailData.sync);
              }
            }
            if (setSyncing) setSyncing(false);
            refreshTree();
          }
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Phased sync failed:', e);
      setError(e.message || '分阶段同步失败');
      if (setSyncing) setSyncing(false);
    }
  };

  // Secondary page: viewing session turns
  if (viewingSession) {
    const session = sessions.find(s => s.id === viewingSession.id);
    return h(SessionTurnsView, {
      sessionId: viewingSession.id,
      sessionTitle: session?.title || '会话内容',
      onBack: () => setViewingSession(null),
    });
  }

  // Secondary page: viewing a file
  if (view === 'file' && viewingFile) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' }},
      h('div', { style: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        flexShrink: 0,
      }},
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 }},
          h('button', { className: 'dv-btn', onClick: () => {
            setViewingFile(null);
            setView('progress');
          }, style: { fontSize: 12 } }, '← 返回'),
          h('span', { style: { fontSize: 14, fontWeight: 600, flex: 1 } }, '📄 ', viewingFile.split('/').pop())
        )
      ),
      h('div', { style: { flex: 1, overflow: 'hidden' }},
        h(FilePreview, {
          workspaceId,
          relPath: `${selectedReq.path}/${viewingFile}`,
          name: viewingFile.split('/').pop(),
          requirement: null,
        })
      )
    );
  }

  // Secondary page: sync history
  if (view === 'history') {
    return h(SyncHistoryView, {
      workspaceId,
      requirementId: selectedReq.id,
      onBack: () => setView('select'),
      onSelectSync: (sync) => {
        setSelectedHistorySync(sync);
        setView('detail');
      },
    });
  }

  // Secondary page: sync detail (from history)
  if (view === 'detail' && selectedHistorySync) {
    return h(SyncDetailView, {
      sync: selectedHistorySync,
      onBack: () => {
        setView('history');
        setSelectedHistorySync(null);
      },
    });
  }

  // Progress view (active sync)
  if (view === 'progress' && currentSync) {
    return h(SyncProgressView, {
      sync: currentSync,
      onBack: () => {
        setView('select');
        setCurrentSync(null);
      },
      onViewFile: (fileName) => {
        setViewingFile(fileName);
        setView('file');
      },
    });
  }

  // Main view: session selector + sync button
  return h('div', null,
    h('div', { className: 'dv-op-info', style: { marginBottom: 12 } },
      h('div', null, '需求目录：', h('code', null, `${selectedReq.developer}/${selectedReq.id}`)),
      h('div', { style: { marginTop: 4, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
        `同步${docTypeName}：代码差异分析 → 讨论差异分析 → 增量合并`)
    ),

    // Branch info display
    h('div', { style: {
      marginBottom: 12,
      padding: '8px 12px',
      background: 'var(--dsw-alias-bg-layer-2)',
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border-l1)',
      fontSize: 12
    }},
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }},
        h('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}, '🔀 目标分支：'),
        h('code', { style: {
          flex: 1,
          color: branchInfo.targetBranch ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)',
          fontSize: 11
        }}, branchInfo.targetBranch || '未找到对应分支')
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 }},
        h('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}, '📊 基准分支：'),
        h('code', { style: {
          flex: 1,
          color: branchInfo.baseBranch ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
          fontSize: 11
        }}, branchInfo.baseBranch || '未找到基准分支')
      )
    ),

    // Session selector
    h('div', { style: { marginBottom: 12 } },
      h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, '选择相关会话（可选）'),
      h('input', {
        className: 'dv-search-input',
        type: 'text',
        placeholder: '搜索会话...',
        value: sessionSearch,
        onChange: (e) => setSessionSearch(e.target.value),
        style: { marginBottom: 6, fontSize: 11 },
      }),
      loadingSessions
        ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, '加载中...')
        : sessions.length === 0
          ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic' } }, '未找到相关会话')
          : h('div', {
              style: {
                maxHeight: 200,
                overflow: 'auto',
                border: '1px solid var(--dsw-alias-border-l1)',
                borderRadius: 6,
              }
            },
            sessions.map(s =>
              h('div', {
                key: s.id,
                style: {
                  borderBottom: '1px solid var(--dsw-alias-border-l1)',
                }
              },
                h('div', {
                  onClick: () => toggleSession(s.id),
                  style: {
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: selectedSessions.includes(s.id) ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                  }
                },
                  h('span', { style: { fontSize: 14 } }, selectedSessions.includes(s.id) ? '☑' : '☐'),
                  h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 } }, s.title),
                  h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
                    `${s.eventCount || 0} 事件`
                  ),
                  h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', flexShrink: 0 } },
                    new Date(s.createdAt).toLocaleDateString()
                  ),
                  h('button', {
                    onClick: (e) => {
                      e.stopPropagation();
                      setViewingSession(s);
                    },
                    style: {
                      padding: '4px 10px',
                      fontSize: 11,
                      background: 'var(--dsw-alias-bg-layer-2)',
                      color: 'var(--dsw-alias-brand-primary)',
                      border: '1px solid var(--dsw-alias-border-l1)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: 500,
                    }
                  }, '查看内容')
                )
              )
            )
          ),
      selectedSessions.length > 0 && h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 6 } },
        `已选择 ${selectedSessions.length} 个会话`
      )
    ),

    // Post-sync options
    h('div', { style: { marginBottom: 12, padding: '10px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 6 } },
      h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, '同步后操作'),
      h('label', {
        style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer', fontSize: 12 }
      },
        h('input', {
          type: 'checkbox',
          checked: runAnalysis,
          onChange: (e) => setRunAnalysis(e.target.checked),
          style: { cursor: 'pointer' }
        }),
        h('span', null, '🧠 构建分析（生成 .meta.json）')
      ),
      h('label', {
        style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }
      },
        h('input', {
          type: 'checkbox',
          checked: runIndex,
          onChange: (e) => setRunIndex(e.target.checked),
          style: { cursor: 'pointer' }
        }),
        h('span', null, '📊 构建索引（重建搜索索引）')
      )
    ),

    // Action buttons
    h('div', { style: { marginBottom: 12 } },
      h('button', {
        className: 'dv-btn dv-btn-primary',
        onClick: handlePhasedSync,
        disabled: syncing,
        style: { width: '100%' },
      }, syncing ? '同步中...' : `🧠 开始同步${docTypeName}`)
    ),

    error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),
  );
}

module.exports = { SyncPanel };
