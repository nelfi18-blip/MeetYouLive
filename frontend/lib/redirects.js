export const DEFAULT_AUTH_REDIRECT = "/feed";

// `.local` is an arbitrary URL parser base; it is never used as a redirect target.
const CALLBACK_URL_BASE = "https://meetyoulive.local";

function parseRelativePath(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    return new URL(value, CALLBACK_URL_BASE);
  } catch {
    return null;
  }
}

export function isSafeAppCallbackPath(pathname) {
  return (
    pathname !== "/" &&
    pathname !== "/login" &&
    pathname !== "/register" &&
    !pathname.startsWith("/api/auth")
  );
}

export function normalizeCallbackPath(value, fallback = DEFAULT_AUTH_REDIRECT) {
  const parsed = parseRelativePath(value);

  if (!parsed || !isSafeAppCallbackPath(parsed.pathname)) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function normalizeNextAuthRedirectPath(value, fallback = DEFAULT_AUTH_REDIRECT) {
  const parsed = parseRelativePath(value);

  if (!parsed) {
    return fallback;
  }

  if (parsed.pathname === "/login") {
    const callbackPath = normalizeCallbackPath(
      parsed.searchParams.get("callbackUrl"),
      fallback
    );
    return `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
  }

  return isSafeAppCallbackPath(parsed.pathname)
    ? `${parsed.pathname}${parsed.search}${parsed.hash}`
    : fallback;
}
