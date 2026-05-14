// Shared list of routes where the global chrome (top Navbar and bottom BottomNav)
// must NOT appear. Both NavbarWrapper and BottomNavWrapper consume this so the
// two stay in sync and we always have a single bottom navigation across the app.
export const CHROME_HIDDEN_ROUTES = ["/login", "/register", "/", "/onboarding"];

// True if the given pathname is a chrome-free route (login/register/landing/etc.
// or anywhere under /admin which uses its own layout).
export function isChromeHiddenPath(pathname) {
  if (!pathname) return true;
  if (CHROME_HIDDEN_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}
