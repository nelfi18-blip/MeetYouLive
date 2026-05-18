// Shared list of routes that render the modern <BottomNav /> bar.
//
// Both BottomNavWrapper (which renders the bottom nav) and Navbar (which
// must SKIP its own internal mobile `.bottom-nav` on these routes to avoid
// duplicate bottom navigation bars on mobile) should import from here.

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
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}
