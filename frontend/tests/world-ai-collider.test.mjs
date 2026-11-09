import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateMarbleColliderGlb, loadMarbleCollider } from "../lib/vcr/aiWorldCollider.mjs";
import { AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

function glb(document = {}) {
  const json = JSON.stringify({
    asset: { version: "2.0" }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 4 }], ...document,
  });
  const encoded = new TextEncoder().encode(json);
  const padded = Math.ceil(encoded.length / 4) * 4;
  const bytes = new Uint8Array(20 + padded);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true); view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20);
  bytes.set(encoded, 20);
  return bytes;
}

const descriptor = Object.freeze({
  generatedByAi: true, interactionReady: false,
  colliderSha256: createHash("sha256").update(glb()).digest("hex"),
  colliderGlbUrl: "https://approved.example.org/collider.glb",
  worldSpatialScale: 1.23, groundPlaneOffset: 0.42,
});

function environment({ failedParse = false } = {}) {
  const nodes = [];
  class Group {
    constructor() {
      this.rotation = { x: 0 }; this.position = { y: 0 };
      this.scale = { setScalar: (x) => { this.value = x; } };
      this.children = [];
    }
    add(child) { this.children.push(child); child.parent = this; }
    updateMatrixWorld() { this.updated = true; }
    removeFromParent() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
    traverse(fn) { fn(this); this.children.forEach((child) => child.traverse(fn)); }
  }
  class Surface extends Group {
    constructor() {
      super(); this.isMesh = true;
      this.geometry = { dispose: () => { this.disposed = true; } };
    }
  }
  class GLTFLoader {
    parse(_bytes, path, resolve, reject) {
      if (failedParse) return reject(new Error("private-token-on-URL"));
      assert.equal(path, "");
      const root = new Group(), surface = new Surface();
      root.add(surface); nodes.push(surface);
      resolve({ scene: root });
    }
  }
  const bytes = glb();
  const fetchAsset = async (url, opts) => {
    assert.equal(url, descriptor.colliderGlbUrl);
    assert.equal(opts.redirect, "error");
    assert.equal(opts.credentials, "omit");
    return { ok: true, redirected: false, headers: { get: () => String(bytes.length) },
      arrayBuffer: async () => bytes.buffer };
  };
  return { THREE: { Group }, GLTFLoader, fetchAsset, nodes };
}

test("Valid reviewed collider is loaded with same metric frame, outside visible scene", async () => {
  const deps = environment();
  const geometry = await loadMarbleCollider({ descriptor, ...deps });
  assert.equal(geometry.colliderReady, true);
  assert.equal(geometry.interactionReady, false);
  assert.equal(geometry.meshCount, 1);
  assert.equal(geometry.colliderRoot.rotation.x, Math.PI);
  assert.equal(geometry.colliderRoot.children[0].value, 1.23);
  assert.equal(geometry.colliderRoot.children[0].position.y, -0.42);
  geometry.dispose(); geometry.dispose();
  assert.equal(deps.nodes[0].disposed, true);
});

test("Untrusted, malformed or remote-dependency GLB fails before GLTFLoader", () => {
  assert.equal(validateMarbleColliderGlb(glb()).meshes, 1);
  const bad = glb(); bad[0] = 0;
  assert.throws(() => validateMarbleColliderGlb(bad), AiWorldAssetError);
  assert.throws(() => validateMarbleColliderGlb(glb({ buffers: [{ uri: "https://bad.example/file.bin" }] })), AiWorldAssetError);
  assert.throws(() => validateMarbleColliderGlb(glb({ images: [{ uri: "https://bad.example/logo.png" }] })), AiWorldAssetError);
  assert.throws(() => validateMarbleColliderGlb(glb({ meshes: [] })), AiWorldAssetError);
  assert.throws(() => validateMarbleColliderGlb(new Uint8Array(4)), AiWorldAssetError);
});

test("No asset, cancelled load, or invalid loader never authorizes movement", async () => {
  const deps = environment();
  await assert.rejects(loadMarbleCollider({ descriptor: { ...descriptor, interactionReady: true }, ...deps }), AiWorldAssetError);
  await assert.rejects(loadMarbleCollider({ descriptor, ...deps, signal: { aborted: true } }), AiWorldAssetError);
  await assert.rejects(loadMarbleCollider({ descriptor, ...deps, fetchAsset: async () => ({ ok: false }) }), AiWorldAssetError);
  await assert.rejects(loadMarbleCollider({ descriptor, ...environment({ failedParse: true }) }),
    (error) => error instanceof AiWorldAssetError && !error.message.includes("private-token"));
});
