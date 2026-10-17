/**
 * randomAutoNext.js
 *
 * Deterministic, race-free state machine for the optional 30s "auto-next"
 * mode on /random (see frontend/app/random/page.jsx). Extracted into a
 * framework-free module — no React, no timers, no network — so the actual
 * transition rules can be unit-tested directly (see
 * frontend/tests/random-auto-next-state-machine.test.mjs) instead of only
 * being checked by regex against the component's source text.
 *
 * Why this exists: the first cut of this feature kept the equivalent state
 * spread across several `useState`/`useRef` values directly in page.jsx
 * (`autoNextSecondsLeft`, `sessionEpoch`, `autoNextFiredRef`). That made a
 * few real coordination bugs possible:
 *
 *  - A duplicate/late "matched" result for the SAME session (e.g. from the
 *    GET /status poll racing the "random_matched" socket event) could be
 *    processed while the Agora client reference was still briefly null,
 *    incorrectly treated as a "new" session and restarting the countdown.
 *  - The manual "Siguiente" button and the automatic countdown trigger each
 *    called `handleNext()` independently with no shared, synchronous guard,
 *    so a manual tap landing in the same tick as the countdown reaching 0
 *    could fire TWO concurrent `callRandom("next")` requests.
 *  - The countdown kept ticking for a brief window after a switch had
 *    already been requested (before the async cleanup/network round trip
 *    resolved), instead of stopping immediately.
 *  - Nothing explicitly prevented the countdown from resuming before the
 *    NEW session actually reached a connected Agora call.
 *
 * This module fixes all of the above by funneling every relevant event
 * (new match, reconnection, enabling/disabling auto-mode, beginning/ending
 * a "next" request, each 1s tick) through pure functions operating on a
 * single state object, with one atomic guard (`nextInFlight`) shared by
 * both the manual and automatic trigger paths.
 */

// Seconds counted down once a real call is connected before the existing
// handleNext()/callRandom("next") flow is reused.
export const AUTO_NEXT_SECONDS = 30;
// Last N seconds of the countdown show a discreet warning + "keep talking".
export const AUTO_NEXT_WARNING_SECONDS = 5;

/**
 * @typedef {Object} AutoNextState
 * @property {boolean} enabled - Whether auto-mode is turned on (OFF by default).
 * @property {number} secondsLeft - Seconds remaining in the current countdown.
 * @property {boolean} suspended - True whenever ticking/triggering must be
 *   held off: whenever `phase !== "connected"` (searching, connecting,
 *   reconnecting, idle, ended) for the currently tracked session, and for
 *   as long as a "next" request is in flight. Reconnecting into the SAME
 *   session suspends the countdown but never resets `secondsLeft`, so it
 *   resumes exactly where it left off once back to "connected".
 * @property {boolean} nextInFlight - True from the moment a "next" switch
 *   (manual or automatic) has begun until it completes, guarding against a
 *   second concurrent trigger.
 * @property {string|null} sessionId - Last session identity this state
 *   machine has observed, used to tell a genuinely new session apart from
 *   a reconnection into the same one.
 */

/** Fresh state: auto-mode OFF, full countdown, no active session. */
export function createAutoNextState() {
  return {
    enabled: false,
    secondsLeft: AUTO_NEXT_SECONDS,
    suspended: true,
    nextInFlight: false,
    sessionId: null,
  };
}

/**
 * Called whenever the caller learns the current Random `phase` and/or
 * `sessionId` (e.g. from `applyResult()` and from the effect watching
 * `phase`). Idempotent: calling it repeatedly with the same
 * `{ phase, sessionId }` never changes anything beyond the first time, and
 * never touches `nextInFlight` (that transition belongs solely to
 * `beginNext()`/`endNext()`).
 *
 * - A different `sessionId` than previously observed (including becoming
 *   null, e.g. on cancel/exit/block) always means "this is not the session
 *   the countdown was running for": the countdown resets to
 *   AUTO_NEXT_SECONDS.
 * - `suspended` always mirrors `phase !== "connected"` for the currently
 *   tracked session (or no session at all) — so leaving "connected" for
 *   ANY reason, including into "reconnecting" for the very same session,
 *   immediately stops ticking, and returning to "connected" resumes it
 *   without ever resetting `secondsLeft`.
 */
export function syncSession(state, { phase, sessionId }) {
  let next = state;
  if (sessionId !== state.sessionId) {
    next = {
      ...next,
      sessionId,
      secondsLeft: AUTO_NEXT_SECONDS,
    };
  }
  // suspended tracks `phase` on every call (not just when a new session
  // appears): leaving "connected" — including into "reconnecting" for the
  // very same session — must immediately stop ticking, and returning to
  // "connected" for the currently tracked session must resume it without
  // touching secondsLeft. A next request in flight is left alone here;
  // beginNext()/endNext() own that transition exclusively.
  if (!next.nextInFlight) {
    next = { ...next, suspended: phase !== "connected" || !next.sessionId };
  }
  return next;
}

/**
 * Decide what `phase` value a "matched" result handler (applyResult() in
 * page.jsx) should pass into `syncSession()`.
 *
 * - A genuinely NEW session (`isSameSession: false`) has, by definition,
 *   not started connecting to Agora yet at the moment this is called —
 *   regardless of what the real current `phase` still reads (it may be a
 *   leftover value from a just-ended previous session) — so it is always
 *   forced to `"connecting"`, guaranteeing the countdown stays suspended
 *   until Agora actually reports `"connected"` for the new session.
 * - A duplicate/late "matched" result for the SAME session (e.g. the
 *   GET /status poll racing the "random_matched" socket event while the
 *   Agora join for that session is still settling) must instead use the
 *   REAL current `phase`, since that session may already be `"connected"`.
 *   Forcing `"connecting"` in that case would incorrectly suspend the
 *   countdown — and since `phase` itself never actually changes in this
 *   scenario, the separate effect that re-syncs on `phase` transitions
 *   would never re-run to lift that suspension again, leaving the
 *   countdown stuck suspended for the rest of the call.
 */
export function resolveMatchedPhase(isSameSession, realPhase) {
  return isSameSession ? realPhase : "connecting";
}

/**
 * Enable/disable auto-mode. Disabling (used both by the toggle and by
 * "Keep talking") never aborts a `nextInFlight` switch already underway —
 * it only guarantees no FUTURE tick can trigger a new one, satisfying
 * "prevent a pending switch that hasn't started yet" without cancelling
 * one already in progress. Enabling while already connected starts a
 * fresh full-length countdown immediately (mirrors the existing "enabling
 * mid-call starts a fresh 30s window" behavior).
 */
export function setEnabled(state, enabled, { phase } = {}) {
  if (!enabled) return { ...state, enabled: false };
  const next = { ...state, enabled: true, secondsLeft: AUTO_NEXT_SECONDS };
  if (phase === "connected" && next.sessionId) {
    next.suspended = false;
  }
  return next;
}

/**
 * Advance the countdown by one second. No-ops (returns the same state,
 * `shouldTriggerNext: false`) while disabled, suspended, or while a next
 * request is already in flight — this is what stops the countdown
 * immediately once a switch begins, rather than only after the async
 * cleanup/network round trip resolves.
 *
 * Returns `shouldTriggerNext: true` exactly once per countdown reaching 0
 * (the caller is expected to immediately call `beginNext()`/its own
 * "next" handler in response — it must not keep calling `tick()` without
 * the caller acting on a true `shouldTriggerNext`, since nothing in this
 * function other than `beginNext()` clears the reached-zero condition).
 */
export function tick(state) {
  if (!state.enabled || state.suspended || state.nextInFlight) {
    return { state, shouldTriggerNext: false };
  }
  const secondsLeft = Math.max(0, state.secondsLeft - 1);
  return { state: { ...state, secondsLeft }, shouldTriggerNext: secondsLeft <= 0 };
}

/**
 * Atomically request a "next" switch to start. This is the SINGLE gate
 * both the manual "Siguiente" control and the automatic countdown trigger
 * must call before doing any cleanup/network work — whichever calls it
 * first wins (`started: true`); every other concurrent call (manual while
 * automatic already began, automatic while manual already began, or a
 * double-click) gets `started: false` and must not start a second
 * `callRandom("next")`.
 *
 * Also immediately suspends the countdown (independent of `phase`), so a
 * switch that has begun can never keep ticking down or warning while its
 * network round trip is still pending.
 */
export function beginNext(state) {
  if (state.nextInFlight) return { state, started: false };
  return { state: { ...state, nextInFlight: true, suspended: true }, started: true };
}

/** Marks the in-flight "next" switch as finished (success or failure). */
export function endNext(state) {
  return { ...state, nextInFlight: false };
}

/**
 * Reset to "no active session" — used when the user cancels the search,
 * exits, or a peer gets blocked. Clears `nextInFlight`/`suspended`/
 * `secondsLeft`/`sessionId` defensively so nothing lingers into a future
 * session, while preserving the user's `enabled` (auto-mode) preference.
 */
export function resetForNewSearch(state) {
  return {
    ...state,
    secondsLeft: AUTO_NEXT_SECONDS,
    suspended: true,
    nextInFlight: false,
    sessionId: null,
  };
}

/** Whether the discreet "switching soon" warning should be visible. */
export function isInWarningWindow(state) {
  return (
    state.enabled &&
    !state.suspended &&
    !state.nextInFlight &&
    state.secondsLeft > 0 &&
    state.secondsLeft <= AUTO_NEXT_WARNING_SECONDS
  );
}
