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
  const selected = getPortalVisualPose(2, 2, 7);
  const sideLeft = getPortalVisualPose(1, 2, 7);
  const sideRight = getPortalVisualPose(3, 2, 7);
  const further = getPortalVisualPose(4, 2, 7);
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
  assert.equal(getPortalVisualPose(3, 2, 7).opacity, 1);
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
  assert.match(source, /<WorldArtwork coming=\{copy\.coming\}/);
  assert.match(source, /className=\{styles\.experienceCard\}/);
  assert.match(source, /data-world=\{worldCard \? "yes" : "no"\}/);
  assert.doesNotMatch(source, /WorldGlobe|globeFrame|<WorldGlobe/);
  assert.match(source, /id: "random", icon: "🎲", route: "\/random"/);
  assert.match(source, /id: "world", icon: "🌎", route: null/);
  assert.match(source, /id: "ai", icon: "✨", route: null/);
  assert.match(source, /id: "games", icon: "🎮", route: "\/rooms"/);
  assert.match(source, /disabled=\{!selected\.route\}/);
});

test("reference-inspired photographic art and monuments remain part of World card", async () => {
  const source = await read("components/UniversePortalPreview.jsx");
  const css = await read("components/UniversePortalPreview.module.css");
  assert.match(source, /className=\{styles\.landmarkGallery\}/);
  assert.match(source, /className=\{styles\.eiffelPhoto\}/);
  assert.match(source, /className=\{styles\.libertyPhoto\}/);
  assert.match(source, /className=\{styles\.colosseumPhoto\}/);
  assert.match(source, /className=\{styles\.earthAtmosphere\}/);
  assert.match(css, /Apollo_17\.jpg/);
  assert.match(css, /photo-1502602898657-3e91760cbb34/);
  assert.match(css, /photo-1552832230-c0197dd311b5/);
  assert.match(css, /photo-1493225457124-a3eb161ffa5f/);
  assert.match(css, /photo-1529156069898-49953e39b3ac/);
  assert.match(css, /photo-1446776811953-b23d57bd21aa/);
  assert.match(css, /portal-vista\.svg/);
  assert.match(css, /height:100svh/);
  assert.match(css, /experienceCard\[data-selected="yes"\]/);
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
