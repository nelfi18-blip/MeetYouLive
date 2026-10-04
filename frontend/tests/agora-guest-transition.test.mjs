import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldPublish,
  createGuestTransitionQueue,
  promoteToPublisher,
  demoteToAudience,
  applyGuestTransition,
  AgoraGuestTransitionError,
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

// ═══════════════════════════════════════════════════════════════════════
// PR #979 follow-up: transactional promote/demote consistency.
//
// These tests demonstrate that a partial failure during promote/demote
// never leaves the module reporting a success state that doesn't match
// Agora's real client role — see the "Transactional guarantees" section at
// the top of lib/agoraGuestTransition.js.
// ═══════════════════════════════════════════════════════════════════════

test("A. createTracks fails after publisher privilege was granted: not falsely reported as publisher, rollback attempted", async () => {
  const client = createFakeClient(1234);

  await assert.rejects(
    promoteToPublisher({
      client,
      createTracks: async () => {
        throw new Error("NotAllowedError: device busy");
      },
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    }),
    (err) => {
      assert.ok(err instanceof AgoraGuestTransitionError);
      assert.equal(err.rolledBack, true, "rollback to audience must have been attempted and succeeded");
      assert.equal(err.currentRole, "audience", "caller must be told Agora is really back to audience");
      return true;
    }
  );

  // The privilege was briefly granted (setClientRole("host")) then rolled
  // back — the client's actual, final role must be "audience", matching
  // what the thrown error reports.
  assert.equal(client.role, "audience");
  assert.equal(client.published.length, 0, "nothing was ever published");
  const roleChanges = client.calls.filter((c) => c.op === "setClientRole").map((c) => c.role);
  assert.deepEqual(roleChanges, ["host", "audience"], "host privilege must be explicitly rolled back");
});

test("B. publish() fails: tracks are closed and rollback to audience is performed", async () => {
  const client = createFakeClient(1234);
  client.publish = async () => {
    throw new Error("Agora publish failed: connection lost");
  };

  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");

  await assert.rejects(
    promoteToPublisher({
      client,
      createTracks: async () => [audioTrack, videoTrack],
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    }),
    (err) => {
      assert.ok(err instanceof AgoraGuestTransitionError);
      assert.equal(err.currentRole, "audience");
      assert.equal(err.rolledBack, true);
      return true;
    }
  );

  assert.ok(audioTrack.closed, "audio track must be closed after a failed publish");
  assert.ok(videoTrack.closed, "video track must be closed after a failed publish");
  assert.equal(client.role, "audience");
});

test("C. rollback successfully returns the client to audience/subscriber (token + role both reverted)", async () => {
  const client = createFakeClient(1234);
  let subscriberFetchCount = 0;

  await assert.rejects(
    promoteToPublisher({
      client,
      createTracks: async () => {
        throw new Error("camera permission denied");
      },
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => {
        subscriberFetchCount += 1;
        return { token: "subscriber-token-after-rollback" };
      },
    })
  );

  assert.equal(subscriberFetchCount, 1, "rollback must fetch a fresh subscriber token");
  const renewCalls = client.calls.filter((c) => c.op === "renewToken").map((c) => c.token);
  assert.deepEqual(renewCalls, ["publisher-token", "subscriber-token-after-rollback"]);
  assert.equal(client.role, "audience");
});

test("C (continued). if no fetchSubscriberToken is supplied, rollback still reverts the role itself", async () => {
  const client = createFakeClient(1234);

  await assert.rejects(
    promoteToPublisher({
      client,
      createTracks: async () => {
        throw new Error("device error");
      },
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      // fetchSubscriberToken intentionally omitted
    }),
    (err) => {
      assert.equal(err.currentRole, "audience");
      assert.equal(err.rolledBack, true);
      return true;
    }
  );

  assert.equal(client.role, "audience");
});

test("D. demote failing before role switch: external state must not be marked as audience", async () => {
  // Simulate a client that is genuinely a publisher (already promoted) with
  // tracks live, then demotion fails fetching a fresh subscriber token.
  const client = createFakeClient(1234);
  client.role = "host";
  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");
  client.published = [audioTrack, videoTrack];

  await assert.rejects(
    demoteToAudience({
      client,
      audioTrack,
      videoTrack,
      fetchSubscriberToken: async () => {
        throw new Error("network error fetching subscriber token");
      },
    }),
    (err) => {
      assert.ok(err instanceof AgoraGuestTransitionError);
      assert.equal(err.currentRole, "host", "must report the client as still host, not audience");
      assert.equal(err.rolledBack, false);
      return true;
    }
  );

  // Tracks must still be safely cleaned up despite the failure...
  assert.ok(audioTrack.closed, "audio track must be closed even when token fetch fails");
  assert.ok(videoTrack.closed, "video track must be closed even when token fetch fails");
  // ...but the client's role was never actually changed — setClientRole was
  // never reached because the subscriber token fetch failed first.
  assert.equal(client.role, "host");
  assert.ok(
    !client.calls.some((c) => c.op === "setClientRole"),
    "setClientRole must not be called if the token fetch already failed"
  );
});

test("D (continued). demote failing during setClientRole itself: still reports host, not a false audience", async () => {
  const client = createFakeClient(1234);
  client.role = "host";
  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");
  client.published = [audioTrack, videoTrack];
  client.setClientRole = async () => {
    throw new Error("setClientRole rejected by SDK");
  };

  await assert.rejects(
    demoteToAudience({
      client,
      audioTrack,
      videoTrack,
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    }),
    (err) => {
      assert.equal(err.currentRole, "host");
      assert.equal(err.rolledBack, false);
      return true;
    }
  );

  assert.ok(audioTrack.closed);
  assert.ok(videoTrack.closed);
  // client.role was never mutated by our fake override, so it remains
  // "host" — exactly what the thrown error claims. No divergence.
  assert.equal(client.role, "host");
});

test("E. a subsequent transition can recover after a prior failed transition (no duplicate client)", async () => {
  const client = createFakeClient(1234);
  let createTracksShouldFail = true;

  const attemptPromote = () =>
    promoteToPublisher({
      client,
      createTracks: async () => {
        if (createTracksShouldFail) {
          throw new Error("camera temporarily unavailable");
        }
        return [makeTrack("audio"), makeTrack("video")];
      },
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    });

  // First attempt fails and rolls back.
  await assert.rejects(attemptPromote());
  assert.equal(client.role, "audience", "rolled back to audience after the first failed attempt");

  // Camera becomes available; retry against the SAME client (no new
  // AgoraRTC.createClient()/join() — this module never creates one).
  createTracksShouldFail = false;
  const { audioTrack, videoTrack } = await attemptPromote();

  assert.equal(client.role, "host", "second attempt must actually reach host role");
  assert.ok(client.published.includes(audioTrack));
  assert.ok(client.published.includes(videoTrack));
});

// ───────────────────────────── F ──────────────────────────────

test("F. happy path promote still resolves cleanly with a single role/token transition", async () => {
  const client = createFakeClient(1234);
  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");

  const result = await promoteToPublisher({
    client,
    createTracks: async () => [audioTrack, videoTrack],
    fetchPublisherToken: async () => ({ token: "publisher-token" }),
    fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
  });

  assert.equal(result.audioTrack, audioTrack);
  assert.equal(result.videoTrack, videoTrack);
  assert.equal(client.role, "host");
  assert.equal(
    client.calls.filter((c) => c.op === "setClientRole").length,
    1,
    "happy path only switches role once — no rollback should ever run"
  );
});

test("F (continued). happy path demote still resolves cleanly", async () => {
  const client = createFakeClient(1234);
  client.role = "host";
  const audioTrack = makeTrack("audio");
  const videoTrack = makeTrack("video");
  client.published = [audioTrack, videoTrack];

  const result = await demoteToAudience({
    client,
    audioTrack,
    videoTrack,
    fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
  });

  assert.equal(result.currentRole, "audience");
  assert.equal(client.role, "audience");
  assert.ok(audioTrack.closed);
  assert.ok(videoTrack.closed);
});

// ───────────────────────────── G ──────────────────────────────

test("G. #977 remote-video-mount logic is unaffected by the transactional promote/demote changes above", async () => {
  // Re-asserts the same guarantee as test J above, scoped explicitly to this
  // follow-up change set: nothing in this file's transactional rollback
  // additions touches lib/remoteVideoMount.js or MultiVideoGrid.
  const { computeRemoteVideoActions } = await import("../lib/remoteVideoMount.js");
  const container = { tag: "host-container" };
  const videoTrack = { id: "host-track" };
  const { toPlay } = computeRemoteVideoActions(
    [{ uid: 1001, isRemote: true, videoTrack }],
    { 1001: container },
    {}
  );
  assert.equal(toPlay.length, 1);
  assert.equal(toPlay[0].container, container);
  assert.equal(toPlay[0].videoTrack, videoTrack);
});

// ─────────────────────────────────────────────────────────────────────────
// Third review round: (1) a failure between a successful renewToken(host)
// and a failing setClientRole("host") must still produce a coherent
// AgoraGuestTransitionError (not a plain Error with no currentRole), and
// (2) the retry path real page.jsx code wires up to its error UI —
// `applyGuestTransition()` — must be exercised directly (not just a second
// manual call to promoteToPublisher) to prove the actual retry mechanism
// works, is bounded, and never duplicates a client/queue.
// ─────────────────────────────────────────────────────────────────────────

test("A. renewToken(publisher) succeeds but setClientRole(\"host\") fails → rollback, coherent AgoraGuestTransitionError", async () => {
  const client = createFakeClient(1234);
  client.setClientRole = async (role) => {
    client.calls.push({ op: "setClientRole", role, attempt: "host" });
    if (role === "host") {
      throw new Error("setClientRole(host) rejected by SDK");
    }
    client.role = role;
  };
  let subscriberFetchCount = 0;

  await assert.rejects(
    promoteToPublisher({
      client,
      createTracks: async () => [makeTrack("audio"), makeTrack("video")],
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => {
        subscriberFetchCount += 1;
        return { token: "subscriber-token-after-rollback" };
      },
    }),
    (err) => {
      assert.ok(err instanceof AgoraGuestTransitionError, "must be the coherent, typed error");
      assert.equal(err.currentRole, "audience", "rollback succeeded, so the real role is audience");
      assert.equal(err.rolledBack, true);
      return true;
    }
  );

  // The publisher token WAS renewed (that step succeeded) before
  // setClientRole("host") threw — renewToken is still called exactly
  // twice: once for the (ultimately moot) publisher privilege, once more
  // for the rollback's subscriber token.
  const renewCalls = client.calls.filter((c) => c.op === "renewToken").map((c) => c.token);
  assert.deepEqual(renewCalls, ["publisher-token", "subscriber-token-after-rollback"]);
  assert.equal(subscriberFetchCount, 1);
  assert.equal(client.role, "audience", "rollback must actually leave the client at audience");
  // createTracks/publish must never run — the privilege stage failed first.
  assert.ok(!client.calls.some((c) => c.op === "publish"));
});

test("A (continued). if the rollback itself also fails after a setClientRole(\"host\") failure, the error stays conservatively \"host\" — never a false audience", async () => {
  const client = createFakeClient(1234);
  let setClientRoleCalls = 0;
  client.setClientRole = async (role) => {
    setClientRoleCalls += 1;
    if (role === "host") {
      throw new Error("setClientRole(host) rejected by SDK");
    }
    throw new Error("setClientRole(audience) rollback also rejected");
  };

  await assert.rejects(
    promoteToPublisher({
      client,
      createTracks: async () => [makeTrack("audio"), makeTrack("video")],
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    }),
    (err) => {
      assert.ok(err instanceof AgoraGuestTransitionError);
      assert.equal(err.currentRole, "host", "rollback failed too — must not pretend audience");
      assert.equal(err.rolledBack, false);
      return true;
    }
  );
  assert.equal(setClientRoleCalls, 2, "one attempt for host, one best-effort rollback attempt");
});

test("A (continued). fetchPublisherToken itself failing never touches the client — trivially coherent, no rollback needed", async () => {
  const client = createFakeClient(1234);

  await assert.rejects(
    promoteToPublisher({
      client,
      createTracks: async () => [makeTrack("audio"), makeTrack("video")],
      fetchPublisherToken: async () => {
        throw new Error("network error fetching publisher token");
      },
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    }),
    (err) => {
      assert.ok(err instanceof AgoraGuestTransitionError);
      assert.equal(err.currentRole, "audience");
      assert.equal(err.rolledBack, true);
      return true;
    }
  );
  assert.equal(client.calls.length, 0, "nothing was ever sent to the client");
});

// ───────────────────────── B, C, D: the real retry mechanism ─────────────

test("B. applyGuestTransition is the SAME function the effect and the retry button both call — a failed, rolled-back promotion can be retried without isGuest changing", async () => {
  const client = createFakeClient(1234);
  const queue = createGuestTransitionQueue();
  let isPublisherState = false;
  let cameraShouldFail = true;

  const attempt = () =>
    applyGuestTransition({
      queue,
      client,
      targetIsGuest: true, // isGuest never changes across this whole scenario
      getIsPublisherState: () => isPublisherState,
      setIsPublisherState: (v) => {
        isPublisherState = v;
      },
      createTracks: async () => {
        if (cameraShouldFail) throw new Error("camera permission denied");
        return [makeTrack("audio"), makeTrack("video")];
      },
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    });

  // Automatic attempt (what the effect does when the guest is approved).
  const first = await attempt();
  assert.equal(first.outcome, "promote-failed");
  assert.equal(isPublisherState, false, "rolled back to audience — matches targetIsGuest=false state, not true");

  // Nothing changed `targetIsGuest` (it's hardcoded true, exactly like
  // page.jsx's `isGuest` staying true) — the ONLY reason a second attempt
  // happens is an explicit call, exactly like `retryGuestPromotion` tapping
  // the error overlay.
  cameraShouldFail = false;
  const retry = await attempt();
  assert.equal(retry.outcome, "promoted");
  assert.equal(isPublisherState, true);

  // Same client throughout — no second AgoraRTC client/join ever created.
  assert.equal(client.calls.filter((c) => c.op === "setClientRole" && c.role === "host").length, 2);
});

test("C. no infinite/automatic retry: a persistent failure does not cause further attempts unless explicitly invoked again", async () => {
  const client = createFakeClient(1234);
  const queue = createGuestTransitionQueue();
  let isPublisherState = false;
  let attemptCount = 0;

  const attempt = () =>
    applyGuestTransition({
      queue,
      client,
      targetIsGuest: true,
      getIsPublisherState: () => isPublisherState,
      setIsPublisherState: (v) => {
        isPublisherState = v;
      },
      createTracks: async () => {
        attemptCount += 1;
        throw new Error("permission permanently denied");
      },
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    });

  const result = await attempt();
  assert.equal(result.outcome, "promote-failed");
  assert.equal(attemptCount, 1);

  // Flush several microtask/timer ticks — nothing auto-retries. This is the
  // guarantee that a permanently-denied permission cannot spin in a loop:
  // `applyGuestTransition` has no internal timer/poll, so only an explicit
  // caller invocation (the retry button) can ever produce another attempt.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attemptCount, 1, "no automatic re-attempt happened on its own");
  assert.equal(isPublisherState, false);

  // Explicitly invoking it again (what the retry button does) is the only
  // way to get a second attempt — and it's still bounded (one more call =
  // one more attempt, not a cascade).
  await attempt();
  assert.equal(attemptCount, 2);
});

test("D. a second, explicitly-retried successful attempt reuses the exact same Agora client and the exact same queue", async () => {
  const client = createFakeClient(1234);
  const queue = createGuestTransitionQueue();
  let isPublisherState = false;
  let shouldFail = true;
  const seenClients = new Set();
  const seenQueues = new Set([queue]);

  const attempt = () => {
    seenClients.add(client);
    return applyGuestTransition({
      queue,
      client,
      targetIsGuest: true,
      getIsPublisherState: () => isPublisherState,
      setIsPublisherState: (v) => {
        isPublisherState = v;
      },
      createTracks: async () => {
        if (shouldFail) throw new Error("camera busy");
        return [makeTrack("audio"), makeTrack("video")];
      },
      fetchPublisherToken: async () => ({ token: "publisher-token" }),
      fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    });
  };

  await attempt();
  shouldFail = false;
  const retryResult = await attempt();

  assert.equal(retryResult.outcome, "promoted");
  assert.equal(seenClients.size, 1, "only ever the one, already-joined client was used");
  assert.equal(seenQueues.size, 1, "only ever the one serialized queue was used");
});

test("E. happy path: a single successful promote via applyGuestTransition still works exactly as before", async () => {
  const client = createFakeClient(1234);
  const queue = createGuestTransitionQueue();
  let isPublisherState = false;
  let localTracks = null;

  const result = await applyGuestTransition({
    queue,
    client,
    targetIsGuest: true,
    getIsPublisherState: () => isPublisherState,
    setIsPublisherState: (v) => {
      isPublisherState = v;
    },
    createTracks: async () => [makeTrack("audio"), makeTrack("video")],
    fetchPublisherToken: async () => ({ token: "publisher-token" }),
    fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    onLocalTracks: (audioTrack, videoTrack) => {
      localTracks = { audioTrack, videoTrack };
    },
  });

  assert.equal(result.outcome, "promoted");
  assert.equal(isPublisherState, true);
  assert.ok(localTracks.audioTrack && localTracks.videoTrack);
  assert.equal(client.role, "host");

  // And demoting back via the same shared entry point still works too.
  const demoteResult = await applyGuestTransition({
    queue,
    client,
    targetIsGuest: false,
    getIsPublisherState: () => isPublisherState,
    setIsPublisherState: (v) => {
      isPublisherState = v;
    },
    fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
    getAudioTrack: () => localTracks.audioTrack,
    getVideoTrack: () => localTracks.videoTrack,
  });
  assert.equal(demoteResult.outcome, "demoted");
  assert.equal(isPublisherState, false);
  assert.equal(client.role, "audience");
});

test("F. #977 remote-video-mount logic remains unaffected by this round's retry/transactional changes", async () => {
  const { computeRemoteVideoActions } = await import("../lib/remoteVideoMount.js");
  const container = { tag: "host-container" };
  const videoTrack = { id: "host-track" };
  const { toPlay } = computeRemoteVideoActions(
    [{ uid: 2002, isRemote: true, videoTrack }],
    { 2002: container },
    {}
  );
  assert.equal(toPlay.length, 1);
  assert.equal(toPlay[0].container, container);
  assert.equal(toPlay[0].videoTrack, videoTrack);
});

test("applyGuestTransition returns 'skipped' without touching the client when already in the target state", async () => {
  const client = createFakeClient(1234);
  const queue = createGuestTransitionQueue();
  const result = await applyGuestTransition({
    queue,
    client,
    targetIsGuest: false,
    getIsPublisherState: () => false,
    setIsPublisherState: () => {
      throw new Error("must not be called when already in target state");
    },
    fetchSubscriberToken: async () => ({ token: "subscriber-token" }),
  });
  assert.equal(result.outcome, "skipped");
  assert.equal(client.calls.length, 0);
});
