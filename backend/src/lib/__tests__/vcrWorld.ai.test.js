"use strict";

const { createVcrWorld } = require("../vcrWorld.js");
const { createWorldAiSceneCatalog } = require("../worldAiSceneCatalog.cjs");

const worldId = "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a";
const splatHash = "a".repeat(64), colliderHash = "b".repeat(64);
const approvedRecord = () => {
  const floorY = Array.from({ length: 16 }, () => Array(16).fill(0));
  // x=2 to x=3 is a solid wall: no player may cross it.
  floorY.forEach((row) => { row[10] = null; });
  return {
    country: "jp", providerWorldId: worldId,
    generatedByAi: true, aiContentLabelRequired: true, interactionReady: false,
    ownerApproved: true, commercialRightsApproved: true,
    assetDeliveryApproved: true, privacyReviewed: true,
    splatSha256: splatHash, colliderSha256: colliderHash,
    splat100kUrl: "https://assets.example.org/world/visual.spz",
    colliderGlbUrl: "https://assets.example.org/world/physics.glb",
    worldSpatialScale: 1.42, groundPlaneOffset: 0.34,
    navigation: {
      schemaVersion: 1, country: "jp", providerWorldId: worldId,
      colliderSha256: colliderHash, splatSha256: splatHash,
      coordinateFrame: "three-y-up-meters", width: 16, height: 16,
      originX: -8, originZ: -8, cellSize: 1, floorY,
      spawn: { x: 0, y: 0, z: 0, yaw: 0 },
    },
  };
};

function makeHarness(approved = false) {
  const usersById = new Map();
  const users = {
    findById: (id) => ({ select: () => ({ lean: async () => usersById.get(id) }) }),
    find: () => ({ select: () => ({ lean: async () => [...usersById.values()] }) }),
  };
  const aiSceneCatalog = approved
    ? createWorldAiSceneCatalog([approvedRecord()], { approvedHosts: ["assets.example.org"] })
    : createWorldAiSceneCatalog();
  let connected;
  const ns = { server: { httpServer: { once() {} } },
    on: (_event, handler) => { connected = handler; } };
  let time = 1000;
  const world = createVcrWorld(ns, { users, now: () => time, aiSceneCatalog });
  const sockets = new Map();
  function user(id) {
    const sent = [], handlers = new Map();
    usersById.set(id, { _id: id, username: id, role: "user", blockedUsers: [] });
    const socket = {
      id, _userId: id, connected: true,
      data: { vcrTokenExpiresAt: 100000 },
      emit(name, data) { sent.push({ name, data }); },
      on(name, handler) { handlers.set(name, handler); },
    };
    connected(socket);
    const item = {
      sent, handlers, socket,
      async join(payload) {
        let response;
        await handlers.get("vcr:join")(payload, (result) => { response = result; });
        return response;
      },
      move(payload) { handlers.get("vcr:move")(payload); },
      travel(payload) {
        let response;
        handlers.get("vcr:travel")(payload, (result) => { response = result; });
        return response;
      },
    };
    sockets.set(id, item);
    return item;
  }
  return { world, usersById, user, advance(ms) { time += ms; } };
}

const aiJoin = () => ({
  version: 1, country: "jp", scene: "ai", providerWorldId: worldId,
  splatSha256: splatHash, colliderSha256: colliderHash,
});
const oldJoin = () => ({ version: 1, country: "jp" });

describe("World AI server authority is opt-in and never mixes the old scene", () => {
  let current;
  afterEach(() => current?.world.close());

  test("missing approved scene refuses AI join; existing prototype still works", async () => {
    const h = makeHarness(false); current = h;
    const visitor = h.user("alice");
    expect((await visitor.join(aiJoin())).code).toBe("AI_SCENE_UNAVAILABLE");
    expect(h.world.members.size).toBe(0);
    const legacy = await visitor.join(oldJoin());
    expect(legacy.ok).toBe(true);
    expect(legacy.position).toEqual({ x: 0, z: 0, yaw: 0 });
    expect(h.world.members.get("alice").sceneMode).toBe("prototype");
  });

  test("AI and prototype users cannot share instances or see each other", async () => {
    const h = makeHarness(true); current = h;
    const a = h.user("alice"), b = h.user("bob"), c = h.user("carol");
    const joinedA = await a.join(aiJoin());
    const joinedB = await b.join(aiJoin());
    const joinedC = await c.join(oldJoin());
    expect(joinedA.ok).toBe(true);
    expect(joinedA.position).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
    expect(joinedA.providerWorldId).toBe(worldId);
    expect(joinedA.splatSha256).toBe(splatHash);
    expect(joinedA.colliderSha256).toBe(colliderHash);
    expect(joinedA.instanceId).toBe(joinedB.instanceId);
    expect(joinedC.instanceId).not.toBe(joinedA.instanceId);
    expect(JSON.stringify(joinedA)).not.toContain("assets.example.org");
    await h.world.publish();
    const last = (s) => s.sent.filter((e) => e.name === "vcr:snapshot").at(-1).data;
    expect(last(a).peers.map((x) => x.userId)).toEqual(["bob"]);
    expect(last(b).peers.map((x) => x.userId)).toEqual(["alice"]);
    expect(last(c).peers).toEqual([]);
  });

  test("forged world identifiers, bad digests and unsupported modes cannot join", async () => {
    const h = makeHarness(true); current = h;
    const a = h.user("alice");
    for (const changed of [
      { providerWorldId: "other" },
      { splatSha256: "c".repeat(64) },
      { colliderSha256: "c".repeat(64) },
    ]) {
      expect((await a.join({ ...aiJoin(), ...changed })).code).toBe("AI_SCENE_MISMATCH");
    }
    expect((await a.join({ ...aiJoin(), scene: "other" })).code).toBe("INVALID_SCENE");
    expect(h.world.members.size).toBe(0);
  });

  test("generated collider and server speed validation reject wall jumps and fake heights", async () => {
    const h = makeHarness(true); current = h;
    const a = h.user("alice");
    const joined = await a.join(aiJoin());
    expect(joined.ok).toBe(true);
    h.advance(1000);
    a.move({ membership: joined.membership, position: { x: 0.35, y: 0, z: 0, yaw: 0 } });
    expect(h.world.members.get("alice").position.x).toBeCloseTo(0.35);
    h.advance(500);
    a.move({ membership: joined.membership, position: { x: 3, y: 0, z: 0, yaw: 0 } });
    expect(a.sent.at(-1).name).toBe("vcr:correct");
    expect(h.world.members.get("alice").position.x).toBeCloseTo(0.35);
    h.advance(100);
    a.move({ membership: joined.membership, position: { x: 0.5, y: 4, z: 0, yaw: 0 } });
    expect(a.sent.at(-1).name).toBe("vcr:correct");
    expect(a.travel({ membership: joined.membership, zone: "neon" })).toEqual({ ok: false });
  });
});
