import test from "node:test";
import assert from "node:assert/strict";
import * as liveSessionStore from "../lib/liveSession/liveSessionStore.js";
import { isTornDown } from "../lib/liveSession/sessionLifecycle.js";

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

test.afterEach(() => {
  // The store is a module-level singleton — fully drain it between tests
  // so assertions never leak across test cases. `includeHost: true` is
  // needed here because closeOthers() no longer tears down host sessions
  // by default (see the tests below) — this is test isolation only, no
  // production call site needs the override.
  liveSessionStore.closeOthers(undefined, { includeHost: true });
});

test("suspend/getSuspended: round-trips the exact session object for its liveId", () => {
  const session = makeSession();
  liveSessionStore.suspend("live-1", session);

  assert.equal(liveSessionStore.hasSuspended("live-1"), true);
  assert.equal(liveSessionStore.getSuspended("live-1"), session);
});

test("teardownSuspended: closes both tracks and leaves the channel exactly once", () => {
  const session = makeSession();
  liveSessionStore.suspend("live-1", session);

  liveSessionStore.teardownSuspended("live-1");

  assert.equal(session.localAudioTrack.closed, true);
  assert.equal(session.localVideoTrack.closed, true);
  assert.equal(session.client.left, true);
  assert.equal(liveSessionStore.hasSuspended("live-1"), false);
});

test("teardownSuspended: marks the client torn down so stale callbacks recognize the closed session", () => {
  const session = makeSession();
  liveSessionStore.suspend("live-1", session);

  liveSessionStore.teardownSuspended("live-1");

  assert.equal(isTornDown(session.client), true);
});

test("teardownSuspended: cancels the session's pending token-renewal timer", () => {
  let cancelled = false;
  const session = makeSession({ cancelRenewal: () => { cancelled = true; } });
  liveSessionStore.suspend("live-1", session);

  liveSessionStore.teardownSuspended("live-1");

  assert.equal(cancelled, true);
});

test("teardownSuspended: calling it twice for the same liveId is a safe no-op the second time (closing a suspended session)", () => {
  let cancelCalls = 0;
  const session = makeSession({ cancelRenewal: () => { cancelCalls += 1; } });
  liveSessionStore.suspend("live-1", session);

  liveSessionStore.teardownSuspended("live-1");
  assert.doesNotThrow(() => liveSessionStore.teardownSuspended("live-1"));

  assert.equal(cancelCalls, 1, "a second teardown of an already-closed session must not re-cancel/re-close anything");
});

test("teardownSuspended: a scheduler cancellation error never blocks closing tracks/leaving the channel", () => {
  const session = makeSession({
    cancelRenewal: () => {
      throw new Error("boom");
    },
  });
  liveSessionStore.suspend("live-1", session);

  assert.doesNotThrow(() => liveSessionStore.teardownSuspended("live-1"));
  assert.equal(session.localAudioTrack.closed, true);
  assert.equal(session.client.left, true);
});

test("switching between two different lives: closeOthers tears down every OTHER suspended VIEWER session, keeping the given one", () => {
  const sessionA = makeSession();
  const sessionB = makeSession();
  liveSessionStore.suspend("live-a", sessionA);
  liveSessionStore.suspend("live-b", sessionB);

  liveSessionStore.closeOthers("live-b");

  assert.equal(liveSessionStore.hasSuspended("live-a"), false, "the previous live must be fully torn down, never reused");
  assert.equal(sessionA.client.left, true);
  assert.equal(liveSessionStore.hasSuspended("live-b"), true, "the newly active live must be untouched");
  assert.equal(sessionB.client.left, false);
});

test("closeOthers with no argument tears down every suspended VIEWER session", () => {
  liveSessionStore.suspend("live-a", makeSession());
  liveSessionStore.suspend("live-b", makeSession());

  liveSessionStore.closeOthers();

  assert.equal(liveSessionStore.hasSuspended("live-a"), false);
  assert.equal(liveSessionStore.hasSuspended("live-b"), false);
});

test("closeOthers: never tears down a suspended HOST session (regression — a host's active broadcast must survive switching Lives)", () => {
  const hostSession = makeSession({ isHost: true });
  const viewerSession = makeSession({ isHost: false });
  liveSessionStore.suspend("live-host", hostSession);
  liveSessionStore.suspend("live-viewer", viewerSession);

  liveSessionStore.closeOthers("live-new");

  assert.equal(liveSessionStore.hasSuspended("live-host"), true, "an active host session must never be silently torn down");
  assert.equal(hostSession.client.left, false);
  assert.equal(hostSession.localAudioTrack.closed, false);
  assert.equal(hostSession.localVideoTrack.closed, false);
  assert.equal(liveSessionStore.hasSuspended("live-viewer"), false, "a backgrounded viewer session must still be disconnected");
  assert.equal(viewerSession.client.left, true);
});

test("closeOthers: the exempted liveId is preserved even when it's the host's own session", () => {
  const hostSession = makeSession({ isHost: true });
  liveSessionStore.suspend("live-host", hostSession);

  liveSessionStore.closeOthers("live-host");

  assert.equal(liveSessionStore.hasSuspended("live-host"), true);
  assert.equal(hostSession.client.left, false);
});

test("closeOthers with { includeHost: true } tears down host sessions too (explicit full reset, e.g. test isolation/logout)", () => {
  const hostSession = makeSession({ isHost: true });
  liveSessionStore.suspend("live-host", hostSession);

  liveSessionStore.closeOthers("live-new", { includeHost: true });

  assert.equal(liveSessionStore.hasSuspended("live-host"), false);
  assert.equal(hostSession.client.left, true);
});

test("clearSuspended: drops bookkeeping without touching the client/tracks (caller already tore them down)", () => {
  const session = makeSession();
  liveSessionStore.suspend("live-1", session);

  liveSessionStore.clearSuspended("live-1");

  assert.equal(liveSessionStore.hasSuspended("live-1"), false);
  assert.equal(session.client.left, false, "clearSuspended must not itself leave/close anything");
});

test("suspend: ignores a session with no client (nothing real to keep alive in the background)", () => {
  liveSessionStore.suspend("live-1", { client: null });
  assert.equal(liveSessionStore.hasSuspended("live-1"), false);
});
