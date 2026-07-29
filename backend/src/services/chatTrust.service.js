"use strict";

const Like = require("../models/Like.js");
const Message = require("../models/Message.js");
const VideoCall = require("../models/VideoCall.js");
const CoinTransaction = require("../models/CoinTransaction.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const SPEND_TRANSACTION_TYPES = [
  "crush_sent",
  "gift_sent",
  "private_call",
  "call_started",
  "room_entry",
  "content_unlock",
  "boost_crush",
  "boost_pack",
  "swipe_unlock",
  "like_unlock",
  "simulation_unlock",
];

const getParticipantId = (participant) => String(participant?._id || participant || "");

function getOtherParticipantId(chat, senderId) {
  return (chat?.participants || [])
    .map(getParticipantId)
    .find((id) => id && id !== String(senderId)) || "";
}

async function getMatchCreatedAt(userA, userB) {
  const likes = await Like.find({
    $or: [
      { from: userA, to: userB },
      { from: userB, to: userA },
    ],
  }).select("from to createdAt").lean();

  const hasAtoB = likes.some((like) => String(like.from) === String(userA) && String(like.to) === String(userB));
  const hasBtoA = likes.some((like) => String(like.from) === String(userB) && String(like.to) === String(userA));
  if (!hasAtoB || !hasBtoA) return null;
  return likes
    .map((like) => new Date(like.createdAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

async function countPersistedMessages(chatId) {
  // This is the total conversation count. Blocked attempts are not Message docs,
  // and the Message model has no system-message type in this codebase.
  return Message.countDocuments({ chat: chatId, text: { $type: "string", $ne: "" } });
}

async function countCompletedCalls(userA, userB) {
  return VideoCall.countDocuments({
    type: "social",
    status: "ended",
    $or: [
      { caller: userA, recipient: userB },
      { caller: userB, recipient: userA },
    ],
  });
}

async function getCoinsSpent(userId) {
  const [result] = await CoinTransaction.aggregate([
    {
      $match: {
        userId,
        status: "completed",
        type: { $in: SPEND_TRANSACTION_TYPES },
        amount: { $lt: 0 },
      },
    },
    { $group: { _id: null, total: { $sum: { $abs: "$amount" } } } },
  ]);
  return Number(result?.total || 0);
}

function buildRequirements(settings = {}) {
  return [
    { key: "minimumDaysSinceMatch", value: Number(settings.minimumDaysSinceMatch || 0) },
    { key: "minimumMessages", value: Number(settings.minimumMessages || 0) },
    { key: "minimumCompletedCalls", value: Number(settings.minimumCompletedCalls || 0) },
    { key: "minimumCoinsSpent", value: Number(settings.minimumCoinsSpent || 0) },
  ].filter((item) => item.value > 0);
}

async function evaluateChatTrust({ chat, chatId, senderId, settings }) {
  const otherParticipantId = getOtherParticipantId(chat, senderId);
  const requirements = buildRequirements(settings);
  if (requirements.length === 0) {
    return { trusted: true, otherParticipantId, mode: settings.trustRuleMode || "all", checks: {} };
  }

  const checks = {};
  const matchCreatedAt = otherParticipantId ? await getMatchCreatedAt(senderId, otherParticipantId) : null;
  const daysSinceMatch = matchCreatedAt ? Math.max(0, Math.floor((Date.now() - matchCreatedAt.getTime()) / DAY_MS)) : 0;
  checks.minimumDaysSinceMatch = {
    required: Number(settings.minimumDaysSinceMatch || 0),
    actual: daysSinceMatch,
    passed: daysSinceMatch >= Number(settings.minimumDaysSinceMatch || 0),
  };

  checks.minimumMessages = {
    required: Number(settings.minimumMessages || 0),
    actual: await countPersistedMessages(chatId),
    passed: false,
    scope: "total_conversation",
  };
  checks.minimumMessages.passed = checks.minimumMessages.actual >= checks.minimumMessages.required;

  checks.minimumCompletedCalls = {
    required: Number(settings.minimumCompletedCalls || 0),
    actual: otherParticipantId ? await countCompletedCalls(senderId, otherParticipantId) : 0,
    passed: false,
  };
  checks.minimumCompletedCalls.passed = checks.minimumCompletedCalls.actual >= checks.minimumCompletedCalls.required;

  checks.minimumCoinsSpent = {
    required: Number(settings.minimumCoinsSpent || 0),
    actual: Number(settings.minimumCoinsSpent || 0) > 0 ? await getCoinsSpent(senderId) : 0,
    passed: false,
    scope: "sender_completed_spend_transactions",
  };
  checks.minimumCoinsSpent.passed = checks.minimumCoinsSpent.actual >= checks.minimumCoinsSpent.required;

  const activeChecks = requirements.map((requirement) => checks[requirement.key]);
  const mode = settings.trustRuleMode === "any" ? "any" : "all";
  const trusted = mode === "any"
    ? activeChecks.some((check) => check.passed)
    : activeChecks.every((check) => check.passed);

  return { trusted, otherParticipantId, mode, checks };
}

module.exports = {
  getOtherParticipantId,
  getMatchCreatedAt,
  countPersistedMessages,
  countCompletedCalls,
  getCoinsSpent,
  evaluateChatTrust,
};
