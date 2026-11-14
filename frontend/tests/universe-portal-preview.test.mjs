import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import {
  PORTAL_TIMELINE_MS, PORTAL_PHASES, PORTAL_CUES_MS,
  getPortalPhase, normalizePortalIndex, getPortalCardOffset,
  getPortalVisualPose,
} from "../lib/universePortalMotion.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("a professional introduction resolves at 12.9 seconds, then stops", () => {
  assert.deepEqual(PORTAL_PHASES, ["brand", "globe", "approach", "portal", "reveal", "ready"]);
  assert.deepEqual([
    PORTAL_TIMELINE_MS.brand, PORTAL_TIMELINE_MS.globe,
    PORTAL_TIMELINE_MS.approach, PORTAL_TIMELINE_MS.portal,
    PORTAL_TIMELINE_MS.reveal, PORTAL_TIMELINE_MS.total,
  ], [1500, 2800, 2600, 1800, 4200, 12900]);
  assert.equal(PORTAL_CUES_MS.globe, 1500);
  assert.equal(PORTAL_CUES_MS.approach, 4300);
  assert.equal(PORTAL_CUES_MS.portal, 6900);
  assert.equal(PORTAL_CUES_MS.reveal, 8700);
  assert.equal(PORTAL_CUES_MS.ready, 12900);
  for (const [at, expected] of [
    [0, "brand"], [1499, "brand"], [1500, "globe"],
    [4299, "globe"], [4300, "approach"], [6899, "approach"],
    [6900, "portal"], [8699, "portal"], [8700, "reveal"],
    [12899, "reveal"], [12900, "ready"], [60000, "ready"],
  ]) assert.equal(getPortalPhase(at), expected);
  assert.equal(getPortalPhase(0, true), "ready");
});

test("the World card physically dominates its curved neighbors", () => {
  const selected = getPortalVisualPose(3, 3, 7);
  const sideLeft = getPortalVisualPose(2, 3, 7);
  const sideRight = getPortalVisualPose(4, 3, 7);
  const further = getPortalVisualPose(5, 3, 7);
  assert.equal(selected.x, 0);
  assert.equal(selected.scale, 1);
  assert.equal(selected.opacity, 1);
  assert.equal(sideLeft.x, -119);
  assert.equal(sideRight.x, 119);
  assert.ok(sideLeft.scale < selected.scale);
  assert.ok(sideRight.scale < selected.scale);
  assert.ok(further.scale < sideRight.scale);
  assert.ok(selected.zIndex > sideRight.zIndex);
  assert.equal(normalizePortalIndex(-1, 7), 6);
  assert.equal(getPortalCardOffset(0, 6, 7), 1);
  assert.equal(getPortalVisualPose(4, 3, 7).opacity, 1);
});

test("exactly one central World card and six carousel experiences, including Random", async () => {
  const source = await read("components/UniversePortalPreview.jsx");
  assert.doesNotThrow(() => parse(source, { sourceType: "module", plugins: ["jsx"] }));
  for (const id of ["live","games","world","rooms","connect","ai","random"]) {
    assert.match(source, new RegExp('id: "' + id + '"'));
  }
  assert.match(source, /const WORLD_INDEX = DESTINATIONS\.findIndex/);
  assert.match(source, /selectedIndex, setSelectedIndex\] = useState\(WORLD_INDEX\)/);
  assert.match(source, /DESTINATIONS\.map/);
  assert.match(source, /getPortalVisualPose\(index, selectedIndex/);
  assert.match(source, /const REVEAL_ORDER = \{ random: 0, rooms: 1, games: 2, connect: 3, live: 4, ai: 5, world: 0 \}/);
  assert.match(source, /<WorldArtwork coming=\{copy\.coming\}/);
  assert.match(source, /className=\{styles\.experienceCard\}/);
  assert.match(source, /data-world=\{worldCard \? "yes" : "no"\}/);
  assert.doesNotMatch(source, /WorldGlobe|globeFrame|<WorldGlobe/);
  assert.match(source, /id: "random", icon: "🎲", route: "\/random"/);
  assert.ok(source.indexOf('id: "random"') < source.indexOf('id: "world"'));
  assert.ok(source.indexOf('id: "world"') < source.indexOf('id: "rooms"'));
  assert.match(source, /id: "world", icon: "🌎", route: null/);
  assert.match(source, /id: "ai", icon: "✨", route: null/);
  assert.match(source, /id: "games", icon: "🎮", route: "\/rooms"/);
  assert.match(source, /disabled=\{!selected\.route\}/);
});

test("original neon CGI illustrations are local assets for every card, never stock photos", async () => {
  const screen = await read("components/UniversePortalPreview.jsx");
  const css = await read("components/UniversePortalPreview.module.css");
  const asset = await readFile(join(root, "public/universe/illustrated-card-atlas.webp"));
  assert.equal(asset.toString("ascii",0,4),"RIFF");
  assert.equal(asset.toString("ascii",8,12),"WEBP");
  assert.ok(asset.length > 8000);
  assert.ok(asset.length < 60000, "the atlas should stay fast on mobile data");
  assert.match(screen, /className=\{styles\.worldArtwork\}/);
  assert.match(screen, /className=\{styles\.worldArtworkLabel\}/);
  assert.match(css, /illustrated-card-atlas\.webp/);
  for(const name of ["world","live","games","random","rooms","connect","ai"]) {
    assert.match(css, new RegExp('experienceCard\\[data-destination="' + name + '"\\]'));
  }
  assert.match(css, /background-size:400% 200%/);
  assert.match(css, /portal-vista\.svg/);
  assert.match(css, /height:\s*100svh/);
  assert.match(css, /experienceCard\[data-selected="yes"\]/);
  assert.doesNotMatch(css, /images\.unsplash\.com|upload\.wikimedia\.org|svs\.gsfc\.nasa\.gov/);
  assert.doesNotMatch(screen, /landmarkGallery|eiffelPhoto|libertyPhoto|colosseumPhoto|earthAtmosphere/);
});

test("destination cards physically spin outward from World, not just slide in", async () => {
  const source = await read("components/UniversePortalPreview.jsx");
  const css = await read("components/UniversePortalPreview.module.css");
  assert.match(source, /"--arrival-spin":/);
  assert.match(source, /"--arrival-x-middle":/);
  assert.match(source, /REVEAL_ORDER\\[item.id\\] \\* 510/);
  assert.match(css, /animation:cardArrival 1580ms/);
  assert.match(css, /rotateY\\(var\\(--arrival-spin\\)\\)/);
  assert.match(css, /rotateY\\(var\\(--arrival-spin-middle\\)\\)/);
  assert.match(css, /rotateY\\(var\\(--arrival-spin-late\\)\\)/);
  assert.match(css, /--arrival-x-quarter/);
  assert.match(css, /--arrival-x-middle/);
  assert.match(css, /--arrival-x-near/);
  assert.ok(1580 + 5 * 510 < PORTAL_TIMELINE_MS.reveal);
});

test("all seven cards have sharp scalable local SVG details over existing original CGI", async () => {
  const screen = await read("components/UniversePortalPreview.jsx");
  const css = await read("components/UniversePortalPreview.module.css");
  const svg = await read("public/universe/card-clarity-overlay.svg");
  assert.match(svg, /<svg [^>]+viewBox="0 0 1024 768"/);
  assert.equal((svg.match(/clip-path="url\\(#tileClip/g) || []).length, 7);
  assert.match(svg, /stroke="#edbdff"/); // Controller edges, not upscaled pixels
  assert.match(svg, /stroke="#b5f8ff"/); // Holographic face
  assert.doesNotMatch(svg, /https?:\\/\\//);
  assert.match(css, /card-clarity-overlay\\.svg/);
  assert.match(css, /\\.cardPhoto::after,\\.worldArtwork::before/);
  assert.match(screen, /selectedIndex, setSelectedIndex/);
});

test("the preview is isolated and respects Spanish, reduced motion and touch", async () => {
  const source = await read("components/UniversePortalPreview.jsx");
  const css = await read("components/UniversePortalPreview.module.css");
  const route = await read("app/universe-preview/page.jsx");
  const access = await read("lib/publicAccess.js");
  assert.doesNotThrow(() => parse(route, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(route, /<UniversePortalPreview/);
  assert.match(source, /language, setLanguage\] = useState\("es"\)/);
  assert.match(source, /onPointerDown=\{pointerDown\}/);
  assert.match(source, /onPointerUp=\{pointerUp\}/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /didSwipe\.current = true/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /clearTimers/);
  assert.match(source, /copy\.preview/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(source, /setInterval|requestAnimationFrame/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|CoinTransaction|Stripe/);
  assert.doesNotMatch(access, /universe-preview/);
});
