import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the optional 30s auto-next mode added to /random.
// The actual timer/guard logic lives in a framework-free state machine
// (lib/randomAutoNext.js) and is covered with real function calls and
// assertions in random-auto-next-state-machine.test.mjs — this file only
// checks the presentational wiring (UI markup, i18n) that can't be
// exercised without a DOM, consistent with the other source-based
// regression suites in this repo (e.g. random-premium-visual-redesign.test.mjs).
const __dirname = dirname(fileURLToPath(import.meta.url));
const randomPagePath = join(__dirname, "../app/random/page.jsx");

async function readRandomPage() {
  return readFile(randomPagePath, "utf8");
}

test("random auto-mode: starts disabled (manual mode stays the default behavior)", async () => {
  const source = await readRandomPage();
  assert.match(
    source,
    /const \[autoNextState, setAutoNextState\] = useState\(\(\) => createAutoNextState\(\)\);/,
    "autoNextState must be initialized from createAutoNextState(), which defaults to disabled"
  );
});

test("random auto-mode: a visible toggle control exists and is wired to handleToggleAutoNext", async () => {
  const source = await readRandomPage();
  assert.match(source, /const handleToggleAutoNext = \(\) => \{/, "handleToggleAutoNext must be defined");
  assert.match(
    source,
    /className=\{`random-page__auto-toggle\$\{autoNextState\.enabled \? " is-on" : ""\}`\}\s*\n\s*onClick=\{handleToggleAutoNext\}/,
    "the toggle button must reflect autoNextState.enabled and call handleToggleAutoNext"
  );
  assert.match(source, /aria-pressed=\{autoNextState\.enabled\}/, "the toggle must expose aria-pressed for accessibility");
});

test("random auto-mode: the component delegates ALL timer/guard logic to lib/randomAutoNext.js", async () => {
  const source = await readRandomPage();
  assert.match(
    source,
    /import\s*\{[\s\S]*?createAutoNextState[\s\S]*?\}\s*from "@\/lib\/randomAutoNext";/,
    "page.jsx must import the pure auto-next state machine rather than re-implementing the rules inline"
  );
  for (const fn of ["syncSession", "setEnabled", "tick", "beginNext", "endNext", "resetForNewSearch", "isInWarningWindow", "resolveMatchedPhase"]) {
    assert.match(source, new RegExp(fn), `page.jsx must use ${fn}() from the state machine`);
  }
  // No ad-hoc guard refs/state left over from the pre-fix implementation.
  assert.doesNotMatch(source, /autoNextFiredRef/, "the old duplicate-trigger ref must be removed in favor of nextInFlight in the state machine");
  assert.doesNotMatch(source, /sessionEpoch/, "the old sessionEpoch state must be removed in favor of sessionId tracking in the state machine");
});

test("random auto-mode: manual Next goes through the shared beginNext/endNext guard", async () => {
  const source = await readRandomPage();
  const handleNextMatch = source.match(/const handleNext = async \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(handleNextMatch, "handleNext must still exist");
  assert.match(
    handleNextMatch[0],
    /const \{ state: beganState, started \} = beginAutoNext\(autoNextStateRef\.current\);/,
    "handleNext must call beginAutoNext() as its first synchronous action, shared with the automatic trigger"
  );
  assert.match(handleNextMatch[0], /if \(!started\) return;/, "handleNext must bail out when beginAutoNext() reports it lost the race");
  assert.match(
    handleNextMatch[0],
    /commitAutoNextState\(endAutoNext\(autoNextStateRef\.current\)\);/,
    "handleNext must release the guard via endAutoNext() once the switch settles"
  );
  assert.match(source, /onClick=\{handleNext\}/, "the main Next control must still call handleNext directly, regardless of auto-mode");
});

test("random auto-mode: applyResult resolves the REAL phase for a same-session duplicate instead of hardcoding 'connecting' (PR #1068 follow-up fix)", async () => {
  const source = await readRandomPage();
  // phaseRef must exist and be kept in sync with `phase`, since applyResult
  // is a useCallback that intentionally does not depend on `phase`.
  assert.match(source, /const phaseRef = useRef\(phase\);/, "a synchronous phase mirror ref must exist");
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*phaseRef\.current = phase;\s*\}, \[phase\]\);/,
    "phaseRef must be kept in sync with the real `phase` state on every change"
  );

  const applyResultMatch = source.match(/const applyResult = useCallback\(\s*\(result\) => \{[\s\S]*?\n {4}\},/);
  assert.ok(applyResultMatch, "applyResult must still exist");
  const applyResultCode = applyResultMatch[0];

  assert.match(
    applyResultCode,
    /const isSameSession = sessionIdRef\.current === result\.sessionId;/,
    "applyResult must determine same-session vs new-session BEFORE overwriting sessionIdRef.current"
  );
  assert.match(
    applyResultCode,
    /phase: resolveAutoNextMatchedPhase\(isSameSession, phaseRef\.current\),/,
    "applyResult must delegate the phase choice to resolveMatchedPhase(), using the REAL phaseRef.current rather than a hardcoded literal"
  );
  // The old unconditional hardcoded literal must be gone from this call.
  assert.doesNotMatch(
    applyResultCode,
    /phase: "connecting",\s*\n\s*sessionId: result\.sessionId,/,
    "applyResult must no longer force phase: \"connecting\" unconditionally for every matched result"
  );
});

test("random auto-mode: the tick effect only runs while phase === \"connected\" and reuses handleNextRef", async () => {
  const source = await readRandomPage();
  const tickEffectMatch = source.match(/\/\/ Tick down only while phase === "connected"[\s\S]*?}, \[phase, commitAutoNextState\]\);/);
  assert.ok(tickEffectMatch, "the countdown tick effect must exist");
  assert.match(tickEffectMatch[0], /if \(phase !== "connected"\) return undefined;/, "the tick effect must bail out for any phase other than connected");
  assert.match(tickEffectMatch[0], /setInterval\(/, "must use a real interval for the countdown");
  assert.match(tickEffectMatch[0], /return \(\) => clearInterval\(intervalId\);/, "must clear the interval on cleanup (phase change or unmount)");
  assert.match(tickEffectMatch[0], /handleNextRef\.current\?\.\(\);/, "must call the existing handleNext via ref, not re-implement next logic");
  const tickEffectCode = tickEffectMatch[0].replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(tickEffectCode, /callRandom\(/, "must not call callRandom directly — it must delegate to handleNext");
  assert.doesNotMatch(tickEffectCode, /cleanupAgora\(/, "must not call cleanupAgora directly — it must delegate to handleNext");
});

test("random auto-mode: cancel/exit/block flows defensively reset the auto-next state", async () => {
  const source = await readRandomPage();
  for (const fn of ["handleCancelSearch", "handleExit", "handleBlockedPeer"]) {
    const fnMatch = source.match(new RegExp(`const ${fn} = async \\(\\) => \\{[\\s\\S]*?\\n {2}\\};`));
    assert.ok(fnMatch, `${fn} must still exist`);
    assert.match(
      fnMatch[0],
      /commitAutoNextState\(resetAutoNextForNewSearch\(autoNextStateRef\.current\)\);/,
      `${fn} must defensively reset the auto-next state so nothing lingers into a future session`
    );
  }
});

test("random auto-mode: a discreet warning appears only in the last 5 seconds, with a 'keep talking' cancel action", async () => {
  const source = await readRandomPage();
  assert.match(
    source,
    /const showAutoNextWarning = phase === "connected" && isAutoNextInWarningWindow\(autoNextState\);/,
    "the warning must be derived from isInWarningWindow() plus the connected-phase gate"
  );
  assert.match(source, /\{showAutoNextWarning && \(/, "the warning pill must be conditionally rendered");
  assert.match(source, /onClick=\{handleKeepTalking\}/, "a 'keep talking' control must call handleKeepTalking");
  const handleKeepTalkingMatch = source.match(/const handleKeepTalking = \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(handleKeepTalkingMatch);
  assert.match(
    handleKeepTalkingMatch[0],
    /setAutoNextEnabledState\(autoNextStateRef\.current, false\)/,
    "handleKeepTalking must stop future automatic changes via the shared setEnabled() helper"
  );
});

test("random auto-mode: enabling the toggle never starts camera/mic directly (no new getUserMedia/createTracks calls)", async () => {
  const source = await readRandomPage();
  const toggleFnMatch = source.match(/const handleToggleAutoNext = \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(toggleFnMatch);
  assert.doesNotMatch(
    toggleFnMatch[0],
    /createMicrophoneAndCameraTracks|getUserMedia|AgoraRTC/,
    "toggling auto-mode must never touch camera/mic/Agora directly"
  );
});

test("random auto-mode: i18n strings exist for all three supported languages", async () => {
  const keys = [
    "autoModeLabel",
    "autoModeOn",
    "autoModeOff",
    "autoModeHint",
    "autoNextWarning",
    "keepTalking",
  ];
  for (const locale of ["en", "es", "pt"]) {
    const messagesPath = join(__dirname, `../messages/${locale}.json`);
    const messages = JSON.parse(await readFile(messagesPath, "utf8"));
    for (const key of keys) {
      assert.ok(
        typeof messages.random?.[key] === "string" && messages.random[key].length > 0,
        `messages/${locale}.json must define random.${key}`
      );
    }
  }
});
