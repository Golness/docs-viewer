'use strict';

const React = require('react');
const h = React.createElement;
const { useState } = React;
const { useSearch } = require('../hooks/useSearch.js');

// ─── SearchBar (3.1, 3.2) ───────────────────────────────────────
function SearchBar({ onSearch, searchType, onTypeChange, searchMode, onModeChange, loading }) {
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    if (onSearch && query.trim()) onSearch(query);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const types = [
    { id: 'all', label: '全部' },
    { id: 'feature', label: '功能点' },
    { id: 'field', label: '字段' },
    { id: 'tag', label: '标签' },
  ];

  return h('div', { className: 'dv-search-bar' },
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 6 } },
      h('input', {
        className: 'dv-search-input',
        type: 'text',
        placeholder: searchMode === 'ai' ? 'AI 智能搜索：输入自然语言描述...' : '搜索功能点、字段、标签...',
        value: query,
        onChange: e => setQuery(e.target.value),
        onKeyDown: handleKeyDown,
        disabled: loading,
        style: { flex: 1, marginBottom: 0 },
      }),
      h('button', {
        className: 'dv-btn dv-btn-primary',
        onClick: handleSearch,
        disabled: loading || !query.trim(),
        style: {
          padding: '7px 16px',
          whiteSpace: 'nowrap',
        }
      }, loading ? '搜索中...' : '🔍 搜索')
    ),
    // 3.14: Search mode toggle (segmented control)
    searchMode !== undefined && onModeChange && h('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
      h('div', {
        style: {
          display: 'flex',
          gap: 4,
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: 6,
          padding: 2,
          background: 'var(--dsw-alias-bg-layer-2)'
        }
      },
        h('button', {
          className: 'dv-btn',
          onClick: () => onModeChange('exact'),
          style: {
            padding: '4px 12px',
            fontSize: 11,
            margin: 0,
            border: 'none',
            background: searchMode === 'exact' ? 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)' : 'transparent',
            color: searchMode === 'exact' ? 'var(--dsw-alias-label-primary-foreground)' : 'var(--dsw-alias-label-secondary)',
          }
        }, '精确搜索'),
        h('button', {
          className: 'dv-btn',
          onClick: () => onModeChange('ai'),
          style: {
            padding: '4px 12px',
            fontSize: 11,
            margin: 0,
            border: 'none',
            background: searchMode === 'ai' ? 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)' : 'transparent',
            color: searchMode === 'ai' ? 'var(--dsw-alias-label-primary-foreground)' : 'var(--dsw-alias-label-secondary)',
          }
        }, 'AI 智能搜索')
      )
    ),
    h('div', { className: 'dv-search-tags' },
      types.map(t =>
        h('button', {
          key: t.id,
          className: `dv-search-tag${searchType === t.id ? ' active' : ''}`,
          onClick: () => onTypeChange && onTypeChange(t.id),
        }, t.label)
      )
    )
  );
}

// ─── FieldAssociationsPanel (3.6, 3.16) ───────────────────────────
function FieldAssociationsPanel({ field, associations, onSelectReq }) {
  if (!associations || associations.length === 0) return null;

  return h('div', {
    style: {
      margin: '8px 14px',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 8,
      overflow: 'hidden',
    }
  },
    h('div', {
      style: {
        padding: '8px 12px',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: 12,
        fontWeight: 700,
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)',
      }
    }, `📊 ${field} — 跨需求关联`),
    associations.map((assoc, idx) =>
      h('div', {
        key: assoc.id,
        style: {
          padding: '8px 12px',
          fontSize: 12,
          borderBottom: idx < associations.length - 1 ? '1px solid var(--dsw-alias-border-l1)' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
        },
        onClick: () => onSelectReq && onSelectReq(assoc),
      },
        h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, flexShrink: 0 } }, assoc.date),
        h('strong', null, assoc.title),
        h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, `— ${assoc.changeDescription}`)
      )
    )
  );
}

// ─── SearchResults (3.3, 3.9-3.11, 3.13) ────────────────────────
function SearchResults({ results, onSelectReq, searchMode }) {
  if (!results || results.length === 0) {
    return h('div', { className: 'dv-empty', style: { padding: 20 } },
      h('span', { className: 'dv-empty-icon' }, '🔍'),
      '未找到匹配的需求'
    );
  }

  return h('div', null,
    // 3.12: AI search header
    searchMode === 'ai' && h('div', {
      style: {
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)',
        borderBottom: '1px solid var(--dsw-alias-border-l1)'
      }
    }, '🤖 AI 搜索结果 ', h('span', { style: { fontWeight: 400, color: 'var(--dsw-alias-label-secondary)' } }, '（语义匹配）')),
    results.map(r =>
      h('div', {
        key: r.id,
        className: 'dv-result-card',
        onClick: () => onSelectReq && onSelectReq(r),
      },
        h('div', { className: 'dv-result-card-head' },
          h('span', { className: 'dv-result-title' }, r.title),
          // 3.11: Scale badge
          r.type && r.type !== 'unknown' && h('span', {
            className: `dv-badge dv-scale-${r.type}`
          }, r.type === 'large' ? '大需求' : r.type === 'small' ? '小需求' : '中需求'),
          // 3.13: AI relevance badge
          searchMode === 'ai' && r.relevance !== undefined && h('span', {
            style: {
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 600,
              background: 'var(--dsw-alias-state-info-bg)',
              color: 'var(--dsw-alias-state-info-primary)',
            }
          }, `语义匹配 ${r.relevance}%`),
          h('span', { className: 'dv-result-meta' }, `${r.date} · ${r.developer}`)
        ),
        // 3.10: Summary
        r.summary && h('div', { className: 'dv-result-summary' }, r.summary),
        // Tags
        (r.matchedFeatures?.length > 0 || r.matchedFields?.length > 0 || r.matchedTags?.length > 0) &&
          h('div', { className: 'dv-result-tags' },
            r.matchedFeatures?.map(f => h('span', { key: f, className: 'dv-result-tag' }, `🔹 ${f}`)),
            r.matchedFields?.map(f => h('span', { key: f, className: 'dv-result-tag' }, `📊 ${f}`)),
            r.matchedTags?.map(t => h('span', { key: t, className: 'dv-result-tag' }, `🏷️ ${t}`))
          ),
        // 3.13: AI match reason
        searchMode === 'ai' && r.reason && h('div', {
          style: {
            fontSize: 11,
            color: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)',
            marginTop: 6,
            padding: '6px 10px',
            background: 'var(--dsw-alias-state-info-bg)',
            borderRadius: 4,
          }
        }, '💡 AI 分析：', r.reason)
      )
    )
  );
}

// ─── SearchPanel (3.1-3.5, 3.7, 3.9-3.11, 3.15) ────────────────
function SearchPanel({ workspaceId, onSelectReq }) {
  const [searchType, setSearchType] = useState('all');
  const {
    searchMode, setSearchMode, results, loading, error: searchError,
    aiProgress, aiStreamContent, indexBuilt, searched, fieldAssociations,
    handleSearch
  } = useSearch(workspaceId);

  const handleSelectReq = (r) => {
    if (onSelectReq) {
      onSelectReq({
        id: r.id,
        date: r.date,
        title: r.title,
        developer: r.developer,
        path: `${r.developer}/${r.id}`,
        fileCount: 0,
        hasMeta: !!r.meta,
        meta: r.meta,
      });
    }
  };

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    h(SearchBar, {
      onSearch: handleSearch,
      searchType,
      onTypeChange: setSearchType,
      searchMode,
      onModeChange: setSearchMode,
      loading,
    }),
    // Only show index warning for exact search, not AI search
    !indexBuilt && searched && searchMode === 'exact' && h('div', {
      style: {
        padding: '8px 14px', fontSize: 12, color: 'var(--dsw-alias-state-warning-primary)',
        background: 'var(--dsw-alias-state-warning-bg)', borderBottom: '1px solid var(--dsw-alias-border-l1)',
      }
    }, '⚠️ 索引未构建，请先点击「🔨 索引」按钮重建索引'),
    // Show error message if search failed
    searchError && searched && !loading && h('div', {
      style: {
        padding: '8px 14px', fontSize: 12, color: 'var(--dsw-alias-state-error-primary)',
        background: 'var(--dsw-alias-state-error-bg)', borderBottom: '1px solid var(--dsw-alias-border-l1)',
      }
    }, '❌ ', searchError),
    searched && !loading && !searchError && h('div', { className: 'dv-search-count' },
      `找到 `, h('strong', null, results.length), ` 个需求`
    ),
    // Field associations panel (3.6, 3.16)
    fieldAssociations && h(FieldAssociationsPanel, {
      field: fieldAssociations.field,
      associations: fieldAssociations.associations,
      onSelectReq: handleSelectReq,
    }),
    h('div', { style: { flex: 1, overflowY: 'auto' } },
      loading
        ? h('div', { style: { padding: 20 } },
            // Status text
            aiProgress && h('div', {
              style: {
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--dsw-alias-brand-primary)',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }
            },
              h('div', { className: 'dv-spinner', style: { width: 14, height: 14, margin: 0 } }),
              aiProgress
            ),
            // Streaming content preview
            aiStreamContent && h('div', {
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
              }
            }, aiStreamContent)
          )
        : searched
          ? h(SearchResults, { results, onSelectReq: handleSelectReq, searchMode })
          : h('div', { className: 'dv-empty', style: { padding: 20 } },
              h('span', { className: 'dv-empty-icon' }, '🔍'),
              '输入关键词搜索需求'
            )
    )
  );
}

module.exports = { SearchPanel };
