import { AiWorldAssetError } from "./aiWorldAssets.mjs";

export const SHA256_HEX = /^[0-9a-f]{64}$/i;

/**
 * Compare downloaded asset bytes with the operator-reviewed, server-pinned
 * SHA-256 hash, prior to decoding either the SPZ or GLB.
 *
 * Hashes are NOT supplied by the browser user or trusted from the provider
 * response alone: both must come from a separate reviewed import manifest.
 * This protects against expired URL swaps, cache races and mixed World IDs.
 */
export async function verifyAiWorldDigest(bytes, expectedHash, subtle = globalThis.crypto?.subtle) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 ||
      typeof expectedHash !== "string" || !SHA256_HEX.test(expectedHash) ||
      typeof subtle?.digest !== "function") {
    throw new AiWorldAssetError("AI-world asset integrity information unavailable");
  }
  let result;
  try {
    result = await subtle.digest(
      "SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
  } catch {
    throw new AiWorldAssetError("AI-world asset integrity verification failed");
  }
  const received = [...new Uint8Array(result)]
    .map((item) => item.toString(16).padStart(2, "0")).join("");
  if (received !== expectedHash.toLowerCase()) {
    throw new AiWorldAssetError("AI-world asset checksum mismatch");
  }
  return true;
}
