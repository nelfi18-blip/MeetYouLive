/**
 * Returns true if the user is an approved creator.
 *
 * An approved creator has both role === "creator" and creatorStatus === "approved".
 * This is the canonical creator detection check used across all frontend screens and
 * mirrors the guard used by all backend creator API endpoints.
 *
 * Pending, rejected, and suspended users have role === "user" (the backend resets it),
 * so they are never matched by this check.
 *
 * @param {object|null|undefined} user - The user object returned by /api/user/me
 * @returns {boolean}
 */
export function isApprovedCreator(user) {
  return user?.role === "creator" && user?.creatorStatus === "approved";
}
