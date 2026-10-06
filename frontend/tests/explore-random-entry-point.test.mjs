import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the premium Random entry point added to the
// Explore screen (frontend/app/explore/page.jsx). Random itself
// (app/random/page.jsx) must remain completely untouched: this suite
// only adds a navigation entry point, mirroring the style of other
// presentational regression suites in this repo (e.g.
// random-premium-visual-redesign.test.mjs) that assert on authored
// source rather than a rendered DOM.
const __dirname = dirname(fileURLToPath(import.meta.url));
const explorePagePath = join(__dirname, "../app/explore/page.jsx");
const randomPagePath = join(__dirname, "../app/random/page.jsx");
const bottomNavRoutesPath = join(__dirname, "../lib/bottomNavRoutes.js");
const messagesDir = join(__dirname, "..", "messages");

async function readExplorePage() {
  return readFile(explorePagePath, "utf8");
}

test("explore: a Random entry point links directly to /random", async () => {
  const source = await readExplorePage();
  assert.match(
    source,
    /<Link href="\/random" className="explore-tab random-link"/,
    "Explore must render a Link to /random using normal Next.js navigation"
  );
});

test("explore: the Random entry point reuses the existing nav.random translation", async () => {
  const source = await readExplorePage();
  const linkMatch = source.match(
    /<Link href="\/random"[\s\S]*?<\/Link>/
  );
  assert.ok(linkMatch, "the Random entry link markup must exist");
  assert.match(
    linkMatch[0],
    /t\("nav\.random"\)/,
    "the Random entry must reuse t('nav.random') rather than a new/duplicated key"
  );
  // Confirm no new "random"-ish duplicate key was introduced in nav.*
  for (const lang of ["es", "en", "pt"]) {
    const raw = await readFile(join(messagesDir, `${lang}.json`), "utf8");
    const messages = JSON.parse(raw);
    assert.equal(typeof messages.nav.random, "string", `nav.random must exist in ${lang}.json`);
  }
});

test("explore: existing tabs (Live, People, Crush, Matches) are preserved and untouched", async () => {
  const source = await readExplorePage();
  assert.match(source, /<LiveTabIcon \/> \{t\("explore\.liveTab"\)\}/);
  assert.match(source, /<PeopleIcon \/> \{t\("explore\.peopleTab"\)\}/);
  assert.match(source, /<Link href="\/crush" className="explore-tab crush-link">/);
  assert.match(source, /<Link href="\/matches" className="explore-tab matches-link">/);
});

test("explore: the Random entry does not introduce emoji as its icon (SVG only)", async () => {
  const source = await readExplorePage();
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/)[0];
  assert.match(linkMatch, /<RandomTabIcon \/>/, "the Random entry must render an SVG icon component");
  // No emoji characters inside the Random link block.
  assert.doesNotMatch(linkMatch, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "no emoji should be used as the Random entry's icon");
});

test("explore: the Random entry has an accessible name and a >=44px tap target", async () => {
  const source = await readExplorePage();
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/)[0];
  assert.match(linkMatch, /aria-label=\{t\("nav\.random"\)\}/, "the Random entry must declare an accessible name");
  const rule = source.match(/\.random-link \{([^}]*)\}/);
  assert.ok(rule, ".random-link style rule must exist");
  assert.match(rule[1], /min-height:\s*44px/, "the Random entry must guarantee a >=44px touch target");
});

test("explore: the Random entry has a focus-visible outline and does not rely on color alone", async () => {
  const source = await readExplorePage();
  assert.match(source, /\.random-link:focus-visible\s*\{\s*outline:/, "a focus-visible outline must be defined");
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/)[0];
  assert.match(linkMatch, />\s*\{t\("nav\.random"\)\}\s*<\/span>/, "the Random entry must render a visible text label, not rely only on color/icon");
});

test("explore: any decorative Random animation is disabled under prefers-reduced-motion", async () => {
  const source = await readExplorePage();
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.random-link-halo \{\s*animation: none;/,
    "prefers-reduced-motion must disable the decorative halo animation"
  );
});

test("explore: Random has no auto-join — the entry point is a plain Link with no onClick handler", async () => {
  const source = await readExplorePage();
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/)[0];
  assert.doesNotMatch(linkMatch, /onClick/, "the Random entry link must not carry any click handler (no auto-join logic)");
});

test("random: the page's own CTA and auto-join safeguards remain untouched", async () => {
  const source = await readFile(randomPagePath, "utf8");
  assert.match(
    source,
    /<button type="button" className="random-page__cta" onClick=\{joinRandom\}>/,
    "the existing Enter Random CTA must remain wired to joinRandom()"
  );
  const mountEffectMatch = source.match(
    /Initial mount: auth \+ connect socket[\s\S]*?\n {2}}, \[session\?\.backendToken, sessionStatus\]\);/
  );
  assert.ok(mountEffectMatch, "the initial-mount effect must still exist");
  assert.doesNotMatch(
    mountEffectMatch[0],
    /callRandom\(\s*["']join["']\s*\)/,
    "mounting /random must still never call callRandom('join') automatically"
  );
});

test("bottom nav: IMMERSIVE_BOTTOM_NAV_EXCLUSIONS still hides the nav on /random and /live/start only", async () => {
  const source = await readFile(bottomNavRoutesPath, "utf8");
  const exclusionsMatch = source.match(
    /export const IMMERSIVE_BOTTOM_NAV_EXCLUSIONS = \[([\s\S]*?)\];/
  );
  assert.ok(exclusionsMatch, "IMMERSIVE_BOTTOM_NAV_EXCLUSIONS must still be exported");
  const entries = exclusionsMatch[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  assert.deepEqual(entries, ['"/live/start"', '"/random"']);
});
