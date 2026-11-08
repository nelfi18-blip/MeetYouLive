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


test("World accepts an optional whole-body image only as a local preview", async () => {
  const { validateWorldBodyReference, WORLD_BODY_REFERENCE_MAX_BYTES } = await import("../lib/vcr/fullBodyPhoto.js");
  assert.equal(validateWorldBodyReference({ type: "image/jpeg", size: 5000 }), null);
  assert.equal(validateWorldBodyReference({ type: "image/png", size: 9000 }), null);
  assert.equal(validateWorldBodyReference({ type: "image/webp", size: WORLD_BODY_REFERENCE_MAX_BYTES }), null);
  assert.equal(validateWorldBodyReference({ type: "image/heic", size: 8000 }), "invalidType");
  assert.equal(validateWorldBodyReference({ type: "text/html", size: 5000 }), "invalidType");
  assert.equal(validateWorldBodyReference({ type: "image/jpeg", size: WORLD_BODY_REFERENCE_MAX_BYTES + 1 }), "invalidSize");
  assert.equal(validateWorldBodyReference({ type: "image/jpeg", size: 0 }), "invalidSize");
  assert.equal(validateWorldBodyReference(null), "missing");

  const component = await source("components/vcr/PhotoWorld.jsx");
  const css = await source("components/vcr/PhotoWorld.module.css");
  assert.match(component, /type="file"/);
  assert.match(component, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(component, /URL\.createObjectURL\(file\)/);
  assert.match(component, /URL\.revokeObjectURL\(bodyUrlRef\.current\)/);
  assert.match(component, /type="button" onClick={removeBodyReference}/);
  assert.match(component, /getPrimaryProfileImage\(profile\)/);
  assert.match(css, /\.bodyPreview img\{[^}]*object-fit:contain/);
  const picker = component.slice(component.indexOf("const chooseBodyReference"), component.indexOf("// Reuse the existing backend JWT"));
  assert.doesNotMatch(picker, /fetch\(|FormData|socket\.emit|\.upload\(|generateImage|aiProvider/);
});

test("world full-body reference guidance is translated and states no upload or AI", async () => {
  const messages = await Promise.all(["es", "en", "pt"].map(async (lang) =>
    JSON.parse(await source(`messages/${lang}.json`))));
  const keys = Object.keys(messages[0].worldPhoto).sort();
  for (const dictionary of messages) {
    assert.deepEqual(Object.keys(dictionary.worldPhoto).sort(), keys);
    for (const key of ["bodyTitle", "bodyDescription", "bodyChoose", "bodyPreviewAlt",
      "bodyRemove", "bodyInvalidFormat", "bodyInvalidSize", "bodyPrivacy"]) {
      assert.ok(dictionary.worldPhoto[key]?.length >= 8, key);
    }
  }
});


test("clothing styles may change appearance of garments only, never the person's body", async () => {
  const { WORLD_CLOTHING_STYLES, WORLD_IDENTITY_INTEGRITY, chooseWorldClothingStyle } =
    await import("../lib/vcr/stylePreferences.js");
  assert.deepEqual(WORLD_CLOTHING_STYLES, ["original", "casual", "elegant", "sport", "urban"]);
  assert.equal(chooseWorldClothingStyle("sport"), "sport");
  assert.equal(chooseWorldClothingStyle("unknown"), "original");
  assert.equal(WORLD_IDENTITY_INTEGRITY.preserveFace, true);
  assert.equal(WORLD_IDENTITY_INTEGRITY.preserveBodyProportions, true);
  assert.equal(WORLD_IDENTITY_INTEGRITY.preserveSkinTone, true);
  assert.equal(WORLD_IDENTITY_INTEGRITY.preserveApparentAge, true);
  assert.equal(WORLD_IDENTITY_INTEGRITY.allowBodyReshaping, false);
  assert.equal(WORLD_IDENTITY_INTEGRITY.allowFaceReshaping, false);
  assert.equal(WORLD_IDENTITY_INTEGRITY.requireOwnerApproval, true);
  assert.equal(WORLD_IDENTITY_INTEGRITY.discloseAIGeneration, true);
  const ui = await source("components/vcr/PhotoWorld.jsx");
  assert.match(ui, /WORLD_CLOTHING_STYLES\.map\(/);
  assert.match(ui, /setClothingStyle\(chooseWorldClothingStyle\(style\)\)/);
  assert.match(ui, /t\("worldPhoto.bodyIntegrity"\)/);
  assert.match(ui, /t\("worldPhoto.styleNotRendered"\)/);
  const selectedStyle = ui.slice(ui.indexOf("const [clothingStyle"), ui.indexOf("// A full-length reference"));
  assert.doesNotMatch(selectedStyle, /fetch\(|FormData|socket\.emit|upload\(|generateImage/);
});

test("ES EN PT clothing style and true-body policy parity", async () => {
  const dictionaries = await Promise.all(["es", "en", "pt"].map(async lang =>
    JSON.parse(await source(`messages/${lang}.json`))));
  const styleIds = ["original", "casual", "elegant", "sport", "urban"];
  for (const dictionary of dictionaries) {
    for (const key of ["styleTitle", "styleDescription", "styleNotRendered", "bodyIntegrity"]) {
      assert.ok(dictionary.worldPhoto[key]?.length >= 14, key);
    }
    assert.deepEqual(Object.keys(dictionary.worldPhoto.style).sort(), [...styleIds].sort());
  }
});
