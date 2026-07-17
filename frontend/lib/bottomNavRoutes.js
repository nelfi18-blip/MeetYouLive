export const BOTTOM_NAV_ROUTES = [
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
