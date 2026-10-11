// Minimal stand-in for next/link used only when rendering components in
// node:test with react-dom/server. Real client-side navigation behavior is
// irrelevant for the markup/exception assertions these tests perform.
"use strict";

const React = require("react");

function Link({ href, children, ...rest }) {
  return React.createElement("a", { href, ...rest }, children);
}

module.exports = Link;
module.exports.default = Link;
