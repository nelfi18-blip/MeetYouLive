import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VCR_DISTRICTS, VCR_OUTFITS, isWalkable } from "../lib/vcr/districtWorld.js";
import { isProtectedRoutePath } from "../lib/publicAccess.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("VCR is a dedicated protected module, not call history or public landing", async () => {
  assert.equal(isProtectedRoutePath("/vcr"), true);
  assert.equal(isProtectedRoutePath("/vcr/room/example"), true);
  assert.ok(existsSync(join(root, "app/vcr/page.jsx")));
  const nav = await readFile(join(root, "components/BottomNavEnhanced.jsx"), "utf8");
  assert.match(nav, /id: "vcr"[\s\S]*?href: "\/vcr"/);
  assert.doesNotMatch(nav, /id: "vcr"[\s\S]*?href: "\/calls"/);
});

test("world is actual three-dimensional WebGL with original walking controls", async () => {
  const source = await readFile(join(root, "lib/vcr/districtWorld.js"), "utf8");
  assert.match(source, /new THREE\.WebGLRenderer\(/);
  assert.match(source, /new THREE\.PerspectiveCamera\(/);
  assert.match(source, /new THREE\.BoxGeometry\(/);
  assert.match(source, /new THREE\.CanvasTexture\(/);
  assert.match(source, /requestAnimationFrame\(frame\)/);
  assert.match(source, /window\.addEventListener\("keydown"/);
  assert.match(source, /canvas\.addEventListener\("pointermove"/);
  assert.match(source, /renderer\.dispose\(\)/);
  assert.doesNotMatch(source, /\b(Agora|Stripe|LivePip|socket\.io)\b/);
});

test("four navigable districts have distinct spawn positions and no hardcoded user counts", async () => {
  assert.deepEqual(VCR_DISTRICTS.map((d) => d.id), ["central", "neon", "coast", "park"]);
  assert.equal(new Set(VCR_DISTRICTS.map((d) => d.x + ":" + d.z)).size, 4);
  for (const pos of VCR_DISTRICTS) assert.equal(isWalkable(pos.x, pos.z, []), true);
  assert.equal(isWalkable(0, 0, [{ x: 0, z: 0, w: 14, d: 18 }]), false);
  assert.equal(isWalkable(NaN, 0, []), false);
  assert.equal(isWalkable(500, 0, []), false);
  assert.deepEqual(Object.keys(VCR_OUTFITS).sort(), ["cyan", "pink", "violet"]);
});

test("3D loads on mount, disposes renderer and avoids monetization or fake AI features", async () => {
  const source = await readFile(join(root, "components/vcr/VcrWorld.jsx"), "utf8");
  assert.match(source, /import\("three"\)/);
  assert.match(source, /worldRef\.current\?\.dispose\(\)/);
  assert.match(source, /onPointerDown=/);
  assert.match(source, /onPointerCancel=/);
  assert.match(source, /aria-pressed=\{outfit === color\.id\}/);
  assert.doesNotMatch(source, /Stripe|billing|purchase|fakeOnlineCount|generateAvatar/);
});

test("VCR copy parity and honest solo preview in ES EN PT", async () => {
  const dictionaries = await Promise.all(["es", "en", "pt"].map(async (lang) => {
    return JSON.parse(await readFile(join(root, "messages", lang + ".json"), "utf8"));
  }));
  const keys = (obj, prefix = "") => Object.keys(obj).flatMap((key) => {
    const value = obj[key];
    return value && typeof value === "object"
      ? keys(value, prefix + key + ".")
      : [prefix + key];
  }).sort();
  for (const dict of dictionaries) {
    assert.deepEqual(keys(dict.vcrWorld), keys(dictionaries[0].vcrWorld));
    assert.ok(dict.nav.irMenu.vcrDesc);
    assert.ok(dict.vcrWorld.notice.length > 60);
    assert.ok(dict.vcrWorld.status);
  }
});
