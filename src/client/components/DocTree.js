'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect, useCallback } = React;

const { ROUTE } = require('../constants.js');
const { Spinner } = require('./Spinner.js');

// ─── Helpers ─────────────────────────────────────────────────────
function getDocIcon(type) {
  const icons = { requirement: '📋', design: '📐', cr: '🔍', other: '📄' };
  return icons[type] || '📄';
}

// ─── DocTree (3-level tree) ──────────────────────────────────────
// Covers: 2.1, 2.2, 2.3, 2.7, 2.8, 2.9, 2.10, 2.11, 2.14, 2.15
function DocTree({ workspaceId, docsDir, selectedReqId, onSelectReq, selectedFile, onSelectFile, onTreeLoaded, onRefreshReady }) {
  const [tree, setTree] = useState(null);
  const [totalReqs, setTotalReqs] = useState(0);
  const [error, setError] = useState(null);
  const [expandedDevs, setExpandedDevs] = useState({});
  const [expandedReqs, setExpandedReqs] = useState({});

  const loadTree = useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `${ROUTE}/tree?workspaceId=${encodeURIComponent(workspaceId)}&t=${Date.now()}`;
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data.error || 'tree failed');
        else {
          setTree(data.tree);
          setTotalReqs(data.totalRequirements || 0);
          // Notify parent of total requirements
          if (onTreeLoaded) {
            onTreeLoaded({ totalReqs: data.totalRequirements || 0 });
          }
          // Default: expand first developer
          if (data.tree?.developers?.length > 0 && Object.keys(expandedDevs).length === 0) {
            setExpandedDevs({ [data.tree.developers[0].name]: true });
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    const cleanup = loadTree();
    return cleanup;
  }, [loadTree]);

  // Expose refresh function to parent via callback
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(loadTree);
    }
  }, [loadTree, onRefreshReady]);

  // Auto-expand tree nodes for selected requirement
  useEffect(() => {
    if (!tree?.developers || !selectedReqId) return;

    // Find the developer and requirement for the selected ID
    for (const dev of tree.developers) {
      for (const req of dev.requirements) {
        if (req.id === selectedReqId) {
          // Expand the developer node if not already expanded
          setExpandedDevs(prev => {
            if (prev[dev.name]) return prev;
            return { ...prev, [dev.name]: true };
          });
          // Expand the requirement node if not already expanded
          setExpandedReqs(prev => {
            if (prev[req.id]) return prev;
            return { ...prev, [req.id]: true };
          });
          return;
        }
      }
    }
  }, [tree, selectedReqId]);

  if (error) return h('div', { className: 'dv-empty' }, h('span', { className: 'dv-error' }, error));
  if (!tree) return h(Spinner, null);

  const toggleDev = (name) => {
    setExpandedDevs(prev => ({ ...prev, [name]: !prev[name] }));
  };
  const toggleReq = (id) => {
    setExpandedReqs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return h('div', { className: 'dv-doc-tree' },
    tree.developers.length === 0
      ? h('div', { className: 'dv-empty', style: { minHeight: 80 } },
          h('span', { className: 'dv-empty-icon' }, '📁'),
          `No ${docsDir}/ directory or no requirements found.`)
      : tree.developers.map(dev => {
          const isDevExpanded = !!expandedDevs[dev.name];
          return h('div', { key: dev.name, className: 'dv-dev-node' },
            h('div', { className: 'dv-dev-header', onClick: () => toggleDev(dev.name) },
              h('span', null, isDevExpanded ? '▼' : '▶'),
              h('span', null, `📁 ${dev.name}`),
              h('span', { className: 'dv-dev-count' }, `(${dev.requirementCount})`)
            ),
            isDevExpanded && dev.requirements.map(req => {
              const isReqSelected = selectedReqId === req.id;
              const isReqExpanded = !!expandedReqs[req.id];
              return h('div', { key: req.id, className: 'dv-req-node' },
                h('div', {
                  className: `dv-req-header${isReqSelected ? ' selected' : ''}`,
                  onClick: () => {
                    if (isReqSelected) {
                      onSelectReq(null);
                    } else {
                      onSelectReq(req);
                    }
                    toggleReq(req.id);
                  },
                },
                  h('span', null, `📂 ${req.date.slice(5)} ${req.title}`),
                  req.fileCount > 0 && h('span', { className: 'dv-dev-count' }, `📄 ${req.fileCount}`)
                ),
                isReqExpanded && h('div', null,
                  req.files.length > 0
                    ? req.files.map(file => {
                        const isActive = selectedFile?.name === file.name && selectedFile?.reqId === req.id;
                        return h('div', {
                          key: file.name,
                          className: `dv-file-item${isActive ? ' active' : ''}`,
                          onClick: (e) => {
                            e.stopPropagation();
                            onSelectFile({ ...file, reqId: req.id, reqTitle: req.title, reqDate: req.date, developer: req.developer });
                          },
                        }, `${getDocIcon(file.type)} ${file.name}`);
                      })
                    : h('div', { className: 'dv-empty-hint' }, '（无文档）'),
                  req.hasMeta && h('div', { className: 'dv-meta-item' }, '.meta.json')
                )
              );
            })
          );
        })
  );
}

module.exports = { DocTree };
