import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the removal of the duplicate Random entry point
// from the Live discovery hero (frontend/app/live/page.jsx). Random
// remains accessible from the central IR menu (BottomNavEnhanced.jsx),
// so the /live header must not render its own Random link, icon, or
// exclusive styles. Random itself (app/random/page.jsx) must remain
// completely untouched.
const __dirname = dirname(fileURLToPath(import.meta.url));
const livePagePath = join(__dirname, "../app/live/page.jsx");
const randomPagePath = join(__dirname, "../app/random/page.jsx");

async function readLivePage() {
  return readFile(livePagePath, "utf8");
}

function getHeroActionsBlock(source) {
  const match = source.match(
    /<div className="hero-actions">([\s\S]*?)<\/div>\s*<\/section>/
  );
  assert.ok(match, "hero-actions block must exist in live/page.jsx");
  return match[1];
}

test("live: hero-actions no longer contains a Link to /random", async () => {
  const source = await readLivePage();
  const heroActions = getHeroActionsBlock(source);
  assert.doesNotMatch(
    heroActions,
    /href="\/random"/,
    "hero-actions must not render a duplicate Random entry (already available via the IR menu)"
  );
});

test("live: existing hero actions (/live/start and #active-lives) are preserved", async () => {
  const source = await readLivePage();
  const heroActions = getHeroActionsBlock(source);
  assert.match(heroActions, /<Link href="\/live\/start" className="hero-start">/);
  assert.match(heroActions, /<a href="#active-lives" className="hero-discover">/);
});

test("live: the HeroRandomIcon component and its exclusive styles were removed", async () => {
  const source = await readLivePage();
  assert.doesNotMatch(source, /HeroRandomIcon/, "HeroRandomIcon must be fully removed");
  assert.doesNotMatch(source, /\.hero-random\b/, ".hero-random styles must be fully removed");
  assert.doesNotMatch(source, /hero-random-halo/, ".hero-random-halo styles must be fully removed");
  assert.doesNotMatch(source, /hero-random-icon/, ".hero-random-icon styles must be fully removed");
});

test("random: the page itself was not modified by this change", async () => {
  const source = await readFile(randomPagePath, "utf8");
  assert.match(
    source,
    /<button type="button" className="random-page__cta" onClick=\{joinRandom\}>/,
    "the existing Enter Random CTA must remain wired to joinRandom()"
  );
});
