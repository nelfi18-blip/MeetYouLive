const mongoose = require("mongoose");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const { queueEvent } = require("../services/push.service.js");

// Maximum daily reward coins (awarded at streak >= 30 days)
const MAX_STREAK_TIER_COINS = 100;

/**
 * Coins awarded per streak day (tiered).
 * Día 1 → 20, Día 3 → 35, Día 7 → 50, Día 14 → 75, Día 30 → 100
 */
function getStreakCoins(streak) {
  if (streak >= 30) return MAX_STREAK_TIER_COINS;
  if (streak >= 14) return 75;
  if (streak >= 7)  return 50;
  if (streak >= 3)  return 35;
  return 20;
}

/**
 * Returns the next streak milestone after the given streak value,
 * along with the coins that will be awarded at that milestone.
 */
function getNextMilestone(streak) {
  const milestones = [3, 7, 14, 30];
  for (const m of milestones) {
    if (streak < m) return { day: m, coins: getStreakCoins(m) };
  }
  return { day: null, coins: MAX_STREAK_TIER_COINS }; // already at max tier
}

/**
 * Returns whether the authenticated user can claim today's daily reward,
 * their current streak, and coins to be awarded.
 */
const getDailyRewardStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("lastDailyRewardClaimAt dailyRewardStreak coins").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const canClaim = !isSameCalendarDay(user.lastDailyRewardClaimAt);
    const streak = user.dailyRewardStreak || 0;
    // Preview the coins for the NEXT claim (streak+1 if claimable, current if already claimed)
    const previewStreak = canClaim ? streak + 1 : streak;
    const coinsToAward = getStreakCoins(previewStreak);
    const nextMilestone = getNextMilestone(previewStreak);

    res.json({
      canClaim,
      streak,
      coinsToAward,
      nextMilestone,
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
    const coinsAwarded = getStreakCoins(newStreak);
    const claimedAt = new Date();

    user.coins += coinsAwarded;
    user.lastDailyRewardClaimAt = claimedAt;
    user.dailyRewardStreak = newStreak;
    await user.save({ session });

    await CoinTransaction.create(
      [
        {
          userId: user._id,
          type: "daily_reward",
          amount: coinsAwarded,
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
        body: `+${coinsAwarded} monedas · Racha: ${newStreak} día${newStreak !== 1 ? "s" : ""}`,
        data: { link: "/daily-reward" },
      },
      { streak: newStreak, coins: coinsAwarded }
    ).catch(() => {});

    const nextMilestone = getNextMilestone(newStreak);

    res.json({
      coinsAwarded,
      newBalance: user.coins,
      streak: newStreak,
      nextMilestone,
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
