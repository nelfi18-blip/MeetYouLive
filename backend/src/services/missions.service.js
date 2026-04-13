const mongoose = require("mongoose");
const UserMissions = require("../models/UserMissions.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");

/**
 * Fixed mission definitions.
 * id must match the keys in UserMissions.progress.
 */
const MISSION_DEFINITIONS = [
  {
    id: "likes_10",
    icon: "💘",
    label: "Da 10 likes hoy",
    target: 10,
    coins: 5,
  },
  {
    id: "chat_1",
    icon: "💬",
    label: "Inicia 1 chat",
    target: 1,
    coins: 5,
  },
  {
    id: "live_1",
    icon: "🎥",
    label: "Entra a 1 directo",
    target: 1,
    coins: 10,
  },
  {
    id: "gift_1",
    icon: "🎁",
    label: "Envía 1 regalo",
    target: 1,
    coins: 20,
  },
];

// Coins awarded when all daily missions are completed
const ALL_MISSIONS_BONUS = 15;

/** Returns today's UTC date as "YYYY-MM-DD". */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Retrieve (or create) today's mission document for a user.
 * Returns a plain object enriched with definition metadata.
 */
async function getMissions(userId) {
  const date = todayUTC();
  let doc = await UserMissions.findOneAndUpdate(
    { userId, date },
    { $setOnInsert: { userId, date } },
    { upsert: true, new: true }
  ).lean();

  return buildResponse(doc);
}

/**
 * Track a mission-relevant event for a user.
 * @param {string} userId
 * @param {"swipe"|"message"|"live_join"|"gift"} eventType
 *
 * Fires and forgets – callers should not await this or let errors propagate.
 */
async function trackEvent(userId, eventType) {
  const missionId = eventTypeToMissionId(eventType);
  if (!missionId) return;

  const def = MISSION_DEFINITIONS.find((m) => m.id === missionId);
  if (!def) return;

  const date = todayUTC();

  // Atomically increment progress
  const progressKey = `progress.${missionId}.count`;
  const doc = await UserMissions.findOneAndUpdate(
    { userId, date },
    { $setOnInsert: { userId, date }, $inc: { [progressKey]: 1 } },
    { upsert: true, new: true }
  );

  const progress = doc.progress[missionId];
  const count = progress.count;
  const rewarded = progress.rewarded;

  // Award mission reward exactly once when target is first reached
  if (!rewarded && count >= def.target) {
    const awarded = await tryAwardMissionReward(userId, doc, missionId, def);
    if (awarded) {
      // Check if all missions are now completed for the all-complete bonus
      await tryAwardAllMissionsBonus(userId, date);
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Maps event types to mission IDs. */
function eventTypeToMissionId(eventType) {
  switch (eventType) {
    case "swipe":     return "likes_10";
    case "message":   return "chat_1";
    case "live_join": return "live_1";
    case "gift":      return "gift_1";
    default:          return null;
  }
}

/**
 * Awards coins for a completed mission (idempotent via atomic $set).
 * Returns true if the reward was just granted (not previously claimed).
 */
async function tryAwardMissionReward(userId, doc, missionId, def) {
  const rewardedKey = `progress.${missionId}.rewarded`;

  // Atomic: only update if not yet rewarded
  const updated = await UserMissions.findOneAndUpdate(
    { _id: doc._id, [`progress.${missionId}.rewarded`]: false },
    { $set: { [rewardedKey]: true } },
    { new: false } // we only care whether the update matched
  );

  if (!updated) return false; // already rewarded by a concurrent request

  // Credit coins to the user
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await User.findByIdAndUpdate(userId, { $inc: { coins: def.coins } }, { session });
    await CoinTransaction.create(
      [
        {
          userId,
          type: "mission_reward",
          amount: def.coins,
          reason: `Misión completada: ${def.label}`,
          status: "completed",
          metadata: { missionId },
        },
      ],
      { session }
    );
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    console.error("[missions] Failed to award mission reward:", err.message);
    // Roll back the rewarded flag so a retry can succeed
    await UserMissions.findByIdAndUpdate(doc._id, {
      $set: { [rewardedKey]: false },
    }).catch((rollbackErr) => console.error("[missions] Failed to roll back rewarded flag:", rollbackErr.message));
    return false;
  } finally {
    session.endSession();
  }

  return true;
}

/**
 * Awards the all-missions bonus if all 4 missions are completed and
 * the bonus has not yet been granted for today.
 */
async function tryAwardAllMissionsBonus(userId, date) {
  // Check current state of all missions
  const doc = await UserMissions.findOne({ userId, date }).lean();
  if (!doc || doc.bonusRewarded) return;

  const allDone = MISSION_DEFINITIONS.every(
    (m) => (doc.progress[m.id]?.count ?? 0) >= m.target
  );
  if (!allDone) return;

  // Atomic claim
  const claimed = await UserMissions.findOneAndUpdate(
    { userId, date, bonusRewarded: false },
    { $set: { bonusRewarded: true } },
    { new: false }
  );
  if (!claimed) return;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await User.findByIdAndUpdate(userId, { $inc: { coins: ALL_MISSIONS_BONUS } }, { session });
    await CoinTransaction.create(
      [
        {
          userId,
          type: "mission_reward",
          amount: ALL_MISSIONS_BONUS,
          reason: "Bonus: ¡Todas las misiones del día completadas!",
          status: "completed",
          metadata: { missionId: "all_complete_bonus" },
        },
      ],
      { session }
    );
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    console.error("[missions] Failed to award all-missions bonus:", err.message);
    await UserMissions.findOneAndUpdate({ userId, date }, { $set: { bonusRewarded: false } }).catch(
      (rollbackErr) => console.error("[missions] Failed to roll back bonusRewarded flag:", rollbackErr.message)
    );
  } finally {
    session.endSession();
  }
}

/**
 * Enriches a raw UserMissions document with definition metadata.
 */
function buildResponse(doc) {
  const date = doc?.date ?? todayUTC();
  const bonusRewarded = doc?.bonusRewarded ?? false;

  const missions = MISSION_DEFINITIONS.map((def) => {
    const p = doc?.progress?.[def.id] ?? {};
    const count = p.count ?? 0;
    const rewarded = p.rewarded ?? false;
    const completed = count >= def.target;
    const remaining = Math.max(0, def.target - count);

    return {
      id: def.id,
      icon: def.icon,
      label: def.label,
      target: def.target,
      count,
      coins: def.coins,
      completed,
      rewarded,
      remaining,
    };
  });

  const completedCount = missions.filter((m) => m.completed).length;
  const totalCount = missions.length;

  return {
    date,
    missions,
    completedCount,
    totalCount,
    allCompleted: completedCount === totalCount,
    bonusRewarded,
    bonusCoins: ALL_MISSIONS_BONUS,
  };
}

module.exports = { getMissions, trackEvent, MISSION_DEFINITIONS, ALL_MISSIONS_BONUS };
