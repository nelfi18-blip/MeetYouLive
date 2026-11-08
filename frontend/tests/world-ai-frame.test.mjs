import test from "node:test";
import assert from "node:assert/strict";
import { marbleToMeters, metersToMarble, createMarbleWorldFrame } from "../lib/vcr/aiWorldFrame.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const descriptor = Object.freeze({ worldSpatialScale: 2.378, groundPlaneOffset: 1.389 });

test("Marble splats/collider transform is invertible and metric in Three.js", () => {
  for (const point of [[0, 0, 0], [1, 2, 3], [-3.25, 1.3, 19.5]]) {
    const meters = marbleToMeters(point, descriptor);
    const inverted = metersToMarble(meters, descriptor);
    inverted.forEach((value, i) => assert.ok(Math.abs(value - point[i]) < 1e-9));
  }
  assert.deepEqual(marbleToMeters([0, 0, 0], descriptor), [0, 1.389, -0]);
  assert.deepEqual(marbleToMeters([1, 1, 2], descriptor), [2.378, 1.389 - 2.378, -4.756]);
});

test("Both visual splats and collider mesh use the same nested frame", () => {
  class Group {
    constructor() {
      this.rotation = { x: 0 }; this.position = { y: 0 };
      this.scale = { setScalar: (n) => { this.scalar = n; } };
      this.children = [];
    }
    add(node) { this.children.push(node); }
  }
  const { axis, metric } = createMarbleWorldFrame({ Group }, descriptor);
  assert.equal(axis.rotation.x, Math.PI);
  assert.equal(axis.children[0], metric);
  assert.equal(metric.position.y, -1.389);
  assert.equal(metric.scalar, 2.378);
});

test("Malformed scale and coordinates cannot be treated as licensed navigation geometry", () => {
  assert.throws(() => marbleToMeters([Infinity, 0, 0], descriptor), AiWorldAssetError);
  assert.throws(() => marbleToMeters([0, 0], descriptor), AiWorldAssetError);
  assert.throws(() => metersToMarble([0, 0, 0], { worldSpatialScale: 0, groundPlaneOffset: 0 }), AiWorldAssetError);
  assert.throws(() => createMarbleWorldFrame({ Group: class {} }, { worldSpatialScale: NaN, groundPlaneOffset: 0 }), AiWorldAssetError);
});
