import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getNativeNotificationPath } from "../lib/nativeNotificationRoutes.js";
import { getNativeGoogleLoginUrl } from "../lib/nativeGoogleLoginUrl.js";
import { buildNativeAuthSuccessDeepLink, getNativeAuthCallbackPath } from "../lib/nativeAuthRedirect.js";
import { getTrustedCheckoutUrl } from "../lib/checkoutRedirect.js";
import { getInternalAppPath, isExternalHttpUrl, isInternalAppUrl } from "../lib/nativeUrlPolicy.js";
import {
  getNativeInvalidSessionPath,
  getNativeSessionStartPath,
  shouldOpenUrlOutsideNativeWebView,
  shouldPersistNativeAppPath,
} from "../lib/nativeSessionPolicy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainActivityPath = join(__dirname, "../android/app/src/main/java/com/meetyoulive/app/MainActivity.java");

test("native notification deep links route to supported screens", () => {
  assert.equal(getNativeNotificationPath("/chats/abc"), "/chats/abc");
  assert.equal(getNativeNotificationPath("/call/123?from=push"), "/call/123?from=push");
  assert.equal(getNativeNotificationPath("https://meetyoulive.net/live/456#join"), "/live/456#join");
  assert.equal(getNativeNotificationPath("/wallet"), "/wallet");
  assert.equal(getNativeNotificationPath("/admin"), "/");
  assert.equal(getNativeNotificationPath("https://evil.example/chats/abc"), "/");
});

test("native notification data routes to the expected screen when link is absent", () => {
  assert.equal(getNativeNotificationPath({ type: "new_message", chatId: "chat-1" }), "/chats/chat-1");
  assert.equal(getNativeNotificationPath({ type: "match" }), "/matches");
  assert.equal(getNativeNotificationPath({ type: "live", liveId: "live-1" }), "/live/live-1");
  assert.equal(getNativeNotificationPath({ type: "profile", profileId: "user-1" }), "/profile/user-1");
  assert.equal(getNativeNotificationPath({ type: "coins_purchase_confirmed" }), "/coins");
  assert.equal(getNativeNotificationPath({ type: "withdrawal_approved" }), "/wallet");
});

test("native Google login uses an intermediate page with a safe callback handoff", () => {
  const url = new URL(getNativeGoogleLoginUrl("/feed", "https://meetyoulive.net"));
  assert.equal(url.origin, "https://meetyoulive.net");
  assert.equal(url.pathname, "/auth/native-start");
  assert.notEqual(url.pathname, "/api/auth/signin/google");
  assert.equal(url.searchParams.get("callbackUrl"), "/feed");

  const nativeCallbackUrl = new URL(getNativeAuthCallbackPath(url.searchParams.get("callbackUrl")), "https://meetyoulive.net");
  assert.equal(nativeCallbackUrl.pathname, "/auth/native-callback");
  assert.equal(nativeCallbackUrl.searchParams.get("callbackUrl"), "/feed");
});

test("native Google login falls back to feed for unsafe callbacks", () => {
  assert.equal(
    new URL(getNativeGoogleLoginUrl("https://evil.example/feed", "https://meetyoulive.net")).searchParams.get("callbackUrl"),
    "/feed"
  );
  assert.equal(
    new URL(getNativeGoogleLoginUrl("/api/auth/signin/google", "https://meetyoulive.net")).searchParams.get("callbackUrl"),
    "/feed"
  );
});

test("native auth callback builds app deep link for the final token handoff", () => {
  const deepLink = new URL(buildNativeAuthSuccessDeepLink("header.payload.signature", "/profile"));
  assert.equal(deepLink.protocol, "meetyoulive:");
  assert.equal(deepLink.hostname, "auth");
  assert.equal(deepLink.pathname, "/success");
  assert.equal(deepLink.searchParams.get("token"), "header.payload.signature");
  assert.equal(deepLink.searchParams.get("callbackUrl"), "/profile");
});

test("native URL policy keeps MeetYouLive domains inside the WebView", () => {
  assert.equal(isInternalAppUrl("https://meetyoulive.net/feed"), true);
  assert.equal(isInternalAppUrl("https://www.meetyoulive.net/live/123"), true);
  assert.equal(getInternalAppPath("https://www.meetyoulive.net/live/123?x=1#join"), "/live/123?x=1#join");
  assert.equal(isExternalHttpUrl("https://meetyoulive.net/feed"), false);
  assert.equal(isExternalHttpUrl("https://www.meetyoulive.net/feed"), false);
});

test("native URL policy converts internal absolute URLs to in-app routes", () => {
  assert.equal(getInternalAppPath("https://meetyoulive.net/profile"), "/profile");
  assert.equal(getInternalAppPath("https://meetyoulive.net/chats/abc?from=push"), "/chats/abc?from=push");
  assert.equal(getInternalAppPath("https://evil.example/profile"), null);
});

test("native email login routes to feed inside the WebView", () => {
  assert.equal(getNativeSessionStartPath({ callbackPath: "/feed" }), "/feed");
  assert.equal(shouldOpenUrlOutsideNativeWebView("https://meetyoulive.net/feed"), false);
});

test("native app reopen restores the stored in-app route", () => {
  assert.equal(
    getNativeSessionStartPath({ currentPath: "/", storedPath: "/chats/abc?from=app" }),
    "/chats/abc?from=app"
  );
  assert.equal(getNativeSessionStartPath({ currentPath: "/", storedPath: "" }), "/feed");
});

test("native invalid token flow returns to login", () => {
  assert.equal(getNativeInvalidSessionPath(), "/login");
});

test("native logout clears persisted auth routes", () => {
  assert.equal(shouldPersistNativeAppPath("/login"), false);
  assert.equal(shouldPersistNativeAppPath("/feed"), true);
});

test("native URL policy opens external HTTP destinations outside the WebView", () => {
  assert.equal(isExternalHttpUrl("https://checkout.stripe.com/c/pay/test"), true);
  assert.equal(isExternalHttpUrl("https://accounts.google.com/o/oauth2/v2/auth"), true);
  assert.equal(isExternalHttpUrl("sms:?body=hola"), false);
});

test("Android WebView consumes MeetYouLive main-frame URLs in app", async () => {
  const source = await readFile(mainActivityPath, "utf8");

  assert.match(source, /loadMeetYouLiveUrlInWebView\(WebView view, String url, boolean isMainFrame\)/);
  assert.match(source, /if \(!isMainFrame \|\| !isMeetYouLiveUrl\(url\)\)/);
  assert.match(source, /view\.loadUrl\(url\);/);
  assert.match(source, /return super\.shouldOverrideUrlLoading\(view, request\);/);
  assert.match(source, /return super\.shouldOverrideUrlLoading\(view, url\);/);
});

test("foreground push links are sanitized before navigation", () => {
  assert.equal(getNativeNotificationPath("https://meetyoulive.net/profile"), "/profile");
  assert.equal(getNativeNotificationPath("https://phishing.example/feed"), "/");
});

test("payment redirect only trusts Stripe checkout URLs", () => {
  assert.equal(getTrustedCheckoutUrl("https://checkout.stripe.com/c/pay/test"), "https://checkout.stripe.com/c/pay/test");
  assert.equal(getTrustedCheckoutUrl("https://fake-checkout.example/c/pay/test"), null);
  assert.equal(getTrustedCheckoutUrl("/coins"), null);
});
