/**
 * MeetYouLive World: ingest an EXISTING provider-generated 3D world.
 *
 * No API calls, credentials, uploads, generation requests, or UI toggles.
 * Nothing is approved for use merely because a provider returned asset URLs.
 * A server-side, operator-reviewed import must supply the approval flags and
 * an exact allowlist of trusted asset hosts before this object can be used.
 *
 * World Labs API response format: https://docs.worldlabs.ai/api
 */
const COUNTRIES = new Set(["us", "fr", "jp", "ae", "br", "eg"]);
const WORLD_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

export class AiWorldAssetError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "AiWorldAssetError";
  }
}

function required(condition, message) {
  if (!condition) throw new AiWorldAssetError(message);
}

function safeHost(host) {
  if (typeof host !== "string") return false;
  const normalized = host.toLowerCase();
  return /^[a-z0-9.-]+$/.test(normalized) &&
    normalized.includes(".") &&
    !normalized.endsWith(".local") &&
    !normalized.endsWith(".localhost") &&
    !normalized.endsWith(".internal") &&
    normalized !== "localhost" &&
    !/^[0-9.]+$/.test(normalized);
}

function assetUrl(value, exactHosts, expectedExtension) {
  required(typeof value === "string" && value.length < 4096, "Missing AI-world asset");
  let url;
  try { url = new URL(value); } catch { throw new AiWorldAssetError("Invalid AI-world asset URL"); }
  required(url.protocol === "https:" && !url.username && !url.password && !url.hash,
    "AI-world assets require HTTPS without URL credentials or fragments");
  required(exactHosts.has(url.hostname.toLowerCase()) && safeHost(url.hostname),
    "AI-world asset host is not approved");
  required(url.pathname.toLowerCase().endsWith(expectedExtension),
    "AI-world asset has the wrong format");
  // The provider may return expiring signed URLs; never log or commit them.
  return url.toString();
}

function finiteNumber(value, min, max, key) {
  required(typeof value === "number" && Number.isFinite(value) &&
    value >= min && value <= max, "Invalid AI-world spatial metadata: " + key);
  return value;
}

/**
 * Convert a completed Marble World/operation result into an immutable asset
 * descriptor only after manual review of rights, delivery, and spending.
 * This DOES NOT verify commercial licensing: caller supplies the evidence.
 *
 * @param {object} raw - World object or {world} / {response} wrapper
 * @param {object} policy - trusted server-side approval configuration
 */
export function prepareApprovedAiWorld(raw, policy = {}) {
  required(policy.environment === "isolated", "AI-world import is test-only");
  required(policy.commercialRightsApproved === true &&
    policy.assetDeliveryApproved === true &&
    policy.privacyReviewed === true &&
    policy.ownerApproved === true, "AI-world approvals are incomplete");

  required(Array.isArray(policy.allowedAssetHosts) &&
    policy.allowedAssetHosts.length > 0, "No approved AI-world asset hosts");
  const hosts = new Set(policy.allowedAssetHosts.map((host) => String(host).toLowerCase()));
  required([...hosts].every(safeHost), "Invalid AI-world host allowlist");

  const world = raw?.world || raw?.response || raw;
  required(world && typeof world === "object", "Missing generated world");
  required(typeof world.id === "string" && WORLD_ID.test(world.id),
    "Generated world has no valid provider ID");
  // Never accept a different world merely because it has valid provider URLs.
  required(world.id === policy.providerWorldId, "Generated world ID differs from reviewed import");
  required(SHA256.test(policy.splatSha256 || "") &&
    SHA256.test(policy.colliderSha256 || ""),
    "Reviewed AI-world SPZ and collider SHA-256 digests are required");
  required(COUNTRIES.has(policy.country), "Unsupported World destination");

  const splats = world.assets?.splats;
  const mesh = world.assets?.mesh;
  required(splats && mesh, "AI world lacks spatial assets");
  const semantics = splats.semantics_metadata;
  required(semantics && typeof semantics === "object", "AI world lacks spatial scale");
  const scale = finiteNumber(semantics.metric_scale_factor, 0.001, 1000, "scale");
  const groundOffset = finiteNumber(semantics.ground_plane_offset, -1000, 1000, "ground");
  const visual = assetUrl(splats.spz_urls?.["100k"], hosts, ".spz");
  const collider = assetUrl(mesh.collider_mesh_url, hosts, ".glb");

  // 100k splats are the intentionally mobile-first entry tier; the authored
  // render pipeline may progressively upgrade to 500k after performance tests.
  const moreDetail = splats.spz_urls?.["500k"]
    ? assetUrl(splats.spz_urls["500k"], hosts, ".spz")
    : null;

  return Object.freeze({
    provider: "worldlabs-marble",
    providerWorldId: world.id,
    country: policy.country,
    generatedByAi: true,
    aiContentLabelRequired: true,
    worldSpatialScale: scale,
    groundPlaneOffset: groundOffset,
    splat100kUrl: visual,
    splat500kUrl: moreDetail,
    colliderGlbUrl: collider,
    splatSha256: policy.splatSha256.toLowerCase(),
    colliderSha256: policy.colliderSha256.toLowerCase(),
    // This is asset intake, NOT proof that navigation, multimember physics,
    // photorealism, body likeness, or AI conversation have been implemented.
    interactionReady: false,
  });
}
