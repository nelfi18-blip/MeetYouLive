/**
 * Firebase Cloud Messaging (FCM) service – backend.
 *
 * Initialisation is lazy: the app is created the first time sendPush() or
 * sendMulticastPush() is called, which means the module can be imported safely
 * even if FCM env vars are not configured (pushes are silently skipped).
 *
 * Required env vars:
 *   FCM_PROJECT_ID          – Firebase project ID
 *   FCM_CLIENT_EMAIL        – service-account client e-mail
 *   FCM_PRIVATE_KEY         – service-account private key (with \n escapes)
 */

const User = require("../models/User.js");

const PUSH_DAILY_LIMIT = 8;
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
// Android channels are intentionally grouped by user-facing urgency:
// social events, calls, lives, and account/payment notices.
const CHANNEL_BY_TYPE = {
  message: "messages",
  new_message: "messages",
  match: "matches",
  call: "calls",
  call_incoming: "calls",
  call_missed: "calls",
  live: "lives",
  reward: "account_payments",
  coins_purchase_confirmed: "account_payments",
  creator: "account_payments",
  withdrawal: "account_payments",
};

let adminApp = null;

function getAdmin() {
  if (adminApp) return adminApp;

  const { FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY } = process.env;
  if (!FCM_PROJECT_ID || !FCM_CLIENT_EMAIL || !FCM_PRIVATE_KEY) return null;

  try {
    // Lazy require so the module can be loaded without the package installed
    const admin = require("firebase-admin");
    // Avoid re-initialising if another part of the code already did so
    if (admin.apps.length > 0) {
      adminApp = admin.apps[0];
    } else {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FCM_PROJECT_ID,
          clientEmail: FCM_CLIENT_EMAIL,
          privateKey: FCM_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    }
    return adminApp;
  } catch (err) {
    console.error("[fcm] Failed to initialise Firebase Admin:", err.message);
    return null;
  }
}

/**
 * Check whether the user has not yet hit the daily push limit.
 * If allowed, atomically increment the counter and return true.
 *
 * @param {string|ObjectId} userId
 * @returns {Promise<boolean>}
 */
async function checkAndIncrementRateLimit(userId) {
  const now = new Date();
  const user = await User.findById(userId).select("pushRateLimit pushToken pushTokens").lean();
  if (!user) return false;

  const rl = user.pushRateLimit || {};
  const lastDate = rl.date ? new Date(rl.date) : null;
  const isToday =
    lastDate !== null &&
    lastDate.getUTCFullYear() === now.getUTCFullYear() &&
    lastDate.getUTCMonth() === now.getUTCMonth() &&
    lastDate.getUTCDate() === now.getUTCDate();
  const count = isToday ? (rl.count || 0) : 0;

  if (count >= PUSH_DAILY_LIMIT) return false;

  await User.updateOne(
    { _id: userId },
    { $set: { "pushRateLimit.date": now, "pushRateLimit.count": count + 1 } }
  );
  return user;
}

function getDeliveryTokens(user, suppliedToken) {
  const tokens = new Set();
  const addToken = (value) => {
    if (typeof value === "string" && value) tokens.add(value);
  };

  addToken(suppliedToken);
  addToken(user?.pushToken);
  if (Array.isArray(user?.pushTokens)) {
    user.pushTokens.forEach((entry) => addToken(entry?.token));
  }
  return Array.from(tokens);
}

/** Return only non-sensitive error metadata so FCM tokens are never logged. */
function safeErrorInfo(err) {
  return {
    code: err?.code || "unknown",
    name: err?.name || "Error",
  };
}

async function removeInvalidToken(userId, token) {
  await User.updateOne(
    { _id: userId },
    {
      $pull: { pushTokens: { token } },
      $unset: { pushToken: "", pushTokenPlatform: "", pushTokenDeviceId: "" },
      $set: { pushTokenPermissionStatus: null },
    }
  ).catch(() => {});
}

/**
 * Send a push notification to a single user.
 *
 * @param {string|ObjectId} userId  – recipient's user ID (used for rate-limit lookup)
 * @param {string}          token   – FCM registration token
 * @param {string}          title
 * @param {string}          body
 * @param {Object}          [data]  – key/value pairs (all must be strings)
 * @returns {Promise<void>}
 */
async function sendPush(userId, token, title, body, data = {}) {
  if (!userId) return;

  const app = getAdmin();
  if (!app) return; // FCM not configured — skip silently

  const user = await checkAndIncrementRateLimit(userId);
  if (!user) return;
  const tokens = getDeliveryTokens(user, token);
  if (tokens.length === 0) return;

  const admin = require("firebase-admin");
  const baseMessage = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      notification: {
        channelId: data.channelId || CHANNEL_BY_TYPE[data.type] || "account_payments",
        color: "#ff2d8d",
        icon: "ic_stat_notify",
      },
    },
    webpush: {
      fcmOptions: { link: data.link || "/" },
    },
  };

  for (const deliveryToken of tokens) {
    try {
      await admin.messaging(app).send({ ...baseMessage, token: deliveryToken });
    } catch (err) {
      // Token may have been revoked or is invalid — clear it so we stop trying
      if (INVALID_TOKEN_CODES.has(err.code)) {
        await removeInvalidToken(userId, deliveryToken);
      }
      console.error("[fcm] send error:", safeErrorInfo(err));
    }
  }
}

/**
 * Send a push notification to multiple users identified by their user IDs.
 * Fetches push tokens from the database and skips users without tokens.
 * Applies per-user daily rate limiting.
 *
 * @param {Array<string|ObjectId>} userIds
 * @param {string}                 title
 * @param {string}                 body
 * @param {Object}                 [data]
 * @param {string}                 [type]  – optional event category used to
 *                                           filter users whose pushSettings
 *                                           exclude this type.
 * @returns {Promise<void>}
 */
async function sendMulticastPush(userIds, title, body, data = {}, type = null) {
  if (!userIds || userIds.length === 0) return;

  const app = getAdmin();
  if (!app) return;

  const query = {
    _id: { $in: userIds },
    $or: [{ pushToken: { $ne: null } }, { "pushTokens.0": { $exists: true } }],
  };
  // When a category type is provided, skip users who have disabled it
  if (type) {
    query["pushSettings.enabled"] = { $ne: false };
    query["pushSettings.categories"] = type;
  }

  const users = await User.find(
    query,
    "_id pushToken pushTokens pushRateLimit"
  ).lean();

  await Promise.allSettled(
    users.map((u) => sendPush(u._id, u.pushToken, title, body, data))
  );
}

module.exports = { sendPush, sendMulticastPush };
