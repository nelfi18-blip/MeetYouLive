import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import {
  PORTAL_TIMELINE_MS, PORTAL_PHASES, PORTAL_CUES_MS, PORTAL_ORBIT_STEP_MS, PORTAL_ORBIT_STEPS,
  getPortalPhase, normalizePortalIndex, getPortalCardOffset,
  getPortalVisualPose,
} from "../lib/universePortalMotion.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("a readable cinematic intro builds the ring and rotates it back to World", () => {
  assert.deepEqual(PORTAL_PHASES, ["brand", "globe", "approach", "portal", "reveal", "orbit", "ready"]);
  assert.deepEqual([
    PORTAL_TIMELINE_MS.brand, PORTAL_TIMELINE_MS.globe,
    PORTAL_TIMELINE_MS.approach, PORTAL_TIMELINE_MS.portal,
    PORTAL_TIMELINE_MS.reveal, PORTAL_TIMELINE_MS.orbit,
    PORTAL_TIMELINE_MS.total,
  ], [1000, 1600, 1700, 1400, 1500, 7300, 14500]);
  assert.equal(PORTAL_CUES_MS.globe, 1000);
  assert.equal(PORTAL_CUES_MS.approach, 2600);
  assert.equal(PORTAL_CUES_MS.portal, 4300);
  assert.equal(PORTAL_CUES_MS.reveal, 5700);
  assert.equal(PORTAL_CUES_MS.orbit, 7200);
  assert.equal(PORTAL_CUES_MS.ready, 14500);
  assert.equal(PORTAL_ORBIT_STEPS, 7);
  assert.equal(PORTAL_ORBIT_STEP_MS, 940);
  for (const [at, expected] of [
    [0, "brand"], [999, "brand"], [1000, "globe"],
    [2599, "globe"], [2600, "approach"], [4299, "approach"],
    [4300, "portal"], [5699, "portal"], [5700, "reveal"],
    [7199, "reveal"], [7200, "orbit"], [14499, "orbit"],
    [14500, "ready"], [60000, "ready"],
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
  assert.match(source, /turnCount, setTurnCount\] = useState\(0\)/);
  assert.match(source, /normalizePortalIndex\(WORLD_INDEX \+ turnCount/);
  assert.match(source, /DESTINATIONS\.map/);
  assert.match(source, /getPortalVisualPose\(index, selectedIndex/);
  assert.match(source, /const REVEAL_ORDER = \{ random: 0, rooms: 1, games: 2, connect: 3, live: 4, ai: 5, world: 0 \}/);
  assert.match(source, /<WorldArtwork \/>/);
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
  assert.doesNotMatch(screen, /className=\{styles\.worldArtworkLabel\}/);
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

test("the selector makes a full 3D orbit, including Random, then stops at World", async () => {
  const source = await read("components/UniversePortalPreview.jsx");
  const css = await read("components/UniversePortalPreview.module.css");
  assert.ok(source.includes('setTimeout(() => setPhase("orbit")'));
  assert.ok(source.includes('PORTAL_ORBIT_STEPS'));
  assert.ok(source.includes('setTurnCount(step + 1)'));
  assert.ok(source.includes('PORTAL_ORBIT_STEP_MS'));
  assert.ok(source.includes('phase === "orbit" || isReady'));
  assert.ok(source.includes('setTurnCount(0)'));
  assert.ok(css.includes('animation:cardArrival 820ms'));
  assert.ok(css.includes('rotateY(var(--arrival-spin))'));
  assert.ok(source.includes('"--portal-angle"'));
  assert.ok(source.includes('"--slot-angle"'));
  assert.ok(css.includes('rotateY(calc(var(--slot-angle) - var(--portal-angle)))'));
  assert.ok(css.includes('translateZ(var(--ring-radius))'));
  assert.ok(css.includes('rotateY(calc(var(--portal-angle) - var(--slot-angle)))'));
  assert.ok(css.includes('.scene[data-phase="orbit"] .experienceCard'));
  assert.ok(css.includes('animation:orbitRevolution 7300ms linear both'));
  assert.ok(css.includes('rotateY(calc(var(--slot-angle) - 360deg))'));
  assert.ok(css.includes('rotateY(calc(360deg - var(--slot-angle)))'));
  assert.ok(!css.includes('var(--orbit-x)'));
  assert.ok(!css.includes('var(--orbit-z)'));
  assert.ok(source.includes('getPortalCardOffset(index, normalizePortalIndex(WORLD_INDEX + count'));
  assert.ok(source.includes('setTurnCount((current) => current + by)'));
  assert.ok(!css.includes('card-clarity-overlay.svg'));
  assert.ok(!css.includes('stroke="#b5f8ff"'));
  assert.ok(css.includes('var(--scene-background-position'));
  assert.equal(normalizePortalIndex(3 + PORTAL_ORBIT_STEPS, 7), 3);
  // The final step is 360° not 0°: it cannot reverse/teleport at wrap-around.
  const degree = (step) => (step * 360) / 7;
  assert.equal(degree(7), 360);
  assert.ok(degree(4) > degree(3));
  assert.equal(normalizePortalIndex(3 + 8, 7), 4);
  assert.ok(820 + 5 * 115 < PORTAL_TIMELINE_MS.reveal);
});

test("the preview is isolated and respects Spanish, reduced motion and touch", async () => {
  const source = await read("components/UniversePortalPreview.jsx");
  const css = await read("components/UniversePortalPreview.module.css");
  const route = await read("app/universe-preview/page.jsx");
  const access = await read("lib/publicAccess.js");
  assert.doesNotThrow(() => parse(route, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(route, /<ExploreCarousel3D/);
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

test("approved ExploreCarousel3D uses the actual MeetYouLive routes and never links to unavailable products", async () => {
  const source = await read("components/ExploreCarousel3D.jsx");
  const css = await read("components/ExploreCarousel3D.module.css");
  const page = await read("app/universe-preview/page.jsx");
  assert.doesNotThrow(() => parse(source, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(source, /import \{ motion, useReducedMotion \} from "framer-motion"/);
  assert.match(source, /import \{ useRouter \} from "next\/navigation"/);
  assert.match(source, /route: "\/live"/);
  assert.match(source, /route: "\/random"/);
  assert.match(source, /route: "\/rooms"/);
  assert.match(source, /route: "\/feed"/);
  assert.match(source, /id: "world", route: null/);
  assert.match(source, /id: "games", route: null/);
  assert.match(source, /id: "ai", route: null/);
  assert.doesNotMatch(source, /route: "\/(?:games|world|ai-assistant|discover)"/);
  assert.match(source, /router\.push\(activeExperience\.route\)/);
  assert.match(source, /disabled=\{!activeExperience\.route\}/);
  assert.match(source, /getPortalCardOffset\(/);
  assert.match(source, /setTurns\(\(current\) => current \+ by\)/);
  assert.match(source, /onPointerDown=\{onPointerDown\}/);
  assert.match(source, /onPointerUp=\{onPointerUp\}/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /lang \} = useLanguage\(/);
  assert.match(css, /perspective:\s*1100px/);
  assert.match(css, /preserve-3d/);
  assert.match(css, /rotateY\(var\(--slot-angle\)\) translateZ\(var\(--radius\)\)/);
  assert.match(css, /@media \(max-height: 630px\)/);
  assert.match(page, /<ExploreCarousel3D/);
  assert.doesNotMatch(page, /<UniversePortalPreview/);
});

test("World artwork, smaller cards, 3D LED platform and selected-card hand remain integrated", async () => {
  const jsx = await read("components/ExploreCarousel3D.jsx");
  const css = await read("components/ExploreCarousel3D.module.css");
  const world = await read("public/universe/world-card-illustration.svg");
  assert.doesNotThrow(() => parse(jsx, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(world, /viewBox="0 0 360 520"/);
  assert.match(world, /id="planet"/);
  assert.match(world, /id="ocean"/);
  assert.match(css, /world-card-illustration\.svg/);
  assert.match(css, /width: clamp\(142px,21vw,193px\)/);
  assert.match(css, /height: clamp\(210px,32svh,270px\)/);
  assert.match(css, /\.platformTop/);
  assert.match(css, /\.platformLeds/);
  assert.match(css, /\.platformCore/);
  assert.match(css, /repeating-conic-gradient/);
  assert.match(css, /@keyframes ledShimmer/);
  assert.match(css, /\.floorReflections/);
  assert.match(jsx, /styles\.platformTop/);
  assert.match(jsx, /styles\.platformLeds/);
  assert.match(jsx, /styles\.platformCore/);
  assert.match(jsx, /styles\.floorReflections/);
  assert.match(jsx, /key=\{activeExperience\.id\} className=\{styles\.selectionHand\}/);
  assert.match(css, /\.selectionHand \{/);
  assert.match(css, /pointer-events:none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
