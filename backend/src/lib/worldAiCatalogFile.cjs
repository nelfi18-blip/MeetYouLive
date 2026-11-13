"use strict";

const fs = require("fs");
const { createWorldAiSceneCatalog } = require("./worldAiSceneCatalog.cjs");

// Render secret file: never commit provider URLs/rights evidence or
// user-derived content to GitHub. Must be installed by an authenticated owner.
// This path is fixed: user requests and arbitrary environment paths are ignored.
const SECRET_FILE = "/etc/secrets/world-ai-scenes.json";
const MAX_CATALOG_BYTES = 1024 * 1024;

/**
 * Enables a catalog only on the isolated World Test backend after the operator
 * explicitly installs a reviewed secret file. No valid file = no AI joins.
 * Disabled mode requires zero secrets and performs zero I/O.
 */
function loadWorldAiSceneCatalog(env, io = fs) {
  if (env.WORLD_TEST_MODE !== "isolated") {
    throw new Error("World AI catalog: isolated test server required");
  }
  const enabled = env.WORLD_TEST_AI_ASSETS_ENABLED;
  if (enabled === undefined || enabled === "") return createWorldAiSceneCatalog();
  if (enabled !== "true") {
    throw new Error("World AI catalog: invalid enable flag");
  }
  let parsed;
  try {
    const info = io.statSync(SECRET_FILE);
    if (!info.isFile() || info.size < 2 || info.size > MAX_CATALOG_BYTES) {
      throw new Error("invalid catalog file size");
    }
    parsed = JSON.parse(io.readFileSync(SECRET_FILE, "utf8"));
  } catch {
    // Fail closed and do not display secret file contents or URLs in errors.
    throw new Error("World AI catalog: reviewed secret file unavailable");
  }
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.scenes) ||
      !Array.isArray(parsed.approvedHosts) || parsed.scenes.length === 0) {
    throw new Error("World AI catalog: approved scene records required");
  }
  return createWorldAiSceneCatalog(parsed.scenes, { approvedHosts: parsed.approvedHosts });
}

module.exports = { loadWorldAiSceneCatalog, SECRET_FILE };
