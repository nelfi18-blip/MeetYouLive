/**
 * sessionLifecycle — small, framework-free helpers that make the
 * suspend/resume Agora session (frontend/app/live/[id]/page.jsx) safe to
 * tear down from OUTSIDE any mounted React component — i.e. from
 * liveSessionStore.teardownSuspended()/closeOthers(), when the viewer
 * closes the mini-player or the host ends the stream while the live room
 * page itself is unmounted.
 *
 * These fix two concrete bugs found while reviewing the continuity/mini-
 * player feature:
 *
 *  - `user-published`/`user-unpublished`/`user-left` listeners were added
 *    in frontend/app/live/[id]/page.jsx as anonymous inline functions and
 *    never removed, so resuming a minimized session added a SECOND set of
 *    listeners on top of the (still-attached) original ones — every
 *    remote event then fired, and every subscribe()/track update ran,
 *    twice after the first minimize→resume cycle.
 *  - the token-renewal timer could only be stopped "lazily" (it checked a
 *    teardown flag on its NEXT tick), so closing a suspended session with
 *    no live page mounted had no way to cancel the pending setTimeout
 *    immediately — it kept firing one extra (wasted, and potentially
 *    stale-session) token fetch/renew call.
 *
 * Kept dependency-free (no React, no Agora SDK types) so it can be unit
 * tested with a plain fake client object, the same way
 * frontend/lib/agoraGuestTransition.js is tested.
 */

/**
 * Registers the three remote-user events the live room cares about and
 * returns a `detach()` function that removes exactly those three
 * listeners. `detach()` is idempotent — calling it more than once (e.g.
 * once eagerly on minimize, and again defensively on a later real
 * teardown) is a safe no-op the second time.
 */
export function attachRemoteUserListeners(client, { onPublished, onUnpublished, onLeft }) {
  if (!client) return () => {};
  client.on("user-published", onPublished);
  client.on("user-unpublished", onUnpublished);
  client.on("user-left", onLeft);

  let detached = false;
  return function detach() {
    if (detached) return;
    detached = true;
    client.off("user-published", onPublished);
    client.off("user-unpublished", onUnpublished);
    client.off("user-left", onLeft);
  };
}

/**
 * A single-timer scheduler for Agora token renewal. `schedule()` always
 * clears any previously pending timer before arming a new one, so there
 * is structurally only ever one pending renewal per scheduler instance —
 * and, unlike a plain closure-local `setTimeout` id, `cancel()` can be
 * called from code that does NOT have access to the closure that created
 * it (e.g. liveSessionStore.teardownSuspended(), invoked with no live
 * page mounted), stopping it immediately instead of waiting for the next
 * scheduled tick.
 */
export function createRenewalScheduler() {
  let timerId = null;
  let cancelled = false;

  return {
    schedule(delayMs, callback) {
      if (cancelled) return;
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = null;
        callback();
      }, delayMs);
    },
    cancel() {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      timerId = null;
    },
    isCancelled() {
      return cancelled;
    },
  };
}

const TEARDOWN_FLAG = "__mylTeardown";

/** Marks the shared Agora client object as permanently torn down. */
export function markTornDown(client) {
  if (client) client[TEARDOWN_FLAG] = true;
}

/**
 * Whether this client was already torn down — used so a callback started
 * by an earlier (now-unmounted, or now-resumed-and-re-suspended) closure
 * never acts on a session that has since been closed for real.
 */
export function isTornDown(client) {
  return !!client?.[TEARDOWN_FLAG];
}
