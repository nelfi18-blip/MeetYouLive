import navigationCore from "../../../backend/src/lib/worldAiNavigation.cjs";
import { AiWorldAssetError } from "./aiWorldAssets.mjs";

const TEST_API = "https://meetyoulive-world-test.onrender.com";
const COUNTRIES = new Set(["us", "fr", "jp", "ae", "br", "eg"]);

/**
 * Only the isolated World Test frontend can retrieve an already-approved
 * spatial world. The server uses a private, operator-reviewed catalog; the
 * browser cannot choose arbitrary manifest URLs or set approval flags.
 *
 * This returns navigation *data*, not a game or an active Socket.IO session.
 * Nothing here creates models, starts paid jobs or stores identity photos.
 */
export async function fetchApprovedAiWorldSession({
  country, token, apiBaseUrl = TEST_API,
  isolationMode = process.env.NEXT_PUBLIC_WORLD_TEST_MODE,
  fetchImpl = fetch, signal, missingAsNull = false,
}) {
  if (isolationMode !== "isolated" ||
      typeof country !== "string" || !COUNTRIES.has(country) ||
      typeof token !== "string" || !token ||
      typeof fetchImpl !== "function" || apiBaseUrl !== TEST_API) {
    throw new AiWorldAssetError("World AI preview requires an isolated authenticated test session");
  }
  if (signal?.aborted) throw new AiWorldAssetError("World AI preview cancelled");

  let response;
  try {
    response = await fetchImpl(TEST_API + "/api/world-ai/scenes/" + country, {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      mode: "cors",
      signal,
    });
  } catch {
    throw new AiWorldAssetError("Approved World AI scene unavailable");
  }
  if (signal?.aborted) throw new AiWorldAssetError("World AI preview cancelled");
  // Only an explicit, non-redirected 404 denotes an absent reviewed scene.
  // Callers must explain absence; it does not authorize automatic substitution.
  // Network failures, expired JWT, 403, 5xx, redirects and malformed content
  // must never send a member into a fake or mismatched world silently.
  if (missingAsNull === true && response?.status === 404 &&
      response.redirected === false) return null;
  if (response?.status === 401 && response.redirected !== true) {
    // Return only a stable reason, never the token or upstream body.
    const error = new AiWorldAssetError("World Test authentication needs renewal");
    error.code = "WORLD_TEST_SESSION_EXPIRED";
    throw error;
  }
  if (!response?.ok || response.redirected) {
    throw new AiWorldAssetError("Approved World AI scene unavailable");
  }

  let payload;
  try { payload = await response.json(); } catch {
    throw new AiWorldAssetError("Invalid World AI scene response");
  }
  if (!payload?.descriptor || !payload?.navigation) {
    throw new AiWorldAssetError("Approved World AI scene is missing spatial data");
  }

  const scene = payload.descriptor;
  let nav;
  try { nav = navigationCore.makeNavigation(payload.navigation); } catch {
    throw new AiWorldAssetError("Server World AI navigation cannot be verified");
  }
  if (scene.country !== country ||
      scene.provider !== "worldlabs-marble" ||
      scene.generatedByAi !== true ||
      scene.aiContentLabelRequired !== true ||
      scene.interactionReady !== false ||
      typeof scene.splat100kUrl !== "string" ||
      typeof scene.colliderGlbUrl !== "string" ||
      nav.country !== scene.country ||
      nav.providerWorldId !== scene.providerWorldId ||
      nav.splatSha256.toLowerCase() !== scene.splatSha256?.toLowerCase() ||
      nav.colliderSha256.toLowerCase() !== scene.colliderSha256?.toLowerCase()) {
    throw new AiWorldAssetError("AI-world scene and server navigation identity mismatch");
  }
  if (signal?.aborted) throw new AiWorldAssetError("World AI preview cancelled");
  return Object.freeze({ descriptor: Object.freeze({ ...scene }), navigation: nav });
}
