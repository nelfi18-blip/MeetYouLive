import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const feedPage = await readFile(new URL("../app/feed/page.jsx", import.meta.url), "utf8");
const feedLoading = await readFile(new URL("../app/feed/loading.jsx", import.meta.url), "utf8");
const globalsCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

// The real BottomNavEnhanced clearance (pill + the protruding central "IR"
// circle button) is already measured and vetted in globals.css via
// .create-menu's --ir-menu-bottom: 100px above 640px, 92px at/under 640px.
// Discover's own bottom reservation must reuse those exact numbers so the
// two can never silently drift apart again.
const MOBILE_NAV_CLEARANCE_PX = 92;
const DESKTOP_NAV_CLEARANCE_PX = 100;

test("globals.css still anchors --ir-menu-bottom at the expected clearance values", () => {
  assert.match(globalsCss, /--ir-menu-bottom:\s*calc\(100px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(globalsCss, /--ir-menu-bottom:\s*calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
});

for (const [label, source] of [
  ["app/feed/page.jsx", feedPage],
  ["app/feed/loading.jsx", feedLoading],
]) {
  test(`${label} reserves the real BottomNavEnhanced clearance (not just the pill box)`, () => {
    assert.match(
      source,
      new RegExp(`--feed-bottom-nav-content-height:\\s*${MOBILE_NAV_CLEARANCE_PX}px;`),
      "default/mobile clearance must match the <=640px --ir-menu-bottom anchor"
    );
    const desktopBlock = source.match(/@media \(min-width: 641px\) \{([\s\S]*?)\n {8}\}/)?.[1];
    assert.ok(desktopBlock, "expected a min-width:641px override block");
    assert.match(
      desktopBlock,
      new RegExp(`--feed-bottom-nav-content-height:\\s*${DESKTOP_NAV_CLEARANCE_PX}px;`),
      "above 640px the clearance must match the base --ir-menu-bottom anchor"
    );
  });

  test(`${label} prefers 100dvh and only falls back to 100lvh when dvh is unsupported`, () => {
    assert.match(
      source,
      /@supports \(height: 100dvh\) \{\s*\.feed-page \{\s*--feed-viewport-height: 100dvh;\s*--feed-stable-viewport-height: 100dvh;/,
      "100dvh must be the preferred, real-time viewport unit"
    );
    assert.match(
      source,
      /@supports \(not \(height: 100dvh\)\) and \(height: 100lvh\) \{/,
      "100lvh must only apply when 100dvh is NOT supported, to avoid overflow past the visible area"
    );
    assert.doesNotMatch(
      source,
      /@supports \(height: 100lvh\) \{\s*\.feed-page \{\s*--feed-viewport-height: 100lvh;/,
      "100lvh must never unconditionally override the viewport height alongside dvh support"
    );
  });

  test(`${label} keeps the available-height formula subtracting both header and bottom-nav reservations`, () => {
    assert.match(
      source,
      /--feed-available-height:\s*calc\(var\(--feed-viewport-height\) - var\(--feed-header-height\) - var\(--feed-bottom-nav-height\)\)/
    );
    assert.match(
      source,
      /--feed-bottom-nav-height:\s*calc\(var\(--feed-bottom-nav-content-height\) \+ var\(--feed-safe-bottom\)\)/
    );
  });
}

test("page.jsx keeps the loading/empty/active card states on identical mobile geometry", () => {
  const mobileBlock = feedPage.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n {8}\}\n\n {8}@media \(max-width: 768px\) and \(max-height: 720px\)/)?.[1];
  assert.ok(mobileBlock, "expected the max-width:768px mobile block");
  // The empty state must not reintroduce an `auto` height, or it will jump
  // relative to the loading/error/preference-gate/active-card states, which
  // all share --feed-deck-height via .feed-swipe-deck / .feed-swipe-deck--state.
  const emptyBlock = mobileBlock.match(/\.feed-match-section--empty \{([\s\S]*?)\}/)?.[1];
  assert.ok(emptyBlock, "expected a .feed-match-section--empty override");
  assert.doesNotMatch(emptyBlock, /height:\s*auto/);
  assert.doesNotMatch(emptyBlock, /min-height:\s*auto/);
});

test("Discover mobile header is fully removed (not just restyled) without touching the desktop/global logo", () => {
  const mobileFeedHeaderBlock = feedPage.match(/@media \(max-width: 768px\) \{\s*\/\*[\s\S]*?\*\/\s*\.feed-header \{\s*display: none;\s*\}\s*\}/);
  assert.ok(mobileFeedHeaderBlock, "FeedHeader must be display:none on mobile only");
  assert.match(feedLoading, /@media \(max-width: 768px\) \{[\s\S]*\.feed-header \{\s*display: none;\s*\}/);
});
