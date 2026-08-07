import { normalizeCallbackPath } from "./redirects.js";

export const NATIVE_AUTH_CALLBACK_PATH = "/auth/native-callback";
export const NATIVE_AUTH_SUCCESS_DEEP_LINK = "meetyoulive://auth/success";
export const NATIVE_ANDROID_PACKAGE_ID = "com.meetyoulive.app";

export function getNativeAuthCallbackPath(callbackPath = "/feed") {
  const safeCallbackPath = normalizeCallbackPath(callbackPath);
  return `${NATIVE_AUTH_CALLBACK_PATH}?callbackUrl=${encodeURIComponent(safeCallbackPath)}`;
}

export function buildNativeAuthSuccessDeepLink(token, callbackPath = "/feed") {
  const redirectUrl = new URL(NATIVE_AUTH_SUCCESS_DEEP_LINK);
  redirectUrl.searchParams.set("token", token);
  redirectUrl.searchParams.set("callbackUrl", normalizeCallbackPath(callbackPath));
  return redirectUrl.toString();
}

export function buildNativeAuthSuccessAndroidIntentUrl(deepLink) {
  const redirectUrl = new URL(deepLink);
  return `intent://${redirectUrl.host}${redirectUrl.pathname}${redirectUrl.search}#Intent;scheme=meetyoulive;package=${NATIVE_ANDROID_PACKAGE_ID};end`;
}
