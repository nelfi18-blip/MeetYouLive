export const PUBLIC_ROUTE_PATHS = new Set([
  "/",
  "/privacy",
  "/terms",
  "/refund",
  "/contact",
]);

export const PROTECTED_ROUTE_PREFIXES = [
  "/agency",
  "/call",
  "/calls",
  "/chats",
  "/coins",
  "/creator",
  "/crush",
  "/daily-reward",
  "/dashboard",
  "/exclusive",
  "/explore",
  "/feed",
  "/gifts",
  "/live",
  "/matches",
  "/notifications",
  "/onboarding",
  "/passes",
  "/private-calls",
  "/profile",
  "/ranking",
  "/referral",
  "/rooms",
  "/settings",
  "/sparks",
  "/subscription",
  "/videos",
  "/vip",
  "/wallet",
];

export function isPublicRoute(pathname) {
  return PUBLIC_ROUTE_PATHS.has(pathname);
}

export function matchesRoutePrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedRoutePath(pathname) {
  return PROTECTED_ROUTE_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix)
  );
}

export function shouldRedirectUnauthenticatedToLogin({
  pathname,
  hasBackendSession,
  hasNextAuthSession,
}) {
  return (
    !isPublicRoute(pathname) &&
    !hasBackendSession &&
    !hasNextAuthSession &&
    isProtectedRoutePath(pathname)
  );
}
