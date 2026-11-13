import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import {
  PORTAL_TIMELINE_MS, PORTAL_PHASES, PORTAL_CUES_MS,
  getPortalPhase, normalizePortalIndex, getPortalCardOffset, getPortalCardStyle,
} from "../lib/universePortalMotion.js";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(frontend, path), "utf8");

test("the professional five-act intro has intentional, readable pacing", () => {
  assert.deepEqual(PORTAL_PHASES, ["brand", "globe", "approach", "portal", "reveal", "ready"]);
  assert.equal(PORTAL_TIMELINE_MS.brand, 1500);
  assert.equal(PORTAL_TIMELINE_MS.globe, 2800);
  assert.equal(PORTAL_TIMELINE_MS.approach, 2600);
  assert.equal(PORTAL_TIMELINE_MS.portal, 1800);
  assert.equal(PORTAL_TIMELINE_MS.reveal, 4200);
  assert.equal(PORTAL_TIMELINE_MS.total, 12900);
  assert.equal(PORTAL_CUES_MS.globe, 1500);
  assert.equal(PORTAL_CUES_MS.approach, 4300);
  assert.equal(PORTAL_CUES_MS.portal, 6900);
  assert.equal(PORTAL_CUES_MS.reveal, 8700);
  assert.equal(PORTAL_CUES_MS.ready, 12900);
  for (const [elapsed, expected] of [
    [0, "brand"], [1499, "brand"], [1500, "globe"],
    [4299, "globe"], [4300, "approach"], [6899, "approach"],
    [6900, "portal"], [8699, "portal"], [8700, "reveal"],
    [12899, "reveal"], [12900, "ready"], [60000, "ready"],
  ]) assert.equal(getPortalPhase(elapsed), expected);
  assert.equal(getPortalPhase(0, true), "ready");
  assert.equal(getPortalPhase(-1000), "brand");
  assert.equal(getPortalPhase(Number.NaN), "brand");
});

test("the selector wraps, stops on chosen cards, and supports manual next/previous", () => {
  assert.equal(normalizePortalIndex(-1, 8), 7);
  assert.equal(normalizePortalIndex(8, 8), 0);
  assert.equal(normalizePortalIndex(9, 8), 1);
  assert.equal(getPortalCardOffset(0, 7, 8), 1);
  assert.equal(getPortalCardOffset(7, 0, 8), -1);
  assert.equal(getPortalCardOffset(5, 0, 8), -3);
  assert.equal(getPortalCardStyle(0, 0, 8).opacity, 1);
  assert.equal(getPortalCardStyle(0, 0, 8)["--card-x"], "0px");
  assert.equal(getPortalCardStyle(1, 0, 8)["--card-x"], "108px");
  assert.equal(getPortalCardStyle(7, 0, 8)["--card-x"], "-108px");
  assert.equal(getPortalCardStyle(4, 0, 8).pointerEvents, "none");
});

test("preview parses as JSX and does not replace registration, the main home or navigation", async () => {
  const route = await read("app/universe-preview/page.jsx");
  const screen = await read("components/UniversePortalPreview.jsx");
  const style = await read("components/UniversePortalPreview.module.css");
  assert.doesNotThrow(() => parse(route, { sourceType: "module", plugins: ["jsx"] }));
  assert.doesNotThrow(() => parse(screen, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(route, /<UniversePortalPreview/);
  assert.match(screen, /data-phase=\{phase\}/);
  assert.match(screen, /onPointerDown=\{onPointerDown\}/);
  assert.match(screen, /onPointerUp=\{onPointerUp\}/);
  assert.match(screen, /didSwipe.current = true/);
  assert.match(screen, /ArrowLeft/);
  assert.match(screen, /ArrowRight/);
  assert.match(screen, /setPhase\("brand"\);/);
  assert.match(screen, /setTimeout\(\(\) => setPhase\("globe"\), PORTAL_CUES_MS.globe\)/);
  assert.match(screen, /setTimeout\(\(\) => setPhase\("portal"\), PORTAL_CUES_MS.portal\)/);
  assert.match(screen, /setTimeout\(\(\) => setPhase\("ready"\), PORTAL_CUES_MS.ready\)/);
  assert.doesNotMatch(screen, /setInterval|requestAnimationFrame\(/);
  assert.match(screen, /useReducedMotion/);
  assert.match(screen, /clearTimers\(\)/);
  assert.match(screen, /aria-valuetext=\{phaseDescription\}/);
  assert.match(style, /prefers-reduced-motion: reduce/);
  assert.match(style, /data-phase="brand"/);
  assert.match(style, /data-phase="portal"/);
  assert.match(style, /portalIgnite/);
  assert.match(style, /introProgress/);
  assert.match(style, /cardReveal/);
  assert.match(style, /data-theme="live"/);
  assert.match(style, /data-theme="random"/);
  assert.match(style, /data-theme="rooms"/);
  const access = await read("lib/publicAccess.js");
  assert.doesNotMatch(access, /universe-preview/);
});

test("World stays central while the four playable entrances remain distinct", async () => {
  const screen = await read("components/UniversePortalPreview.jsx");
  assert.match(screen, /id: "world", icon: "🌎", href: null/);
  assert.match(screen, /id: "random", icon: "🎲", href: "\/random"/);
  assert.match(screen, /id: "rooms", icon: "🫶", href: "\/rooms"/);
  assert.match(screen, /id: "live", icon: "📡", href: "\/live"/);
  assert.match(screen, /id: "connect", icon: "💞", href: "\/feed"/);
  assert.match(screen, /DESTINATIONS.slice\(1\).map/);
  assert.match(screen, /optionIndex = i \+ 1/);
  assert.match(screen, /selectedIndex === 0/);
  assert.match(screen, /<WorldGlobe/);
  assert.doesNotMatch(screen, /id: "ai"|id: "games"|id: "discover"/);
  assert.match(screen, /disabled=\{!chosen.href\}/);
  assert.match(screen, /BACKGROUND_SYMBOLS/);
  assert.match(screen, /copy.previewTag/);
  assert.doesNotMatch(screen, /localStorage|sessionStorage|Stripe|CoinTransaction/);
});

test("the branded introduction and background labels are localized ES EN PT", async () => {
  const screen = await read("components/UniversePortalPreview.jsx");
  assert.match(screen, /brandTag: "TU UNIVERSO SOCIAL"/);
  assert.match(screen, /brandTag: "YOUR SOCIAL UNIVERSE"/);
  assert.match(screen, /brandTag: "SEU UNIVERSO SOCIAL"/);
  assert.match(screen, /previewTag:/);
  assert.match(screen, /chosen.sky\[0\]/);
  assert.match(screen, /chosen.sky\[1\]/);
  assert.match(screen, /chosen.sky\[2\]/);
  assert.match(screen, /--reveal-delay": \(i \* 380\)/);
  assert.match(screen, /Citas, amistades y perfiles por descubrir/);
});
