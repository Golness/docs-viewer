'use strict';

/**
 * Parse git branch name to extract developer, date, and title
 * Format: <developer>/<date>-<title> or <developer>/<title>
 */
function parseBranchName(branch) {
  if (!branch || typeof branch !== 'string') {
    return { developer: null, date: null, title: branch };
  }

  const parts = branch.split('/');
  if (parts.length < 2) {
    return { developer: null, date: null, title: branch };
  }

  const developer = parts[0];
  const rest = parts.slice(1).join('/');

  // Try to extract date (YYYYMMDD or YYYY-MM-DD)
  const dateMatch = rest.match(/^(\d{4}-?\d{2}-?\d{2})[-_](.+)$/);
  if (dateMatch) {
    return {
      developer,
      date: dateMatch[1].replace(/-/g, ''),
      title: dateMatch[2],
    };
  }

  return { developer, date: null, title: rest };
}

module.exports = { parseBranchName };
