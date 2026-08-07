"use client";

import { Browser } from "@capacitor/browser";
import { isNativeMobileApp } from "./mobileEnvironment.js";
import { getNativeGoogleLoginUrl } from "./nativeGoogleLoginUrl.js";

export async function startNativeGoogleLogin(callbackPath = "/feed") {
  if (!isNativeMobileApp()) return false;
  const origin = typeof window === "undefined" ? "https://meetyoulive.net" : window.location.origin;
  try {
    await Browser.open({
      url: getNativeGoogleLoginUrl(callbackPath, origin),
      presentationStyle: "fullscreen",
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[nativeGoogleLogin] Browser.open failed:", error);
    }
    return false;
  }
  return true;
}
