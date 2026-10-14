'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect, useRef, useCallback, useMemo } = React;
const { ROUTE } = require('../constants.js');
const { getDocIcon } = require('../utils/getDocIcon.js');
const { createIconComponents } = require('../icons.js');

const { IconFile, IconClose } = createIconComponents(h);

const DOC_EXTS = ['.md', '.text', '.txt', '.html', '.htm'];
const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 220;

function isDocFile(name) {
  const lower = name.toLowerCase();
  return DOC_EXTS.some(ext => lower.endsWith(ext));
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FileTreeSidebar({ workspaceId, selectedReq, onSelectFile }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFile, setActiveFile] = useState(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [filterExt, setFilterExt] = useState('all'); // all, .md, .html, .txt, .text
  const [filterType, setFilterType] = useState('all'); // all, requirement, design, cr, other
  const [sortBy, setSortBy] = useState('mtime-desc'); // none, mtime-asc, mtime-desc
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const sidebarRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    if (!selectedReq) {
      setFiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspaceId)}&t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;

          const allFiles = [];
          if (data.tree?.developers) {
            for (const dev of data.tree.developers) {
              for (const req of dev.requirements) {
                if (req.id === selectedReq.id) {
                  for (const file of req.files) {
                    if (isDocFile(file.name)) {
                      allFiles.push({
                        ...file,
                        reqId: req.id,
                        reqTitle: req.title,
                        reqDate: req.date,
                        developer: dev.name,
                      });
                    }
                  }
                }
              }
            }
          }
          setFiles(allFiles);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId, selectedReq?.id]);

  const handleFileClick = (file) => {
    setActiveFile(file);
    onSelectFile(file);
  };

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const onMove = (ev) => {
      const deltaX = ev.clientX - startXRef.current;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + deltaX));
      // Direct DOM manipulation — no React re-render during drag
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
        sidebarRef.current.style.minWidth = `${newWidth}px`;
      }
    };

    const onUp = () => {
      setIsResizing(false);
      const deltaX = startXRef.current ? 0 : 0; // recalc final width
      const finalWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + (startXRef.current ? 0 : 0)));
      // Sync React state with final DOM width
      if (sidebarRef.current) {
        const w = parseInt(sidebarRef.current.style.width, 10);
        if (w) setWidth(w);
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width]);

  // Filter and sort files
  const filteredFiles = useMemo(() => {
    let result = files;

    // Filter by extension
    if (filterExt !== 'all') {
      if (filterExt === '.txt') {
        // Match both .txt and .text
        result = result.filter(f => {
          const lower = f.name.toLowerCase();
          return lower.endsWith('.txt') || lower.endsWith('.text');
        });
      } else {
        result = result.filter(f => f.name.toLowerCase().endsWith(filterExt));
      }
    }

    // Filter by document type
    if (filterType !== 'all') {
      result = result.filter(f => (f.type || 'other') === filterType);
    }

    // Sort by mtime
    if (sortBy === 'mtime-asc') {
      result = [...result].sort((a, b) => {
        if (!a.mtime && !b.mtime) return 0;
        if (!a.mtime) return 1;
        if (!b.mtime) return -1;
        return new Date(a.mtime) - new Date(b.mtime);
      });
    } else if (sortBy === 'mtime-desc') {
      result = [...result].sort((a, b) => {
        if (!a.mtime && !b.mtime) return 0;
        if (!a.mtime) return 1;
        if (!b.mtime) return -1;
        return new Date(b.mtime) - new Date(a.mtime);
      });
    }

    return result;
  }, [files, filterExt, filterType, sortBy]);

  const docTypeLabels = { requirement: '需求', design: '技术方案', cr: 'CR', other: '文档' };

  return h('div', {
    ref: sidebarRef,
    className: `rh-file-tree-sidebar${!expanded ? ' collapsed' : ''}${isResizing ? ' resizing' : ''}`,
    style: { width: `${width}px`, minWidth: `${width}px` },
  },
    // Resize handle (only when expanded)
    expanded && h('div', {
      className: `rh-resize-handle${isResizing ? ' dragging' : ''}`,
      onMouseDown: handleMouseDown,
      title: '拖动调整宽度',
    }),

    // Toggle button (always visible)
    h('button', {
      className: 'rh-file-tree-toggle',
      onClick: () => setExpanded(!expanded),
      'aria-label': expanded ? '收起文件树' : '展开文件树',
      title: expanded ? '收起' : '展开',
    }, expanded ? '‹' : '›'),

    // Content (only when expanded)
    expanded && h('div', { className: 'rh-file-tree-content' },
      // Filters (collapsible, default collapsed)
      h('div', { className: 'rh-file-tree-filters' },
        h('div', {
          className: 'rh-filter-toggle',
          onClick: () => setShowFilters(!showFilters),
          role: 'button',
          'aria-expanded': showFilters,
        },
          h('span', null, '筛选'),
          h('span', {
            className: `rh-filter-arrow${showFilters ? ' expanded' : ''}`,
          }, '▾')
        ),
        showFilters && h('div', { className: 'rh-filter-content' },
          // Extension filter
          h('div', { className: 'rh-filter-group' },
            h('label', { className: 'rh-filter-label' }, '类型:'),
            h('select', {
              className: 'rh-filter-select',
              value: filterExt,
              onChange: (e) => setFilterExt(e.target.value),
            },
              h('option', { value: 'all' }, '全部'),
              h('option', { value: '.md' }, 'Markdown'),
              h('option', { value: '.html' }, 'HTML'),
              h('option', { value: '.txt' }, '文本')
            )
          ),
          // Document type filter
          h('div', { className: 'rh-filter-group' },
            h('label', { className: 'rh-filter-label' }, '文档:'),
            h('select', {
              className: 'rh-filter-select',
              value: filterType,
              onChange: (e) => setFilterType(e.target.value),
            },
              h('option', { value: 'all' }, '全部'),
              h('option', { value: 'requirement' }, '需求'),
              h('option', { value: 'design' }, '技术方案'),
              h('option', { value: 'cr' }, 'CR'),
              h('option', { value: 'other' }, '其他')
            )
          ),
          // Sort buttons
          h('div', { className: 'rh-filter-group' },
            h('label', { className: 'rh-filter-label' }, '排序:'),
            h('div', { className: 'rh-sort-buttons' },
              h('button', {
                className: `rh-sort-btn${sortBy === 'none' ? ' active' : ''}`,
                onClick: () => setSortBy('none'),
                title: '不排序',
              }, '—'),
              h('button', {
                className: `rh-sort-btn${sortBy === 'mtime-asc' ? ' active' : ''}`,
                onClick: () => setSortBy('mtime-asc'),
                title: '编辑时间升序',
              }, '↑'),
              h('button', {
                className: `rh-sort-btn${sortBy === 'mtime-desc' ? ' active' : ''}`,
                onClick: () => setSortBy('mtime-desc'),
                title: '编辑时间降序',
              }, '↓')
            )
          )
        )
      ),

      // File list
      loading
        ? h('div', { className: 'rh-empty', style: { minHeight: 80 } }, '加载中...')
        : !selectedReq
          ? h('div', { className: 'rh-empty', style: { minHeight: 80 } }, '请先选择需求目录')
          : filteredFiles.length === 0
            ? h('div', { className: 'rh-empty', style: { minHeight: 80 } }, '无匹配文档')
            : h('div', { className: 'rh-file-tree-list' },
                filteredFiles.map((file, idx) => {
                  const isActive = activeFile?.name === file.name;
                  const docType = file.type || 'other';
                  return h('div', {
                    key: `${file.name}-${idx}`,
                    className: `rh-file-tree-item${isActive ? ' active' : ''}`,
                    onClick: () => handleFileClick(file),
                    role: 'button',
                    'aria-label': file.name,
                  },
                    getDocIcon(docType, 14),
                    h('div', { style: { flex: 1, overflow: 'hidden', minWidth: 0 } },
                      h('div', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, file.name),
                      file.mtime && h('div', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)', marginTop: 2 } }, formatTime(file.mtime))
                    ),
                    h('span', {
                      className: 'rh-doctype-tag',
                      style: { flexShrink: 0 },
                    }, docTypeLabels[docType] || '文档')
                  );
                })
              )
    )
  );
}

module.exports = { FileTreeSidebar };
