import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveMylWorldBeyondDemoAccess,
  isMylWorldBeyondDemoEnabled,
} from "../lib/mylWorldBeyondAccess.js";

// Focused regression suite for the "MYL World & Beyond — integración visual
// segura" task: a reusable player that reuses the existing (already
// reviewed) gift preview animations, wired into the Live room's effects
// area in an isolated, additive way. Source-based assertions are used for
// the styled-jsx-heavy live room page and for the catalog module (which
// uses the "@/" webpack alias, not resolvable by node:test's loader),
// matching the existing suite's pattern
// (see live-immersive-reactions-gifts.test.mjs / gift-animations-preview.test.mjs).

const __dirname = dirname(fileURLToPath(import.meta.url));
const playerPath = join(__dirname, "../components/gifts/MylWorldBeyondPlayer.jsx");
const accessPath = join(__dirname, "../lib/mylWorldBeyondAccess.js");
const catalogPath = join(__dirname, "../lib/giftAnimationsPreviewCatalog.js");
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");

const read = (path) => readFile(path, "utf8");

/** Strips `//` line comments and `/** ... *&#47;` block comments so
 * doesNotMatch assertions only inspect real code, not doc prose that
 * legitimately mentions things like "/api/gifts/send" or "giftQueue" to
 * explain what the code deliberately does NOT do. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1. Reusable player selects by stable id, no drawing/network of its own ── */

test("MylWorldBeyondPlayer only selects an existing preview component by a stable animationId", async () => {
  const source = await read(playerPath);
  assert.match(source, /import \{ GIFT_ANIMATION_PREVIEWS \} from "@\/lib\/giftAnimationsPreviewCatalog"/);
  assert.match(source, /GIFT_ANIMATION_PREVIEWS\.find\(\(candidate\) => candidate\.id === animationId\)/);
  assert.match(source, /const Animation = item\.Component;/);
  assert.match(source, /return <Animation onComplete=\{onComplete\} \/>;/);
  // No network/purchase/Coins calls, and no SVG/CSS drawing of its own.
  assert.doesNotMatch(stripComments(source), /fetch\(|axios|\/api\/|coinsBalance|coinCost/);
});

test("the three stable animation ids resolve to the existing preview components", async () => {
  const source = await read(catalogPath);
  assert.match(source, /id: "eiffel-tower"/);
  assert.match(source, /id: "explorer-ship"/);
  assert.match(source, /id: "connected-planet"/);
  assert.match(source, /Component: EiffelTowerGiftPreview/);
  assert.match(source, /Component: ExplorerShipGiftPreview/);
  assert.match(source, /Component: ConnectedPlanetGiftPreview/);
  assert.match(source, /import EiffelTowerGiftPreview, \{/);
  assert.match(source, /from "@\/components\/gifts\/previews\/EiffelTowerGiftPreview"/);
});

/* ── 2. Commercial integration stays disabled by default ──────────────── */

test("MYL World & Beyond demo access defaults to disabled", () => {
  assert.equal(resolveMylWorldBeyondDemoAccess({ demoFlag: undefined }), false);
  assert.equal(resolveMylWorldBeyondDemoAccess({ demoFlag: "false" }), false);
  assert.equal(resolveMylWorldBeyondDemoAccess({ demoFlag: "" }), false);
  assert.equal(resolveMylWorldBeyondDemoAccess({ demoFlag: "true" }), true);
  assert.equal(resolveMylWorldBeyondDemoAccess({ demoFlag: "TRUE" }), true);
});

test("Vercel Production: demo stays disabled even with the opt-in flag set to true", () => {
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: "true", vercelEnv: "production" }),
    false
  );
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: "TRUE", vercelEnv: "production" }),
    false
  );
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: undefined, vercelEnv: "production" }),
    false
  );
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: "false", vercelEnv: "production" }),
    false
  );
});

test("Vercel Preview: demo renders only when the opt-in flag is explicitly true", () => {
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: "true", vercelEnv: "preview" }),
    true
  );
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: undefined, vercelEnv: "preview" }),
    false
  );
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: "false", vercelEnv: "preview" }),
    false
  );
});

test("Development / non-Vercel builds: demo renders only when the opt-in flag is explicitly true", () => {
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: "true", vercelEnv: "development" }),
    true
  );
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: undefined, vercelEnv: "development" }),
    false
  );
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: "true", vercelEnv: undefined }),
    true
  );
  assert.equal(
    resolveMylWorldBeyondDemoAccess({ demoFlag: undefined, vercelEnv: undefined }),
    false
  );
});

test("isMylWorldBeyondDemoEnabled reads from process.env and defaults OFF", () => {
  const original = process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED;
  try {
    delete process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED;
    assert.equal(isMylWorldBeyondDemoEnabled(), false);
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED = original;
    }
  }
});

test("isMylWorldBeyondDemoEnabled stays OFF on real Vercel Production even with the flag set live", () => {
  const originalFlag = process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED;
  const originalVercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  try {
    process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED = "true";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    assert.equal(isMylWorldBeyondDemoEnabled(), false);
  } finally {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_MYL_WORLD_BEYOND_DEMO_ENABLED = originalFlag;
    }
    if (originalVercelEnv === undefined) {
      delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    } else {
      process.env.NEXT_PUBLIC_VERCEL_ENV = originalVercelEnv;
    }
  }
});

test("the access module never references the real gift/Coins/send flow", async () => {
  const source = await read(accessPath);
  assert.doesNotMatch(stripComments(source), /fetch\(|axios|\/api\/|coinsBalance|coinCost|Stripe/);
});

/* ── 3. Isolated, additive wiring in the Live room ────────────────────── */

test("the demo player is additive: no network/queue/Coins calls of its own in the Live room", async () => {
  const source = await read(livePagePath);
  const block = source.slice(
    source.indexOf("MYL World & Beyond — isolated visual demo player"),
    source.indexOf("Entry join animation")
  );
  assert.ok(block.length > 0);
  assert.match(block, /<MylWorldBeyondPlayer/);
  assert.match(block, /animationId=\{mylDemoAnimation\.id\}/);
  assert.match(block, /onComplete=\{\(\) => setMylDemoAnimation\(null\)\}/);
  // Never touches the real gift queue, Socket.io, or the send endpoint.
  assert.doesNotMatch(block, /addGiftToQueue|giftQueue|socket\.|\/api\/gifts\/send|coinsBalance/);
});

test("the demo player overlay never blocks pointer interactions with the stage", async () => {
  const source = await read(livePagePath);
  const rule = source.match(/\.myl-world-beyond-demo-player \{([^}]+)\}/)?.[1];
  assert.ok(rule, "expected a .myl-world-beyond-demo-player CSS rule");
  assert.match(rule, /pointer-events: none;/);
});

test("the demo trigger is creator-only and gated behind isMylWorldBeyondDemoEnabled (default OFF)", async () => {
  const source = await read(livePagePath);
  assert.match(
    source,
    /import \{ isMylWorldBeyondDemoEnabled \} from "@\/lib\/mylWorldBeyondAccess";/
  );
  assert.match(source, /const mylDemoEnabled = isMylWorldBeyondDemoEnabled\(\);/);
  assert.match(source, /\{isCreator && mylDemoEnabled && \(/);
});

test("the demo panel never calls the real gift send endpoint or decrements Coins", async () => {
  const source = await read(livePagePath);
  const panelStart = source.indexOf("{showMylDemoPanel && (");
  const panelEnd = source.indexOf("End-stream confirmation dialog", panelStart);
  const panel = source.slice(panelStart, panelEnd);
  assert.ok(panel.length > 0);
  assert.doesNotMatch(stripComments(panel), /\/api\/gifts\/send|fetch\(|coinsBalance|coinCost|setCoinBalance|addGiftToQueue|socket\./);
  assert.match(panel, /setMylDemoAnimation\(\{ id: item\.id, key: `\$\{item\.id\}_\$\{Date\.now\(\)\}` \}\)/);
  assert.match(panel, /GIFT_ANIMATION_PREVIEWS\.map\(\(item\) => \(/);
});

test("existing gift handlers, Socket.io listeners and the real gift queue are untouched", async () => {
  const source = await read(livePagePath);
  // The real send/queue/Socket.io plumbing from before this change is
  // still present and unchanged in shape.
  assert.match(source, /const addGiftToQueue = useCallback\(\(giftData\) => \{/);
  assert.match(source, /socket\.on\("LIVE_GIFT_SENT", onLiveGiftSent\);/);
  assert.match(source, /socket\.off\("LIVE_GIFT_SENT", onLiveGiftSent\);/);
  assert.match(source, /setGiftQueue\(\(prev\) => \[\.\.\.prev, queueItem\]\);/);
});
