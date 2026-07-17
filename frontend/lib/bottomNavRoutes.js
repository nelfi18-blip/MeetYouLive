export const BOTTOM_NAV_ROUTES = [
  // /dashboard is the legacy Home/Dashboard screen; the premium nav's Home
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

export function isBottomNavRoute(pathname) {
  if (!pathname) return false;
  return BOTTOM_NAV_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
