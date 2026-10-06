import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the Random premium visual redesign corrections.
// These assert directly on the authored source (JSX markup + styled-jsx
// rules), consistent with the other presentational regression suites in
// this repo (e.g. live-stage-overlay-modernization.test.mjs) — styled-jsx
// template literals and client-only Agora/socket wiring are not resolved
// by node:test's plain DOM-less runner.
const __dirname = dirname(fileURLToPath(import.meta.url));
const randomPagePath = join(__dirname, "../app/random/page.jsx");
const randomIconsPath = join(__dirname, "../app/random/randomIcons.jsx");

async function readRandomPage() {
  return readFile(randomPagePath, "utf8");
}

test("random: opening the page never auto-joins — status check only runs GET /status, no POST /join on mount", async () => {
  const source = await readRandomPage();
  const mountEffectMatch = source.match(
    /Initial mount: auth \+ connect socket[\s\S]*?\n {2}}, \[session\?\.backendToken, sessionStatus\]\);/
  );
  assert.ok(mountEffectMatch, "the initial-mount effect must still exist");
  assert.doesNotMatch(
    mountEffectMatch[0],
    /callRandom\(\s*["']join["']\s*\)/,
    "mounting /random must never call callRandom('join') automatically"
  );
  assert.match(
    mountEffectMatch[0],
    /callRandom\(\s*["']status["']\s*\)/,
    "mounting /random must only recover state via GET /status"
  );
});

test("random: the idle CTA is wired to the explicit joinRandom() action", async () => {
  const source = await readRandomPage();
  assert.match(
    source,
    /onClick=\{joinRandom\}/,
    "the 'Enter Random' CTA must call joinRandom() explicitly (user-initiated)"
  );
});

test("random: Cancel during search still calls handleCancelSearch (no auto re-queue)", async () => {
  const source = await readRandomPage();
  assert.match(
    source,
    /onClick=\{handleCancelSearch\}/,
    "the Cancel action during searching must remain wired to handleCancelSearch"
  );
  assert.match(
    source,
    /const handleCancelSearch = async \(\) => \{/,
    "handleCancelSearch must still be defined"
  );
});

test("random: Next and Exit still call the existing handleNext/handleExit handlers (no duplicated logic)", async () => {
  const source = await readRandomPage();
  assert.match(source, /const handleNext = async \(\) => \{/, "handleNext must still exist");
  assert.match(source, /const handleExit = async \(\) => \{/, "handleExit must still exist");
  assert.match(
    source,
    /onClick=\{handleNext\}/,
    "the main Next control must call handleNext directly"
  );
  assert.match(
    source,
    /handleSheetExit\s*=\s*\(\)\s*=>\s*\{\s*setShowSafetySheet\(false\);\s*handleExit\(\);\s*\}/,
    "the sheet's Exit action must delegate to the untouched handleExit, only wrapping it to close the sheet"
  );
  assert.match(
    source,
    /handleSheetNext\s*=\s*\(\)\s*=>\s*\{\s*setShowSafetySheet\(false\);\s*handleNext\(\);\s*\}/,
    "the sheet's Next action must delegate to the untouched handleNext, only wrapping it to close the sheet"
  );
});

test("random: ModerationActions is still reused (Report/Block) without re-implementing its contract", async () => {
  const source = await readRandomPage();
  assert.match(source, /import ModerationActions from "@\/components\/ModerationActions"/);
  assert.match(source, /<ModerationActions/, "ModerationActions must still be rendered");
  assert.match(source, /targetUserId=\{peer\.id\}/);
  assert.match(source, /onBlocked=\{handleSheetBlocked\}/);
  assert.match(
    source,
    /handleSheetBlocked = async \(\) => \{\s*setShowSafetySheet\(false\);\s*await handleBlockedPeer\(\);\s*\}/,
    "handleSheetBlocked must only close the sheet and delegate to the existing handleBlockedPeer"
  );
  assert.match(source, /const handleBlockedPeer = async \(\) => \{/, "handleBlockedPeer must remain the single source of truth for block cleanup");
  // Must not define its own report/block network calls.
  assert.doesNotMatch(source, /\/api\/moderation\/(report|users)/, "page.jsx must not duplicate ModerationActions' network calls");
});

test("random: localVideoRef and remoteVideoRef stay connected to the stage DOM nodes", async () => {
  const source = await readRandomPage();
  assert.match(source, /ref=\{remoteVideoRef\}/, "remoteVideoRef must still be attached to the remote video container");
  assert.match(source, /ref=\{localVideoRef\}/, "localVideoRef must still be attached to the local video container");
});

test("random: reduced-motion media query exists and disables the decorative animations", async () => {
  const source = await readRandomPage();
  const reducedMotionMatch = source.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {8}\}\n/);
  assert.ok(reducedMotionMatch, "a prefers-reduced-motion: reduce block must exist");
  const block = reducedMotionMatch[1];
  assert.match(block, /random-page__orb/, "ambient orb floating must be disabled under reduced motion");
  assert.match(block, /random-page__radar-ring/, "radar/rings pulse must be disabled under reduced motion");
  assert.match(block, /random-page__avatar/, "avatar pulse must be disabled under reduced motion");
  assert.match(block, /animation:\s*none\s*!important/, "animations must be turned off, not merely slowed down");
});

test("random: controls no longer use emojis as primary icons (SVG icon set instead)", async () => {
  const source = await readRandomPage();
  const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.doesNotMatch(source, emojiPattern, "page.jsx must not render emoji glyphs as control icons");
  assert.match(source, /from "\.\/randomIcons"/, "icons must come from the dedicated randomIcons module");
  for (const icon of ["MicIcon", "MicOffIcon", "CameraIcon", "CameraOffIcon", "SwitchCameraIcon", "NextIcon", "ExitIcon", "SafetyIcon"]) {
    assert.match(source, new RegExp(`<${icon}\\b`), `${icon} must be rendered somewhere in the controls`);
  }
});

test("random: icon components are real inline SVGs (no emoji, no external icon dependency)", async () => {
  const source = await readFile(randomIconsPath, "utf8");
  assert.match(source, /<svg/, "icons must be authored as inline SVG");
  assert.doesNotMatch(source, /from ["'](react-icons|@heroicons|lucide-react|@fortawesome)/, "no new icon dependency should be introduced");
});

test("random: controls keep aria-label and title on icon buttons", async () => {
  const source = await readRandomPage();
  const toggleMuteButton = source.match(/onClick=\{toggleMute\}[\s\S]{0,200}/)[0];
  assert.match(toggleMuteButton, /aria-label=/);
  assert.match(toggleMuteButton, /title=/);
  const toggleCameraButton = source.match(/onClick=\{toggleCamera\}[\s\S]{0,200}/)[0];
  assert.match(toggleCameraButton, /aria-label=/);
  assert.match(toggleCameraButton, /title=/);
});

test("random: safety/options bottom sheet exists with the required accessibility contract", async () => {
  const source = await readRandomPage();
  assert.match(source, /random-page__sheet-backdrop/, "a bottom sheet backdrop must exist");
  assert.match(source, /role="dialog"/, "the sheet must declare role=\"dialog\"");
  assert.match(source, /aria-modal="true"/, "the sheet must declare aria-modal=\"true\"");
  assert.match(source, /random-page__sheet-handle/, "the sheet must render a drag handle");
  assert.match(source, /random-page__sheet-close/, "the sheet must render a close button");
  assert.match(source, /setShowSafetySheet\(true\)/, "an options/safety trigger button must open the sheet");
});

test("random: ModerationActions is no longer a permanent fixture of the controls bar", async () => {
  const source = await readRandomPage();
  const controlsBarMatch = source.match(/random-page__controls-bar">([\s\S]*?)<\/div>\s*<\/div>\s*\)\}/);
  assert.ok(controlsBarMatch, "controls bar markup must exist");
  assert.doesNotMatch(
    controlsBarMatch[1],
    /<ModerationActions/,
    "ModerationActions must live inside the safety sheet, not permanently in the controls bar"
  );
});

test("random: presentational session timer is mm:ss, tabular-nums, and never touches sessionId/backend", async () => {
  const source = await readRandomPage();
  assert.match(source, /font-variant-numeric:\s*tabular-nums/, "the timer pill must use tabular numerals");
  assert.match(source, /formattedElapsed/, "a formatted mm:ss value must be rendered");
  assert.match(
    source,
    /padStart\(2, "0"\)[\s\S]*?padStart\(2, "0"\)/,
    "the timer must format minutes and seconds as two digits"
  );
  assert.doesNotMatch(
    source,
    /elapsedSeconds[\s\S]{0,80}sessionIdRef\.current\s*=/,
    "the timer effect must not mutate sessionIdRef"
  );
  assert.doesNotMatch(source, /elapsedSeconds[\s\S]{0,120}fetch\(/, "the timer must never call the backend");
});

test("random: reconnecting shows a compact pill over the stage without touching RECONNECT_GRACE_MS", async () => {
  const source = await readRandomPage();
  assert.match(source, /const RECONNECT_GRACE_MS = 15000;/, "RECONNECT_GRACE_MS must remain unchanged");
  assert.match(source, /random-page__reconnect-pill/, "a reconnecting pill must be rendered over the stage");
  assert.match(source, /phase === "reconnecting" &&[\s\S]{0,120}role="status"/, "the reconnecting pill must be conditional on phase and announce status");
});

test("random: touch targets for primary controls are at least 44px, preferring 48-54px", async () => {
  const source = await readRandomPage();
  const iconBtnRule = source.match(/\.random-page__icon-btn \{([^}]*)\}/)[1];
  assert.doesNotMatch(iconBtnRule, /width:\s*4[0-3]px/, "icon buttons must not shrink below 44px");
  assert.match(iconBtnRule, /min-width:\s*44px/);
  assert.match(iconBtnRule, /min-height:\s*44px/);
  const mobileBlock = source.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n {8}\}\n/)[1];
  assert.doesNotMatch(mobileBlock, /width:\s*4[0-3]px/, "the 480px breakpoint must not shrink controls below 44px");
});

test("random: top floating elements respect env(safe-area-inset-top)", async () => {
  const source = await readRandomPage();
  assert.match(source, /env\(safe-area-inset-top/, "a top safe-area inset must be applied to floating top elements");
  assert.match(source, /env\(safe-area-inset-bottom/, "the existing bottom safe-area handling must remain");
});

test("random: screen capture protection hook and core Agora/session refs remain wired", async () => {
  const source = await readRandomPage();
  assert.match(source, /useAndroidScreenCaptureProtection\(\);/);
  assert.match(source, /const agoraClientRef = useRef\(null\);/);
  assert.match(source, /const sessionIdRef = useRef\(null\);/);
  assert.match(source, /const STATUS_POLL_MS = 3000;/);
});
