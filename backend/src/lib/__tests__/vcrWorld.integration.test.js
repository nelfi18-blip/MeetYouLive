"use strict";
// Real Socket.IO transports, production JWT middleware and disposable MongoDB.
// These are synthetic test accounts, never evidence of real people on phones.
const uri = process.env.INTEGRATION_MONGO_URI;
const withMongo = uri ? describe : describe.skip;
withMongo("VCR authenticated world integration", () => {
  jest.setTimeout(20000);
  let mongoose, User, http, io, url, alice, bob, clients = [], timers = [];
  const oldSecret = process.env.JWT_SECRET;
  const token = (user, options = { expiresIn: "1h" }) => require("jsonwebtoken").sign({ id: String(user._id) }, process.env.JWT_SECRET, options);
  const event = (socket, name, predicate = () => true) => new Promise((resolve, reject) => {
    const handler = (payload) => { if (!predicate(payload)) return; clearTimeout(timer); socket.off(name, handler); resolve(payload); };
    const timer = setTimeout(() => { socket.off(name, handler); reject(new Error(`Timed out waiting for ${name}`)); }, 4000);
    socket.on(name, handler);
  });
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function connect(auth) {
    const client = require("socket.io-client").io(url + "/vcr", { auth, autoConnect: false, transports: ["websocket"], reconnection: false });
    clients.push(client);
    const connected = event(client, "connect"); client.connect(); await connected; return client;
  }
  const join = (socket, country = "us", extra = {}) => socket.timeout(4000).emitWithAck("vcr:join", { version: 1, country, ...extra });
  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) throw new Error("Disposable localhost MongoDB only");
    process.env.JWT_SECRET = "vcr-integration-synthetic-secret";
    mongoose = require("mongoose"); await mongoose.connect(uri, { autoIndex: false });
    User = require("../../models/User.js"); await User.createCollection();
    const originalInterval = global.setInterval;
    jest.spyOn(global, "setInterval").mockImplementation((...args) => { const timer = originalInterval(...args); timers.push(timer); return timer; });
    http = require("http").createServer();
    io = require("../socket.js").initSocket(http);
    await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve)); url = `http://127.0.0.1:${http.address().port}`;
  });
  beforeEach(async () => {
    alice = await User.create({ username: "vcr_alice_fixture", email: "vcr-alice@example.invalid", password: "synthetic-password" });
    bob = await User.create({ username: "vcr_bob_fixture", email: "vcr-bob@example.invalid", password: "synthetic-password" });
  });
  afterEach(async () => { clients.forEach((client) => client.disconnect()); clients = []; await pause(30); await User.deleteMany({}); });
  afterAll(async () => {
    timers.forEach(clearInterval); jest.restoreAllMocks();
    if (io) await new Promise((resolve) => io.close(resolve));
    if (mongoose?.connection.readyState) await mongoose.disconnect();
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  });
  test.each([null, "invalid-token"])("anonymous/invalid token (%s) cannot enter the namespace", async (value) => {
    const client = require("socket.io-client").io(url + "/vcr", { autoConnect: false, auth: value ? { token: value } : {}, reconnection: false });
    clients.push(client); const denied = event(client, "connect_error"); client.connect();
    expect(await denied).toBeInstanceOf(Error); expect(client.connected).toBe(false);
  });
  test("two authenticated accounts share an actual server instance and privacy-minimal snapshots", async () => {
    const a = await connect({ token: token(alice) }), b = await connect({ token: token(bob) });
    const first = await join(a), second = await join(b);
    expect(first.ok).toBe(true); expect(second.instanceId).toBe(first.instanceId);
    const visible = await event(a, "vcr:snapshot", (p) => p.peers.length === 1);
    expect(visible.peers[0].userId).toBe(String(bob._id)); expect(visible.peers[0].name).toBe(bob.username);
    expect(Object.keys(visible.peers[0]).sort()).toEqual(["name", "outfit", "photoConsent", "position", "userId"]);
    expect(visible.peers[0].photoConsent).toBe(false); // No explicit photo consent in the synthetic join.
    expect(JSON.stringify(visible)).not.toContain(bob.email);
  });
  test("position, facing and outfit synchronize over the actual transport", async () => {
    const a = await connect({ token: token(alice) }), b = await connect({ token: token(bob) });
    const member = await join(a); await join(b); await pause(120);
    a.emit("vcr:move", { membership: member.membership, position: { x: 0.4, z: 0, yaw: 1 }, outfit: "pink", userId: String(bob._id) });
    const snapshot = await event(b, "vcr:snapshot", (p) => p.peers[0]?.position.x === 0.4);
    expect(snapshot.peers[0]).toMatchObject({ userId: String(alice._id), outfit: "pink", position: { yaw: 1 } });
  });
  test("teleporting or nonfinite movement is corrected without relay", async () => {
    const a = await connect({ token: token(alice) }); const member = await join(a);
    const corrected = event(a, "vcr:correct");
    a.emit("vcr:move", { membership: member.membership, position: { x: 70, z: 70, yaw: 0 } });
    expect((await corrected).position).toEqual({ x: 0, z: 0, yaw: 0 });
    await pause(80); const invalid = event(a, "vcr:correct");
    a.emit("vcr:move", { membership: member.membership, position: { x: NaN, z: 0, yaw: 0 } });
    expect((await invalid).position.x).toBe(0);
  });
  test("countries are isolated and changing country removes the old avatar", async () => {
    const a = await connect({ token: token(alice) }), b = await connect({ token: token(bob) });
    const old = await join(a); await join(b); await pause(800);
    const changed = await join(a, "jp"); expect(changed.ok).toBe(true); expect(changed.instanceId).not.toBe(old.instanceId);
    const empty = await event(b, "vcr:snapshot", (p) => p.peers.length === 0); expect(empty.country).toBe("us");
    a.emit("vcr:move", { membership: old.membership, position: { x: 1, z: 0, yaw: 0 } });
    const snapshot = await event(a, "vcr:snapshot"); expect(snapshot.country).toBe("jp"); expect(snapshot.peers).toEqual([]);
  });
  test("leaving and reconnecting cannot leave phantom or duplicate avatars", async () => {
    const a = await connect({ token: token(alice) }), b = await connect({ token: token(bob) });
    await join(a); await join(b); a.emit("vcr:leave");
    expect((await event(b, "vcr:snapshot", (p) => !p.peers.length)).peers).toEqual([]);
    a.disconnect(); const connected = event(a, "connect"); a.connect(); await connected;
    expect((await join(a)).ok).toBe(true);
    expect((await event(b, "vcr:snapshot", (p) => p.peers.length === 1)).peers).toHaveLength(1);
  });
  test("blocking in either direction hides both avatars on the next privacy snapshot", async () => {
    const a = await connect({ token: token(alice) }), b = await connect({ token: token(bob) });
    await join(a); await join(b); await event(a, "vcr:snapshot", (p) => p.peers.length === 1);
    await User.updateOne({ _id: alice._id }, { $addToSet: { blockedUsers: bob._id } });
    const results = await Promise.all([event(a, "vcr:snapshot", (p) => !p.peers.length), event(b, "vcr:snapshot", (p) => !p.peers.length)]);
    results.forEach((result) => expect(result.peers).toEqual([]));
  });
  test("live moderation revokes membership and hides the moderated avatar", async () => {
    const a = await connect({ token: token(alice) }), b = await connect({ token: token(bob) });
    await join(a); await join(b); const revoked = event(a, "vcr:closed");
    await User.updateOne({ _id: alice._id }, { isBlocked: true });
    expect((await revoked).code).toBe("SESSION_ENDED");
    expect((await event(b, "vcr:snapshot", (p) => !p.peers.length)).peers).toEqual([]);
  });
  test("deleted accounts and expired JWTs cannot retain presence", async () => {
    const a = await connect({ token: token(alice) }); await join(a); const removed = event(a, "vcr:closed");
    await User.deleteOne({ _id: alice._id }); expect((await removed).code).toBe("SESSION_ENDED");
    const b = await connect({ token: token(bob, { expiresIn: "2s" }) }); await join(b);
    expect((await event(b, "vcr:closed")).code).toBe("SESSION_ENDED");
  });
  test("fast travel is restricted to the server's safe zones", async () => {
    const a = await connect({ token: token(alice) }); const member = await join(a);
    const invalid = await a.timeout(3000).emitWithAck("vcr:travel", { membership: member.membership, zone: "constructor", x: 1000 });
    expect(invalid.ok).toBe(false);
    const valid = await a.timeout(3000).emitWithAck("vcr:travel", { membership: member.membership, zone: "coast" });
    expect(valid.position).toEqual({ x: -48, z: 36, yaw: 0 });
  });
  test("a second tab replaces presence without inventing another person", async () => {
    const a = await connect({ token: token(alice) }); await join(a);
    const replaced = event(a, "vcr:closed"); const second = await connect({ token: token(alice) });
    expect((await join(second)).ok).toBe(true); expect((await replaced).code).toBe("OTHER_SESSION");
    const b = await connect({ token: token(bob) }); await join(b);
    expect((await event(b, "vcr:snapshot", (p) => p.peers.length === 1)).peers).toHaveLength(1);
  });
  test("malformed destinations and protocol versions cannot join", async () => {
    const a = await connect({ token: token(alice) });
    expect((await join(a, "__proto__")).ok).toBe(false);
    expect((await join(a, "us", { version: 999 })).ok).toBe(false);
  });
});
