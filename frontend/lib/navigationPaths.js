/**
 * Get the appropriate home path based on user role.
 * Admin users go to /admin, creators go to /creator, regular users go to /dashboard.
 * Returns "/" for public visitors (when no role provided).
 */
export function getHomePath(userRole) {
  if (!userRole) return "/";
  if (userRole === "admin") return "/admin";
  if (userRole === "creator") return "/creator";
  return "/dashboard";
}
