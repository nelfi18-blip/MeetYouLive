import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { bakeWorldAiNavigation } from "../lib/vcr/worldAiColliderBake.mjs";
import navigation from "../../backend/src/lib/worldAiNavigation.cjs";

const id = "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a";
const base = (colliderRoot) => ({
  THREE, colliderRoot, providerWorldId: id, country: "jp",
  colliderSha256: "a".repeat(64), splatSha256: "b".repeat(64),
  originX: -2, originZ: -2, width: 8, height: 8, cellSize: .5,
  expectedFloorY: 0, spawnX: -1, spawnZ: 0, spawnYaw: 0,
});
function makeCollider({ wall = true } = {}) {
  const scene = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), material);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  if (wall) {
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(.2, 2.4, 8), material);
    barrier.position.set(1, 1.2, 0);
    scene.add(barrier);
  }
  scene.updateMatrixWorld(true);
  return scene;
}

test("Actual Three.js floor and collider wall become authoritative shared grid", () => {
  const colliderRoot = makeCollider();
  const manifest = bakeWorldAiNavigation(base(colliderRoot));
  assert.equal(manifest.providerWorldId, id);
  assert.equal(manifest.coordinateFrame, "three-y-up-meters");
  assert.equal(manifest.colliderSha256, "a".repeat(64));
  assert.equal(manifest.floorY.length, 8);
  const nav = navigation.makeNavigation(manifest);
  assert.ok(nav.floorAt(-.75, .25) !== null, "reachable ground preserved");
  assert.equal(nav.floorAt(.75, .25), null, "wall-inflated cells blocked");
  assert.equal(nav.validServerMove({ x: 1.5, y: 0, z: .25, yaw: 0 }, nav.spawn, .5), false);
  let pos = nav.spawn;
  for (let i = 0; i < 24; i += 1) pos = nav.step(pos, { right: true, yaw: 0 }, .05);
  assert.ok(pos.x > nav.spawn.x && pos.x < 1, "real world movement stops at baked wall");
  colliderRoot.traverse((node) => { node.geometry?.dispose?.(); node.material?.dispose?.(); });
});

test("No-floor and ungrounded positions fail; never silently substitute an artificial world", () => {
  const colliderRoot = new THREE.Group();
  assert.throws(() => bakeWorldAiNavigation(base(colliderRoot)), /collider has no visible/);
  const root = makeCollider();
  assert.throws(() => bakeWorldAiNavigation({ ...base(root), spawnX: 1 }), /reviewed spawn has no safe/);
  assert.throws(() => bakeWorldAiNavigation({ ...base(root), cellSize: 5 }), /invalid conservative grid/);
  assert.throws(() => bakeWorldAiNavigation({ ...base(root), width: 200 }), /invalid conservative grid/);
  root.traverse((node) => { node.geometry?.dispose?.(); node.material?.dispose?.(); });
});

test("Bake preserves an empty scene as blocked rather than inventing streets", () => {
  const colliderRoot = makeCollider({ wall: false });
  const far = { ...base(colliderRoot), originX: 200, originZ: 200, spawnX: 201, spawnZ: 201 };
  assert.throws(() => bakeWorldAiNavigation(far), /reviewed spawn has no safe/);
  colliderRoot.traverse((node) => { node.geometry?.dispose?.(); node.material?.dispose?.(); });
});
