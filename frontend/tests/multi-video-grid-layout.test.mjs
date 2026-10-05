import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Focused regression test for the video-first stage redesign. Rather than
// mounting the component (styled-jsx template literals are not resolved by
// node:test's plain DOM-less runner), we assert directly on the authored CSS
// rules so the layout contract (1/2/3/4 streams, responsive breakpoints, no
// overflow-prone fixed sizing) cannot silently regress.
const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = join(__dirname, "../components/MultiVideoGrid.jsx");
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");

/** Extracts the first CSS block matching `selector { ... }` (non-greedy). */
function extractRule(css, selector) {
  const match = css.match(new RegExp(`${selector}\\s*{([^}]*)}`));
  return match ? match[1] : null;
}

/** Extracts the body of a `@media (...) { ... }` block whose query matches. */
function extractMediaBlock(css, queryPattern) {
  const openIdx = css.search(new RegExp(`@media\\s*\\(${queryPattern}`));
  if (openIdx === -1) return null;
  const braceStart = css.indexOf("{", openIdx);
  let depth = 0;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        return css.slice(braceStart + 1, i);
      }
    }
  }
  return null;
}

test("multi-video-grid layout: grid-1 fills the stage with no reserved space", async () => {
  const source = await readFile(componentPath, "utf8");
  const rule = extractRule(source, "\\.grid-1");
  assert.ok(rule, ".grid-1 base rule must exist");
  assert.match(rule, /minmax\(0,\s*1fr\)/);

  // grid-1 must never be capped by a small/fixed tile height — the single
  // camera should be free to use the whole stage.
  assert.doesNotMatch(source, /\.grid-1\s+\.video-tile\s*{[^}]*max-height:\s*\d/);
});

test("multi-video-grid layout: grid-2 is a full-height side-by-side duo on every breakpoint", async () => {
  const source = await readFile(componentPath, "utf8");
  const rule = extractRule(source, "\\.grid-2");
  assert.ok(rule, ".grid-2 base rule must exist");
  assert.match(rule, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, "two equal, shrinkable columns");
  assert.match(rule, /grid-template-rows:\s*minmax\(0,\s*1fr\)/, "a single full-height row (no thin horizontal strips)");

  // No portrait-specific override should turn grid-2 back into stacked rows.
  assert.doesNotMatch(
    source,
    /@media[^{]*orientation:\s*portrait[^{]*{[^}]*\.grid-2\s*{[^}]*grid-template-rows:\s*repeat\(2/s,
    "grid-2 must stay side-by-side in portrait instead of stacking into two short horizontal strips"
  );
});

test("multi-video-grid layout: grid-3 is hierarchical (one main + two secondary tiles, no empty slot)", async () => {
  const source = await readFile(componentPath, "utf8");
  const tile1 = extractRule(source, "\\.grid-3 \\.tile-1");
  const tile2 = extractRule(source, "\\.grid-3 \\.tile-2");
  const tile3 = extractRule(source, "\\.grid-3 \\.tile-3");
  assert.ok(tile1 && tile2 && tile3, "grid-3 must position all three tiles explicitly");

  // Mobile-first: tile-1 (main) spans both columns on row 1; tile-2/3 share row 2.
  assert.match(tile1, /grid-column:\s*1\s*\/\s*3/);
  assert.match(tile2, /grid-row:\s*2\s*\/\s*3/);
  assert.match(tile3, /grid-row:\s*2\s*\/\s*3/);

  const desktopBlock = extractMediaBlock(source, "min-width:\\s*769px");
  assert.ok(desktopBlock, "a (min-width: 769px) media block must exist for the desktop/tablet hero-left composition");
  const desktopTile1 = extractRule(desktopBlock, "\\.grid-3 \\.tile-1");
  assert.ok(desktopTile1, "desktop grid-3 must reposition tile-1 as a left-hand hero spanning both rows");
  assert.match(desktopTile1, /grid-row:\s*1\s*\/\s*3/);
});

test("multi-video-grid layout: grid-4 is an even 2x2 grid with consistent tile sizes", async () => {
  const source = await readFile(componentPath, "utf8");
  const rule = extractRule(source, "\\.grid-4");
  assert.ok(rule, ".grid-4 rule must exist");
  assert.match(rule, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(rule, /grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("multi-video-grid layout: generic tile sizing is free to shrink/grow (no overflow-prone fixed min-height)", async () => {
  const source = await readFile(componentPath, "utf8");
  const rule = extractRule(source, "\\n        \\.video-tile");
  assert.ok(rule, ".video-tile base rule must exist");
  assert.match(rule, /min-height:\s*0/);
});

test("multi-video-grid layout: participant identity overlay stays compact and legible, never a large block", async () => {
  const source = await readFile(componentPath, "utf8");
  const info = extractRule(source, "\\.participant-info");
  assert.ok(info, ".participant-info rule must exist");
  // Padding must stay small so the overlay never swallows a meaningful
  // portion of the video surface.
  const paddingMatch = info.match(/padding:\s*([\d.]+)rem/);
  assert.ok(paddingMatch, "participant-info must declare a padding");
  assert.ok(parseFloat(paddingMatch[1]) <= 0.75, "participant-info padding must stay compact");

  const badge = extractRule(source, "\\.participant-badge");
  assert.ok(badge, ".participant-badge rule must exist");
  assert.match(badge, /backdrop-filter:\s*blur/, "badge must keep a blurred background for contrast over bright video");
});

test("live stage: video-wrap grows taller on mobile portrait so video dominates the viewport", async () => {
  const source = await readFile(livePagePath, "utf8");
  const baseRule = extractRule(source, "\\.video-wrap");
  assert.ok(baseRule, ".video-wrap base rule must exist");
  assert.match(baseRule, /aspect-ratio:\s*16\s*\/\s*9/, "desktop/landscape keep the 16:9 ratio");

  const portraitBlock = extractMediaBlock(source, "max-width:\\s*900px\\)\\s*and\\s*\\(orientation:\\s*portrait");
  assert.ok(portraitBlock, "a mobile portrait media block for .video-wrap must exist");
  const portraitRule = extractRule(portraitBlock, "\\.video-wrap");
  assert.ok(portraitRule, "mobile portrait .video-wrap override must exist");
  assert.doesNotMatch(portraitRule, /aspect-ratio:\s*16\s*\/\s*9/, "portrait must not keep the squat 16:9 ratio");
});
