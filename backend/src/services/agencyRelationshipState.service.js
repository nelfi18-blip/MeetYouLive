const User = require("../models/User.js");

const ACTIVE_SNAPSHOT_STATUS = "active";

const buildActiveSnapshot = (relationship, joinedAt) => ({
  "agencyRelationship.parentCreatorId": relationship.parentCreator,
  "agencyRelationship.parentCreatorPercentage": relationship.percentage,
  "agencyRelationship.joinedAt": joinedAt,
  "agencyRelationship.status": ACTIVE_SNAPSHOT_STATUS,
});

const buildClearedSnapshot = () => ({
  "agencyRelationship.parentCreatorId": null,
  "agencyRelationship.parentCreatorPercentage": 0,
  "agencyRelationship.joinedAt": null,
  "agencyRelationship.status": "removed",
});

const isReadyForActivation = (relationship) => Boolean(relationship.approvedAt && relationship.subCreatorAgreed);

const syncActiveSnapshot = async (relationship, joinedAt = new Date()) => {
  await User.findByIdAndUpdate(relationship.subCreator, buildActiveSnapshot(relationship, joinedAt));
};

const clearSnapshot = async (subCreatorId) => {
  await User.findByIdAndUpdate(subCreatorId, buildClearedSnapshot());
};

const finalizeIfReady = async (relationship, now = new Date()) => {
  const wasActive = relationship.status === ACTIVE_SNAPSHOT_STATUS;

  if (isReadyForActivation(relationship)) {
    relationship.status = ACTIVE_SNAPSHOT_STATUS;
    await relationship.save();
    await syncActiveSnapshot(relationship, now);

    if (!wasActive) {
      await User.findByIdAndUpdate(relationship.parentCreator, {
        $inc: { "agencyProfile.subCreatorsCount": 1 },
      });
    }

    return true;
  }

  await relationship.save();
  return false;
};

module.exports = {
  buildActiveSnapshot,
  buildClearedSnapshot,
  clearSnapshot,
  finalizeIfReady,
  isReadyForActivation,
  syncActiveSnapshot,
};
