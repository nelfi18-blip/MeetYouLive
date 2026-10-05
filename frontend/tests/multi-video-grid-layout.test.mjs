import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Focused regression test for the mobile 2-camera (host + 1 guest) layout
// fix. Rather than mounting the component (styled-jsx template literals are
// not resolved by node:test's plain DOM-less runner), we assert directly on
// the authored CSS rules so the specific overflow-causing patterns reported
// by the user cannot silently reappear.
const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = join(__dirname, "../components/MultiVideoGrid.jsx");

/** Extracts the first CSS block matching `selector { ... }` (non-greedy). */
function extractRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*{([^}]*)}`));
  return match ? match[1] : null;
}

/** Extracts the body of a `@media (...) { ... }` block whose query matches. */
function extractMediaBlock(css, queryPattern) {
  const re = new RegExp(`@media\\s*\\(${queryPattern}[\\s\\S]*?\\{([\\s\\S]*?)\\n\\s*}\\n`, "m");
  // Find the opening of the @media block, then balance braces manually to
  // correctly capture nested rule braces.
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

test("multi-video-grid layout: grid-2 base rule uses shrinkable minmax(0, 1fr) tracks", async () => {
  const source = await readFile(componentPath, "utf8");
  const rule = extractRule(source, ".grid-2");
  assert.ok(rule, ".grid-2 base rule must exist");
  assert.match(rule, /minmax\(0,\s*1fr\)/, "grid-2 columns/rows should allow shrinking via minmax(0, 1fr)");
});

test("multi-video-grid layout: mobile portrait grid-2 stacks two shrinkable rows (no overflow-prone fixed rows)", async () => {
  const source = await readFile(componentPath, "utf8");
  const portraitBlock = extractMediaBlock(source, "max-width:\\s*768px\\)\\s*and\\s*\\(orientation:\\s*portrait");
  assert.ok(portraitBlock, "a (max-width: 768px) and (orientation: portrait) media block must exist");

  const gridTwoRule = extractRule(portraitBlock, ".grid-2");
  assert.ok(gridTwoRule, "mobile portrait .grid-2 rule must exist");
  assert.match(
    gridTwoRule,
    /grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    "mobile portrait grid-2 rows must share height equally and be allowed to shrink"
  );
});

test("multi-video-grid layout: mobile landscape grid-2 splits side-by-side", async () => {
  const source = await readFile(componentPath, "utf8");
  const landscapeBlock = extractMediaBlock(source, "max-width:\\s*768px\\)\\s*and\\s*\\(orientation:\\s*landscape");
  assert.ok(landscapeBlock, "a (max-width: 768px) and (orientation: landscape) media block must exist");

  const gridTwoRule = extractRule(landscapeBlock, ".grid-2");
  assert.ok(gridTwoRule, "mobile landscape .grid-2 rule must exist");
  assert.match(
    gridTwoRule,
    /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    "mobile landscape grid-2 columns must share width equally and be allowed to shrink"
  );
});

test("multi-video-grid layout: mobile grid-2 tiles are not pinned to an overflow-prone min-height", async () => {
  const source = await readFile(componentPath, "utf8");
  const mobileBlock = extractMediaBlock(source, "max-width:\\s*768px\\)\\s*\\{");
  // There are several plain `@media (max-width: 768px) {` blocks; scan all of
  // them for the `.grid-2 .video-tile` override that neutralizes the
  // generic mobile min-height/max-height that caused the reported overflow.
  const allPlainMobileBlocks = [...source.matchAll(/@media\s*\(max-width:\s*768px\)\s*\{/g)].map((m) => m.index);
  assert.ok(allPlainMobileBlocks.length > 0, "expected at least one plain mobile media block");

  let found = null;
  for (const openIdx of allPlainMobileBlocks) {
    const braceStart = source.indexOf("{", openIdx);
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === "{") depth++;
      if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          const block = source.slice(braceStart + 1, i);
          if (block.includes(".grid-2 .video-tile")) {
            found = extractRule(block, ".grid-2 .video-tile");
          }
          break;
        }
      }
    }
    if (found) break;
  }

  assert.ok(found, "a `.grid-2 .video-tile` override must exist inside a mobile media block");
  assert.match(found, /min-height:\s*0/, "grid-2 tiles must be allowed to shrink below the generic mobile min-height");
  assert.doesNotMatch(
    found,
    /max-height:\s*\d/,
    "grid-2 tiles on mobile must not be capped with a fixed max-height that can combine with gaps to overflow"
  );
});

test("multi-video-grid layout: generic mobile video-tile sizing is unchanged for 1/3/4 participant grids", async () => {
  const source = await readFile(componentPath, "utf8");
  const allPlainMobileBlocks = [...source.matchAll(/@media\s*\(max-width:\s*768px\)\s*\{/g)].map((m) => m.index);

  let genericTileRule = null;
  for (const openIdx of allPlainMobileBlocks) {
    const braceStart = source.indexOf("{", openIdx);
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === "{") depth++;
      if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          const block = source.slice(braceStart + 1, i);
          const rule = extractRule(block, ".video-tile");
          if (rule) genericTileRule = rule;
          break;
        }
      }
    }
  }

  assert.ok(genericTileRule, "the generic mobile `.video-tile` rule (for 1/3/4 grids) must still exist");
  assert.match(genericTileRule, /min-height:\s*180px/, "1/3/4 participant mobile tiles keep their existing min-height");
  assert.match(genericTileRule, /max-height:\s*300px/, "1/3/4 participant mobile tiles keep their existing max-height");
});

test("multi-video-grid layout: grid-1, grid-3 and grid-4 base rules are preserved", async () => {
  const source = await readFile(componentPath, "utf8");

  const grid1 = extractRule(source, ".grid-1");
  assert.ok(grid1, "grid-1 rule must exist");
  assert.match(grid1, /grid-template-columns/);
  assert.match(grid1, /grid-template-rows/);

  const grid3 = extractRule(source, ".grid-3");
  assert.ok(grid3, "grid-3 rule must exist");
  assert.match(grid3, /grid-template-columns:\s*1fr 1fr/);
  assert.match(grid3, /grid-template-rows:\s*1fr 1fr/);

  const grid4 = extractRule(source, ".grid-4");
  assert.ok(grid4, "grid-4 rule must exist");
  assert.match(grid4, /grid-template-columns:\s*1fr 1fr/);
  assert.match(grid4, /grid-template-rows:\s*1fr 1fr/);
});
