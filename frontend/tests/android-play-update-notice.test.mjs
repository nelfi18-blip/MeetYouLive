import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAndroidUpdateStatus, ANDROID_PLAY_STORE_URL } from "../lib/androidUpdatePolicy.js";

const manifest = { latestVersionCode: 57, minimumVersionCode: 57 };

test("Android 1.0.57 already installed is not prompted", () => {
  assert.equal(getAndroidUpdateStatus("57", manifest), null);
});
test("older Android builds get a Play Store update notice", () => {
  assert.deepEqual(getAndroidUpdateStatus("56", manifest), { installed: 56, latest: 57, required: true });
});
test("future Android builds are never downgraded", () => {
  assert.equal(getAndroidUpdateStatus("58", manifest), null);
});
test("bad manifest versions or unknown installed build never block the app", () => {
  assert.equal(getAndroidUpdateStatus("web", manifest), null);
  assert.equal(getAndroidUpdateStatus("56", { latestVersionCode: 57, minimumVersionCode: 58 }), null);
});
test("native banner opens Play without a WebView reload or iOS modification", async () => {
  const banner = await readFile(new URL("../components/AppUpdateBanner.jsx", import.meta.url), "utf8");
  assert.ok(ANDROID_PLAY_STORE_URL.endsWith("id=com.meetyoulive.app"));
  assert.match(banner, /isNativeMobileApp\(\)/);
  assert.match(banner, /getMobilePlatform\(\) !== "android"/);
  assert.match(banner, /App\.getInfo\(\)/);
  assert.match(banner, /Browser\.open\(\{ url: ANDROID_PLAY_STORE_URL \}\)/);
  assert.match(banner, /meetyoulive:sw-update-ready/);
});
