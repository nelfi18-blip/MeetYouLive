import test from "node:test";
import assert from "node:assert/strict";
import { getNativeNotificationPath } from "../lib/nativeNotificationRoutes.js";
import { getNativeGoogleLoginUrl } from "../lib/nativeGoogleLoginUrl.js";
import { getInternalAppPath, isExternalHttpUrl, isInternalAppUrl } from "../lib/nativeUrlPolicy.js";

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

test("native URL policy keeps MeetYouLive domains inside the WebView", () => {
  assert.equal(isInternalAppUrl("https://meetyoulive.net/feed"), true);
  assert.equal(isInternalAppUrl("https://www.meetyoulive.net/live/123"), true);
  assert.equal(getInternalAppPath("https://www.meetyoulive.net/live/123?x=1#join"), "/live/123?x=1#join");
  assert.equal(isExternalHttpUrl("https://meetyoulive.net/feed"), false);
  assert.equal(isExternalHttpUrl("https://www.meetyoulive.net/feed"), false);
});

test("native URL policy opens external HTTP destinations outside the WebView", () => {
  assert.equal(isExternalHttpUrl("https://checkout.stripe.com/c/pay/test"), true);
  assert.equal(isExternalHttpUrl("https://accounts.google.com/o/oauth2/v2/auth"), true);
  assert.equal(isExternalHttpUrl("sms:?body=hola"), false);
});
