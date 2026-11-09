"use strict";

// Manual, offline preflight for ALREADY ACQUIRED licensed Marble assets.
// No generation, API calls, paid usage, environment changes, or deployment.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { createWorldAiSceneCatalog } = require("../src/lib/worldAiSceneCatalog.cjs");

const MAX_SPZ = 24 * 1024 * 1024;
const MAX_GLB = 32 * 1024 * 1024;
const MAX_REQUEST = 1024 * 1024;
const REVIEW_KEYS = ["ownerApproved", "commercialRightsApproved",
  "assetDeliveryApproved", "privacyReviewed"];
const REQUIRED_EVIDENCE = ["licenseReference", "assetReviewReference", "privacyReviewReference"];

function refuse(condition, message) {
  if (!condition) throw new Error("World AI import: " + message);
}

function verifiedFile(source, maxBytes, extension) {
  refuse(typeof source === "string" && path.isAbsolute(source) &&
    path.extname(source).toLowerCase() === extension,
  "local file of required format missing");
  const stat = fs.statSync(source);
  refuse(stat.isFile() && stat.size >= 20 && stat.size <= maxBytes,
    "local file missing, empty or exceeds the mobile budget");
  return fs.readFileSync(source);
}

async function prepareWorldAiCatalog(request) {
  refuse(request && typeof request === "object" && !Array.isArray(request) &&
    request.schemaVersion === 1 && request.provider === "worldlabs-marble",
  "approved Marble import request required");
  refuse(request.review && REVIEW_KEYS.every((key) => request.review[key] === true),
    "owner, commercial rights, asset and privacy approvals are required");
  refuse(request.evidence && REQUIRED_EVIDENCE.every((key) =>
    typeof request.evidence[key] === "string" &&
    request.evidence[key].trim().length >= 8 &&
    request.evidence[key].length <= 2048),
  "review evidence references are required");
  refuse(Array.isArray(request.approvedHosts) && request.approvedHosts.length > 0,
    "approved asset host allowlist required");
  refuse(request.navigation && typeof request.navigation === "object",
    "reviewed collider-derived navigation grid required");
  // Verify local bytes: never accept hashes claimed by a browser or API response.
  const splatBytes = verifiedFile(request.spzFile, MAX_SPZ, ".spz");
  const colliderBytes = verifiedFile(request.glbFile, MAX_GLB, ".glb");
  // Reuse the exact frontend GLB metadata validator instead of a weaker copy.
  const validatorUrl = pathToFileURL(path.resolve(__dirname,
    "../../frontend/lib/vcr/aiWorldCollider.mjs"));
  const { validateMarbleColliderGlb } = await import(validatorUrl.href);
  validateMarbleColliderGlb(new Uint8Array(colliderBytes));

  const splatSha256 = crypto.createHash("sha256").update(splatBytes).digest("hex");
  const colliderSha256 = crypto.createHash("sha256").update(colliderBytes).digest("hex");
  refuse(request.navigation.splatSha256?.toLowerCase() === splatSha256 &&
    request.navigation.colliderSha256?.toLowerCase() === colliderSha256,
  "reviewed navigation references different asset bytes");
  const record = {
    country: request.country,
    providerWorldId: request.providerWorldId,
    splat100kUrl: request.splat100kUrl,
    colliderGlbUrl: request.colliderGlbUrl,
    worldSpatialScale: request.worldSpatialScale,
    groundPlaneOffset: request.groundPlaneOffset,
    generatedByAi: true,
    aiContentLabelRequired: true,
    interactionReady: false,
    splatSha256,
    colliderSha256,
    navigation: request.navigation,
    ...Object.fromEntries(REVIEW_KEYS.map((key) => [key, request.review[key]])),
  };

  // This is the SAME validation used by the isolated backend at startup.
  // It checks terrain and spawn but cannot independently prove licensing or
  // real-world appearance. Those remain human review and mobile acceptance gates.
  const catalog = createWorldAiSceneCatalog([record], {
    approvedHosts: request.approvedHosts,
  });
  refuse(catalog.get(request.country)?.navigation?.validPoint(
    catalog.get(request.country).navigation.spawn) === true,
  "navigation spawn was rejected");
  return {
    schemaVersion: 1,
    approvedHosts: [...request.approvedHosts],
    scenes: [record],
  };
}

function writePrivateCatalog(file, catalog) {
  refuse(typeof file === "string" && path.isAbsolute(file) &&
    path.extname(file).toLowerCase() === ".json",
  "absolute .json output path required");
  const repoRoot = path.resolve(__dirname, "../..");
  const relative = path.relative(repoRoot, file);
  refuse(relative.startsWith(".."+path.sep) || relative === "..",
    "refusing to store signed asset URLs inside source repository");
  const dir = fs.realpathSync(path.dirname(file));
  const parentRelative = path.relative(repoRoot, dir);
  refuse(parentRelative.startsWith(".."+path.sep) || parentRelative === "..",
    "refusing symlink output inside source repository");
  // Exclusive create: do not overwrite a catalog after a separate review.
  fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n", {
    encoding: "utf8", mode: 0o600, flag: "wx",
  });
}

async function main(argv = process.argv.slice(2)) {
  refuse(argv.length === 4 && argv[0] === "--request" && argv[2] === "--output",
    "usage: --request /absolute/review.json --output /outside-repo/world-ai-scenes.json");
  const file = argv[1];
  refuse(path.isAbsolute(file) && fs.statSync(file).isFile() &&
    fs.statSync(file).size < MAX_REQUEST,
  "review document missing or too large");
  const request = JSON.parse(fs.readFileSync(file, "utf8"));
  const catalog = await prepareWorldAiCatalog(request);
  writePrivateCatalog(argv[3], catalog);
  process.stdout.write("Offline World AI catalog preflight passed; no API or payment calls.\n");
  process.stdout.write("Operator must still verify source rights, scene fidelity and mobile walking.\n");
}

if (require.main === module) {
  main().catch(() => {
    // No local filenames, signed CDN URLs, credentials or binary bytes in CI.
    process.stderr.write("World AI import rejected. Review local input and approvals.\n");
    process.exitCode = 1;
  });
}
module.exports = { prepareWorldAiCatalog, writePrivateCatalog };
