import test from "node:test";
import assert from "node:assert/strict";
import { mountAiWorldVisual } from "../lib/vcr/aiWorldVisual.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const descriptor = Object.freeze({
  generatedByAi: true,
  aiContentLabelRequired: true,
  interactionReady: false,
  splat100kUrl: "https://cdn.example.org/marble/world-100k.spz",
  colliderGlbUrl: "https://cdn.example.org/marble/collider.glb",
  worldSpatialScale: 1.23,
  groundPlaneOffset: 0.42,
});

function harness({ failLoad = false } = {}) {
  const nodes = [];
  class Group {
    constructor() {
      this.rotation = { x: 0 };
      this.position = { y: 0 };
      this.scale = { value: 1, setScalar(n) { this.value = n; } };
      this.children = [];
    }
    add(child) { this.children.push(child); child.parent = this; }
    removeFromParent() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((item) => item !== this);
      this.parent = null;
    }
  }
  class SparkRenderer extends Group {
    constructor(options) { super(); this.renderer = options.renderer; nodes.push(this); }
    dispose() { this.disposed = true; }
  }
  class SplatMesh extends Group {
    constructor(options) {
      super();
      this.url = options.url;
      this.initialized = failLoad ? Promise.reject(new Error("signed-url-secret")) : Promise.resolve(this);
      nodes.push(this);
    }
    dispose() { this.disposed = true; }
  }
  const scene = new Group(), renderer = {};
  return { THREE: { Group }, SparkRenderer, SplatMesh, scene, renderer, nodes };
}

test("Generated Marble splat mounts at metric scale without enabling movement", async () => {
  const deps = harness();
  const layer = await mountAiWorldVisual({ descriptor, ...deps });
  assert.equal(layer.visualReady, true);
  assert.equal(layer.interactionReady, false);
  assert.equal(layer.axis.rotation.x, Math.PI);
  assert.equal(layer.axis.children[0].scale.value, 1.23);
  assert.equal(layer.axis.children[0].position.y, -0.42);
  assert.equal(deps.nodes[1].url, descriptor.splat100kUrl);
  assert.equal(deps.scene.children.length, 2);
  layer.dispose();
  layer.dispose();
  assert.equal(deps.scene.children.length, 0);
  assert.equal(deps.nodes[0].disposed, true);
  assert.equal(deps.nodes[1].disposed, true);
});

test("Unavailable assets/dependencies and cancelled sessions fail closed", async () => {
  const deps = harness();
  await assert.rejects(
    mountAiWorldVisual({ descriptor: { ...descriptor, interactionReady: true }, ...deps }),
    AiWorldAssetError,
  );
  await assert.rejects(
    mountAiWorldVisual({ descriptor, ...deps, signal: { aborted: true } }),
    AiWorldAssetError,
  );
  assert.equal(deps.scene.children.length, 0);
});

test("Failed splat load cleans GPU resources without printing signed links", async () => {
  const deps = harness({ failLoad: true });
  await assert.rejects(
    mountAiWorldVisual({ descriptor, ...deps }),
    (error) => error instanceof AiWorldAssetError &&
      !error.message.includes("signed-url-secret"),
  );
  assert.equal(deps.scene.children.length, 0);
  assert.equal(deps.nodes[0].disposed, true);
  assert.equal(deps.nodes[1].disposed, true);
});


test("missing Spark readiness promise cannot look like successful rendering", async () => {
  const deps = harness();
  const ActualMesh = deps.SplatMesh;
  class MissingReadiness extends ActualMesh {
    constructor(options) {
      super(options);
      this.initialized = undefined;
    }
  }
  await assert.rejects(
    mountAiWorldVisual({ descriptor, ...deps, SplatMesh: MissingReadiness }),
    AiWorldAssetError,
  );
  assert.equal(deps.scene.children.length, 0);
  assert.equal(deps.nodes[0].disposed, true);
  assert.equal(deps.nodes[1].disposed, true);
});
