import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import navigationCore from "../../backend/src/lib/worldAiNavigation.cjs";
import { createApprovedAiWorldWalk } from "../lib/vcr/aiWorldWalk.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const descriptor = {
  country: "us", providerWorldId: "a1111111-2222-4333-8444-555555555555",
  generatedByAi: true, aiContentLabelRequired: true, interactionReady: false,
  splatSha256: "a".repeat(64), colliderSha256: "b".repeat(64),
};
const navigation = navigationCore.makeNavigation({
  schemaVersion: 1, country: descriptor.country, providerWorldId: descriptor.providerWorldId,
  splatSha256: descriptor.splatSha256, colliderSha256: descriptor.colliderSha256,
  coordinateFrame: "three-y-up-meters", width: 16, height: 16,
  originX: -8, originZ: -8, cellSize: 1,
  floorY: Array.from({ length: 16 }, () => Array(16).fill(0)),
  spawn: { x: 0, y: 0, z: 0, yaw: 0 },
});

function harness(t) {
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  let renderCount = 0, rendererDisposed = false, sceneDisposed = false;
  const frames = new Map(), handlers = new Map();
  let nextFrame = 0;
  globalThis.window = {
    devicePixelRatio: 1, innerWidth: 390,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  globalThis.document = {
    hidden: false, addEventListener() {}, removeEventListener() {},
  };
  t.after(() => { globalThis.window = originalWindow; globalThis.document = originalDocument; });
  class WebGLRenderer {
    setPixelRatio() {}
    setSize() {}
    render() { renderCount++; }
    dispose() { rendererDisposed = true; }
  }
  class PerspectiveCamera {
    position = { set() {} };
    updateProjectionMatrix() {}
    lookAt() {}
  }
  const THREE = {
    WebGLRenderer, PerspectiveCamera,
    Scene: class { constructor() { this.background = null; } },
    Color: class {},
    SRGBColorSpace: "srgb",
  };
  const canvas = {
    clientWidth: 390, clientHeight: 680, addEventListener(type, cb) { handlers.set(type, cb); },
    removeEventListener(type) { handlers.delete(type); },
  };
  const loadScene = async () => ({
    visualReady: true, colliderReady: true,
    dispose() { sceneDisposed = true; },
  });
  return {
    canvas, THREE, loadScene, handlers,
    draw() { for (const [id, fn] of [...frames]) { frames.delete(id); fn(performance.now() + 50); } },
    stats() { return { renderCount, rendererDisposed, sceneDisposed, handlers: handlers.size }; },
  };
}

test("Approved generated scene has real navigation after ACK, never before", async (t) => {
  const h = harness(t);
  const stage = await createApprovedAiWorldWalk({
    ...h, descriptor, navigation, isolationMode: "isolated",
  });
  assert.ok(h.stats().renderCount >= 1, "actual THREE renderer executes");
  stage.setDirection("forward", true);
  assert.equal(stage.getPosition().z, 0);
  stage.setInputEnabled(true); // same transition as verified vcr:join ACK
  stage.setDirection("forward", true);
  h.draw();
  assert.ok(stage.getPosition().z < 0, "position moves through approved navigation");
  stage.setInputEnabled(false);
  const held = stage.getPosition().z;
  h.draw();
  assert.equal(stage.getPosition().z, held, "disconnect freezes movement");
  stage.dispose(); stage.dispose();
  assert.equal(h.stats().rendererDisposed, true);
  assert.equal(h.stats().sceneDisposed, true);
  assert.equal(h.stats().handlers, 0);
});

test("Unapproved environment or missing assets cannot expose a walkable scene", async (t) => {
  const h = harness(t);
  await assert.rejects(createApprovedAiWorldWalk({
    ...h, descriptor, navigation, isolationMode: "production",
  }), AiWorldAssetError);
  await assert.rejects(createApprovedAiWorldWalk({
    ...h, descriptor, navigation, isolationMode: "isolated",
    loadScene: async () => ({ visualReady: false, colliderReady: false, dispose() {} }),
  }), AiWorldAssetError);
  assert.equal(h.stats().rendererDisposed, true);
});

test("UI uses AI mode only with an isolated authenticated server approved descriptor", async () => {
  const root = new URL("../", import.meta.url);
  const read = (name) => readFile(new URL(name, root), "utf8");
  const [page, oldWalk, aiWalk] = await Promise.all([
    read("app/vcr/page.jsx"),
    read("components/vcr/WalkableWorld.jsx"),
    read("components/vcr/AiWalkableWorld.jsx"),
  ]);
  assert.match(page, /walkSession\.mode === "ai"/);
  assert.match(oldWalk, /fetchApprovedAiWorldSession/);
  assert.match(oldWalk, /ISOLATED_WORLD && approvedAi/);
  assert.match(oldWalk, /module\.createVcrDistrict\(THREE, canvasRef\.current, \{/);
  assert.match(aiWalk, /fetchApprovedAiWorldSession/);
  assert.match(aiWalk, /createApprovedAiWorldWalk/);
  assert.match(aiWalk, /aiScene: approved\.descriptor/);
  assert.match(aiWalk, /session\.join\(initialCountry, "violet", sharePhoto\)/);
  assert.doesNotMatch(aiWalk, /meetyoulive\.onrender\.com(?!.*-world-test)|Stripe|generateImage/);
});
