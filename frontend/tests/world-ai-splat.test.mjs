import test from "node:test";
import assert from "node:assert/strict";
import { downloadApprovedAiSplat, MAX_AI_WORLD_SPLAT_BYTES } from "../lib/vcr/aiWorldSplat.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const descriptor = {
  generatedByAi: true, interactionReady: false, aiContentLabelRequired: true,
  splat100kUrl: "https://approved.example.org/genuine-world-100k.spz?temporary=1",
};

function response(chunks, { declared = null, redirected = false } = {}) {
  let index = 0, cancelled = false;
  return {
    ok: true, redirected,
    headers: { get: (name) => name === "content-length" ? declared : null },
    body: { getReader() { return {
      async read() { return index < chunks.length
        ? { done: false, value: chunks[index++] } : { done: true }; },
      async cancel() { cancelled = true; },
      releaseLock() {},
    }; } },
    get cancelled() { return cancelled; },
  };
}

test("Generated SPZ downloads with no credentials, redirects or uncontrolled Spark fetch", async () => {
  const incoming = response([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])],
    { declared: "5" });
  let requests = 0;
  const bytes = await downloadApprovedAiSplat({
    descriptor,
    fetchAsset: async (url, options) => {
      requests += 1;
      assert.equal(url, descriptor.splat100kUrl);
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      return incoming;
    },
  });
  assert.deepEqual([...bytes], [1, 2, 3, 4, 5]);
  assert.equal(requests, 1);
  assert.equal(incoming.cancelled, false);
});

test("Generated SPZ rejects oversized streams even when content-length lies", async () => {
  const oversized = response([
    new Uint8Array(MAX_AI_WORLD_SPLAT_BYTES / 2 + 1),
    new Uint8Array(MAX_AI_WORLD_SPLAT_BYTES / 2 + 1),
  ], { declared: "5" });
  await assert.rejects(
    downloadApprovedAiSplat({ descriptor, fetchAsset: async () => oversized }),
    AiWorldAssetError,
  );
  assert.equal(oversized.cancelled, true);
  await assert.rejects(downloadApprovedAiSplat({
    descriptor,
    fetchAsset: async () => response([], { declared: String(MAX_AI_WORLD_SPLAT_BYTES + 1) }),
  }), AiWorldAssetError);
});

test("Generated SPZ aborts safely, without logging signed URL errors", async () => {
  const signal = { aborted: true };
  await assert.rejects(downloadApprovedAiSplat({ descriptor, signal, fetchAsset: async () =>
    { throw new Error("must not fetch"); } }), AiWorldAssetError);
  const internalError = "private-signed-asset-query";
  await assert.rejects(downloadApprovedAiSplat({
    descriptor, fetchAsset: async () => { throw new Error(internalError); },
  }), (error) => error instanceof AiWorldAssetError && !error.message.includes(internalError));
  await assert.rejects(downloadApprovedAiSplat({
    descriptor, fetchAsset: async () => response([], { redirected: true }),
  }), AiWorldAssetError);
  await assert.rejects(downloadApprovedAiSplat({
    descriptor: { ...descriptor, generatedByAi: false },
    fetchAsset: async () => response([new Uint8Array([1])]),
  }), AiWorldAssetError);
});
