import test from "node:test";
import assert from "node:assert/strict";
import { createVcrPresence } from "../lib/vcr/presence.js";
function fixture(t) {
  const handlers = new Map(), requests = [], emitted = [], states = [], audiences = [], positions = [], worlds = [];
  const socket = { connected: true, volatile: { emit: (...args) => emitted.push(args) },
    on(name, cb) { const list = handlers.get(name) || new Set(); list.add(cb); handlers.set(name, list); },
    off(name, cb) { handlers.get(name)?.delete(cb); }, emit: (...args) => emitted.push(args),
    timeout: () => ({ emit: (...args) => requests.push(args) }), connect() { this.connected = true; this.dispatch("connect"); },
    disconnect() { this.connected = false; this.dispatch("disconnect"); },
    dispatch(name, payload) { for (const cb of handlers.get(name) || []) cb(payload); },
  };
  const world = { setPeers: (p) => audiences.push(p), stopMoving() {}, setPosition: (p) => positions.push(p),
    getPosition: () => ({ x: 0, z: 0, yaw: 0 }), travelCountry: (id) => worlds.push(id), teleport: () => true, setOutfit() {} };
  const session = createVcrPresence({ socket, world, onState: (s) => states.push(s), onPeers() {} });
  t.after(() => session.close());
  const confirm = (request = requests.at(-1), country = "us", membership = "member-current") => request.at(-1)(null, {
    ok: true, country, membership, instanceId: "instance-synthetic", position: { x: 0, z: 0, yaw: 0 },
  });
  return { socket, session, requests, emitted, states, audiences, positions, worlds, confirm };
}
test("presence requires explicit opt-in; a confirmed ack is required for online", (t) => {
  const f = fixture(t); assert.equal(f.requests.length, 0);
  f.session.join("us", "violet"); assert.equal(f.states.at(-1), "connecting");
  f.confirm(); assert.equal(f.states.at(-1), "online");
});
test("country switch ignores stale acknowledgements and snapshots", (t) => {
  const f = fixture(t); f.session.join("us", "violet"); const old = f.requests.at(-1);
  f.session.changeCountry("fr"); f.confirm(old); assert.notEqual(f.states.at(-1), "online");
  f.confirm(f.requests.at(-1), "fr"); assert.equal(f.states.at(-1), "online");
  f.socket.dispatch("vcr:snapshot", { country: "us", membership: "member-current", peers: [{ userId: "old" }] });
  assert.deepEqual(f.audiences.at(-1), []);
  f.socket.dispatch("vcr:snapshot", { country: "fr", membership: "member-current", peers: [{ userId: "current" }] });
  assert.equal(f.audiences.at(-1)[0].userId, "current");
});
test("disconnect immediately hides peers and reconnect gets fresh membership", (t) => {
  const f = fixture(t); f.session.join("us", "violet"); f.confirm();
  f.socket.dispatch("vcr:snapshot", { country: "us", membership: "member-current", peers: [{ userId: "peer" }] });
  f.socket.disconnect(); assert.deepEqual(f.audiences.at(-1), []); assert.equal(f.states.at(-1), "reconnecting");
  f.socket.connect(); f.confirm(f.requests.at(-1), "us", "member-new");
  f.socket.dispatch("vcr:correct", { membership: "member-current", position: { x: 50, z: 50 } });
  assert.equal(f.positions.at(-1).x, 0);
});
test("leaving during a join cannot resurrect consent or presence", (t) => {
  const f = fixture(t); f.session.join("us", "violet"); const pending = f.requests.at(-1);
  f.session.leave(); f.confirm(pending); assert.equal(f.states.at(-1), "solo");
  assert.ok(f.emitted.some(([event]) => event === "vcr:leave"));
});
test("unknown join result releases server membership rather than leaving a phantom", (t) => {
  const f = fixture(t); f.session.join("us", "violet"); f.requests.at(-1).at(-1)(new Error("Synthetic timeout"));
  assert.equal(f.states.at(-1), "error"); assert.equal(f.emitted.at(-1)[0], "vcr:leave");
});
test("moderation revocation does not automatically rejoin", (t) => {
  const f = fixture(t); f.session.join("us", "violet"); f.confirm(); f.socket.dispatch("vcr:closed", { code: "SESSION_ENDED" });
  const count = f.requests.length; f.socket.disconnect(); f.socket.connect();
  assert.equal(f.requests.length, count); assert.deepEqual(f.audiences.at(-1), []);
});
test("closing unregisters only owned listeners and stops outgoing movement", async (t) => {
  const f = fixture(t); let unrelated = 0; f.socket.on("unrelated", () => { unrelated += 1; });
  f.session.join("us", "violet"); f.confirm(); f.session.close(); const count = f.emitted.length;
  await new Promise((resolve) => setTimeout(resolve, 130)); assert.equal(f.emitted.length, count);
  f.socket.dispatch("unrelated"); assert.equal(unrelated, 1);
});
