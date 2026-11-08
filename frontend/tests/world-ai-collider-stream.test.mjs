import test from "node:test";
import assert from "node:assert/strict";
import { loadMarbleCollider } from "../lib/vcr/aiWorldCollider.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const descriptor = {
  generatedByAi: true, interactionReady: false,
  colliderGlbUrl: "https://approved.example.org/real-collider.glb",
  worldSpatialScale: 1.23, groundPlaneOffset: 0.42,
};

test("Oversized streamed Marble collider cancels its download before parser is invoked", async () => {
  let cancelled = false, readCount = 0, parsed = false;
  const fetchAsset = async (url, opts) => {
    assert.equal(url, descriptor.colliderGlbUrl);
    assert.equal(opts.credentials, "omit");
    assert.equal(opts.redirect, "error");
    return {
      ok: true, redirected: false, headers: { get: () => "512" },
      body: { getReader() { return {
        async read() {
          readCount++;
          return { done: false, value: new Uint8Array(32 * 1024 * 1024 + 1) };
        },
        async cancel() { cancelled = true; },
        releaseLock() {},
      }; } },
    };
  };
  class GLTFLoader {
    constructor() { parsed = true; }
  }
  await assert.rejects(
    loadMarbleCollider({
      descriptor, THREE: { Group: class {} }, GLTFLoader, fetchAsset,
    }),
    (e) => e instanceof AiWorldAssetError && /too large/i.test(e.message),
  );
  assert.equal(readCount, 1);
  assert.equal(cancelled, true);
  assert.equal(parsed, false);
});
