const AgencyRelationship = require("../models/AgencyRelationship.js");
const AnalyticsEvent = require("../models/AnalyticsEvent.js");
const Chat = require("../models/Chat.js");
const ChatProtectionAttempt = require("../models/ChatProtectionAttempt.js");
const CoinTransaction = require("../models/CoinTransaction.js");
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
  const chats = await Chat.find({ participants: userId }).select("_id").lean();
  const chatIds = chats.map((chat) => chat._id);

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

  const cleanupResults = await Promise.allSettled([
    Message.deleteMany({ $or: [{ sender: userId }, { chat: { $in: chatIds } }] }),
    ChatProtectionAttempt.deleteMany({ $or: [{ senderId: userId }, { recipientId: userId }, { chatId: { $in: chatIds } }] }),
    Chat.deleteMany({ participants: userId }),
    Live.deleteMany({ user: userId }),
    Video.deleteMany({ user: userId }),
    Gift.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }),
    CoinTransaction.deleteMany({ userId }),
    Report.deleteMany({ $or: [{ reporter: userId }, { reportedUserId: userId }] }),
    Subscription.deleteMany({ user: userId }),
    Purchase.deleteMany({ user: userId }),
    Notification.deleteMany({ $or: [{ userId }, { "data.fromUserId": userId }] }),
    Like.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
    AgencyRelationship.deleteMany({ $or: [{ parentCreator: userId }, { subCreator: userId }] }),
    AnalyticsEvent.deleteMany({ userId }),
    Payout.deleteMany({ creator: userId }),
    // Audit trail holds no biometric data, but it is still user-specific —
    // remove it along with everything else on account deletion.
    FaceReferenceAudit.deleteMany({ userId }),
  ]);

  await User.updateMany(
    { $or: [{ followers: userId }, { following: userId }, { blockedUsers: userId }] },
    { $pull: { followers: userId, following: userId, blockedUsers: userId } }
  );
  await User.updateMany(
    { followersCount: { $exists: true } },
    [{ $set: { followersCount: { $size: { $ifNull: ["$followers", []] } } } }]
  );

  cleanupResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`[account-delete] Cleanup step ${index} failed:`, result.reason);
    }
  });

  return User.findByIdAndDelete(userId);
}

module.exports = { deleteUserAccount };
