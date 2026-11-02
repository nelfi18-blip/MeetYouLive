import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const feedPage = await readFile(new URL("../app/feed/page.jsx", import.meta.url), "utf8");

// Regression test for the mobile Discover overlap bug: the card's profile
// text (name, location, interests, bio) was reserving a flat guessed
// rem value of bottom padding to clear the floating action-dock buttons.
// That value never accounted for env(safe-area-inset-bottom) (notch /
// gesture-nav home indicator) even though --feed-action-dock-bottom itself
// DOES grow with it — so on devices with a real inset, combined with
// multiple interests/a long bio, the reserved space could shrink until the
// interests/bio visually collided with the buttons.
//
// The fix ties the reserved bottom padding directly to the dock's actual
// geometry (button height + its own offset from the deck edge) plus a fixed
// breathing buffer, so the clearance can never fall out of sync with the
// buttons regardless of safe-area size, viewport, or content length.

test("the mobile swipe card defines a single clearance variable derived from the real dock geometry", () => {
  assert.match(
    feedPage,
    /--feed-action-dock-height:\s*clamp\(56px, 15vw, 68px\);/,
    "expected a shared --feed-action-dock-height variable (single source of truth for button diameter)"
  );
  assert.match(
    feedPage,
    /--feed-card-bottom-clearance:\s*calc\(var\(--feed-action-dock-height\)\s*\+\s*var\(--feed-action-dock-bottom\)\s*\+\s*22px\)/,
    "expected --feed-card-bottom-clearance to be computed from the dock's real height and offset, not a flat guess"
  );
});

test(".feed-action-btn reuses --feed-action-dock-height instead of redeclaring its own clamp", () => {
  assert.match(
    feedPage,
    /--feed-action-btn-size:\s*var\(--feed-action-dock-height\);/,
    "the button size must come from the shared variable so it can never drift from the reserved clearance math"
  );
  // The mobile media query must not re-declare a hardcoded duplicate of the
  // clamp — if it ever drifts from --feed-action-dock-height, the computed
  // --feed-card-bottom-clearance would silently stop matching the real
  // button size again.
  const mobileBlock = feedPage.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n {8}\}\n\n {8}@media \(max-width: 768px\) and \(max-height: 720px\)/)?.[1];
  assert.ok(mobileBlock, "expected the max-width:768px mobile block");
  assert.doesNotMatch(
    mobileBlock,
    /--feed-action-btn-size:\s*clamp\(/,
    "the mobile block must not reintroduce a hardcoded duplicate of the shared dock-height clamp"
  );
});

test("mobile swipe-card-info uses the dynamic clearance for its bottom padding in both the normal and short-viewport branches", () => {
  const mobileBlock = feedPage.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n {8}\}\n\n {8}@media \(max-width: 768px\) and \(max-height: 720px\)/)?.[1];
  assert.ok(mobileBlock, "expected the max-width:768px mobile block");
  assert.match(
    mobileBlock,
    /padding:\s*8\.4rem clamp\(1\.14rem, 4\.8vw, 1\.45rem\) var\(--feed-card-bottom-clearance\);/,
    "the base mobile swipe-card-info padding-bottom must use the dynamic clearance variable"
  );

  const shortViewportBlock = feedPage.match(/@media \(max-width: 768px\) and \(max-height: 720px\) \{([\s\S]*?)\n {8}\}/)?.[1];
  assert.ok(shortViewportBlock, "expected the max-width:768px and max-height:720px block");
  assert.match(
    shortViewportBlock,
    /padding-bottom:\s*var\(--feed-card-bottom-clearance\);/,
    "the short-viewport swipe-card-info override must also use the dynamic clearance variable"
  );
});
