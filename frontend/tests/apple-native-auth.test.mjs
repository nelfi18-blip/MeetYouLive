import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Capacitor } from "@capacitor/core";

Capacitor.PluginHeaders = [{ name: "MeetYouLiveAppleAuth", methods: [{ name: "signIn", rtype: "promise" }] }];
const { signInWithNativeApple, isNativeAppleSignInAvailable, appleSignInErrorKey } = await import("../lib/nativeAppleSignIn.js");
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalPlatform = Capacitor.getPlatform;
const originalNative = Capacitor.isNativePlatform;
const originalAvailability = Capacitor.isPluginAvailable;
const originalPromise = Capacitor.nativePromise;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const challengeId = "c".repeat(64);
const nonce = "d".repeat(64);

function platform(name, available = true) {
  Capacitor.getPlatform = () => name;
  Capacitor.isNativePlatform = () => name !== "web";
  Capacitor.isPluginAvailable = () => available;
  globalThis.window = { Capacitor };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  Capacitor.getPlatform = originalPlatform;
  Capacitor.isNativePlatform = originalNative;
  Capacitor.isPluginAvailable = originalAvailability;
  Capacitor.nativePromise = originalPromise;
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
});

test("Apple is available only in the iOS shell that actually contains the plugin", () => {
  for (const name of ["web", "android"]) {
    platform(name);
    assert.equal(isNativeAppleSignInAvailable(), false);
  }
  platform("ios", false);
  assert.equal(isNativeAppleSignInAvailable(), false, "build 3 without the plugin stays unchanged");
  platform("ios");
  assert.equal(isNativeAppleSignInAvailable(), true);
});

test("native challenge/credential exchange uses HTTPS, state, nonce, and backend response", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => calls.length === 1 ? { challengeId, nonce } :
      { token: "backend-jwt", user: { id: "user-1", onboardingComplete: false } } };
  };
  Capacitor.nativePromise = async (plugin, method, options) => {
    assert.equal(plugin, "MeetYouLiveAppleAuth");
    assert.equal(method, "signIn");
    assert.deepEqual(options, { nonce, state: challengeId });
    return { idToken: "apple-credential", name: "Apple Name" };
  };
  const result = await signInWithNativeApple({ ageConfirmed: true, ref: "REF123", agencyCode: "AGENCY" });
  assert.equal(result.token, "backend-jwt");
  assert.equal(calls[0].url, "https://api.example.test/api/auth/apple-challenge");
  assert.equal(calls[1].url, "https://api.example.test/api/auth/apple-native");
  assert.deepEqual(calls[1].body, {
    challengeId, idToken: "apple-credential", name: "Apple Name", ageConfirmed: true, ref: "REF123", agencyCode: "AGENCY",
  });
  for (const { options } of calls) {
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
  }
});

test("cancellation does not exchange a credential, persist tokens, or open browser OAuth", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  let requests = 0;
  globalThis.fetch = async () => { requests++; return { ok: true, json: async () => ({ challengeId, nonce }) }; };
  Capacitor.nativePromise = async () => { throw Object.assign(new Error("cancel"), { code: "APPLE_CANCELLED" }); };
  await assert.rejects(signInWithNativeApple({ ageConfirmed: true }), { code: "APPLE_CANCELLED" });
  assert.equal(requests, 1);
  assert.equal(appleSignInErrorKey("APPLE_CANCELLED"), "auth.appleCancelled");
});

test("returning authorization can omit name and sends no client-provided email or subject", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++;
    if (requests === 2) {
      const body = JSON.parse(options.body);
      assert.equal(body.name, "");
      assert.equal(body.email, undefined);
      assert.equal(body.sub, undefined);
    }
    return { ok: true, json: async () => requests === 1 ? { challengeId, nonce } : { token: "jwt", user: { id: "returning" } } };
  };
  Capacitor.nativePromise = async () => ({ idToken: "apple-credential" });
  assert.equal((await signInWithNativeApple({ ageConfirmed: true })).user.id, "returning");
});

test("backend conflict is surfaced without session success", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return { ok: requests === 1, json: async () => requests === 1 ? { challengeId, nonce } : { code: "APPLE_ACCOUNT_CONFLICT" } };
  };
  Capacitor.nativePromise = async () => ({ idToken: "apple-credential" });
  await assert.rejects(signInWithNativeApple({ ageConfirmed: true }), { code: "APPLE_ACCOUNT_CONFLICT" });
  assert.equal(appleSignInErrorKey("APPLE_ACCOUNT_CONFLICT"), "auth.appleAccountConflict");
});

test("refuses plaintext transport and unsupported platforms before credential retrieval", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "http://api.example.test";
  globalThis.fetch = () => { throw new Error("must not fetch"); };
  await assert.rejects(signInWithNativeApple({ ageConfirmed: true }), { code: "APPLE_UNAVAILABLE" });
  platform("android");
  await assert.rejects(signInWithNativeApple({ ageConfirmed: true }), { code: "APPLE_UNAVAILABLE" });
});

test("native registration, capability, session and routing remain wired without changes to Google", async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const [native, storyboard, project, entitlements, config, button, login, register] = await Promise.all([
    read("ios/App/App/AppleSignInPlugin.swift"), read("ios/App/App/Base.lproj/Main.storyboard"),
    read("ios/App/App.xcodeproj/project.pbxproj"), read("ios/App/App/App.entitlements"),
    read("capacitor.config.ts"), read("components/AppleSignInButton.jsx"),
    read("app/login/page.jsx"), read("app/register/RegisterForm.jsx"),
  ]);
  assert.match(native, /ASAuthorizationAppleIDProvider\(\)\.createRequest\(\)/);
  assert.match(native, /request\.nonce = nonce/);
  assert.match(native, /credential\.state == expectedState/);
  assert.match(native, /registerPluginInstance\(AppleSignInPlugin\(\)\)/);
  assert.doesNotMatch(native, /print\(|UserDefaults|Keychain|authorizationCode/);
  assert.match(storyboard, /customClass="MeetYouLiveBridgeViewController"/);
  assert.match(project, /AppleSignInPlugin\.swift in Sources/);
  assert.match(entitlements, /com\.apple\.developer\.applesignin/);
  assert.match(config, /ios:\s*\{\s*\/\/[^\n]*\n\s*loggingBehavior: 'none'/);
  assert.match(config, /apple: false/, "unsafe Capgo Apple provider remains disabled");
  assert.match(button, /setToken\(data\.token\)/);
  assert.match(button, /meetyoulive:native-session-restored/);
  assert.match(button, /if \(!adult\)/);
  for (const page of [login, register]) {
    assert.match(page, /<AppleSignInButton/);
    assert.match(page, /startNativeGoogleLogin\(/);
    assert.match(page, /signIn\("google"/);
  }
  assert.match(login, /getPostLoginRedirectPath\(user, getSafeCallbackPath\(searchParams\)\)/);
  assert.match(register, /getPostRegisterRedirectPath\(user, inviteCode\)/);
});
