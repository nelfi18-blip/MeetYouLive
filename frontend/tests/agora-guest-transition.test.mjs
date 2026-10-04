import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldPublish,
  createGuestTransitionQueue,
  promoteToPublisher,
  demoteToAudience,
} from "../lib/agoraGuestTransition.js";

// ─────────────────────────────────────────────────────────────────────────
// Minimal fake Agora client used across these tests. It only models the
// handful of SDK calls agoraGuestTransition.js actually touches
// (renewToken, setClientRole, publish, unpublish) plus enough pub/sub
// plumbing (via a shared "channel" bus) to prove the host receives a
// remote-published guest without any real network/SDK involved.
function createFakeClient(uid, { channel } = {}) {
  const calls = [];
  const listeners = {};
  const client = {
    uid,
    role: "audience",
    published: [],
    calls,
    remoteUsers: [],
    on(event, handler) {
      (listeners[event] ||= []).push(handler);
    },
    async renewToken(token) {
      calls.push({ op: "renewToken", token });
    },
    async setClientRole(role) {
      calls.push({ op: "setClientRole", role });
      client.role = role;
    },
    async publish(tracks) {
      calls.push({ op: "publish", tracks });
      client.published = tracks;
      channel?.onPublish?.(client, tracks);
    },
    async unpublish(tracks) {
      calls.push({ op: "unpublish", tracks });
      client.published = client.published.filter((tr) => !tracks.includes(tr));
      channel?.onUnpublish?.(client, tracks);
    },
    async subscribe(user, mediaType) {
      calls.push({ op: "subscribe", uid: user.uid, mediaType });
    },
    __emit(event, ...args) {
      (listeners[event] || []).forEach((fn) => fn(...args));
    },
  };
  return client;
}

function makeTrack(kind) {
  return { kind, closed: false, close() { this.closed = true; } };
}

// ───────────────────────────── A, B, H, I ──────────────────────────────

test("A. a normal audience viewer (not creator, not guest) never publishes", () => {
  assert.equal(shouldPublish({ isCreator: false, isGuest: false }), false);
});

test("B. a pending (not-yet-approved) guest request never publishes", () => {
  // Pending requesters are represented client-side as isGuest=false until the
  // server-authoritative guests list flips them to active — see
  // useMultiGuestLive's fetchGuests(). A pending request must never publish.
  assert.equal(shouldPublish({ isCreator: false, isGuest: false }), false);
});

test("H. the live host (creator) always publishes — no regression", () => {
  assert.equal(shouldPublish({ isCreator: true, isGuest: false }), true);
});

test("I. a normal (non-guest) viewer remains a pure subscriber — no regression", () => {
  assert.equal(shouldPublish({ isCreator: false, isGuest: false }), false);
});

// ───────────────────────────── C, E ──────────────────────────────

test("C. an approved guest makes exactly one valid transition to publisher (in place, no leave/join)", async () => {
  const client = createFakeClient(1234);
  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");
  let fetchCount = 0;

  const { audioTrack: a, videoTrack: v } = await promoteToPublisher({
    client,
    createTracks: async () => [audioTrack, videoTrack],
    fetchPublisherToken: async () => {
      fetchCount += 1;
      return { token: "publisher-token" };
    },
  });

  assert.equal(fetchCount, 1, "exactly one publisher token fetch");
  assert.equal(client.calls.filter((c) => c.op === "renewToken").length, 1);
  assert.equal(client.calls.filter((c) => c.op === "setClientRole").length, 1);
  assert.equal(client.calls.filter((c) => c.op === "publish").length, 1);
  assert.equal(client.role, "host");
  assert.equal(a, audioTrack);
  assert.equal(v, videoTrack);
  // Crucially: no leave()/join() calls exist on this fake client at all —
  // the transition never attempts to recreate the connection.
  assert.ok(!("leave" in client), "promotion must never call leave()");
  assert.ok(!("join" in client), "promotion must never call join()");
});

test("E. an approved guest publishes BOTH audio and video tracks", async () => {
  const client = createFakeClient(1234);
  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");

  await promoteToPublisher({
    client,
    createTracks: async () => [audioTrack, videoTrack],
    fetchPublisherToken: async () => ({ token: "publisher-token" }),
  });

  const publishCall = client.calls.find((c) => c.op === "publish");
  assert.equal(publishCall.tracks.length, 2);
  assert.ok(publishCall.tracks.includes(audioTrack));
  assert.ok(publishCall.tracks.includes(videoTrack));
});

// ───────────────────────────── D ──────────────────────────────

test("D. no new join starts while a prior leave/demote is still pending (serialized queue)", async () => {
  const order = [];
  const queue = createGuestTransitionQueue();
  let resolveDemote;

  const demotePromise = queue.run(
    () =>
      new Promise((resolve) => {
        order.push("demote:start");
        resolveDemote = () => {
          order.push("demote:end");
          resolve();
        };
      })
  );

  // Queue a promote immediately after — it must NOT start until demote ends.
  const promotePromise = queue.run(async () => {
    order.push("promote:start");
  });

  // Give the microtask queue a chance to run anything that *shouldn't* run yet.
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["demote:start"], "promote must not start while demote is in flight");

  resolveDemote();
  await demotePromise;
  await promotePromise;

  assert.deepEqual(order, ["demote:start", "demote:end", "promote:start"]);
});

test("D (continued). a failed transition does not block the next queued transition", async () => {
  const queue = createGuestTransitionQueue();
  const order = [];

  await assert.rejects(
    queue.run(async () => {
      order.push("first:fail");
      throw new Error("boom");
    })
  );

  await queue.run(async () => {
    order.push("second:ok");
  });

  assert.deepEqual(order, ["first:fail", "second:ok"]);
});

// ───────────────────────────── F ──────────────────────────────

test("F. host receives and subscribes to the newly-promoted guest's publisher stream", async () => {
  // A tiny shared "channel" bus linking two fake clients, enough to prove
  // that once the guest publishes, the host's `user-published` handler (the
  // same mechanism wired in the live page's join effect) fires and the host
  // subscribes to the guest's video/audio.
  const hostRemoteState = new Map();
  const channel = {
    onPublish(publisherClient, tracks) {
      const user = {
        uid: publisherClient.uid,
        hasVideo: tracks.some((tr) => tr.kind === "video"),
        hasAudio: tracks.some((tr) => tr.kind === "audio"),
        videoTrack: tracks.find((tr) => tr.kind === "video"),
        audioTrack: tracks.find((tr) => tr.kind === "audio"),
      };
      hostClient.__emit("user-published", user, "video");
      hostClient.__emit("user-published", user, "audio");
    },
  };

  const hostClient = createFakeClient("host-uid");
  hostClient.on("user-published", async (user, mediaType) => {
    await hostClient.subscribe(user, mediaType);
    const existing = hostRemoteState.get(user.uid) || {};
    hostRemoteState.set(user.uid, {
      ...existing,
      [mediaType === "video" ? "videoTrack" : "audioTrack"]: user[mediaType === "video" ? "videoTrack" : "audioTrack"],
    });
  });

  const guestClient = createFakeClient("guest-uid", { channel });
  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");

  await promoteToPublisher({
    client: guestClient,
    createTracks: async () => [audioTrack, videoTrack],
    fetchPublisherToken: async () => ({ token: "publisher-token" }),
  });

  const guestEntry = hostRemoteState.get("guest-uid");
  assert.ok(guestEntry, "host must register the guest as a remote publisher");
  assert.equal(guestEntry.videoTrack, videoTrack);
  assert.equal(guestEntry.audioTrack, audioTrack);
  assert.ok(
    hostClient.calls.some((c) => c.op === "subscribe" && c.uid === "guest-uid"),
    "host must call subscribe() for the guest's uid"
  );
});

// ───────────────────────────── G ──────────────────────────────

test("G. removing/leaving as guest unpublishes and closes tracks, returning to clean audience state", async () => {
  const client = createFakeClient(1234);
  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");

  await promoteToPublisher({
    client,
    createTracks: async () => [audioTrack, videoTrack],
    fetchPublisherToken: async () => ({ token: "publisher-token" }),
  });

  await demoteToAudience({
    client,
    audioTrack,
    videoTrack,
    fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
  });

  assert.ok(audioTrack.closed, "audio track must be closed on demote");
  assert.ok(videoTrack.closed, "video track must be closed on demote");
  assert.equal(client.published.length, 0, "no tracks should remain published");
  assert.equal(client.role, "audience", "client must return to audience role");
  const renewCalls = client.calls.filter((c) => c.op === "renewToken");
  assert.equal(renewCalls.length, 2, "one renew for promote, one renew for demote");
  assert.equal(renewCalls[1].token, "subscriber-token");
});

test("G (continued). demoteToAudience is a no-op when there is no client (already torn down)", async () => {
  await assert.doesNotReject(
    demoteToAudience({
      client: null,
      audioTrack: null,
      videoTrack: null,
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    })
  );
});

// ───────────────────────────── J ──────────────────────────────

test("J. #977's remote video mount logic remains intact and untouched by this module", async () => {
  const { computeRemoteVideoActions } = await import("../lib/remoteVideoMount.js");
  const container = { tag: "guest-container" };
  const videoTrack = { id: "guest-track" };
  const { toPlay } = computeRemoteVideoActions(
    [{ uid: 2002, isRemote: true, videoTrack }],
    { 2002: container },
    {}
  );
  assert.equal(toPlay.length, 1);
  assert.equal(toPlay[0].container, container);
  assert.equal(toPlay[0].videoTrack, videoTrack);
});
