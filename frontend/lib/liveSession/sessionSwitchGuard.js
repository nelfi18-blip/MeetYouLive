/**
 * sessionSwitchGuard — pure decision used by
 * frontend/contexts/LiveSessionContext.jsx's openSession() to decide,
 * OUTSIDE of any React state updater, whether claiming the single
 * mini-player slot for an incoming live must be BLOCKED because the
 * currently tracked session is an ACTIVE HOST broadcast on a DIFFERENT
 * live.
 *
 * Why this exists (bug fixed here): openSession() used to decide this
 * same question *inside* its `setSession((prev) => { ... })` updater, and
 * ran the destructive `liveSessionStore.closeOthers(...)` call as a side
 * effect of that updater — mixing a pure state transition with an impure
 * side effect, and doing so without even checking whether the previous
 * session belonged to an active HOST. That could silently disconnect a
 * host's live Agora session (tracks closed, channel left) while their Live
 * stayed marked active on the server, just because they navigated to a
 * different Live. See frontend/lib/liveSession/liveSessionStore.js's
 * `closeOthers` for the matching fix on the "which sessions get torn
 * down" side.
 *
 * Kept as a tiny, framework-free, pure function (no React, no store
 * access, no Agora) so the host-vs-viewer switching decision can be unit
 * tested exhaustively without mounting any component — see
 * frontend/tests/live-session-switch-guard.test.mjs.
 *
 * Decision table:
 *  - no live currently tracked               -> never blocked (nothing to protect)
 *  - incoming live IS the tracked live       -> never blocked (not a switch, e.g. a resume)
 *  - tracked live is a VIEWER session        -> never blocked (viewer continuity keeps
 *                                                disconnecting the old session before
 *                                                entering another room, unchanged)
 *  - tracked live is an ACTIVE HOST session  -> BLOCKED: the host must get an explicit
 *                                                choice — return to it, or end it via the
 *                                                confirmed requestEndStream flow — instead
 *                                                of silently losing/disconnecting it.
 */
export function shouldBlockSessionSwitch({ currentLiveId, currentIsHost, incomingLiveId }) {
  if (!currentLiveId) return false;
  if (String(currentLiveId) === String(incomingLiveId)) return false;
  return !!currentIsHost;
}
