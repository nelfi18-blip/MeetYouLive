import { AiWorldAssetError } from "./aiWorldAssets.mjs";
import { createMarbleWorldFrame } from "./aiWorldFrame.mjs";
import { verifyAiWorldDigest } from "./aiWorldDigest.mjs";

const MAX_COLLIDER_BYTES = 32 * 1024 * 1024;
const MAGIC_GLB = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

/**
 * Validate a single-file GLB before passing it to GLTFLoader. This prevents
 * generated worlds from referencing arbitrary images/scripts/external buffers.
 * It does not claim the geometry is accurate or server-authoritative.
 */
export function validateMarbleColliderGlb(bytes) {
  const data = bytes instanceof Uint8Array
    ? bytes
    : bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : null;
  if (!data || data.byteLength < 20 || data.byteLength > MAX_COLLIDER_BYTES) {
    throw new AiWorldAssetError("AI-world collider file is missing or too large");
  }
  const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (header.getUint32(0, true) !== MAGIC_GLB ||
      header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== data.byteLength) {
    throw new AiWorldAssetError("AI-world collider must be a complete GLB v2");
  }
  const jsonLength = header.getUint32(12, true);
  if (header.getUint32(16, true) !== JSON_CHUNK ||
      jsonLength > 2 * 1024 * 1024 || jsonLength + 20 > data.byteLength) {
    throw new AiWorldAssetError("AI-world collider has invalid GLB metadata");
  }
  let document;
  try {
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true })
      .decode(data.subarray(20, 20 + jsonLength)));
  } catch { throw new AiWorldAssetError("AI-world collider metadata cannot be decoded"); }

  if (document?.asset?.version !== "2.0" ||
      !Array.isArray(document.meshes) || document.meshes.length === 0 ||
      !Array.isArray(document.buffers) || document.buffers.length !== 1 ||
      document.buffers[0]?.uri !== undefined ||
      document.images?.some((item) => item.uri !== undefined) ||
      document.extensionsRequired?.some((ext) => typeof ext !== "string" || ext.length > 100)) {
    throw new AiWorldAssetError("AI-world collider references unsupported or external geometry");
  }
  return Object.freeze({ meshes: document.meshes.length, bytes: data.byteLength });
}

async function boundedDownload(response) {
  if (!response?.ok || response.redirected) throw new AiWorldAssetError("AI-world collider unavailable");
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAX_COLLIDER_BYTES) {
    throw new AiWorldAssetError("AI-world collider exceeds mobile safety limit");
  }
  if (typeof response.body?.getReader !== "function") {
    const result = new Uint8Array(await response.arrayBuffer());
    if (result.length > MAX_COLLIDER_BYTES) throw new AiWorldAssetError("AI-world collider too large");
    return result;
  }
  const reader = response.body.getReader();
  const parts = [];
  let count = 0, complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array)) throw new AiWorldAssetError("Invalid collider chunk");
      count += value.byteLength;
      if (count > MAX_COLLIDER_BYTES) throw new AiWorldAssetError("AI-world collider too large");
      parts.push(value);
    }
  } finally {
    // Prevent a failed GLB validation from leaving a large remote stream open.
    if (!complete) { try { await reader.cancel(); } catch { /* already closed */ } }
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  const output = new Uint8Array(count);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

/**
 * Collision is a hidden physics input, not a decorative substitute for the
 * splats. It must be spatially identical to the splats and reviewed against
 * the corresponding world ID before multiplayer movement is allowed.
 */
export async function loadMarbleCollider({
  descriptor, THREE, GLTFLoader, signal, fetchAsset = fetch,
}) {
  if (!descriptor?.generatedByAi || descriptor.interactionReady !== false ||
      !descriptor.colliderGlbUrl || typeof THREE?.Group !== "function" ||
      typeof GLTFLoader !== "function" || typeof fetchAsset !== "function") {
    throw new AiWorldAssetError("Approved AI-world collider inputs are required");
  }
  if (signal?.aborted) throw new AiWorldAssetError("AI-world load cancelled");

  let root;
  try {
    const response = await fetchAsset(descriptor.colliderGlbUrl, {
      mode: "cors", credentials: "omit", cache: "no-store",
      redirect: "error", signal,
    });
    const bytes = await boundedDownload(response);
    await verifyAiWorldDigest(bytes, descriptor.colliderSha256);
    if (signal?.aborted) throw new AiWorldAssetError("AI-world load cancelled");
    validateMarbleColliderGlb(bytes);
    if (signal?.aborted) throw new AiWorldAssetError("AI-world load cancelled");

    const gltf = await new Promise((resolve, reject) => {
      try {
        new GLTFLoader().parse(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          "", resolve, reject,
        );
      } catch (error) { reject(error); }
    });
    root = gltf?.scene;
    if (!root?.traverse || signal?.aborted) {
      throw new AiWorldAssetError("AI-world collider load cancelled or empty");
    }
    let meshCount = 0;
    root.traverse((node) => { if (node.isMesh && node.geometry) meshCount += 1; });
    if (meshCount === 0) throw new AiWorldAssetError("AI-world collider has no surfaces");

    const { axis, metric } = createMarbleWorldFrame(THREE, descriptor);
    metric.add(root);
    axis.updateMatrixWorld?.(true);
    // Do NOT scene.add(axis): collider should never render as geometric art.
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      axis.removeFromParent?.();
      root.traverse((node) => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach((m) => m?.dispose?.());
        else node.material?.dispose?.();
      });
    };
    return Object.freeze({ colliderReady: true, interactionReady: false,
      colliderRoot: axis, meshCount, dispose });
  } catch (error) {
    root?.traverse?.((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach((m) => m?.dispose?.());
      else node.material?.dispose?.();
    });
    throw error instanceof AiWorldAssetError
      ? error
      : new AiWorldAssetError("AI-world collider failed to load");
  }
}
