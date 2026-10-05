import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the Live stage overlay/controls modernization.
// These assert directly on the authored source (JSX markup + styled-jsx
// rules) rather than mounting the component, consistent with the other
// multi-video-grid tests in this suite — styled-jsx template literals are
// not resolved by node:test's plain DOM-less runner.
const __dirname = dirname(fileURLToPath(import.meta.url));
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");
const gridPath = join(__dirname, "../components/MultiVideoGrid.jsx");
const reactionsPath = join(__dirname, "../components/FloatingReactions.jsx");

/** Extracts the first CSS block matching `selector { ... }` (non-greedy). */
function extractRule(css, selector) {
  const match = css.match(new RegExp(`${selector}\\s*{([^}]*)}`));
  return match ? match[1] : null;
}

test("live stage: top-of-video overlay no longer repeats EN VIVO/viewers (already shown in the header bar)", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.doesNotMatch(
    source,
    /video-activity-pills/,
    "the duplicated EN VIVO + espectadores + Chat activo row over the video must be removed"
  );
  assert.doesNotMatch(source, /vap-live/, "the duplicate live pill must not exist on the video surface");
  assert.doesNotMatch(source, /vap-viewers/, "the duplicate viewers pill must not exist on the video surface");
});

test("live stage: bottom video overlay drops the duplicate live badge and host chip (both already in the header bar)", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.doesNotMatch(
    source,
    /className="creator-chip"/,
    "the host name chip floating over the video must be removed (duplicated in the header bar)"
  );
  assert.doesNotMatch(
    source,
    /overlay-left">\s*<span className="badge badge-live pulse"/,
    "the live badge must not be repeated inside the on-video overlay"
  );
});

test("live stage: on-video overlay is not driven by the maximum guest count (works for 1/2/3/4 streams)", async () => {
  const source = await readFile(livePagePath, "utf8");
  const overlayRule = extractRule(source, "\\.video-overlay");
  assert.ok(overlayRule, ".video-overlay rule must exist");
  // The overlay must remain a thin bottom gradient strip, independent of
  // how many participant tiles are rendered.
  assert.match(overlayRule, /position:\s*absolute/);
  assert.doesNotMatch(source, /video-overlay[^{]*grid-template/);
});

test("live stage: creator header identity doubles as the profile shortcut instead of a floating FAB over the video", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(
    source,
    /<Link href=\{creatorProfileHref\} className="chr-left"/,
    "profile navigation must be reachable from the header identity"
  );
  assert.doesNotMatch(source, /video-fab profile/, "a redundant floating profile FAB over the video must not exist");
});

test("live stage: GiftPanel still targets the host (live.user._id) — no per-participant gifting introduced", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(
    source,
    /<GiftPanel\s+receiverId=\{live\.user\._id\}/,
    "GiftPanel must keep receiverId={live.user._id}; gifts remain directed at the host"
  );
  // Guard against any accidental per-tile/per-participant receiverId wiring.
  assert.doesNotMatch(source, /receiverId=\{participant\./);
  assert.doesNotMatch(source, /receiverId=\{guest\./);
});

test("live stage: host never gains a self-gifting control (existing host/viewer asymmetry preserved)", async () => {
  const source = await readFile(livePagePath, "utf8");
  // The gift CTA/dock/button paths must all be gated for non-creators only.
  assert.match(source, /!isCreator[\s\S]{0,400}setShowGiftPanel\(true\)/);
});

test("MultiVideoGrid: participant identity badge can never exceed its own tile (no neighbor invasion)", async () => {
  const source = await readFile(gridPath, "utf8");
  const badge = extractRule(source, "\\.participant-badge");
  assert.ok(badge, ".participant-badge rule must exist");
  assert.match(badge, /max-width:\s*100%/, "badge must be capped to its own tile width");
  assert.match(badge, /box-sizing:\s*border-box/, "badge sizing must include padding/border to respect the cap");

  const name = extractRule(source, "\\.participant-name");
  assert.ok(name, ".participant-name rule must exist");
  assert.match(name, /overflow:\s*hidden/, "long usernames must be clipped");
  assert.match(name, /text-overflow:\s*ellipsis/, "long usernames must truncate with an ellipsis");
});

test("MultiVideoGrid: identity never defaults an unknown remote to host (preserves #981 fix)", async () => {
  const source = await readFile(gridPath, "utf8");
  assert.match(source, /isHostParticipant\(participant,\s*hostUserId\)/);
  assert.doesNotMatch(source, /isHostTile\s*=\s*true/, "host status must be computed, never hardcoded");
});

test("FloatingReactions: all five reactions are preserved with unchanged emojis", async () => {
  const source = await readFile(reactionsPath, "utf8");
  for (const emoji of ["❤️", "🔥", "👏", "😍", "💎"]) {
    assert.ok(source.includes(emoji), `reaction ${emoji} must still be present`);
  }
});

test("FloatingReactions: reactions collapse into a compact dock instead of a tall vertical column", async () => {
  const source = await readFile(reactionsPath, "utf8");
  assert.match(source, /reaction-dock-toggle/, "a compact collapsed trigger must exist");
  assert.match(source, /useState\(false\)/, "the dock must start collapsed by default");

  const toggle = extractRule(source, "\\.reaction-dock-toggle");
  assert.ok(toggle, ".reaction-dock-toggle rule must exist");
  const widthMatch = toggle.match(/width:\s*(\d+)px/);
  assert.ok(widthMatch, "collapsed trigger must declare an explicit, compact width");
  assert.ok(Number(widthMatch[1]) <= 44, "collapsed trigger must stay small (<=44px) to minimize camera coverage");

  const btns = extractRule(source, "\\.reaction-btns");
  assert.ok(btns, ".reaction-btns rule must exist");
  assert.match(btns, /flex-direction:\s*row/, "expanded reactions must lay out horizontally, not as a tall column");
});
