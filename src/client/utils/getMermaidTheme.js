'use strict';

function getMermaidTheme() {
  const isDarkMode = document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDarkMode ? 'dark' : 'default';
}

module.exports = { getMermaidTheme };
