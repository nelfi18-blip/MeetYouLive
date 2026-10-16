import test from "node:test";
import assert from "node:assert/strict";
import { isNativeMobileApp } from "../lib/mobileEnvironment.js";
import { shouldUseNativeStorePayments } from "../lib/mobilePayments.js";
import { redirectToTrustedCheckout, getTrustedCheckoutUrl } from "../lib/checkoutRedirect.js";

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
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function fakeNativeWindow(platform) {
  return {
    location: { href: "" },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => platform,
    },
  };
}

function fakeWebWindow(href = "https://meetyoulive.net/coins") {
  return {
    location: { href },
    Capacitor: {
      isNativePlatform: () => false,
      getPlatform: () => "web",
    },
  };
}

test("shouldUseNativeStorePayments() is true for the iOS native app", () => {
  withWindow(fakeNativeWindow("ios"), () => {
    assert.equal(isNativeMobileApp(), true);
    assert.equal(shouldUseNativeStorePayments(), true);
  });
});

test("shouldUseNativeStorePayments() is true for the Android native app", () => {
  withWindow(fakeNativeWindow("android"), () => {
    assert.equal(isNativeMobileApp(), true);
    assert.equal(shouldUseNativeStorePayments(), true);
  });
});

test("shouldUseNativeStorePayments() is false for a regular web/mobile browser", () => {
  withWindow(fakeWebWindow(), () => {
    assert.equal(isNativeMobileApp(), false);
    assert.equal(shouldUseNativeStorePayments(), false);
  });

  // Mobile Safari/Chrome user agents must never be mistaken for the native
  // app just because they run on iOS/Android hardware.
  withWindow(
    {
      location: { href: "https://meetyoulive.net/coins" },
      navigator: {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    },
    () => {
      assert.equal(isNativeMobileApp(), false);
      assert.equal(shouldUseNativeStorePayments(), false);
    }
  );
});

test("getTrustedCheckoutUrl() only accepts Stripe Checkout URLs", () => {
  assert.equal(getTrustedCheckoutUrl("https://checkout.stripe.com/pay/cs_test_123"), "https://checkout.stripe.com/pay/cs_test_123");
  assert.equal(getTrustedCheckoutUrl("https://evil.example.com/checkout.stripe.com"), null);
  assert.equal(getTrustedCheckoutUrl(""), null);
  assert.equal(getTrustedCheckoutUrl(undefined), null);
});

test("redirectToTrustedCheckout() blocks Stripe Checkout inside the native iOS app and does not navigate", () => {
  withWindow(fakeNativeWindow("ios"), () => {
    const opened = redirectToTrustedCheckout("https://checkout.stripe.com/pay/cs_test_ios");
    assert.equal(opened, false);
    assert.equal(globalThis.window.location.href, "");
  });
});

test("redirectToTrustedCheckout() blocks Stripe Checkout inside the native Android app and does not navigate", () => {
  withWindow(fakeNativeWindow("android"), () => {
    const opened = redirectToTrustedCheckout("https://checkout.stripe.com/pay/cs_test_android");
    assert.equal(opened, false);
    assert.equal(globalThis.window.location.href, "");
  });
});

test("redirectToTrustedCheckout() keeps working normally on the web", () => {
  withWindow(fakeWebWindow(), () => {
    const opened = redirectToTrustedCheckout("https://checkout.stripe.com/pay/cs_test_web");
    assert.equal(opened, true);
    assert.equal(globalThis.window.location.href, "https://checkout.stripe.com/pay/cs_test_web");
  });
});

test("redirectToTrustedCheckout() fails closed for an untrusted URL without falling back to any navigation", () => {
  withWindow(fakeWebWindow(), () => {
    const opened = redirectToTrustedCheckout("https://not-stripe.example.com/checkout");
    assert.equal(opened, false);
    assert.equal(globalThis.window.location.href, "https://meetyoulive.net/coins");
  });

  withWindow(fakeNativeWindow("ios"), () => {
    const opened = redirectToTrustedCheckout("https://not-stripe.example.com/checkout");
    assert.equal(opened, false);
    assert.equal(globalThis.window.location.href, "");
  });
});
