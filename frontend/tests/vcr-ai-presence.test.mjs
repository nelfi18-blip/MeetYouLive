import test from "node:test";
import assert from "node:assert/strict";
import { createVcrPresence } from "../lib/vcr/presence.js";

const scene = Object.freeze({
  country: "jp",
  providerWorldId: "dc2c65e4-68d3-4210-a01e-7a54cc9ded2a",
  splatSha256: "a".repeat(64),
  colliderSha256: "b".repeat(64),
  generatedByAi: true, aiContentLabelRequired: true, interactionReady: false,
});

function fixture(t, selected = scene) {
  const handlers = new Map(), requests = [], events = [], states = [], positions = [];
  const socket = {
    connected: true,
    volatile: { emit(...args) { events.push(args); } },
    on(name, callback) { handlers.set(name, callback); },
    off(name) { handlers.delete(name); },
    emit(...args) { events.push(args); },
    timeout() { return { emit(...args) { requests.push(args); } }; },
    connect() { this.connected = true; handlers.get("connect")?.(); },
    disconnect() { this.connected = false; handlers.get("disconnect")?.(); },
  };
  const world = {
    setPeers() {}, stopMoving() {},
    setPosition(position) { positions.push(position); },
    getPosition() { return { x: 0.5, y: 0, z: 0, yaw: 0 }; },
    travelCountry() {}, teleport() {}, setOutfit() {},
  };
  const presence = createVcrPresence({
    socket, world, aiScene: selected,
    onState: (state) => { states.push(state); },
    onPeers() {}, onInstance() {},
  });
  t.after(() => presence.close());
  const reply = (overrides = {}) => ({
    ok: true, country: "jp", scene: "ai",
    providerWorldId: scene.providerWorldId,
    splatSha256: scene.splatSha256, colliderSha256: scene.colliderSha256,
    membership: "isolated-member", instanceId: "jp:ai:synthetic",
    position: { x: 0, y: 0, z: 0, yaw: 0 },
    ...overrides,
  });
  return { socket, presence, events, requests, states, positions, reply };
}

test("World client opts into AI only with a validated server-supplied descriptor", (t) => {
  const f = fixture(t);
  f.presence.join("jp", "violet");
  assert.equal(f.requests.length, 1);
  const [event, payload, ack] = f.requests[0];
  assert.equal(event, "vcr:join");
  assert.deepEqual(
    [payload.scene, payload.providerWorldId, payload.splatSha256, payload.colliderSha256],
    ["ai", scene.providerWorldId, scene.splatSha256, scene.colliderSha256],
  );
  ack(null, f.reply());
  assert.equal(f.states.at(-1), "online");
  assert.deepEqual(f.positions.at(-1), { x: 0, y: 0, z: 0, yaw: 0 });
  f.presence.changeCountry("fr");
  f.presence.travel("neon");
  assert.equal(f.requests.length, 1, "AI scene cannot silently change worlds or teleport to old zones");
});

test("World client rejects substituted scene ACK rather than showing wrong people", (t) => {
  const f = fixture(t);
  f.presence.join("jp", "violet");
  f.requests[0].at(-1)(null, f.reply({ colliderSha256: "c".repeat(64) }));
  assert.equal(f.states.at(-1), "error");
  assert.equal(f.socket.connected, false);
  assert.ok(f.events.some(([event]) => event === "vcr:leave"));
});

test("Bad AI scene identity cannot even initiate a socket session", () => {
  assert.throws(() => createVcrPresence({
    socket: {}, world: {}, aiScene: { ...scene, generatedByAi: false },
  }), /approved server descriptor required/);
  assert.throws(() => createVcrPresence({
    socket: {}, world: {}, aiScene: { ...scene, splatSha256: "bad" },
  }), /approved server descriptor required/);
  assert.throws(() => createVcrPresence({
    socket: {}, world: {}, aiScene: { ...scene, interactionReady: true },
  }), /approved server descriptor required/);
});
