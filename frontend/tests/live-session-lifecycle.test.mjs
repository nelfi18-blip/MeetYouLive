import test from "node:test";
import assert from "node:assert/strict";
import {
  attachRemoteUserListeners,
  createRenewalScheduler,
  markTornDown,
  isTornDown,
} from "../lib/liveSession/sessionLifecycle.js";

/** Minimal fake Agora client: just enough `on`/`off` bookkeeping to assert
 * against, mirroring the style of tests/agora-guest-transition.test.mjs. */
function createFakeClient() {
  const listeners = new Map();
  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler);
    },
    listenerCount(event) {
      return listeners.get(event)?.size || 0;
    },
  };
}

test("attachRemoteUserListeners: registers exactly one handler per event", () => {
  const client = createFakeClient();
  const onPublished = () => {};
  const onUnpublished = () => {};
  const onLeft = () => {};

  attachRemoteUserListeners(client, { onPublished, onUnpublished, onLeft });

  assert.equal(client.listenerCount("user-published"), 1);
  assert.equal(client.listenerCount("user-unpublished"), 1);
  assert.equal(client.listenerCount("user-left"), 1);
});

test("attachRemoteUserListeners: detach() removes exactly those three listeners", () => {
  const client = createFakeClient();
  const detach = attachRemoteUserListeners(client, {
    onPublished: () => {},
    onUnpublished: () => {},
    onLeft: () => {},
  });

  detach();

  assert.equal(client.listenerCount("user-published"), 0);
  assert.equal(client.listenerCount("user-unpublished"), 0);
  assert.equal(client.listenerCount("user-left"), 0);
});

test("attachRemoteUserListeners: detach() is idempotent (calling twice is a safe no-op)", () => {
  const client = createFakeClient();
  const detach = attachRemoteUserListeners(client, {
    onPublished: () => {},
    onUnpublished: () => {},
    onLeft: () => {},
  });

  assert.doesNotThrow(() => {
    detach();
    detach();
  });
  assert.equal(client.listenerCount("user-published"), 0);
});

test("resume cycle: detaching before re-attaching never leaves duplicate listeners (regression for PR #1041 bug)", () => {
  // Simulates: original mount attaches -> minimizes (must detach BEFORE
  // suspending) -> resume mount attaches its own fresh set. Before the
  // fix, the original mount's listeners were anonymous and never removed,
  // so after one resume there were TWO sets registered on the same client.
  const client = createFakeClient();
  const originalDetach = attachRemoteUserListeners(client, {
    onPublished: () => {},
    onUnpublished: () => {},
    onLeft: () => {},
  });
  assert.equal(client.listenerCount("user-published"), 1);

  // Minimize: detach before suspending.
  originalDetach();
  assert.equal(client.listenerCount("user-published"), 0);

  // Resume: a fresh mount attaches its own set.
  attachRemoteUserListeners(client, {
    onPublished: () => {},
    onUnpublished: () => {},
    onLeft: () => {},
  });

  assert.equal(client.listenerCount("user-published"), 1, "must never duplicate listeners across a minimize/resume cycle");
  assert.equal(client.listenerCount("user-unpublished"), 1);
  assert.equal(client.listenerCount("user-left"), 1);
});

test("attachRemoteUserListeners: a null/undefined client is handled safely (no-op detach)", () => {
  const detach = attachRemoteUserListeners(null, { onPublished: () => {}, onUnpublished: () => {}, onLeft: () => {} });
  assert.doesNotThrow(() => detach());
});

test("createRenewalScheduler: only ever one pending timer — scheduling again replaces, never stacks, the previous one", () => {
  let calls = 0;
  const scheduler = createRenewalScheduler();

  scheduler.schedule(10, () => {
    calls += 1;
  });
  // Re-schedule before the first timer would fire — this must CANCEL the
  // first one, not let both run.
  scheduler.schedule(10, () => {
    calls += 1;
  });

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(calls, 1, "re-scheduling must replace the pending timer, not add a second one");
      resolve();
    }, 40);
  });
});

test("createRenewalScheduler: cancel() stops a pending timer immediately, from outside the closure that scheduled it", () => {
  let fired = false;
  const scheduler = createRenewalScheduler();
  scheduler.schedule(10, () => {
    fired = true;
  });

  // Simulates liveSessionStore.teardownSuspended() calling cancel() on a
  // suspended session's scheduler with no live page mounted.
  scheduler.cancel();

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(fired, false, "cancel() must stop the pending renewal immediately, not just lazily on next tick");
      resolve();
    }, 40);
  });
});

test("createRenewalScheduler: schedule() after cancel() is a no-op (a torn-down session can never reschedule)", () => {
  let fired = false;
  const scheduler = createRenewalScheduler();
  scheduler.cancel();
  scheduler.schedule(5, () => {
    fired = true;
  });

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(fired, false);
      assert.equal(scheduler.isCancelled(), true);
      resolve();
    }, 30);
  });
});

test("markTornDown/isTornDown: flags are per-client, not global", () => {
  const clientA = createFakeClient();
  const clientB = createFakeClient();

  assert.equal(isTornDown(clientA), false);
  markTornDown(clientA);
  assert.equal(isTornDown(clientA), true);
  assert.equal(isTornDown(clientB), false, "tearing down one session's client must never affect a different live's client");
});

test("isTornDown: a stale callback from an older closure correctly observes a later teardown on the SAME client", () => {
  // Regression for "evitar que callbacks antiguos actúen sobre una sesión
  // cerrada" — the flag lives on the shared client object, so a callback
  // captured before teardown still sees it afterwards.
  const client = createFakeClient();
  const isSessionTornDown = () => isTornDown(client);

  assert.equal(isSessionTornDown(), false);
  markTornDown(client);
  assert.equal(isSessionTornDown(), true);
});

test("isTornDown: handles null/undefined client without throwing", () => {
  assert.equal(isTornDown(null), false);
  assert.equal(isTornDown(undefined), false);
  assert.doesNotThrow(() => markTornDown(null));
});
