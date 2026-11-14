import { isProtectedRoutePath } from "./publicAccess.js";
import { isBottomNavRoute, isImmersiveBottomNavRoute } from "./bottomNavRoutes.js";

// Existing account pages only. Public marketing, the registration funnel,
// onboarding, the preview, and all admin screens never show this control.
// Random is a protected-in-page experience whose URL isn't in the shared
// middleware protected-route list, so include it explicitly.
export function getUniverseReturnPlacement(pathname) {
  if (!pathname || typeof pathname !== "string") return null;
  if (pathname === "/universe" || pathname === "/universe-preview") return null;
  if (pathname === "/onboarding" || pathname.startsWith("/admin")
    || pathname.startsWith("/auth/") || pathname.startsWith("/dev")) return null;
  if (!isProtectedRoutePath(pathname) && pathname !== "/random" && pathname !== "/mode"
    && pathname !== "/creator-request") return null;
  if (isImmersiveBottomNavRoute(pathname)
    || pathname.startsWith("/call/") || pathname.startsWith("/calls/")
    || pathname === "/private-calls") return "immersive";
  if (isBottomNavRoute(pathname)) return "above-nav";
  return "compact";
}

// Camera/microphone sessions must not be accidentally abandoned.
export function needsUniverseReturnConfirmation(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  return pathname === "/random" || pathname.startsWith("/live/")
    || pathname.startsWith("/call/") || pathname.startsWith("/calls/")
    || pathname === "/private-calls";
}
