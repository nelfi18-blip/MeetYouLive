import { getInternalAppPath, isExternalHttpUrl, isInternalAppUrl } from "./nativeUrlPolicy";

export const NATIVE_DEFAULT_AUTH_PATH = "/feed";
export const NATIVE_LOGIN_PATH = "/login";

const NATIVE_AUTH_BLOCKED_PATHS = new Set(["/", "/login", "/register"]);

export function normalizeNativeAppPath(value, fallback = NATIVE_DEFAULT_AUTH_PATH) {
  if (!value || typeof value !== "string") return fallback;

  const appPath = isInternalAppUrl(value) ? getInternalAppPath(value) : value;
  if (!appPath || !appPath.startsWith("/") || appPath.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(appPath, "https://meetyoulive.net");
    if (
      NATIVE_AUTH_BLOCKED_PATHS.has(parsed.pathname) ||
      parsed.pathname.startsWith("/api/") ||
      parsed.pathname.startsWith("/admin")
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function shouldPersistNativeAppPath(value) {
  return normalizeNativeAppPath(value, null) !== null;
}

export function getNativeSessionStartPath({ currentPath, storedPath, callbackPath } = {}) {
  return (
    normalizeNativeAppPath(callbackPath, null) ||
    normalizeNativeAppPath(currentPath, null) ||
    normalizeNativeAppPath(storedPath, null) ||
    NATIVE_DEFAULT_AUTH_PATH
  );
}

export function shouldReplaceNativeStartPath(currentPath) {
  return normalizeNativeAppPath(currentPath, null) === null;
}

export function shouldOpenUrlOutsideNativeWebView(url) {
  return isExternalHttpUrl(url);
}

export function getNativeInvalidSessionPath() {
  return NATIVE_LOGIN_PATH;
}
