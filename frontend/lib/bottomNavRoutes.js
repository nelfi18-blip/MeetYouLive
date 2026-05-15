// Routes where the modern <BottomNav> (from BottomNavWrapper) is rendered.
// Shared between BottomNavWrapper.jsx and Navbar.jsx so we can avoid rendering
// two bottom navigation bars at the same time.
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
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}
