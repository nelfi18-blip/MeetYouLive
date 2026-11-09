"use strict";

const { createWorldAiSceneCatalog } = require("../worldAiSceneCatalog.cjs");

const worldId = "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a";
const splatHash = "a".repeat(64);
const colliderHash = "b".repeat(64);
const hosts = ["assets.example.org"];
function syntheticRecord() {
  return {
    country: "jp", providerWorldId: worldId,
    generatedByAi: true, aiContentLabelRequired: true, interactionReady: false,
    ownerApproved: true, commercialRightsApproved: true,
    assetDeliveryApproved: true, privacyReviewed: true,
    splatSha256: splatHash, colliderSha256: colliderHash,
    splat100kUrl: "https://assets.example.org/world/visual.spz?temporary=1",
    colliderGlbUrl: "https://assets.example.org/world/physics.glb",
    worldSpatialScale: 1.42, groundPlaneOffset: 0.34,
    navigation: {
      schemaVersion: 1, country: "jp", providerWorldId: worldId,
      colliderSha256: colliderHash, splatSha256: splatHash,
      coordinateFrame: "three-y-up-meters",
      width: 16, height: 16, cellSize: 1, originX: -8, originZ: -8,
      floorY: Array.from({ length: 16 }, () => Array(16).fill(0)),
      spawn: { x: 0, y: 0, z: 0, yaw: 0 },
    },
  };
}

describe("World AI registry is a strict server-only opt-in", () => {
  test("no server-approved scene means no AI world is available", () => {
    const catalog = createWorldAiSceneCatalog();
    expect(catalog.get("jp")).toBeNull();
    expect(catalog.countries()).toEqual([]);
  });

  test("approved synthetic spatial pair retains one server navigation map", () => {
    const catalog = createWorldAiSceneCatalog([syntheticRecord()], { approvedHosts: hosts });
    const scene = catalog.get("jp");
    expect(scene.navigation.validPoint(scene.navigation.spawn)).toBe(true);
    expect(scene.descriptor.providerWorldId).toBe(worldId);
    expect(scene.descriptor.interactionReady).toBe(false);
    expect(scene.descriptor.aiContentLabelRequired).toBe(true);
    expect(scene.descriptor.splatSha256).toBe(splatHash);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(catalog.get("us")).toBeNull();
    expect(catalog.countries()).toEqual(["jp"]);
    expect(JSON.stringify(scene.descriptor)).not.toContain("ownerApproved");
  });

  test("rights and consent review cannot be assumed from a model response", () => {
    for (const field of [
      "ownerApproved", "commercialRightsApproved",
      "assetDeliveryApproved", "privacyReviewed",
    ]) {
      const bad = syntheticRecord();
      bad[field] = false;
      expect(() => createWorldAiSceneCatalog([bad], { approvedHosts: hosts }))
        .toThrow(/review required/);
    }
  });

  test("different world IDs, GLB/SPZ digests or coordinate frames fail closed", () => {
    for (const mutate of [
      (r) => { r.navigation.providerWorldId = "e".repeat(36); },
      (r) => { r.navigation.splatSha256 = "c".repeat(64); },
      (r) => { r.navigation.colliderSha256 = "c".repeat(64); },
      (r) => { r.navigation.country = "fr"; },
      (r) => { r.navigation.coordinateFrame = "opencv"; },
      (r) => { r.splatSha256 = "not-a-sha"; },
    ]) {
      const bad = syntheticRecord();
      mutate(bad);
      expect(() => createWorldAiSceneCatalog([bad], { approvedHosts: hosts })).toThrow();
    }
  });

  test("unapproved hosts, types, duplicates and untrusted scene flags are rejected", () => {
    for (const mutate of [
      (r) => { r.splat100kUrl = "https://assets.example.org.evil.invalid/visual.spz"; },
      (r) => { r.colliderGlbUrl = "http://assets.example.org/physics.glb"; },
      (r) => { r.colliderGlbUrl = "https://assets.example.org/physics.jpg"; },
      (r) => { r.interactionReady = true; },
      (r) => { r.generatedByAi = false; },
    ]) {
      const bad = syntheticRecord();
      mutate(bad);
      expect(() => createWorldAiSceneCatalog([bad], { approvedHosts: hosts })).toThrow();
    }
    expect(() => createWorldAiSceneCatalog([syntheticRecord(), syntheticRecord()],
      { approvedHosts: hosts })).toThrow(/duplicate/);
    expect(() => createWorldAiSceneCatalog([syntheticRecord()],
      { approvedHosts: [] })).toThrow();
  });
});

module.exports = { syntheticRecord, hosts };
