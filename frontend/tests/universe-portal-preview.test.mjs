import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import {
  PORTAL_TIMELINE_MS,
  getPortalPhase, normalizePortalIndex, getPortalCardOffset, getPortalCardStyle,
} from "../lib/universePortalMotion.js";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(frontend, path), "utf8");

test("world entrance lasts over ten seconds and never auto-rotates the menu", () => {
  assert.equal(PORTAL_TIMELINE_MS.globe, 3200);
  assert.equal(PORTAL_TIMELINE_MS.approach, 3300);
  assert.equal(PORTAL_TIMELINE_MS.reveal, 4000);
  assert.equal(PORTAL_TIMELINE_MS.total, 10500);
  assert.equal(getPortalPhase(0), "globe");
  assert.equal(getPortalPhase(3199), "globe");
  assert.equal(getPortalPhase(3200), "approach");
  assert.equal(getPortalPhase(6499), "approach");
  assert.equal(getPortalPhase(6500), "reveal");
  assert.equal(getPortalPhase(10499), "reveal");
  assert.equal(getPortalPhase(10500), "ready");
  assert.equal(getPortalPhase(120000), "ready");
  assert.equal(getPortalPhase(0, true), "ready");
});

test("the circle wraps and supports deliberate next/previous user gestures", () => {
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

test("the prototype route parses as Next/React JSX and cannot replace app launch", async () => {
  const route = await read("app/universe-preview/page.jsx");
  const screen = await read("components/UniversePortalPreview.jsx");
  const style = await read("components/UniversePortalPreview.module.css");
  assert.doesNotThrow(() => parse(route, { sourceType: "module", plugins: ["jsx"] }));
  assert.doesNotThrow(() => parse(screen, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(route, /<UniversePortalPreview/);
  assert.match(screen, /data-phase=\{phase\}/);
  assert.match(screen, /onPointerDown=\{onPointerDown\}/);
  assert.match(screen, /onPointerUp=\{onPointerUp\}/);
  assert.match(screen, /ArrowLeft/);
  assert.match(screen, /ArrowRight/);
  assert.match(screen, /setTimeout\(\(\) => setPhase\("ready"\), PORTAL_TIMELINE_MS.total\)/);
  assert.doesNotMatch(screen, /setInterval|requestAnimationFrame\(/);
  assert.match(screen, /useReducedMotion/);
  assert.match(screen, /clearTimers\(\)/);
  assert.match(style, /prefers-reduced-motion: reduce/);
  assert.match(style, /\.scene\[data-theme="live"\]/);
  assert.match(style, /\.scene\[data-theme="random"\]/);
  assert.match(style, /\.scene\[data-theme="ai"\]/);
});

test("World and Social AI are explicitly unshipped; Random stays an option", async () => {
  const screen = await read("components/UniversePortalPreview.jsx");
  assert.match(screen, /id: "world", icon: "🌎", href: null/);
  assert.match(screen, /id: "random", icon: "🎲", href: "\/random"/);
  assert.match(screen, /id: "ai", icon: "✨", href: null/);
  assert.match(screen, /id: "rooms", icon: "🫶", href: "\/rooms"/);
  assert.match(screen, /id: "live", icon: "📡", href: "\/live"/);
  assert.match(screen, /disabled=\{!chosen.href\}/);
  assert.match(screen, /VISTA PREVIA · NO MODIFICA TU INICIO REAL/);
  assert.doesNotMatch(screen, /localStorage|sessionStorage|Stripe|CoinTransaction/);
  const publicAccess = await read("lib/publicAccess.js");
  assert.doesNotMatch(publicAccess, /universe-preview/);
});
