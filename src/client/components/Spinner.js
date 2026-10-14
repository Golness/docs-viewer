'use strict';

const React = require('react');
const h = React.createElement;

function Spinner() {
  return h('div', { className: 'dv-loading' }, h('div', { className: 'dv-spinner' }), 'Loading…');
}

module.exports = { Spinner };
