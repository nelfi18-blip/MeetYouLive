import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startNativeGoogleLogin } from "../lib/nativeGoogleLogin.js";
import { getNativeNotificationPath } from "../lib/nativeNotificationRoutes.js";
import { getNativeGoogleLoginUrl } from "../lib/nativeGoogleLoginUrl.js";
import { buildNativeAuthSuccessDeepLink } from "../lib/nativeAuthRedirect.js";
import { isNativeMobileApp } from "../lib/mobileEnvironment.js";
import { getTrustedCheckoutUrl } from "../lib/checkoutRedirect.js";
import { getInternalAppPath, isExternalHttpUrl, isInternalAppUrl } from "../lib/nativeUrlPolicy.js";
import {
  getNativeInvalidSessionPath,
  getNativeSessionStartPath,
  shouldOpenUrlOutsideNativeWebView,
  shouldPersistNativeAppPath,
} from "../lib/nativeSessionPolicy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidManifestPath = join(__dirname, "../android/app/src/main/AndroidManifest.xml");
const mainActivityPath = join(__dirname, "../android/app/src/main/java/com/meetyoulive/app/MainActivity.java");
const globalsCssPath = join(__dirname, "../app/globals.css");
const screenSecurityPluginPath = join(__dirname, "../android/app/src/main/java/com/meetyoulive/app/ScreenSecurityPlugin.java");
const screenCaptureProtectionPath = join(__dirname, "../lib/screenCaptureProtection.js");
const serviceWorkerRegistrationPath = join(__dirname, "../components/ServiceWorkerRegistration.jsx");
const nativeGoogleLoginPath = join(__dirname, "../lib/nativeGoogleLogin.js");
const nativeCallbackPath = join(__dirname, "../app/auth/native-callback/page.jsx");
const callPagePath = join(__dirname, "../app/call/[id]/page.jsx");
const exclusiveDetailPagePath = join(__dirname, "../app/exclusive/[id]/page.jsx");
const meetYouLiveGoogleAuthPluginPath = join(
  __dirname,
  "../android/app/src/main/java/com/meetyoulive/app/MeetYouLiveGoogleAuthPlugin.java"
);
const nativeGoogleSignInPath = join(__dirname, "../lib/nativeGoogleSignIn.js");
const capacitorConfigPath = join(__dirname, "../capacitor.config.ts");
const appBuildGradlePath = join(__dirname, "../android/app/build.gradle");

function withWindow(value, callback) {
  const previousWindow = globalThis.window;
  const previousCapacitor = globalThis.Capacitor;
  globalThis.window = value;
  if (value?.Capacitor) {
    globalThis.Capacitor = value.Capacitor;
  } else {
    delete globalThis.Capacitor;
  }

  const restore = () => {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousCapacitor === undefined) {
      delete globalThis.Capacitor;
    } else {
      globalThis.Capacitor = previousCapacitor;
    }
  };

  try {
    const result = callback();
    if (result && typeof result.finally === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

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

test("native Google login uses NextAuth endpoint with a safe callback handoff", () => {
  const url = new URL(getNativeGoogleLoginUrl("/feed", "https://meetyoulive.net"));
  assert.equal(url.origin, "https://meetyoulive.net");
  assert.equal(url.pathname, "/api/auth/signin/google");

  const callbackUrl = new URL(url.searchParams.get("callbackUrl"));
  assert.equal(callbackUrl.pathname, "/auth/native-callback");
  assert.equal(callbackUrl.searchParams.get("callbackUrl"), "/feed");
});

test("native mobile detection uses Capacitor native platform API for Android", () => {
  assert.equal(
    withWindow(
      {
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => "android",
        },
      },
      () => isNativeMobileApp()
    ),
    true
  );
});

test("native mobile detection falls back to Android bridge when native platform API is false", () => {
  assert.equal(
    withWindow(
      {
        Capacitor: {
          isNativePlatform: () => false,
          getPlatform: () => "android",
          nativePromise: () => Promise.resolve(),
        },
      },
      () => isNativeMobileApp()
    ),
    true
  );
});

test("native mobile detection does not throw when Capacitor native platform API throws", () => {
  assert.equal(
    withWindow(
      {
        Capacitor: {
          isNativePlatform: () => {
            throw new Error("native platform unavailable");
          },
          getPlatform: () => "android",
          nativePromise: () => Promise.resolve(),
        },
      },
      () => isNativeMobileApp()
    ),
    true
  );
});

test("native mobile detection returns false for normal web/PWA", () => {
  assert.equal(
    withWindow(
      {
        Capacitor: {
          isNativePlatform: () => false,
          getPlatform: () => "web",
        },
      },
      () => isNativeMobileApp()
    ),
    false
  );
});

test("native Google login opens the Capacitor Browser on Android", async () => {
  const openedUrls = [];
  const result = await withWindow(
    {
      location: { origin: "https://meetyoulive.net" },
      open: (url) => {
        openedUrls.push(url);
        return { close: () => {} };
      },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
      },
    },
    () => startNativeGoogleLogin("/feed")
  );

  assert.equal(result, true);
  assert.equal(openedUrls.length, 1);
  const opened = new URL(openedUrls[0]);
  assert.equal(opened.pathname, "/api/auth/signin/google");
  assert.equal(new URL(opened.searchParams.get("callbackUrl")).pathname, "/auth/native-callback");
});

test("native Google login reports Browser.open failure without throwing from the click handler", async () => {
  const result = await withWindow(
    {
      location: { origin: "https://meetyoulive.net" },
      open: () => {
        throw new Error("Browser open failed");
      },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
      },
    },
    () => startNativeGoogleLogin("/feed")
  );

  assert.equal(result, false);
});

test("native Google login enters native branch when Capacitor detects Android", async () => {
  const source = await readFile(nativeGoogleLoginPath, "utf8");

  assert.match(source, /if \(!isNativeMobileApp\(\)\) return false;/);
  assert.match(source, /await Browser\.open\(\{/);
  assert.match(source, /getNativeGoogleLoginUrl\(callbackPath, origin\)/);
  assert.match(
    source,
    /try \{[\s\S]*await Browser\.open\(\{[\s\S]*getNativeGoogleLoginUrl\(callbackPath, origin\)[\s\S]*\}\);[\s\S]*\}\s*catch[\s\S]*return false;[\s\S]*return true;/
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

test("native auth callback directly hands off to the PR 850 app deep link", async () => {
  const source = await readFile(nativeCallbackPath, "utf8");

  assert.match(source, /window\.location\.replace\(nextDeepLink\);/);
  assert.doesNotMatch(source, /intent:\/\//);
  assert.doesNotMatch(source, /getNativeAuthSuccessHandoffUrls/);
  assert.doesNotMatch(source, /setTimeout/);
});

test("Android manifest keeps HTTPS App Links and custom scheme handoff", async () => {
  const source = await readFile(androidManifestPath, "utf8");

  assert.match(source, /<intent-filter android:autoVerify="true">/);
  assert.match(source, /<data android:scheme="https" android:host="meetyoulive\.net" \/>/);
  assert.match(source, /<data android:scheme="https" android:host="www\.meetyoulive\.net" \/>/);
  assert.match(source, /<data android:scheme="@string\/custom_url_scheme" \/>/);
});

test("Android MainActivity forwards Google authorization results to SocialLogin", async () => {
  const source = await readFile(mainActivityPath, "utf8");

  assert.match(source, /implements ModifiedMainActivityForSocialLoginPlugin/);
  assert.match(source, /onActivityResult\(int requestCode, int resultCode, Intent data\)/);
  assert.match(source, /GoogleProvider\.REQUEST_AUTHORIZE_GOOGLE_MIN/);
  assert.match(source, /GoogleProvider\.REQUEST_AUTHORIZE_GOOGLE_MAX/);
  assert.match(source, /getBridge\(\)\.getPlugin\("SocialLogin"\)/);
  assert.match(source, /handleGoogleLoginIntent\(requestCode, data\)/);
  assert.match(source, /IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin\(\)/);
});

test("Android MainActivity registers the native MeetYouLiveGoogleAuth plugin", async () => {
  const source = await readFile(mainActivityPath, "utf8");

  assert.match(source, /registerPlugin\(MeetYouLiveGoogleAuthPlugin\.class\)/);
});

test("MeetYouLiveGoogleAuthPlugin uses Credential Manager + GetSignInWithGoogleOption directly", async () => {
  const source = await readFile(meetYouLiveGoogleAuthPluginPath, "utf8");

  assert.match(source, /@CapacitorPlugin\(name = "MeetYouLiveGoogleAuth"\)/);
  assert.match(source, /androidx\.credentials\.CredentialManager/);
  assert.match(source, /androidx\.credentials\.GetCredentialRequest/);
  assert.match(source, /com\.google\.android\.libraries\.identity\.googleid\.GetSignInWithGoogleOption/);
  assert.match(source, /com\.google\.android\.libraries\.identity\.googleid\.GoogleIdTokenCredential/);
  assert.match(source, /new GetSignInWithGoogleOption\.Builder\(webClientId\)\.build\(\)/);
  assert.match(source, /GoogleIdTokenCredential\.createFrom\(customCredential\.getData\(\)\)/);
  assert.match(source, /data\.put\("idToken", idToken\)/);
});

test("MeetYouLiveGoogleAuthPlugin retries exactly once on error 16 and then reports failure", async () => {
  const source = await readFile(meetYouLiveGoogleAuthPluginPath, "utf8");

  assert.match(source, /reauthRetried\.getAndSet\(true\)/);
  assert.match(source, /clearCredentialStateAsync/);
  assert.match(source, /native_google_reauth16_detected/);
  assert.match(source, /native_google_state_cleared/);
  assert.match(source, /native_google_retry_started/);
  assert.match(source, /native_google_retry_failed/);
  assert.match(source, /native_google_success/);
});

test("MeetYouLiveGoogleAuthPlugin never logs sensitive Google credential data", async () => {
  const source = await readFile(meetYouLiveGoogleAuthPluginPath, "utf8");

  const logLines = source.split("\n").filter((line) => /Log\.(i|w|e)\(/.test(line));
  for (const line of logLines) {
    assert.doesNotMatch(line, /idToken/i);
    assert.doesNotMatch(line, /getIdToken/i);
    assert.doesNotMatch(line, /email/i);
  }
});

test("app/build.gradle wires MeetYouLiveGoogleAuth dependencies without new duplicate versions", async () => {
  const source = await readFile(appBuildGradlePath, "utf8");

  assert.match(source, /androidx\.credentials:credentials:1\.5\.0/);
  assert.match(source, /androidx\.credentials:credentials-play-services-auth:1\.5\.0/);
  assert.match(source, /com\.google\.android\.libraries\.identity\.googleid:googleid:1\.1\.1/);
});

test("capacitor.config.ts stops routing Google through the Capgo social login provider", async () => {
  const source = await readFile(capacitorConfigPath, "utf8");

  assert.match(source, /google: false/);
});

test("nativeGoogleSignIn helper calls the native MeetYouLiveGoogleAuth plugin instead of Capgo SocialLogin", async () => {
  const source = await readFile(nativeGoogleSignInPath, "utf8");

  assert.match(source, /registerPlugin\("MeetYouLiveGoogleAuth"\)/);
  assert.match(source, /MeetYouLiveGoogleAuth\.signIn\(\{ webClientId: GOOGLE_WEB_CLIENT_ID \}\)/);
  assert.match(source, /fetch\(`\$\{API_URL\}\/api\/auth\/google-native`/);
  assert.doesNotMatch(source, /@capgo\/capacitor-social-login"/);
  assert.doesNotMatch(source, /SocialLogin\.login/);
  assert.doesNotMatch(source, /SocialLogin\.initialize/);
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

test("native mobile shell keeps default touch scrolling enabled", async () => {
  const source = await readFile(globalsCssPath, "utf8");
  const nativeMobileRule = source.match(/\.native-mobile-app\s*\{[^}]*\}/)?.[0] || "";

  assert.match(nativeMobileRule, /touch-action:\s*auto;/);
  assert.doesNotMatch(nativeMobileRule, /touch-action:\s*manipulation;/);
});

test("foreground push links are sanitized before navigation", () => {
  assert.equal(getNativeNotificationPath("https://meetyoulive.net/profile"), "/profile");
  assert.equal(getNativeNotificationPath("https://phishing.example/feed"), "/");
});

test("Android screen security plugin uses FLAG_SECURE only through explicit calls", async () => {
  const [mainActivity, plugin, helper] = await Promise.all([
    readFile(mainActivityPath, "utf8"),
    readFile(screenSecurityPluginPath, "utf8"),
    readFile(screenCaptureProtectionPath, "utf8"),
  ]);

  assert.match(mainActivity, /registerPlugin\(ScreenSecurityPlugin\.class\);/);
  assert.match(plugin, /@CapacitorPlugin\(name = "ScreenSecurity"\)/);
  assert.match(plugin, /window\.setFlags\(\s*WindowManager\.LayoutParams\.FLAG_SECURE,\s*WindowManager\.LayoutParams\.FLAG_SECURE\s*\)/);
  assert.match(plugin, /window\.clearFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/);
  assert.match(helper, /getMobilePlatform\(\) === "android"/);
  assert.match(helper, /isNativeMobileApp\(\)/);
});

test("sensitive screens opt in to Android screen capture protection", async () => {
  const [callPage, exclusiveDetailPage] = await Promise.all([
    readFile(callPagePath, "utf8"),
    readFile(exclusiveDetailPagePath, "utf8"),
  ]);

  assert.match(callPage, /useAndroidScreenCaptureProtection\(\);/);
  assert.match(exclusiveDetailPage, /useAndroidScreenCaptureProtection\(!*!item\?\.hasAccess\)/);
});

test("service worker registration skips native apps but keeps web/PWA registration", async () => {
  const source = await readFile(serviceWorkerRegistrationPath, "utf8");

  assert.match(source, /if \(isNativeMobileApp\(\)\) \{/);
  assert.match(source, /cleanupResidualPwaState\(\);\s*\n\s*return;/);
  assert.match(source, /navigator\.serviceWorker\.register\("\/sw\.js", \{/);
});

async function runServiceWorkerRegistrationEffect({ native, hasServiceWorker = true }) {
  const source = await readFile(serviceWorkerRegistrationPath, "utf8");
  const effectBody = source.match(
    /export default function ServiceWorkerRegistration\(\) \{\s*useEffect\(\(\) => \{([\s\S]*)\}, \[\]\);\s*\n\s*return null;/
  )?.[1];
  assert.ok(effectBody, "ServiceWorkerRegistration useEffect body not found");

  const cleanupCalls = [];
  const registerCalls = [];
  const fakeIsNativeMobileApp = () => native;
  const fakeCleanupResidualPwaState = () => {
    cleanupCalls.push("cleanupResidualPwaState");
    return Promise.resolve();
  };

  const fakeRegistration = {
    update: () => {},
    addEventListener: () => {},
  };
  const fakeNavigator = hasServiceWorker
    ? {
        serviceWorker: {
          register: async (...args) => {
            registerCalls.push(args);
            return fakeRegistration;
          },
          controller: null,
        },
      }
    : {};

  const fakeWindow = {
    addEventListener: () => {},
    dispatchEvent: () => {},
    reportError: () => {},
  };
  const fakeDocument = { readyState: "complete" };

  // Run the actual effect body (as captured verbatim from the component source)
  // against these mocks, so a regression that returns before
  // cleanupResidualPwaState() is invoked would be caught by execution order,
  // not merely by a source-text pattern.
  const runEffect = new Function(
    "isNativeMobileApp",
    "cleanupResidualPwaState",
    "navigator",
    "window",
    "document",
    "AbortController",
    `return (function() {\n${effectBody}\n})();`
  );

  const effectCleanup = runEffect(
    fakeIsNativeMobileApp,
    fakeCleanupResidualPwaState,
    fakeNavigator,
    fakeWindow,
    fakeDocument,
    globalThis.AbortController
  );

  // Allow any queued microtasks (e.g. registerServiceWorker's async IIFE) to run.
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Invoke the effect's own cleanup (mirrors an unmount) so the real
  // setInterval it may have started does not keep the test process alive.
  if (typeof effectCleanup === "function") {
    effectCleanup();
  }

  return { cleanupCalls, registerCalls };
}

test("native execution actually invokes cleanupResidualPwaState (regression guard for an early return)", async () => {
  const { cleanupCalls, registerCalls } = await runServiceWorkerRegistrationEffect({ native: true });

  assert.deepEqual(cleanupCalls, ["cleanupResidualPwaState"]);
  assert.deepEqual(registerCalls, []);
});

test("web execution registers sw.js and never calls cleanupResidualPwaState", async () => {
  const { cleanupCalls, registerCalls } = await runServiceWorkerRegistrationEffect({ native: false });

  assert.deepEqual(cleanupCalls, []);
  assert.equal(registerCalls.length, 1);
  assert.deepEqual(registerCalls[0], ["/sw.js", { scope: "/" }]);
});

test("residual PWA cleanup only unregisters existing service workers and never re-registers sw.js", async () => {
  const source = await readFile(serviceWorkerRegistrationPath, "utf8");
  const cleanupBody = source.match(
    /export async function cleanupResidualPwaState\(\) \{([\s\S]*?)\n\}/
  )?.[1] || "";

  assert.match(cleanupBody, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(cleanupBody, /registration\.unregister\(\)/);
  assert.doesNotMatch(cleanupBody, /\.register\(/);
  assert.doesNotMatch(cleanupBody, /localStorage/);
  assert.doesNotMatch(cleanupBody, /document\.cookie/);
  assert.doesNotMatch(cleanupBody, /Preferences/);
});

test("residual PWA cleanup only deletes MeetYouLive-prefixed caches", async () => {
  const source = await readFile(serviceWorkerRegistrationPath, "utf8");
  const cleanupBody = source.match(
    /export async function cleanupResidualPwaState\(\) \{([\s\S]*?)\n\}/
  )?.[1] || "";

  assert.match(cleanupBody, /caches\.keys\(\)/);
  assert.match(cleanupBody, /name\.startsWith\(MEETYOULIVE_CACHE_PREFIX\)/);
  assert.match(cleanupBody, /caches\.delete\(name\)/);
  assert.match(source, /const MEETYOULIVE_CACHE_PREFIX = "meetyoulive-";/);
});

test("residual PWA cleanup unregisters registrations and deletes only meetyoulive caches at runtime", async () => {
  const unregistered = [];
  const deletedCaches = [];
  const fakeNavigator = {
    serviceWorker: {
      getRegistrations: async () => [
        { unregister: async () => unregistered.push("registration-1") },
        { unregister: async () => unregistered.push("registration-2") },
      ],
    },
  };
  const fakeCaches = {
    keys: async () => ["meetyoulive-v42", "meetyoulive-v41", "some-other-app-cache"],
    delete: async (name) => deletedCaches.push(name),
  };

  const source = await readFile(serviceWorkerRegistrationPath, "utf8");
  const cleanupSource = source.match(
    /const MEETYOULIVE_CACHE_PREFIX[\s\S]*?export async function cleanupResidualPwaState\(\) \{[\s\S]*?\n\}/
  )?.[0];
  assert.ok(cleanupSource, "cleanupResidualPwaState source block not found");

  const runner = new Function(
    "navigator",
    "caches",
    "window",
    `${cleanupSource.replace("export async function", "return async function")}`
  );

  await runner(fakeNavigator, fakeCaches, { caches: fakeCaches })();

  assert.deepEqual(unregistered, ["registration-1", "registration-2"]);
  assert.deepEqual(deletedCaches, ["meetyoulive-v42", "meetyoulive-v41"]);
});

test("payment redirect only trusts Stripe checkout URLs", () => {
  assert.equal(getTrustedCheckoutUrl("https://checkout.stripe.com/c/pay/test"), "https://checkout.stripe.com/c/pay/test");
  assert.equal(getTrustedCheckoutUrl("https://fake-checkout.example/c/pay/test"), null);
  assert.equal(getTrustedCheckoutUrl("/coins"), null);
});
