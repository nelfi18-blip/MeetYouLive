// Pages that show the modern bottom nav (`<BottomNav />` rendered by
// `BottomNavWrapper`). These routes must NOT also render Navbar.jsx's
// internal mobile `.bottom-nav`, otherwise two bottom navs stack on mobile.
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
