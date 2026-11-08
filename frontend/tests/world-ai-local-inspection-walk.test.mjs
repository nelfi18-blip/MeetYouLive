import test from "node:test";
import assert from "node:assert/strict";
import { advanceAiWorldPosition, createMarbleRaycastProbe } from "../lib/vcr/aiWorldNavigation.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const start = Object.freeze({ x: 0, y: 0, z: 0 });

test("Local generated-world inspection moves in metres with normalized diagonal speed", () => {
  const flat = () => ({ ok: true, groundY: 0 });
  const ahead = advanceAiWorldPosition(start, { forward: true, yaw: 0 }, .05, flat);
  const diagonal = advanceAiWorldPosition(start, { forward: true, right: true, yaw: 0 }, .05, flat);
  assert.equal(ahead.moving, true);
  assert.ok(ahead.z < -.13 && ahead.z > -.15);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - Math.hypot(ahead.x, ahead.z)) < 1e-9);
  assert.equal(advanceAiWorldPosition(start, {}, .05, flat).moving, false);
});

test("Local preview never walks into an unverified wall, gap, cliff or invalid step", () => {
  const blocked = () => ({ ok: false });
  assert.equal(advanceAiWorldPosition(start, { forward: true }, .05, blocked).moving, false);
  for (const groundY of [1.0, -1.0]) {
    assert.equal(advanceAiWorldPosition(start, { forward: true }, .05,
      () => ({ ok: true, groundY })).moving, false);
  }
  assert.equal(advanceAiWorldPosition(start, { forward: true }, .05,
    () => ({ ok: true })).moving, false);
  assert.throws(() => advanceAiWorldPosition(start, {}, -1, blocked), AiWorldAssetError);
});

test("Local wall sliding cannot misidentify zero-distance motion", () => {
  const onlyX = (_old, next) => next.z !== 0 ? { ok: false } : { ok: true, groundY: 0 };
  assert.equal(advanceAiWorldPosition(start, { forward: true }, .05, onlyX).moving, false);
  const slide = advanceAiWorldPosition(start, { forward: true, right: true }, .05, onlyX);
  assert.equal(slide.moving, true);
  assert.ok(slide.x > 0 && slide.z === 0);
});

test("Generated collider is required for grounded local preview", () => {
  let wall = false;
  class Vector3 {
    constructor(x, y, z) { Object.assign(this, { x, y, z }); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    transformDirection() { return this; }
  }
  class Raycaster {
    set(origin, direction) { this.origin = origin; this.direction = direction; }
    intersectObject() {
      if (this.direction.y < 0) return [{
        face: { normal: new Vector3(0, 1, 0) },
        object: { matrixWorld: {} }, point: { y: 0 }, distance: 1.35,
      }];
      return wall ? [{ distance: .1 }] : [];
    }
  }
  const probe = createMarbleRaycastProbe({ Vector3, Raycaster },
    { traverse() {}, updateMatrixWorld() {} });
  assert.deepEqual(probe(start, { x: 0, z: -.14 }), { ok: true, groundY: 0 });
  wall = true;
  assert.deepEqual(probe(start, { x: 0, z: -.14 }), { ok: false });
  assert.throws(() => createMarbleRaycastProbe({}, null), AiWorldAssetError);
});
