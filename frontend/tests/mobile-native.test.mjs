import test from "node:test";
import assert from "node:assert/strict";
import { getNativeNotificationPath } from "../lib/nativeNotificationRoutes.js";
import { getNativeGoogleLoginUrl } from "../lib/nativeGoogleLoginUrl.js";

test("native notification deep links route to supported screens", () => {
  assert.equal(getNativeNotificationPath("/chats/abc"), "/chats/abc");
  assert.equal(getNativeNotificationPath("/call/123?from=push"), "/call/123?from=push");
  assert.equal(getNativeNotificationPath("https://meetyoulive.net/live/456#join"), "/live/456#join");
  assert.equal(getNativeNotificationPath("/wallet"), "/wallet");
  assert.equal(getNativeNotificationPath("/admin"), "/");
  assert.equal(getNativeNotificationPath("https://evil.example/chats/abc"), "/");
});

test("native Google login uses NextAuth endpoint with a safe callback handoff", () => {
  const url = new URL(getNativeGoogleLoginUrl("/feed", "https://meetyoulive.net"));
  assert.equal(url.origin, "https://meetyoulive.net");
  assert.equal(url.pathname, "/api/auth/signin/google");

  const callbackUrl = new URL(url.searchParams.get("callbackUrl"));
  assert.equal(callbackUrl.pathname, "/login");
  assert.equal(callbackUrl.searchParams.get("callbackUrl"), "/feed");
});
