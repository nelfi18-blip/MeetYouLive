import test from "node:test";
import assert from "node:assert/strict";
import { prepareApprovedAiWorld, AiWorldAssetError } from "../lib/vcr/aiWorldAssets.mjs";

const id = "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a";
const policy = Object.freeze({
  environment: "isolated",
  country: "jp",
  providerWorldId: id,
  splatSha256: "a".repeat(64),
  colliderSha256: "b".repeat(64),
  ownerApproved: true,
  commercialRightsApproved: true,
  assetDeliveryApproved: true,
  privacyReviewed: true,
  allowedAssetHosts: ["assets.example.org"],
});
const world = () => ({
  id, model: "marble-1.1",
  assets: {
    splats: {
      spz_urls: {
        "100k": "https://assets.example.org/world/sample-100k.spz",
        "500k": "https://assets.example.org/world/sample-500k.spz",
      },
      semantics_metadata: { metric_scale_factor: 1.23, ground_plane_offset: 0.42 },
    },
    mesh: { collider_mesh_url: "https://assets.example.org/world/collider.glb" },
  },
});
const rejects = (fn) => assert.throws(fn, AiWorldAssetError);

test("Marble generated world assets are accepted only with explicit policy gates", () => {
  const result = prepareApprovedAiWorld({ world: world() }, policy);
  assert.equal(result.generatedByAi, true);
  assert.equal(result.interactionReady, false);
  assert.equal(result.aiContentLabelRequired, true);
  assert.equal(result.providerWorldId, id);
  assert.equal(result.country, "jp");
  assert.equal(result.splatSha256, policy.splatSha256);
  assert.equal(result.colliderSha256, policy.colliderSha256);
  assert.equal(result.worldSpatialScale, 1.23);
  assert.match(result.splat100kUrl, /sample-100k\.spz$/);
  assert.match(result.colliderGlbUrl, /collider\.glb$/);
  assert.ok(Object.isFrozen(result));
});

test("World intake has no implicit production, spending or consent authorization", () => {
  for (const key of ["ownerApproved", "commercialRightsApproved",
    "assetDeliveryApproved", "privacyReviewed"]) {
    rejects(() => prepareApprovedAiWorld(world(), { ...policy, [key]: false }));
  }
  rejects(() => prepareApprovedAiWorld(world(), { ...policy, environment: "production" }));
  rejects(() => prepareApprovedAiWorld(world(), { ...policy, country: "xx" }));
  rejects(() => prepareApprovedAiWorld(world(), { ...policy, allowedAssetHosts: [] }));
  rejects(() => prepareApprovedAiWorld(world(), { ...policy, providerWorldId: "wrong" }));
  rejects(() => prepareApprovedAiWorld(world(), { ...policy, splatSha256: "" }));
  rejects(() => prepareApprovedAiWorld(world(), { ...policy, colliderSha256: "a".repeat(63) }));
});

test("Reject provider worlds missing valid identity, spatial scale or collider", () => {
  const invalidId = world(); invalidId.id = "fake-world";
  rejects(() => prepareApprovedAiWorld(invalidId, policy));
  const noCollider = world(); delete noCollider.assets.mesh.collider_mesh_url;
  rejects(() => prepareApprovedAiWorld(noCollider, policy));
  const noSplats = world(); delete noSplats.assets.splats.spz_urls["100k"];
  rejects(() => prepareApprovedAiWorld(noSplats, policy));
  const noScale = world(); noScale.assets.splats.semantics_metadata.metric_scale_factor = NaN;
  rejects(() => prepareApprovedAiWorld(noScale, policy));
  const noGround = world(); noGround.assets.splats.semantics_metadata.ground_plane_offset = "0";
  rejects(() => prepareApprovedAiWorld(noGround, policy));
});

test("Reject external, non-HTTPS and misleading asset addresses", () => {
  for (const url of [
    "http://assets.example.org/world/a.spz",
    "https://assets.example.org.evil.invalid/world/a.spz",
    "https://localhost/world/a.spz",
    "file:///world/a.spz",
    "data:text/plain,a",
    "https://user:pass@assets.example.org/world/a.spz",
    "https://assets.example.org/world/a.glb",
    "https://assets.example.org/world/a.spz#fragment",
  ]) {
    const changed = world();
    changed.assets.splats.spz_urls["100k"] = url;
    rejects(() => prepareApprovedAiWorld(changed, policy));
  }
  rejects(() => prepareApprovedAiWorld(world(), { ...policy, allowedAssetHosts: ["localhost"] }));
});
