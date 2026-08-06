export const BOTTOM_NAV_ROUTES = [
  // /dashboard is the Home/Dashboard screen; the premium nav's Home
  // item still links to the role-aware home path handled by getHomePath().
  "/dashboard",
  "/feed",
  "/explore",
  "/crush",
  "/matches",
  "/chats",
  "/profile",
  "/live",
  "/creator",
  "/settings",
  "/coins",
  "/subscription",
  "/vip",
  "/notifications",
  "/gifts",
  "/ranking",
  "/sparks",
  "/passes",
];

export const IMMERSIVE_BOTTOM_NAV_EXCLUSIONS = [
  "/live/start",
];

export function isImmersiveBottomNavRoute(pathname) {
  if (!pathname) return false;
  if (IMMERSIVE_BOTTOM_NAV_EXCLUSIONS.includes(pathname)) return true;
  return pathname.startsWith("/live/") && pathname !== "/live";
}

export function isBottomNavRoute(pathname) {
  if (!pathname) return false;
  if (isImmersiveBottomNavRoute(pathname)) return false;
  return BOTTOM_NAV_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
