/**
 * Daily Reward Reminder Job
 *
 * Runs periodically and queues a "reward available" push for users who:
 *  1. Have not yet claimed their daily reward today (lastDailyRewardClaimAt < 24 h ago or null).
 *  2. Have a pushToken.
 *  3. Have not already received a reward push in the last 20 h (dedup via PushEvent).
 *
 * This push is intentionally light — it fires at most once per day per user
 * and is suppressed by the existing rate-limit and active-in-app logic in push.service.js.
 */

const User = require("../models/User.js");
const PushEvent = require("../models/PushEvent.js");
const { queueEvent } = require("../services/push.service.js");

/** How often this job runs (default: every 4 hours). */
const INTERVAL_MS =
  parseInt(process.env.DAILY_REWARD_REMINDER_INTERVAL_MS || "", 10) ||
  4 * 60 * 60 * 1000;

/** Initial delay after startup before the first run. */
const INITIAL_DELAY_MS = 2 * 60 * 1000;

/** Minimum gap between reward reminder pushes for the same user. */
const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000; // 20 h

async function runDailyRewardReminderJob() {
  const now = new Date();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000);
  const dedupCutoff = new Date(now - DEDUP_WINDOW_MS);

  // Find users who can claim: never claimed, or last claim was > 24 h ago.
  const candidates = await User.find(
    {
      pushToken: { $ne: null },
      isBlocked: { $ne: true },
      $or: [
        { lastDailyRewardClaimAt: null },
        { lastDailyRewardClaimAt: { $lte: cutoff24h } },
      ],
    },
    "_id pushSettings"
  ).lean();

  if (candidates.length === 0) return;

  // Bulk-check which of these users already received a reward push recently.
  const candidateIds = candidates.map((u) => u._id);
  const recentRewardPushes = await PushEvent.find(
    {
      userId: { $in: candidateIds },
      type: "reward",
      createdAt: { $gte: dedupCutoff },
    },
    "userId"
  ).lean();

  const alreadySentSet = new Set(recentRewardPushes.map((e) => String(e.userId)));

  let queued = 0;
  for (const user of candidates) {
    if (alreadySentSet.has(String(user._id))) continue;

    // Respect "reward" category setting
    const settings = user.pushSettings;
    if (settings?.enabled === false) continue;
    if (
      settings?.categories?.length > 0 &&
      !settings.categories.includes("reward")
    ) {
      continue;
    }

    queueEvent(
      user._id,
      "reward",
      {
        title: "🎁 Ya puedes reclamar tus monedas",
        body: "¡Tu recompensa diaria está lista! Reclámala ahora",
        data: { link: "/daily-reward" },
      },
      { source: "daily_reminder" }
    ).catch(() => {});

    queued++;
  }

  if (queued > 0) {
    console.log(`[daily-reward-reminder] Queued ${queued} reward reminders`);
  }
}

/**
 * Start the daily reward reminder background job.
 */
function startDailyRewardReminderJob() {
  const run = async () => {
    try {
      await runDailyRewardReminderJob();
    } catch (err) {
      console.error("[daily-reward-reminder] Job error:", err.message);
    }
  };

  setTimeout(() => {
    run();
    setInterval(run, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log(
    `⏰ Daily reward reminder job scheduled — every ${INTERVAL_MS / 60000} min`
  );
}

module.exports = { startDailyRewardReminderJob };
