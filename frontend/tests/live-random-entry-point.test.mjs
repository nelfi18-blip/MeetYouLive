import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the premium Random entry point added to the
// Live discovery hero (frontend/app/live/page.jsx). Random itself
// (app/random/page.jsx) must remain completely untouched: this suite
// only adds a navigation entry point, mirroring
// explore-random-entry-point.test.mjs.
const __dirname = dirname(fileURLToPath(import.meta.url));
const livePagePath = join(__dirname, "../app/live/page.jsx");
const randomPagePath = join(__dirname, "../app/random/page.jsx");
const messagesDir = join(__dirname, "..", "messages");

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

test("live: hero-actions contains a Link to /random", async () => {
  const source = await readLivePage();
  const heroActions = getHeroActionsBlock(source);
  assert.match(
    heroActions,
    /<Link href="\/random" className="hero-random"/,
    "hero-actions must render a Link to /random using normal Next.js navigation"
  );
});

test("live: the Random entry reuses the existing nav.random translation (no duplicate key)", async () => {
  const source = await readLivePage();
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/);
  assert.ok(linkMatch, "the Random entry link markup must exist");
  assert.match(
    linkMatch[0],
    /t\("nav\.random"\)/,
    "the Random entry must reuse t('nav.random') rather than a new/duplicated key"
  );
  for (const lang of ["es", "en", "pt"]) {
    const raw = await readFile(join(messagesDir, `${lang}.json`), "utf8");
    const messages = JSON.parse(raw);
    assert.equal(typeof messages.nav.random, "string", `nav.random must exist in ${lang}.json`);
  }
});

test("live: existing hero actions (/live/start and #active-lives) are preserved", async () => {
  const source = await readLivePage();
  const heroActions = getHeroActionsBlock(source);
  assert.match(heroActions, /<Link href="\/live\/start" className="hero-start">/);
  assert.match(heroActions, /<a href="#active-lives" className="hero-discover">/);
});

test("live: the Random entry does not introduce emoji as its icon (SVG only)", async () => {
  const source = await readLivePage();
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/)[0];
  assert.match(linkMatch, /<HeroRandomIcon \/>/, "the Random entry must render an SVG icon component");
  assert.doesNotMatch(
    linkMatch,
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
    "no emoji should be used as the Random entry's icon"
  );
});

test("live: the Random entry has an accessible name and a >=44px tap target", async () => {
  const source = await readLivePage();
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/)[0];
  assert.match(linkMatch, /aria-label=\{t\("nav\.random"\)\}/, "the Random entry must declare an accessible name");
  const rule = source.match(/\.hero-random \{([^}]*)\}/);
  assert.ok(rule, ".hero-random style rule must exist");
  assert.match(rule[1], /min-height:\s*44px/, "the Random entry must guarantee a >=44px touch target");
});

test("live: any decorative Random animation is disabled under prefers-reduced-motion", async () => {
  const source = await readLivePage();
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.hero-random-halo \{\s*animation: none;/,
    "prefers-reduced-motion must disable the decorative halo animation"
  );
});

test("live: Random has no auto-join — the entry point is a plain Link with no onClick handler", async () => {
  const source = await readLivePage();
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/)[0];
  assert.doesNotMatch(linkMatch, /onClick/, "the Random entry link must not carry any click handler (no auto-join logic)");
});

test("random: the page itself was not modified by this change", async () => {
  const source = await readFile(randomPagePath, "utf8");
  assert.match(
    source,
    /<button type="button" className="random-page__cta" onClick=\{joinRandom\}>/,
    "the existing Enter Random CTA must remain wired to joinRandom()"
  );
});
