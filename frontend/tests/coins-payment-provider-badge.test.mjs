// Regression test for /coins showing "Stripe integrated" even inside the
// native iOS/Android apps. getCoinsPaymentProvider() (frontend/lib/
// paymentProvider.js) is the single source of truth coins/page.jsx uses to
// pick the provider badge/subtitle text; this only asserts the DISPLAY
// decision (web -> Stripe, iOS native -> Apple, Android native -> Google
// Play). It never touches StoreKit, Google Play Billing, or Stripe
// purchase/verification logic.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Capacitor } from "@capacitor/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { getCoinsPaymentProvider } = await import("../lib/paymentProvider.js");

const originalWindow = globalThis.window;
const originalPlatform = Capacitor.getPlatform;
const originalNative = Capacitor.isNativePlatform;

function platform(name) {
  Capacitor.getPlatform = () => name;
  Capacitor.isNativePlatform = () => name !== "web";
  globalThis.window = { Capacitor };
}

afterEach(() => {
  globalThis.window = originalWindow;
  Capacitor.getPlatform = originalPlatform;
  Capacitor.isNativePlatform = originalNative;
});

test("getCoinsPaymentProvider returns stripe on the web (no native bridge)", () => {
  platform("web");
  assert.equal(getCoinsPaymentProvider(), "stripe");
});

test("getCoinsPaymentProvider returns apple inside the iOS native app", () => {
  platform("ios");
  assert.equal(getCoinsPaymentProvider(), "apple");
});

test("getCoinsPaymentProvider returns google_play inside the Android native app", () => {
  platform("android");
  assert.equal(getCoinsPaymentProvider(), "google_play");
});

test("en/es/pt messages define a translation for every coins provider key used by /coins", async () => {
  const messagesDir = join(__dirname, "..", "messages");
  const keys = [
    "stripeIntegrated",
    "providerApple",
    "providerGooglePlay",
    "packagesSubtitle",
    "packagesSubtitleApple",
    "packagesSubtitleGooglePlay",
  ];
  for (const lang of ["en", "es", "pt"]) {
    const messages = JSON.parse(await readFile(join(messagesDir, `${lang}.json`), "utf8"));
    for (const key of keys) {
      assert.equal(
        typeof messages.coins?.[key],
        "string",
        `coins.${key} must be a non-empty string in ${lang}.json`
      );
      assert.ok(messages.coins[key].length > 0, `coins.${key} must not be empty in ${lang}.json`);
    }
  }
});
