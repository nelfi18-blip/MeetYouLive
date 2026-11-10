import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Discover Nearby refreshes already-approved GPS before loading results", async () => {
  const src = await readFile(new URL("../app/explore/page.jsx", import.meta.url), "utf8");
  assert.ok(src.includes('permission.state === "granted"'));
  assert.ok(src.includes('await refreshNearbyGps()'));
  assert.ok(src.includes('await loadUsers(1)'));
  assert.ok(src.indexOf('if (active && permission.state === "granted") await refreshNearbyGps()') <
    src.indexOf('if (active) {\n        setDiscoverPage(1);\n        await loadUsers(1);'));
});

test("GPS updates are foreground-only and sent via authenticated PATCH, not URLs", async () => {
  const src = await readFile(new URL("../app/explore/page.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("navigator.geolocation.getCurrentPosition("));
  assert.ok(src.includes("maximumAge: 0"));
  assert.ok(src.includes('method: "PATCH"'));
  assert.ok(src.includes('JSON.stringify({ location, locationLabel })'));
  assert.ok(src.includes('id="profile-search-country"') === false);
  assert.ok(src.includes("discoveryInitializedRef.current"));
  assert.ok(src.includes("nearbyGpsSyncing"));
});

test("Nearby update action is translated and separate from country selection", async () => {
  const src = await readFile(new URL("../app/explore/page.jsx", import.meta.url), "utf8");
  assert.ok(src.includes('nearbyScope === "nearby"'));
  assert.ok(src.includes("onClick={handleRefreshNearbyGps}"));
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await readFile(new URL(`../messages/${lang}.json`, import.meta.url), "utf8"));
    for (const key of ["nearbyGpsRefresh","nearbyGpsUpdating","nearbyGpsHelp","nearbyGpsUnavailable"])
      assert.ok(messages.explore[key], lang + ": " + key);
  }
});
