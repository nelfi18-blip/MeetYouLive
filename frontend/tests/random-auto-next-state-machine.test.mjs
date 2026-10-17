import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_NEXT_SECONDS,
  AUTO_NEXT_WARNING_SECONDS,
  createAutoNextState,
  syncSession,
  setEnabled,
  tick,
  beginNext,
  endNext,
  resetForNewSearch,
  isInWarningWindow,
  resolveMatchedPhase,
} from "../lib/randomAutoNext.js";

// Real behavioral coverage for the auto-next state machine: every
// assertion below calls the actual exported functions and checks the
// values/state they return, mirroring the pattern already used for
// lib/agoraGuestTransition.js (frontend/tests/agora-guest-transition.test.mjs)
// rather than matching regex against source text.

function connect(state, sessionId) {
  let next = syncSession(state, { phase: "connecting", sessionId });
  next = syncSession(next, { phase: "connected", sessionId });
  return next;
}

test("fresh state starts disabled, suspended, full countdown, no session", () => {
  const state = createAutoNextState();
  assert.equal(state.enabled, false);
  assert.equal(state.suspended, true);
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS);
  assert.equal(state.nextInFlight, false);
  assert.equal(state.sessionId, null);
});

test("enabling then connecting a brand-new session lifts suspension without changing secondsLeft", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  assert.equal(state.enabled, true);
  assert.equal(state.suspended, true, "must stay suspended until actually connected");

  state = connect(state, "session-1");
  assert.equal(state.suspended, false);
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS);
});

test("tick() is a no-op while disabled, suspended, or in flight, and never goes below 0", () => {
  let state = createAutoNextState();
  // disabled
  let result = tick(state);
  assert.equal(result.state, state, "disabled tick must return the exact same state reference");
  assert.equal(result.shouldTriggerNext, false);

  // enabled but suspended (no session yet)
  state = setEnabled(state, true, { phase: "idle" });
  result = tick(state);
  assert.equal(result.shouldTriggerNext, false);
  assert.equal(result.state.secondsLeft, AUTO_NEXT_SECONDS, "suspended tick must not decrement");

  // connected: real ticking
  state = connect(state, "session-1");
  for (let i = 0; i < AUTO_NEXT_SECONDS - 1; i += 1) {
    const { state: ticked, shouldTriggerNext } = tick(state);
    state = ticked;
    assert.equal(shouldTriggerNext, false, `tick ${i + 1} must not trigger before reaching 0`);
  }
  assert.equal(state.secondsLeft, 1);
  const last = tick(state);
  assert.equal(last.state.secondsLeft, 0);
  assert.equal(last.shouldTriggerNext, true, "reaching 0 must trigger exactly once");

  // further ticks at 0 must not go negative or re-trigger (caller is
  // expected to call beginNext()/suspend immediately, but defensively:
  const further = tick(last.state);
  assert.equal(further.state.secondsLeft, 0);
});

test("reconnection into the SAME session preserves secondsLeft (does not restart the countdown)", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  // Tick down partway.
  for (let i = 0; i < 12; i += 1) {
    state = tick(state).state;
  }
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS - 12);

  // Agora reconnect grace: phase flips to "reconnecting" for the SAME
  // sessionId, then back to "connected" once resumed.
  state = syncSession(state, { phase: "reconnecting", sessionId: "session-1" });
  assert.equal(state.suspended, true, "must stop ticking immediately while reconnecting");
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS - 12, "reconnecting must not reset the remaining time");

  // While reconnecting, tick() must be a complete no-op.
  const duringReconnect = tick(state);
  assert.equal(duringReconnect.state.secondsLeft, AUTO_NEXT_SECONDS - 12);
  assert.equal(duringReconnect.shouldTriggerNext, false);

  state = syncSession(state, { phase: "connected", sessionId: "session-1" });
  assert.equal(state.suspended, false, "must resume ticking once reconnected");
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS - 12, "resuming must preserve the exact remaining time");

  // A duplicate "matched" update for the SAME session (e.g. the status
  // poll racing the socket event) must also be a no-op.
  const beforeDuplicate = state;
  state = syncSession(state, { phase: "connected", sessionId: "session-1" });
  assert.deepEqual(state, beforeDuplicate, "a repeated update for the same session must change nothing");
});

test("a genuinely new sessionId always resets the countdown and re-suspends", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  for (let i = 0; i < 20; i += 1) {
    state = tick(state).state;
  }
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS - 20);

  state = syncSession(state, { phase: "connecting", sessionId: "session-2" });
  assert.equal(state.sessionId, "session-2");
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS, "a new session must restart the countdown from the top");
  assert.equal(state.suspended, true, "a new session must stay suspended until it actually connects");

  state = syncSession(state, { phase: "connected", sessionId: "session-2" });
  assert.equal(state.suspended, false);
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS);
});

test("beginNext() is an atomic mutual-exclusion gate: only the first of two concurrent callers wins", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");

  // Simulate the manual button and the automatic trigger racing in the
  // same synchronous tick, both reading the ref's current value.
  const manual = beginNext(state);
  const automatic = beginNext(manual.state);

  assert.equal(manual.started, true, "the first caller must win the race");
  assert.equal(automatic.started, false, "the second concurrent caller must lose the race and must not start a second request");
  assert.equal(automatic.state, manual.state, "a losing call must not mutate the state further");
  assert.equal(manual.state.nextInFlight, true);
  assert.equal(manual.state.suspended, true, "beginning a switch must immediately stop the countdown");

  // While in flight, tick() must be a strict no-op even if phase briefly
  // reports "connected" again (e.g. a stray re-render).
  const duringFlight = tick(manual.state);
  assert.equal(duringFlight.shouldTriggerNext, false);
  assert.equal(duringFlight.state, manual.state);

  // Only after endNext() can a new switch begin.
  const ended = endNext(manual.state);
  assert.equal(ended.nextInFlight, false);
  const afterEnd = beginNext(ended);
  assert.equal(afterEnd.started, true, "a new call after endNext() must be able to begin a fresh switch");
});

test("disabling auto-mode (or 'keep talking') blocks a pending switch that has not started yet", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  for (let i = 0; i < AUTO_NEXT_SECONDS - 1; i += 1) {
    state = tick(state).state;
  }
  assert.equal(state.secondsLeft, 1);

  // "Keep talking" / disabling fires before the countdown would have hit 0.
  state = setEnabled(state, false);
  assert.equal(state.enabled, false);

  // The countdown reaching 0 must no longer trigger anything once disabled.
  const afterDisable = tick(state);
  assert.equal(afterDisable.shouldTriggerNext, false, "disabling must prevent a switch that has not started yet");

  // beginNext() remains usable for the independent manual Next button even
  // while auto-mode is disabled — disabling auto-mode must never block the
  // manual control.
  const manualStillWorks = beginNext(afterDisable.state);
  assert.equal(manualStillWorks.started, true);
});

test("disabling auto-mode never aborts a switch that has already begun", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  const { state: begun, started } = beginNext(state);
  assert.equal(started, true);

  const disabledMidFlight = setEnabled(begun, false);
  assert.equal(disabledMidFlight.nextInFlight, true, "setEnabled(false) must not clear an in-flight switch");
});

test("resetForNewSearch clears session/countdown/in-flight state but preserves the enabled preference", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  state = tick(state).state;
  const { state: begun } = beginNext(state);

  const reset = resetForNewSearch(begun);
  assert.equal(reset.enabled, true, "the user's auto-mode preference must survive cancel/exit/block");
  assert.equal(reset.sessionId, null);
  assert.equal(reset.secondsLeft, AUTO_NEXT_SECONDS);
  assert.equal(reset.suspended, true);
  assert.equal(reset.nextInFlight, false, "any stale in-flight guard must be cleared defensively");
});

test("isInWarningWindow is true only enabled, connected, in-flight-free, and within the last 5 seconds", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");

  // 30 -> 7: not yet in the warning window.
  for (let i = 0; i < AUTO_NEXT_SECONDS - (AUTO_NEXT_WARNING_SECONDS + 1); i += 1) {
    state = tick(state).state;
  }
  assert.equal(state.secondsLeft, AUTO_NEXT_WARNING_SECONDS + 1);
  assert.equal(isInWarningWindow(state), false, "6 seconds left must not show the warning yet");

  state = tick(state).state;
  assert.equal(state.secondsLeft, AUTO_NEXT_WARNING_SECONDS);
  assert.equal(isInWarningWindow(state), true, "exactly 5 seconds left must show the warning");

  // Reaching 0 ends the window (a switch should already be underway).
  for (let i = 0; i < AUTO_NEXT_WARNING_SECONDS; i += 1) {
    state = tick(state).state;
  }
  assert.equal(state.secondsLeft, 0);
  assert.equal(isInWarningWindow(state), false, "0 seconds left must not show the warning (a switch should be in flight)");

  // Disabled, suspended, or in-flight must never show the warning even
  // with secondsLeft inside the window.
  const withinWindowButDisabled = { ...createAutoNextState(), enabled: false, suspended: false, secondsLeft: 3 };
  assert.equal(isInWarningWindow(withinWindowButDisabled), false);

  const withinWindowButSuspended = { ...createAutoNextState(), enabled: true, suspended: true, secondsLeft: 3 };
  assert.equal(isInWarningWindow(withinWindowButSuspended), false);

  const withinWindowButInFlight = {
    ...createAutoNextState(),
    enabled: true,
    suspended: false,
    nextInFlight: true,
    secondsLeft: 3,
  };
  assert.equal(isInWarningWindow(withinWindowButInFlight), false);
});

test("cancelling the search mid-countdown then starting a fresh search does not resurrect the old countdown", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  for (let i = 0; i < 10; i += 1) {
    state = tick(state).state;
  }
  // User cancels the search / exits / gets a peer blocked.
  state = resetForNewSearch(state);
  // Now a new search starts (phase -> searching, no session yet).
  state = syncSession(state, { phase: "searching", sessionId: null });
  assert.equal(state.suspended, true);
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS);

  // A new match arrives.
  state = connect(state, "session-2");
  assert.equal(state.suspended, false);
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS, "must start the fresh session with a full, untainted countdown");
});

// ── Regression: duplicate "matched" result for the SAME session while  ──
// ── agoraClientRef.current is still null (PR #1068 follow-up fix)      ──
//
// applyResult() in page.jsx guards `sessionIdRef.current === result.sessionId
// && agoraClientRef.current` to skip truly redundant updates, but a
// duplicate/late "matched" result can still reach the state-sync call below
// that guard while the Agora client ref for that very same session is
// momentarily null (e.g. the GET /status poll and the "random_matched"
// socket event both resolving around the same join). resolveMatchedPhase()
// is what page.jsx now calls to decide what `phase` to hand to
// syncSession() in exactly that situation.

test("resolveMatchedPhase: a genuinely NEW session is always forced to 'connecting', even if the real phase still reads 'connected' from a just-ended previous call", () => {
  // Mirrors handleNext(): cleanupAgora() + callRandom("next") resolve and
  // applyResult() runs for a brand-new sessionId before startAgora() has
  // had a chance to flip `phase` away from the OLD session's "connected".
  const resolvedPhase = resolveMatchedPhase(false, "connected");
  assert.equal(resolvedPhase, "connecting", "a new session must never be treated as already connected");

  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  state = tick(state).state;
  // A brand-new session is reported while `phase` is still stale "connected".
  state = syncSession(state, { phase: resolvedPhase, sessionId: "session-2" });
  assert.equal(state.suspended, true, "the new session must stay suspended until it actually connects");
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS, "the new session must start with a full countdown");
});

test("resolveMatchedPhase: a duplicate 'matched' result for the SAME session reflects the REAL phase instead of being forced to 'connecting'", () => {
  // Reproduces the exact bug: a session is already fully connected
  // (agoraClientRef.current would normally be set, but a duplicate result
  // slips past the early-return guard because the ref read raced to null),
  // and the OLD code hardcoded phase: "connecting" regardless of reality.
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  for (let i = 0; i < 9; i += 1) {
    state = tick(state).state;
  }
  assert.equal(state.secondsLeft, AUTO_NEXT_SECONDS - 9);
  assert.equal(state.suspended, false);

  // The OLD buggy behavior this regression guards against: page.jsx used
  // to hardcode phase: "connecting" unconditionally (equivalent to never
  // detecting `isSameSession`), which forces suspension even though the
  // session is truly connected. In the real component, nothing then calls
  // syncSession() again with the correct "connected" phase on its own,
  // because the dedicated phase-watching effect only re-runs on actual
  // `phase` *transitions* — and here `phase` never changes (it already was
  // "connected" and stays "connected") — so this wrong suspension would
  // persist in the UI for the rest of the call.
  const buggyPhase = "connecting";
  const buggyResult = syncSession(state, { phase: buggyPhase, sessionId: "session-1" });
  assert.equal(buggyResult.suspended, true, "sanity check: hardcoding 'connecting' here WOULD incorrectly suspend");

  // The actual fix: isSameSession is correctly detected as true, so the
  // REAL current phase ("connected") is used instead of "connecting".
  const fixedPhase = resolveMatchedPhase(/* isSameSession */ true, "connected");
  assert.equal(fixedPhase, "connected");
  const fixedResult = syncSession(state, { phase: fixedPhase, sessionId: "session-1" });
  assert.equal(fixedResult.suspended, false, "a same-session duplicate while truly connected must never suspend the countdown");
  assert.equal(fixedResult.secondsLeft, AUTO_NEXT_SECONDS - 9, "and must not reset the remaining time either");
});

test("resolveMatchedPhase: a duplicate result for the SAME session while truly reconnecting still suspends (no regression)", () => {
  let state = createAutoNextState();
  state = setEnabled(state, true, { phase: "idle" });
  state = connect(state, "session-1");
  state = syncSession(state, { phase: "reconnecting", sessionId: "session-1" });
  assert.equal(state.suspended, true);

  // A duplicate "matched" result arrives while genuinely still reconnecting.
  const phase = resolveMatchedPhase(true, "reconnecting");
  assert.equal(phase, "reconnecting");
  const result = syncSession(state, { phase, sessionId: "session-1" });
  assert.equal(result.suspended, true, "a real reconnection must keep the countdown suspended until actually reconnected");
});
