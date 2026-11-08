import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGpsPlace } from "../lib/gpsPlace.js";
import { readFile } from "node:fs/promises";

test("GPS reverse lookup fills canonical country and real city", () => {
  const value = normalizeGpsPlace({ found: true, countryCode: "US", country: "United States", city: "Boston", region: "Massachusetts" });
  assert.deepEqual(value, { country: "Estados Unidos", city: "Boston", region: "Massachusetts" });
});

test("no geocoder result must never invent a city or country", () => {
  assert.equal(normalizeGpsPlace({ found: false, country: "United States" }), null);
  assert.equal(normalizeGpsPlace(null), null);
});

test("profile and onboarding request GPS explicitly and do not fake a city", async () => {
  for (const path of ["../app/profile/page.jsx", "../app/onboarding/page.jsx"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /navigator\.geolocation\.getCurrentPosition\(/);
    assert.match(source, /resolveAndroidGpsPlace\(coords\)/);
    assert.doesNotMatch(source, /locationCity: f\.locationCity \|\| t\("profile\.automaticLocationLabel"\)/);
  }
});

test("Android GPS plugin and foreground permission are registered without touching iOS", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [manifest,activity,plugin] = await Promise.all([
    read("../android/app/src/main/AndroidManifest.xml"),
    read("../android/app/src/main/java/com/meetyoulive/app/MainActivity.java"),
    read("../android/app/src/main/java/com/meetyoulive/app/MeetYouLiveGeocoderPlugin.java"),
  ]);
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/);
  assert.match(activity, /registerPlugin\(MeetYouLiveGeocoderPlugin\.class\)/);
  assert.match(plugin, /@CapacitorPlugin\(name = "MeetYouLiveGeocoder"\)/);
  assert.doesNotMatch(plugin, /getAddressLine\(/);
});
