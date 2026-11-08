import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Profile lets users search another country without rewriting GPS", async () => {
  const profile = await readFile(new URL("../app/profile/page.jsx", import.meta.url), "utf8");
  assert.ok(profile.includes('id="profile-search-country"'));
  assert.ok(profile.includes("COUNTRIES.map("));
  assert.ok(profile.includes('discoverySearchCountry: e.target.value, discoverySearchCity: "", discoverySearchRegion: "", discoveryScope: "country"'));
  assert.ok(profile.includes('searchCountry: (form.discoverySearchCountry || "").trim()'));
  assert.ok(profile.includes('lat: form.locationLat === "" ? null : Number(form.locationLat)'));
  assert.ok(profile.includes('lng: form.locationLng === "" ? null : Number(form.locationLng)'));
  assert.ok(profile.includes("navigator.geolocation.getCurrentPosition("));
  assert.ok(profile.includes('discoveryScope: "nearby"'));
});

test("Manual country labels are translated across all languages", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await readFile(new URL(`../messages/${lang}.json`, import.meta.url), "utf8"));
    for (const key of ["searchCountryLabel", "searchCountryDefault", "searchCountryHelp"]) {
      assert.ok(messages.profile[key], `${lang}: ${key}`);
    }
  }
});
