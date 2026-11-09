"use strict";

const { makeNavigation } = require("./worldAiNavigation.cjs");

const COUNTRY_IDS = new Set(["us", "fr", "jp", "ae", "br", "eg"]);
const SHA256 = /^[0-9a-f]{64}$/i;
const WORLD_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const RIGHTS = ["ownerApproved", "commercialRightsApproved", "assetDeliveryApproved", "privacyReviewed"];

function assertWorld(condition, message) {
  if (!condition) throw new Error("World AI catalog: " + message);
}

function trustedHost(value) {
  return typeof value === "string" && value.length <= 253 &&
    /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(value) &&
    !value.toLowerCase().endsWith(".local") &&
    !value.toLowerCase().endsWith(".internal");
}

function checkedUrl(value, hosts, extension) {
  assertWorld(typeof value === "string" && value.length < 4096, "asset URL missing");
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("World AI catalog: invalid asset URL"); }
  assertWorld(parsed.protocol === "https:" && !parsed.username && !parsed.password &&
    !parsed.hash && hosts.has(parsed.hostname.toLowerCase()) &&
    parsed.pathname.toLowerCase().endsWith(extension), "asset origin or type not approved");
  // Signed query strings may be necessary; do not log/store them in CI artifacts.
  return parsed.toString();
}

/**
 * Trusted server-side registry only. The input must come from an operator-
 * reviewed, locally controlled manifest, NEVER from vcr:join or a client API.
 * No catalog entries means AI joins remain disabled. This does not fetch,
 * generate, purchase, publish or authorize commercial usage by itself.
 */
function createWorldAiSceneCatalog(records = [], { approvedHosts = [] } = {}) {
  assertWorld(Array.isArray(records) && records.length <= COUNTRY_IDS.size,
    "too many approved scenes");
  assertWorld(Array.isArray(approvedHosts) && approvedHosts.every(trustedHost),
    "approvedHosts must contain exact valid DNS hostnames");
  const hosts = new Set(approvedHosts.map((host) => host.toLowerCase()));
  const scenes = new Map();

  for (const record of records) {
    assertWorld(record && typeof record === "object", "missing approved record");
    assertWorld(RIGHTS.every((name) => record[name] === true),
      "owner, rights, delivery and privacy review required");
    assertWorld(COUNTRY_IDS.has(record.country) && !scenes.has(record.country),
      "unknown or duplicate country");
    assertWorld(typeof record.providerWorldId === "string" &&
      WORLD_ID.test(record.providerWorldId), "invalid provider world ID");
    assertWorld(SHA256.test(record.splatSha256 || "") &&
      SHA256.test(record.colliderSha256 || ""), "approved SHA-256 digests required");
    assertWorld(record.generatedByAi === true && record.aiContentLabelRequired === true &&
      record.interactionReady === false, "generated-world identity or safety flags missing");
    assertWorld(typeof record.worldSpatialScale === "number" &&
      Number.isFinite(record.worldSpatialScale) &&
      record.worldSpatialScale >= 0.001 && record.worldSpatialScale <= 1000 &&
      typeof record.groundPlaneOffset === "number" &&
      Number.isFinite(record.groundPlaneOffset) &&
      Math.abs(record.groundPlaneOffset) <= 1000, "invalid world coordinate frame");

    const navigation = makeNavigation(record.navigation);
    assertWorld(navigation.country === record.country &&
      navigation.providerWorldId === record.providerWorldId &&
      navigation.splatSha256.toLowerCase() === record.splatSha256.toLowerCase() &&
      navigation.colliderSha256.toLowerCase() === record.colliderSha256.toLowerCase(),
    "navigation manifest does not match approved spatial assets");

    const descriptor = Object.freeze({
      provider: "worldlabs-marble",
      country: record.country,
      providerWorldId: record.providerWorldId,
      generatedByAi: true,
      aiContentLabelRequired: true,
      interactionReady: false,
      splat100kUrl: checkedUrl(record.splat100kUrl, hosts, ".spz"),
      colliderGlbUrl: checkedUrl(record.colliderGlbUrl, hosts, ".glb"),
      splatSha256: record.splatSha256.toLowerCase(),
      colliderSha256: record.colliderSha256.toLowerCase(),
      worldSpatialScale: record.worldSpatialScale,
      groundPlaneOffset: record.groundPlaneOffset,
    });
    scenes.set(record.country, Object.freeze({ descriptor, navigation }));
  }
  return Object.freeze({
    // Never accept a manifest in this method. Only fixed server records exist.
    get(country) { return scenes.get(country) || null; },
    countries() { return [...scenes.keys()]; },
  });
}

module.exports = { createWorldAiSceneCatalog };
