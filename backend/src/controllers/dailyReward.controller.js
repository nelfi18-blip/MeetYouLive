const mongoose = require("mongoose");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const { queueEvent } = require("../services/push.service.js");

const DAILY_REWARD_COINS = 20;

/**
 * Returns whether the authenticated user can claim today's daily reward,
 * their current streak, and coins to be awarded.
 */
const getDailyRewardStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("lastDailyRewardClaimAt dailyRewardStreak coins").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const canClaim = !isSameCalendarDay(user.lastDailyRewardClaimAt);

    res.json({
      canClaim,
      streak: user.dailyRewardStreak || 0,
      coinsToAward: DAILY_REWARD_COINS,
      lastClaimedAt: user.lastDailyRewardClaimAt || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Claims the daily reward for the authenticated user.
 * Can only be claimed once per calendar day (UTC).
 * The coin credit and transaction record are written atomically.
 */
const claimDailyReward = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const user = await User.findById(req.userId).select("lastDailyRewardClaimAt dailyRewardStreak coins").session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    if (isSameCalendarDay(user.lastDailyRewardClaimAt)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({ message: "Daily reward already claimed today" });
    }

    const isConsecutiveDay = isYesterday(user.lastDailyRewardClaimAt);
    const newStreak = isConsecutiveDay ? (user.dailyRewardStreak || 0) + 1 : 1;
    const claimedAt = new Date();

    user.coins += DAILY_REWARD_COINS;
    user.lastDailyRewardClaimAt = claimedAt;
    user.dailyRewardStreak = newStreak;
    await user.save({ session });

    await CoinTransaction.create(
      [
        {
          userId: user._id,
          type: "daily_reward",
          amount: DAILY_REWARD_COINS,
          reason: `Daily reward – day ${newStreak} streak`,
          status: "completed",
          metadata: { streak: newStreak },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Queue a reward push (fire-and-forget)
    queueEvent(
      user._id,
      "reward",
      {
        title: "🎁 ¡Recompensa diaria reclamada!",
        body: `+${DAILY_REWARD_COINS} monedas · Racha: ${newStreak} día${newStreak !== 1 ? "s" : ""}`,
        data: { link: "/daily-reward" },
      },
      { streak: newStreak, coins: DAILY_REWARD_COINS }
    ).catch(() => {});

    res.json({
      coinsAwarded: DAILY_REWARD_COINS,
      newBalance: user.coins,
      streak: newStreak,
      claimedAt,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when `date` falls on today's UTC calendar date. */
function isSameCalendarDay(date) {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

/** Returns true when `date` falls on yesterday's UTC calendar date. */
function isYesterday(date) {
  if (!date) return false;
  const d = new Date(date);
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return (
    d.getUTCFullYear() === yesterday.getUTCFullYear() &&
    d.getUTCMonth() === yesterday.getUTCMonth() &&
    d.getUTCDate() === yesterday.getUTCDate()
  );
}

module.exports = { getDailyRewardStatus, claimDailyReward };
