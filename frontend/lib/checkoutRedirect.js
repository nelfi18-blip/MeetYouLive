"use client";

import { Browser } from "@capacitor/browser";
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
    Browser.open({ url: trustedUrl, presentationStyle: "fullscreen" }).catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[checkoutRedirect] Browser.open failed:", error);
      }
      window.location.href = trustedUrl;
    });
    return true;
  }
  window.location.href = trustedUrl;
  return true;
}
