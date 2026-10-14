'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect, useRef, useContext } = React;
const { ROUTE } = require('../constants.js');
const { DocsViewerContext } = require('../context.js');

// ─── useAnalysis hook ─────────────────────────────────────────────
function useAnalysis(workspaceId, selectedReq) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMode, setAnalysisMode] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const eventSourceRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const { refreshTree, refreshSelectedReq } = useContext(DocsViewerContext);

  const startAnalysis = async (mode) => {
    setAnalysisMode(mode);
    setAnalyzing(true);
    setError(null);
    setSuccess(null);

    // Get preview files first
    const url = mode === 'single' && selectedReq
      ? `${ROUTE}/analyze-preview?workspaceId=${encodeURIComponent(workspaceId)}&requirementId=${encodeURIComponent(selectedReq.id)}`
      : `${ROUTE}/analyze-preview?workspaceId=${encodeURIComponent(workspaceId)}`;

    let previewData;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('获取预览失败');
      previewData = await res.json();
    } catch (e) {
      setError(String(e));
      setAnalyzing(false);
      return;
    }

    // Initialize status for all files
    const initialStatus = {};
    for (const f of previewData.files) {
      initialStatus[f.id] = { status: 'pending' };
    }
    setAnalysisStatus(initialStatus);

    // Start streaming analysis
    // 获取当前会话 ID（分析功能需要在 DSH 会话中调用）
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

    if (!currentSessionId) {
      setError('分析功能需要在活跃的 DSH 会话中调用');
      setAnalyzing(false);
      return;
    }

    const streamUrl = mode === 'single' && selectedReq
      ? `${ROUTE}/analyze-stream?workspaceId=${encodeURIComponent(workspaceId)}&requirementId=${encodeURIComponent(selectedReq.id)}&sessionId=${encodeURIComponent(currentSessionId)}`
      : `${ROUTE}/analyze-stream?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(currentSessionId)}`;

    try {
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'start') {
          setAnalysisStatus(prev => ({
            ...prev,
            [data.id]: { status: 'analyzing' }
          }));
        } else if (data.type === 'completed') {
          setAnalysisStatus(prev => ({
            ...prev,
            [data.id]: { status: 'completed', elapsed: data.elapsed }
          }));
        } else if (data.type === 'failed') {
          setAnalysisStatus(prev => ({
            ...prev,
            [data.id]: { status: 'failed', error: data.error }
          }));
        } else if (data.type === 'cancelled') {
          // Server acknowledged cancellation
          setAnalysisStatus(prev => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (next[key].status === 'pending' || next[key].status === 'analyzing') {
                next[key] = { status: 'cancelled' };
              }
            }
            return next;
          });
          setSuccess(`分析已终止: ${data.success}/${data.total} 完成 (${data.elapsed}s)`);
          refreshTree();
          eventSource.close();
          eventSourceRef.current = null;
          setAnalyzing(false);
        } else if (data.type === 'done') {
          setSuccess(`${mode === 'single' ? '当前需求' : '全量'}分析完成: ${data.success}/${data.total} 成功 (${data.elapsed}s)`);
          refreshTree();
          // Refresh selectedReq to update hasMeta status
          refreshSelectedReq();
          eventSource.close();
          eventSourceRef.current = null;
          setAnalyzing(false);
        } else if (data.type === 'error') {
          setError(data.error);
          eventSource.close();
          eventSourceRef.current = null;
          setAnalyzing(false);
        }
      };

      eventSource.onerror = () => {
        // If user cancelled, don't show error
        if (!eventSourceRef.current) return;
        setError('连接中断');
        eventSource.close();
        eventSourceRef.current = null;
        setAnalyzing(false);
      };
    } catch (e) {
      setError(String(e));
      setAnalyzing(false);
    }
  };

  const cancelAnalysis = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Mark all pending/analyzing as cancelled
    setAnalysisStatus(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].status === 'pending' || next[key].status === 'analyzing') {
          next[key] = { status: 'cancelled' };
        }
      }
      return next;
    });
    setSuccess('分析已终止');
    setAnalyzing(false);
    refreshTree();
    // Notify server to stop processing
    try {
      await fetch(`${ROUTE}/analysis-cancel`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to cancel analysis on server:', e);
    }
  };

  const restoreAnalysis = async (taskData) => {
    // Restore analysis state from server
    setAnalyzing(true);
    setAnalysisMode(taskData.mode);
    setAnalysisStatus(taskData.status);

    // Poll for status updates instead of reconnecting to SSE
    // (Reconnecting SSE would start a new analysis task!)
    const pollStatus = async () => {
      try {
        const res = await fetch(`${ROUTE}/analysis-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.active) {
            setAnalysisStatus(data.status);
            return { continue: true, data };
          } else {
            // Task completed
            setAnalyzing(false);
            setSuccess(`分析完成: ${data.successCount || '?'}/${data.totalCount || '?'} 成功`);
            refreshTree();
            refreshSelectedReq();
            return { continue: false, data };
          }
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
      return { continue: false, data: null };
    };

    // Initial poll
    const { continue: shouldContinue, data: initialData } = await pollStatus();

    // Return files for caller to use
    const files = initialData?.files || taskData.files || [];

    // Set up polling interval if task is still active
    if (shouldContinue) {
      pollIntervalRef.current = setInterval(async () => {
        const { continue: keepPolling } = await pollStatus();
        if (!keepPolling && pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }, 2000); // Poll every 2 seconds
    }

    return files;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  return {
    analyzing,
    analysisMode,
    analysisStatus,
    error,
    success,
    startAnalysis,
    cancelAnalysis,
    restoreAnalysis,
  };
}

// ─── AnalyzePanel (4.3, 4.4, 4.14-4.16) ─────────────────────────
function AnalyzePanel({ workspaceId, selectedReq, onClose }) {
  const [aiConfig, setAiConfig] = useState(null);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [showMeta, setShowMeta] = useState(false);
  const [metaData, setMetaData] = useState(null);
  const [metaScope, setMetaScope] = useState('single'); // 'single' or 'all'
  const { analyzing, analysisMode, analysisStatus, error, success, startAnalysis, cancelAnalysis, restoreAnalysis } = useAnalysis(workspaceId, selectedReq);

  useEffect(() => {
    fetch(`${ROUTE}/ai-config`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setAiConfig(data); })
      .catch(() => {});

    // Check if there's an active analysis task
    fetch(`${ROUTE}/analysis-status`)
      .then(res => res.ok ? res.json() : null)
      .then(async (data) => {
        if (data && data.active) {
          const files = await restoreAnalysis(data);
          if (files.length > 0) {
            setPreviewFiles(files);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleAnalyzeSingle = () => {
    if (!selectedReq) return;
    // Get preview files first
    fetch(`${ROUTE}/analyze-preview?workspaceId=${encodeURIComponent(workspaceId)}&requirementId=${encodeURIComponent(selectedReq.id)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setPreviewFiles(data.files || []);
        startAnalysis('single');
      })
      .catch(() => startAnalysis('single'));
  };

  const handleAnalyzeAll = () => {
    // Get preview files first
    fetch(`${ROUTE}/analyze-preview?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setPreviewFiles(data.files || []);
        startAnalysis('all');
      })
      .catch(() => startAnalysis('all'));
  };

  const handleViewMeta = async (scope) => {
    setMetaScope(scope);
    setShowMeta(true);
    setMetaData(null);

    try {
      let url = `${ROUTE}/meta?workspaceId=${encodeURIComponent(workspaceId)}`;
      if (scope === 'single' && selectedReq) {
        url += `&path=${encodeURIComponent(selectedReq.id)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMetaData(data);
      } else {
        setMetaData({ error: '加载失败' });
      }
    } catch (e) {
      setMetaData({ error: e.message });
    }
  };

  // Meta viewer sub-component
  const MetaViewer = () => {
    if (!showMeta) return null;

    if (!metaData) {
      return h('div', { className: 'dv-op-panel' },
        h('div', { style: { textAlign: 'center', padding: 20 } }, '加载中...'),
        h('div', { className: 'dv-btn-stack' },
          h('button', { className: 'dv-btn', onClick: () => setShowMeta(false) }, '← 返回')
        )
      );
    }

    if (metaData.error) {
      return h('div', { className: 'dv-op-panel' },
        h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', padding: 20 } }, '❌ ', metaData.error),
        h('div', { className: 'dv-btn-stack' },
          h('button', { className: 'dv-btn', onClick: () => setShowMeta(false) }, '← 返回')
        )
      );
    }

    // Single meta view
    if (metaScope === 'single' && metaData.meta) {
      const meta = metaData.meta;
      return h('div', { className: 'dv-op-panel' },
        h('div', { className: 'dv-op-header' },
          h('span', null, 'Meta 详情')
        ),
        metaData.updatedAt && h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 12 } },
          '更新时间：', new Date(metaData.updatedAt).toLocaleString()
        ),
        h('div', { className: 'dv-op-info' },
          h('div', null, '类型：', h('span', { style: { fontWeight: 600 } }, meta.type || 'unknown')),
          meta.summary && h('div', { style: { marginTop: 8 } }, '摘要：', meta.summary)
        ),
        meta.features && meta.features.length > 0 && h('div', { style: { marginTop: 12 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, '功能点'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
            meta.features.map((f, i) => h('span', { key: i, className: 'dv-badge' }, f))
          )
        ),
        meta.fields && meta.fields.length > 0 && h('div', { style: { marginTop: 12 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, '字段'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
            meta.fields.map((f, i) => h('code', { key: i, style: { padding: '2px 8px', fontSize: 11, background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 4 } }, f))
          )
        ),
        meta.tags && meta.tags.length > 0 && h('div', { style: { marginTop: 12 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, '标签'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
            meta.tags.map((t, i) => h('span', { key: i, className: 'dv-badge dv-badge-success' }, t))
          )
        ),
        meta.timeline && meta.timeline.length > 0 && h('div', { style: { marginTop: 12 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, '时间线'),
          h('div', { style: { fontSize: 11 } },
            meta.timeline.map((t, i) => h('div', { key: i, style: { marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid var(--dsw-alias-border-l1)' } },
              h('div', { style: { fontWeight: 600 } }, t.date, ' - ', t.title),
              t.description && h('div', { style: { color: 'var(--dsw-alias-label-secondary)', marginTop: 2 } }, t.description)
            ))
          )
        ),
        h('div', { className: 'dv-btn-stack', style: { marginTop: 16 } },
          h('button', { className: 'dv-btn', onClick: () => setShowMeta(false) }, '← 返回')
        )
      );
    }

    // All meta view
    if (metaScope === 'all' && metaData.items) {
      return h('div', { className: 'dv-op-panel' },
        h('div', { className: 'dv-op-header' },
          h('span', null, '全量 Meta（', metaData.items.length, ' 个需求）')
        ),
        h('div', { style: { maxHeight: 500, overflow: 'auto' } },
          metaData.items.map((item, idx) => h('div', { key: idx, style: { marginBottom: 16, padding: 12, background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 6 } },
            h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } },
              item.id, ' - ', item.title
            ),
            h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6 } },
              item.developer, ' | ', item.date
            ),
            item.meta.summary && h('div', { style: { fontSize: 11, marginBottom: 6 } }, item.meta.summary),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10 } },
              item.meta.type && h('span', { className: 'dv-badge' }, item.meta.type),
              item.meta.features && item.meta.features.slice(0, 3).map((f, i) => h('span', { key: i, className: 'dv-badge' }, f)),
              item.meta.features && item.meta.features.length > 3 && h('span', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)' } }, `+${item.meta.features.length - 3}`)
            )
          ))
        ),
        h('div', { className: 'dv-btn-stack', style: { marginTop: 16 } },
          h('button', { className: 'dv-btn', onClick: () => setShowMeta(false) }, '← 返回')
        )
      );
    }

    return null;
  };

  if (showMeta) {
    return MetaViewer();
  }

  return h('div', { className: 'dv-op-panel' },
    // 4.14: Current requirement info
    selectedReq && h('div', { className: 'dv-req-card' },
      h('div', { className: 'dv-req-card-title' }, selectedReq.title),
      h('div', { className: 'dv-req-card-row' }, '开发者：', selectedReq.developer),
      h('div', { className: 'dv-req-card-row' }, '日期：', selectedReq.date),
      h('div', { className: 'dv-req-card-row' }, '文档数：', selectedReq.fileCount),
      h('div', { className: 'dv-req-card-row' }, '状态：',
        selectedReq.hasMeta
          ? h('span', { className: 'dv-badge dv-badge-success' }, '已分析')
          : h('span', { className: 'dv-badge dv-badge-warn' }, '未分析')
      ),
      // 4.15: Analysis timestamp
      selectedReq.metaUpdatedAt && h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 } },
        '最后分析：', new Date(selectedReq.metaUpdatedAt).toLocaleString())
    ),

    // 4.16: AI config display
    aiConfig && h('div', { className: 'dv-op-info' },
      h('div', null, '🤖 Provider：', h('code', null, aiConfig.provider)),
      h('div', null, '📦 Model：', h('code', null, aiConfig.model))
    ),

    h('div', { className: 'dv-btn-stack', style: { marginBottom: 12 } },
      h('button', {
        className: `dv-btn${selectedReq ? ' dv-btn-primary' : ''}`,
        onClick: handleAnalyzeSingle,
        disabled: analyzing || !selectedReq
      }, analyzing && analysisMode === 'single' ? '分析中...' : '🔄 分析当前需求'),
      h('button', {
        className: 'dv-btn',
        onClick: handleAnalyzeAll,
        disabled: analyzing
      }, analyzing && analysisMode === 'all' ? '分析中...' : '🔄 项目全量分析'),
      analyzing && h('button', {
        className: 'dv-btn',
        onClick: cancelAnalysis,
        style: { color: 'var(--dsw-alias-state-error-primary)' }
      }, '⛔ 终止分析'),
      h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
    ),

    // Meta viewing buttons
    h('div', { className: 'dv-btn-stack', style: { marginBottom: 12 } },
      h('button', {
        className: 'dv-btn',
        onClick: () => handleViewMeta('single'),
        disabled: !selectedReq?.hasMeta
      }, '📊 查看当前 Meta'),
      h('button', {
        className: 'dv-btn',
        onClick: () => handleViewMeta('all')
      }, '📊 查看全量 Meta')
    ),

    // Analysis file list with real-time status
    previewFiles.length > 0 && h('div', { className: 'dv-analysis-list' },
      h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 } },
        `共 ${previewFiles.length} 个文件待分析`),
      previewFiles.map(file => {
        const status = analysisStatus[file.id] || { status: 'pending' };
        return h('div', { key: file.id, className: 'dv-analysis-item' },
          h('div', { className: 'dv-analysis-item-header' },
            h('div', { style: { flex: 1, overflow: 'hidden' } },
              h('div', { className: 'dv-analysis-item-name' },
                file.id,
                !file.hasDocs && h('span', { style: { color: 'var(--dsw-alias-label-secondary)', marginLeft: 8 } }, '(无文档)')
              ),
              h('div', { className: 'dv-analysis-item-path' }, `${file.developer} / ${file.path}`)
            ),
            h('span', { className: `dv-status-tag ${status.status}` },
              status.status === 'pending' && '⏳ 等待分析',
              status.status === 'analyzing' && '🔄 正在分析',
              status.status === 'completed' && `✅ 完成${status.elapsed ? ` (${status.elapsed}s)` : ''}`,
              status.status === 'failed' && '❌ 失败',
              status.status === 'cancelled' && '⛔ 已取消'
            )
          ),
          status.status === 'failed' && status.error && h('div', { className: 'dv-analysis-item-error' },
            `错误: ${status.error}`
          )
        );
      })
    ),

    error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),
    success && h('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, marginBottom: 8 } }, success)
  );
}

module.exports = { AnalyzePanel };
