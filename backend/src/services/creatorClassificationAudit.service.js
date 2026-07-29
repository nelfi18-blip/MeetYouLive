"use strict";

const APPROVED_CREATOR_ROLES = new Set(["creator", "subCreator"]);
const ADMIN_ROLES = new Set(["admin"]);
const CREATOR_AUDIT_FIELDS = [
  "_id",
  "role",
  "creatorStatus",
  "isVerifiedCreator",
  "creatorApprovedAt",
  "creatorProfile",
  "creatorApplication.reviewDecision",
  "creatorApplication.reviewedAt",
  "invitedByCreator",
  "agencyRelationship.parentCreatorId",
].join(" ");

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

const hasCreatorProfileData = (profile = {}) =>
  Boolean(profile) &&
  (["displayName", "bio", "category"].some((key) => hasValue(profile[key])) ||
    profile?.liveEnabled === true ||
    profile?.privateCallEnabled === true ||
    profile?.giftsEnabled === true ||
    profile?.exclusiveContentEnabled === true);

const hasApprovalHistory = (user = {}) =>
  user.creatorStatus === "approved" ||
  user.isVerifiedCreator === true ||
  user.creatorApprovedAt != null ||
  user.creatorApplication?.reviewDecision === "approved";

const inferCreatorRole = (user = {}) =>
  user.invitedByCreator || user.agencyRelationship?.parentCreatorId ? "subCreator" : "creator";

function getCreatorInconsistencies(user = {}) {
  if (ADMIN_ROLES.has(user.role)) return [];

  const issues = [];
  const approvedRole = APPROVED_CREATOR_ROLES.has(user.role);
  const approvalHistory = hasApprovalHistory(user);
  const profileData = hasCreatorProfileData(user.creatorProfile);

  if (user.creatorStatus === "approved" && !approvedRole) {
    issues.push("creatorStatus approved con role no creador");
  }
  if (approvedRole && user.creatorStatus !== "approved") {
    issues.push("role creador sin creatorStatus approved");
  }
  if (user.isVerifiedCreator === true && !approvedRole) {
    issues.push("isVerifiedCreator true con role no creador");
  }
  if (user.creatorApprovedAt != null && !approvedRole) {
    issues.push("creatorApprovedAt presente con role no creador");
  }
  if (user.creatorApplication?.reviewDecision === "approved" && !approvedRole) {
    issues.push("historial de aprobación con role no creador");
  }
  if (profileData && !approvedRole && approvalHistory) {
    issues.push("creatorProfile presente con clasificación degradada");
  }

  return issues;
}

function buildCreatorRepairUpdate(user = {}) {
  if (ADMIN_ROLES.has(user.role)) return null;
  if (!hasApprovalHistory(user)) return null;

  const expectedRole = APPROVED_CREATOR_ROLES.has(user.role) ? user.role : inferCreatorRole(user);
  const $set = {};
  if (user.role !== expectedRole) $set.role = expectedRole;
  if (user.creatorStatus !== "approved") $set.creatorStatus = "approved";
  if (user.isVerifiedCreator !== true) $set.isVerifiedCreator = true;

  return Object.keys($set).length ? { $set } : null;
}

function summarizeCreatorRows(rows = []) {
  const counts = {
    totalUsersAudited: rows.length,
    adminsSkipped: 0,
    approvedCreators: 0,
    inconsistentAccounts: 0,
    repairableAccounts: 0,
  };

  for (const row of rows) {
    if (row.adminSkipped) counts.adminsSkipped += 1;
    if (row.officialApprovedCreator) counts.approvedCreators += 1;
    if (row.issues.length) counts.inconsistentAccounts += 1;
    if (row.repairable) counts.repairableAccounts += 1;
  }

  return counts;
}

function serializeCreatorAuditRow(user = {}) {
  const issues = getCreatorInconsistencies(user);
  const repair = buildCreatorRepairUpdate(user);
  return {
    userId: String(user._id),
    role: user.role || null,
    creatorStatus: user.creatorStatus || null,
    isVerifiedCreator: user.isVerifiedCreator === true,
    hasCreatorApprovedAt: user.creatorApprovedAt != null,
    hasCreatorProfile: hasCreatorProfileData(user.creatorProfile),
    reviewDecision: user.creatorApplication?.reviewDecision || null,
    officialApprovedCreator: APPROVED_CREATOR_ROLES.has(user.role) && user.creatorStatus === "approved",
    adminSkipped: ADMIN_ROLES.has(user.role),
    issues,
    repairable: Boolean(repair),
    repair: repair ? repair.$set : null,
  };
}

async function runCreatorClassificationAudit(User, options = {}) {
  const execute = options.execute === true;
  const users = await User.find({
    $or: [
      { role: { $in: ["creator", "subCreator", "creator_pending", "user", "admin"] } },
      { creatorStatus: { $in: ["pending", "approved", "rejected", "suspended"] } },
      { isVerifiedCreator: true },
      { creatorApprovedAt: { $ne: null } },
      { "creatorApplication.reviewDecision": "approved" },
    ],
  }).select(CREATOR_AUDIT_FIELDS).lean();

  const rows = users.map(serializeCreatorAuditRow);
  const repairableRows = rows.filter((row) => row.repairable && !row.adminSkipped);

  let modifiedCount = 0;
  if (execute && repairableRows.length > 0) {
    const operations = repairableRows.map((row) => ({
      updateOne: {
        filter: { _id: row.userId, role: { $ne: "admin" } },
        update: { $set: row.repair },
      },
    }));
    const result = await User.bulkWrite(operations);
    modifiedCount = result.modifiedCount || 0;
  }

  return {
    ok: true,
    dryRun: !execute,
    generatedAt: new Date().toISOString(),
    officialApprovedCreatorRule: 'role in ["creator","subCreator"] AND creatorStatus === "approved"',
    counts: summarizeCreatorRows(rows),
    modifiedCount,
    users: rows.filter((row) => row.issues.length || row.repairable),
  };
}

module.exports = {
  CREATOR_AUDIT_FIELDS,
  buildCreatorRepairUpdate,
  getCreatorInconsistencies,
  hasApprovalHistory,
  runCreatorClassificationAudit,
  serializeCreatorAuditRow,
};
