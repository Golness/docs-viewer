'use strict';

function getDocIcon(type) {
  const icons = {
    'prd': '📋',
    'tech': '🔧',
    'api': '🔌',
    'test': '🧪',
    'default': '📄',
  };
  return icons[type] || icons.default;
}

module.exports = { getDocIcon };
