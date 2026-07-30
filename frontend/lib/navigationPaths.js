/**
 * Get the appropriate home path based on user role.
 * Admin users go to /admin, regular users go to /dashboard.
 * Returns "/" for public visitors (when no role provided).
 */
export function getHomePath(userRole) {
  if (!userRole) return "/";
  if (userRole === "admin") return "/admin";
  return "/dashboard";
}
