"use strict";

const { loadWorldAiSceneCatalog, SECRET_FILE } = require("../worldAiCatalogFile.cjs");

const worldId = "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a";
const splat = "a".repeat(64), collider = "b".repeat(64);
function catalogFixture() {
  return {
    schemaVersion: 1,
    approvedHosts: ["assets.example.org"],
    scenes: [{
      country: "jp", providerWorldId: worldId,
      generatedByAi: true, aiContentLabelRequired: true, interactionReady: false,
      ownerApproved: true, commercialRightsApproved: true,
      assetDeliveryApproved: true, privacyReviewed: true,
      splatSha256: splat, colliderSha256: collider,
      splat100kUrl: "https://assets.example.org/world/scene.spz",
      colliderGlbUrl: "https://assets.example.org/world/physics.glb",
      worldSpatialScale: 1, groundPlaneOffset: 0,
      navigation: {
        schemaVersion: 1, country: "jp", providerWorldId: worldId,
        colliderSha256: collider, splatSha256: splat,
        coordinateFrame: "three-y-up-meters",
        width: 16, height: 16, originX: -8, originZ: -8, cellSize: 1,
        floorY: Array.from({ length: 16 }, () => Array(16).fill(0)),
        spawn: { x: 0, y: 0, z: 0, yaw: 0 },
      },
    }],
  };
}
function fakeFile(document) {
  const contents = JSON.stringify(document);
  return {
    statSync(path) {
      expect(path).toBe(SECRET_FILE);
      return { isFile: () => true, size: Buffer.byteLength(contents) };
    },
    readFileSync(path, encoding) {
      expect(path).toBe(SECRET_FILE);
      expect(encoding).toBe("utf8");
      return contents;
    },
  };
}

describe("World AI scenes load only from the isolated test secret file", () => {
  test("missing feature flag performs no file I/O and exposes no AI world", () => {
    let touched = false;
    const catalog = loadWorldAiSceneCatalog({ WORLD_TEST_MODE: "isolated" }, {
      statSync() { touched = true; throw new Error("Unexpected file access"); },
      readFileSync() { touched = true; throw new Error("Unexpected file access"); },
    });
    expect(touched).toBe(false);
    expect(catalog.get("jp")).toBeNull();
  });

  test("explicit flag accepts a validated, operator-supplied scene only", () => {
    const catalog = loadWorldAiSceneCatalog({
      WORLD_TEST_MODE: "isolated", WORLD_TEST_AI_ASSETS_ENABLED: "true",
    }, fakeFile(catalogFixture()));
    const approved = catalog.get("jp");
    expect(approved.descriptor.providerWorldId).toBe(worldId);
    expect(approved.navigation.validPoint(approved.navigation.spawn)).toBe(true);
    expect(approved.manifest.floorY).toHaveLength(16);
    expect(approved.manifest.colliderSha256).toBe(collider);
    expect(approved.manifest).not.toHaveProperty("ownerApproved");
    expect(approved.manifest).not.toHaveProperty("jwtSecret");
  });

  test("incorrect mode and malformed enable flags must fail closed", () => {
    expect(() => loadWorldAiSceneCatalog({ WORLD_TEST_MODE: "production" }))
      .toThrow(/isolated/);
    expect(() => loadWorldAiSceneCatalog({
      WORLD_TEST_MODE: "isolated", WORLD_TEST_AI_ASSETS_ENABLED: "yes",
    })).toThrow(/invalid enable flag/);
  });

  test("missing, too-large or forged secret-file data prevents startup", () => {
    const env = { WORLD_TEST_MODE: "isolated", WORLD_TEST_AI_ASSETS_ENABLED: "true" };
    expect(() => loadWorldAiSceneCatalog(env, {
      statSync() { throw new Error("secret-url-or-password"); },
    })).toThrow("World AI catalog: reviewed secret file unavailable");
    expect(() => loadWorldAiSceneCatalog(env, {
      statSync() { return { isFile: () => true, size: 3 * 1024 * 1024 }; },
    })).toThrow("World AI catalog: reviewed secret file unavailable");
    for (const change of [
      (doc) => { doc.scenes[0].commercialRightsApproved = false; },
      (doc) => { doc.scenes[0].navigation.splatSha256 = "c".repeat(64); },
      (doc) => { doc.scenes[0].splat100kUrl = "https://different.invalid/scene.spz"; },
    ]) {
      const doc = catalogFixture();
      change(doc);
      expect(() => loadWorldAiSceneCatalog(env, fakeFile(doc))).toThrow();
    }
  });
});
