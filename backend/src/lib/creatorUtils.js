/**
 * Utility functions for creator validation
 */

/**
 * Check if a user is an approved creator
 * @param {Object} user - User object with role and creatorStatus
 * @returns {boolean}
 */
const isApprovedCreator = (user) => {
  if (!user) return false;
  const role = user.role;
  const status = user.creatorStatus;
  return (role === "creator" || role === "subCreator") && status === "approved";
};

module.exports = {
  isApprovedCreator,
};
