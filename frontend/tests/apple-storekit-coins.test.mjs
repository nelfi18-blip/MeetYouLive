import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { Capacitor } from "@capacitor/core";

// AppleIAP's plugin methods (registered via @capacitor/core's
// registerPlugin()) only route through Capacitor.nativePromise() when a
// PluginHeader for "AppleIAP" exists at *registration time* (module
// import), so this must be set up before dynamically importing
// appleStoreKit.js below.
Capacitor.PluginHeaders = [
  {
    name: "AppleIAP",
    methods: [
      { name: "queryProducts", rtype: "promise" },
      { name: "purchase", rtype: "promise" },
      { name: "queryPendingTransactions", rtype: "promise" },
      { name: "finishTransaction", rtype: "promise" },
    ],
  },
];

const {
  isIOSNativeBillingAvailable,
  verifyAppleCoinsPurchase,
} = await import("../lib/appleStoreKit.js");

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalPlatform = Capacitor.getPlatform;
const originalNative = Capacitor.isNativePlatform;
const originalAvailability = Capacitor.isPluginAvailable;
const originalNativePromise = Capacitor.nativePromise;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

// Mirrors tests/apple-native-auth.test.mjs's pattern: override
// Capacitor.isPluginAvailable() directly rather than depending on
// @capacitor/core's internal PluginHeaders bookkeeping, which binds
// getPlatform() to a closure captured at import time and would not react
// to reassigning Capacitor.getPlatform in tests.
function platform(name, pluginAvailable = true) {
  Capacitor.getPlatform = () => name;
  Capacitor.isNativePlatform = () => name !== "web";
  Capacitor.isPluginAvailable = () => pluginAvailable;
  globalThis.window = { Capacitor };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  Capacitor.getPlatform = originalPlatform;
  Capacitor.isNativePlatform = originalNative;
  Capacitor.isPluginAvailable = originalAvailability;
  Capacitor.nativePromise = originalNativePromise;
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
});

test("isIOSNativeBillingAvailable requires BOTH the iOS platform AND the AppleIAP plugin actually being present", () => {
  for (const name of ["web", "android"]) {
    platform(name);
    assert.equal(isIOSNativeBillingAvailable(), false);
  }
  // Simulates an older TestFlight build (e.g. build 4) that is iOS-native
  // but predates the AppleIAPPlugin registration — must fail safe, not
  // throw, and never be treated as native-billing-capable.
  platform("ios", false);
  assert.equal(isIOSNativeBillingAvailable(), false, "iOS build without the plugin stays unavailable");

  platform("ios", true);
  assert.equal(isIOSNativeBillingAvailable(), true);
});

test("verifyAppleCoinsPurchase finishes the transaction when the backend explicitly confirms fullyCredited: true", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ coinsCredited: 100, newBalance: 500, fullyCredited: true }),
  });
  const finishCalls = [];
  Capacitor.nativePromise = async (plugin, method, options) => {
    if (method === "finishTransaction") finishCalls.push(options);
    return { ok: true };
  };
  const data = await verifyAppleCoinsPurchase({ productId: "coins_pack_100", transactionId: "123" }, "token");
  assert.equal(data.fullyCredited, true);
  assert.deepEqual(finishCalls, [{ transactionId: "123" }]);
});

test("verifyAppleCoinsPurchase never finishes the transaction on a 202 PURCHASE_RECONCILIATION_PENDING response", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  // A 202 reconciliation-pending response is still `response.ok` (202 is a
  // 2xx status) but intentionally omits `fullyCredited` entirely, since the
  // backend genuinely doesn't know yet whether the purchase was credited.
  globalThis.fetch = async () => ({
    ok: true,
    status: 202,
    json: async () => ({ code: "PURCHASE_RECONCILIATION_PENDING", message: "pending" }),
  });
  const finishCalls = [];
  Capacitor.nativePromise = async (plugin, method, options) => {
    if (method === "finishTransaction") finishCalls.push(options);
    return { ok: true };
  };
  const data = await verifyAppleCoinsPurchase({ productId: "coins_pack_100", transactionId: "456" }, "token");
  assert.equal(data.code, "PURCHASE_RECONCILIATION_PENDING");
  assert.deepEqual(finishCalls, [], "must stay unfinished so it is retried instead of being lost");
});

test("verifyAppleCoinsPurchase never finishes the transaction on a partially-credited response", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      coinsCredited: 40,
      fullyCredited: false,
      cappedByLimit: true,
      code: "PURCHASE_PARTIALLY_CREDITED",
    }),
  });
  const finishCalls = [];
  Capacitor.nativePromise = async (plugin, method, options) => {
    if (method === "finishTransaction") finishCalls.push(options);
    return { ok: true };
  };
  const data = await verifyAppleCoinsPurchase({ productId: "coins_pack_100", transactionId: "789" }, "token");
  assert.equal(data.fullyCredited, false);
  assert.deepEqual(finishCalls, []);
});

test("verifyAppleCoinsPurchase never finishes the transaction when the backend response omits fullyCredited entirely", async () => {
  platform("ios");
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ message: "unexpected shape with no fullyCredited field" }),
  });
  const finishCalls = [];
  Capacitor.nativePromise = async (plugin, method, options) => {
    if (method === "finishTransaction") finishCalls.push(options);
    return { ok: true };
  };
  await verifyAppleCoinsPurchase({ productId: "coins_pack_100", transactionId: "999" }, "token");
  assert.deepEqual(finishCalls, [], "an ambiguous response must never be treated as safe-to-finish");
});
