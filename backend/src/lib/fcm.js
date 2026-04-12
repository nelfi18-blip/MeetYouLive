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

const PUSH_DAILY_LIMIT = 2;

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
  const user = await User.findById(userId).select("pushRateLimit").lean();
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
  return true;
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
  if (!token) return;

  const app = getAdmin();
  if (!app) return; // FCM not configured — skip silently

  const allowed = await checkAndIncrementRateLimit(userId);
  if (!allowed) return;

  const admin = require("firebase-admin");
  const message = {
    token,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    webpush: {
      fcmOptions: { link: data.link || "/" },
    },
  };

  try {
    await admin.messaging(app).send(message);
  } catch (err) {
    // Token may have been revoked or is invalid — clear it so we stop trying
    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-registration-token"
    ) {
      await User.updateOne({ _id: userId }, { $set: { pushToken: null } }).catch(() => {});
    }
    console.error("[fcm] send error:", err.message);
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
 * @returns {Promise<void>}
 */
async function sendMulticastPush(userIds, title, body, data = {}) {
  if (!userIds || userIds.length === 0) return;

  const app = getAdmin();
  if (!app) return;

  const users = await User.find(
    { _id: { $in: userIds }, pushToken: { $ne: null } },
    "_id pushToken pushRateLimit"
  ).lean();

  await Promise.allSettled(
    users.map((u) => sendPush(u._id, u.pushToken, title, body, data))
  );
}

module.exports = { sendPush, sendMulticastPush };
