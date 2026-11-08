import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Settings and initial onboarding use the location label in all three languages", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await read(`../messages/${lang}.json`));
    const expected = { es: "Ubicación", en: "Location", pt: "Localização" }[lang];
    assert.equal(messages.settingsPage.discovery, expected);
    assert.equal(messages.settingsLocation.title, expected);
    assert.ok(messages.settingsPage.discoveryDescription);
    for (const key of ["discoveryLocationTitle", "locationChoiceHelp", "nearbyGpsRequired"]) {
      assert.ok(messages.onboarding[key], `${lang} missing onboarding.${key}`);
    }
  }
});

test("onboarding places location controls with the initial profile fields", async () => {
  const code = await read("../app/onboarding/page.jsx");
  const start = code.indexOf('{t("onboarding.countryLabel")}');
  const end = code.indexOf('{/* ──────────────────────────────────────────', start);
  const profileSection = code.slice(start, end);
  assert.ok(profileSection.includes('{t("onboarding.cityLabel")}'));
  assert.ok(profileSection.includes('{t("onboarding.regionLabel")}'));
  assert.ok(profileSection.includes('{t("onboarding.discoveryLocationTitle")}'));
  assert.ok(profileSection.includes('{t("onboarding.locationChoiceHelp")}'));
  assert.ok(profileSection.includes("onClick={handleUseCurrentLocation}"));
  assert.ok(profileSection.includes('onClick={() => setDiscoveryScope("country")}'));
  assert.ok(profileSection.includes('setDiscoveryScope("global")'));
});

test("onboarding never keeps a GPS position when the user changes their city/country manually", async () => {
  const code = await read("../app/onboarding/page.jsx");
  for (const setter of ["setLocationCountry", "setLocationCity", "setLocationRegion"]) {
    assert.ok(code.includes(`${setter}(e.target.value); setLocationCoordinates({ lat: null, lng: null });`));
  }
  assert.ok(code.includes('setLocationCountry("");'));
  assert.ok(code.includes('setLocationCity("");'));
  assert.ok(code.includes('setLocationRegion("");'));
  assert.ok(code.includes('resolveAndroidGpsPlace(coords)'));
});

test("nearby cannot be activated by distance without an actual GPS point", async () => {
  const code = await read("../app/onboarding/page.jsx");
  assert.ok(code.includes("if (!Number.isFinite(locationCoordinates.lat) || !Number.isFinite(locationCoordinates.lng))"));
  assert.ok(code.includes('setError(t("onboarding.nearbyGpsRequired"))'));
  assert.ok(code.includes("navigator.geolocation.getCurrentPosition("));
  assert.ok(code.includes('setDiscoveryScope("nearby")'));
});
