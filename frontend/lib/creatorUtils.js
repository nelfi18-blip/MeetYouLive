/**
 * Returns true if the user is an approved creator or subCreator.
 *
 * An approved creator has role === "creator" OR role === "subCreator" and creatorStatus === "approved".
 * This is the canonical creator detection check used across all frontend screens and
 * mirrors the guard used by all backend creator API endpoints.
 *
 * When an admin rejects or suspends a creator the backend resets role to "user", so
 * those users are never matched by this check.
 *
 * @param {object|null|undefined} user - The user object returned by /api/user/me
 * @returns {boolean}
 */
export function isApprovedCreator(user) {
  return (user?.role === "creator" || user?.role === "subCreator") && user?.creatorStatus === "approved";
}

/**
 * Returns true if the user is a full creator (not a subCreator).
 * Full creators can invite others and have full agency privileges.
 *
 * @param {object|null|undefined} user - The user object returned by /api/user/me
 * @returns {boolean}
 */
export function isFullCreator(user) {
  return user?.role === "creator" && user?.creatorStatus === "approved";
}

/**
 * Returns true if the user is a subCreator (level 2 creator).
 * SubCreators can stream and earn but cannot invite others.
 *
 * @param {object|null|undefined} user - The user object returned by /api/user/me
 * @returns {boolean}
 */
export function isSubCreator(user) {
  return user?.role === "subCreator" && user?.creatorStatus === "approved";
}
