import { AiWorldAssetError } from "./aiWorldAssets.mjs";

// A 100k-splat mobile preview must not turn into an unbounded download.
// This intentionally has no backend/API key, generation request or caching.
export const MAX_AI_WORLD_SPLAT_BYTES = 24 * 1024 * 1024;

/**
 * Download a reviewed Marble SPZ in cancellable, bounded chunks.
 * Spark supports SplatMesh({ fileBytes }), avoiding its unmanaged URL fetch.
 * URL authorization must happen before this function via the server-reviewed
 * descriptor and an exact host allowlist; do not accept URLs from users.
 */
export async function downloadApprovedAiSplat({
  descriptor, fetchAsset = fetch, signal,
}) {
  if (!descriptor?.generatedByAi || descriptor.interactionReady !== false ||
      descriptor.aiContentLabelRequired !== true ||
      typeof descriptor.splat100kUrl !== "string" ||
      !/^https:\/\//.test(descriptor.splat100kUrl) ||
      typeof fetchAsset !== "function") {
    throw new AiWorldAssetError("Approved AI-world SPZ required");
  }
  if (signal?.aborted) throw new AiWorldAssetError("AI-world download cancelled");

  let reader;
  let finished = false;
  try {
    const response = await fetchAsset(descriptor.splat100kUrl, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response?.ok || response.redirected || signal?.aborted) {
      throw new AiWorldAssetError("AI-world SPZ unavailable");
    }

    const declared = response.headers?.get?.("content-length");
    if (declared != null) {
      const size = Number(declared);
      if (!Number.isFinite(size) || size < 0 || size > MAX_AI_WORLD_SPLAT_BYTES) {
        throw new AiWorldAssetError("AI-world SPZ exceeds mobile size limit");
      }
    }
    if (typeof response.body?.getReader !== "function") {
      throw new AiWorldAssetError("AI-world SPZ requires a cancellable stream");
    }
    reader = response.body.getReader();
    let length = 0;
    const chunks = [];
    while (true) {
      if (signal?.aborted) throw new AiWorldAssetError("AI-world download cancelled");
      const { value, done } = await reader.read();
      if (done) { finished = true; break; }
      if (!(value instanceof Uint8Array)) throw new AiWorldAssetError("Invalid AI-world SPZ chunk");
      length += value.byteLength;
      if (length > MAX_AI_WORLD_SPLAT_BYTES) {
        throw new AiWorldAssetError("AI-world SPZ exceeds mobile size limit");
      }
      chunks.push(value);
    }
    if (!length || signal?.aborted) throw new AiWorldAssetError("Empty or cancelled AI-world SPZ");
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } catch (error) {
    // Never leak signed asset URLs, credentials or upstream response bodies.
    throw error instanceof AiWorldAssetError
      ? error : new AiWorldAssetError("AI-world SPZ download failed");
  } finally {
    if (reader) {
      if (!finished) {
        try { await reader.cancel(); } catch { /* already cancelled */ }
      }
      try { reader.releaseLock(); } catch { /* browser already released */ }
    }
  }
}
