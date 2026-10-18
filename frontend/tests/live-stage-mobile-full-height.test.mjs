import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression test for the "Live stage leaves blank space below it on mobile
// portrait" fix. Root cause: `.main-content` kept a desktop-only
// `min-height: calc(100vh - 96px)` on mobile (no override existed for it),
// while `.video-wrap` derived its height from a width-driven aspect-ratio
// capped by a vh/dvh guess — neither was guaranteed to use the real visible
// viewport height, for host or viewer. This test asserts on the authored CSS
// rules directly (styled-jsx template literals aren't resolved by node:test's
// DOM-less runner) so the full-height contract can't silently regress.
const __dirname = dirname(fileURLToPath(import.meta.url));
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");
const globalsCssPath = join(__dirname, "../app/globals.css");

/** Extracts the first CSS block matching `selector { ... }` (non-greedy). */
function extractRule(css, selector) {
  const match = css.match(new RegExp(`${selector}\\s*{([^}]*)}`));
  return match ? match[1] : null;
}

/** Concatenates the bodies of every `@media (...) { ... }` block whose query
 *  matches — the same media query is authored multiple times throughout the
 *  file (one block per selector), so a single match isn't enough. */
function extractMediaBlock(css, queryPattern) {
  const re = new RegExp(`@media\\s*\\(${queryPattern}`, "g");
  let blocks = [];
  let match;
  while ((match = re.exec(css))) {
    const braceStart = css.indexOf("{", match.index);
    let depth = 0;
    for (let i = braceStart; i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}") {
        depth--;
        if (depth === 0) {
          blocks.push(css.slice(braceStart + 1, i));
          re.lastIndex = i;
          break;
        }
      }
    }
  }
  return blocks.length ? blocks.join("\n") : null;
}

// The four devices the task explicitly asks to validate — all portrait
// phones at or below the 900px breakpoint the fix is scoped to.
const MOBILE_PORTRAIT_WIDTHS = [360, 390, 412, 430];

test("mobile portrait reference widths (360/390/412/430) all fall inside the full-height breakpoint", () => {
  for (const width of MOBILE_PORTRAIT_WIDTHS) {
    assert.ok(width <= 900, `${width}px must be within the (max-width: 900px) portrait stage-fill breakpoint`);
  }
});

test("globals.css: .main-content pins to the real dynamic viewport height for the live room, portrait-only", async () => {
  const css = await readFile(globalsCssPath, "utf8");
  const portraitBlock = extractMediaBlock(css, "max-width:\\s*900px\\)\\s*and\\s*\\(orientation:\\s*portrait");
  assert.ok(portraitBlock, "a (max-width: 900px) and (orientation: portrait) media block must exist in globals.css");

  const rule = extractRule(portraitBlock, "main\\.main-content:has\\(>\\s*\\.room\\)");
  assert.ok(rule, "main.main-content:has(> .room) must be pinned to the viewport height in mobile portrait");
  assert.match(rule, /min-height:\s*100dvh/, "must use dvh so the stage uses the real visible height (address bar collapsing/expanding)");
  assert.match(rule, /display:\s*flex/, "must become a column flex container so .room can stretch to fill it");
  assert.match(rule, /flex-direction:\s*column/);

  // Landscape/tablet/desktop must keep the original content-driven sizing —
  // the fix must not touch the base .main-content rule's min-height.
  const baseRule = extractRule(css, "\\.main-content\\s");
  assert.match(baseRule || extractRule(css, "\\.main-content"), /min-height:\s*calc\(100vh - 96px\)/, "desktop/landscape min-height must stay untouched");
});

test("live/[id]: .room stretches to fill the pinned viewport height, portrait-only", async () => {
  const source = await readFile(livePagePath, "utf8");
  const portraitBlock = extractMediaBlock(source, "max-width:\\s*900px\\)\\s*and\\s*\\(orientation:\\s*portrait");
  assert.ok(portraitBlock, "a mobile portrait media block must exist for .room");

  const roomRule = extractRule(portraitBlock, "\\.room");
  assert.ok(roomRule, ".room must have a mobile portrait override");
  assert.match(roomRule, /flex:\s*1/, ".room must grow to fill its flex parent (.main-content)");
  assert.match(roomRule, /min-height:\s*0/, ".room needs min-height: 0 to actually shrink/grow inside the flex column");
});

test("live/[id]: .room-layout's stage row fills all remaining height instead of being content-sized", async () => {
  const source = await readFile(livePagePath, "utf8");

  // Desktop default must still start-align grid items (unchanged behavior).
  const baseRule = extractRule(source, "\\.room-layout");
  assert.ok(baseRule, ".room-layout base rule must exist");
  assert.match(baseRule, /align-items:\s*start/, "desktop must keep align-items: start");

  const portraitBlock = extractMediaBlock(source, "max-width:\\s*900px\\)\\s*and\\s*\\(orientation:\\s*portrait");
  assert.ok(portraitBlock, "a mobile portrait media block must exist for .room-layout");
  const portraitRule = extractRule(portraitBlock, "\\.room-layout");
  assert.ok(portraitRule, "mobile portrait .room-layout override must exist");
  assert.match(portraitRule, /grid-template-rows:\s*1fr\s+auto\s+auto/, "the stage row must claim all free height (1fr) while the empty main/cards rows stay auto-sized");
  assert.match(portraitRule, /align-items:\s*stretch/, "grid items (stage-wrap/chat-stage-layer) must stretch to fill the stage row");
  assert.match(portraitRule, /flex:\s*1/, ".room-layout itself must grow to fill .room");
});

test("live/[id]: .video-wrap fills the stage height on mobile portrait instead of guessing a vh/dvh cap", async () => {
  const source = await readFile(livePagePath, "utf8");
  const baseRule = extractRule(source, "\\.video-wrap");
  assert.ok(baseRule, ".video-wrap base rule must exist");
  assert.match(baseRule, /aspect-ratio:\s*var\(--stage-ratio/, "desktop/landscape keep the width-driven aspect-ratio");

  const portraitBlock = extractMediaBlock(source, "max-width:\\s*900px\\)\\s*and\\s*\\(orientation:\\s*portrait");
  assert.ok(portraitBlock, "a mobile portrait media block must exist for .video-wrap");
  const portraitRule = extractRule(portraitBlock, "\\.video-wrap");
  assert.ok(portraitRule, "mobile portrait .video-wrap override must exist");
  assert.match(portraitRule, /height:\s*100%/, "portrait stage must fill its grid row height exactly");
  assert.match(portraitRule, /aspect-ratio:\s*auto/, "aspect-ratio must be released so height isn't width-derived anymore");
  assert.doesNotMatch(portraitRule, /max-height:\s*\d/, "no more vh/dvh guess that could under/over-shoot the real viewport");
});

test("live/[id]: the camera feed itself never stretches — object-fit: cover is preserved", async () => {
  const source = await readFile(livePagePath, "utf8");
  const rule = extractRule(source, "\\.agora-video-container video");
  assert.ok(rule, ".agora-video-container video rule must exist");
  assert.match(rule, /object-fit:\s*cover/, "camera track must keep cropping instead of stretching when the box is taller");
});
