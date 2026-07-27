export const APP_ORIGINS = new Set(["https://meetyoulive.net", "https://www.meetyoulive.net"]);

export function getUrlOrigin(url) {
  try {
    return new URL(url, "https://meetyoulive.net").origin;
  } catch {
    return null;
  }
}

export function isInternalAppUrl(url) {
  const origin = getUrlOrigin(url);
  return origin ? APP_ORIGINS.has(origin) : false;
}

export function getInternalAppPath(url) {
  try {
    const parsed = new URL(url, "https://meetyoulive.net");
    if (!APP_ORIGINS.has(parsed.origin)) return null;
    return `${parsed.pathname || "/"}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function isExternalHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !APP_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}
