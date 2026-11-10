import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Dashboard renders graphic, actionable states only when source reports no results", async () => {
  const page = await source("app/dashboard/page.jsx");
  assert.match(page, /livesLoading[\s\S]*?activeLives\.length > 0[\s\S]*?home-empty-card home-empty-live/);
  assert.match(page, /socialLoading[\s\S]*?hasSocialConnections[\s\S]*?home-empty-card home-empty-connections/);
  assert.match(page, /t\(livesError \? "dashboard\.emptyDataHint" : "dashboard\.emptyLiveHint"\)/);
  assert.match(page, /t\(socialHasPartialError \? "dashboard\.emptyDataHint" : "dashboard\.emptyConnectionsHint"\)/);
  assert.match(page, /href="\/live" className="home-empty-action"/);
  assert.match(page, /href="\/explore" className="home-empty-action"/);
  assert.match(page, /className="home-empty-art" aria-hidden="true"/);
  assert.match(page, /prefers-reduced-motion: reduce/);
});

test("Dashboard never fabricates profiles, lives or Coins to decorate empty states", async () => {
  const page = await source("app/dashboard/page.jsx");
  assert.match(page, /fetch\(\`\$\{API_URL\}\/api\/lives\`/);
  assert.match(page, /getJson\("\/api\/matches"\)/);
  assert.match(page, /user\?\.coins \?\? 0/);
  assert.doesNotMatch(page, /Math\.random\(|fakeLive|fakeMatch|mockUsers|placeholderUsers/);
});

test("Real-data visuals are translated in Spanish, English and Portuguese", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await source(`messages/${lang}.json`));
    for (const key of ["emptyLiveHint", "emptyConnectionsHint", "emptyDataHint", "openLiveSection", "discoverProfiles"]) {
      assert.ok(typeof messages.dashboard[key] === "string" && messages.dashboard[key].length > 7, `${lang}:${key}`);
    }
  }
});
