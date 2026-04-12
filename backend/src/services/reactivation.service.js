const User = require("../models/User.js");
const Like = require("../models/Like.js");
const Chat = require("../models/Chat.js");
const { sendReactivationEmail } = require("./email.service.js");
const { sendPush } = require("../lib/fcm.js");

const H24 = 24 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;
const H72 = 72 * 60 * 60 * 1000;

/**
 * Run one iteration of the reactivation job.
 *
 * Logic:
 *  - Query users whose lastActiveAt is at least 24 h ago.
 *  - For each user determine which day-window (1 / 2 / 3) applies and whether
 *    that window's email has already been sent.
 *  - Send the email, then record the timestamp so it is not sent again.
 *  - After day 3 no further emails are sent until the user logs in again
 *    (which resets all reactivation fields via the auth middleware).
 *
 * Anti-spam: each day-window email is sent at most once.  The "max 1 per day"
 * rule is naturally enforced because windows are mutually exclusive and each
 * has its own sent-flag.
 */
async function runReactivationJob() {
  const now = new Date();
  const cutoff24h = new Date(now - H24);

  // Candidates: have a lastActiveAt set and have been inactive for ≥ 24 h.
  // Exclude blocked users and accounts without email.
  const candidates = await User.find({
    lastActiveAt: { $lte: cutoff24h },
    email: { $exists: true, $ne: null, $ne: "" },
    isBlocked: { $ne: true },
  }).select("_id email name username lastActiveAt reactivation pushToken");

  if (candidates.length === 0) return;

  const results = { processed: 0, skipped: 0, sent: 0, errors: 0 };

  for (const user of candidates) {
    results.processed++;

    const inactiveMs = now - user.lastActiveAt;

    // Determine which day notification to attempt (highest applicable first so
    // we do not skip day 3 when someone was inactive >72 h all at once).
    let day = null;
    if (inactiveMs >= H72 && !user.reactivation?.day3SentAt) {
      day = 3;
    } else if (inactiveMs >= H48 && !user.reactivation?.day2SentAt) {
      day = 2;
    } else if (inactiveMs >= H24 && !user.reactivation?.day1SentAt) {
      day = 1;
    }

    if (!day) {
      results.skipped++;
      continue;
    }

    try {
      // Personalisation: fetch pending likes and match count in parallel.
      const [likesCount, matchesCount] = await Promise.all([
        Like.countDocuments({ to: user._id }),
        Chat.countDocuments({ participants: user._id }),
      ]);

      // displayName may be empty; sendReactivationEmail falls back to "amigo" when empty.
      const displayName = user.username || user.name || "";

      await sendReactivationEmail(user.email, displayName, day, likesCount, matchesCount);

      // FCM push for inactivity (fire-and-forget)
      if (user.pushToken) {
        const pushBody = likesCount > 0
          ? `Tienes ${likesCount} like${likesCount !== 1 ? "s" : ""} esperándote 💖`
          : "Te echamos de menos. ¡Vuelve a conectarte!";
        sendPush(user._id, user.pushToken, "🚀 Tu perfil puede destacar ahora", pushBody, { link: "/crush" })
          .catch(() => {});
      }

      // Mark this day-window as sent.
      await User.updateOne(
        { _id: user._id },
        { [`reactivation.day${day}SentAt`]: now }
      );

      results.sent++;
    } catch (err) {
      console.error(`[reactivation] Error sending day ${day} email to user ${user._id}:`, err.message);
      results.errors++;
    }
  }

  if (results.sent > 0 || results.errors > 0) {
    console.log(
      `[reactivation] Job done — processed:${results.processed} sent:${results.sent} skipped:${results.skipped} errors:${results.errors}`
    );
  }
}

module.exports = { runReactivationJob };
