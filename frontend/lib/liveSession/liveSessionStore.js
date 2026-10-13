/**
 * liveSessionStore — plain JS singleton (NOT React state) that keeps a
 * "suspended" (backgrounded) Agora session alive while the user navigates
 * away from /live/[id].
 *
 * Why a module singleton instead of React context/state: the Agora
 * RtcClient + local tracks must keep existing (and keep receiving SDK
 * events / token-renewal timers) across a full unmount/remount of the
 * live room page. React state is destroyed on unmount; a module-level
 * object is not, as long as something still references it — this store
 * is that reference. The live room page (frontend/app/live/[id]/page.jsx)
 * reads/writes it directly; the floating MiniPlayer reads it to render the
 * backgrounded video. See frontend/contexts/LiveSessionContext.jsx for the
 * React-facing UI state (minimized flag, creator info, actions) built on
 * top of this store.
 *
 * Only ONE suspended session is expected to exist at a time (a user only
 * ever has one "active" live they're watching/hosting) — `closeOthers`
 * enforces that so switching to a different live never reuses or leaks a
 * previous session (see problem statement requirement: "Cambiar entre dos
 * Lives sin reutilizar una sesión equivocada").
 */

import { markTornDown } from "./sessionLifecycle.js";

/**
 * @type {Map<string, {
 *   client: any, localAudioTrack: any, localVideoTrack: any,
 *   isHost: boolean, isPublisher: boolean,
 *   cancelRenewal?: (() => void) | null,
 * }>}
 */
const suspendedSessions = new Map();

function safeClose(track) {
  try {
    track?.close();
  } catch {
    // ignore — track may already be closed/invalid
  }
}

function safeLeave(client) {
  try {
    client?.leave().catch(() => {});
  } catch {
    // ignore
  }
}

/** Store a still-connected session so it keeps running in the background. */
export function suspend(liveId, session) {
  if (!liveId || !session?.client) return;
  suspendedSessions.set(String(liveId), session);
}

/** Retrieve a previously suspended session for this liveId, if any. */
export function getSuspended(liveId) {
  if (!liveId) return null;
  return suspendedSessions.get(String(liveId)) || null;
}

export function hasSuspended(liveId) {
  return !!getSuspended(liveId);
}

/** Drop the bookkeeping without touching the client (caller already tore it down). */
export function clearSuspended(liveId) {
  if (!liveId) return;
  suspendedSessions.delete(String(liveId));
}

/**
 * Fully disconnects and forgets the suspended session for this liveId
 * (used when the viewer closes the mini-player, or the host ends the
 * stream from it — the live page itself isn't mounted at that point, so
 * this store is the only place left holding the real Agora objects).
 *
 * Besides closing tracks and leaving the channel, this also stops any
 * background work that was still running for the backgrounded session —
 * the pending token-renewal timer (via `cancelRenewal`, see
 * frontend/lib/liveSession/sessionLifecycle.js) and marks the client as
 * torn down so any callback from an older/still-resolving closure (e.g. a
 * token renewal already in flight when this runs) recognizes the session
 * is gone and does nothing. Safe to call more than once for the same
 * liveId — the second call is a no-op because `getSuspended` already
 * returns null once `clearSuspended` has run.
 */
export function teardownSuspended(liveId) {
  const session = getSuspended(liveId);
  if (!session) return;
  try {
    session.cancelRenewal?.();
  } catch {
    // ignore — scheduler cancellation must never block real teardown
  }
  markTornDown(session.client);
  safeClose(session.localAudioTrack);
  safeClose(session.localVideoTrack);
  safeLeave(session.client);
  clearSuspended(liveId);
}

/** Tears down every suspended session except the given liveId (or all, if omitted). */
export function closeOthers(exceptLiveId) {
  for (const liveId of Array.from(suspendedSessions.keys())) {
    if (exceptLiveId && String(liveId) === String(exceptLiveId)) continue;
    teardownSuspended(liveId);
  }
}
