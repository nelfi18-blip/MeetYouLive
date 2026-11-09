import test from "node:test";
import assert from "node:assert/strict";
import { fetchApprovedAiWorldSession } from "../lib/vcr/aiWorldSession.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const worldId = "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a";
const splatSha256 = "a".repeat(64), colliderSha256 = "b".repeat(64);
const validPayload = () => ({
  descriptor: {
    provider: "worldlabs-marble", country: "jp",
    providerWorldId: worldId,
    generatedByAi: true, aiContentLabelRequired: true, interactionReady: false,
    splat100kUrl: "https://assets.example.org/world/real.spz",
    colliderGlbUrl: "https://assets.example.org/world/real.glb",
    splatSha256, colliderSha256,
  },
  navigation: {
    schemaVersion: 1, country: "jp", providerWorldId: worldId,
    colliderSha256, splatSha256, coordinateFrame: "three-y-up-meters",
    width: 16, height: 16, originX: -8, originZ: -8, cellSize: 1,
    floorY: Array.from({ length: 16 }, () => Array(16).fill(0)),
    spawn: { x: 0, y: 0, z: 0, yaw: 0 },
  },
});
const opts = {
  country: "jp", token: "test-synthetic-JWT", isolationMode: "isolated",
  apiBaseUrl: "https://meetyoulive-world-test.onrender.com",
};
function serverReply(payload = validPayload()) {
  return { ok: true, redirected: false, json: async () => payload };
}

test("Authenticated isolated preview only reads the approved World Test origin", async () => {
  const calls = [];
  const session = await fetchApprovedAiWorldSession({
    ...opts,
    fetchImpl: async (url, config) => {
      calls.push([url, config]);
      return serverReply();
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0],
    "https://meetyoulive-world-test.onrender.com/api/world-ai/scenes/jp");
  assert.equal(calls[0][1].headers.Authorization, "Bearer test-synthetic-JWT");
  assert.equal(calls[0][1].credentials, "omit");
  assert.equal(calls[0][1].redirect, "error");
  assert.equal(session.descriptor.providerWorldId, worldId);
  assert.equal(session.navigation.validPoint(session.navigation.spawn), true);
  assert.equal(session.descriptor.interactionReady, false);
});

test("Production origin, missing token, and browser-controlled scene IDs fail before fetch", async () => {
  let fetches = 0;
  const fetchImpl = async () => { fetches += 1; return serverReply(); };
  for (const changes of [
    { isolationMode: "production" },
    { apiBaseUrl: "https://meetyoulive.onrender.com" },
    { apiBaseUrl: "https://meetyoulive-world-test.onrender.com.evil.invalid" },
    { token: "" },
    { country: "secret" },
    { country: "../jp" },
    { signal: { aborted: true } },
  ]) {
    await assert.rejects(
      fetchApprovedAiWorldSession({ ...opts, fetchImpl, ...changes }),
      AiWorldAssetError,
    );
  }
  assert.equal(fetches, 0);
});

test("Unknown or mismatched licensed scenes are never represented as ready", async () => {
  const disallowed = [
    (() => { const x = validPayload(); x.descriptor.providerWorldId = "other"; return x; })(),
    (() => { const x = validPayload(); x.navigation.colliderSha256 = "c".repeat(64); return x; })(),
    (() => { const x = validPayload(); x.descriptor.interactionReady = true; return x; })(),
    (() => { const x = validPayload(); x.navigation.spawn.y = 10; return x; })(),
  ];
  for (const payload of disallowed) {
    await assert.rejects(fetchApprovedAiWorldSession({
      ...opts, fetchImpl: async () => serverReply(payload),
    }), AiWorldAssetError);
  }
  await assert.rejects(fetchApprovedAiWorldSession({
    ...opts, fetchImpl: async () => ({ ok: false, status: 404 }),
  }), AiWorldAssetError);
});
