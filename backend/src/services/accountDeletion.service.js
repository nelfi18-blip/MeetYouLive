const mongoose = require("mongoose");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const AnalyticsEvent = require("../models/AnalyticsEvent.js");
const Chat = require("../models/Chat.js");
const ChatProtectionAttempt = require("../models/ChatProtectionAttempt.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const CreatorPayoutProfile = require("../models/CreatorPayoutProfile.js");
const FaceReferenceAudit = require("../models/FaceReferenceAudit.js");
const Gift = require("../models/Gift.js");
const Like = require("../models/Like.js");
const Live = require("../models/Live.js");
const Message = require("../models/Message.js");
const Notification = require("../models/Notification.js");
const Payout = require("../models/Payout.js");
const Purchase = require("../models/Purchase.js");
const Report = require("../models/Report.js");
const Subscription = require("../models/Subscription.js");
const User = require("../models/User.js");
const Video = require("../models/Video.js");
const { revokeFaceReferenceForAccountDeletion } = require("./faceReference.service.js");

async function deleteUserAccount(userId) {
  // "Perfil Auténtico" face reference: schedule AWS-side deletion of the
  // opaque FaceId BEFORE the user document is removed, so the retry job can
  // still find/finish it (the independent FaceReferenceDeletion record
  // intentionally outlives the User row while it is still "pending"). A
  // *durably scheduled* deletion is allowed to proceed even if AWS itself is
  // still down (the existing retry job will keep retrying — nothing is
  // lost). What must NOT be allowed to proceed is the case where the
  // retire+schedule MongoDB transaction itself never committed: that would
  // leave an active biometric reference with zero local tracking the moment
  // the User row disappears underneath it, so the whole account deletion is
  // aborted with a controlled, retriable error instead.
  let faceReferenceResult;
  try {
    faceReferenceResult = await revokeFaceReferenceForAccountDeletion(userId);
  } catch (err) {
    console.error("[account-delete] face reference cleanup threw unexpectedly:", err?.message || err);
    faceReferenceResult = { scheduled: false, failed: true };
  }
  if (faceReferenceResult && faceReferenceResult.failed) {
    const error = new Error(
      "Could not durably schedule deletion of the user's face reference; account deletion aborted so it can be retried."
    );
    error.code = "FACE_REFERENCE_CLEANUP_PENDING";
    error.retriable = true;
    throw error;
  }

  // AWS deletion cannot be rolled back with MongoDB. Its independent durable
  // record deliberately survives any failure below; retries must not restore
  // the revoked consent or call AWS from a retried transaction callback.
  let session;
  try {
    session = await mongoose.startSession();
    return await session.withTransaction(async () => {
      // On a repeated/concurrent request, do not run cleanup again once the
      // first transaction has removed the user. A write conflict causes the
      // driver to retry this entire callback with a fresh snapshot.
      const user = await User.findById(userId).select("_id").session(session).lean();
      if (!user) return null;

      const chats = await Chat.find({ participants: userId }).select("_id").session(session).lean();
      const chatIds = chats.map((chat) => chat._id);

      try {
        await CreatorPayoutProfile.deleteMany({ creator: userId }, { session });
      } catch (cause) {
        const error = new Error("Could not delete the user's private payout profile.", { cause });
        error.code = "PAYOUT_PROFILE_CLEANUP_PENDING";
        error.retriable = true;
        // Preserve MongoDB transaction labels so the driver's bounded retry
        // can still handle transient write conflicts.
        throw cause.hasErrorLabel?.("TransientTransactionError") ? cause : error;
      }

      // Keep existing deletion filters, including financial records. This
      // fixes atomicity, not the separate legal retention policy. Every query
      // uses the same session and is awaited sequentially (no parallel writes).
      await Message.deleteMany({ $or: [{ sender: userId }, { chat: { $in: chatIds } }] }, { session });
      await ChatProtectionAttempt.deleteMany({ $or: [{ senderId: userId }, { recipientId: userId }, { chatId: { $in: chatIds } }] }, { session });
      await Chat.deleteMany({ participants: userId }, { session });
      await Live.deleteMany({ user: userId }, { session });
      await Video.deleteMany({ user: userId }, { session });
      await Gift.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }, { session });
      await CoinTransaction.deleteMany({ userId }, { session });
      await Report.deleteMany({ $or: [{ reporter: userId }, { reportedUserId: userId }] }, { session });
      await Subscription.deleteMany({ user: userId }, { session });
      await Purchase.deleteMany({ user: userId }, { session });
      await Notification.deleteMany({ $or: [{ userId }, { "data.fromUserId": userId }] }, { session });
      await Like.deleteMany({ $or: [{ from: userId }, { to: userId }] }, { session });
      await AgencyRelationship.deleteMany({ $or: [{ parentCreator: userId }, { subCreator: userId }] }, { session });
      await AnalyticsEvent.deleteMany({ userId }, { session });
      await Payout.deleteMany({ creator: userId }, { session });
      await FaceReferenceAudit.deleteMany({ userId }, { session });

      const affectedFollowers = await User.find({ followers: userId }).select("_id").session(session).lean();
      await User.updateMany(
        { $or: [{ followers: userId }, { following: userId }, { blockedUsers: userId }] },
        { $pull: { followers: userId, following: userId, blockedUsers: userId } },
        { session }
      );
      await User.updateMany(
        { _id: { $in: affectedFollowers.map((profile) => profile._id) }, followersCount: { $exists: true } },
        [{ $set: { followersCount: { $size: { $ifNull: ["$followers", []] } } } }],
        { session }
      );

      return User.findByIdAndDelete(userId, { session });
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (cause) {
    if (cause.code === "PAYOUT_PROFILE_CLEANUP_PENDING") throw cause;
    // A failed/unknown commit must never be represented as successful deletion.
    // withTransaction handles transient errors/commit retries; after exhaustion
    // the caller may retry, and an already-deleted user is a harmless no-op.
    const error = new Error("Account deletion could not be confirmed safely.", { cause });
    error.code = "ACCOUNT_DELETION_CLEANUP_PENDING";
    error.retriable = true;
    throw error;
  } finally {
    // Session disposal is not a new deletion attempt. Do not turn a confirmed
    // commit into a failure merely because local session cleanup throws.
    if (session) await session.endSession().catch(() => {
      console.error("[account-delete] Could not dispose MongoDB session.");
    });
  }
}

module.exports = { deleteUserAccount };
