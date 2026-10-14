'use strict';

const React = require('react');
const { useState, useEffect } = React;

/**
 * Hook to lazy-load external scripts (mermaid, hljs, etc.)
 */
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

module.exports = { useScript };
