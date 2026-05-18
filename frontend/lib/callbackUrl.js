export const DEFAULT_CALLBACK_PATH = "/feed";

export const FORBIDDEN_CALLBACK_CHARS =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;

export function getSafeCallbackPath(value, fallback = DEFAULT_CALLBACK_PATH) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  let decodedValue = value;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (
    !decodedValue.startsWith("/") ||
    decodedValue.startsWith("//") ||
    decodedValue.includes("\\") ||
    FORBIDDEN_CALLBACK_CHARS.test(decodedValue)
  ) {
    return fallback;
  }

  try {
    const url = new URL(decodedValue, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;

    const path = `${url.pathname}${url.search}${url.hash}`;
    if (
      path === "/login" ||
      path === "/register" ||
      path.startsWith("/admin")
    ) {
      return fallback;
    }

    return path.startsWith("/") ? path : fallback;
  } catch {
    return fallback;
  }
}

export function getSafeCallbackPathFromNextUrl(nextUrl, fallback = DEFAULT_CALLBACK_PATH) {
  return getSafeCallbackPath(`${nextUrl.pathname}${nextUrl.search}`, fallback);
}
