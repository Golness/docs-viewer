window.__ModuleLoader__.load({
  id: '@local/docs-viewer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useLayoutEffect, useRef, useCallback } = React;

    const ROUTE = '/docs-viewer';
    const TAB_KIND = 'docs-viewer';
    const TAB_ID = '@local/docs-viewer';

    // Script IDs
    const MARKED_SCRIPT_ID = 'docs-viewer-marked';
    const MERMAID_SCRIPT_ID = 'docs-viewer-mermaid';
    const HIGHLIGHT_SCRIPT_ID = 'docs-viewer-highlight';

    // ─── React Context for cross-component communication ─────────────
    const DocsViewerContext = React.createContext({
      refreshTree: () => {},
      refreshSelectedReq: () => {},
    });

    // ─── Script loading hook ─────────────────────────────────────────
    function useScript(src, id, globalName) {
      const [loaded, setLoaded] = useState(false);
      const [error, setError] = useState(false);

      useEffect(() => {
        if (window[globalName]) { setLoaded(true); return; }
        let script = document.getElementById(id);
        if (script) {
          const checkInterval = setInterval(() => {
            if (window[globalName]) { clearInterval(checkInterval); setLoaded(true); }
          }, 100);
          const timeout = setTimeout(() => { clearInterval(checkInterval); setError(true); }, 5000);
          return () => { clearInterval(checkInterval); clearTimeout(timeout); };
        }
        script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onload = () => setLoaded(true);
        script.onerror = () => setError(true);
        document.head.appendChild(script);
      }, [src, id, globalName]);

      return { loaded, error };
    }

    function getMermaidTheme() {
      const isDarkMode = document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      return isDarkMode ? 'dark' : 'default';
    }

    function sanitizeHtml(html) {
      let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '');
      clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"vbscript:[^"]*"|'vbscript:[^']*'|vbscript:[^\s>]+)/gi, '');
      clean = clean.replace(/\ssrc\s*=\s*(?:"data:[^"]*"|'data:[^']*'|data:[^\s>]+)/gi, '');
      return clean;
    }

    // ─── Styles ──────────────────────────────────────────────────────
    const STYLE_ID = 'docs-viewer-styles';

    if (!document.getElementById(STYLE_ID)) {
      const el = document.createElement('style');
      el.id = STYLE_ID;
      el.textContent = `
        /* ── Markdown rendering ── */
        .dv-markdown { line-height: 1.6; color: var(--dsw-alias-label-primary); }
        .dv-markdown h1, .dv-markdown h2, .dv-markdown h3,
        .dv-markdown h4, .dv-markdown h5, .dv-markdown h6 {
          margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600;
          color: var(--dsw-alias-label-primary);
        }
        .dv-markdown h1 { font-size: 1.8em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 0.3em; }
        .dv-markdown h2 { font-size: 1.5em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 0.3em; }
        .dv-markdown h3 { font-size: 1.25em; }
        .dv-markdown h4 { font-size: 1.1em; }
        .dv-markdown p { margin: 0.8em 0; }
        .dv-markdown ul, .dv-markdown ol { margin: 0.8em 0; padding-left: 2em; }
        .dv-markdown li { margin: 0.3em 0; }
        .dv-markdown code {
          background: var(--dsw-alias-bg-layer-2); padding: 0.2em 0.4em; border-radius: 3px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
        }
        .dv-markdown pre {
          background: var(--dsw-alias-bg-layer-2); padding: 1em; border-radius: 6px;
          overflow-x: auto; margin: 1em 0;
        }
        .dv-markdown pre code { background: transparent; padding: 0; }
        .dv-markdown blockquote {
          margin: 1em 0; padding: 0.5em 1em;
          border-left: 4px solid var(--dsw-alias-brand-primary);
          background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
        }
        .dv-markdown a { color: var(--dsw-alias-brand-primary); text-decoration: none; }
        .dv-markdown a:hover { text-decoration: underline; }
        .dv-markdown table { border-collapse: collapse; margin: 1em 0; width: 100%; }
        .dv-markdown th, .dv-markdown td { border: 1px solid var(--dsw-alias-border-l1); padding: 0.5em; text-align: left; }
        .dv-markdown th { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }
        .dv-markdown img { max-width: 100%; height: auto; }
        .dv-markdown hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 2em 0; }
        .dv-markdown .mermaid-diagram { margin: 1.5em 0; text-align: center; overflow-x: auto; }
        .dv-markdown .mermaid-diagram svg { max-width: 100%; height: auto; }
        .dv-markdown code.language-mermaid {
          display: block; background: var(--dsw-alias-bg-layer-2); padding: 1em; border-radius: 6px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em;
          white-space: pre; overflow-x: auto;
        }

        /* ── Trigger button ── */
        .dv-trigger {
          display: flex; align-items: center; gap: 8px;
          width: 100%; height: 42px; margin: 0;
          padding: 0 10px 0 8px; box-sizing: border-box;
          border: none; border-radius: var(--dsw-radius-md);
          background: transparent; cursor: pointer; overflow: hidden;
          color: var(--dsw-alias-label-primary);
          font-family: inherit; font-size: 14px; line-height: 22px;
          transition: background 0.15s;
        }
        .dv-trigger:hover { background: var(--dsw-alias-bg-layer-2); }
        .dv-trigger-icon { font-size: 16px; flex-shrink: 0; line-height: 1; }
        .dv-trigger-label { overflow: hidden; white-space: nowrap; }
        .dv-trigger-rail { flex: none; width: 36px; height: 36px; justify-content: center; gap: 0; padding: 0; margin: 0; }

        /* ── Tooltip ── */
        .dv-tooltip {
          min-width: 180px; max-width: 280px; overflow-y: auto; padding: 8px 0;
          background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          font-size: 13px; color: var(--dsw-alias-label-primary);
        }
        .dv-tooltip-title { padding: 0 12px 6px; font-size: 11px; font-weight: 600;
          color: var(--dsw-alias-label-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
        .dv-tooltip-row { display: flex; justify-content: space-between; align-items: center;
          padding: 4px 12px; gap: 12px; }
        .dv-tooltip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .dv-tooltip-counts { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; flex-shrink: 0; }

        /* ── Top bar ── */
        .dv-topbar {
          display: flex; align-items: center;
          padding: 0 16px; height: 40px; flex-shrink: 0;
          background: var(--dsw-alias-bg-layer-1);
          border-bottom: 1px solid var(--dsw-alias-border-l1);
          font-size: 12px;
        }
        .dv-topbar-left {
          display: flex; align-items: center; gap: 12px;
        }
        .dv-topbar-label {
          color: var(--dsw-alias-label-secondary);
          font-size: 11px;
          font-weight: 500;
        }
        .dv-topbar-value {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: var(--dsw-alias-label-primary);
          font-size: 11px;
          padding: 4px 10px;
          background: var(--dsw-alias-bg-layer-2);
          border-radius: 4px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s;
        }
        .dv-topbar-value:hover {
          background: var(--dsw-alias-bg-layer-3);
          border-color: var(--dsw-alias-border-l2);
        }
        .dv-topbar-value.selected {
          background: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
          color: var(--dsw-alias-label-primary-foreground);
          border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
          font-weight: 600;
        }
        .dv-topbar-value.selected:hover {
          opacity: 0.9;
        }
        .dv-topbar-value.unselected {
          background: var(--dsw-alias-state-warn-tertiary);
          color: var(--dsw-alias-state-warn-label);
          border-color: var(--dsw-alias-state-warn-primary);
          font-style: italic;
          font-weight: 600;
        }
        .dv-topbar-value.unselected:hover {
          background: var(--dsw-alias-state-warn-secondary);
        }
        .dv-topbar-edit {
          padding: 2px 6px;
          color: var(--dsw-alias-label-secondary);
          cursor: pointer;
          font-size: 11px;
          opacity: 0.6;
          transition: opacity 0.15s;
        }
        .dv-topbar-edit:hover { opacity: 1; }
        .dv-topbar-input {
          padding: 4px 10px;
          border: 1px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color);
          border-radius: 4px;
          font-size: 11px;
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-primary);
          outline: none;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          width: 200px;
        }

        /* ── Directory modal ── */
        .dv-modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
          z-index: 1000;
        }
        .dv-modal {
          background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 8px; padding: 16px; min-width: 320px; max-width: 500px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        .dv-modal-title {
          font-size: 14px; font-weight: 700; color: var(--dsw-alias-brand-primary);
          margin-bottom: 12px;
        }
        .dv-modal-list {
          max-height: 300px; overflow-y: auto; margin-bottom: 12px;
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
        }
        .dv-modal-item {
          padding: 8px 12px; cursor: pointer; font-size: 12px;
          display: flex; align-items: center; gap: 8px;
          border-bottom: 1px solid var(--dsw-alias-border-l1);
        }
        .dv-modal-item:last-child { border-bottom: none; }
        .dv-modal-item:hover { background: var(--dsw-alias-bg-layer-2); }
        .dv-modal-item.selected { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color); color: #fff; font-weight: 600; }
        .dv-modal-item-icon { font-size: 14px; }
        .dv-modal-item-name { flex: 1; }
        .dv-modal-item-count { color: var(--dsw-alias-label-secondary); font-size: 11px; }
        .dv-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }

        /* ── Three-zone layout ── */
        .dv-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--dsw-alias-bg-base); }
        .dv-three-zone { display: flex; flex: 1; overflow: hidden; }

        /* ── Resize handle ── */
        .dv-resize-handle {
          width: 4px; cursor: col-resize;
          background: var(--dsw-alias-border-l1);
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .dv-resize-handle:hover, .dv-resize-handle.dragging {
          background: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
        }

        /* ── Rail toolbar ── */
        .dv-rail {
          display: flex; flex-direction: column; align-items: center;
          padding: 8px 0; gap: 2px;
          border-right: 1px solid var(--dsw-alias-border-l1);
          background: var(--dsw-alias-bg-layer-1);
          overflow-y: auto;
        }
        .dv-rail-btn {
          width: 52px; height: 52px; border: none; border-radius: 8px;
          background: transparent; color: var(--dsw-alias-label-secondary);
          font-size: 18px; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 2px; transition: all 0.12s;
        }
        .dv-rail-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
        .dv-rail-btn.active { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color); color: var(--dsw-alias-label-primary-foreground); }
        .dv-rail-btn.expanded { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-brand-primary); }
        .dv-rail-label { font-size: 8px; font-weight: 600; letter-spacing: 0.02em; line-height: 1; }
        .dv-rail-arrow { font-size: 8px; margin-left: 2px; opacity: 0.6; }
        .dv-rail-sep { width: 36px; height: 1px; background: var(--dsw-alias-border-l1); margin: 4px 0; }
        .dv-rail-bottom { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-bottom: 4px; }
        
        /* ── Rail group (workbench/templates) ── */
        .dv-rail-group {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
        }
        .dv-rail-sub {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 4px 0;
          background: var(--dsw-alias-bg-layer-2);
          border-radius: 6px;
          margin: 2px 0;
        }
        .dv-rail-sub-btn {
          width: 48px; height: 40px; border: none; border-radius: 6px;
          background: transparent; color: var(--dsw-alias-label-secondary);
          font-size: 14px; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 2px; transition: all 0.12s;
        }
        .dv-rail-sub-btn:hover { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
        .dv-rail-sub-btn.active { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color); color: var(--dsw-alias-label-primary-foreground); }

        /* ── Doc tree panel ── */
        .dv-doc-panel { display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--dsw-alias-border-l1); }
        .dv-doc-panel-header {
          padding: 10px 14px; font-size: 12px; font-weight: 700;
          color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1);
          border-bottom: 1px solid var(--dsw-alias-border-l1); letter-spacing: 0.04em;
        }
        .dv-doc-tree { flex: 1; overflow-y: auto; padding: 8px 0; font-size: 12px; }
        .dv-doc-tree::-webkit-scrollbar { width: 4px; }
        .dv-doc-tree::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 4px; }

        .dv-dev-node { user-select: none; }
        .dv-dev-header {
          padding: 6px 12px; font-weight: 600; font-size: 12px;
          color: var(--dsw-alias-label-secondary); cursor: pointer;
          display: flex; align-items: center; gap: 6px;
        }
        .dv-dev-header:hover { background: var(--dsw-alias-bg-layer-2); }
        .dv-dev-count { color: var(--dsw-alias-label-secondary); font-weight: 400; font-size: 11px; }

        .dv-req-node { user-select: none; }
        .dv-req-header {
          padding: 5px 12px 5px 28px; font-size: 12px;
          color: var(--dsw-alias-label-primary); cursor: pointer;
          display: flex; align-items: center; gap: 6px;
          border-left: 3px solid transparent;
        }
        .dv-req-header:hover { background: var(--dsw-alias-bg-layer-2); }
        .dv-req-header.selected { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color); border-left-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); color: var(--dsw-alias-label-primary-foreground); font-weight: 600; }

        .dv-file-item {
          padding: 3px 12px 3px 44px; font-size: 11px;
          color: var(--dsw-alias-label-secondary); cursor: pointer;
          display: flex; align-items: center; gap: 4px;
        }
        .dv-file-item:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
        .dv-file-item.active { color: var(--dsw-alias-brand-primary); font-weight: 600; }
        .dv-meta-item { padding: 3px 12px 3px 44px; font-size: 11px; color: var(--dsw-alias-label-secondary); font-style: italic; }
        .dv-empty-hint { padding: 3px 12px 3px 44px; font-size: 11px; color: var(--dsw-alias-label-secondary); }

        /* ── Analysis status tags ── */
        .dv-analysis-list { margin: 12px 0; }
        .dv-analysis-item {
          padding: 8px 12px;
          margin: 4px 0;
          background: var(--dsw-alias-bg-layer-1);
          border-radius: 6px;
          border: 1px solid var(--dsw-alias-border-l1);
        }
        .dv-analysis-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .dv-analysis-item-name {
          font-size: 12px;
          font-weight: 500;
          color: var(--dsw-alias-label-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dv-analysis-item-path {
          font-size: 10px;
          color: var(--dsw-alias-label-secondary);
          margin-top: 2px;
        }
        .dv-analysis-item-error {
          font-size: 11px;
          color: var(--dsw-alias-state-error-primary);
          margin-top: 4px;
        }
        .dv-status-tag {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .dv-status-tag.pending { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); }
        .dv-status-tag.analyzing { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); }
        .dv-status-tag.completed { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
        .dv-status-tag.failed { background: var(--dsw-alias-state-error-secondary); color: var(--dsw-alias-state-error-primary); }
        .dv-status-tag.cancelled { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); opacity: 0.6; }

        /* ── Preview area ── */
        .dv-preview-area { display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); }
        .dv-breadcrumb {
          padding: 8px 14px; font-size: 11px;
          color: var(--dsw-alias-label-secondary);
          background: var(--dsw-alias-bg-layer-1);
          border-bottom: 1px solid var(--dsw-alias-border-l1);
          flex-shrink: 0;
        }
        .dv-preview-body { flex: 1; overflow: auto; padding: 16px; background: var(--dsw-alias-bg-base); }
        .dv-preview-body::-webkit-scrollbar { width: 6px; }
        .dv-preview-body::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 4px; }
        .dv-preview-iframe { width: 100%; height: 100%; border: none; background: var(--dsw-alias-bg-base); border-radius: 6px; }

        /* ── Right panel (trace / operations) ── */
        .dv-right-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); }
        .dv-right-header {
          padding: 10px 14px; font-size: 12px; font-weight: 700;
          color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1);
          border-bottom: 1px solid var(--dsw-alias-border-l1);
          display: flex; align-items: center; justify-content: space-between;
          letter-spacing: 0.04em;
        }
        .dv-right-close { font-size: 11px; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 2px 8px; border-radius: 4px; }
        .dv-right-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
        .dv-right-body { flex: 1; overflow-y: auto; background: var(--dsw-alias-bg-base); }
        .dv-right-body::-webkit-scrollbar { width: 4px; }
        .dv-right-body::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 4px; }

        /* ── Operation panel ── */
        .dv-op-panel { padding: 16px; }
        .dv-op-title { font-size: 13px; font-weight: 700; color: var(--dsw-alias-brand-primary); margin-bottom: 12px; }
        .dv-op-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 12px; }
        .dv-op-info {
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
          padding: 10px; margin-bottom: 12px; background: var(--dsw-alias-bg-layer-2);
          font-size: 12px;
        }
        .dv-op-info code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-brand-primary); }

        /* ── Forms ── */
        .dv-form-group { display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: center; margin-bottom: 8px; }
        .dv-form-label { font-size: 12px; font-weight: 600; }
        .dv-form-input {
          width: 100%; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 5px; font-size: 12px; background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-primary); outline: none;
        }
        .dv-form-input:focus { border-color: var(--dsw-alias-brand-primary); }
        .dv-form-select {
          width: 100%; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 5px; font-size: 12px; background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-primary); outline: none; cursor: pointer;
        }
        .dv-form-select:focus { border-color: var(--dsw-alias-brand-primary); }
        .dv-form-select option {
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-primary);
        }
        .dv-path-preview {
          padding: 8px 12px; background: var(--dsw-alias-bg-layer-2);
          border-radius: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary);
          margin-bottom: 12px;
        }
        .dv-path-preview code { color: var(--dsw-alias-brand-primary); }

        /* ── Buttons ── */
        .dv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;
          border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
          color: var(--dsw-alias-label-primary); cursor: pointer;
        }
        .dv-btn:hover { background: var(--dsw-alias-bg-layer-2); }
        .dv-btn-primary { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color); color: var(--dsw-alias-label-primary-foreground); border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
        .dv-btn-primary:hover { opacity: 0.9; }
        .dv-btn-stack { display: flex; flex-direction: column; gap: 6px; }
        .dv-btn-row { display: flex; gap: 8px; }

        /* ── Template preview ── */
        .dv-template-preview {
          margin: 12px 0; padding: 12px; border-radius: 6px;
          background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px; line-height: 1.6; white-space: pre-wrap;
          max-height: 300px; overflow-y: auto; color: var(--dsw-alias-label-primary);
        }

        /* ── Status bar ── */
        .dv-statusbar {
          padding: 6px 14px; font-size: 11px; color: var(--dsw-alias-label-secondary);
          border-top: 1px solid var(--dsw-alias-border-l1);
          background: var(--dsw-alias-bg-layer-1);
          display: flex; justify-content: space-between; flex-shrink: 0;
        }

        /* ── Empty / loading / error ── */
        .dv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 100%; min-height: 160px; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
        .dv-empty-icon { font-size: 32px; opacity: 0.4; margin-bottom: 4px; }
        .dv-loading { display: flex; align-items: center; justify-content: center; height: 160px; color: var(--dsw-alias-label-secondary); }
        .dv-spinner { width: 18px; height: 18px; border: 2px solid var(--dsw-alias-border-l1);
          border-top-color: var(--dsw-alias-brand-primary); border-radius: 50%;
          animation: dv-spin 0.6s linear infinite; margin-right: 8px; }
        @keyframes dv-spin { to { transform: rotate(360deg) } }
        .dv-error { color: var(--dsw-alias-state-error-primary); }

        /* ── Badge ── */
        .dv-badge { display: inline-flex; align-items: center; gap: 3px;
          padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600; }
        .dv-badge-md { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-brand-primary); }
        .dv-badge-html { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-state-success-primary); }
        .dv-badge-success { background: var(--dsw-alias-state-success-bg); color: var(--dsw-alias-state-success-primary); }
        .dv-badge-warn { background: var(--dsw-alias-state-warning-bg); color: var(--dsw-alias-state-warning-primary); }
        .dv-badge-neutral { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }

        /* ── Doc type tags ── */
        .dv-doctype-tag {
          display: inline-flex; align-items: center; gap: 3px;
          padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;
          margin-left: 6px; vertical-align: middle;
        }
        .dv-doctype-tag.requirement { background: var(--dsw-alias-state-info-bg); color: var(--dsw-alias-state-info-primary); }
        .dv-doctype-tag.design { background: var(--dsw-alias-state-success-bg); color: var(--dsw-alias-state-success-primary); }
        .dv-doctype-tag.cr { background: var(--dsw-alias-state-warning-bg); color: var(--dsw-alias-state-warning-primary); }
        .dv-doctype-tag.other { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }

        /* ── Search ── */
        .dv-search-bar { padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
        .dv-search-input {
          width: 100%; padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 6px; font-size: 12px; background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-primary); outline: none; margin-bottom: 6px;
        }
        .dv-search-input:focus { border-color: var(--dsw-alias-brand-primary); }
        .dv-search-tags { display: flex; gap: 4px; flex-wrap: wrap; }
        .dv-search-tag {
          padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;
          border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
          color: var(--dsw-alias-label-secondary); cursor: pointer;
        }
        .dv-search-tag.active { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color); color: var(--dsw-alias-label-primary-foreground); border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
        .dv-search-count { padding: 6px 14px; font-size: 11px; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); }

        /* ── Search result card ── */
        .dv-result-card {
          margin: 8px 14px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 8px; background: var(--dsw-alias-bg-layer-1); cursor: pointer;
          transition: border-color 0.12s;
        }
        .dv-result-card:hover { border-color: var(--dsw-alias-brand-primary); }
        .dv-result-card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
        .dv-result-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
        .dv-result-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); }
        .dv-result-summary { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 4px 0; line-height: 1.5; }
        .dv-result-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
        .dv-result-tag { padding: 1px 6px; border-radius: 8px; font-size: 10px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
        .dv-scale-large { background: var(--dsw-alias-state-warning-bg); color: var(--dsw-alias-state-warning-primary); }
        .dv-scale-small { background: var(--dsw-alias-state-success-bg); color: var(--dsw-alias-state-success-primary); }
        .dv-scale-medium { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-brand-primary); }

        /* ── Timeline ── */
        .dv-timeline { padding: 12px 14px; }
        .dv-tl-item { display: flex; gap: 10px; padding: 6px 0; position: relative; }
        .dv-tl-item:not(:last-child):before {
          content: ''; position: absolute; left: 11px; top: 28px; bottom: -6px;
          width: 2px; background: var(--dsw-alias-border-l1);
        }
        .dv-tl-dot {
          width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 12px; flex-shrink: 0;
          background: var(--dsw-alias-bg-layer-2); border: 2px solid var(--dsw-alias-border-l1);
        }
        .dv-tl-dot.requirement { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-brand-primary-bg); }
        .dv-tl-dot.design { border-color: var(--dsw-alias-state-info-primary); background: var(--dsw-alias-state-info-bg); }
        .dv-tl-dot.cr { border-color: var(--dsw-alias-state-warning-primary); background: var(--dsw-alias-state-warning-bg); }
        .dv-tl-dot.release { border-color: var(--dsw-alias-state-success-primary); background: var(--dsw-alias-state-success-bg); }
        .dv-tl-content { flex: 1; min-width: 0; }
        .dv-tl-date { font-size: 10px; color: var(--dsw-alias-label-secondary); font-weight: 600; }
        .dv-tl-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
        .dv-tl-desc { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }

        /* ── Analyze / Index panels ── */
        .dv-req-card {
          border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
          padding: 10px 12px; margin-bottom: 12px; background: var(--dsw-alias-bg-layer-1);
        }
        .dv-req-card-title { font-size: 13px; font-weight: 700; color: var(--dsw-alias-label-primary); margin-bottom: 6px; }
        .dv-req-card-row { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 2px 0; }
        .dv-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
        .dv-stats-cell { font-size: 12px; color: var(--dsw-alias-label-secondary); }
        .dv-stats-cell strong { color: var(--dsw-alias-label-primary); }
        .dv-log-area {
          margin-top: 12px; padding: 8px 10px; border-top: 1px solid var(--dsw-alias-border-l1);
          font-size: 11px; max-height: 200px; overflow-y: auto; font-family: ui-monospace, monospace;
        }
        .dv-log-entry { padding: 2px 0; line-height: 1.4; }
        .dv-log-entry .log-time { color: var(--dsw-alias-label-secondary); margin-right: 6px; }
        .dv-log-entry.log-success { color: var(--dsw-alias-state-success-primary); }
        .dv-log-entry.log-info { color: var(--dsw-alias-state-info-primary); }
        .dv-log-entry.log-warning { color: var(--dsw-alias-state-warning-primary); }
        .dv-log-entry.log-error { color: var(--dsw-alias-state-error-primary); }

        /* ── Log Panel (4.9, 4.26) ── */
        .dv-op-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--dsw-alias-border-l1);
        }
        .dv-op-header span:first-child {
          font-size: 13px;
          font-weight: 700;
          color: var(--dsw-alias-brand-primary);
        }
        .dv-log-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 500px;
          overflow-y: auto;
        }
        .dv-log-item {
          padding: 8px 12px;
          background: var(--dsw-alias-bg-layer-2);
          border-radius: 6px;
          font-size: 12px;
        }
        .dv-log-item-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .dv-log-icon {
          font-size: 14px;
        }
        .dv-log-time {
          font-size: 11px;
          font-weight: 600;
        }
        .dv-log-type {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--dsw-alias-bg-layer-3);
          color: var(--dsw-alias-label-secondary);
          text-transform: uppercase;
        }
        .dv-log-message {
          color: var(--dsw-alias-label-primary);
          line-height: 1.5;
          word-break: break-word;
        }

        /* ── Settings Panel (4.10) ── */
        .dv-form-textarea {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 5px;
          font-size: 12px;
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-primary);
          outline: none;
          resize: vertical;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .dv-form-textarea:focus {
          border-color: var(--dsw-alias-brand-primary);
        }
        .dv-op-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--dsw-alias-border-l1);
        }
        .dv-btn-secondary {
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-primary);
          border: 1px solid var(--dsw-alias-border-l1);
        }
        .dv-btn-secondary:hover {
          background: var(--dsw-alias-bg-layer-3);
        }

        /* ── Alert messages ── */
        .dv-alert {
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 12px;
          border: 1px solid;
        }
        .dv-alert-success {
          background: var(--dsw-alias-state-success-bg);
          color: var(--dsw-alias-state-success-primary);
          border-color: var(--dsw-alias-state-success-primary);
        }
        .dv-alert-error {
          background: var(--dsw-alias-state-error-bg);
          color: var(--dsw-alias-state-error-primary);
          border-color: var(--dsw-alias-state-error-primary);
        }
      `;
      document.head.appendChild(el);
    }

    // ─── Helpers ─────────────────────────────────────────────────────
    function getDocIcon(type) {
      const icons = { requirement: '📋', design: '📐', cr: '🔍', other: '📄' };
      return icons[type] || '📄';
    }

    function Spinner() {
      return h('div', { className: 'dv-loading' }, h('div', { className: 'dv-spinner' }), 'Loading\u2026');
    }

    // ─── FilePreview (Markdown + Mermaid + breadcrumb) ───────────────
    // Covers: 2.4, 2.5, 2.12, 2.13
    function FilePreview({ workspaceId, relPath, name, requirement, onBack }) {
      const [text, setText] = useState('');
      const [error, setError] = useState(null);
      const [rendered, setRendered] = useState('');
      const markdownRef = useRef(null);
      const mermaidInitRef = useRef(false);
      const mermaidRenderIdRef = useRef(0);
      const isHtml = /\.html?$/i.test(name);
      const isMd = /\.md$/i.test(name);

      const { loaded: markedLoaded } = useScript(
        'https://cdn.jsdelivr.net/npm/marked/marked.min.js', MARKED_SCRIPT_ID, 'marked',
      );
      const { loaded: mermaidLoaded } = useScript(
        'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js', MERMAID_SCRIPT_ID, 'mermaid',
      );
      // 2.13: Code syntax highlighting via highlight.js
      const { loaded: hljsLoaded } = useScript(
        'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js', HIGHLIGHT_SCRIPT_ID, 'hljs',
      );
      // Load highlight.js CSS
      useEffect(() => {
        if (!document.getElementById('docs-viewer-hljs-css')) {
          const link = document.createElement('link');
          link.id = 'docs-viewer-hljs-css';
          link.rel = 'stylesheet';
          link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/atom-one-dark.min.css';
          document.head.appendChild(link);
        }
      }, []);

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const url = `${ROUTE}/read?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(relPath)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (cancelled) return;
            if (!res.ok) setError(data.error || 'read failed');
            else setText(data.text || '');
          } catch (e) {
            if (!cancelled) setError(String(e));
          }
        })();
        return () => { cancelled = true; };
      }, [workspaceId, relPath]);

      useEffect(() => {
        if (mermaidLoaded && window.mermaid && !mermaidInitRef.current) {
          mermaidInitRef.current = true;
          window.mermaid.initialize({ startOnLoad: false, theme: getMermaidTheme(), securityLevel: 'strict' });
        }
      }, [mermaidLoaded]);

      useEffect(() => {
        if (!mermaidInitRef.current || !window.mermaid || !rendered) return;
        const observer = new MutationObserver(() => {
          const newTheme = getMermaidTheme();
          window.mermaid.initialize({ startOnLoad: false, theme: newTheme, securityLevel: 'strict' });
          if (markdownRef.current) {
            markdownRef.current.querySelectorAll('.mermaid-diagram').forEach(div => {
              const code = div.getAttribute('data-mermaid-code');
              if (code) {
                const id = `mermaid-rerender-${Date.now()}-${Math.random()}`;
                window.mermaid.render(id, code).then(({ svg }) => { div.innerHTML = svg; }).catch(() => {});
              }
            });
          }
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
        return () => observer.disconnect();
      }, [rendered]);

      useEffect(() => {
        if (!isMd || !text) { setRendered(''); return; }
        if (markedLoaded && window.marked) {
          setRendered(sanitizeHtml(window.marked.parse(text)));
        }
      }, [text, isMd, markedLoaded]);

      useLayoutEffect(() => {
        if (!mermaidInitRef.current || !rendered || !markdownRef.current) return;
        const mermaidBlocks = markdownRef.current.querySelectorAll('code.language-mermaid');
        if (mermaidBlocks.length === 0) return;
        mermaidRenderIdRef.current++;
        const prefix = `mermaid-${mermaidRenderIdRef.current}`;
        mermaidBlocks.forEach(async (block, index) => {
          const pre = block.parentElement;
          const code = block.textContent;
          const id = `${prefix}-${index}`;
          try {
            const { svg } = await window.mermaid.render(id, code);
            const div = document.createElement('div');
            div.className = 'mermaid-diagram';
            div.setAttribute('data-mermaid-code', code);
            div.innerHTML = svg;
            pre.replaceWith(div);
          } catch (e) { /* keep original */ }
        });
      }, [rendered]);

      // 2.13: Apply syntax highlighting to code blocks
      useLayoutEffect(() => {
        if (!hljsLoaded || !window.hljs || !rendered || !markdownRef.current) return;
        const codeBlocks = markdownRef.current.querySelectorAll('pre code:not(.language-mermaid)');
        if (codeBlocks.length === 0) return;
        codeBlocks.forEach(block => {
          window.hljs.highlightElement(block);
        });
      }, [rendered, hljsLoaded]);

      // Breadcrumb (2.12)
      const docType = requirement?.type || 'other';
      const docTypeLabels = { requirement: '需求文档', design: '技术方案', cr: 'CR 文档', other: '文档' };
      const breadcrumbText = requirement
        ? `${getDocIcon(docType)} ${name}`
        : name;

      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--dsw-alias-bg-base)' } },
        h('div', { className: 'dv-preview-body' },
          error ? h('span', { className: 'dv-error' }, 'Error: ', error)
            : isHtml
              ? h('iframe', {
                  srcDoc: text,
                  title: name,
                  className: 'dv-preview-iframe',
                  sandbox: 'allow-scripts allow-same-origin'
                })
              : isMd
                ? (markedLoaded && rendered)
                  ? h('div', { ref: markdownRef, className: 'dv-markdown', dangerouslySetInnerHTML: { __html: rendered } })
                  : h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 } }, text || 'Loading...')
                : h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 } }, text),
        ),
      );
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

    // 解析分支名，返回 { developer, date, title, requirementId } 或 null
    // 与服务端 src/server/utils.js 的 parseBranchName 保持一致
    // 支持格式：
    // 1. feature/{developer}/{YYYY-MM-DD}-{title}  (新格式)
    // 2. feature/{developer}-{YYYY-MM-DD}-{title}  (旧格式)
    // 3. {YYYY-MM-DD}-{title}  (无开发者前缀)
    function parseBranchName(branch) {
      if (!branch) return null;
      
      // 格式 1 & 2: feature/{developer}[/-]{YYYY-MM-DD}-{title}
      const match1 = branch.match(/^(?:feature\/)?([^/-]+)[/-](\d{4}-\d{2}-\d{2})-(.+)$/);
      if (match1) {
        const [, developer, date, title] = match1;
        return { developer, date, title, requirementId: `${date}-${title}` };
      }
      
      // 格式 3: {YYYY-MM-DD}-{title}  (无开发者前缀)
      const match2 = branch.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      if (match2) {
        const [, date, title] = match2;
        return { developer: null, date, title, requirementId: `${date}-${title}` };
      }
      
      return null;
    }

    // ─── CreateDirForm ───────────────────────────────────────────────
    // Covers: 4.2, 4.11, 4.12, 4.13
    function CreateDirForm({ workspaceId, docsDir, onClose }) {
      const [developer, setDeveloper] = useState('');
      const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
      const [title, setTitle] = useState('');
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      const [success, setSuccess] = useState(null);
      const { refreshTree } = React.useContext(DocsViewerContext);

      // Fetch current git branch and auto-fill form
      useEffect(() => {
        (async () => {
          try {
            const res = await fetch(`${ROUTE}/git-branch?workspaceId=${encodeURIComponent(workspaceId)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!data.branch) return;
            
            // 使用统一的分支名解析函数
            const parsed = parseBranchName(data.branch);
            if (parsed) {
              if (parsed.developer) setDeveloper(parsed.developer);
              setDate(parsed.date);
              setTitle(parsed.title);
            }
          } catch { /* ignore */ }
        })();
      }, [workspaceId]);

      const previewPath = developer && date && title
        ? `${docsDir}/${developer}/${date}-${title}/`
        : null;

      const handleCreate = async () => {
        if (!developer || !date || !title) {
          setError('请填写所有字段');
          return;
        }
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(`${ROUTE}/create-dir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, developer, date, title }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || '创建失败');
          } else {
            setSuccess(`目录创建成功: ${data.path}`);
            refreshTree();
          }
        } catch (e) {
          setError(String(e));
        } finally {
          setLoading(false);
        }
      };

      return h('div', { className: 'dv-op-panel' },
        h('div', { className: 'dv-op-hint' }, '基于 Git 分支命名规范创建需求文档目录'),

        h('div', { className: 'dv-form-group' },
          h('label', { className: 'dv-form-label' }, '开发者'),
          h('input', { className: 'dv-form-input', type: 'text', placeholder: 'zhangsan', value: developer, onChange: e => setDeveloper(e.target.value) })
        ),
        h('div', { className: 'dv-form-group' },
          h('label', { className: 'dv-form-label' }, '日期'),
          h('input', { className: 'dv-form-input', type: 'date', value: date, onChange: e => setDate(e.target.value) })
        ),
        h('div', { className: 'dv-form-group' },
          h('label', { className: 'dv-form-label' }, '需求简述'),
          h('input', { className: 'dv-form-input', type: 'text', placeholder: '新增报表导出功能', value: title, onChange: e => setTitle(e.target.value) })
        ),

        previewPath && h('div', { className: 'dv-path-preview' },
          '→ 将创建目录：', h('code', null, previewPath)
        ),

        error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),
        success && h('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, marginBottom: 8 } }, success),

        h('div', { className: 'dv-btn-row' },
          h('button', { className: 'dv-btn dv-btn-primary', onClick: handleCreate, disabled: loading },
            loading ? '创建中...' : '📁 创建目录'),
          h('button', { className: 'dv-btn', onClick: onClose }, '取消')
        )
      );
    }

    // ─── Custom Hooks ─────────────────────────────────────────────────
    
    // useSearch - encapsulates search logic for SearchPanel
    function useSearch(workspaceId) {
      const [searchMode, setSearchMode] = useState('exact');
      const [results, setResults] = useState([]);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      const [aiProgress, setAiProgress] = useState(null);
      const [aiStreamContent, setAiStreamContent] = useState('');
      const [indexBuilt, setIndexBuilt] = useState(true);
      const [searched, setSearched] = useState(false);
      const [fieldAssociations, setFieldAssociations] = useState(null);

      const handleSearch = async (query, searchType) => {
        if (!query.trim()) return;
        
        setLoading(true);
        setError(null);
        setFieldAssociations(null);
        setAiProgress(null);
        setAiStreamContent('');
        setIndexBuilt(true);
        
        try {
          let data;
          if (searchMode === 'ai') {
            // AI search mode with SSE streaming
            const response = await fetch(`${ROUTE}/ai-search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId, query, type: searchType }),
            });

            // Check if response is not OK (e.g., 503 for LLM not available)
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            const processLine = (line) => {
              if (!line.startsWith('data: ')) return;
              try {
                const eventData = JSON.parse(line.slice(6));
                if (eventData.type === 'status') {
                  setAiProgress(eventData.text);
                } else if (eventData.type === 'stream_delta') {
                  setAiStreamContent(eventData.text);
                } else if (eventData.type === 'stream_end') {
                  setAiStreamContent(eventData.text);
                } else if (eventData.type === 'done') {
                  data = eventData;
                } else if (eventData.type === 'error') {
                  throw new Error(eventData.error);
                }
              } catch (e) {
                if (e.message && e.message !== 'Failed to parse AI response') {
                  console.error('SSE parse error:', e.message);
                  throw e;
                }
              }
            };

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                processLine(line.trim());
              }
            }

            // Process any remaining data in buffer after stream ends
            if (buffer.trim()) {
              processLine(buffer.trim());
            }
          } else {
            // Exact search mode
            const res = await fetch(`${ROUTE}/search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}&type=${searchType}`);
            data = await res.json();
            
            // If searching for a field, also fetch field associations
            if (searchType === 'field' && data.results.length > 0) {
              try {
                const fieldRes = await fetch(`${ROUTE}/fields/${encodeURIComponent(query)}?workspaceId=${encodeURIComponent(workspaceId)}`);
                const fieldData = await fieldRes.json();
                if (fieldData.associations && fieldData.associations.length > 0) {
                  setFieldAssociations(fieldData);
                }
              } catch (e) {
                console.error('Failed to fetch field associations:', e);
              }
            }
          }
          
          // Only update results if we got a valid response
          if (data) {
            setResults(data.results || []);
            if (data.indexBuilt !== undefined) {
              setIndexBuilt(data.indexBuilt);
            }
          } else if (searchMode !== 'ai') {
            // For exact search, data should always be set
            setResults([]);
            setIndexBuilt(false);
          }
          // For AI search, if data is undefined, it means we got an error
          // Don't update indexBuilt - keep the current state
          
          setSearched(true);
        } catch (e) {
          console.error('Search failed:', e);
          setError(e.message || '搜索失败');
          setSearched(true);
          // Don't reset indexBuilt on error - keep current state
        } finally {
          setLoading(false);
          setAiProgress(null);
          setAiStreamContent('');
        }
      };

      return {
        searchMode,
        setSearchMode,
        results,
        loading,
        error,
        aiProgress,
        aiStreamContent,
        indexBuilt,
        searched,
        fieldAssociations,
        handleSearch,
      };
    }

    // useAnalysis - encapsulates analysis logic for AnalyzePanel
    function useAnalysis(workspaceId, selectedReq) {
      const [analyzing, setAnalyzing] = useState(false);
      const [analysisMode, setAnalysisMode] = useState(null);
      const [analysisStatus, setAnalysisStatus] = useState({});
      const [error, setError] = useState(null);
      const [success, setSuccess] = useState(null);
      const eventSourceRef = useRef(null);
      const pollIntervalRef = useRef(null);
      const { refreshTree, refreshSelectedReq } = React.useContext(DocsViewerContext);

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
        const streamUrl = mode === 'single' && selectedReq
          ? `${ROUTE}/analyze-stream?workspaceId=${encodeURIComponent(workspaceId)}&requirementId=${encodeURIComponent(selectedReq.id)}`
          : `${ROUTE}/analyze-stream?workspaceId=${encodeURIComponent(workspaceId)}`;

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

    // ─── TemplatesPanel ──────────────────────────────────────────────
    // Templates with tabs: 需求 (Requirement), 方案 (Design), CR
    function TemplatesPanel({ workspaceId, docsDir, selectedReq, onClose }) {
      const [activeTab, setActiveTab] = useState('requirement');

      return h('div', { className: 'dv-op-panel' },
        // Tab buttons
        h('div', { style: { display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--dsw-alias-border-l1)', paddingBottom: 8 } },
          h('button', {
            className: `dv-btn ${activeTab === 'requirement' ? 'dv-btn-primary' : ''}`,
            onClick: () => setActiveTab('requirement'),
            style: { flex: 1 },
          }, '需求'),
          h('button', {
            className: `dv-btn ${activeTab === 'design' ? 'dv-btn-primary' : ''}`,
            onClick: () => setActiveTab('design'),
            style: { flex: 1 },
          }, '方案'),
          h('button', {
            className: `dv-btn ${activeTab === 'cr' ? 'dv-btn-primary' : ''}`,
            onClick: () => setActiveTab('cr'),
            style: { flex: 1 },
          }, 'CR')
        ),

        // Tab content
        h(TemplatePanel, { workspaceId, docsDir, selectedReq, docType: activeTab, onClose })
      );
    }

    // ─── TemplatePanel ───────────────────────────────────────────────
    // Covers: 4.6, 4.7, 4.8, 4.11, 4.21, 4.22
    // Templates are fetched from server to avoid duplication
    function TemplatePanel({ workspaceId, docsDir, selectedReq, docType, onClose }) {
      const [templates, setTemplates] = useState(null);
      const [loading, setLoading] = useState(false);
      const [loadingAI, setLoadingAI] = useState(false);
      const [error, setError] = useState(null);
      const [success, setSuccess] = useState(null);
      const { refreshTree } = React.useContext(DocsViewerContext);

      // Fetch templates from server on mount
      useEffect(() => {
        fetch(`${ROUTE}/templates`)
          .then(res => res.ok ? res.json() : null)
          .then(data => { if (data) setTemplates(data); })
          .catch(() => {});
      }, []);

      const tmpl = templates?.[docType];

      // Show loading while templates are being fetched
      if (!tmpl) {
        return h('div', { className: 'dv-op-panel' },
          h('div', { className: 'dv-loading' }, '加载模板...')
        );
      }

      if (!selectedReq) {
        return h('div', { className: 'dv-op-panel' },
          h('div', { style: { color: 'var(--dsw-alias-state-warning-primary)', fontSize: 12, marginBottom: 12 } },
            '请先在左侧目录树中选择一个需求目录'),
          h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
        );
      }

      const targetPath = `${docsDir}/${selectedReq.developer}/${selectedReq.id}/`;

      // 4.6-4.8: Static template generation
      const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(`${ROUTE}/generate-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, requirementId: selectedReq.id, docType, useAI: false }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || '生成失败');
          } else {
            setSuccess(`模板已生成: ${data.fileName}`);
            refreshTree();
          }
        } catch (e) {
          setError(String(e));
        } finally {
          setLoading(false);
        }
      };

      // 4.23: AI template generation
      const handleGenerateAI = async () => {
        setLoadingAI(true);
        setError(null);
        try {
          const res = await fetch(`${ROUTE}/generate-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, requirementId: selectedReq.id, docType, useAI: true }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || 'AI 生成失败');
          } else {
            setSuccess(`AI 模板已生成: ${data.fileName}`);
            refreshTree();
          }
        } catch (e) {
          setError(String(e));
        } finally {
          setLoadingAI(false);
        }
      };

      return h('div', { className: 'dv-op-panel' },
        // 4.21: Target info
        h('div', { className: 'dv-op-info' },
          h('div', null, '目标目录：', h('code', null, targetPath)),
          h('div', { style: { marginTop: 4 } }, '输出文件：', h('code', null, tmpl.fileName))
        ),

        // 4.22, 4.23: Generation buttons
        h('div', { className: 'dv-btn-stack', style: { marginBottom: 12 } },
          h('button', { className: 'dv-btn dv-btn-primary', onClick: handleGenerate, disabled: loading || loadingAI },
            loading ? '生成中...' : `${tmpl.icon} 生成模板`),
          h('button', { className: 'dv-btn', onClick: handleGenerateAI, disabled: loading || loadingAI },
            loadingAI ? 'AI 生成中...' : `🤖 用 AI 生成 `, h('span', { style: { fontSize: 10, color: 'var(--dsw-alias-brand-primary)' } }, 'ctx.llm')),
          h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
        ),

        error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),
        success && h('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, marginBottom: 8 } }, success),

        // 4.22: Template preview
        h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, '模板预览'),
        h('div', { className: 'dv-template-preview' }, tmpl.content)
      );
    }

    // ─── WorkbenchPanel ──────────────────────────────────────────────
    // Workbench with tabs: 分析 (Analyze), 索引 (Index), 搜索 (Search)
    function WorkbenchPanel({ workspaceId, selectedReq, indexStatus, onRefreshIndex, onClose }) {
      const [activeTab, setActiveTab] = useState('analyze');

      return h('div', { className: 'dv-op-panel' },
        // Tab buttons
        h('div', { style: { display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--dsw-alias-border-l1)', paddingBottom: 8 } },
          h('button', {
            className: `dv-btn ${activeTab === 'analyze' ? 'dv-btn-primary' : ''}`,
            onClick: () => setActiveTab('analyze'),
            style: { flex: 1 },
          }, '🔄 分析'),
          h('button', {
            className: `dv-btn ${activeTab === 'index' ? 'dv-btn-primary' : ''}`,
            onClick: () => setActiveTab('index'),
            style: { flex: 1 },
          }, '🔨 索引'),
          h('button', {
            className: `dv-btn ${activeTab === 'search' ? 'dv-btn-primary' : ''}`,
            onClick: () => setActiveTab('search'),
            style: { flex: 1 },
          }, '🔎 搜索')
        ),

        // Tab content
        activeTab === 'analyze' && h(AnalyzePanel, { workspaceId, selectedReq, onClose }),
        activeTab === 'index' && h(IndexPanel, { workspaceId, indexStatus, onRefresh: onRefreshIndex, onClose }),
        activeTab === 'search' && h(SearchPanel, { workspaceId, onSelectReq: null })
      );
    }

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
            '分阶段同步：代码分析 → 对话分析 → 增量合并')
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

      if (!turnsData || turnsData.turnCount === 0) {
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
            h('span', null, `共 ${turnsData.turnCount} 个轮次`),
            h('span', null, `•`),
            h('span', null, `${turnsData.totalLength.toLocaleString()} 字符`),
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
                }}, turn.userInput.substring(0, 100)),
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
                  }, turn.userInput)
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
                  }, turn.summary),
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
          { phase: 'init', label: '🔧 初始化', status: 'running', text: '正在启动...', files: [] },
          { phase: 'session_extract', label: '📖 会话提取', status: 'pending', text: '', files: [] },
          { phase: 'code_analysis', label: '💻 代码分析', status: 'pending', text: '', files: [] },
          { phase: 'discussion_analysis', label: '💬 对话分析', status: 'pending', text: '', files: [] },
          { phase: 'merge', label: '🔀 增量合并', status: 'pending', text: '', files: [] },
          { phase: 'save', label: '💾 保存文件', status: 'pending', text: '', files: [] },
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
          const response = await fetch(`${ROUTE}/phased-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              requirementId: selectedReq.id,
              docType: activeTab,
              sessionIds: selectedSessions,
              runAnalysis,
              runIndex,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

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
            `同步${docTypeName}：代码分析 → 对话分析 → 增量合并`)
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

    // ─── IndexPanel (4.5, 4.17-4.19) ────────────────────────────────
    function IndexPanel({ workspaceId, indexStatus, onRefresh, onClose }) {
      const [rebuilding, setRebuilding] = useState(false);
      const [error, setError] = useState(null);
      const [success, setSuccess] = useState(null);
      const [showIndexFile, setShowIndexFile] = useState(false);
      const [indexContent, setIndexContent] = useState(null);
      const [showStructuredIndex, setShowStructuredIndex] = useState(false);
      const [indexData, setIndexData] = useState(null);

      const handleRebuild = async () => {
        setRebuilding(true);
        setError(null);
        setSuccess(null);
        try {
          const res = await fetch(`${ROUTE}/rebuild-index`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || '重建失败');
          } else {
            setSuccess(`✅ 索引重建完成 (${data.elapsed}s)`);
            if (onRefresh) onRefresh();
          }
        } catch (e) {
          setError(String(e));
        } finally {
          setRebuilding(false);
        }
      };

      const handleViewIndex = async () => {
        try {
          const res = await fetch(`${ROUTE}/read?workspaceId=${encodeURIComponent(workspaceId)}&path=.index/search-index.json`);
          if (res.ok) {
            const data = await res.json();
            setIndexContent(data.text);
            setShowIndexFile(true);
          } else {
            setError('读取索引文件失败');
          }
        } catch (e) {
          setError(String(e));
        }
      };

      const handleViewStructuredIndex = async () => {
        setShowStructuredIndex(true);
        setIndexData(null);
        try {
          const res = await fetch(`${ROUTE}/index-data?workspaceId=${encodeURIComponent(workspaceId)}`);
          if (res.ok) {
            const data = await res.json();
            setIndexData(data);
          } else {
            setIndexData({ error: '加载失败' });
          }
        } catch (e) {
          setIndexData({ error: e.message });
        }
      };

      // Structured index viewer
      const IndexViewer = () => {
        if (!showStructuredIndex) return null;

        if (!indexData) {
          return h('div', { className: 'dv-op-panel' },
            h('div', { style: { textAlign: 'center', padding: 20 } }, '加载中...'),
            h('div', { className: 'dv-btn-stack' },
              h('button', { className: 'dv-btn', onClick: () => setShowStructuredIndex(false) }, '← 返回')
            )
          );
        }

        if (indexData.error) {
          return h('div', { className: 'dv-op-panel' },
            h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', padding: 20 } }, '❌ ', indexData.error),
            h('div', { className: 'dv-btn-stack' },
              h('button', { className: 'dv-btn', onClick: () => setShowStructuredIndex(false) }, '← 返回')
            )
          );
        }

        const reqs = indexData.requirements || [];
        const featureIndex = indexData.featureIndex || {};
        const fieldIndex = indexData.fieldIndex || {};
        const tagIndex = indexData.tagIndex || {};

        return h('div', { className: 'dv-op-panel' },
          h('div', { className: 'dv-op-header' },
            h('span', null, '📊 索引详情')
          ),
          indexData.builtAt && h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 12 } },
            '构建时间：', new Date(indexData.builtAt).toLocaleString()
          ),

          // Requirements list
          h('div', { style: { marginBottom: 16 } },
            h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, '📋 需求列表（', reqs.length, '）'),
            h('div', { style: { maxHeight: 200, overflow: 'auto' } },
              reqs.map((req, i) => h('div', { key: i, style: { marginBottom: 8, padding: 8, background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 4, fontSize: 11 } },
                h('div', { style: { fontWeight: 600 } }, req.id, ' - ', req.title),
                h('div', { style: { color: 'var(--dsw-alias-label-secondary)' } },
                  req.developer, ' | ', req.date, ' | ', req.type
                ),
                req.summary && h('div', { style: { marginTop: 4 } }, req.summary)
              ))
            )
          ),

          // Feature index
          Object.keys(featureIndex).length > 0 && h('div', { style: { marginBottom: 16 } },
            h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, '🎯 功能点索引（', Object.keys(featureIndex).length, '）'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              Object.entries(featureIndex).map(([feature, reqIds]) =>
                h('div', { key: feature, style: { padding: '4px 8px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 4, fontSize: 10 } },
                  h('div', { style: { fontWeight: 600 } }, feature),
                  h('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 9 } }, reqIds.length, ' 个需求')
                )
              )
            )
          ),

          // Field index
          Object.keys(fieldIndex).length > 0 && h('div', { style: { marginBottom: 16 } },
            h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, '🗂️ 字段索引（', Object.keys(fieldIndex).length, '）'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              Object.entries(fieldIndex).map(([field, reqIds]) =>
                h('code', { key: field, style: { padding: '4px 8px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 4, fontSize: 10 } },
                  field, ' (', reqIds.length, ')'
                )
              )
            )
          ),

          // Tag index
          Object.keys(tagIndex).length > 0 && h('div', { style: { marginBottom: 16 } },
            h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, '🏷️ 标签索引（', Object.keys(tagIndex).length, '）'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              Object.entries(tagIndex).map(([tag, reqIds]) =>
                h('span', { key: tag, className: 'dv-badge dv-badge-success', style: { fontSize: 10 } },
                  tag, ' (', reqIds.length, ')'
                )
              )
            )
          ),

          h('div', { className: 'dv-btn-stack', style: { marginTop: 16 } },
            h('button', { className: 'dv-btn', onClick: () => setShowStructuredIndex(false) }, '← 返回')
          )
        );
      };

      if (showStructuredIndex) {
        return IndexViewer();
      }

      if (showIndexFile && indexContent) {
        return h('div', { className: 'dv-op-panel' },
          h('pre', {
            style: {
              background: 'var(--dsw-alias-bg-layer-2)',
              padding: 12,
              borderRadius: 6,
              fontSize: 11,
              maxHeight: 400,
              overflow: 'auto',
              fontFamily: 'ui-monospace, monospace',
            }
          }, indexContent),
          h('div', { className: 'dv-btn-stack', style: { marginTop: 12 } },
            h('button', { className: 'dv-btn', onClick: () => setShowIndexFile(false) }, '← 返回')
          )
        );
      }

      return h('div', { className: 'dv-op-panel' },
        // 4.17: Index status
        h('div', { className: 'dv-op-info' },
          h('div', null, '状态：',
            indexStatus?.built
              ? h('span', { style: { color: 'var(--dsw-alias-state-success-primary)', fontWeight: 600 } }, '已构建')
              : h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, '未构建')
          ),
          // 4.18: Build time
          indexStatus?.builtAt && h('div', null, '构建时间：', new Date(indexStatus.builtAt).toLocaleString())
        ),

        // 4.19: Statistics grid
        indexStatus?.stats && h('div', { className: 'dv-stats-grid' },
          h('div', { className: 'dv-stats-cell' }, '需求数：', h('strong', null, indexStatus.stats.requirements)),
          h('div', { className: 'dv-stats-cell' }, '功能点：', h('strong', null, indexStatus.stats.features)),
          h('div', { className: 'dv-stats-cell' }, '字段数：', h('strong', null, indexStatus.stats.fields)),
          h('div', { className: 'dv-stats-cell' }, '标签数：', h('strong', null, indexStatus.stats.tags))
        ),

        h('div', { className: 'dv-btn-stack', style: { marginBottom: 12 } },
          h('button', {
            className: 'dv-btn dv-btn-primary',
            onClick: handleRebuild,
            disabled: rebuilding
          }, rebuilding ? '重建中...' : '🔨 重建索引'),
          // 4.20: View index file
          h('button', {
            className: 'dv-btn',
            onClick: handleViewStructuredIndex,
            disabled: !indexStatus?.built
          }, '📊 查看索引详情'),
          h('button', {
            className: 'dv-btn',
            onClick: handleViewIndex,
            disabled: !indexStatus?.built
          }, '📄 查看原始文件')
        ),

        error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),
        success && h('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, marginBottom: 8 } }, success)
      );
    }

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

    // ─── Timeline (3.4, 3.5, 3.15) ──────────────────────────────────
    function Timeline({ requirement }) {
      if (!requirement?.meta?.timeline || requirement.meta.timeline.length === 0) {
        return h('div', { className: 'dv-empty', style: { padding: 20 } },
          h('span', { className: 'dv-empty-icon' }, '📅'),
          '暂无时间线数据'
        );
      }

      const typeIcons = {
        requirement: '📋',
        design: '📐',
        cr: '🔍',
        release: '✅',
      };

      return h('div', { className: 'dv-timeline' },
        requirement.meta.timeline.map((item, idx) =>
          h('div', { key: idx, className: 'dv-tl-item' },
            h('div', { className: `dv-tl-dot ${item.type || 'other'}` },
              typeIcons[item.type] || '📄'
            ),
            h('div', { className: 'dv-tl-content' },
              h('div', { className: 'dv-tl-date' }, item.date),
              h('div', { className: 'dv-tl-title' }, item.title),
              // 3.15: Description
              item.description && h('div', { className: 'dv-tl-desc' }, item.description)
            )
          )
        )
      );
    }

    // ─── LogPanel (4.9, 4.26) ─────────────────────────────────────────
    function LogPanel({ onClose }) {
      const [logs, setLogs] = useState([]);
      const [autoRefresh, setAutoRefresh] = useState(true);
      const [selectedTags, setSelectedTags] = useState([]);

      useEffect(() => {
        const fetchLogs = async () => {
          try {
            const res = await fetch(`${ROUTE}/logs`);
            if (res.ok) {
              const data = await res.json();
              setLogs(data.logs || []);
            }
          } catch (err) {
            console.error('Failed to fetch logs:', err);
          }
        };

        fetchLogs();
        
        if (autoRefresh) {
          const interval = setInterval(fetchLogs, 2000);
          return () => clearInterval(interval);
        }
      }, [autoRefresh]);

      const getLogIcon = (type) => {
        switch (type) {
          case 'success': return '✅';
          case 'error': return '❌';
          case 'warning': return '⚠️';
          default: return 'ℹ️';
        }
      };

      const getLogColor = (type) => {
        switch (type) {
          case 'success': return 'var(--dsw-alias-state-success-primary)';
          case 'error': return 'var(--dsw-alias-state-error-primary)';
          case 'warning': return 'var(--dsw-alias-state-warning-primary)';
          default: return 'var(--dsw-alias-state-info-primary)';
        }
      };

      const getTagLabel = (type) => {
        switch (type) {
          case 'success': return '成功';
          case 'error': return '错误';
          case 'warning': return '警告';
          case 'info': return '信息';
          default: return type;
        }
      };

      // 统计各类型日志数量
      const tagCounts = logs.reduce((acc, log) => {
        const type = log.type || 'info';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      // 根据选中的标签过滤日志
      const filteredLogs = selectedTags.length === 0
        ? logs
        : logs.filter(log => selectedTags.includes(log.type || 'info'));

      const toggleTag = (tag) => {
        setSelectedTags(prev => 
          prev.includes(tag)
            ? prev.filter(t => t !== tag)
            : [...prev, tag]
        );
      };

      return h('div', { className: 'dv-op-panel' },
        h('div', { className: 'dv-op-header' },
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
              h('input', {
                type: 'checkbox',
                checked: autoRefresh,
                onChange: (e) => setAutoRefresh(e.target.checked)
              }),
              '自动刷新'
            ),
            h('button', {
              className: 'dv-btn dv-btn-secondary',
              onClick: async () => {
                try {
                  await fetch(`${ROUTE}/logs/clear`, { method: 'POST' });
                  setLogs([]);
                  setSelectedTags([]);
                } catch (err) {
                  console.error('Failed to clear logs:', err);
                }
              }
            }, '清空')
          ),
          // 标签筛选器
          h('div', { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', alignSelf: 'center' } }, '筛选：'),
            Object.entries(tagCounts).map(([tag, count]) => {
              const isSelected = selectedTags.includes(tag);
              return h('button', {
                key: tag,
                onClick: () => toggleTag(tag),
                style: {
                  padding: '3px 10px',
                  fontSize: 11,
                  borderRadius: 12,
                  border: `1px solid ${getLogColor(tag)}`,
                  background: isSelected ? getLogColor(tag) : 'transparent',
                  color: isSelected ? 'white' : getLogColor(tag),
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: isSelected ? 600 : 400
                }
              }, `${getLogIcon(tag)} ${getTagLabel(tag)} (${count})`);
            }),
            selectedTags.length > 0 && h('button', {
              onClick: () => setSelectedTags([]),
              style: {
                padding: '3px 10px',
                fontSize: 11,
                borderRadius: 12,
                border: '1px solid var(--dsw-alias-label-secondary)',
                background: 'transparent',
                color: 'var(--dsw-alias-label-secondary)',
                cursor: 'pointer'
              }
            }, '清除筛选')
          )
        ),
        h('div', { className: 'dv-log-list' },
          filteredLogs.length === 0
            ? h('div', { className: 'dv-empty' }, 
                selectedTags.length > 0 ? '没有匹配的日志' : '暂无日志')
            : filteredLogs.map((log, idx) =>
                h('div', { 
                  key: idx, 
                  className: 'dv-log-item',
                  style: { borderLeft: `3px solid ${getLogColor(log.type)}` }
                },
                  h('div', { className: 'dv-log-item-header' },
                    h('span', { className: 'dv-log-icon' }, getLogIcon(log.type)),
                    h('span', { 
                      className: 'dv-log-time',
                      style: { color: getLogColor(log.type) }
                    }, new Date(log.timestamp).toLocaleTimeString()),
                    h('span', { className: 'dv-log-type' }, getTagLabel(log.type))
                  ),
                  h('div', { className: 'dv-log-message' }, log.message)
                )
              )
        )
      );
    }

    // ─── SettingsPanel (4.10) ─────────────────────────────────────────
    function SettingsPanel({ workspaceId, onClose }) {
      const [settings, setSettings] = useState({
        ai: {
          selectedModel: '',
          prompts: {}
        }
      });
      const [llmConfig, setLlmConfig] = useState(null);
      const [promptRegistry, setPromptRegistry] = useState(null);
      const [expandedPrompts, setExpandedPrompts] = useState({});
      const [saving, setSaving] = useState(false);
      const [message, setMessage] = useState(null);

      useEffect(() => {
        const fetchAll = async () => {
          try {
            // Fetch config
            const configRes = await fetch(`${ROUTE}/config`);
            if (configRes.ok) {
              const data = await configRes.json();
              setSettings({
                ai: {
                  selectedModel: data.ai?.selectedModel || '',
                  prompts: data.ai?.prompts || {}
                }
              });
            }
          } catch (err) { console.error('Failed to fetch config:', err); }

          try {
            const llmRes = await fetch(`${ROUTE}/llm-config`);
            if (llmRes.ok) {
              setLlmConfig(await llmRes.json());
            } else {
              setLlmConfig({ error: `HTTP ${llmRes.status}` });
            }
          } catch (err) { setLlmConfig({ error: err.message }); }

          try {
            const promptRes = await fetch(`${ROUTE}/prompt-registry`);
            if (promptRes.ok) {
              const data = await promptRes.json();
              setPromptRegistry(data);
            }
          } catch (err) { console.error('Failed to fetch prompt registry:', err); }
        };
        fetchAll();
      }, []);

      // Auto-select first model if none selected
      useEffect(() => {
        if (llmConfig && !llmConfig.error && llmConfig.models?.length > 0 && !settings.ai.selectedModel) {
          setSettings(prev => ({ ...prev, ai: { ...prev.ai, selectedModel: llmConfig.models[0] } }));
        }
      }, [llmConfig, settings.ai.selectedModel]);

      const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
          const res = await fetch(`${ROUTE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
          });
          if (res.ok) {
            setMessage({ type: 'success', text: '✅ 设置已保存' });
            // Refresh prompt registry to reflect saved state
            const promptRes = await fetch(`${ROUTE}/prompt-registry`);
            if (promptRes.ok) setPromptRegistry(await promptRes.json());
          } else {
            setMessage({ type: 'error', text: '保存失败' });
          }
        } catch (err) {
          setMessage({ type: 'error', text: '保存失败: ' + err.message });
        } finally {
          setSaving(false);
        }
      };

      const togglePrompt = (key) => {
        setExpandedPrompts(prev => ({ ...prev, [key]: !prev[key] }));
      };

      const handlePromptChange = (key, value) => {
        setSettings(prev => ({
          ...prev,
          ai: {
            ...prev.ai,
            prompts: { ...prev.ai.prompts, [key]: value }
          }
        }));
      };

      const handleResetPrompt = (key) => {
        setSettings(prev => ({
          ...prev,
          ai: {
            ...prev.ai,
            prompts: { ...prev.ai.prompts, [key]: '' }
          }
        }));
      };

      return h('div', { className: 'dv-op-panel', style: { overflowY: 'auto' } },

        message && h('div', {
          className: `dv-alert dv-alert-${message.type}`,
          style: { marginBottom: 16 }
        }, message.text),

        // ── LLM Config Section ──
        h('div', {
          style: {
            padding: '12px', background: 'var(--dsw-alias-bg-layer-2)',
            borderRadius: 6, marginBottom: 16, fontSize: 12,
            border: '1px solid var(--dsw-alias-border-l1)'
          }
        },
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, '🤖 LLM 配置（DSH 全局）'),
          llmConfig
            ? llmConfig.error
              ? h('div', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, '错误: ', llmConfig.error)
              : h('div', null,
                  h('div', { style: { marginBottom: 4 } },
                    h('span', { style: { fontWeight: 500 } }, 'Provider: '),
                    h('code', { style: { background: 'var(--dsw-alias-bg-layer-3)', padding: '2px 6px', borderRadius: 3 } }, llmConfig.provider)
                  ),
                  h('div', null,
                    h('span', { style: { fontWeight: 500 } }, '可用模型: '),
                    h('span', { style: { fontSize: 11 } }, llmConfig.models?.join(', ') || '(无)')
                  )
                )
            : h('div', null, '加载中...')
        ),

        // ── Model Selection ──
        llmConfig && !llmConfig.error && llmConfig.models?.length > 0 && h('div', { className: 'dv-form-group', style: { display: 'block', marginBottom: 16 } },
          h('label', { className: 'dv-form-label', style: { display: 'block', marginBottom: 8 } }, '选择 LLM 模型'),
          h('select', {
            className: 'dv-form-select',
            value: settings.ai.selectedModel,
            onChange: (e) => setSettings(prev => ({ ...prev, ai: { ...prev.ai, selectedModel: e.target.value } }))
          },
            llmConfig.models.map(model => h('option', { key: model, value: model }, model))
          )
        ),

        // ── Prompt Management Section ──
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontWeight: 600, marginBottom: 12, fontSize: 13 } }, '📝 Prompt 管理'),
          !promptRegistry
            ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '加载 Prompt 列表...')
            : (() => {
                // Group prompts by category
                const groups = {};
                Object.entries(promptRegistry).forEach(([key, meta]) => {
                  const category = meta.category || 'default';
                  if (!groups[category]) groups[category] = [];
                  groups[category].push([key, meta]);
                });

                const categoryLabels = {
                  'default': '📋 基础功能',
                  'phased-sync': '🔄 分阶段同步'
                };

                return Object.entries(groups).map(([category, prompts]) => 
                  h('div', { key: category, style: { marginBottom: 20 } },
                    h('div', { 
                      style: { 
                        fontSize: 12, 
                        fontWeight: 600, 
                        marginBottom: 10, 
                        padding: '6px 10px',
                        background: 'var(--dsw-alias-bg-layer-2)',
                        borderRadius: 4,
                        borderLeft: '3px solid var(--dsw-alias-color-brand)'
                      } 
                    }, categoryLabels[category] || category),
                    prompts.map(([key, meta]) => {
                      const isExpanded = expandedPrompts[key];
                      const currentCustom = settings.ai.prompts[key] || '';
                      const isCustomized = currentCustom.trim().length > 0;

                      return h('div', {
                        key,
                        style: {
                          marginBottom: 8,
                          border: '1px solid var(--dsw-alias-border-l1)',
                          borderRadius: 6,
                          overflow: 'hidden'
                        }
                      },
                        // Header row (clickable to toggle)
                        h('div', {
                          onClick: () => togglePrompt(key),
                          style: {
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 12px', cursor: 'pointer',
                            background: 'var(--dsw-alias-bg-layer-2)',
                            borderBottom: isExpanded ? '1px solid var(--dsw-alias-border-l1)' : 'none',
                            fontSize: 12
                          }
                        },
                          h('span', { style: { fontSize: 10, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' } }, '▶'),
                          h('span', { style: { fontWeight: 600 } }, meta.label),
                          isCustomized && h('span', {
                            style: {
                              fontSize: 10, padding: '1px 6px', borderRadius: 8,
                              background: 'var(--dsw-alias-state-success-bg)',
                              color: 'var(--dsw-alias-state-success-primary)'
                            }
                          }, '已自定义'),
                          !isCustomized && h('span', {
                            style: {
                              fontSize: 10, padding: '1px 6px', borderRadius: 8,
                              background: 'var(--dsw-alias-bg-layer-3)',
                              color: 'var(--dsw-alias-label-secondary)'
                            }
                          }, '默认')
                        ),

                        // Expanded content
                        isExpanded && h('div', { style: { padding: '12px' } },
                          h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 } }, meta.description),
                          h('textarea', {
                            className: 'dv-form-textarea',
                            rows: 10,
                            value: currentCustom || meta.default,
                            onChange: (e) => handlePromptChange(key, e.target.value),
                            style: { fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 },
                            placeholder: '留空使用默认 Prompt'
                          }),
                          isCustomized && h('div', { style: { marginTop: 8, textAlign: 'right' } },
                            h('button', {
                              className: 'dv-btn',
                              style: { fontSize: 11, padding: '4px 10px', color: 'var(--dsw-alias-state-warning-primary)' },
                              onClick: (e) => { e.stopPropagation(); handleResetPrompt(key); }
                            }, '↩ 恢复默认')
                          )
                        )
                      );
                    })
                  )
                );
              })()
        ),

        // ── Actions ──
        h('div', { className: 'dv-op-actions' },
          h('button', { className: 'dv-btn dv-btn-secondary', onClick: onClose }, '取消'),
          h('button', { className: 'dv-btn dv-btn-primary', onClick: handleSave, disabled: saving }, saving ? '保存中...' : '💾 保存')
        )
      );
    }

    // ─── TracePanel (right column default view) ─────────────────────
    function TracePanel({ selectedReq, workspaceId }) {
      const [currentReq, setCurrentReq] = useState(selectedReq);
      const [loading, setLoading] = useState(false);

      // Re-fetch requirement data when panel becomes visible or selectedReq changes
      useEffect(() => {
        if (!selectedReq || !workspaceId) {
          setCurrentReq(selectedReq);
          return;
        }

        let cancelled = false;
        (async () => {
          setLoading(true);
          try {
            // Fetch the latest tree to get updated meta data
            const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspaceId)}&t=${Date.now()}`);
            if (res.ok) {
              const data = await res.json();
              if (!cancelled) {
                // Find the current requirement in the tree
                for (const dev of data.tree.developers) {
                  for (const req of dev.requirements) {
                    if (req.id === selectedReq.id) {
                      setCurrentReq({ ...req, developer: dev.name });
                      setLoading(false);
                      return;
                    }
                  }
                }
                // If not found, use the original selectedReq
                setCurrentReq(selectedReq);
              }
            }
          } catch (e) {
            console.error('Failed to refresh requirement data:', e);
            if (!cancelled) {
              setCurrentReq(selectedReq);
            }
          } finally {
            if (!cancelled) {
              setLoading(false);
            }
          }
        })();

        return () => { cancelled = true; };
      }, [selectedReq?.id, workspaceId]);

      if (!currentReq) {
        return h('div', { className: 'dv-empty', style: { padding: 20 } },
          h('span', { className: 'dv-empty-icon' }, '🔍'),
          '选择一个需求目录以查看追溯信息'
        );
      }

      // Debug: 打印 currentReq 到控制台
      console.log('TracePanel currentReq:', currentReq);

      return h('div', { style: { padding: 16 } },
        loading && h('div', { style: { textAlign: 'center', padding: 8, color: 'var(--dsw-alias-label-secondary)', fontSize: 11 } }, '🔄 刷新中...'),
        h('div', { className: 'dv-op-info' },
          h('div', null, '👤 开发者：', currentReq.developer),
          h('div', null, '📅 日期：', currentReq.date),
          h('div', null, '📄 文档数：', currentReq.fileCount),
          h('div', null, '⚙ 分析状态：',
            currentReq.hasMeta
              ? h('span', { className: 'dv-badge dv-badge-success' }, '已分析')
              : h('span', { className: 'dv-badge dv-badge-warn' }, '未分析')
          ),
          currentReq.metaUpdatedAt && h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 } },
            '最后分析：', new Date(currentReq.metaUpdatedAt).toLocaleString())
        ),
        // 3.7: Unanalyzed prompt
        !currentReq.hasMeta && h('div', {
          style: {
            padding: '8px 12px', fontSize: 12, color: 'var(--dsw-alias-state-warning-primary)',
            background: 'var(--dsw-alias-state-warning-bg)', borderRadius: 6,
            border: '1px dashed var(--dsw-alias-state-warning-primary)', marginTop: 8,
          }
        }, '⚠️ 该需求尚未分析，无法展示时间线。请前往左侧操作栏点击「🔄 分析」按钮进行分析。'),
        // Show timeline if analyzed
        currentReq.hasMeta && (() => {
          const hasTimeline = currentReq.meta?.timeline && currentReq.meta.timeline.length > 0;
          console.log('hasTimeline:', hasTimeline, 'meta:', currentReq.meta);
          return hasTimeline 
            ? h(Timeline, { requirement: currentReq })
            : h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--dsw-alias-label-secondary)' } },
                h('span', { style: { fontSize: 24 } }, '📅'),
                h('div', { style: { marginTop: 8 } }, '该需求已分析，但时间线数据为空')
              );
        })()
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

    // ─── Workspace Modal ─────────────────────────────────────────────
    function WorkspaceModal({ workspaces, selectedId, onSelect, onClose }) {
      return h('div', { className: 'dv-modal-overlay', onClick: onClose },
        h('div', { className: 'dv-modal', onClick: e => e.stopPropagation() },
          h('div', { className: 'dv-modal-title' }, '📂 选择工作区'),
          workspaces.length === 0
            ? h('div', { className: 'dv-empty' }, '暂无工作区')
            : h('div', { className: 'dv-modal-list' },
                workspaces.map(ws =>
                  h('div', {
                    key: ws.id,
                    className: `dv-modal-item${selectedId === ws.id ? ' selected' : ''}`,
                    onClick: () => { onSelect(ws); onClose(); },
                  },
                    h('span', { className: 'dv-modal-item-icon' }, '📁'),
                    h('span', { className: 'dv-modal-item-name' }, ws.title || ws.id)
                  )
                )
              ),
          h('div', { className: 'dv-modal-actions' },
            h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
          )
        )
      );
    }

    // ─── Requirement Directory Modal ─────────────────────────────────
    function RequirementDirModal({ workspaceId, selectedReqId, onSelect, onClose }) {
      const [tree, setTree] = useState(null);
      const [loading, setLoading] = useState(true);
      const [expandedDevs, setExpandedDevs] = useState({});

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspaceId)}&t=${Date.now()}`);
            if (res.ok) {
              const data = await res.json();
              if (!cancelled && data.tree?.developers) {
                setTree(data.tree);
                // Default: expand first developer
                if (data.tree.developers.length > 0) {
                  setExpandedDevs({ [data.tree.developers[0].name]: true });
                }
              }
            }
          } catch { /* ignore */ }
          if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
      }, [workspaceId]);

      const toggleDev = (devName) => {
        setExpandedDevs(prev => ({ ...prev, [devName]: !prev[devName] }));
      };

      return h('div', { className: 'dv-modal-overlay', onClick: onClose },
        h('div', { className: 'dv-modal', onClick: e => e.stopPropagation(), style: { minWidth: 400 } },
          h('div', { className: 'dv-modal-title' }, '📂 选择需求目录'),
          loading
            ? h('div', { className: 'dv-empty' }, '加载中...')
            : !tree || tree.developers.length === 0
              ? h('div', { className: 'dv-empty' }, '暂无需求目录')
              : h('div', { className: 'dv-modal-list', style: { maxHeight: 400 } },
                  tree.developers.map(dev =>
                    h('div', { key: dev.name },
                      h('div', {
                        className: 'dv-modal-item',
                        onClick: () => toggleDev(dev.name),
                        style: { fontWeight: 600 }
                      },
                        h('span', { className: 'dv-modal-item-icon' }, expandedDevs[dev.name] ? '▼' : '▶'),
                        h('span', { className: 'dv-modal-item-name' }, dev.name),
                        h('span', { className: 'dv-modal-item-count' }, `(${dev.requirementCount})`)
                      ),
                      expandedDevs[dev.name] && dev.requirements.map(req =>
                        h('div', {
                          key: req.id,
                          className: `dv-modal-item${selectedReqId === req.id ? ' selected' : ''}`,
                          style: { paddingLeft: 32 },
                          onClick: () => { onSelect(req); onClose(); },
                        },
                          h('span', { className: 'dv-modal-item-icon' }, '📂'),
                          h('span', { className: 'dv-modal-item-name' }, `${req.date.slice(5)} ${req.title}`),
                          h('span', { className: 'dv-modal-item-count' }, `📄 ${req.fileCount}`)
                        )
                      )
                    )
                  )
                ),
          h('div', { className: 'dv-modal-actions' },
            h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
          )
        )
      );
    }

    // ─── Document Dropdown ───────────────────────────────────────────
    function DocumentDropdown({ workspaceId, selectedReq, onSelectFile, onClose }) {
      const [tree, setTree] = useState(null);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const res = await fetch(`${ROUTE}/tree?workspaceId=${encodeURIComponent(workspaceId)}&t=${Date.now()}`);
            if (res.ok) {
              const data = await res.json();
              if (!cancelled) setTree(data.tree);
            }
          } catch { /* ignore */ }
          if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
      }, [workspaceId]);

      // Get files from selected requirement only
      const allFiles = [];
      if (tree?.developers && selectedReq) {
        for (const dev of tree.developers) {
          for (const req of dev.requirements) {
            if (req.id === selectedReq.id) {
              for (const file of req.files) {
                allFiles.push({
                  ...file,
                  reqId: req.id,
                  reqTitle: req.title,
                  reqDate: req.date,
                  developer: dev.name,
                  path: req.path,
                });
              }
              break;
            }
          }
          if (allFiles.length > 0) break;
        }
      }

      return h('div', { className: 'dv-modal-overlay', onClick: onClose },
        h('div', { className: 'dv-modal', onClick: e => e.stopPropagation(), style: { minWidth: 400 } },
          h('div', { className: 'dv-modal-title' }, '📄 查看文档'),
          loading
            ? h('div', { className: 'dv-empty' }, '加载中...')
            : !selectedReq
              ? h('div', { className: 'dv-empty' }, '请先选择需求目录')
              : allFiles.length === 0
                ? h('div', { className: 'dv-empty' }, '当前需求目录下暂无文档')
                : h('div', { className: 'dv-modal-list', style: { maxHeight: 400 } },
                    allFiles.map((file, idx) => {
                      const docTypeLabels = { requirement: '需求', design: '技术方案', cr: 'CR', other: '文档' };
                      return h('div', {
                        key: `${file.reqId}-${file.name}-${idx}`,
                        className: 'dv-modal-item',
                        onClick: () => { onSelectFile(file); onClose(); },
                      },
                        h('span', { className: 'dv-modal-item-icon' }, getDocIcon(file.type)),
                        h('span', { className: 'dv-modal-item-name' },
                          h('span', { style: { fontWeight: 600 } }, file.name),
                          h('span', { className: `dv-doctype-tag ${file.type}` }, docTypeLabels[file.type] || '文档'),
                          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, marginLeft: 8 } },
                            `${file.developer} / ${file.reqDate.slice(5)} ${file.reqTitle}`)
                        )
                      );
                    })
                  ),
          h('div', { className: 'dv-modal-actions' },
            h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
          )
        )
      );
    }

    // ─── Input Modal ─────────────────────────────────────────────────
    function InputModal({ title, value, placeholder, onConfirm, onCancel }) {
      const [inputValue, setInputValue] = useState(value || '');

      useEffect(() => {
        setInputValue(value || '');
      }, [value]);

      const handleConfirm = () => {
        onConfirm(inputValue.trim());
      };

      return h('div', { className: 'dv-modal-overlay', onClick: onCancel },
        h('div', { className: 'dv-modal', onClick: e => e.stopPropagation() },
          h('div', { className: 'dv-modal-title' }, title),
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
          h('div', { className: 'dv-modal-actions' },
            h('button', { className: 'dv-btn', onClick: onCancel }, '取消'),
            h('button', { className: 'dv-btn dv-btn-primary', onClick: handleConfirm }, '确定')
          )
        )
      );
    }

    // ─── Confirm Modal ───────────────────────────────────────────────
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

    // ─── Top Bar ─────────────────────────────────────────────────────
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

      return h('div', { className: 'dv-topbar' },
        h('div', { className: 'dv-topbar-left' },
          // 定位到当前会话需求目录按钮
          h('button', {
            className: 'dv-btn dv-btn-primary',
            onClick: onLocateSessionReq,
            title: '自动定位到当前 DSH 会话对应的需求文档目录',
            style: { marginRight: 12, padding: '4px 12px', fontSize: 12 }
          }, '📍 定位会话需求'),
          
          // 项目路径
          h('span', { className: 'dv-topbar-label' }, '项目路径:'),
          h('span', {
              className: 'dv-topbar-value selected',
              onClick: () => setShowPathModal(true),
              title: '点击修改项目 docs 路径',
            }, docsDir),
          
          // 工作区
          h('span', { className: 'dv-topbar-label' }, '工作区:'),
          h('span', {
              className: `dv-topbar-value${currentWorkspace ? ' selected' : ' unselected'}`,
              onClick: onChangeWorkspace,
              title: '点击切换工作区',
            }, currentWorkspace?.title || currentWorkspace?.id || '(未选择)'),
          
          // 需求目录
          h('span', { className: 'dv-topbar-label' }, '需求目录:'),
          h('span', {
              className: `dv-topbar-value${currentReq ? ' selected' : ' unselected'}`,
              onClick: onChangeReq,
              title: '点击选择需求目录',
            }, currentReq ? `${currentReq.date?.slice(5)} ${currentReq.title}` : '(未选择)')
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

    // ─── Main Body (two-zone layout) ───────────────────────────────
    // Covers: 4.1, 4.3-4.5, 4.14-4.19, 4.23-4.25
    function DocsViewerBody({ workspace, docsDir, onConfigChange, workspaces, onSelectWorkspace, initialReqId }) {
      const [activePanel, setActivePanel] = useState(null);
      const [selectedReq, setSelectedReq] = useState(null);
      const [selectedFile, setSelectedFile] = useState(null);
      const [totalReqs, setTotalReqs] = useState(0);
      const [indexStatus, setIndexStatus] = useState(null);
      const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
      const [showReqDirModal, setShowReqDirModal] = useState(false);
      const [showDocDropdown, setShowDocDropdown] = useState(false);
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
        { id: 'create', icon: '📁', label: '新建' },
        { id: 'sync', icon: '🔄', label: '同步' },
        { id: 'view', icon: '📄', label: '查看', isDropdown: true },
        { id: 'trace', icon: '🔍', label: '追溯' },
        { id: 'workbench', icon: '🛠️', label: '工作台' },
        { id: 'templates', icon: '📋', label: '模板' },
      ];
      const bottomButtons = [
        { id: 'log', icon: '📜', label: '日志' },
        { id: 'settings', icon: '⚙️', label: '设置' },
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
            onClose: handlePanelClose 
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
        h('div', { className: 'dv-root' },
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

          h('div', { className: 'dv-three-zone', ref: threeZoneRef },
            // ── Left: Rail toolbar ──
            h('div', { className: 'dv-rail' },
              topButtons.map(btn => {
                // Group button with sub-buttons (workbench / templates)
                if (btn.group) {
                  const isGroupExpanded = expandedGroup === btn.group;
                  const isSubActive = btn.subButtons.some(sb => activePanel === sb.id);
                  return h('div', { key: btn.id, className: 'dv-rail-group' },
                    h('button', {
                      className: `dv-rail-btn${isSubActive ? ' active' : ''}${isGroupExpanded ? ' expanded' : ''}`,
                      onClick: () => {
                        if (isGroupExpanded) {
                          setExpandedGroup(null);
                        } else {
                          setExpandedGroup(btn.group);
                        }
                      },
                    },
                      h('span', null, btn.icon),
                      h('span', { className: 'dv-rail-label' }, btn.label),
                      h('span', { className: 'dv-rail-arrow' }, isGroupExpanded ? '▾' : '▸')
                    ),
                    isGroupExpanded && h('div', { className: 'dv-rail-sub' },
                      btn.subButtons.map(sb =>
                        h('button', {
                          key: sb.id,
                          className: `dv-rail-sub-btn${activePanel === sb.id ? ' active' : ''}`,
                          onClick: () => setActivePanel(activePanel === sb.id ? null : sb.id),
                        },
                          h('span', null, sb.icon),
                          h('span', { className: 'dv-rail-label' }, sb.label)
                        )
                      )
                    )
                  );
                }
                // Regular button
                return h('button', {
                  key: btn.id,
                  className: `dv-rail-btn${activePanel === btn.id ? ' active' : ''}`,
                  onClick: () => {
                    if (btn.isDropdown) {
                      setShowDocDropdown(true);
                    } else {
                      setExpandedGroup(null);
                      setActivePanel(activePanel === btn.id ? null : btn.id);
                    }
                  },
                },
                  h('span', null, btn.icon),
                  h('span', { className: 'dv-rail-label' }, btn.label)
                );
              }),
              h('div', { className: 'dv-rail-bottom' },
                bottomButtons.map(btn =>
                  h('button', {
                    key: btn.id,
                    className: `dv-rail-btn${activePanel === btn.id ? ' active' : ''}`,
                    onClick: () => {
                      setExpandedGroup(null);
                      setActivePanel(activePanel === btn.id ? null : btn.id);
                    },
                  },
                    h('span', null, btn.icon),
                    h('span', { className: 'dv-rail-label' }, btn.label)
                  )
                )
              )
            ),

            // ── Right: Trace / Operations / File Preview ──
            h('div', {
              className: 'dv-right-panel',
              style: { flex: 1 }
            },
              h('div', { className: 'dv-right-header' },
                h('span', null, rightHeaderTitle),
                (activePanel || selectedFile) && h('span', { className: 'dv-right-close', onClick: handlePanelClose }, '✕ 关闭')
              ),
              h('div', { className: 'dv-right-body' }, renderRightContent())
            )
          ),

          // ── Status bar (4.24) ──
          h('div', { className: 'dv-statusbar' },
            h('span', null, 'docs-viewer v4.0'),
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

          // ── Document dropdown ──
          showDocDropdown && h(DocumentDropdown, {
            workspaceId: workspace.id,
            selectedReq,
            onSelectFile: handleSelectFile,
            onClose: () => setShowDocDropdown(false),
          }),

          // ── Create requirement confirm modal ──
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

    // ─── Workspace selector sidebar ──────────────────────────────────
    // ─── Tab body wrapper ────────────────────────────────────────────
    function TabBodyWrapper() {
      const [workspaces, setWorkspaces] = useState([]);
      const [docsDir, setDocsDir] = useState('docs');
      const [selectedWs, setSelectedWs] = useState(null);
      const [initialReqId, setInitialReqId] = useState(null);

      // Pass wsList explicitly to avoid stale closure over workspaces state
      const loadConfig = (wsList) => {
        const list = wsList || workspaces;
        return fetch(`${ROUTE}/config?t=${Date.now()}`, { cache: 'no-cache', headers: { 'Cache-Control': 'no-cache' } })
          .then(res => res.ok ? res.json() : null)
          .then(config => {
            if (config?.docsDir) setDocsDir(config.docsDir);
            setInitialReqId(config?.requirementId || null);
            if (list.length > 0) {
              if (config?.workspaceId) {
                const ws = list.find(w => w.id === config.workspaceId);
                if (ws) { 
                  setSelectedWs(prev => prev?.id === ws.id ? prev : ws);
                  return config;
                }
              }
              setSelectedWs(prev => prev || list[0]);
            }
            return config;
          })
          .catch(() => {
            setSelectedWs(prev => prev || (list.length > 0 ? list[0] : null));
            return null;
          });
      };

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const res = await fetch(`${ROUTE}/workspaces`);
            if (!res.ok) return;
            const data = await res.json();
            if (!cancelled && Array.isArray(data)) {
              setWorkspaces(data);
              // Use plugin's saved config or first workspace
              const config = await loadConfig();
              if (config?.workspaceId) {
                const ws = data.find(w => w.id === config.workspaceId);
                if (ws) {
                  setSelectedWs(ws);
                  return;
                }
              }
              setSelectedWs(prev => prev || (data.length > 0 ? data[0] : null));
            }
          } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
      }, []);

      if (!workspaces.length) {
        return h('div', { className: 'dv-empty' }, 'No workspaces available');
      }

      if (!selectedWs) {
        return h('div', { className: 'dv-empty' }, 'Select a workspace');
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
        h(DocsViewerBody, {
          workspace: selectedWs,
          docsDir,
          onConfigChange: () => loadConfig(workspaces),
          workspaces,
          onSelectWorkspace: setSelectedWs,
          initialReqId,
        })
      );
    }

    // ─── Tab title ───────────────────────────────────────────────────
    function TabTitle() {
      return h('span', null, '📄 Docs');
    }

    // ─── Trigger button ──────────────────────────────────────────────
    function TriggerButton({ onClick, wide }) {
      const [hovered, setHovered] = useState(false);
      const [stats, setStats] = useState(null);
      const [docsDir, setDocsDir] = useState('docs');
      const [tooltipPos, setTooltipPos] = useState(null);
      const tooltipRef = useRef(null);
      const adjustCountRef = useRef(0);
      const cls = 'dv-trigger' + (wide ? '' : ' dv-trigger-rail');

      const loadConfig = () => {
        fetch(`${ROUTE}/config?t=${Date.now()}`, { cache: 'no-cache', headers: { 'Cache-Control': 'no-cache' } })
          .then(res => res.ok ? res.json() : null)
          .then(config => { if (config?.docsDir) setDocsDir(config.docsDir); })
          .catch(() => {});
      };

      useEffect(() => {
        loadConfig();
        window.addEventListener('focus', loadConfig);
        return () => window.removeEventListener('focus', loadConfig);
      }, []);

      useEffect(() => {
        if (!tooltipPos || !tooltipRef.current) return;
        if (adjustCountRef.current >= 3) return;
        const el = tooltipRef.current;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        let newTop = tooltipPos.top;
        let newLeft = tooltipPos.left;
        if (rect.bottom > vh - 8) newTop = Math.max(8, vh - rect.height - 8);
        if (rect.right > vw - 8) newLeft = tooltipPos.left - rect.width - 16;
        if (newTop !== tooltipPos.top || newLeft !== tooltipPos.left) {
          adjustCountRef.current++;
          setTooltipPos({ top: newTop, left: newLeft });
        }
      }, [tooltipPos, stats]);

      const handleMouseEnter = (e) => {
        setHovered(true);
        adjustCountRef.current = 0;
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({ top: rect.top, left: rect.right + 8 });
        if (!stats) {
          fetch(`${ROUTE}/stats`).then(res => res.ok ? res.json() : null)
            .then(data => { if (data) setStats(data); }).catch(() => {});
        }
      };

      const handleMouseLeave = () => { setHovered(false); setTooltipPos(null); };
      const showTooltip = hovered && tooltipPos;

      return h('div', { style: { position: 'relative', width: '100%' } },
        h('button', {
          className: cls, onClick,
          onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave,
          'aria-label': 'Project Documentation',
        },
          h('span', { className: 'dv-trigger-icon' }, '📄'),
          wide && h('span', { className: 'dv-trigger-label' }, 'Docs'),
        ),
        showTooltip && h('div', {
          ref: tooltipRef, className: 'dv-tooltip',
          style: { position: 'fixed', top: tooltipPos.top + 'px', left: tooltipPos.left + 'px', zIndex: 9999, maxHeight: 'calc(100vh - 16px)' },
          onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false),
        },
          h('div', { className: 'dv-tooltip-title' }, `Documentation (${docsDir}/)`),
          !stats
            ? h('div', { className: 'dv-tooltip-row' }, 'Loading...')
            : stats.length === 0
              ? h('div', { className: 'dv-tooltip-row' }, 'No workspaces')
              : stats.map(s =>
                  h('div', { key: s.workspaceId, className: 'dv-tooltip-row' },
                    h('span', { className: 'dv-tooltip-name' }, s.title),
                    h('span', { className: 'dv-tooltip-counts' },
                      s.exists ? `${s.docCount} docs` : `No ${docsDir}/`)
                  )
                )
        )
      );
    }

    // ─── Plugin registration ─────────────────────────────────────────
    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'layout'],
      apply(ctx) {
        const disposers = [];

        // Store context globally for components to access
        window.__DSH_CTX__ = ctx;

        disposers.push(ctx.sidebarRightTabs.register({
          id: TAB_ID, kind: TAB_KIND, multiple: false, priority: 'user',
          title: () => 'Project Documentation',
        }));

        disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab', key: TAB_ID,
        }, TabBodyWrapper)));

        disposers.push(ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title', key: TAB_ID,
        }, TabTitle)));

        disposers.push(ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action', id: 'docs-viewer-trigger', order: 10,
          label: 'Project Documentation',
        }, ({ wide }) => {
          const handleClick = () => {
            ctx.layout.openRightbar(true, false);
            ctx.sidebarRight.openTab(TAB_KIND);
          };
          return h(TriggerButton, { onClick: handleClick, wide });
        })));

        return () => { 
          for (const d of disposers) d(); 
          delete window.__DSH_CTX__;
        };
      },
    };
  },
});
