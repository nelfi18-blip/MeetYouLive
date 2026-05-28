export const CANONICAL_HOST = "meetyoulive.net";
export const CANONICAL_SITE_URL = `https://${CANONICAL_HOST}`;

export function canonicalUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_SITE_URL}${normalizedPath}`;
}
