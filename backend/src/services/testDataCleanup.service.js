"use strict";

const mongoose = require("mongoose");

const AccessPass = require("../models/AccessPass");
const AgencyRelationship = require("../models/AgencyRelationship");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const Chat = require("../models/Chat");
const CoinTransaction = require("../models/CoinTransaction");
const ContentUnlock = require("../models/ContentUnlock");
const CrushTransaction = require("../models/CrushTransaction");
const Dislike = require("../models/Dislike");
const ExclusiveContent = require("../models/ExclusiveContent");
const ExclusiveUnlock = require("../models/ExclusiveUnlock");
const FraudAlert = require("../models/FraudAlert");
const Gift = require("../models/Gift");
const Greeting = require("../models/Greeting");
const Like = require("../models/Like");
const Live = require("../models/Live");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const Payout = require("../models/Payout");
const Purchase = require("../models/Purchase");
const PushAnalytic = require("../models/PushAnalytic");
const PushEvent = require("../models/PushEvent");
const Report = require("../models/Report");
const SimulationResponse = require("../models/SimulationResponse");
const SimulationUnlock = require("../models/SimulationUnlock");
const SocialRoom = require("../models/SocialRoom");
const SocialRoomMessage = require("../models/SocialRoomMessage");
const SparkTransaction = require("../models/SparkTransaction");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const UserMissions = require("../models/UserMissions");
const UserVisit = require("../models/UserVisit");
const Video = require("../models/Video");
const VideoCall = require("../models/VideoCall");
const WithdrawalRequest = require("../models/WithdrawalRequest");

const STAFF_ROLES = [
  "admin",
  "moderator",
  "support",
  "creator_manager",
  "finance",
  "content_reviewer",
];

const EXECUTE_CONFIRMATION = "DELETE_TEST_DATA";
const TEST_LIKE_REGEX = /(\btest\b|\btesting\b|\bdemo\b|\bfake\b|\bsample\b|\bprueba\b|\bficticio\b)/i;

function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}

function normalizeDomain(value) {
  return String(value).trim().toLowerCase().replace(/^@+/, "");
}

function normalizeCleanupOptions(rawOptions = {}) {
  const userIds = splitCsv(rawOptions.userIds || rawOptions.userIdsCsv).filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  const invalidUserIds = splitCsv(rawOptions.userIds || rawOptions.userIdsCsv).filter(
    (id) => !mongoose.Types.ObjectId.isValid(id)
  );

  return {
    execute: Boolean(rawOptions.execute),
    confirm: rawOptions.confirm || "",
    userIds,
    invalidUserIds,
    emails: splitCsv(rawOptions.emails || rawOptions.emailsCsv).map(normalizeEmail),
    emailDomains: splitCsv(rawOptions.emailDomains || rawOptions.emailDomainsCsv).map(normalizeDomain),
    emailRegex: rawOptions.emailRegex ? String(rawOptions.emailRegex) : "",
    includeAmbiguousReport: rawOptions.includeAmbiguousReport !== false,
  };
}

function hasExplicitSelector(options) {
  return Boolean(
    options.userIds.length ||
      options.emails.length ||
      options.emailDomains.length ||
      options.emailRegex
  );
}

function buildTestUserFilter(options) {
  const normalized = normalizeCleanupOptions(options);
  const selectors = [];

  if (normalized.userIds.length) {
    selectors.push({ _id: { $in: normalized.userIds.map((id) => new mongoose.Types.ObjectId(id)) } });
  }

  if (normalized.emails.length) {
    selectors.push({
      $or: normalized.emails.map((email) => ({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } })),
    });
  }

  if (normalized.emailDomains.length) {
    selectors.push({
      $or: normalized.emailDomains.map((domain) => ({ email: { $regex: `@${escapeRegex(domain)}$`, $options: "i" } })),
    });
  }

  if (normalized.emailRegex) {
    selectors.push({ email: { $regex: normalized.emailRegex, $options: "i" } });
  }

  if (!selectors.length) {
    throw new Error("At least one explicit test-user selector is required.");
  }

  return {
    role: { $nin: STAFF_ROLES },
    $or: selectors,
  };
}

function assertCanExecuteCleanup(options) {
  const normalized = normalizeCleanupOptions(options);

  if (normalized.invalidUserIds.length) {
    throw new Error(`Invalid user id selector(s): ${normalized.invalidUserIds.join(", ")}`);
  }

  if (!hasExplicitSelector(normalized)) {
    throw new Error("No cleanup was run: provide explicit test-user selectors first.");
  }

  if (normalized.execute && normalized.confirm !== EXECUTE_CONFIRMATION) {
    throw new Error(`Refusing destructive cleanup without --confirm=${EXECUTE_CONFIRMATION}`);
  }

  return normalized;
}

async function getCandidateUsers(options) {
  const filter = buildTestUserFilter(options);
  return User.find(filter)
    .select("_id username name email role creatorStatus createdAt")
    .sort({ createdAt: 1, _id: 1 })
    .lean();
}

async function getAmbiguousTestLikeUsers(candidateIds) {
  const candidateIdStrings = new Set(candidateIds.map(String));
  const users = await User.find({ role: { $nin: STAFF_ROLES } })
    .select("_id username name email role creatorStatus createdAt")
    .lean();

  return users.filter((user) => {
    if (candidateIdStrings.has(String(user._id))) return false;
    return [user.email, user.username, user.name].some((value) => value && TEST_LIKE_REGEX.test(String(value)));
  });
}

async function getReferencedIds(testUserIds) {
  const [chats, lives, videos, exclusiveContents, socialRoomMessages] = await Promise.all([
    Chat.find({ participants: { $in: testUserIds } }).select("_id").lean(),
    Live.find({ user: { $in: testUserIds } }).select("_id").lean(),
    Video.find({ user: { $in: testUserIds } }).select("_id").lean(),
    ExclusiveContent.find({ creator: { $in: testUserIds } }).select("_id").lean(),
    SocialRoomMessage.find({ sender: { $in: testUserIds } }).select("room").lean(),
  ]);

  return {
    chatIds: chats.map((doc) => doc._id),
    liveIds: lives.map((doc) => doc._id),
    videoIds: videos.map((doc) => doc._id),
    exclusiveContentIds: exclusiveContents.map((doc) => doc._id),
    socialRoomIds: socialRoomMessages.map((doc) => doc.room).filter(Boolean),
  };
}

function deletedCount(result) {
  return result?.deletedCount || 0;
}

function modifiedCount(result) {
  return result?.modifiedCount || 0;
}

async function applyOrCount(Model, query, execute) {
  if (execute) return Model.deleteMany(query);
  return { deletedCount: await Model.countDocuments(query) };
}

async function updateOrCount(Model, query, update, execute, options) {
  if (execute) return Model.updateMany(query, update, options);
  return { modifiedCount: await Model.countDocuments(query) };
}

async function cleanupTestData(rawOptions = {}) {
  const options = assertCanExecuteCleanup(rawOptions);
  const candidates = await getCandidateUsers(options);
  const testUserIds = candidates.map((user) => user._id);
  const testUserIdStrings = candidates.map((user) => String(user._id));
  const creatorCount = candidates.filter(
    (user) => user.role === "creator" || user.role === "subCreator" || user.creatorStatus !== "none"
  ).length;

  const report = {
    dryRun: !options.execute,
    selectedUsers: candidates.map((user) => ({
      id: String(user._id),
      username: user.username || "",
      name: user.name || "",
      email: user.email,
      role: user.role,
      creatorStatus: user.creatorStatus,
      createdAt: user.createdAt,
    })),
    preservedAmbiguousUsers: [],
    counts: {
      users: candidates.length,
      creators: creatorCount,
      lives: 0,
      chats: 0,
      messages: 0,
      deletedDocuments: {},
      prunedDocuments: {},
    },
    protected: {
      staffRoles: STAFF_ROLES,
      configurationCollectionsTouched: [],
    },
  };

  if (options.includeAmbiguousReport) {
    report.preservedAmbiguousUsers = (await getAmbiguousTestLikeUsers(testUserIds)).map((user) => ({
      id: String(user._id),
      username: user.username || "",
      name: user.name || "",
      email: user.email,
      role: user.role,
      creatorStatus: user.creatorStatus,
      reason: "Looks test-like but was not matched by an explicit selector, so it was preserved.",
    }));
  }

  if (!testUserIds.length) return report;

  const ids = await getReferencedIds(testUserIds);
  const inUsers = { $in: testUserIds };
  const inChats = { $in: ids.chatIds };
  const inLives = { $in: ids.liveIds };
  const inVideos = { $in: ids.videoIds };
  const inExclusiveContent = { $in: ids.exclusiveContentIds };
  const inSocialRooms = { $in: ids.socialRoomIds };

  const messageQuery = { $or: [{ sender: inUsers }, { chat: inChats }] };
  const chatQuery = { _id: inChats };
  const liveQuery = { _id: inLives };

  const deletionPlan = [
    ["accessPasses", AccessPass, { holder: inUsers }],
    ["agencyRelationships", AgencyRelationship, { $or: [{ parentCreator: inUsers }, { subCreator: inUsers }, { createdBy: inUsers }, { approvedBy: inUsers }, { "percentageHistory.changedBy": inUsers }] }],
    ["analyticsEvents", AnalyticsEvent, { userId: inUsers }],
    ["messages", Message, messageQuery],
    ["chats", Chat, chatQuery],
    ["coinTransactions", CoinTransaction, { userId: inUsers }],
    ["contentUnlocks", ContentUnlock, { $or: [{ user: inUsers }, { creator: inUsers }, { content: inExclusiveContent }] }],
    ["crushTransactions", CrushTransaction, { $or: [{ fromUser: inUsers }, { toUser: inUsers }, { referrerId: inUsers }] }],
    ["dislikes", Dislike, { $or: [{ from: inUsers }, { to: inUsers }] }],
    ["exclusiveUnlocks", ExclusiveUnlock, { $or: [{ user: inUsers }, { referrerId: inUsers }, { content: inExclusiveContent }] }],
    ["exclusiveContents", ExclusiveContent, { _id: inExclusiveContent }],
    ["fraudAlerts", FraudAlert, { $or: [{ userId: inUsers }, { reviewedBy: inUsers }] }],
    ["gifts", Gift, { $or: [{ sender: inUsers }, { receiver: inUsers }, { referrerId: inUsers }, { live: inLives }] }],
    ["greetings", Greeting, { $or: [{ from: inUsers }, { to: inUsers }] }],
    ["likes", Like, { $or: [{ from: inUsers }, { to: inUsers }] }],
    ["lives", Live, liveQuery],
    ["notifications", Notification, { $or: [{ userId: inUsers }, { "data.fromUserId": inUsers }, { "data.userId": inUsers }, { "data.creatorId": inUsers }, { "data.liveId": inLives }] }],
    ["payouts", Payout, { $or: [{ creator: inUsers }, { processedBy: inUsers }] }],
    ["purchases", Purchase, { $or: [{ user: inUsers }, { video: inVideos }] }],
    ["pushAnalytics", PushAnalytic, { userId: inUsers }],
    ["pushEvents", PushEvent, { userId: inUsers }],
    ["reports", Report, { $or: [{ reporter: inUsers }, { targetId: { $in: [...testUserIds, ...ids.liveIds, ...ids.videoIds] } }] }],
    ["simulationResponses", SimulationResponse, { $or: [{ user: inUsers }, { likedBy: inUsers }] }],
    ["simulationUnlocks", SimulationUnlock, { user: inUsers }],
    ["socialRoomMessages", SocialRoomMessage, { $or: [{ sender: inUsers }, { room: inSocialRooms }] }],
    ["sparkTransactions", SparkTransaction, { userId: inUsers }],
    ["subscriptions", Subscription, { user: inUsers }],
    ["userMissions", UserMissions, { userId: inUsers }],
    ["userVisits", UserVisit, { $or: [{ visitor: inUsers }, { visited: inUsers }] }],
    ["videos", Video, { _id: inVideos }],
    ["videoCalls", VideoCall, { $or: [{ caller: inUsers }, { recipient: inUsers }, { referrerId: inUsers }] }],
    ["withdrawalRequests", WithdrawalRequest, { userId: inUsers }],
  ];

  for (const [name, Model, query] of deletionPlan) {
    const result = await applyOrCount(Model, query, options.execute);
    report.counts.deletedDocuments[name] = deletedCount(result);
  }

  const pullFromUsers = await updateOrCount(
    User,
    { _id: { $nin: testUserIds }, $or: [{ followers: inUsers }, { following: inUsers }, { blockedUsers: inUsers }] },
    { $pull: { followers: inUsers, following: inUsers, blockedUsers: inUsers } },
    options.execute
  );
  report.counts.prunedDocuments.userRelationshipArrays = modifiedCount(pullFromUsers);

  const nullReferredBy = await updateOrCount(
    User,
    { _id: { $nin: testUserIds }, referredBy: inUsers },
    { $set: { referredBy: null } },
    options.execute
  );
  const nullInvitedByCreator = await updateOrCount(
    User,
    { _id: { $nin: testUserIds }, invitedByCreator: inUsers },
    { $set: { invitedByCreator: null } },
    options.execute
  );
  const nullAgencyParent = await updateOrCount(
    User,
    { _id: { $nin: testUserIds }, "agencyRelationship.parentCreatorId": inUsers },
    { $set: { "agencyRelationship.parentCreatorId": null } },
    options.execute
  );
  report.counts.prunedDocuments.userSingleReferences =
    modifiedCount(nullReferredBy) + modifiedCount(nullInvitedByCreator) + modifiedCount(nullAgencyParent);

  const liveUserArrays = await updateOrCount(
    Live,
    { _id: { $nin: ids.liveIds }, $or: [{ paidViewers: inUsers }, { bannedUsers: inUsers }, { "guests.userId": inUsers }, { "guestRequests.userId": inUsers }, { "moderationActions.moderator": inUsers }, { "moderationActions.target": inUsers }] },
    {
      $pull: {
        paidViewers: inUsers,
        bannedUsers: inUsers,
        guests: { userId: inUsers },
        guestRequests: { userId: inUsers },
        moderationActions: { $or: [{ moderator: inUsers }, { target: inUsers }] },
      },
    },
    options.execute
  );
  report.counts.prunedDocuments.liveUserArrays = modifiedCount(liveUserArrays);

  const unsetTopSupporter = await updateOrCount(
    Live,
    { _id: { $nin: ids.liveIds }, "topSupporter.userId": inUsers },
    { $set: { topSupporter: null } },
    options.execute
  );
  report.counts.prunedDocuments.liveTopSupporter = modifiedCount(unsetTopSupporter);

  for (const userId of testUserIdStrings) {
    const unset = { [`userCombos.${userId}`]: "" };
    const comboResult = await updateOrCount(
      Live,
      { _id: { $nin: ids.liveIds }, [`userCombos.${userId}`]: { $exists: true } },
      { $unset: unset },
      options.execute
    );
    report.counts.prunedDocuments.liveUserCombos =
      (report.counts.prunedDocuments.liveUserCombos || 0) + modifiedCount(comboResult);
  }

  const socialRoomHost = await updateOrCount(
    SocialRoom,
    { host: inUsers },
    { $set: { host: null } },
    options.execute
  );
  const socialRoomArrays = await updateOrCount(
    SocialRoom,
    { $or: [{ moderators: inUsers }, { highlightedUsers: inUsers }] },
    { $pull: { moderators: inUsers, highlightedUsers: inUsers } },
    options.execute
  );
  report.counts.prunedDocuments.socialRooms = modifiedCount(socialRoomHost) + modifiedCount(socialRoomArrays);

  const usersResult = await applyOrCount(User, { _id: inUsers, role: { $nin: STAFF_ROLES } }, options.execute);
  report.counts.deletedDocuments.users = deletedCount(usersResult);

  report.counts.users = report.counts.deletedDocuments.users;
  report.counts.lives = report.counts.deletedDocuments.lives;
  report.counts.chats = report.counts.deletedDocuments.chats;
  report.counts.messages = report.counts.deletedDocuments.messages;

  return report;
}

function formatCleanupReport(report) {
  const lines = [];
  lines.push(report.dryRun ? "DRY RUN — no data was deleted." : "EXECUTED — selected test data was deleted.");
  lines.push(`Users selected/deleted: ${report.counts.users}`);
  lines.push(`Creators selected/deleted: ${report.counts.creators}`);
  lines.push(`Lives selected/deleted: ${report.counts.lives}`);
  lines.push(`Chats selected/deleted: ${report.counts.chats}`);
  lines.push(`Messages selected/deleted: ${report.counts.messages}`);
  lines.push("Administrative/system configuration collections touched: none.");
  if (report.preservedAmbiguousUsers.length) {
    lines.push(`Preserved ambiguous test-like users: ${report.preservedAmbiguousUsers.length}`);
  }
  return lines.join("\n");
}

module.exports = {
  EXECUTE_CONFIRMATION,
  STAFF_ROLES,
  assertCanExecuteCleanup,
  buildTestUserFilter,
  cleanupTestData,
  formatCleanupReport,
  normalizeCleanupOptions,
};
