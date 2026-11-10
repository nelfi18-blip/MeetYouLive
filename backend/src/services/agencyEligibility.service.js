"use strict";

// Read-only agency eligibility. All evidence comes from persisted backend state,
// never from request body, client-generated statistics, or inferred engagement.
const Live = require("../models/Live.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const { calculateAge } = require("../lib/age.js");
const { getAuthenticityStatus } = require("../lib/profileAuthenticity.js");

const MIN_CREATOR_DAYS = 30;
const MIN_COMPLETED_LIVES = 3;
const MIN_AGE = 18;
const DAY_MS = 24 * 60 * 60 * 1000;
const LINKED_STATUSES = ["pending", "active", "suspended"];

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getProgress(user, { now = new Date(), completedLives = 0, linked = false } = {}) {
  const approvedAt = validDate(user?.creatorApprovedAt);
  const approvedForMs = approvedAt ? now.getTime() - approvedAt.getTime() : -1;
  const daysAsCreator = approvedForMs < 0 ? 0 : Math.floor(approvedForMs / DAY_MS);
  const authenticity = getAuthenticityStatus(user || {});
  const hasParent = Boolean(user?.agencyRelationship?.parentCreatorId) &&
    LINKED_STATUSES.includes(user?.agencyRelationship?.status);
  const requirements = {
    approvedCreator: user?.role === "creator" && user?.creatorStatus === "approved",
    adult: (calculateAge(user?.birthdate, now) ?? -1) >= MIN_AGE,
    authenticProfile: authenticity.meetsRequirements,
    creatorTenure: approvedForMs >= MIN_CREATOR_DAYS * DAY_MS,
    completedLives: completedLives >= MIN_COMPLETED_LIVES,
    goodStanding: user?.isBlocked !== true && user?.isSuspended !== true &&
      user?.creatorStatus !== "suspended",
    independentCreator: !linked && !hasParent,
  };
  return {
    eligible: Object.values(requirements).every(Boolean),
    requirements,
    daysAsCreator,
    completedLives,
    minimumCreatorDays: MIN_CREATOR_DAYS,
    minimumCompletedLives: MIN_COMPLETED_LIVES,
  };
}

async function readAgencyEligibility(user, { now = new Date() } = {}) {
  // Count only completed, distinct persisted streams created on/after creator
  // approval. Never use a frontend counter or a stale "isLive" flag as proof.
  const approvedAt = validDate(user?.creatorApprovedAt);
  const isApproved = user?.role === "creator" && user?.creatorStatus === "approved";
  const [completedLives, affiliated] = await Promise.all([
    isApproved && approvedAt
      ? Live.countDocuments({
          user: user._id,
          isLive: false,
          createdAt: { $gte: approvedAt, $lte: now },
          endedAt: { $type: "date", $lte: now },
          $expr: { $gt: ["$endedAt", "$createdAt"] },
        })
      : Promise.resolve(0),
    user?._id
      ? AgencyRelationship.exists({
          subCreator: user._id,
          status: { $in: LINKED_STATUSES },
        })
      : Promise.resolve(null),
  ]);
  return getProgress(user, { now, completedLives, linked: Boolean(affiliated) });
}

module.exports = {
  MIN_CREATOR_DAYS,
  MIN_COMPLETED_LIVES,
  getProgress,
  readAgencyEligibility,
};
