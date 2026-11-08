import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = async (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("Settings links to dedicated location page, never to an unrelated profile edit", async () => {
  const settings = await readSource("../app/settings/page.jsx");
  assert.ok(settings.includes('href: "/settings/location"'));
  const location = await readSource("../app/settings/location/page.jsx");
  assert.ok(location.includes('href="/settings"'));
  assert.ok(location.includes('styles from "./page.module.css"'));
  assert.ok(location.includes('SCOPES = ["nearby", "country", "global"]'));
});

test("manual destination saves only discovery preferences, never physical GPS", async () => {
  const page = await readSource("../app/settings/location/page.jsx");
  const start = page.indexOf("const savePreferences = async");
  const end = page.indexOf("const useCurrentGps = async");
  const saveOnly = page.slice(start, end);
  assert.ok(saveOnly.includes("searchCountry: form.country"));
  assert.ok(saveOnly.includes("searchCity: form.city"));
  assert.ok(saveOnly.includes("searchRegion: form.region"));
  assert.ok(saveOnly.includes("discoveryScope: form.scope"));
  assert.ok(!saveOnly.includes("locationPoint"));
  assert.ok(!saveOnly.includes("location, locationLabel"));
  assert.ok(page.includes('country: e.target.value, city: "", region: ""'));
});

test("GPS only requests foreground coordinates after user action", async () => {
  const page = await readSource("../app/settings/location/page.jsx");
  assert.ok(page.includes("navigator.geolocation.getCurrentPosition(resolve, reject"));
  assert.ok(page.includes("maximumAge: 0"));
  assert.ok(page.includes("resolveAndroidGpsPlace(coords)"));
  assert.ok(page.includes('disabled={locating || saving || !token}'));
  assert.ok(page.includes('err?.code === 1'));
  assert.ok(page.includes("setHasGps(true)"));
});

test("same preferences survive Profile editing and city change resets old city", async () => {
  const profile = await readSource("../app/profile/page.jsx");
  assert.ok(profile.includes("discoverySearchCity: preferences.searchCity ||"));
  assert.ok(profile.includes("discoverySearchRegion: preferences.searchRegion ||"));
  assert.ok(profile.includes('searchCity: (form.discoverySearchCity || "").trim()'));
  assert.ok(profile.includes('searchRegion: (form.discoverySearchRegion || "").trim()'));
  assert.ok(profile.includes('discoverySearchCity: "", discoverySearchRegion: "", discoveryScope: "country"'));
});

test("the location page has complete ES/EN/PT translations", async () => {
  const page = await readSource("../app/settings/location/page.jsx");
  const keys = [...page.matchAll(/settingsLocation\.([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]);
  for (const lang of ["es", "en", "pt"]) {
    const json = JSON.parse(await readSource(`../messages/${lang}.json`));
    for (const key of keys) {
      assert.ok(json.settingsLocation[key], `${lang} missing settingsLocation.${key}`);
    }
    assert.ok(json.settingsLocation.nearbyHint, `${lang} missing nearbyHint`);
    assert.ok(json.settingsLocation.countryHint, `${lang} missing countryHint`);
    assert.ok(json.settingsLocation.globalHint, `${lang} missing globalHint`);
  }
});
