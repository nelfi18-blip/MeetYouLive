import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BACKEND_TOKEN_READY_EVENT } from "../lib/pushAuthLifecycle.js";
import { getNativeNotificationPath } from "../lib/nativeNotificationRoutes.js";

test("FCM notification for a followed creator opens that exact live", () => {
  assert.equal(getNativeNotificationPath({ type: "live", liveId: "live-123" }), "/live/live-123");
  assert.equal(getNativeNotificationPath({ type: "live", link: "/live/live-123" }), "/live/live-123");
});
test("email login signals push initialization without JWT disclosure", async () => {
  const token = await readFile(new URL("../lib/token.js", import.meta.url), "utf8");
  const event = await readFile(new URL("../lib/pushAuthLifecycle.js", import.meta.url), "utf8");
  assert.equal(BACKEND_TOKEN_READY_EVENT, "meetyoulive:backend-token-ready");
  assert.match(token, /window\.dispatchEvent\(new Event\(BACKEND_TOKEN_READY_EVENT\)\)/);
  assert.doesNotMatch(event, /detail:|CustomEvent|localStorage|document\.cookie/);
});
test("Providers reconnect FCM registration on auth ready and foreground without repeatedly prompting", async () => {
  const provider = await readFile(new URL("../app/providers.jsx", import.meta.url), "utf8");
  assert.match(provider, /window\.addEventListener\(BACKEND_TOKEN_READY_EVENT, onAuthReady\)/);
  assert.match(provider, /document\.addEventListener\("visibilitychange", onVisible\)/);
  assert.match(provider, /initNativePushNotifications\(backendToken\)/);
  assert.doesNotMatch(provider, /requestNativePushNotifications\(backendToken\)/);
});
test("native push registration checks backend HTTP status and preserves safe push deep-link navigation", async () => {
  const native = await readFile(new URL("../lib/nativePush.js", import.meta.url), "utf8");
  assert.match(native, /if \(!response\.ok\)/);
  assert.match(native, /PushNotifications\.register\(\)/);
  assert.match(native, /getNativeNotificationPath\(notification\?\.data\)/);
});
test("a live-start FCM channel is already available in the Android shell", async () => {
  const activity = await readFile(new URL("../android/app/src/main/java/com/meetyoulive/app/MainActivity.java", import.meta.url), "utf8");
  assert.match(activity, /"lives"/);
});
