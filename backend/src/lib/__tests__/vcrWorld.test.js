const { createVcrWorld } = require("../vcrWorld.js");
function fixture(options = {}) {
  const profiles = new Map();
  const users = {
    findById: jest.fn((id) => ({ select: () => ({ lean: async () => profiles.get(id) }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [...profiles.values()] }) })),
  };
  let attach;
  const namespace = { server: { httpServer: { once() {} } }, on(_name, handler) { attach = handler; } };
  let time = 1000;
  const world = createVcrWorld(namespace, { users, now: () => time, ...options });
  function socket(id) {
    const handlers = new Map(), sent = [];
    profiles.set(id, { _id: id, username: id, blockedUsers: [], role: "user" });
    const socket = { id, _userId: id, data: { vcrTokenExpiresAt: 100000 }, connected: true,
      on: (name, handler) => handlers.set(name, handler), emit: (name, data) => sent.push({ name, data }) };
    attach(socket);
    return { socket, sent, handlers, async join(country = "us") {
      let response; await handlers.get("vcr:join")({ version: 1, country }, (r) => { response = r; }); return response;
    } };
  }
  return { world, users, profiles, socket, advance: (ms) => { time += ms; } };
}
describe("VCR bounded instances and async privacy", () => {
  let world;
  afterEach(() => world?.close());
  test("full country instances are isolated and total capacity is enforced", async () => {
    const f = fixture({ capacity: 1, totalCapacity: 2 }); world = f.world;
    const a = f.socket("alice"), b = f.socket("bob"), c = f.socket("carol");
    const first = await a.join(), second = await b.join();
    expect(first.instanceId).not.toBe(second.instanceId); expect((await c.join()).code).toBe("FULL");
    await world.publish();
    for (const entry of [...a.sent, ...b.sent].filter((e) => e.name === "vcr:snapshot")) expect(entry.data.peers).toEqual([]);
  });
  test("a database outage clears presence instead of exposing a cached audience", async () => {
    const f = fixture(); world = f.world; const a = f.socket("alice"); await a.join();
    f.users.find.mockReturnValueOnce({ select: () => ({ lean: async () => { throw new Error("Synthetic unavailable"); } }) });
    await world.publish(); expect(world.members.size).toBe(0);
    expect(a.sent.at(-1)).toMatchObject({ name: "vcr:closed", data: { code: "PRIVACY_UNAVAILABLE" } });
  });
  test("a delayed join cannot resurrect a disconnected or departed avatar", async () => {
    const f = fixture(); world = f.world; const a = f.socket("alice"); let finish;
    f.users.findById.mockReturnValueOnce({ select: () => ({ lean: () => new Promise((resolve) => { finish = resolve; }) }) });
    const pending = a.join(); a.handlers.get("vcr:leave")(); finish(f.profiles.get("alice"));
    expect((await pending).code).toBe("STALE_JOIN"); expect(world.members.size).toBe(0);
  });
  test("a newer country join wins over an older asynchronous lookup", async () => {
    const f = fixture(); world = f.world; const a = f.socket("alice"); let finish;
    f.users.findById.mockReturnValueOnce({ select: () => ({ lean: () => new Promise((resolve) => { finish = resolve; }) }) });
    const old = a.join("us"); f.advance(800); const latest = await a.join("fr"); finish(f.profiles.get("alice"));
    expect((await old).code).toBe("STALE_JOIN"); expect(latest.country).toBe("fr"); expect(world.members.get("alice").country).toBe("fr");
  });
  test("staff accounts and moderated accounts cannot participate", async () => {
    const f = fixture(); world = f.world; const a = f.socket("alice"), b = f.socket("bob");
    f.profiles.get("alice").role = "admin"; f.profiles.get("bob").isBlocked = true;
    expect((await a.join()).code).toBe("FORBIDDEN"); expect((await b.join()).code).toBe("FORBIDDEN");
  });
  test("a moving user cannot cross a country building collider", async () => {
    const f = fixture(); world = f.world; const a = f.socket("alice"), response = await a.join();
    f.advance(1000);
    a.handlers.get("vcr:move")({ membership: response.membership, position: { x: 24, z: 0, yaw: 0 } });
    expect(a.sent.at(-1).name).toBe("vcr:correct"); expect(world.members.get("alice").position.x).toBe(0);
  });
});


describe("World public-photo consent stays private and revocable", () => {
  let world;
  afterEach(() => world?.close());

  test("no photo consent in join yields initials-only presence", async () => {
    const f = fixture(); world = f.world;
    const alice = f.socket("alice"), bob = f.socket("bob");
    f.profiles.get("alice").primaryPhoto = "https://cdn.example.test/alice.jpg";
    await alice.join(); await bob.join(); await world.publish();
    const b = bob.sent.filter((e) => e.name === "vcr:snapshot").at(-1);
    expect(b.data.peers[0]).toMatchObject({ userId: "alice", photoConsent: false });
    expect(JSON.stringify(b.data)).not.toContain("cdn.example.test");
  });

  test("explicit consent allows public-photo display flag without transmitting the photo", async () => {
    const f = fixture(); world = f.world;
    const alice = f.socket("alice"), bob = f.socket("bob");
    f.profiles.get("alice").primaryPhoto = "https://cdn.example.test/alice.jpg";
    let reply;
    await alice.handlers.get("vcr:join")({
      version: 1, country: "us", sharePhoto: true,
    }, (result) => { reply = result; });
    expect(reply.ok).toBe(true);
    await bob.join(); await world.publish();
    const b = bob.sent.filter((e) => e.name === "vcr:snapshot").at(-1);
    expect(b.data.peers[0]).toMatchObject({ userId: "alice", photoConsent: true });
    expect(JSON.stringify(b.data)).not.toContain("cdn.example.test");
    expect(JSON.stringify(b.data)).not.toContain("photoFingerprint");
  });

  test("no main photo means consent is ignored", async () => {
    const f = fixture(); world = f.world;
    const alice = f.socket("alice"), bob = f.socket("bob");
    await alice.handlers.get("vcr:join")({ version: 1, country: "us", sharePhoto: true }, () => {});
    await bob.join(); await world.publish();
    const b = bob.sent.filter((e) => e.name === "vcr:snapshot").at(-1);
    expect(b.data.peers[0].photoConsent).toBe(false);
  });

  test("same-instance peers can only read the public photo after verified consent", async () => {
    const f = fixture(); world = f.world;
    const alice = f.socket("alice"), bob = f.socket("bob");
    const photo = "https://cdn.example.test/public-alice.jpg";
    f.profiles.get("alice").primaryPhoto = photo;
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).toBeNull();
    await alice.handlers.get("vcr:join")({ version: 1, country: "us", sharePhoto: true }, () => {});
    await bob.join();
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).toEqual({ primaryPhoto: photo });
    expect(await f.world.getSharedPublicPhoto("alice", "alice")).toBeNull();
    expect(await f.world.getSharedPublicPhoto("unknown", "alice")).toBeNull();
  });

  test("shared photos fail closed after blocking, country change, revocation or exit", async () => {
    const f = fixture(); world = f.world;
    const alice = f.socket("alice"), bob = f.socket("bob");
    f.profiles.get("alice").primaryPhoto = "https://cdn.example.test/public-alice.jpg";
    const joinAlice = () => alice.handlers.get("vcr:join")(
      { version: 1, country: "us", sharePhoto: true }, () => {});
    await joinAlice(); await bob.join();
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).not.toBeNull();

    f.profiles.get("bob").blockedUsers = ["alice"];
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).toBeNull();
    f.profiles.get("bob").blockedUsers = [];
    f.profiles.get("alice").blockedUsers = ["bob"];
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).toBeNull();
    f.profiles.get("alice").blockedUsers = [];

    f.profiles.get("alice").primaryPhoto = "https://cdn.example.test/new-photo.jpg";
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).toBeNull();
    f.advance(800); await joinAlice();
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).not.toBeNull();

    alice.handlers.get("vcr:leave")();
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).toBeNull();
    f.advance(800); await joinAlice();
    f.advance(800); await bob.join("fr");
    expect(await f.world.getSharedPublicPhoto("bob", "alice")).toBeNull();
  });

  test("changing main photo invalidates consent for the rest of the session", async () => {
    const f = fixture(); world = f.world;
    const alice = f.socket("alice"), bob = f.socket("bob");
    f.profiles.get("alice").primaryPhoto = "https://cdn.example.test/original.jpg";
    await alice.handlers.get("vcr:join")({ version: 1, country: "us", sharePhoto: true }, () => {});
    await bob.join(); await world.publish();
    f.profiles.get("alice").primaryPhoto = "https://cdn.example.test/replaced.jpg";
    await world.publish();
    let b = bob.sent.filter((e) => e.name === "vcr:snapshot").at(-1);
    expect(b.data.peers[0].photoConsent).toBe(false);
    // Returning to an older photo cannot silently restore revoked consent.
    f.profiles.get("alice").primaryPhoto = "https://cdn.example.test/original.jpg";
    await world.publish();
    b = bob.sent.filter((e) => e.name === "vcr:snapshot").at(-1);
    expect(b.data.peers[0].photoConsent).toBe(false);
  });
});
