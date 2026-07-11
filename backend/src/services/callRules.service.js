const Like = require("../models/Like.js");
const User = require("../models/User.js");

const CALL_TYPES = Object.freeze({
  SOCIAL: "social",
  PAID_CREATOR: "paid_creator",
});

const PENDING_CALL_TIMEOUT_MS = 45 * 1000;

function normalizeCallType(type) {
  return type === CALL_TYPES.PAID_CREATOR ? CALL_TYPES.PAID_CREATOR : CALL_TYPES.SOCIAL;
}

async function hasMutualMatch(userId, otherUserId) {
  const [iLiked, theyLiked] = await Promise.all([
    Like.exists({ from: userId, to: otherUserId }),
    Like.exists({ from: otherUserId, to: userId }),
  ]);
  return Boolean(iLiked && theyLiked);
}

async function hasUserBlockBetween(userId, otherUserId) {
  const [me, other] = await Promise.all([
    User.findById(userId).select("blockedUsers").lean(),
    User.findById(otherUserId).select("blockedUsers").lean(),
  ]);
  const myBlocked = Array.isArray(me?.blockedUsers) ? me.blockedUsers : [];
  const otherBlocked = Array.isArray(other?.blockedUsers) ? other.blockedUsers : [];
  return (
    myBlocked.some((id) => String(id) === String(otherUserId)) ||
    otherBlocked.some((id) => String(id) === String(userId))
  );
}

async function assertNotBlockedBetween(userId, otherUserId) {
  if (!(await hasUserBlockBetween(userId, otherUserId))) return;
  const err = new Error("No puedes interactuar con este usuario");
  err.statusCode = 403;
  throw err;
}

async function assertSocialCallAllowed(userId, recipientId) {
  await assertNotBlockedBetween(userId, recipientId);
  if (await hasMutualMatch(userId, recipientId)) return;
  const err = new Error("Solo puedes llamar a tus matches");
  err.statusCode = 403;
  throw err;
}

async function getPaidCreatorForCall(recipientId) {
  return User.findOne({ _id: recipientId, creatorStatus: "approved" })
    .where("role")
    .in(["creator", "subCreator"]);
}

async function assertPaidCreatorCallAllowed(recipientId) {
  const creator = await getPaidCreatorForCall(recipientId);
  if (!creator) {
    const err = new Error("El usuario no es un creador aprobado");
    err.statusCode = 403;
    throw err;
  }
  if (!creator.creatorProfile?.privateCallEnabled) {
    const err = new Error("Este creador no tiene habilitadas las llamadas privadas");
    err.statusCode = 403;
    throw err;
  }
  const pricePerMinute = creator.creatorProfile.pricePerMinute || 0;
  if (pricePerMinute < 1) {
    const err = new Error("Este creador no ha configurado un precio por minuto");
    err.statusCode = 403;
    throw err;
  }
  return { creator, pricePerMinute };
}

function isPendingCallExpired(call, now = Date.now()) {
  if (!call || call.status !== "pending" || !call.createdAt) return false;
  return now - new Date(call.createdAt).getTime() >= PENDING_CALL_TIMEOUT_MS;
}

module.exports = {
  CALL_TYPES,
  PENDING_CALL_TIMEOUT_MS,
  normalizeCallType,
  hasMutualMatch,
  hasUserBlockBetween,
  assertNotBlockedBetween,
  assertSocialCallAllowed,
  assertPaidCreatorCallAllowed,
  isPendingCallExpired,
};
