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
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 12px; height: 36px; flex-shrink: 0;
          background: var(--dsw-alias-bg-layer-1);
          border-bottom: 1px solid var(--dsw-alias-border-l1);
          font-size: 12px;
        }
        .dv-topbar-left, .dv-topbar-right {
          display: flex; align-items: center; gap: 8px;
        }
        .dv-topbar-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
        .dv-topbar-value {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: var(--dsw-alias-label-primary); font-size: 11px;
          padding: 2px 8px; background: var(--dsw-alias-bg-layer-2);
          border-radius: 4px; cursor: pointer;
        }
        .dv-topbar-value:hover { background: var(--dsw-alias-bg-layer-3); }
        .dv-topbar-edit {
          padding: 2px 6px; border: none; background: transparent;
          color: var(--dsw-alias-brand-primary); cursor: pointer; font-size: 11px;
        }
        .dv-topbar-edit:hover { text-decoration: underline; }
        .dv-topbar-input {
          padding: 2px 8px; border: 1px solid var(--dsw-alias-brand-primary);
          border-radius: 4px; font-size: 11px; background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-primary); outline: none;
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
        .dv-rail-label { font-size: 8px; font-weight: 600; letter-spacing: 0.02em; line-height: 1; }
        .dv-rail-sep { width: 36px; height: 1px; background: var(--dsw-alias-border-l1); margin: 4px 0; }
        .dv-rail-bottom { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-bottom: 4px; }

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
      const breadcrumbText = requirement
        ? `${getDocIcon(requirement.type || 'other')} ${name} — ${requirement.date?.slice(5) || ''} ${requirement.title || ''}`
        : name;

      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--dsw-alias-bg-base)' } },
        h('div', { className: 'dv-breadcrumb' }, breadcrumbText),
        h('div', { className: 'dv-preview-body' },
          error ? h('span', { className: 'dv-error' }, 'Error: ', error)
            : isHtml
              ? h('iframe', {
                  srcDoc: `<!DOCTYPE html><html><head><style>body{background:var(--dsw-alias-bg-base,#1e1e1e);color:var(--dsw-alias-label-primary,#fff);}</style></head><body>${text}</body></html>`,
                  title: name,
                  className: 'dv-preview-iframe',
                  sandbox: 'allow-scripts'
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
    function DocTree({ workspaceId, docsDir, selectedReqId, onSelectReq, selectedFile, onSelectFile, onTreeLoaded }) {
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

      // Expose refresh
      useEffect(() => {
        window.__dvRefreshTree = loadTree;
        return () => { delete window.__dvRefreshTree; };
      }, [loadTree]);

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
                      req.hasMeta && h('div', { className: 'dv-meta-item' }, '⚙ .meta.json')
                    )
                  );
                })
              );
            })
      );
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

      // Fetch current git branch and auto-fill form
      useEffect(() => {
        (async () => {
          try {
            const res = await fetch(`${ROUTE}/git-branch?workspaceId=${encodeURIComponent(workspaceId)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!data.branch) return;
            
            // Parse branch name: feature/{developer}-{YYYY-MM-DD}-{title}
            // e.g. feature/zhangsan-2026-10-08-fix-login-bug
            const match = data.branch.match(/^(?:feature\/)?([^-]+)-(\d{4}-\d{2}-\d{2})-(.+)$/);
            if (match) {
              setDeveloper(match[1]);
              setDate(match[2]);
              setTitle(match[3]);
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
            setSuccess(`✅ 目录创建成功: ${data.path}`);
            if (window.__dvRefreshTree) window.__dvRefreshTree();
          }
        } catch (e) {
          setError(String(e));
        } finally {
          setLoading(false);
        }
      };

      return h('div', { className: 'dv-op-panel' },
        h('div', { className: 'dv-op-title' }, '📁 创建需求目录'),
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

    // ─── TemplatePanel ───────────────────────────────────────────────
    // Covers: 4.6, 4.7, 4.8, 4.11, 4.21, 4.22
    const TEMPLATES = {
      requirement: { label: '需求文档', icon: '📋', fileName: 'requirement.md', content: `# 需求文档\n\n## 背景\n描述需求的背景和原因。\n\n## 目标\n明确需求要达成的目标。\n\n## 功能点\n- [ ] 功能点 1\n- [ ] 功能点 2\n\n## 涉及字段\n| 表名 | 字段名 | 变更类型 | 说明 |\n|------|--------|---------|------|\n|      |        |         |      |\n\n## 验收标准\n- [ ] 标准 1\n- [ ] 标准 2\n` },
      design: { label: '技术方案', icon: '📐', fileName: 'design.md', content: `# 技术方案\n\n## 方案概述\n简述技术方案的整体思路。\n\n## 架构设计\n描述系统架构和模块划分。\n\n## 接口设计\n### 接口 1\n- 路径：\n- 方法：\n- 参数：\n- 返回：\n\n## 数据库变更\n| 表名 | 字段 | 类型 | 说明 |\n|------|------|------|------|\n|      |      |      |      |\n\n## 风险评估\n- 风险 1：\n- 风险 2：\n` },
      cr: { label: 'CR 记录', icon: '🔍', fileName: 'cr-notes.md', content: `# CR 记录\n\n## CR 时间\nYYYY-MM-DD\n\n## 参与人员\n- 提交人：\n- 审核人：\n\n## CR 意见\n### 问题 1\n- 严重程度：\n- 描述：\n- 建议：\n\n## 结论\n- [ ] 通过\n- [ ] 需修改后通过\n- [ ] 不通过\n` },
    };

    function TemplatePanel({ workspaceId, docsDir, selectedReq, docType, onClose }) {
      const tmpl = TEMPLATES[docType];
      const [loading, setLoading] = useState(false);
      const [loadingAI, setLoadingAI] = useState(false);
      const [error, setError] = useState(null);
      const [success, setSuccess] = useState(null);

      if (!selectedReq) {
        return h('div', { className: 'dv-op-panel' },
          h('div', { className: 'dv-op-title' }, `${tmpl.icon} 生成${tmpl.label}模板`),
          h('div', { style: { color: 'var(--dsw-alias-state-warning-primary)', fontSize: 12, marginBottom: 12 } },
            '⚠️ 请先在左侧目录树中选择一个需求目录'),
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
            setSuccess(`✅ 模板已生成: ${data.fileName}`);
            if (window.__dvRefreshTree) window.__dvRefreshTree();
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
            setSuccess(`✅ AI 模板已生成: ${data.fileName}`);
            if (window.__dvRefreshTree) window.__dvRefreshTree();
          }
        } catch (e) {
          setError(String(e));
        } finally {
          setLoadingAI(false);
        }
      };

      return h('div', { className: 'dv-op-panel' },
        h('div', { className: 'dv-op-title' }, `${tmpl.icon} 生成${tmpl.label}模板`),

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

    // ─── AnalyzePanel (4.3, 4.4, 4.14-4.16) ─────────────────────────
    function AnalyzePanel({ workspaceId, selectedReq, onClose }) {
      const [error, setError] = useState(null);
      const [success, setSuccess] = useState(null);
      const [aiConfig, setAiConfig] = useState(null);
      const [analyzing, setAnalyzing] = useState(false);
      const [analysisMode, setAnalysisMode] = useState(null); // 'single' or 'all'
      const [previewFiles, setPreviewFiles] = useState([]);
      const [analysisStatus, setAnalysisStatus] = useState({}); // { reqId: { status, error } }

      useEffect(() => {
        fetch(`${ROUTE}/ai-config`)
          .then(res => res.ok ? res.json() : null)
          .then(data => { if (data) setAiConfig(data); })
          .catch(() => {});
      }, []);

      const startAnalysis = async (mode) => {
        setAnalysisMode(mode);
        setAnalyzing(true);
        setError(null);
        setSuccess(null);

        // Get preview files first
        const url = mode === 'single' && selectedReq
          ? `${ROUTE}/analyze-preview?workspaceId=${encodeURIComponent(workspaceId)}&requirementId=${encodeURIComponent(selectedReq.id)}`
          : `${ROUTE}/analyze-preview?workspaceId=${encodeURIComponent(workspaceId)}`;

        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            setPreviewFiles(data.files || []);
            // Initialize all as pending
            const status = {};
            for (const file of data.files) {
              status[file.id] = { status: 'pending' };
            }
            setAnalysisStatus(status);
          }
        } catch (e) {
          setError(String(e));
          setAnalyzing(false);
          return;
        }

        // Start streaming analysis
        const streamUrl = mode === 'single' && selectedReq
          ? `${ROUTE}/analyze-stream?workspaceId=${encodeURIComponent(workspaceId)}&requirementId=${encodeURIComponent(selectedReq.id)}`
          : `${ROUTE}/analyze-stream?workspaceId=${encodeURIComponent(workspaceId)}`;

        try {
          const eventSource = new EventSource(streamUrl);

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
            } else if (data.type === 'done') {
              setSuccess(`${mode === 'single' ? '当前需求' : '全量'}分析完成: ${data.success}/${data.total} 成功 (${data.elapsed}s)`);
              if (window.__dvRefreshTree) window.__dvRefreshTree();
              eventSource.close();
              setAnalyzing(false);
            } else if (data.type === 'error') {
              setError(data.error);
              eventSource.close();
              setAnalyzing(false);
            }
          };

          eventSource.onerror = () => {
            setError('连接中断');
            eventSource.close();
            setAnalyzing(false);
          };
        } catch (e) {
          setError(String(e));
          setAnalyzing(false);
        }
      };

      const handleAnalyzeSingle = () => {
        if (!selectedReq) return;
        startAnalysis('single');
      };

      const handleAnalyzeAll = () => {
        startAnalysis('all');
      };

      return h('div', { className: 'dv-op-panel' },
        h('div', { className: 'dv-op-title' }, '🔄 AI 需求分析'),

        // 4.14: Current requirement info
        selectedReq && h('div', { className: 'dv-req-card' },
          h('div', { className: 'dv-req-card-title' }, selectedReq.title),
          h('div', { className: 'dv-req-card-row' }, '👤 开发者：', selectedReq.developer),
          h('div', { className: 'dv-req-card-row' }, '📅 日期：', selectedReq.date),
          h('div', { className: 'dv-req-card-row' }, '📄 文档数：', selectedReq.fileCount),
          h('div', { className: 'dv-req-card-row' }, '⚙ 状态：',
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
          h('div', null, '📦 Model：', h('code', null, aiConfig.model)),
          h('div', null, '🌡️ Temperature：', aiConfig.temperature),
          h('div', null, '📏 Max Tokens：', aiConfig.maxTokens)
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
          h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
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
                  status.status === 'failed' && '❌ 失败'
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

      return h('div', { className: 'dv-op-panel' },
        h('div', { className: 'dv-op-title' }, '🔨 搜索索引管理'),

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
          h('button', { className: 'dv-btn', onClick: onClose }, '关闭')
        ),

        error && h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, marginBottom: 8 } }, '❌ ', error),
        success && h('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, marginBottom: 8 } }, success)
      );
    }

    // ─── SearchBar (3.1, 3.2) ───────────────────────────────────────
    function SearchBar({ onSearch, searchType, onTypeChange }) {
      const [query, setQuery] = useState('');

      const handleSearch = () => {
        if (onSearch) onSearch(query);
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
        h('input', {
          className: 'dv-search-input',
          type: 'text',
          placeholder: '搜索功能点、字段、标签...',
          value: query,
          onChange: e => setQuery(e.target.value),
          onKeyDown: handleKeyDown,
        }),
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

    // ─── SearchResults (3.3, 3.9-3.11) ──────────────────────────────
    function SearchResults({ results, onSelectReq }) {
      if (!results || results.length === 0) {
        return h('div', { className: 'dv-empty', style: { padding: 20 } },
          h('span', { className: 'dv-empty-icon' }, '🔍'),
          '未找到匹配的需求'
        );
      }

      return h('div', null,
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
              )
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

    // ─── TracePanel (right column default view) ─────────────────────
    function TracePanel({ selectedReq }) {
      if (!selectedReq) {
        return h('div', { className: 'dv-empty', style: { padding: 20 } },
          h('span', { className: 'dv-empty-icon' }, '🔍'),
          '选择一个需求目录以查看追溯信息'
        );
      }

      return h('div', { style: { padding: 16 } },
        h('div', { style: { fontSize: 13, fontWeight: 700, marginBottom: 12 } },
          `🔍 需求追溯: ${selectedReq.title}`),
        h('div', { className: 'dv-op-info' },
          h('div', null, '👤 开发者：', selectedReq.developer),
          h('div', null, '📅 日期：', selectedReq.date),
          h('div', null, '📄 文档数：', selectedReq.fileCount),
          h('div', null, '⚙ 分析状态：',
            selectedReq.hasMeta
              ? h('span', { className: 'dv-badge dv-badge-success' }, '已分析')
              : h('span', { className: 'dv-badge dv-badge-warn' }, '未分析')
          ),
          selectedReq.metaUpdatedAt && h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 } },
            '最后分析：', new Date(selectedReq.metaUpdatedAt).toLocaleString())
        ),
        // 3.7: Unanalyzed prompt
        !selectedReq.hasMeta && h('div', {
          style: {
            padding: '8px 12px', fontSize: 12, color: 'var(--dsw-alias-state-warning-primary)',
            background: 'var(--dsw-alias-state-warning-bg)', borderRadius: 6,
            border: '1px dashed var(--dsw-alias-state-warning-primary)', marginTop: 8,
          }
        }, '⚠️ 该需求尚未分析，无法展示时间线。请前往左侧操作栏点击「🔄 分析」按钮进行分析。'),
        // Show timeline if analyzed
        selectedReq.hasMeta && selectedReq.meta && h(Timeline, { requirement: selectedReq })
      );
    }

    // ─── SearchPanel (3.1-3.5, 3.7, 3.9-3.11, 3.15) ────────────────
    function SearchPanel({ workspaceId, onSelectReq }) {
      const [searchType, setSearchType] = useState('all');
      const [results, setResults] = useState([]);
      const [searched, setSearched] = useState(false);
      const [indexBuilt, setIndexBuilt] = useState(false);

      const handleSearch = async (query) => {
        try {
          const res = await fetch(`${ROUTE}/search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}&type=${searchType}`);
          const data = await res.json();
          setResults(data.results || []);
          setIndexBuilt(data.indexBuilt);
          setSearched(true);
        } catch (e) {
          console.error('Search failed:', e);
        }
      };

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
        h(SearchBar, { onSearch: handleSearch, searchType, onTypeChange: setSearchType }),
        !indexBuilt && searched && h('div', {
          style: {
            padding: '8px 14px', fontSize: 12, color: 'var(--dsw-alias-state-warning-primary)',
            background: 'var(--dsw-alias-state-warning-bg)', borderBottom: '1px solid var(--dsw-alias-border-l1)',
          }
        }, '⚠️ 索引未构建，请先点击「🔨 索引」按钮重建索引'),
        searched && h('div', { className: 'dv-search-count' },
          `找到 `, h('strong', null, results.length), ` 个需求`
        ),
        h('div', { style: { flex: 1, overflowY: 'auto' } },
          searched ? h(SearchResults, { results, onSelectReq: handleSelectReq }) :
            h('div', { className: 'dv-empty', style: { padding: 20 } },
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

      // Get all files from all requirements
      const allFiles = [];
      if (tree?.developers) {
        for (const dev of tree.developers) {
          for (const req of dev.requirements) {
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
          }
        }
      }

      return h('div', { className: 'dv-modal-overlay', onClick: onClose },
        h('div', { className: 'dv-modal', onClick: e => e.stopPropagation(), style: { minWidth: 400 } },
          h('div', { className: 'dv-modal-title' }, '📄 查看文档'),
          loading
            ? h('div', { className: 'dv-empty' }, '加载中...')
            : allFiles.length === 0
              ? h('div', { className: 'dv-empty' }, '暂无文档')
              : h('div', { className: 'dv-modal-list', style: { maxHeight: 400 } },
                  allFiles.map((file, idx) =>
                    h('div', {
                      key: `${file.reqId}-${file.name}-${idx}`,
                      className: 'dv-modal-item',
                      onClick: () => { onSelectFile(file); onClose(); },
                    },
                      h('span', { className: 'dv-modal-item-icon' }, getDocIcon(file.type)),
                      h('span', { className: 'dv-modal-item-name' },
                        h('span', { style: { fontWeight: 600 } }, file.name),
                        h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, marginLeft: 8 } },
                          `${file.developer} / ${file.reqDate.slice(5)} ${file.reqTitle}`)
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

    // ─── Top Bar ─────────────────────────────────────────────────────
    function TopBar({ docsDir, currentWorkspace, currentReq, onEditDocsDir, onChangeWorkspace, onChangeReq }) {
      const [editing, setEditing] = useState(false);
      const [tempDir, setTempDir] = useState(docsDir);

      useEffect(() => { setTempDir(docsDir); }, [docsDir]);

      const handleSaveDir = async () => {
        const newDir = tempDir.trim() || 'docs';
        try {
          const res = await fetch(`${ROUTE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docsDir: newDir }),
          });
          if (res.ok) { setEditing(false); onEditDocsDir(); }
        } catch { /* ignore */ }
      };

      return h('div', { className: 'dv-topbar' },
        h('div', { className: 'dv-topbar-left' },
          h('span', { className: 'dv-topbar-label' }, '项目路径:'),
          editing
            ? h('input', {
                className: 'dv-topbar-input',
                value: tempDir,
                onChange: e => setTempDir(e.target.value),
                onBlur: handleSaveDir,
                onKeyDown: e => { if (e.key === 'Enter') handleSaveDir(); if (e.key === 'Escape') { setTempDir(docsDir); setEditing(false); } },
                autoFocus: true,
              })
            : h('span', {
                className: 'dv-topbar-value',
                onClick: () => setEditing(true),
                title: '点击修改项目 docs 路径',
              }, docsDir, ' ', h('span', { className: 'dv-topbar-edit' }, '✏️'))
        ),
        h('div', { className: 'dv-topbar-right' },
          h('span', { className: 'dv-topbar-label' }, '工作区:'),
          h('span', {
              className: 'dv-topbar-value',
              onClick: onChangeWorkspace,
              title: '点击切换工作区',
            }, currentWorkspace?.title || currentWorkspace?.id || '(未选择)'),
          h('span', { className: 'dv-topbar-label', style: { marginLeft: 16 } }, '需求目录:'),
          h('span', {
              className: 'dv-topbar-value',
              onClick: onChangeReq,
              title: '点击选择需求目录',
            }, currentReq ? `${currentReq.date?.slice(5)} ${currentReq.title}` : '(未选择)')
        )
      );
    }

    // ─── Main Body (two-zone layout) ───────────────────────────────
    // Covers: 4.1, 4.3-4.5, 4.14-4.19, 4.23-4.25
    function DocsViewerBody({ workspace, docsDir, onConfigChange, workspaces, onSelectWorkspace }) {
      const [activePanel, setActivePanel] = useState(null);
      const [selectedReq, setSelectedReq] = useState(null);
      const [selectedFile, setSelectedFile] = useState(null);
      const [totalReqs, setTotalReqs] = useState(0);
      const [indexStatus, setIndexStatus] = useState(null);
      const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
      const [showReqDirModal, setShowReqDirModal] = useState(false);
      const [showDocDropdown, setShowDocDropdown] = useState(false);
      const threeZoneRef = useRef(null);

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

      const handleSelectReq = (req) => {
        setSelectedReq(req);
        setSelectedFile(null);
      };

      const handleSelectFile = (file) => {
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

      // Rail buttons config (4.1, 4.3-4.5)
      const topButtons = [
        { id: 'create', icon: '📁', label: '新建' },
        { id: 'view', icon: '📄', label: '查看', isDropdown: true },
        { id: 'trace', icon: '🔍', label: '追溯' },
        { id: 'analyze', icon: '🔄', label: '分析' },
        { id: 'index', icon: '🔨', label: '索引' },
        { id: 'search', icon: '🔎', label: '搜索' },
      ];
      const templateButtons = [
        { id: 'requirement', icon: '📋', label: '需求' },
        { id: 'design', icon: '📐', label: '方案' },
        { id: 'cr', icon: '🔍', label: 'CR' },
      ];

      const renderPanel = () => {
        if (!activePanel) return null;
        if (activePanel === 'create') {
          return h(CreateDirForm, { workspaceId: workspace.id, docsDir, onClose: handlePanelClose });
        }
        if (activePanel === 'trace') {
          return h(TracePanel, { selectedReq });
        }
        if (activePanel === 'analyze') {
          return h(AnalyzePanel, { workspaceId: workspace.id, selectedReq, onClose: handlePanelClose });
        }
        if (activePanel === 'index') {
          return h(IndexPanel, { workspaceId: workspace.id, indexStatus, onRefresh: refreshIndexStatus, onClose: handlePanelClose });
        }
        if (['requirement', 'design', 'cr'].includes(activePanel)) {
          return h(TemplatePanel, {
            workspaceId: workspace.id, docsDir,
            selectedReq, docType: activePanel,
            onClose: handlePanelClose,
          });
        }
        return null;
      };

      // Right panel content
      const renderRightContent = () => {
        // Active panel takes priority
        if (activePanel === 'search') {
          return h(SearchPanel, { workspaceId: workspace.id, onSelectReq: handleSelectReq });
        }
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
        ? (activePanel === 'create' ? '📁 创建需求目录'
          : activePanel === 'trace' ? '🔍 需求追溯'
          : activePanel === 'analyze' ? '🔄 AI 需求分析'
          : activePanel === 'index' ? '🔨 搜索索引管理'
          : activePanel === 'search' ? '🔍 需求搜索'
          : activePanel === 'requirement' ? '📋 生成需求文档模板'
          : activePanel === 'design' ? '📐 生成技术方案模板'
          : '🔍 生成 CR 记录模板')
        : selectedFile
          ? `📄 ${selectedFile.name}`
          : '';

      return h('div', { className: 'dv-root' },
        // ── Top bar ──
        h(TopBar, {
          docsDir,
          currentWorkspace: workspace,
          currentReq: selectedReq,
          onEditDocsDir: onConfigChange,
          onChangeWorkspace: () => setShowWorkspaceModal(true),
          onChangeReq: () => setShowReqDirModal(true),
        }),

        h('div', { className: 'dv-three-zone', ref: threeZoneRef },
          // ── Left: Rail toolbar ──
          h('div', { className: 'dv-rail' },
            topButtons.map(btn =>
              h('button', {
                key: btn.id,
                className: `dv-rail-btn${activePanel === btn.id ? ' active' : ''}`,
                onClick: () => {
                  if (btn.isDropdown) {
                    setShowDocDropdown(true);
                  } else {
                    setActivePanel(activePanel === btn.id ? null : btn.id);
                  }
                },
              },
                h('span', null, btn.icon),
                h('span', { className: 'dv-rail-label' }, btn.label)
              )
            ),
            h('div', { className: 'dv-rail-sep' }),
            templateButtons.map(btn =>
              h('button', {
                key: btn.id,
                className: `dv-rail-btn${activePanel === btn.id ? ' active' : ''}`,
                onClick: () => setActivePanel(activePanel === btn.id ? null : btn.id),
              },
                h('span', null, btn.icon),
                h('span', { className: 'dv-rail-label' }, btn.label)
              )
            ),
            h('div', { className: 'dv-rail-bottom' })
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
          onSelect: onSelectWorkspace,
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
        })
      );
    }

    // ─── Workspace selector sidebar ──────────────────────────────────
    function WorkspaceSidebar({ workspaces, docsDir, selected, onSelect, onEditDocsDir }) {
      const [editing, setEditing] = useState(false);
      const [tempDir, setTempDir] = useState(docsDir);

      useEffect(() => { setTempDir(docsDir); }, [docsDir]);

      const handleSaveDir = async () => {
        const newDir = tempDir.trim() || 'docs';
        try {
          const res = await fetch(`${ROUTE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docsDir: newDir }),
          });
          if (res.ok) { setEditing(false); onEditDocsDir(); }
        } catch { /* ignore */ }
      };

      return h('div', {
        style: {
          borderRight: '1px solid var(--dsw-alias-border-l1)',
          overflowY: 'auto', padding: '12px 10px',
          background: 'var(--dsw-specific-sidebar-fill)',
          width: 200, flexShrink: 0,
        }
      },
        h('div', { style: { marginBottom: 16 } },
          h('div', {
            style: {
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--dsw-alias-label-secondary)',
              marginBottom: 6, padding: '0 6px',
            }
          }, '📁 Docs Directory'),
          editing
            ? h('div', { style: { display: 'flex', gap: 4, padding: '0 6px', alignItems: 'center' } },
                h('input', {
                  type: 'text', value: tempDir,
                  onChange: e => setTempDir(e.target.value),
                  onKeyDown: e => { if (e.key === 'Enter') handleSaveDir(); if (e.key === 'Escape') { setTempDir(docsDir); setEditing(false); } },
                  style: {
                    flex: 1, padding: '6px 8px', fontSize: 12,
                    border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 4,
                    background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)',
                    fontFamily: 'monospace', outline: 'none',
                  },
                  autoFocus: true,
                }),
                h('button', { onClick: handleSaveDir, className: 'dv-btn', style: { padding: '6px 12px', fontSize: 11 } }, 'Save')
              )
            : h('div', {
                style: {
                  padding: '6px 8px', fontSize: 12, fontFamily: 'monospace',
                  color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
                  borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                },
                onClick: () => setEditing(true),
              },
                h('span', null, docsDir),
                h('span', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)' } }, 'Edit')
              )
        ),
        workspaces.map(w =>
          h('div', { key: w.id, style: { marginBottom: 12 } },
            h('div', {
              style: {
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--dsw-alias-label-secondary)',
                marginBottom: 6, padding: '0 6px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              },
              title: w.title || w.id,
            }, w.title || w.id),
            h('button', {
              className: `dv-btn${selected?.id === w.id ? ' dv-btn-primary' : ''}`,
              style: { width: '100%', justifyContent: 'center', fontSize: 11, padding: '5px 0' },
              onClick: () => onSelect(w),
            }, '📂 打开')
          )
        )
      );
    }

    // ─── Tab body wrapper ────────────────────────────────────────────
    function TabBodyWrapper() {
      const [workspaces, setWorkspaces] = useState([]);
      const [docsDir, setDocsDir] = useState('docs');
      const [selectedWs, setSelectedWs] = useState(null);

      const loadConfig = () => {
        fetch(`${ROUTE}/config?t=${Date.now()}`, { cache: 'no-cache', headers: { 'Cache-Control': 'no-cache' } })
          .then(res => res.ok ? res.json() : null)
          .then(config => { if (config?.docsDir) setDocsDir(config.docsDir); })
          .catch(() => {});
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
              if (data.length > 0) setSelectedWs(data[0]);
            }
          } catch { /* ignore */ }
        })();
        loadConfig();
        return () => { cancelled = true; };
      }, []);

      useEffect(() => {
        const onFocus = () => loadConfig();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
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
          onConfigChange: loadConfig,
          workspaces,
          onSelectWorkspace: setSelectedWs,
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

        return () => { for (const d of disposers) d(); };
      },
    };
  },
});
