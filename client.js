window.__ModuleLoader__.load({
  id: '@local/docs-viewer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useLayoutEffect, useRef } = React;

    const ROUTE = '/docs-viewer';
    const TAB_KIND = 'docs-viewer';
    const TAB_ID = '@local/docs-viewer';

    // Script IDs
    const MARKED_SCRIPT_ID = 'docs-viewer-marked';
    const MERMAID_SCRIPT_ID = 'docs-viewer-mermaid';

    // Custom hook for loading external scripts with proper cleanup
    function useScript(src, id, globalName) {
      const [loaded, setLoaded] = useState(false);
      const [error, setError] = useState(false);

      useEffect(() => {
        // Check if already loaded
        if (window[globalName]) {
          setLoaded(true);
          return;
        }

        // Check if script tag exists
        let script = document.getElementById(id);
        if (script) {
          // Script tag exists, poll for completion
          const checkInterval = setInterval(() => {
            if (window[globalName]) {
              clearInterval(checkInterval);
              setLoaded(true);
            }
          }, 100);
          const timeout = setTimeout(() => {
            clearInterval(checkInterval);
            setError(true);
          }, 5000);
          return () => {
            clearInterval(checkInterval);
            clearTimeout(timeout);
          };
        }

        // Create new script tag
        script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onload = () => setLoaded(true);
        script.onerror = () => setError(true);
        document.head.appendChild(script);
      }, [src, id, globalName]);

      return { loaded, error };
    }

    // Detect current theme for mermaid
    function getMermaidTheme() {
      const isDarkMode = document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      return isDarkMode ? 'dark' : 'default';
    }

    // Sanitize HTML to prevent XSS
    function sanitizeHtml(html) {
      // Remove script tags and their content
      let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // Remove event handlers (onclick, onerror, onload, etc.)
      clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      
      // Remove javascript: and vbscript: URLs
      clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '');
      clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"vbscript:[^"]*"|'vbscript:[^']*'|vbscript:[^\s>]+)/gi, '');
      
      // Remove data: URLs in src attributes (can execute scripts)
      clean = clean.replace(/\ssrc\s*=\s*(?:"data:[^"]*"|'data:[^']*'|data:[^\s>]+)/gi, '');
      
      return clean;
    }

    // Merge all styles into one injection
    const STYLE_ID = 'docs-viewer-styles';

    // Inject all styles at once
    if (!document.getElementById(STYLE_ID)) {
      const el = document.createElement('style');
      el.id = STYLE_ID;
      el.textContent = `
        /* ── Markdown rendering ── */
        .dv-markdown {
          line-height: 1.6;
          color: var(--dsw-alias-label-primary);
        }
        .dv-markdown h1, .dv-markdown h2, .dv-markdown h3,
        .dv-markdown h4, .dv-markdown h5, .dv-markdown h6 {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: 600;
          color: var(--dsw-alias-label-primary);
        }
        .dv-markdown h1 { font-size: 1.8em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 0.3em; }
        .dv-markdown h2 { font-size: 1.5em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 0.3em; }
        .dv-markdown h3 { font-size: 1.25em; }
        .dv-markdown h4 { font-size: 1.1em; }
        .dv-markdown p { margin: 0.8em 0; }
        .dv-markdown ul, .dv-markdown ol {
          margin: 0.8em 0;
          padding-left: 2em;
        }
        .dv-markdown li { margin: 0.3em 0; }
        .dv-markdown code {
          background: var(--dsw-alias-bg-layer-2);
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.9em;
        }
        .dv-markdown pre {
          background: var(--dsw-alias-bg-layer-2);
          padding: 1em;
          border-radius: 6px;
          overflow-x: auto;
          margin: 1em 0;
        }
        .dv-markdown pre code {
          background: transparent;
          padding: 0;
        }
        .dv-markdown blockquote {
          margin: 1em 0;
          padding: 0.5em 1em;
          border-left: 4px solid var(--dsw-alias-brand-primary);
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-secondary);
        }
        .dv-markdown a {
          color: var(--dsw-alias-brand-primary);
          text-decoration: none;
        }
        .dv-markdown a:hover {
          text-decoration: underline;
        }
        .dv-markdown table {
          border-collapse: collapse;
          margin: 1em 0;
          width: 100%;
        }
        .dv-markdown th, .dv-markdown td {
          border: 1px solid var(--dsw-alias-border-l1);
          padding: 0.5em;
          text-align: left;
        }
        .dv-markdown th {
          background: var(--dsw-alias-bg-layer-2);
          font-weight: 600;
        }
        .dv-markdown img {
          max-width: 100%;
          height: auto;
        }
        .dv-markdown hr {
          border: none;
          border-top: 1px solid var(--dsw-alias-border-l1);
          margin: 2em 0;
        }
        .dv-markdown .mermaid-diagram {
          margin: 1.5em 0;
          text-align: center;
          overflow-x: auto;
        }
        .dv-markdown .mermaid-diagram svg {
          max-width: 100%;
          height: auto;
        }
        .dv-markdown code.language-mermaid {
          display: block;
          background: var(--dsw-alias-bg-layer-2);
          padding: 1em;
          border-radius: 6px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.85em;
          white-space: pre;
          overflow-x: auto;
        }

        /* ── Main UI styles ── */
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
        .dv-trigger-rail {
          flex: none; width: 36px; height: 36px;
          justify-content: center; gap: 0; padding: 0; margin: 0;
        }

        /* ── root & layout ── */
        .dv-root {
          display: flex; flex-direction: column; height: 100%; overflow: hidden;
          background: var(--dsw-alias-bg-base);
        }
        .dv-layout {
          display: grid; grid-template-columns: 220px 1fr; flex: 1; overflow: hidden;
        }

        /* ── left sidebar (workspace picker) ── */
        .dv-sidebar {
          border-right: 1px solid var(--dsw-alias-border-l1);
          overflow-y: auto; padding: 12px 10px;
          background: var(--dsw-specific-sidebar-fill);
        }
        .dv-sidebar::-webkit-scrollbar { width: 4px; }
        .dv-sidebar::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 4px; }

        .dv-ws-group { margin-bottom: 16px; }
        .dv-ws-name {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--dsw-alias-label-secondary);
          margin-bottom: 6px; padding: 0 6px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .dv-ws-btns { display: flex; gap: 4px; }
        .dv-type-btn {
          flex: 1; border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 6px; padding: 5px 0; cursor: pointer;
          font-size: 11px; font-weight: 600; text-align: center;
          transition: all 0.15s;
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-label-secondary);
        }
        .dv-type-btn:hover {
          background: var(--dsw-alias-bg-layer-1);
          color: var(--dsw-alias-label-primary);
        }
        .dv-type-btn.active {
          background: var(--dsw-alias-bg-layer-1);
          color: var(--dsw-alias-brand-primary);
          border-color: var(--dsw-alias-brand-primary);
        }

        /* ── content area ── */
        .dv-content { overflow-y: auto; padding: 16px; }
        .dv-content::-webkit-scrollbar { width: 6px; }
        .dv-content::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 4px; }

        .dv-content-header {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-secondary);
          margin-bottom: 12px; padding-bottom: 10px;
          border-bottom: 1px solid var(--dsw-alias-border-l1);
        }
        .dv-content-header::before {
          content: ''; display: inline-block; width: 3px; height: 14px;
          background: var(--dsw-alias-brand-primary); border-radius: 2px;
        }

        /* ── empty state ── */
        .dv-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 100%; min-height: 160px; gap: 8px;
          color: var(--dsw-alias-label-secondary); font-size: 13px;
        }
        .dv-empty-icon { font-size: 32px; opacity: 0.4; margin-bottom: 4px; }

        /* ── file list ── */
        .dv-file-list { display: flex; flex-direction: column; gap: 2px; }
        .dv-file-item {
          width: 100%; text-align: left; background: transparent;
          border: 1px solid transparent; border-radius: 8px;
          padding: 8px 12px; color: inherit; cursor: pointer;
          display: flex; justify-content: space-between; align-items: center; gap: 10px;
          transition: all 0.12s; font-size: 12px;
        }
        .dv-file-item:hover {
          background: var(--dsw-alias-bg-layer-2);
          border-color: var(--dsw-alias-border-l1);
        }
        .dv-file-item:active { transform: scale(0.99); }
        .dv-file-icon {
          flex-shrink: 0; width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 6px; font-size: 13px;
        }
        .dv-file-icon-md {
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-brand-primary);
        }
        .dv-file-icon-html {
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-state-success-primary);
        }
        .dv-file-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
        .dv-file-path {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          color: var(--dsw-alias-label-primary);
        }
        .dv-file-meta {
          font-size: 10px; color: var(--dsw-alias-label-secondary);
          display: flex; gap: 8px;
        }

        /* ── preview ── */
        .dv-preview-container { display: flex; flex-direction: column; height: 100%; }
        .dv-preview-header {
          padding: 8px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1);
          display: flex; align-items: center; gap: 10px; flex-shrink: 0;
          background: var(--dsw-alias-bg-layer-1);
        }
        .dv-preview-back {
          background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 6px; padding: 4px 12px; cursor: pointer; color: inherit; font-size: 11px;
          transition: all 0.12s; display: flex; align-items: center; gap: 4px;
        }
        .dv-preview-back:hover { background: var(--dsw-alias-bg-layer-1); }
        .dv-preview-name {
          font-size: 12px; font-weight: 500;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: var(--dsw-alias-label-primary);
        }
        .dv-preview-body { flex: 1; overflow: auto; padding: 16px; }
        .dv-preview-body::-webkit-scrollbar { width: 6px; }
        .dv-preview-body::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 4px; }
        .dv-preview-pre {
          white-space: pre-wrap; word-break: break-word;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px; line-height: 1.7; margin: 0;
          color: var(--dsw-alias-label-primary);
        }
        .dv-preview-iframe { width: 100%; height: 100%; border: none; background: #fff; border-radius: 6px; }

        /* ── misc ── */
        .dv-error { color: var(--dsw-alias-state-error-primary); }
        .dv-loading {
          display: flex; align-items: center; justify-content: center;
          height: 160px; color: var(--dsw-alias-label-secondary);
        }
        .dv-spinner {
          width: 18px; height: 18px;
          border: 2px solid var(--dsw-alias-border-l1);
          border-top-color: var(--dsw-alias-brand-primary);
          border-radius: 50%; animation: dv-spin 0.6s linear infinite; margin-right: 8px;
        }
        @keyframes dv-spin { to { transform: rotate(360deg) } }

        /* ── badge pill ── */
        .dv-badge {
          display: inline-flex; align-items: center; gap: 3px;
          padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600;
        }
        .dv-badge-md {
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-brand-primary);
        }
        .dv-badge-html {
          background: var(--dsw-alias-bg-layer-2);
          color: var(--dsw-alias-state-success-primary);
        }

        /* ── tooltip (floating popup) ── */
        .dv-tooltip {
          min-width: 180px;
          max-width: 280px;
          overflow-y: auto;
          padding: 8px 0;
          background: var(--dsw-alias-bg-overlay);
          border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          font-size: 13px;
          color: var(--dsw-alias-label-primary);
        }
        .dv-tooltip-title {
          padding: 0 12px 6px;
          font-size: 11px;
          font-weight: 600;
          color: var(--dsw-alias-label-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .dv-tooltip-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 12px;
          gap: 12px;
        }
        .dv-tooltip-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .dv-tooltip-counts {
          font-size: 12px;
          color: var(--dsw-alias-label-secondary);
          white-space: nowrap;
          flex-shrink: 0;
        }
      `;
      document.head.appendChild(el);
    }

    function Spinner() {
      return h('div', { className: 'dv-loading' }, h('div', { className: 'dv-spinner' }), 'Loading\u2026');
    }

    function FilePreview({ workspaceId, relPath, name, onBack }) {
      const [text, setText] = useState('');
      const [error, setError] = useState(null);
      const [rendered, setRendered] = useState('');
      const markdownRef = useRef(null);
      const mermaidInitRef = useRef(false);
      const mermaidRenderIdRef = useRef(0);
      const isHtml = /\.html?$/i.test(name);
      const isMd = /\.md$/i.test(name);

      // Load external scripts via shared hook
      const { loaded: markedLoaded } = useScript(
        'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
        MARKED_SCRIPT_ID,
        'marked',
      );
      const { loaded: mermaidLoaded } = useScript(
        'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js',
        MERMAID_SCRIPT_ID,
        'mermaid',
      );

      // Load file content
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

      // Initialize mermaid once when it becomes ready (not on every text change)
      useEffect(() => {
        if (mermaidLoaded && window.mermaid && !mermaidInitRef.current) {
          mermaidInitRef.current = true;
          window.mermaid.initialize({
            startOnLoad: false,
            theme: getMermaidTheme(),
            securityLevel: 'strict',
          });
        }
      }, [mermaidLoaded]);

      // Watch for theme changes and re-render mermaid diagrams
      useEffect(() => {
        if (!mermaidInitRef.current || !window.mermaid || !rendered) return;

        const observer = new MutationObserver(() => {
          const newTheme = getMermaidTheme();
          window.mermaid.initialize({
            startOnLoad: false,
            theme: newTheme,
            securityLevel: 'strict',
          });
          // Force re-render of mermaid diagrams by clearing and re-rendering
          if (markdownRef.current) {
            const mermaidDivs = markdownRef.current.querySelectorAll('.mermaid-diagram');
            mermaidDivs.forEach(div => {
              const originalCode = div.getAttribute('data-mermaid-code');
              if (originalCode) {
                const id = `mermaid-rerender-${Date.now()}-${Math.random()}`;
                window.mermaid.render(id, originalCode).then(({ svg }) => {
                  div.innerHTML = svg;
                }).catch(() => {});
              }
            });
          }
        });

        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'data-theme'],
        });

        return () => observer.disconnect();
      }, [rendered]);

      // Render markdown when marked is ready and text is available
      useEffect(() => {
        if (!isMd || !text) {
          setRendered('');
          return;
        }
        if (markedLoaded && window.marked) {
          const html = window.marked.parse(text);
          setRendered(sanitizeHtml(html));
        }
      }, [text, isMd, markedLoaded]);

      // Render mermaid diagrams after DOM is committed (useLayoutEffect to avoid stale DOM)
      useLayoutEffect(() => {
        if (!mermaidInitRef.current || !rendered || !markdownRef.current) return;

        const mermaidBlocks = markdownRef.current.querySelectorAll('code.language-mermaid');
        if (mermaidBlocks.length === 0) return;

        // Increment render ID to ensure uniqueness across file switches
        mermaidRenderIdRef.current++;
        const renderPrefix = `mermaid-${mermaidRenderIdRef.current}`;

        mermaidBlocks.forEach(async (block, index) => {
          const pre = block.parentElement;
          const code = block.textContent;
          const id = `${renderPrefix}-${index}`;

          try {
            const { svg } = await window.mermaid.render(id, code);
            const div = document.createElement('div');
            div.className = 'mermaid-diagram';
            div.setAttribute('data-mermaid-code', code); // Store original code for theme change re-render
            div.innerHTML = svg;
            pre.replaceWith(div);
          } catch (e) {
            // Keep the original code block if rendering fails
          }
        });
      }, [rendered]);

      return h('div', { className: 'dv-preview-container' },
        h('div', { className: 'dv-preview-header' },
          h('button', { className: 'dv-preview-back', onClick: onBack },
            h('span', null, '\u2190'),
            ' Back',
          ),
          h('span', { className: 'dv-preview-name' }, name),
          h('span', { className: isHtml ? 'dv-badge dv-badge-html' : 'dv-badge dv-badge-md' },
            isHtml ? 'HTML' : 'MD',
          ),
        ),
        h('div', { className: 'dv-preview-body' },
          error ? h('span', { className: 'dv-error' }, 'Error: ', error)
            : isHtml
              ? h('iframe', { srcDoc: text, title: name, className: 'dv-preview-iframe', sandbox: 'allow-scripts' })
              : isMd
                ? (markedLoaded && rendered)
                  ? h('div', {
                      ref: markdownRef,
                      className: 'dv-markdown',
                      dangerouslySetInnerHTML: { __html: rendered }
                    })
                  : h('pre', { className: 'dv-preview-pre' }, text || 'Loading...')
                : h('pre', { className: 'dv-preview-pre' }, text),
        ),
      );
    }

    function FileListPanel({ workspace, ext, docsDir }) {
      const [items, setItems] = useState(null);
      const [error, setError] = useState(null);
      const [open, setOpen] = useState(null);
      const label = ext === '.md' ? 'Markdown' : 'HTML';

      useEffect(() => {
        setItems(null); setError(null); setOpen(null);
        let cancelled = false;
        (async () => {
          try {
            const url = `${ROUTE}/list?workspaceId=${encodeURIComponent(workspace.id)}&ext=${encodeURIComponent(ext)}&t=${Date.now()}`;
            const res = await fetch(url, {
              cache: 'no-cache',
              headers: { 'Cache-Control': 'no-cache' }
            });
            const data = await res.json();
            if (cancelled) return;
            if (!res.ok) setError(data.error || 'list failed');
            else setItems(data);
          } catch (e) {
            if (!cancelled) setError(String(e));
          }
        })();
        return () => { cancelled = true; };
      }, [workspace.id, ext, docsDir]);

      if (open) {
        return h(FilePreview, { workspaceId: workspace.id, relPath: open.relative, name: open.name, onBack: () => setOpen(null) });
      }
      if (error) return h('div', { className: 'dv-empty' }, h('span', { className: 'dv-empty-icon' }, '\u26A0'), h('span', { className: 'dv-error' }, error));
      if (!items) return h(Spinner, null);
      if (!items.exists) return h('div', { className: 'dv-empty' }, h('span', { className: 'dv-empty-icon' }, '\uD83D\uDCC1'), `No ${docsDir}/ directory in this workspace.`);
      if (items.items.length === 0) return h('div', { className: 'dv-empty' }, h('span', { className: 'dv-empty-icon' }, '\uD83D\uDCC4'), `No ${label} files found under ${docsDir}/.`);

      return h('div', null,
        h('div', { className: 'dv-content-header' }, `${items.items.length} ${label} file${items.items.length !== 1 ? 's' : ''} in ${docsDir}/`),
        h('div', { className: 'dv-file-list' },
          items.items.map((it) => {
            const isHtmlFile = /\.html?$/i.test(it.name);
            return h('button', {
              key: it.path,
              className: 'dv-file-item',
              onClick: () => setOpen(it),
              'aria-label': `Open ${it.name}`,
            },
              h('span', { className: isHtmlFile ? 'dv-file-icon dv-file-icon-html' : 'dv-file-icon dv-file-icon-md' },
                isHtmlFile ? '\uD83C\uDF10' : '\uD83D\uDCC4',
              ),
              h('span', { className: 'dv-file-info' },
                h('span', { className: 'dv-file-path' }, it.relative),
                h('span', { className: 'dv-file-meta' },
                  h('span', null, it.size >= 1024 ? `${(it.size / 1024).toFixed(1)} KB` : `${it.size} B`),
                ),
              ),
            );
          }),
        ),
      );
    }

    function DocsViewerBody({ workspaces, docsDir, onConfigChange }) {
      const [selected, setSelected] = useState(null);
      const [editing, setEditing] = useState(false);
      const [tempDir, setTempDir] = useState(docsDir);

      // Update tempDir when docsDir prop changes
      useEffect(() => {
        setTempDir(docsDir);
      }, [docsDir]);

      const handleSaveDir = async () => {
        const newDir = tempDir.trim() || 'docs';
        try {
          const res = await fetch(`${ROUTE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docsDir: newDir }),
          });
          if (res.ok) {
            setEditing(false);
            onConfigChange(); // Refresh config from server
          }
        } catch {
          // Ignore save errors
        }
      };

      return h('div', { className: 'dv-root' },
        h('div', { className: 'dv-layout' },
          h('div', { className: 'dv-sidebar' },
            // Config section
            h('div', { className: 'dv-ws-group' },
              h('div', { className: 'dv-ws-name' }, '📁 Docs Directory'),
              h('div', {
                style: {
                  padding: '0 6px 6px',
                  fontSize: '10px',
                  color: 'var(--dsw-alias-label-secondary)',
                  lineHeight: '1.4',
                },
              }, 'Relative path to docs in each workspace'),
              editing
                ? h('div', { style: { display: 'flex', gap: '4px', padding: '0 6px', alignItems: 'center' } },
                    h('input', {
                      type: 'text',
                      value: tempDir,
                      placeholder: 'e.g. docs, documentation, wiki',
                      onChange: (e) => setTempDir(e.target.value),
                      onKeyDown: (e) => {
                        if (e.key === 'Enter') handleSaveDir();
                        if (e.key === 'Escape') {
                          setTempDir(docsDir);
                          setEditing(false);
                        }
                      },
                      style: {
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '12px',
                        border: '1px solid var(--dsw-alias-border-l1)',
                        borderRadius: '4px',
                        background: 'var(--dsw-alias-bg-layer-2)',
                        color: 'var(--dsw-alias-label-primary)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        outline: 'none',
                      },
                      autoFocus: true,
                    }),
                    h('button', {
                      onClick: handleSaveDir,
                      className: 'dv-type-btn',
                      style: {
                        padding: '6px 12px',
                        fontSize: '11px',
                        flex: 'none',
                      },
                    }, 'Save'),
                  )
                : h('div', {
                    style: {
                      padding: '6px 8px',
                      fontSize: '12px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      color: 'var(--dsw-alias-label-primary)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      transition: 'background 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    },
                    onClick: () => setEditing(true),
                    title: 'Click to change docs directory path',
                    onMouseEnter: (e) => {
                      e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-2)';
                    },
                    onMouseLeave: (e) => {
                      e.currentTarget.style.background = 'transparent';
                    },
                  },
                    h('span', null, docsDir),
                    h('span', {
                      style: {
                        fontSize: '10px',
                        color: 'var(--dsw-alias-label-secondary)',
                      },
                    }, 'Edit'),
                  ),
            ),
            // Workspace list
            workspaces.map((w) =>
              h('div', { key: w.id, className: 'dv-ws-group' },
                h('div', { className: 'dv-ws-name', title: w.title || w.id }, w.title || w.id),
                h('div', { className: 'dv-ws-btns' },
                  h('button', { className: 'dv-type-btn' + (selected?.workspace?.id === w.id && selected?.ext === '.md' ? ' active' : ''), onClick: () => setSelected({ workspace: w, ext: '.md' }) },
                    '\uD83D\uDCC4 MD',
                  ),
                  h('button', { className: 'dv-type-btn' + (selected?.workspace?.id === w.id && selected?.ext === '.html' ? ' active' : ''), onClick: () => setSelected({ workspace: w, ext: '.html' }) },
                    '\uD83C\uDF10 HTML',
                  ),
                ),
              ),
            ),
          ),
          h('div', { className: 'dv-content' },
            !selected
              ? h('div', { className: 'dv-empty' },
                  h('span', { className: 'dv-empty-icon' }, '\uD83D\uDC48'),
                  'Select a workspace and file type, or configure the docs directory above.',
                )
              : h(FileListPanel, { workspace: selected.workspace, ext: selected.ext, docsDir }),
          ),
        ),
      );
    }

    function TabTitle() {
      return h('span', null, '\uD83D\uDCC4 Docs');
    }

    function TriggerButton({ onClick, wide }) {
      const [hovered, setHovered] = useState(false);
      const [stats, setStats] = useState(null);
      const [docsDir, setDocsDir] = useState('docs');
      const [tooltipPos, setTooltipPos] = useState(null);
      const tooltipRef = useRef(null);
      const adjustCountRef = useRef(0);
      const cls = 'dv-trigger' + (wide ? '' : ' dv-trigger-rail');

      const loadConfig = () => {
        fetch(`${ROUTE}/config?t=${Date.now()}`, {
          cache: 'no-cache',
          headers: { 'Cache-Control': 'no-cache' }
        })
          .then(res => res.ok ? res.json() : null)
          .then(config => {
            if (config?.docsDir) setDocsDir(config.docsDir);
          })
          .catch(() => {});
      };

      // Load config on mount and on focus (handles tab reopen)
      useEffect(() => {
        loadConfig();
        window.addEventListener('focus', loadConfig);
        return () => window.removeEventListener('focus', loadConfig);
      }, []);

      // Adjust tooltip position if it overflows the viewport
      useEffect(() => {
        if (!tooltipPos || !tooltipRef.current) return;
        // Prevent infinite loop: max 3 adjustments
        if (adjustCountRef.current >= 3) return;

        const el = tooltipRef.current;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        let newTop = tooltipPos.top;
        let newLeft = tooltipPos.left;

        // If bottom overflows viewport, push up
        if (rect.bottom > vh - 8) {
          newTop = Math.max(8, vh - rect.height - 8);
        }
        // If right overflows viewport, flip to left side of trigger
        if (rect.right > vw - 8) {
          newLeft = tooltipPos.left - rect.width - 16;
        }

        if (newTop !== tooltipPos.top || newLeft !== tooltipPos.left) {
          adjustCountRef.current++;
          setTooltipPos({ top: newTop, left: newLeft });
        }
      }, [tooltipPos, stats]);

      const handleMouseEnter = (e) => {
        setHovered(true);
        adjustCountRef.current = 0;
        // Calculate tooltip position using fixed positioning
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({
          top: rect.top,
          left: rect.right + 8,
        });

        // Fetch stats if not loaded
        if (!stats) {
          fetch(`${ROUTE}/stats`)
            .then(res => {
              if (res.ok) return res.json();
              return null;
            })
            .then(data => {
              if (data) setStats(data);
            })
            .catch(() => {
              // Ignore fetch errors
            });
        }
      };

      const handleMouseLeave = () => {
        setHovered(false);
        setTooltipPos(null);
      };

      // Only show tooltip when hovered and position is calculated
      const showTooltip = hovered && tooltipPos;

      return h('div', { style: { position: 'relative', width: '100%' } },
        h('button', {
          className: cls,
          onClick,
          onMouseEnter: handleMouseEnter,
          onMouseLeave: handleMouseLeave,
          'aria-label': 'Project Documentation',
        },
          h('span', { className: 'dv-trigger-icon' }, '\uD83D\uDCC4'),
          wide && h('span', { className: 'dv-trigger-label' }, 'Docs'),
        ),
        showTooltip && h('div', {
          ref: tooltipRef,
          className: 'dv-tooltip',
          style: {
            position: 'fixed',
            top: tooltipPos.top + 'px',
            left: tooltipPos.left + 'px',
            zIndex: 9999,
            maxHeight: 'calc(100vh - 16px)',
          },
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        },
          h('div', { className: 'dv-tooltip-title' }, `Documentation (${docsDir}/)`),
          !stats
            ? h('div', { className: 'dv-tooltip-row' }, 'Loading...')
            : stats.length === 0
              ? h('div', { className: 'dv-tooltip-row' }, 'No workspaces')
              : stats.map((s) =>
                  h('div', { key: s.workspaceId, className: 'dv-tooltip-row' },
                    h('span', { className: 'dv-tooltip-name' }, s.title),
                    h('span', { className: 'dv-tooltip-counts' },
                      s.exists
                        ? `${s.mdCount} MD, ${s.htmlCount} HTML`
                        : `No ${docsDir}/`
                    ),
                  )
                ),
        ),
      );
    }

    function TabBodyWrapper() {
      const [workspaces, setWorkspaces] = useState([]);
      const [docsDir, setDocsDir] = useState('docs');

      const loadConfig = () => {
        fetch(`${ROUTE}/config?t=${Date.now()}`, {
          cache: 'no-cache',
          headers: { 'Cache-Control': 'no-cache' }
        })
          .then(res => res.ok ? res.json() : null)
          .then(config => {
            if (config?.docsDir) setDocsDir(config.docsDir);
          })
          .catch(() => {});
      };

      // Load workspaces and config on mount
      useEffect(() => {
        let cancelled = false;
        const load = async () => {
          try {
            const res = await fetch(`${ROUTE}/workspaces`);
            if (!res.ok) return;
            const data = await res.json();
            if (!cancelled && Array.isArray(data)) setWorkspaces(data);
          } catch {
            // Ignore fetch errors
          }
        };
        load();
        loadConfig();
        const id = window.setInterval(load, 60000);
        return () => { cancelled = true; window.clearInterval(id); };
      }, []);

      // Refresh config when window regains focus (handles tab reopen)
      useEffect(() => {
        const onFocus = () => loadConfig();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
      }, []);

      if (!workspaces.length) {
        return h('div', { className: 'dv-empty' }, 'No workspaces available');
      }

      return h(DocsViewerBody, { workspaces, docsDir, onConfigChange: loadConfig });
    }

    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'layout'],
      apply(ctx) {
        const disposers = [];

        // Register tab type
        disposers.push(ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          multiple: false,
          priority: 'user',
          title: () => 'Project Documentation',
        }));

        // Register tab body
        disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
        }, TabBodyWrapper)));

        // Register tab title
        disposers.push(ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_ID,
        }, TabTitle)));

        // Add trigger button to sidebar footer
        disposers.push(ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'docs-viewer-trigger',
          order: 10,
          label: 'Project Documentation',
        }, ({ wide }) => {
          const handleClick = () => {
            ctx.layout.openRightbar(true, false);
            ctx.sidebarRight.openTab(TAB_KIND);
          };

          return h(TriggerButton, { onClick: handleClick, wide });
        })));

        return () => {
          for (const dispose of disposers) dispose();
        };
      },
    };
  },
});
