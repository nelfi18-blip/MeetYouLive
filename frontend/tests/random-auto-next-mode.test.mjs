import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the optional 30s auto-next mode added to /random.
// Consistent with the other presentational/behavioral regression suites in
// this repo (e.g. random-premium-visual-redesign.test.mjs), these assert
// directly on the authored source since styled-jsx template literals and
// client-only Agora/socket wiring are not resolved by node:test's
// DOM-less runner.
const __dirname = dirname(fileURLToPath(import.meta.url));
const randomPagePath = join(__dirname, "../app/random/page.jsx");

async function readRandomPage() {
  return readFile(randomPagePath, "utf8");
}

test("random auto-mode: starts disabled (manual mode stays the default behavior)", async () => {
  const source = await readRandomPage();
  assert.match(
    source,
    /const \[autoNextEnabled, setAutoNextEnabled\] = useState\(false\);/,
    "autoNextEnabled must default to false"
  );
});

test("random auto-mode: a visible toggle control exists and is wired to handleToggleAutoNext", async () => {
  const source = await readRandomPage();
  assert.match(source, /const handleToggleAutoNext = \(\) => \{/, "handleToggleAutoNext must be defined");
  assert.match(
    source,
    /className=\{`random-page__auto-toggle\$\{autoNextEnabled \? " is-on" : ""\}`\}\s*\n\s*onClick=\{handleToggleAutoNext\}/,
    "the toggle button must reflect autoNextEnabled and call handleToggleAutoNext"
  );
  assert.match(source, /aria-pressed=\{autoNextEnabled\}/, "the toggle must expose aria-pressed for accessibility");
});

test("random auto-mode: the countdown only ticks while enabled AND phase === \"connected\"", async () => {
  const source = await readRandomPage();
  const tickEffectMatch = source.match(
    /\/\/ Tick down only while auto-mode is enabled[\s\S]*?}, \[autoNextEnabled, phase, sessionEpoch\]\);/
  );
  assert.ok(tickEffectMatch, "the countdown tick effect must exist");
  assert.match(
    tickEffectMatch[0],
    /if \(!autoNextEnabled \|\| phase !== "connected" \|\| autoNextFiredRef\.current\) return undefined;/,
    "the tick effect must bail out unless auto-mode is enabled and the call is connected"
  );
  assert.match(tickEffectMatch[0], /setInterval\(/, "must use a real interval for the countdown");
  assert.match(tickEffectMatch[0], /return \(\) => clearInterval\(intervalId\);/, "must clear the interval on cleanup (phase change, disable, or unmount)");
});

test("random auto-mode: never counts during searching/connecting/reconnecting (connected-only gate)", async () => {
  const source = await readRandomPage();
  const tickEffectMatch = source.match(
    /\/\/ Tick down only while auto-mode is enabled[\s\S]*?}, \[autoNextEnabled, phase, sessionEpoch\]\);/
  );
  assert.ok(tickEffectMatch);
  assert.doesNotMatch(
    tickEffectMatch[0],
    /phase === "searching"|phase === "connecting"|phase === "reconnecting"/,
    "the tick effect must not special-case other phases — it only runs for phase === \"connected\""
  );
});

test("random auto-mode: reaching 0 reuses the existing handleNext (no duplicate requests/Agora joins)", async () => {
  const source = await readRandomPage();
  const triggerEffectMatch = source.match(
    /\/\/ Once the countdown reaches 0[\s\S]*?}, \[autoNextEnabled, phase, autoNextSecondsLeft\]\);/
  );
  assert.ok(triggerEffectMatch, "the auto-next trigger effect must exist");
  assert.match(triggerEffectMatch[0], /handleNextRef\.current\?\.\(\);/, "must call the existing handleNext via ref, not re-implement next logic");
  const triggerEffectCode = triggerEffectMatch[0].replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(triggerEffectCode, /callRandom\(/, "must not call callRandom directly — it must delegate to handleNext");
  assert.doesNotMatch(triggerEffectCode, /cleanupAgora\(/, "must not call cleanupAgora directly — it must delegate to handleNext");
});

test("random auto-mode: guards against duplicate triggers for the same session", async () => {
  const source = await readRandomPage();
  assert.match(source, /const autoNextFiredRef = useRef\(false\);/, "a duplicate-trigger guard ref must exist");
  const triggerEffectMatch = source.match(
    /\/\/ Once the countdown reaches 0[\s\S]*?}, \[autoNextEnabled, phase, autoNextSecondsLeft\]\);/
  );
  assert.match(triggerEffectMatch[0], /if \(autoNextSecondsLeft > 0 \|\| autoNextFiredRef\.current\) return;/);
  assert.match(triggerEffectMatch[0], /autoNextFiredRef\.current = true;/, "the guard must be set before calling handleNext");
});

test("random auto-mode: the countdown resets only when a genuinely new real session starts", async () => {
  const source = await readRandomPage();
  assert.match(
    source,
    /const \[sessionEpoch, setSessionEpoch\] = useState\(0\);/,
    "a sessionEpoch state must exist to track genuinely new sessions"
  );
  const applyResultMatch = source.match(/const applyResult = useCallback\(\s*\(result\) => \{[\s\S]*?\n {4}\},/);
  assert.ok(applyResultMatch, "applyResult must still exist");
  assert.match(
    applyResultMatch[0],
    /if \(sessionIdRef\.current !== result\.sessionId\) \{\s*setSessionEpoch\(\(previous\) => previous \+ 1\);\s*\}/,
    "sessionEpoch must only bump when the sessionId actually changes — reconnection into the same session must not restart the countdown"
  );
  const resetEffectMatch = source.match(
    /useEffect\(\(\) => \{\s*setAutoNextSecondsLeft\(AUTO_NEXT_SECONDS\);\s*autoNextFiredRef\.current = false;\s*\}, \[sessionEpoch\]\);/
  );
  assert.ok(resetEffectMatch, "an effect depending on [sessionEpoch] must reset the countdown and the duplicate-trigger guard");
});

test("random auto-mode: a discreet warning appears only in the last 5 seconds, with a 'keep talking' cancel action", async () => {
  const source = await readRandomPage();
  assert.match(source, /const AUTO_NEXT_WARNING_SECONDS = 5;/, "the warning window constant must exist");
  assert.match(
    source,
    /const showAutoNextWarning =\s*autoNextEnabled &&\s*phase === "connected" &&\s*autoNextSecondsLeft > 0 &&\s*autoNextSecondsLeft <= AUTO_NEXT_WARNING_SECONDS;/,
    "the warning must only be visible while enabled, connected, and within the last 5 seconds"
  );
  assert.match(source, /\{showAutoNextWarning && \(/, "the warning pill must be conditionally rendered");
  assert.match(source, /onClick=\{handleKeepTalking\}/, "a 'keep talking' control must call handleKeepTalking");
  assert.match(
    source,
    /const handleKeepTalking = \(\) => \{\s*autoNextFiredRef\.current = true;\s*setAutoNextEnabled\(false\);\s*\};/,
    "handleKeepTalking must stop the automatic change (disable auto-mode) and keep the current conversation going"
  );
});

test("random auto-mode: manual Next remains available at any time, untouched by auto-mode", async () => {
  const source = await readRandomPage();
  assert.match(source, /const handleNext = async \(\) => \{/, "handleNext must still exist, unmodified in shape");
  assert.match(source, /onClick=\{handleNext\}/, "the main Next control must still call handleNext directly, regardless of auto-mode");
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
