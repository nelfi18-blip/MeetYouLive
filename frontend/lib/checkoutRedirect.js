"use client";

import { isNativeMobileApp } from "./mobileEnvironment.js";

const TRUSTED_CHECKOUT_ORIGINS = new Set(["https://checkout.stripe.com"]);

export function getTrustedCheckoutUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url);
    return TRUSTED_CHECKOUT_ORIGINS.has(parsed.origin) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function redirectToTrustedCheckout(url) {
  const trustedUrl = getTrustedCheckoutUrl(url);
  if (!trustedUrl) return false;
  if (isNativeMobileApp()) {
    // Centralized safety net: no digital-goods Stripe Checkout may open
    // inside the native iOS/Android shells, even if a caller forgets to
    // check shouldUseNativeStorePayments() first. Fail closed here instead
    // of falling back to window.location or an in-app browser.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[checkoutRedirect] Blocked Stripe Checkout inside native app");
    }
    return false;
  }
  window.location.href = trustedUrl;
  return true;
}
