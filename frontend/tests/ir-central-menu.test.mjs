import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getUniverseAccountLinks } from "../lib/universeAccountNavigation.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nav = () => readFile(join(root, "components/BottomNavEnhanced.jsx"), "utf8");

test("center World is a real destination instead of the legacy IR popover", async () => {
  const source = await nav();
  assert.match(source, /<Link\s+href="\/universe"\s+className="nav-item-create nav-world-entry"/);
  assert.match(source, /data-world-center="true"/);
  assert.match(source, /aria-label=\{worldAria\}/);
  assert.match(source, /className="nav-world-globe"/);
  assert.match(source, /className="create-live-label nav-world-label"/);
  assert.match(source, /worldLabel = lang === "en" \? "World" : "Mundo"/);
  assert.doesNotMatch(source, /showCreateMenu|toggleCreateMenu|ir-menu-panel|create-menu-backdrop/);
  assert.equal((source.match(/href="\/universe"/g) || []).length, 1);
});

test("world control is visually distinct, animated, tactile and accessible", async () => {
  const css = await readFile(join(root, "app/globals.css"), "utf8");
  for (const name of [".nav-world-entry", ".nav-world-globe", ".nav-world-label",
    "navWorldGlow", "navWorldFloat", "navWorldRotate"]) assert.ok(css.includes(name), name);
  assert.match(css, /\.nav-world-entry:active/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.nav-world-globe svg \{[\s\S]*?animation: navWorldRotate 24s/);
});

test("role-aware Home, Discover, Chats and Profile remain unchanged", async () => {
  const source = await nav();
  for (const expr of ['href={homePath}', 'href="/feed"', 'href="/chats"', 'href="/profile"']) {
    assert.ok(source.includes(expr), expr);
  }
  assert.match(source, /isApprovedCreator\(\{ role: viewerRole, creatorStatus: viewerCreatorStatus \}\)/);
});

test("formerly available IR destinations remain reachable from the world and its menu", async () => {
  const scene = await readFile(join(root, "components/ExploreCarousel3D.jsx"), "utf8");
  const links = getUniverseAccountLinks({ role: "user" }, { authenticated: true });
  const creator = getUniverseAccountLinks({ role: "creator", creatorStatus: "approved" }, { authenticated: true });
  for (const route of ["/calls", "/matches", "/coins"]) {
    assert.ok(links.some(x => x.href === route), route);
  }
  for (const route of ["/creator", "/live/start"]) {
    assert.ok(creator.some(x => x.href === route), route);
  }
  for (const route of ["/live", "/random"]) {
    assert.ok(scene.includes('route: "' + route + '"'), route);
  }
  for (const route of ["calls", "matches", "coins", "live", "live/start", "random"]) {
    assert.ok(existsSync(join(root, "app", route, "page.jsx")), route);
  }
});
