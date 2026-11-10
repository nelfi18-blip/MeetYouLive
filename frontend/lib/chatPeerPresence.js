/**
 * Converts the existing authenticated /api/user/online snapshot into a
 * contact-specific online state. An invalid response is "unknown", not
 * "offline": a failed request must never produce a misleading green/gray dot.
 */
export function getPeerOnlineFromSnapshot(users, peerId) {
  if (!peerId || !Array.isArray(users)) return null;
  const target = String(peerId);
  return users.some((user) => user?._id != null && String(user._id) === target);
}
