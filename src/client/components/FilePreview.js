'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect, useLayoutEffect, useRef } = React;

const { ROUTE, MARKED_SCRIPT_ID, MERMAID_SCRIPT_ID, HIGHLIGHT_SCRIPT_ID } = require('../constants.js');
const { useScript } = require('../hooks/useScript.js');
const { getMermaidTheme } = require('../utils/getMermaidTheme.js');
const { sanitizeHtml } = require('../utils/sanitizeHtml.js');

// ─── Helpers ─────────────────────────────────────────────────────
function getDocIcon(type) {
  const icons = { requirement: '📋', design: '📐', cr: '🔍', other: '📄' };
  return icons[type] || '📄';
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
    if (!document.getElementById('req-hub-hljs-css')) {
      const link = document.createElement('link');
      link.id = 'req-hub-hljs-css';
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

module.exports = { FilePreview };
