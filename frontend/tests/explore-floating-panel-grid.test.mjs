import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the Explore floating action panel (PR #992 follow-up).
// The panel must render as a premium "glass" CSS Grid surface where all five
// actions (Directos en vivo, Personas, Crush, Mis Matches, Random) are
// simultaneously visible — NOT a horizontally scrolling carousel/row.
// These assert directly on the authored source (JSX markup + styled-jsx
// rules), consistent with the other presentational regression suites in
// this repo (e.g. explore-random-entry-point.test.mjs).
const __dirname = dirname(fileURLToPath(import.meta.url));
const explorePagePath = join(__dirname, "../app/explore/page.jsx");

async function readExplorePage() {
  return readFile(explorePagePath, "utf8");
}

function getRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}(?![\\w-])\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

test("explore-tabs: the panel uses CSS Grid, not a flex carousel", async () => {
  const source = await readExplorePage();
  const rule = getRule(source, ".explore-tabs");
  assert.ok(rule, ".explore-tabs base rule must exist");
  assert.match(rule, /display:\s*grid/, ".explore-tabs must be display: grid");
  assert.match(
    rule,
    /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/,
    ".explore-tabs must define a 6-column grid on mobile"
  );
});

test("explore-tabs: no horizontal scroll/carousel behavior is reintroduced", async () => {
  const source = await readExplorePage();
  const rule = getRule(source, ".explore-tabs");
  assert.ok(rule, ".explore-tabs base rule must exist");
  assert.doesNotMatch(rule, /overflow-x:\s*auto/, ".explore-tabs must not scroll horizontally");
  assert.doesNotMatch(rule, /flex-wrap:\s*nowrap/, ".explore-tabs must not rely on a nowrap flex row");
  assert.doesNotMatch(source, /explore-tabs::-webkit-scrollbar/, "no custom scrollbar hiding should remain");
  assert.doesNotMatch(source, /\.explore-tab\s*\{[^}]*flex:\s*0 0 auto/, ".explore-tab must not be pinned to auto-width flex items");
});

test("explore-tabs: renders as a premium glass surface (blur, translucent background, rounded, bordered)", async () => {
  const source = await readExplorePage();
  const rule = getRule(source, ".explore-tabs");
  assert.ok(rule, ".explore-tabs base rule must exist");
  assert.match(rule, /backdrop-filter:\s*blur/, "the panel must use a backdrop blur for a glass effect");
  assert.match(rule, /border-radius:\s*2[0-9]px/, "the panel must have a large (~26-30px) border radius");
  assert.match(rule, /border:\s*1px solid rgba\(139,\s*92,\s*246,/, "the panel must have a subtle violet border");
  assert.match(rule, /box-shadow:/, "the panel must have a controlled box-shadow");
  assert.match(rule, /width:\s*100%/, "the panel must span the full available width");
  assert.match(rule, /box-sizing:\s*border-box/, "the panel must use border-box sizing");
  assert.match(rule, /overflow:\s*hidden/, "the panel must not allow internal overflow");
});

test("explore-tabs: mobile distribution is 3/3 (Directos, Personas) + 2/2/2 (Crush, Matches, Random)", async () => {
  const source = await readExplorePage();
  assert.match(
    source,
    /\.explore-tabs > :nth-child\(1\)\s*\{\s*grid-column:\s*span 3;\s*\}/,
    "the 1st item (Directos en vivo) must span 3 of 6 columns on mobile"
  );
  assert.match(
    source,
    /\.explore-tabs > :nth-child\(2\)\s*\{\s*grid-column:\s*span 3;\s*\}/,
    "the 2nd item (Personas) must span 3 of 6 columns on mobile"
  );
  assert.match(
    source,
    /\.explore-tabs > :nth-child\(3\)\s*\{\s*grid-column:\s*span 2;\s*\}/,
    "the 3rd item (Crush) must span 2 of 6 columns on mobile"
  );
  assert.match(
    source,
    /\.explore-tabs > :nth-child\(4\)\s*\{\s*grid-column:\s*span 2;\s*\}/,
    "the 4th item (Mis Matches) must span 2 of 6 columns on mobile"
  );
  assert.match(
    source,
    /\.explore-tabs > :nth-child\(5\)\s*\{\s*grid-column:\s*span 2;\s*\}/,
    "the 5th item (Random) must span 2 of 6 columns on mobile"
  );
});

test("explore-tabs: all five actions remain direct children of the same .explore-tabs panel, in order", async () => {
  const source = await readExplorePage();
  const panelMatch = source.match(/<div className="explore-tabs">([\s\S]*?)<\/div>\s*\n\s*(?:\{\/\* ── Live tab)/);
  assert.ok(panelMatch, "the .explore-tabs panel block must exist and be followed by the Live tab section");
  const panel = panelMatch[1];
  const order = [
    /onClick=\{\(\) => setTab\("live"\)\}/,
    /onClick=\{\(\) => setTab\("discover"\)\}/,
    /<Link href="\/crush" className="explore-tab crush-link">/,
    /<Link href="\/matches" className="explore-tab matches-link">/,
    /<Link href="\/random" className="explore-tab random-link"/,
  ];
  let cursor = 0;
  for (const pattern of order) {
    const idx = panel.slice(cursor).search(pattern);
    assert.notEqual(idx, -1, `expected to find ${pattern} after position ${cursor} within the same .explore-tabs panel`);
    cursor += idx;
  }
});

test("explore-tab: buttons are full-width, centered, with a >=44px tap target and no forced single-line overflow", async () => {
  const source = await readExplorePage();
  const rule = getRule(source, ".explore-tab");
  assert.ok(rule, ".explore-tab base rule must exist");
  assert.match(rule, /width:\s*100%/, ".explore-tab must be width: 100% within its grid cell");
  assert.match(rule, /min-width:\s*0/, ".explore-tab must allow shrinking below content size (min-width: 0)");
  assert.match(rule, /min-height:\s*44px/, ".explore-tab must guarantee a >=44px touch target");
  assert.match(rule, /justify-content:\s*center/, ".explore-tab content must be centered");
  assert.match(rule, /text-align:\s*center/, ".explore-tab text must be centered");
  assert.match(rule, /border-radius:\s*var\(--radius-pill\)/, ".explore-tab must keep pill border-radius");
  assert.doesNotMatch(rule, /white-space:\s*nowrap/, ".explore-tab must not force nowrap text that could overflow horizontally");
});

test("explore-tabs: desktop/tablet can use a more horizontal 5-column layout when space allows", async () => {
  const source = await readExplorePage();
  assert.match(
    source,
    /@media \(min-width:\s*640px\)\s*\{\s*\.explore-tabs\s*\{\s*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
    "a wider breakpoint must switch to a 5-equal-column layout instead of the mobile 3/3+2/2/2 split"
  );
});

test("explore-tabs: narrow-screen tuning only shrinks gap/padding/font-size, never reintroducing a carousel", async () => {
  const source = await readExplorePage();
  const narrowBlocks = [...source.matchAll(/@media \(max-width:\s*(?:600|380)px\)\s*\{([\s\S]*?)\n\s{8}\}/g)];
  assert.ok(narrowBlocks.length >= 2, "expected narrow-screen media queries for the explore tabs panel");
  for (const [, body] of narrowBlocks) {
    assert.doesNotMatch(body, /overflow-x:\s*auto/, "narrow breakpoints must not add horizontal scroll");
    assert.doesNotMatch(body, /display:\s*flex/, "narrow breakpoints must not convert the panel back to flex");
  }
});

test("explore: Random keeps its own identity (violet gradient, SVG icon, contained halo) and is not promoted to a dominant CTA", async () => {
  const source = await readExplorePage();
  const linkMatch = source.match(/<Link href="\/random"[\s\S]*?<\/Link>/)[0];
  assert.match(linkMatch, /<RandomTabIcon \/>/, "Random must keep its SVG icon");
  assert.doesNotMatch(linkMatch, /onClick/, "Random must remain a plain navigation Link with no auto-join behavior");
  const rule = getRule(source, ".random-link");
  assert.match(rule, /min-height:\s*44px/, "Random must keep its >=44px tap target");
  assert.match(rule, /overflow:\s*hidden/, "Random's decorative halo must remain visually contained");
  const haloRule = getRule(source, ".random-link-halo");
  assert.ok(haloRule, "the contained halo rule must still exist");
});

test("explore: Directos, Personas, Crush, Matches keep their existing identities and behavior", async () => {
  const source = await readExplorePage();
  assert.match(source, /<LiveTabIcon \/> \{t\("explore\.liveTab"\)\}/, "Directos must still render via LiveTabIcon + explore.liveTab");
  assert.match(source, /<PeopleIcon \/> \{t\("explore\.peopleTab"\)\}/, "Personas must still render via PeopleIcon + explore.peopleTab");
  assert.match(source, /<Link href="\/crush" className="explore-tab crush-link">/, "Crush must still link to /crush");
  assert.match(source, /<Link href="\/matches" className="explore-tab matches-link">/, "Matches must still link to /matches");
  assert.match(source, /\.explore-tab\.active\s*\{\s*background:\s*var\(--grad-primary\)/, "the active tab gradient must be preserved");
  assert.match(source, /\.crush-link\s*\{[^}]*color:\s*#fbbf24/, "Crush must keep its golden identity");
  assert.match(source, /\.matches-link\s*\{[^}]*color:\s*var\(--accent\)/, "Matches must keep its pink/accent identity");
});

test("explore: reduced-motion handling for the Random halo remains intact", async () => {
  const source = await readExplorePage();
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.random-link-halo \{\s*animation: none;/,
    "prefers-reduced-motion must still disable the decorative halo animation"
  );
});
