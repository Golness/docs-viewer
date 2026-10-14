'use strict';

const React = require('react');

// React Context for cross-component communication
const DocsViewerContext = React.createContext({
  refreshTree: () => {},
  refreshSelectedReq: () => {},
});

module.exports = { DocsViewerContext };
