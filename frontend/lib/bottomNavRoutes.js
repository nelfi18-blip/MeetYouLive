export const BOTTOM_NAV_ROUTES = [
  "/feed",
  "/explore",
  "/matches",
  "/chats",
  "/profile",
  "/coins",
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
