import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyAiWorldDigest } from "../lib/vcr/aiWorldDigest.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const bytes = new Uint8Array([1, 2, 3]);
const correct = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";

test("SHA-256 confirms exact generated binary contents, even with a sliced byte view", async () => {
  assert.equal(await verifyAiWorldDigest(bytes, correct, webcrypto.subtle), true);
  const larger = new Uint8Array([19, 1, 2, 3, 20]);
  assert.equal(await verifyAiWorldDigest(larger.subarray(1, 4), correct, webcrypto.subtle), true);
});

test("Any changed byte or missing hash blocks world asset import", async () => {
  await assert.rejects(
    verifyAiWorldDigest(new Uint8Array([1, 2, 4]), correct, webcrypto.subtle),
    (error) => error instanceof AiWorldAssetError && /checksum mismatch/.test(error.message),
  );
  await assert.rejects(verifyAiWorldDigest(bytes, "ff", webcrypto.subtle), AiWorldAssetError);
  await assert.rejects(verifyAiWorldDigest(bytes, correct, null), AiWorldAssetError);
  await assert.rejects(verifyAiWorldDigest(new Uint8Array(), correct, webcrypto.subtle), AiWorldAssetError);
});

test("WebCrypto errors do not expose binary contents or signed asset URLs", async () => {
  const secret = "signed-provider-private-url";
  const broken = { digest: async () => { throw new Error(secret); } };
  await assert.rejects(
    verifyAiWorldDigest(bytes, correct, broken),
    (error) => error instanceof AiWorldAssetError && !error.message.includes(secret),
  );
});
