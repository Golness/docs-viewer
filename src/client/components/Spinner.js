'use strict';

const React = require('react');
const h = React.createElement;

function Spinner() {
  return h('div', { className: 'rh-loading', role: 'status', 'aria-label': 'Loading' }, h('div', { className: 'rh-spinner' }), 'Loading…');
}

module.exports = { Spinner };
