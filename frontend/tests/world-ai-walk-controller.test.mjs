import test from "node:test";
import assert from "node:assert/strict";
import navigationCore from "../../backend/src/lib/worldAiNavigation.cjs";
import { createAiWorldWalkController } from "../lib/vcr/aiWorldWalkController.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const descriptor = Object.freeze({
  country: "us", providerWorldId: "a1111111-2222-4333-8444-555555555555",
  generatedByAi: true, aiContentLabelRequired: true, interactionReady: false,
  splatSha256: "a".repeat(64), colliderSha256: "b".repeat(64),
});

function makeNav({ wall = false } = {}) {
  const floorY = Array.from({ length: 16 }, () => Array(16).fill(0));
  if (wall) for (let x = 0; x < 16; x++) floorY[6][x] = null;
  return navigationCore.makeNavigation({
    schemaVersion: 1, country: "us", providerWorldId: descriptor.providerWorldId,
    splatSha256: descriptor.splatSha256, colliderSha256: descriptor.colliderSha256,
    coordinateFrame: "three-y-up-meters", width: 16, height: 16, originX: -8,
    originZ: -8, cellSize: 1, floorY,
    spawn: { x: 0, y: 0, z: 0, yaw: 0 },
  });
}

test("Real AI movement is disabled until server membership is acknowledged", () => {
  const walk = createAiWorldWalkController({ descriptor, navigation: makeNav() });
  walk.setDirection("forward", true);
  assert.deepEqual(walk.advance(0.05).z, 0);
  walk.setInputEnabled(true);
  walk.setDirection("forward", true);
  assert.ok(walk.advance(0.05).z < 0);
  walk.setInputEnabled(false);
  const stopped = walk.getPosition();
  assert.equal(walk.advance(0.05).z, stopped.z);
  walk.dispose();
  walk.setInputEnabled(true);
  assert.equal(walk.advance(0.05).z, stopped.z);
});

test("AI world's movement does not cross unknown tiles or accept teleport coordinates", () => {
  const walk = createAiWorldWalkController({ descriptor, navigation: makeNav({ wall: true }) });
  walk.setInputEnabled(true);
  walk.setDirection("forward", true);
  for (let i = 0; i < 30; i++) walk.advance(0.05);
  assert.ok(walk.getPosition().z > -1.7, "wall footprint is authoritative");
  assert.equal(walk.setPosition({ x: 0, y: 0, z: -3, yaw: 0 }), false);
  assert.equal(walk.teleport("neon"), false);
  assert.equal(walk.travelCountry("jp"), false);
  walk.setViewYaw(Math.PI / 2);
  assert.ok(Math.abs(walk.getPosition().yaw - Math.PI / 2) < 1e-8);
  walk.dispose();
});

test("Only same approved scene and real valid peer coordinates are accepted", () => {
  const nav = makeNav();
  assert.throws(() => createAiWorldWalkController({
    descriptor: { ...descriptor, colliderSha256: "c".repeat(64) }, navigation: nav,
  }), AiWorldAssetError);
  assert.throws(() => createAiWorldWalkController({
    descriptor: { ...descriptor, generatedByAi: false }, navigation: nav,
  }), AiWorldAssetError);
  const walk = createAiWorldWalkController({ descriptor, navigation: nav });
  walk.setPeers([
    { userId: "real-socket-id", position: { x: 0, y: 0, z: 0, yaw: 0 } },
    { userId: "fake-outside", position: { x: 99, y: 0, z: 0, yaw: 0 } },
  ]);
  assert.deepEqual(walk.getPeers().map((p) => p.userId), ["real-socket-id"]);
  walk.dispose();
  assert.deepEqual(walk.getPeers(), []);
});
