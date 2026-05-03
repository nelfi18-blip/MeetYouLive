const StaffAuditLog = require("../models/StaffAuditLog.js");

/**
 * Log a staff action for audit trail
 * @param {Object} params - Audit log parameters
 * @param {string} params.staffId - MongoDB ObjectId of the staff member
 * @param {string} params.staffRole - Role of the staff member (admin, moderator, etc.)
 * @param {string} params.action - Description of the action (e.g., "suspend_user", "approve_creator")
 * @param {string} params.targetType - Type of target entity
 * @param {string} params.targetId - MongoDB ObjectId of the target (optional)
 * @param {string} params.targetIdentifier - Human-readable identifier (username, email, etc.)
 * @param {Object} params.details - Additional details about the action
 * @param {string} params.ipAddress - IP address of the request (optional)
 */
async function logStaffAction({
  staffId,
  staffRole,
  action,
  targetType,
  targetId = null,
  targetIdentifier = "",
  details = {},
  ipAddress = null,
}) {
  try {
    await StaffAuditLog.create({
      staffId,
      staffRole,
      action,
      targetType,
      targetId,
      targetIdentifier,
      details,
      ipAddress,
    });
  } catch (err) {
    // Log to console but don't fail the main operation
    console.error("❌ Failed to log staff action:", err.message);
  }
}

/**
 * Get recent audit logs with filters
 * @param {Object} filters - Query filters
 * @param {number} limit - Number of logs to retrieve
 * @returns {Promise<Array>} Array of audit logs
 */
async function getAuditLogs(filters = {}, limit = 100) {
  return StaffAuditLog.find(filters)
    .populate("staffId", "username email name")
    .sort({ createdAt: -1 })
    .limit(limit);
}

module.exports = {
  logStaffAction,
  getAuditLogs,
};
