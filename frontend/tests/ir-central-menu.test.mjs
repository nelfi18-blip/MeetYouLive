import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "..");
const bottomNavPath = join(frontendDir, "components/BottomNavEnhanced.jsx");
const globalsCssPath = join(frontendDir, "app/globals.css");
const LANGS = ["es", "en", "pt"];
const IR_MENU_KEYS = [
  "eyebrow",
  "title",
  "subtitle",
  "close",
  "liveRoomsDesc",
  "startLiveDesc",
  "randomDesc",
  "vcr",
  "vcrDesc",
  "matchesDesc",
  "earningsDesc",
  "coinsGiftsDesc",
];

const readSource = () => readFile(bottomNavPath, "utf8");

test("IR menu exposes the five options in order", async () => {
  const source = await readSource();
  const ids = [...source.matchAll(/^\s{6}id: "([a-z]+)",$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ["live", "random", "vcr", "matches", "coins"]);
});

test("IR menu reuses existing routes and keeps role rules", async () => {
  const source = await readSource();
  assert.match(source, /const primaryLiveHref = canGoLive \? "\/live\/start" : "\/live";/);
  assert.match(source, /href: primaryLiveHref,/);
  assert.match(source, /href: "\/random",/);
  assert.match(source, /href: "\/calls",/);
  assert.match(source, /href: canGoLive \? "\/creator#earnings" : "\/matches",/);
  assert.match(source, /href: "\/coins",/);
  assert.match(source, /isApprovedCreator\(\{ role: viewerRole, creatorStatus: viewerCreatorStatus \}\)/);

  for (const route of ["random", "calls", "matches", "coins", "live", "live/start"]) {
    assert.ok(existsSync(join(frontendDir, "app", route, "page.jsx")), `/${route} page must exist`);
  }
});

test("IR menu has no hardcoded visible labels", async () => {
  const source = await readSource();
  assert.doesNotMatch(source, /"Ganancias"/);
  assert.doesNotMatch(source, /label: "Matches"/);
  for (const key of IR_MENU_KEYS) {
    assert.match(source, new RegExp(`t\\("nav\\.irMenu\\.${key}"\\)`), `nav.irMenu.${key} must be used`);
  }
});

test("IR menu translations exist in es/en/pt with key parity", async () => {
  for (const lang of LANGS) {
    const messages = JSON.parse(await readFile(join(frontendDir, "messages", `${lang}.json`), "utf8"));
    const irMenu = messages.nav?.irMenu;
    assert.ok(irMenu, `${lang}.json must define nav.irMenu`);
    assert.deepEqual(Object.keys(irMenu).sort(), [...IR_MENU_KEYS].sort(), `${lang}.json nav.irMenu keys`);
    for (const key of IR_MENU_KEYS) {
      assert.equal(typeof irMenu[key], "string");
      assert.ok(irMenu[key].trim().length > 0, `${lang}.json nav.irMenu.${key} must not be empty`);
    }
    for (const key of ["startLive", "liveRooms", "random", "matches", "coinsGifts"]) {
      assert.ok(messages.nav[key], `${lang}.json nav.${key} must exist`);
    }
    assert.ok(messages.navbar?.earnings, `${lang}.json navbar.earnings must exist`);
  }
});

test("IR button toggles a dialog panel with backdrop, close button and Escape", async () => {
  const source = await readSource();
  assert.match(source, /onClick=\{toggleCreateMenu\}/);
  assert.match(source, /aria-expanded=\{showCreateMenu\}/);
  assert.match(source, /className="create-menu-backdrop"[\s\S]*?onClick=\{closeCreateMenu\}/);
  assert.match(source, /className="create-menu-close"\s+onClick=\{closeCreateMenu\}/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /event\.key === "Escape"/);
  // Still exactly one central IR button.
  assert.equal((source.match(/className=\{`nav-item-create /g) || []).length, 1);
});

test("IR panel is scrollable, safe-area aware and never overflows horizontally", async () => {
  const css = await readFile(globalsCssPath, "utf8");
  const block = css.match(/\n\.create-menu \{([\s\S]*?)\n\}/);
  assert.ok(block, ".create-menu rule must exist");
  const rule = block[1];
  assert.match(rule, /overflow-y: auto;/);
  assert.match(rule, /overflow-x: hidden;/);
  assert.match(rule, /max-height: calc\(100dvh/);
  assert.match(rule, /env\(safe-area-inset-bottom\)/);
  assert.match(rule, /env\(safe-area-inset-top\)/);
  assert.match(rule, /max-width: 420px;/);
  assert.doesNotMatch(rule, /min-width/);
});
