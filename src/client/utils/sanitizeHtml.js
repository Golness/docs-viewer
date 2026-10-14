'use strict';

function sanitizeHtml(html) {
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '');
  clean = clean.replace(/(?:href|src|action)\s*=\s*(?:"vbscript:[^"]*"|'vbscript:[^']*'|vbscript:[^\s>]+)/gi, '');
  clean = clean.replace(/\ssrc\s*=\s*(?:"data:[^"]*"|'data:[^']*'|data:[^\s>]+)/gi, '');
  return clean;
}

module.exports = { sanitizeHtml };
