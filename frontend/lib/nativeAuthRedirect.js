import { normalizeCallbackPath } from "./redirects.js";

export const NATIVE_AUTH_CALLBACK_PATH = "/auth/native-callback";
export const NATIVE_AUTH_SUCCESS_DEEP_LINK = "meetyoulive://auth/success";

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
