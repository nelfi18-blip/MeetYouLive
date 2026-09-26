const mongoose = require("mongoose");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const { queueEvent } = require("../services/push.service.js");
const { addXP, unlockAchievement, getDailyRewardXP } = require("../services/progression.service.js");
const { MAX_USER_COINS_BALANCE, creditCoinsWithCap } = require("../services/coins.service.js");

// Maximum daily reward coins (awarded at streak >= 30 days)
const MAX_STREAK_TIER_COINS = 100;
const STREAK_COIN_DAY_14 = 75;
const STREAK_COIN_DAY_7 = 50;
const STREAK_COIN_DAY_3 = 35;
const STREAK_COIN_DAY_1 = 20;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 80;

/**
 * Coins awarded per streak day (tiered).
 * Día 1 → 20, Día 3 → 35, Día 7 → 50, Día 14 → 75, Día 30 → 100
 */
function getStreakCoins(streak) {
  if (streak >= 30) return MAX_STREAK_TIER_COINS;
  if (streak >= 14) return STREAK_COIN_DAY_14;
  if (streak >= 7)  return STREAK_COIN_DAY_7;
  if (streak >= 3)  return STREAK_COIN_DAY_3;
  return STREAK_COIN_DAY_1;
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
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    try {
      const claimedAt = new Date();
      let responsePayload = null;

      await session.withTransaction(async () => {
        const user = await claimRewardAtomically(req.userId, claimedAt, session);

        if (!user) {
          const exists = await User.exists({ _id: req.userId }).session(session);
          if (!exists) throw createHttpError(404, "User not found");
          throw createHttpError(409, "Daily reward already claimed today");
        }

        const newStreak = user.dailyRewardStreak || 1;
        const coinsAwarded = getStreakCoins(newStreak);
        const nextMilestone = getNextMilestone(newStreak);

        // Platform-wide coins cap (Stripe requirement): credit atomically,
        // never letting the resulting balance exceed MAX_USER_COINS_BALANCE.
        // This is a bonus (not a debt owed to the user), so it is safe to
        // simply cap the credited amount when the wallet is at/near the max.
        const creditResult = await creditCoinsWithCap(user._id, coinsAwarded, { session });

        await CoinTransaction.create(
          [
            {
              userId: user._id,
              type: "daily_reward",
              amount: creditResult.credited,
              reason: `Daily reward – day ${newStreak} streak`,
              status: "completed",
              metadata: {
                streak: newStreak,
                claimedAt,
                coinsAwardedNominal: coinsAwarded,
                withheldByCoinsCap: coinsAwarded - creditResult.credited,
                maxCoinsBalance: MAX_USER_COINS_BALANCE,
              },
            },
          ],
          { session }
        );

        responsePayload = {
          coinsAwarded: creditResult.credited,
          newBalance: creditResult.newCoins,
          streak: newStreak,
          nextMilestone,
          claimedAt,
          cappedByLimit: creditResult.capped,
        };
      });

      if (!responsePayload) {
        throw createHttpError(500, "Daily reward claim failed");
      }

      // Queue a reward push (fire-and-forget)
      queueEvent(
        req.userId,
        "reward",
        {
          title: "🎁 ¡Recompensa diaria reclamada!",
          body: `+${responsePayload.coinsAwarded} monedas · Racha: ${responsePayload.streak} día${responsePayload.streak !== 1 ? "s" : ""}`,
          data: { link: "/daily-reward" },
        },
        { streak: responsePayload.streak, coins: responsePayload.coinsAwarded }
      ).catch(() => {});

      // Award XP and check streak achievements (fire-and-forget)
      const xpAmount = getDailyRewardXP(responsePayload.streak);
      addXP(req.userId, xpAmount).catch(() => {});
      const streak = responsePayload.streak;
      if (streak >= 30) unlockAchievement(req.userId, "streak_30").catch(() => {});
      else if (streak >= 14) unlockAchievement(req.userId, "streak_14").catch(() => {});
      else if (streak >= 7) unlockAchievement(req.userId, "streak_7").catch(() => {});
      else if (streak >= 3) unlockAchievement(req.userId, "streak_3").catch(() => {});

      return res.json(responsePayload);
    } catch (err) {
      if (isWriteConflictError(err) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt - 1));
        continue;
      }

      const status = Number.isInteger(err?.status) ? err.status : 500;
      return res.status(status).json({ message: err?.message || "Internal server error" });
    } finally {
      session.endSession();
    }
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

/** Returns true when an error is a MongoDB write-conflict and should be retried. */
function isWriteConflictError(err) {
  if (!err) return false;
  if (err.code === 112) return true;
  if (typeof err.message === "string" && err.message.includes("Write conflict")) return true;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError")) return true;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("UnknownTransactionCommitResult")) return true;
  return false;
}

/**
 * Atomically claims today's reward if not claimed yet (does not touch
 * `coins` — the reward amount is credited separately via
 * `creditCoinsWithCap` so the platform-wide coins cap is enforced through a
 * single shared code path). Returns updated user document, or null when
 * already claimed today.
 */
async function claimRewardAtomically(userId, claimedAt, session) {
  const { startOfToday, startOfYesterday } = getUtcDayBounds(claimedAt);

  return User.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ lastDailyRewardClaimAt: null }, { lastDailyRewardClaimAt: { $lt: startOfToday } }],
    },
    [
      {
        $set: {
          __newStreak: {
            $cond: [
              {
                $and: [
                  { $ne: ["$lastDailyRewardClaimAt", null] },
                  { $gte: ["$lastDailyRewardClaimAt", startOfYesterday] },
                  { $lt: ["$lastDailyRewardClaimAt", startOfToday] },
                ],
              },
              { $add: [{ $ifNull: ["$dailyRewardStreak", 0] }, 1] },
              1,
            ],
          },
        },
      },
      {
        $set: {
          lastDailyRewardClaimAt: claimedAt,
          dailyRewardStreak: "$__newStreak",
        },
      },
      {
        $unset: ["__newStreak"],
      },
    ],
    { new: true, session }
  ).select("_id coins dailyRewardStreak lastDailyRewardClaimAt");
}

function getUtcDayBounds(baseDate) {
  const startOfToday = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(), 0, 0, 0, 0)
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setUTCDate(startOfYesterday.getUTCDate() - 1);
  return { startOfToday, startOfYesterday };
}

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { getDailyRewardStatus, claimDailyReward };
