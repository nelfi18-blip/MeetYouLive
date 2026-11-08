import test from "node:test";
import assert from "node:assert/strict";
import { loadApprovedAiWorldScene } from "../lib/vcr/loadAiWorldScene.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const descriptor = Object.freeze({
  generatedByAi: true, aiContentLabelRequired: true, interactionReady: false,
  colliderGlbUrl: "https://approved.example.org/test.glb",
  splat100kUrl: "https://approved.example.org/test.spz",
  worldSpatialScale: 1.4, groundPlaneOffset: 0.8,
});

function mockGlb() {
  const body = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, buffers: [{ byteLength: 4 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  }));
  const length = Math.ceil(body.length / 4) * 4;
  const result = new Uint8Array(20 + length);
  const header = new DataView(result.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true);
  header.setUint32(8, result.length, true);
  header.setUint32(12, length, true); header.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20); result.set(body, 20);
  return result;
}

function setup({ failSplats = false } = {}) {
  const owned = [];
  class Group {
    constructor() {
      this.children = []; this.rotation = { x: 0 };
      this.position = { y: 0 }; this.scale = { setScalar: (n) => { this.s = n; } };
    }
    add(node) { node.parent = this; this.children.push(node); }
    updateMatrixWorld() {}
    removeFromParent() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((node) => node !== this);
      this.parent = null;
    }
    traverse(fn) { fn(this); this.children.forEach((node) => node.traverse(fn)); }
  }
  class Surface extends Group {
    constructor() { super(); this.isMesh = true; this.geometry = { dispose() {} }; }
  }
  class GLTFLoader {
    parse(_body, _path, resolve) {
      const world = new Group();
      world.add(new Surface());
      resolve({ scene: world });
    }
  }
  class SparkRenderer extends Group {
    constructor() { super(); owned.push(this); }
    dispose() { this.disposed = true; }
  }
  class SplatMesh extends Group {
    constructor({ fileBytes }) {
      super(); assert.deepEqual([...fileBytes], [1, 2, 3]);
      this.numSplats = 3;
      this.initialized = failSplats
        ? Promise.reject(new Error("secret-signed-url"))
        : Promise.resolve(this);
      owned.push(this);
    }
    dispose() { this.disposed = true; }
  }
  const bytes = mockGlb();
  const dependencies = {
    GLTFLoader, SparkRenderer, SplatMesh,
    fetchAsset: async (url, options) => {
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      if (url === descriptor.splat100kUrl) {
        let sent = false;
        return {
          ok: true, redirected: false,
          headers: { get: () => "3" },
          body: { getReader() { return {
            async read() {
              if (sent) return { done: true };
              sent = true;
              return { done: false, value: new Uint8Array([1, 2, 3]) };
            },
            async cancel() {}, releaseLock() {},
          }; } },
        };
      }
      assert.equal(url, descriptor.colliderGlbUrl);
      return {
        ok: true, redirected: false,
        headers: { get: () => String(bytes.length) },
        arrayBuffer: async () => bytes.buffer,
      };
    },
  };
  return { THREE: { Group }, renderer: {}, scene: new Group(), dependencies, owned };
}

test("A completed Marble asset set can mount without pretending multiplayer is ready", async () => {
  const fixture = setup();
  const result = await loadApprovedAiWorldScene({ descriptor, ...fixture });
  assert.equal(result.generatedByAi, true);
  assert.equal(result.visualReady, true);
  assert.equal(result.colliderReady, true);
  assert.equal(result.multiplayerMovementReady, false);
  assert.equal(fixture.scene.children.length, 2);
  result.dispose(); result.dispose();
  assert.equal(fixture.scene.children.length, 0);
  assert.ok(fixture.owned.every((node) => node.disposed));
});

test("Missing approvals or a failed visual layer cleanly rejects the complete scene", async () => {
  const fixture = setup({ failSplats: true });
  await assert.rejects(
    loadApprovedAiWorldScene({ descriptor, ...fixture }),
    (error) => error instanceof AiWorldAssetError && !error.message.includes("secret-signed-url"),
  );
  assert.equal(fixture.scene.children.length, 0);
  assert.ok(fixture.owned.every((node) => node.disposed));
  await assert.rejects(
    loadApprovedAiWorldScene({ descriptor: { ...descriptor, generatedByAi: false }, ...setup() }),
    AiWorldAssetError,
  );
});
