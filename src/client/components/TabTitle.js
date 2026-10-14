'use strict';

const React = require('react');
const h = React.createElement;
const { createIconComponents } = require('../icons.js');
const { IconClipboard } = createIconComponents(h);

function TabTitle() {
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, role: 'tab' },
    h(IconClipboard, { size: 14 }), ' Req Hub'
  );
}

module.exports = { TabTitle };
