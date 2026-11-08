import test from "node:test";
import assert from "node:assert/strict";
import navigation from "../../backend/src/lib/worldAiNavigation.cjs";

const id = "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a";
const hashA = "a".repeat(64), hashB = "b".repeat(64);
const base = () => ({
  schemaVersion: 1,
  providerWorldId: id,
  country: "jp",
  colliderSha256: hashA,
  splatSha256: hashB,
  coordinateFrame: "three-y-up-meters",
  width: 16, height: 16, originX: -8, originZ: -8, cellSize: 1,
  floorY: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => 0)),
  spawn: { x: 0, y: 0, z: 0, yaw: 0 },
});

test("AI-world navigation needs a grounded, hash-bound reviewed spatial grid", () => {
  const nav = navigation.makeNavigation(base());
  assert.equal(nav.providerWorldId, id);
  assert.equal(nav.country, "jp");
  assert.equal(nav.colliderSha256, hashA);
  assert.equal(nav.splatSha256, hashB);
  assert.equal(nav.floorAt(0, 0), 0);
  assert.equal(nav.floorAt(999, 0), null);
  assert.equal(nav.validPoint(nav.spawn), true);
  assert.equal(nav.validPoint({ x: 0, z: 0, yaw: 0 }), false);
  assert.equal(nav.validPoint({ x: 0, z: 0, y: 4, yaw: 0 }), false);
  assert.equal(Object.isFrozen(nav), true);
});

test("AI-world walking moves continuously, then stops at a baked collider wall", () => {
  const world = base();
  for (const row of world.floorY) row[10] = null; // x=2 wall, from z=-8 to +8
  const nav = navigation.makeNavigation(world);
  let pos = nav.spawn;
  for (let i = 0; i < 20; i += 1) {
    pos = nav.step(pos, { yaw: 0, right: true }, 0.05);
  }
  assert.ok(pos.x > 1 && pos.x < 2, "movement approaches, not crosses, the wall");
  assert.equal(pos.y, 0);
  assert.equal(nav.validServerMove({ x: 3, z: 0, yaw: 0, y: 0 }, nav.spawn, 0.5), false);
  assert.equal(nav.validServerMove({ x: 0.35, z: 0, yaw: 0, y: 0 }, nav.spawn, 0.1), true);
});

test("Rejected moves cannot tunnel through walls or exceed the server speed limit", () => {
  const world = base();
  for (const row of world.floorY) row[10] = null;
  const nav = navigation.makeNavigation(world);
  assert.equal(nav.validServerMove({ x: 1.5, z: 0, yaw: 0, y: 0 }, nav.spawn, 0.01), false);
  assert.equal(nav.validServerMove({ x: 3, z: 0, yaw: 0, y: 0 }, nav.spawn, 10), false);
  assert.equal(nav.validServerMove({ x: NaN, z: 0, yaw: 0, y: 0 }, nav.spawn, 1), false);
  assert.equal(nav.validServerMove({ x: 0, z: 0, yaw: 10, y: 0 }, nav.spawn, 1), false);
  assert.equal(nav.validServerMove({ x: 0, z: 0, yaw: 0, y: 8 }, nav.spawn, 1), false);
});

test("Unsafe terrain, mismatched formats and ungrounded spawns fail closed", () => {
  const bad = [
    { schemaVersion: 2 }, { country: "xx" }, { colliderSha256: "not-a-hash" },
    { splatSha256: undefined }, { coordinateFrame: "opencv-raw" },
    { width: 1000 }, { height: -1 }, { originX: NaN }, { cellSize: -1 },
    { floorY: [] }, { spawn: { x: 0, y: 10, z: 0, yaw: 0 } },
  ];
  for (const change of bad) {
    const manifest = { ...base(), ...change };
    assert.throws(() => navigation.makeNavigation(manifest), /World AI navigation:/);
  }
  const unsafeSpawn = base();
  unsafeSpawn.floorY[8][8] = null;
  assert.throws(() => navigation.makeNavigation(unsafeSpawn), /spawn is not safe/);
  const cliff = base();
  cliff.floorY[8][8] = 3;
  assert.throws(() => navigation.makeNavigation(cliff), /spawn is not safe/);
});

test("Traversal refuses sudden floor height changes and outside-world movement", () => {
  const world = base();
  // A steep ledge along x=2; all surroundings otherwise flat.
  for (const row of world.floorY) row[10] = 2.5;
  const nav = navigation.makeNavigation(world);
  let pos = nav.spawn;
  for (let i = 0; i < 20; i += 1) pos = nav.step(pos, { yaw: 0, right: true }, 0.05);
  assert.ok(pos.x < 2, "do not walk into a steep step");
  assert.equal(nav.validServerMove({ x: 3, z: 0, yaw: 0, y: 2.5 }, nav.spawn, .5), false);
});
