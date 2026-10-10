import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/explore/page.jsx", import.meta.url), "utf8");
const mobile = page.match(/@media \(max-width: 639px\) \{([\s\S]*?)\n {8}\}/)?.[1];

test("Discovery premium styles are mobile-only and anchored to the Discover grid", () => {
  assert.ok(mobile);
  const selectors = [...mobile.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim());
  assert.ok(selectors.length > 0);
  for (const selector of selectors) {
    for (const part of selector.split(/,\s*\n/)) {
      assert.match(part.trim(), /^\.discover-grid(?:\s+:global\(.+\))?$/);
    }
  }
  assert.match(mobile, /grid-template-columns: minmax\(0, 1fr\)/);
});

test("Discovery reuses real profile photos and existing handlers, states and prices", () => {
  const card = page.match(/<PremiumProfileCard[\s\S]*?\/>/)?.[0];
  assert.ok(card);
  for (const prop of [
    "user={user}", "liked={likedIds.has(user._id)}", "matched={matchIds.has(user._id)}",
    "onLike={handleLike}", "onPass={handlePass}", "onSuperCrush={handleSuperCrush}",
    "onBoost={handleBoost}", "onFlashLive={handlePrivateCall}",
    "superCrushPrice={superCrushPrice}", "boostPrice={boostPrice}", "loading={discoverLoading}",
  ]) {
    assert.ok(card.includes(prop), `${prop} must remain wired`);
  }
  assert.match(mobile, /\.card-avatar-img\)[\s\S]*?object-fit: cover/);
  assert.match(mobile, /\.card-avatar-wrap::after\)[\s\S]*?linear-gradient/);
  assert.match(mobile, /\.card-avatar-placeholder\)/);
});

test("Discovery keeps profile navigation separate from actions and badge tooltips", () => {
  assert.match(mobile, /\.card-link-overlay\) \{[^}]*grid-area: 1 \/ 1;[^}]*position: relative;[^}]*inset: auto;/);
  assert.match(mobile, /\.card-premium-actions\) \{[^}]*grid-area: 2 \/ 1;/);
  assert.match(mobile, /\.card-body\) \{[^}]*pointer-events: none;/);
  assert.match(mobile, /\.card-body\) \{[^}]*z-index: 4;/);
  assert.match(mobile, /\.sb\) \{[^}]*pointer-events: auto;[^}]*z-index: 4;/);
});

test("Discovery controls keep readable prices, generous touch targets and visible focus", () => {
  assert.match(mobile, /\.interaction-button\) \{[^}]*min-height: 64px;/);
  assert.match(mobile, /\.interaction-button.action-compact\) \{[^}]*min-width: 64px !important;/);
  assert.match(mobile, /\.interaction-coin-badge\) \{[^}]*position: static;/);
  assert.match(mobile, /\.interaction-button:focus-visible\) \{[^}]*outline: 3px solid var\(--accent-cyan\);/);
});

test("Discovery respects reduced motion without changing other tabs", () => {
  const reduced = page.match(/@media \(max-width: 639px\) and \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {8}\}/)?.[1];
  assert.ok(reduced);
  assert.match(reduced, /\.discover-grid :global\(\.premium-profile-card \*\)/);
  assert.match(reduced, /animation: none !important;/);
  assert.match(reduced, /transition: none !important;/);
  assert.match(reduced, /transform: none;/);
});
