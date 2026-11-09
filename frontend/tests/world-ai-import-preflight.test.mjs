import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { prepareWorldAiCatalog, writePrivateCatalog, validateSpzStructure } =
  require("../../backend/scripts/world-ai-import-preflight.cjs");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function mockSpz() {
  // A structurally valid Niantic v3 gzip/SPZ file, not a real 3D scene.
  const raw = Buffer.alloc(16 + 20, 0);
  raw.writeUInt32LE(0x5053474e, 0);
  raw.writeUInt32LE(3, 4);
  raw.writeUInt32LE(1, 8); // 1 gaussian, SH degree 0
  raw[12] = 0; raw[13] = 12;
  return gzipSync(raw);
}

function mockGlb() {
  // Metadata fixture only: it is not a licensed, spatially reviewed world.
  const payload = Buffer.from(JSON.stringify({
    asset: { version: "2.0" },
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 4 }],
  }));
  const padded = Math.ceil(payload.length / 4) * 4;
  const bytes = Buffer.alloc(20 + padded, 32);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  payload.copy(bytes, 20);
  return bytes;
}

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "world-ai-import-"));
  t.after(() => fs.rmSync(temp, { force: true, recursive: true }));
  const spz = mockSpz();
  const glb = mockGlb();
  const spzFile = path.join(temp, "world.spz");
  const glbFile = path.join(temp, "world.glb");
  fs.writeFileSync(spzFile, spz);
  fs.writeFileSync(glbFile, glb);
  const worldId = "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a";
  const country = "us";
  const splatSha256 = digest(spz), colliderSha256 = digest(glb);
  const request = {
    schemaVersion: 1, provider: "worldlabs-marble",
    country, providerWorldId: worldId,
    spzFile, glbFile, worldSpatialScale: 1.23, groundPlaneOffset: 0.42,
    splat100kUrl: "https://assets.example.org/ny-100k.spz",
    colliderGlbUrl: "https://assets.example.org/ny-collider.glb",
    approvedHosts: ["assets.example.org"],
    review: { ownerApproved: true, commercialRightsApproved: true,
      assetDeliveryApproved: true, privacyReviewed: true },
    evidence: {
      licenseReference: "human-reviewed-license-record",
      assetReviewReference: "human-reviewed-asset-record",
      privacyReviewReference: "human-reviewed-privacy-record",
    },
    navigation: {
      schemaVersion: 1, country, providerWorldId: worldId,
      splatSha256, colliderSha256,
      coordinateFrame: "three-y-up-meters",
      width: 16, height: 16, originX: -8, originZ: -8,
      cellSize: 1,
      floorY: Array.from({ length: 16 }, () => Array(16).fill(0)),
      spawn: { x: 0, y: 0, z: 0, yaw: 0 },
    },
  };
  return { temp, request, spzFile, glbFile };
}

test("Offline import pins actual files to server nav without generating or fetching", async (t) => {
  const f = fixture(t);
  const catalog = await prepareWorldAiCatalog(f.request);
  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(catalog.approvedHosts, ["assets.example.org"]);
  assert.equal(catalog.scenes.length, 1);
  assert.equal(catalog.scenes[0].country, "us");
  assert.equal(catalog.scenes[0].splatSha256, digest(fs.readFileSync(f.spzFile)));
  assert.equal(catalog.scenes[0].colliderSha256, digest(fs.readFileSync(f.glbFile)));
  assert.equal(catalog.scenes[0].interactionReady, false);
  assert.equal(catalog.scenes[0].commercialRightsApproved, true);
  assert.equal(catalog.scenes[0].navigation.spawn.y, 0);
  assert.equal("spzFile" in catalog.scenes[0], false);
  assert.equal("glbFile" in catalog.scenes[0], false);

  const output = path.join(f.temp, "private-world-ai-scenes.json");
  writePrivateCatalog(output, catalog);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(output)), catalog);
  assert.throws(() => writePrivateCatalog(output, catalog), /EEXIST/);
});

test("Missing approval evidence and invalid host are rejected before publishing", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    prepareWorldAiCatalog({ ...f.request, review: {
      ...f.request.review, commercialRightsApproved: false,
    } }), /commercial rights/,
  );
  await assert.rejects(
    prepareWorldAiCatalog({ ...f.request, evidence: {
      ...f.request.evidence, licenseReference: "",
    } }), /evidence/,
  );
  await assert.rejects(
    prepareWorldAiCatalog({ ...f.request, approvedHosts: ["unexpected.example.com"] }),
    /asset origin or type not approved/,
  );
});

test("Binary swaps, invalid GLB and fabricated navigation fail closed", async (t) => {
  const f = fixture(t);
  fs.appendFileSync(f.spzFile, "changed after approval");
  await assert.rejects(prepareWorldAiCatalog(f.request), /different asset bytes/);
  fs.writeFileSync(f.spzFile, mockSpz());
  fs.writeFileSync(f.glbFile, Buffer.from("invalid-3d-file-contents-over-20"));
  await assert.rejects(prepareWorldAiCatalog(f.request));
  fs.writeFileSync(f.glbFile, mockGlb());
  const badNav = { ...f.request.navigation, spawn: { x: 100, y: 0, z: 0, yaw: 0 } };
  await assert.rejects(prepareWorldAiCatalog({ ...f.request, navigation: badNav }));
});

test("Never write approved URLs into the checked-out GitHub repository", async (t) => {
  const f = fixture(t);
  const catalog = await prepareWorldAiCatalog(f.request);
  const forbidden = fileURLToPath(new URL("../world-ai-secrets.json", import.meta.url));
  assert.throws(() => writePrivateCatalog(forbidden, catalog), /source repository/);
  assert.equal(fs.existsSync(forbidden), false);
});

test("Malformed and oversized SPZ metadata cannot be imported as a real scene", async (t) => {
  const f = fixture(t);
  assert.deepEqual(validateSpzStructure(mockSpz()), {
    version: 3, splats: 1, shDegree: 0,
  });
  const wrong = Buffer.alloc(64);
  fs.writeFileSync(f.spzFile, wrong);
  await assert.rejects(prepareWorldAiCatalog(f.request), /SPZ magic/);
  const many = Buffer.alloc(36);
  many.writeUInt32LE(0x5053474e, 0);
  many.writeUInt32LE(3, 4);
  many.writeUInt32LE(125001, 8);
  many[13] = 12;
  fs.writeFileSync(f.spzFile, gzipSync(many));
  await assert.rejects(prepareWorldAiCatalog(f.request), /mobile/);
  fs.writeFileSync(f.spzFile, Buffer.from([0x1f, 0x8b, ...Array(32).fill(255)]));
  await assert.rejects(prepareWorldAiCatalog(f.request), /invalid or oversized/);
});

test("SPZ v4 header and ZSTD table must be internally consistent", () => {
  const data = Buffer.alloc(32 + 16 + 4, 0);
  data.writeUInt32LE(0x5053474e, 0);
  data.writeUInt32LE(4, 4);
  data.writeUInt32LE(10, 8);
  data[13] = 12;
  data[15] = 1;
  data.writeUInt32LE(32, 16);
  data.writeBigUInt64LE(4n, 32);
  data.writeBigUInt64LE(200n, 40);
  data.writeUInt32LE(0xfd2fb528, 48);
  assert.deepEqual(validateSpzStructure(data), { version: 4, splats: 10, shDegree: 0 });
  // This is only a structural fixture: actual ZSTD decoding is performed by
  // Spark after import, before any AI world is shown as usable.
  data.writeUInt32LE(0, 48);
  assert.throws(() => validateSpzStructure(data), /invalid or truncated/);
  data.writeUInt32LE(0xfd2fb528, 48);
  data.writeBigUInt64LE(40n, 32);
  assert.throws(() => validateSpzStructure(data), /invalid or truncated/);
});
