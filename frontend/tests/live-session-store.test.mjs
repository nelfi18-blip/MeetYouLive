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
    isHost: true,
    isPublisher: true,
    cancelRenewal: null,
    ...overrides,
  };
}

test.afterEach(() => {
  // The store is a module-level singleton — fully drain it between tests
  // so assertions never leak across test cases.
  liveSessionStore.closeOthers();
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

test("switching between two different lives: closeOthers tears down every OTHER suspended session, keeping the given one", () => {
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

test("closeOthers with no argument tears down every suspended session", () => {
  liveSessionStore.suspend("live-a", makeSession());
  liveSessionStore.suspend("live-b", makeSession());

  liveSessionStore.closeOthers();

  assert.equal(liveSessionStore.hasSuspended("live-a"), false);
  assert.equal(liveSessionStore.hasSuspended("live-b"), false);
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
