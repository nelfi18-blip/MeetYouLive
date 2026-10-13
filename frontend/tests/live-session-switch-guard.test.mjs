import test from "node:test";
import assert from "node:assert/strict";
import { shouldBlockSessionSwitch } from "../lib/liveSession/sessionSwitchGuard.js";
import * as liveSessionStore from "../lib/liveSession/liveSessionStore.js";

/**
 * Covers the "CORRECCIÓN PUNTUAL DEL PR #1041" fix: openSession() switching
 * the single mini-player slot to a different Live must never silently
 * disconnect an ACTIVE HOST session, while a VIEWER's previous session
 * keeps being disconnected as before.
 *
 * `shouldBlockSessionSwitch` is tested exhaustively as a pure function.
 * The remaining tests simulate the exact algorithm
 * frontend/contexts/LiveSessionContext.jsx's openSession() runs (decide,
 * THEN optionally call liveSessionStore.closeOthers(), THEN apply the new
 * session) using the real liveSessionStore, since this repo has no
 * React-component test harness — openSession() itself contains no
 * additional branching beyond gluing these two pieces together, so this
 * fully exercises its real behavior.
 *
 * The "cancelación de finalización / error HTTP / éxito confirmado /
 * pulsaciones repetidas" end-stream scenarios (reused, unchanged, per
 * requirement 4) are already covered by
 * frontend/tests/live-session-end-stream-guard.test.mjs; the last test
 * below additionally shows the two features composing correctly — a
 * blocked host switch is only ever resolved by a CONFIRMED end-stream
 * teardown, never by the switch itself.
 */

function createFakeTrack() {
  return { closed: false, close() { this.closed = true; } };
}

function createFakeClient() {
  return { left: false, leave() { this.left = true; return Promise.resolve(); } };
}

function makeSession(overrides = {}) {
  return {
    client: createFakeClient(),
    localAudioTrack: createFakeTrack(),
    localVideoTrack: createFakeTrack(),
    isHost: false,
    isPublisher: true,
    cancelRenewal: null,
    ...overrides,
  };
}

/** Mirrors openSession()'s algorithm exactly, without any React involved. */
function simulateOpenSession(current, meta) {
  const blocked = shouldBlockSessionSwitch({
    currentLiveId: current.liveId,
    currentIsHost: current.isHost,
    incomingLiveId: meta.liveId,
  });
  if (blocked) return { applied: false, session: current };
  if (current.liveId && String(current.liveId) !== String(meta.liveId)) {
    liveSessionStore.closeOthers(meta.liveId);
  }
  return { applied: true, session: { ...meta, minimized: false } };
}

test.afterEach(() => {
  liveSessionStore.closeOthers(undefined, { includeHost: true });
});

test("shouldBlockSessionSwitch: no live currently tracked -> never blocked", () => {
  assert.equal(
    shouldBlockSessionSwitch({ currentLiveId: null, currentIsHost: false, incomingLiveId: "live-b" }),
    false
  );
});

test("shouldBlockSessionSwitch: incoming live is the same as the tracked one -> never blocked (resume)", () => {
  assert.equal(
    shouldBlockSessionSwitch({ currentLiveId: "live-a", currentIsHost: true, incomingLiveId: "live-a" }),
    false
  );
});

test("shouldBlockSessionSwitch: tracked session is a VIEWER on a different live -> not blocked", () => {
  assert.equal(
    shouldBlockSessionSwitch({ currentLiveId: "live-a", currentIsHost: false, incomingLiveId: "live-b" }),
    false
  );
});

test("shouldBlockSessionSwitch: tracked session is an active HOST on a different live -> BLOCKED", () => {
  assert.equal(
    shouldBlockSessionSwitch({ currentLiveId: "live-a", currentIsHost: true, incomingLiveId: "live-b" }),
    true
  );
});

test("espectador → otro Live: the previous viewer session is disconnected and the new one is applied", () => {
  const viewerSession = makeSession({ isHost: false });
  liveSessionStore.suspend("live-a", viewerSession);

  const result = simulateOpenSession(
    { liveId: "live-a", isHost: false },
    { liveId: "live-b", isHost: false }
  );

  assert.equal(result.applied, true);
  assert.equal(result.session.liveId, "live-b");
  assert.equal(liveSessionStore.hasSuspended("live-a"), false, "the previous viewer session must be torn down");
  assert.equal(viewerSession.client.left, true);
});

test("anfitrión → otro Live: the active host session is NEVER silently closed, and the switch is blocked", () => {
  const hostSession = makeSession({ isHost: true });
  liveSessionStore.suspend("live-a", hostSession);

  const result = simulateOpenSession(
    { liveId: "live-a", isHost: true },
    { liveId: "live-b", isHost: false }
  );

  assert.equal(result.applied, false, "the single mini-player slot must not be handed to the new live while hosting");
  assert.equal(liveSessionStore.hasSuspended("live-a"), true, "the host session must still be fully alive");
  assert.equal(hostSession.client.left, false);
  assert.equal(hostSession.localAudioTrack.closed, false);
  assert.equal(hostSession.localVideoTrack.closed, false);
});

test("pulsaciones repetidas: retrying the blocked switch multiple times never tears down the host session", () => {
  const hostSession = makeSession({ isHost: true });
  liveSessionStore.suspend("live-a", hostSession);

  const current = { liveId: "live-a", isHost: true };
  for (let i = 0; i < 5; i += 1) {
    const result = simulateOpenSession(current, { liveId: "live-b", isHost: false });
    assert.equal(result.applied, false);
  }

  assert.equal(liveSessionStore.hasSuspended("live-a"), true);
  assert.equal(hostSession.client.left, false);
});

test("host conflict is resolved ONLY by a confirmed end-stream teardown, never by the switch attempt itself", () => {
  // Mirrors requestEndStream()'s already-tested contract (see
  // tests/live-session-end-stream-guard.test.mjs for the HTTP/guard
  // semantics): liveSessionStore.teardownSuspended() must only run AFTER
  // the backend confirms the end — never as a side effect of switching.
  const hostSession = makeSession({ isHost: true });
  liveSessionStore.suspend("live-a", hostSession);

  // Attempting to switch while hosting is blocked and changes nothing.
  const blockedAttempt = simulateOpenSession({ liveId: "live-a", isHost: true }, { liveId: "live-b", isHost: false });
  assert.equal(blockedAttempt.applied, false);
  assert.equal(liveSessionStore.hasSuspended("live-a"), true);

  // Simulate requestEndStream()'s CONFIRMED-success branch — the only
  // code path allowed to release the host's resources.
  liveSessionStore.teardownSuspended("live-a");

  assert.equal(liveSessionStore.hasSuspended("live-a"), false);
  assert.equal(hostSession.client.left, true);

  // Now that the host live is really gone, switching to a different live
  // is no longer blocked.
  const afterEnd = simulateOpenSession({ liveId: null, isHost: false }, { liveId: "live-b", isHost: false });
  assert.equal(afterEnd.applied, true);
  assert.equal(afterEnd.session.liveId, "live-b");
});
