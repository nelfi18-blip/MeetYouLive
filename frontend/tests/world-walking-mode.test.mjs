import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import rules from "../../backend/src/lib/vcrWorldRules.cjs";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("World entry now opens the preserved actual movement engine, not a fake panorama walk", async () => {
  const page = await source("app/vcr/page.jsx");
  const photo = await source("components/vcr/PhotoWorld.jsx");
  const walk = await source("components/vcr/WalkableWorld.jsx");
  assert.match(page, /<PhotoWorld onEnterWalk=\{setWalkSession\}/);
  assert.match(page, /<WalkableWorld \{\.\.\.walkSession\}/);
  assert.match(page, /<div hidden=\{Boolean\(walkSession\)\}>/);
  assert.match(photo, /if \(onEnterWalk\) onEnterWalk\(\{ initialCountry: country, initialToken: activeToken, sharePhoto \}\)/);
  assert.match(photo, /onClick=\{enterWorld\}/);
  assert.match(walk, /module\.createVcrDistrict\(THREE, canvasRef\.current, \{/);
  assert.match(walk, /firstPerson: true/);
  assert.match(walk, /session\.join\(initialCountry, "violet", sharePhoto\)/);
  assert.match(walk, /onExit\?\.\(\)/);
  assert.doesNotMatch(walk, /URL\.createObjectURL|bodyPreview|localPhoto|upload\(|generateImage/);
});

test("motor has real frame-to-frame walking and a first-person camera without inventing a body", async () => {
  const engine = await source("lib/vcr/districtWorld.js");
  assert.match(engine, /position = rules\.step\(country, position, \{ \.\.\.keys, yaw \}, dt\)/);
  assert.match(engine, /avatar\.root\.visible = !firstPerson/);
  assert.match(engine, /camera\.position\.set\(position\.x, eyeHeight, position\.z\)/);
  assert.match(engine, /camera\.lookAt\(position\.x - Math\.sin\(yaw\)/);
  assert.match(engine, /inputEnabled = !firstPerson/);
  assert.match(engine, /function setInputEnabled\(enabled\)/);
  assert.match(engine, /keys\[name\] = inputEnabled && Boolean\(enabled\)/);
  const start = { x: 0, z: 0, yaw: 0 };
  assert.equal(rules.walkable("us", start.x, start.z), true);
  const moved = rules.step("us", start, { forward: true, yaw: 0 }, .05);
  assert.ok(moved.z < start.z, "walking actually changes the position");
  assert.ok(moved.moving);
  assert.equal(rules.walkable("us", 0, -58), false, "colliders still block entering buildings");
});

test("controls require authenticated online presence, and disconnect disables movement", async () => {
  const component = await source("components/vcr/WalkableWorld.jsx");
  const adapter = await source("lib/vcr/presence.js");
  assert.match(component, /world\.setInputEnabled\(state === "online"\)/);
  assert.match(component, /if \(presence !== "online" \|\| renderStatus !== "ready"\)/);
  assert.match(component, /disabled=\{renderStatus !== "ready" \|\| presence !== "online"\}/);
  assert.match(component, /onPointerDown=\{\(event\) => \{/);
  assert.match(component, /onPointerCancel=\{\(\) => move\(direction, false\)\}/);
  assert.match(component, /onLostPointerCapture=\{\(\) => move\(direction, false\)\}/);
  assert.match(component, /onBlur=\{\(\) => move\(direction, false\)\}/);
  assert.match(adapter, /world\.stopMoving\(\)/);
  assert.match(component, /presenceRef\.current\?\.close\(\)/);
  assert.match(component, /worldRef\.current\?\.dispose\(\)/);
  assert.doesNotMatch(component, /meetyoulive\.onrender\.com|stripe|agora|apple/i);
});

test("walkable pilot is labeled as temporary and localized in ES EN PT", async () => {
  const langs = await Promise.all(["es", "en", "pt"].map(async (lang) =>
    JSON.parse(await source("messages/" + lang + ".json"))));
  const required = ["walkingMode", "walkingScene", "backToPhotos", "walkingConnectionError",
    "walkingConnecting", "walkingPrototypeNotice", "walkingHint"];
  for (const lang of langs) {
    for (const key of required) assert.ok(lang.worldPhoto[key]?.length > 10, key);
  }
  const keys = langs.map((item) => Object.keys(item.worldPhoto).sort().join("|"));
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[1], keys[2]);
});
