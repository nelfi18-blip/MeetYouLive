"use client";

import { Browser } from "@capacitor/browser";
import { isNativeMobileApp } from "./mobileEnvironment";
import { getNativeGoogleLoginUrl } from "./nativeGoogleLoginUrl";

export async function startNativeGoogleLogin(callbackPath = "/feed") {
  if (!isNativeMobileApp()) return false;
  const origin = typeof window === "undefined" ? "https://meetyoulive.net" : window.location.origin;
  await Browser.open({
    url: getNativeGoogleLoginUrl(callbackPath, origin),
    presentationStyle: "fullscreen",
  });
  return true;
}
