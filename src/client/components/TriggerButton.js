'use strict';

const React = require('react');
const h = React.createElement;
const { useState, useEffect, useRef } = React;
const { ROUTE } = require('../constants.js');

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

module.exports = { TriggerButton };
