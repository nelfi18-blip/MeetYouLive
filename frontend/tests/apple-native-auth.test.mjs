import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
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
  assert.equal((await signInWithNativeApple({})).user.id, "returning");
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
  assert.match(button, /if \(requiresConsent && !adult\)/);
  for (const page of [login, register]) {
    assert.match(page, /<AppleSignInButton/);
    assert.match(page, /startNativeGoogleLogin\(/);
    assert.match(page, /signIn\("google"/);
  }
  assert.match(login, /getPostLoginRedirectPath\(user, getSafeCallbackPath\(searchParams\)\)/);
  assert.match(register, /getPostRegisterRedirectPath\(user, inviteCode\)/);
});

test("login sends false without consent and an unknown identity creates no successful session", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++;
    if (requests === 2) assert.equal(JSON.parse(options.body).ageConfirmed, false);
    return { ok: requests === 1, json: async () => requests === 1 ?
      { challengeId, nonce } : { code: "APPLE_REGISTRATION_REQUIRED" } };
  };
  Capacitor.nativePromise = async () => ({ idToken: "apple-credential" });
  await assert.rejects(signInWithNativeApple({}), { code: "APPLE_REGISTRATION_REQUIRED" });
});

// Compile the actual JSX with Next's installed compiler, then exercise handlers
// with deterministic hooks. No new test dependencies or native credentials.
async function buttonHarness({ ageConfirmed, signIn }) {
  const require = createRequire(import.meta.url);
  const { transformSync } = require("next/dist/build/swc");
  const source = await readFile(new URL("../components/AppleSignInButton.jsx", import.meta.url), "utf8");
  const { code } = transformSync(source, {
    filename: "AppleSignInButton.jsx",
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const slots = [];
  let cursor = 0;
  const tokens = [], successes = [], errors = [], events = [], busy = [];
  const jsx = (type, props) => ({ type, props });
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect) { effect(); },
  };
  const modules = {
    react: hooks,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "Link", __esModule: true },
    "@/contexts/LanguageContext": { useLanguage: () => ({ t: (key) => key }) },
    "@/lib/nativeAppleSignIn": {
      isNativeAppleSignInAvailable: () => true,
      signInWithNativeApple: signIn,
      appleSignInErrorKey,
    },
    "@/lib/token": { setToken: (token) => tokens.push(token) },
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    window: { dispatchEvent: (event) => events.push(event) },
    CustomEvent: class { constructor(type) { this.type = type; } },
  });
  function render() {
    cursor = 0;
    return exports.default({
      ageConfirmed,
      onBusyChange: (value) => busy.push(value),
      onSuccess: (value) => successes.push(value),
      onError: (value) => errors.push(value),
    });
  }
  function nodes() {
    const result = [];
    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      result.push(node);
      walk(node.props?.children);
    }
    walk(render());
    return result;
  }
  render();
  return {
    nodes,
    button: () => nodes().find((node) => node.props?.className === "apple-button"),
    checkbox: () => nodes().find((node) => node.type === "input"),
    tokens, successes, errors, events, busy,
  };
}

test("existing Apple user logs in from a clean login without a checkbox or repeated registration consent", async () => {
  const attempts = [];
  const harness = await buttonHarness({ signIn: async (options) => {
    attempts.push(options);
    return { token: "jwt", user: { id: "existing" } };
  } });
  assert.equal(harness.checkbox(), undefined);
  assert.equal(harness.button().props.disabled, false);
  await harness.button().props.onClick();
  assert.equal(attempts[0].ageConfirmed, false);
  assert.deepEqual(harness.tokens, ["jwt"]);
  assert.equal(harness.successes.length, 1);
  assert.equal(harness.events[0].type, "meetyoulive:native-session-restored");
});

test("new user starting in login sees consent only after server requires registration, and can complete it", async () => {
  const attempts = [];
  const harness = await buttonHarness({ signIn: async (options) => {
    attempts.push(options);
    if (attempts.length === 1) throw Object.assign(new Error("register"), { code: "APPLE_REGISTRATION_REQUIRED" });
    return { token: "new-jwt", user: { id: "new", onboardingComplete: false } };
  } });
  assert.equal(harness.checkbox(), undefined);
  await harness.button().props.onClick();
  assert.equal(attempts[0].ageConfirmed, false);
  assert.equal(harness.tokens.length, 0);
  assert.equal(harness.successes.length, 0);
  assert.equal(harness.checkbox().props.checked, false);
  assert.equal(harness.button().props.disabled, true);
  await harness.button().props.onClick();
  assert.equal(attempts.length, 1, "even an invoked disabled handler cannot bypass consent");
  harness.checkbox().props.onChange({ target: { checked: true } });
  assert.equal(harness.button().props.disabled, false);
  await harness.button().props.onClick();
  assert.equal(attempts[1].ageConfirmed, true);
  assert.deepEqual(harness.tokens, ["new-jwt"]);
  assert.equal(harness.successes[0].user.onboardingComplete, false);
});

test("cancelling the registration step removes and resets consent", async () => {
  const attempts = [];
  const harness = await buttonHarness({ signIn: async (options) => {
    attempts.push(options);
    throw Object.assign(new Error("register"), { code: "APPLE_REGISTRATION_REQUIRED" });
  } });
  await harness.button().props.onClick();
  harness.checkbox().props.onChange({ target: { checked: true } });
  harness.nodes().find((node) => node.props?.className === "apple-cancel").props.onClick();
  assert.equal(harness.checkbox(), undefined);
  await harness.button().props.onClick();
  assert.equal(attempts[1].ageConfirmed, false);
  assert.equal(harness.checkbox().props.checked, false);
  assert.equal(harness.tokens.length, 0);
});

test("register reuses its existing explicit checkbox, while native cancellation never prompts registration", async () => {
  const attempts = [];
  for (const ageConfirmed of [false, true]) {
    const harness = await buttonHarness({ ageConfirmed, signIn: async (options) => {
      attempts.push(options);
      throw Object.assign(new Error("cancel"), { code: "APPLE_CANCELLED" });
    } });
    assert.equal(harness.checkbox(), undefined, "no duplicate consent checkbox on register");
    assert.equal(harness.button().props.disabled, !ageConfirmed);
    await harness.button().props.onClick();
    assert.equal(harness.tokens.length, 0);
    assert.equal(harness.checkbox(), undefined);
    if (ageConfirmed) assert.equal(harness.errors.at(-1), "auth.appleCancelled");
  }
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].ageConfirmed, true);
});
