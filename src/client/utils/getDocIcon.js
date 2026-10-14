'use strict';

const React = require('react');
const h = React.createElement;
const { createIconComponents } = require('../icons.js');

const { IconClipboard, IconDesign, IconSearch, IconFile } = createIconComponents(h);

function getDocIcon(type, size) {
  const iconMap = {
    requirement: IconClipboard,
    design: IconDesign,
    cr: IconSearch,
    other: IconFile,
    prd: IconClipboard,
    tech: IconDesign,
    api: IconSearch,
    test: IconFile,
  };
  const Icon = iconMap[type] || IconFile;
  return h(Icon, { size: size || 14 });
}

module.exports = { getDocIcon };
