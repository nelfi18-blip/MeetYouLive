const AgencyRelationship = require("../models/AgencyRelationship.js");
const AnalyticsEvent = require("../models/AnalyticsEvent.js");
const Chat = require("../models/Chat.js");
const CoinTransaction = require("../models/CoinTransaction.js");
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

async function deleteUserAccount(userId) {
  const chats = await Chat.find({ participants: userId }).select("_id").lean();
  const chatIds = chats.map((chat) => chat._id);

  const cleanupResults = await Promise.allSettled([
    Message.deleteMany({ $or: [{ sender: userId }, { chat: { $in: chatIds } }] }),
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
  ]);

  await User.updateMany({ followers: userId }, { $pull: { followers: userId } });
  await User.updateMany({ following: userId }, { $pull: { following: userId } });
  await User.updateMany({ blockedUsers: userId }, { $pull: { blockedUsers: userId } });
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
