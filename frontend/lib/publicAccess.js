export const PUBLIC_ROUTE_PATHS = new Set([
  "/",
  "/about",
  "/how-it-works",
  "/legal",
  "/security",
  "/community-guidelines",
  "/privacy",
  "/terms",
  "/cookies",
  "/refund",
  "/refunds",
  "/payments-refunds",
  "/acceptable-use",
  "/pricing",
  "/content-policy",
  "/creator-policy",
  "/help-center",
  "/dmca",
  "/safety-moderation",
  "/child-safety",
  "/account-deletion",
  "/contact",
  "/law-enforcement",
  "/appeal",
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
  "/dev",
  "/exclusive",
  "/explore",
  "/feed",
  "/gifts",
  "/live",
  "/match",
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

// Exact-path exceptions carved out of an otherwise-protected prefix above.
// `/agency/invite` is the public landing page for a creator's personal
// invite link — it must be reachable by brand-new, signed-out visitors
// (it only displays the inviter's public identity and never mutates data),
// even though the rest of `/agency/*` requires authentication.
export const PUBLIC_EXCEPTION_PATHS = new Set(["/agency/invite"]);

export function isPublicRoute(pathname) {
  return PUBLIC_ROUTE_PATHS.has(pathname) || PUBLIC_EXCEPTION_PATHS.has(pathname);
}

export function matchesRoutePrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedRoutePath(pathname) {
  if (PUBLIC_EXCEPTION_PATHS.has(pathname)) return false;
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
