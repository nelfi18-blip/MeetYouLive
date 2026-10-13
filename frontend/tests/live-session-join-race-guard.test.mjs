import test from "node:test";
import assert from "node:assert/strict";
import { shouldBlockSessionSwitch } from "../lib/liveSession/sessionSwitchGuard.js";
import * as liveSessionStore from "../lib/liveSession/liveSessionStore.js";

/**
 * Covers the "ÚLTIMA CORRECCIÓN DE CONCURRENCIA AGORA" fix: a NEW Agora
 * connection (token fetch + track creation + client.join()/publish()) must
 * never be started for a Live while the user already has an ACTIVE HOST
 * broadcast running on a DIFFERENT Live — checked BEFORE any of those
 * calls, and RE-checked after each async gap (token fetch, track
 * creation) to close the race where the conflicting host session appears
 * (or is confirmed) while the join was already in flight.
 *
 * This mirrors frontend/contexts/LiveSessionContext.jsx's
 * `hasActiveHostElsewhere()` (itself a thin wrapper over
 * `shouldBlockSessionSwitch` reading the live session ref synchronously)
 * and the guarded `joinAgora()` flow in
 * frontend/app/live/[id]/page.jsx's Agora join effect — since this repo
 * has no React-component test harness, the exact decision/cleanup
 * algorithm is exercised directly as pure/async logic against the real
 * liveSessionStore.
 */

function createFakeTrack() {
  return { closed: false, close() { this.closed = true; } };
}

function createFakeClient() {
  return {
    joined: false,
    published: false,
    left: false,
    async join() { this.joined = true; },
    async publish() { this.published = true; },
    leave() { this.left = true; return Promise.resolve(); },
  };
}

/** Mirrors LiveSessionContext.jsx's hasActiveHostElsewhere(). */
function hasActiveHostElsewhere(current, liveId) {
  return shouldBlockSessionSwitch({
    currentLiveId: current.liveId,
    currentIsHost: current.isHost,
    incomingLiveId: liveId,
  });
}

/**
 * Mirrors the guarded joinAgora() flow: check -> fetch token -> re-check ->
 * create tracks -> re-check -> join/publish. `getCurrent` is called at
 * each guard point so a test can mutate "current session" state between
 * awaits to simulate the real race (an external event changing
 * sessionRef.current while this function is suspended on an await).
 */
async function attemptJoin({ liveId, getCurrent, fetchToken, createTracks, client }) {
  if (hasActiveHostElsewhere(getCurrent(), liveId)) {
    return { outcome: "blocked-before" };
  }

  const token = await fetchToken();
  if (hasActiveHostElsewhere(getCurrent(), liveId)) {
    return { outcome: "blocked-after-token", token };
  }

  const tracks = await createTracks();
  if (hasActiveHostElsewhere(getCurrent(), liveId)) {
    tracks.audio.close();
    tracks.video.close();
    return { outcome: "blocked-after-tracks", token, tracks };
  }

  await client.join();
  await client.publish();
  return { outcome: "joined", token, tracks };
}

test.afterEach(() => {
  liveSessionStore.closeOthers(undefined, { includeHost: true });
});

test("blocks before fetching a token or creating any track when an active host session exists elsewhere", async () => {
  const hostSession = { client: createFakeClient(), isHost: true };
  liveSessionStore.suspend("live-a", hostSession);

  let fetchTokenCalls = 0;
  let createTracksCalls = 0;
  const result = await attemptJoin({
    liveId: "live-b",
    getCurrent: () => ({ liveId: "live-a", isHost: true }),
    fetchToken: async () => { fetchTokenCalls += 1; return "token"; },
    createTracks: async () => { createTracksCalls += 1; return { audio: createFakeTrack(), video: createFakeTrack() }; },
    client: createFakeClient(),
  });

  assert.equal(result.outcome, "blocked-before");
  assert.equal(fetchTokenCalls, 0, "must never request a token for the blocked room");
  assert.equal(createTracksCalls, 0, "must never create camera/mic tracks for the blocked room");
  assert.equal(liveSessionStore.hasSuspended("live-a"), true, "the original host session must be untouched");
  assert.equal(hostSession.client.left, false);
});

test("same Live id (resuming) is never blocked, even while hosting", async () => {
  const hostSession = { client: createFakeClient(), isHost: true };
  liveSessionStore.suspend("live-a", hostSession);

  const result = await attemptJoin({
    liveId: "live-a",
    getCurrent: () => ({ liveId: "live-a", isHost: true }),
    fetchToken: async () => "token",
    createTracks: async () => ({ audio: createFakeTrack(), video: createFakeTrack() }),
    client: createFakeClient(),
  });

  assert.equal(result.outcome, "joined");
});

test("race: a conflicting host session appears while the token request is in flight -> blocked after token, no tracks created, nothing joined", async () => {
  let current = { liveId: null, isHost: false };
  const client = createFakeClient();
  let createTracksCalls = 0;

  const result = await attemptJoin({
    liveId: "live-b",
    getCurrent: () => current,
    fetchToken: async () => {
      // Simulate the host confirming/claiming another live mid-request.
      current = { liveId: "live-a", isHost: true };
      return "token";
    },
    createTracks: async () => { createTracksCalls += 1; return { audio: createFakeTrack(), video: createFakeTrack() }; },
    client,
  });

  assert.equal(result.outcome, "blocked-after-token");
  assert.equal(createTracksCalls, 0, "must not create tracks once blocked, even if the token request already finished");
  assert.equal(client.joined, false);
  assert.equal(client.published, false);
});

test("race: a conflicting host session appears while camera/mic tracks are being created -> blocked after tracks, only the new tracks are closed, nothing joined/published", async () => {
  let current = { liveId: null, isHost: false };
  const client = createFakeClient();
  let createdAudio;
  let createdVideo;

  const result = await attemptJoin({
    liveId: "live-b",
    getCurrent: () => current,
    fetchToken: async () => "token",
    createTracks: async () => {
      createdAudio = createFakeTrack();
      createdVideo = createFakeTrack();
      // Simulate the race happening between track creation finishing and
      // the final re-check (e.g. another tab/flow confirmed hosting
      // live-a while this awaited AgoraRTC.createMicrophoneAndCameraTracks()).
      current = { liveId: "live-a", isHost: true };
      return { audio: createdAudio, video: createdVideo };
    },
    client,
  });

  assert.equal(result.outcome, "blocked-after-tracks");
  assert.equal(createdAudio.closed, true, "the just-created mic track for the blocked room must be released");
  assert.equal(createdVideo.closed, true, "the just-created camera track for the blocked room must be released");
  assert.equal(client.joined, false, "client.join() must never be called once blocked");
  assert.equal(client.published, false, "client.publish() must never be called once blocked");
});

test("the original host session is never touched by a blocked attempt, so the user can restore it afterwards", async () => {
  const hostSession = { client: createFakeClient(), isHost: true, localAudioTrack: createFakeTrack(), localVideoTrack: createFakeTrack() };
  liveSessionStore.suspend("live-a", hostSession);

  const result = await attemptJoin({
    liveId: "live-b",
    getCurrent: () => ({ liveId: "live-a", isHost: true }),
    fetchToken: async () => "token",
    createTracks: async () => ({ audio: createFakeTrack(), video: createFakeTrack() }),
    client: createFakeClient(),
  });

  assert.equal(result.outcome, "blocked-before");
  // "Volver a mi transmisión" — the original host session is exactly as
  // it was: same client, same tracks, never left/closed.
  const restored = liveSessionStore.getSuspended("live-a");
  assert.equal(restored, hostSession);
  assert.equal(restored.client.left, false);
  assert.equal(restored.localAudioTrack.closed, false);
  assert.equal(restored.localVideoTrack.closed, false);
});

test("ending the original host session (confirmed) unblocks the new Live for a later attempt", async () => {
  const hostSession = { client: createFakeClient(), isHost: true };
  liveSessionStore.suspend("live-a", hostSession);

  const blocked = await attemptJoin({
    liveId: "live-b",
    getCurrent: () => ({ liveId: "live-a", isHost: true }),
    fetchToken: async () => "token",
    createTracks: async () => ({ audio: createFakeTrack(), video: createFakeTrack() }),
    client: createFakeClient(),
  });
  assert.equal(blocked.outcome, "blocked-before");

  // Simulate requestEndStream()'s CONFIRMED-success teardown (never an
  // automatic one — see live-session-switch-guard.test.mjs).
  liveSessionStore.teardownSuspended("live-a");

  const retried = await attemptJoin({
    liveId: "live-b",
    getCurrent: () => ({ liveId: null, isHost: false }),
    fetchToken: async () => "token",
    createTracks: async () => ({ audio: createFakeTrack(), video: createFakeTrack() }),
    client: createFakeClient(),
  });
  assert.equal(retried.outcome, "joined");
});
