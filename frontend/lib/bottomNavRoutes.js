// Single source of truth for routes where the modern <BottomNav /> is shown
// (see components/BottomNavWrapper.jsx). Imported by Navbar.jsx so the legacy
// in-Navbar `.bottom-nav` is suppressed on these routes, preventing two
// stacked bottom navigation bars on mobile.
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
