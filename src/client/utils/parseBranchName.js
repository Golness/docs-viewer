'use strict';

/**
 * Parse git branch name to extract developer, date, and title
 * Supported formats:
 * - feature/<developer>/<date>-<title> (e.g., feature/lihanping/2026-10-10-包材报价管理)
 * - <developer>/<date>-<title> (e.g., lihanping/2026-10-10-包材报价管理)
 * - <developer>/<title> (e.g., lihanping/包材报价管理)
 */
function parseBranchName(branch) {
  if (!branch || typeof branch !== 'string') {
    return { developer: null, date: null, title: branch };
  }

  const parts = branch.split('/');

  // Handle feature/<developer>/<date>-<title> format
  if (parts.length >= 3 && parts[0] === 'feature') {
    const developer = parts[1];
    const rest = parts.slice(2).join('/');

    // Try to extract date (YYYY-MM-DD or YYYYMMDD)
    const dateMatch = rest.match(/^(\d{4}-?\d{2}-?\d{2})[-_](.+)$/);
    if (dateMatch) {
      const date = dateMatch[1].replace(/-/g, '');
      const title = dateMatch[2];
      // requirementId format: YYYY-MM-DD-title
      const requirementId = `${dateMatch[1]}-${title}`;
      return {
        developer,
        date,
        title,
        requirementId,
      };
    }

    return { developer, date: null, title: rest, requirementId: rest };
  }

  // Handle <developer>/<date>-<title> format
  if (parts.length >= 2) {
    const developer = parts[0];
    const rest = parts.slice(1).join('/');

    // Try to extract date (YYYY-MM-DD or YYYYMMDD)
    const dateMatch = rest.match(/^(\d{4}-?\d{2}-?\d{2})[-_](.+)$/);
    if (dateMatch) {
      const date = dateMatch[1].replace(/-/g, '');
      const title = dateMatch[2];
      // requirementId format: YYYY-MM-DD-title
      const requirementId = `${dateMatch[1]}-${title}`;
      return {
        developer,
        date,
        title,
        requirementId,
      };
    }

    return { developer, date: null, title: rest, requirementId: rest };
  }

  return { developer: null, date: null, title: branch };
}

module.exports = { parseBranchName };
