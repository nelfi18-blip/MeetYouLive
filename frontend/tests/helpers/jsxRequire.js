// CommonJS helper that lets plain `node:test` files `require()` real .jsx
// component source files and render them with react-dom/server, without
// adding any new test-framework dependency.
//
// It reuses the SWC compiler already bundled with Next.js (next/dist/build/swc)
// to strip JSX, resolves the project's "@/*" path alias, and stubs
// "next/link" (an anchor is enough for server rendering/markup assertions).
"use strict";

const Module = require("module");
const path = require("path");
const fs = require("fs");
const swc = require("next/dist/build/swc");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function compile(filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { code } = swc.transformSync(source, {
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      target: "es2020",
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
    filename,
  });
  return code;
}

const originalResolveFilename = Module._resolveFilename;

function patchedResolveFilename(request, parent, isMain, options) {
  if (request === "next/link") {
    return path.join(__dirname, "stubs", "next-link.js");
  }
  if (request.startsWith("@/")) {
    const resolved = path.join(PROJECT_ROOT, request.slice(2));
    for (const candidate of [resolved, `${resolved}.js`, `${resolved}.jsx`]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
}

let installed = false;

/**
 * Install the .jsx require hook + alias/stub resolution (idempotent).
 */
function installJsxRequireHook() {
  if (installed) return;
  installed = true;
  Module._resolveFilename = patchedResolveFilename;
  Module._extensions[".jsx"] = function (module, filename) {
    const code = compile(filename);
    module._compile(code, filename);
  };
}

/**
 * Require a .jsx component file (absolute or project-root-relative path)
 * with JSX stripped by SWC, returning its default export.
 */
function requireJsx(absolutePath) {
  installJsxRequireHook();
  delete require.cache[require.resolve(absolutePath)];
  const mod = require(absolutePath);
  return mod.default || mod;
}

module.exports = { installJsxRequireHook, requireJsx };
