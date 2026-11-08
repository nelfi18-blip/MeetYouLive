import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import rules from "../../backend/src/lib/vcrWorldRules.cjs";
import { createPhotoWorldAdapter } from "../lib/vcr/photoWorldAdapter.js";
import { WORLD_PHOTO_SCENES, getPhotoScene } from "../lib/vcr/photoWorldScenes.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("World's official route uses photography and does not start WebGL", async () => {
  const page = await source("app/vcr/page.jsx");
  assert.match(page, /import PhotoWorld from/);
  assert.match(page, /<PhotoWorld \/>/);
  assert.doesNotMatch(page, /<VcrWorld \/>/);
  const component = await source("components/vcr/PhotoWorld.jsx");
  assert.doesNotMatch(component, /createAvatar|createVcrDistrict|import\("three"\)/);
  assert.match(component, /getPhotoScene\(country\)/);
  assert.match(component, /createVcrPresence/);
  assert.match(component, /getPrimaryProfileImage/);
});

test("every World destination has a credited real photograph with explicit license", () => {
  assert.deepEqual(Object.keys(WORLD_PHOTO_SCENES), Object.keys(rules.DESTINATIONS));
  for (const id of Object.keys(WORLD_PHOTO_SCENES)) {
    const record = getPhotoScene(id);
    assert.ok(record.file.endsWith(".jpg"));
    assert.ok(record.author?.length > 2);
    assert.match(record.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(record.imageUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
    assert.match(record.licenseUrl, /^https:\/\/creativecommons\.org\/licenses\//);
  }
});

test("non-WebGL photo World uses existing authoritative virtual protocol", () => {
  const events = [];
  const world = createPhotoWorldAdapter({ onZoneChange: (id) => events.push(id) });
  assert.equal(world.inspect().country, "us");
  assert.equal(world.teleport("coast"), true);
  assert.deepEqual(world.getPosition(), { ...rules.zones.coast, yaw: 0 });
  assert.equal(world.teleport("made-up"), false);
  assert.equal(world.travelCountry("fr"), true);
  assert.deepEqual(world.getPosition(), { x: 0, z: 0, yaw: 0 });
  assert.equal(world.setPosition({ x: 1000, z: 1000 }), false);
  assert.deepEqual(events, ["coast", "central"]);
});

test("photo consent is explicit; WebSocket carries only the consent bit", async () => {
  const component = await source("components/vcr/PhotoWorld.jsx");
  const backend = await source("../backend/src/lib/vcrWorld.js");
  const presence = await source("lib/vcr/presence.js");
  assert.match(component, /type="checkbox" checked={sharePhoto}/);
  assert.match(component, /presenceRef\.current\?\.join\(country, "violet", sharePhoto\)/);
  assert.match(component, /peer\.photoConsent === true/);
  assert.match(component, /\/api\/user\/\$\{encodeURIComponent\(peer.userId\)\}\/public/);
  assert.match(component, /setSharePhoto\(false\)/);
  assert.match(presence, /consentToSharePublicPhoto === true/);
  assert.match(backend, /photoConsent: member\.sharePhoto === true/);
  assert.match(backend, /photoSignature\(profile\) !== member\.photoFingerprint/);
  assert.doesNotMatch(backend, /photoUrl: member|photoBase64|selfieUrl/);
});

test("ES/EN/PT have equivalent photo World consent and accuracy copy", async () => {
  const messages = await Promise.all(["es", "en", "pt"].map(async (lang) =>
    JSON.parse(await source(`messages/${lang}.json`))));
  const keys = Object.keys(messages[0].worldPhoto).sort();
  for (const dict of messages) {
    assert.deepEqual(Object.keys(dict.worldPhoto).sort(), keys);
    for (const key of ["photoConsent", "notAiYet", "notLive", "identityActual", "serverNotice"]) {
      assert.ok(dict.worldPhoto[key]?.length > 16, key);
    }
  }
});
