import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import rules from "../../backend/src/lib/vcrWorldRules.cjs";
import { VCR_DISTRICTS, isWalkable, cameraOrbit } from "../lib/vcr/districtWorld.js";
import { VCR_COUNTRIES, findVcrCountry } from "../lib/vcr/countries.js";
import { buildDestination } from "../lib/vcr/destinationScene.js";
import { isProtectedRoutePath } from "../lib/publicAccess.js";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("VCR remains a dedicated protected module", async () => {
  assert.equal(isProtectedRoutePath("/vcr"), true);
  assert.match(await source("components/BottomNavEnhanced.jsx"), /id: "vcr"[\s\S]*?href: "\/vcr"/);
});
test("walking is frame bounded, normalized and rejects collision/invalid positions", () => {
  const straight = rules.step("us", { x: 0, z: 0 }, { forward: true, yaw: 0 }, 0.05);
  const diagonal = rules.step("us", { x: 0, z: 0 }, { forward: true, right: true, yaw: 0 }, 0.05);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - Math.abs(straight.z)) < 0.0001);
  assert.deepEqual(rules.step("us", { x: 0, z: 0 }, { forward: true, yaw: 0 }, 100), straight);
  assert.equal(rules.walkable("us", 24, 0), false);
  assert.equal(rules.walkable("us", NaN, 0), false);
  assert.equal(isWalkable(500, 0, []), false);
  assert.equal(rules.validPosition("us", { x: 40, z: 40, yaw: 0 }, { x: 0, z: 0 }, 1), false);
});
test("backward input and third-person camera are deterministic and pitch bounded", () => {
  assert.ok(rules.step("us", { x: 0, z: 0 }, { backward: true, yaw: 0 }, 0.05).z > 0);
  const a = cameraOrbit(0, 0.38), b = cameraOrbit(Math.PI / 2, 0.38);
  assert.ok(a.z > 0 && a.y > 0); assert.ok(Math.abs(a.x) < 0.001);
  assert.ok(b.x > 0 && Math.abs(b.z) < 0.001);
  assert.ok(cameraOrbit(0, -100).y > 0); assert.ok(cameraOrbit(0, 100).y < 8);
});
test("all country catalogs and fast-travel areas match authoritative physics", () => {
  assert.deepEqual(VCR_COUNTRIES.map((c) => c.id), Object.keys(rules.DESTINATIONS));
  assert.equal(new Set(Object.values(rules.DESTINATIONS).map((d) => d.theme)).size, 6);
  assert.equal(findVcrCountry("invalid"), null);
  for (const country of VCR_COUNTRIES) for (const zone of VCR_DISTRICTS) assert.equal(rules.walkable(country.id, zone.x, zone.z), true, `${country.id}/${zone.id}`);
});
test("six countries construct different geometry and dispose owned GPU resources", () => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  try {
    const signatures = new Set();
    for (const country of VCR_COUNTRIES) {
      const scene = new THREE.Scene(), world = buildDestination(THREE, scene, country.id, true), shapes = [];
      let count = 0, disposed = 0;
      world.root.traverse((obj) => { if (obj.geometry) { count += 1; shapes.push([obj.geometry.type, obj.geometry.parameters]); obj.geometry.addEventListener("dispose", () => { disposed += 1; }); } });
      signatures.add(JSON.stringify(shapes)); assert.ok(count > 30);
      world.dispose(); assert.equal(scene.children.length, 0); assert.equal(disposed, count);
    }
    assert.equal(signatures.size, 6);
  } finally { globalThis.document = original; }
});
test("touch controls, context loss, cleanup and opt-in are wired", async () => {
  const ui = await source("components/vcr/VcrWorld.jsx"), world = await source("lib/vcr/districtWorld.js");
  assert.match(ui, /onPointerCancel=/); assert.match(ui, /presenceRef\.current\?\.join\(country, outfit\)/);
  assert.match(ui, /presenceRef\.current\?\.close\(\)/); assert.match(world, /renderer\.dispose\(\)/);
  assert.match(world, /webglcontextlost/); assert.match(world, /key === "back" \? "backward"/);
  assert.doesNotMatch(ui, /Stripe|fakeOnlineCount|generateAvatar/);
});
test("ES EN PT copy preserves parity and distinguishes solo/online", async () => {
  const dictionaries = await Promise.all(["es", "en", "pt"].map(async (lang) => JSON.parse(await source(`messages/${lang}.json`))));
  const keys = (object) => Object.entries(object).flatMap(([key, value]) => value && typeof value === "object" ? keys(value).map((child) => key + "." + child) : [key]).sort();
  for (const dict of dictionaries) { assert.deepEqual(keys(dict.vcrWorld), keys(dictionaries[0].vcrWorld)); assert.notEqual(dict.vcrWorld.connection.solo, dict.vcrWorld.connection.online); assert.ok(dict.vcrWorld.consent); }
});
