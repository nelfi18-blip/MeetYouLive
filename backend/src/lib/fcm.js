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
  like: "matches",
  super_crush: "matches",
  gift: "account_payments",
  gift_received: "account_payments",
  match: "matches",
  call: "calls",
  call_incoming: "calls",
  call_missed: "calls",
  live: "lives",
  reward: "account_payments",
  coins_purchase_confirmed: "account_payments",
  creator: "account_payments",
  creator_approved: "account_payments",
  creator_rejected: "account_payments",
  withdrawal: "account_payments",
  withdrawal_requested: "account_payments",
  withdrawal_approved: "account_payments",
  withdrawal_rejected: "account_payments",
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
 * Reserve one daily FCM delivery slot atomically.
 *
 * The three bounded buckets are independent: routine pushes cannot exhaust
 * Live or incoming-call alerts, and one Live cannot exhaust the call bucket.
 * User.updateOne's conditional predicate prevents simultaneous sends from
 * overwriting each other's counters (the previous read+set was racy).
 * Legacy users without the added bucket fields are initialized on demand.
 * Each successful reservation covers all of a user's registered devices.
 */
async function reserveDailyPushSlot(userId, type, rateLimit = {}) {
  const bucket = type === "live" ? "live" : type === "call_incoming" ? "incomingCall" : "general";
  const dateField = bucket === "general" ? "date" : `${bucket}Date`;
  const countField = bucket === "general" ? "count" : `${bucket}Count`;
  const datePath = `pushRateLimit.${dateField}`;
  const countPath = `pushRateLimit.${countField}`;
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const previousDate = rateLimit?.[dateField] ? new Date(rateLimit[dateField]) : null;
  const sameDay = previousDate && previousDate >= dayStart && previousDate < dayEnd;
  const limit = PUSH_DAILY_LIMIT;

  const incrementToday = async () => {
    const result = await User.updateOne(
      {
        _id: userId,
        [datePath]: { $gte: dayStart, $lt: dayEnd },
        $or: [{ [countPath]: { $lt: limit } }, { [countPath]: null }],
      },
      { $inc: { [countPath]: 1 } }
    );
    return result.modifiedCount === 1;
  };

  if (sameDay) {
    if (Number(rateLimit[countField] || 0) >= limit) return false;
    return incrementToday();
  }

  // A single compare-and-set starts a new day's counter. Another concurrent
  // notification may have reset it first; retry incrementing that same day
  // instead of silently dropping the event.
  const reset = await User.updateOne(
    { _id: userId, $or: [{ [datePath]: { $lt: dayStart } }, { [datePath]: null }] },
    { $set: { [datePath]: now, [countPath]: 1 } }
  );
  if (reset.modifiedCount === 1) return true;
  return incrementToday();
}

/**
 * Resolve the recipient's FCM tokens, then reserve their bounded push slot.
 * The resolved user is returned only when the quota was actually reserved.
 */
async function checkAndIncrementRateLimit(userId, type) {
  const user = await User.findById(userId).select("pushRateLimit pushToken pushTokens").lean();
  if (!user) return null;
  const allowed = await reserveDailyPushSlot(userId, type, user.pushRateLimit);
  return allowed ? user : null;
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
  // Never clear a valid legacy token just because another device's
  // registration was rejected by FCM.
  await User.updateOne(
    { _id: userId },
    { $pull: { pushTokens: { token } } }
  ).catch(() => {});
  await User.updateOne(
    { _id: userId, pushToken: token },
    {
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
 * @returns {Promise<{accepted:number,attempted:number,rejected:number,status:string,reason?:string}>}
 * accepted means FCM accepted at least one token; it does NOT prove device display.
 */
async function sendPush(userId, token, title, body, data = {}) {
  // Keep the reason non-sensitive: never return, log or persist FCM tokens.
  const skipped = (reason) => ({ accepted: 0, attempted: 0, rejected: 0, status: "skipped", reason });
  if (!userId) return skipped("missing_user");

  const app = getAdmin();
  if (!app) return skipped("fcm_unavailable");

  const user = await checkAndIncrementRateLimit(userId, data.type);
  if (!user) return skipped("user_or_quota_unavailable");
  const tokens = getDeliveryTokens(user, token);
  if (tokens.length === 0) return skipped("no_tokens");

  const admin = require("firebase-admin");
  const baseMessage = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      // Only time-sensitive and user-visible events need high delivery
      // priority. Call alerts expire with the normal 45-second ring window;
      // Live pushes expire after 15 minutes, so stale alerts cannot linger.
      // Other categories retain normal priority and their existing TTL.
      ...(data.type === "live" ? { priority: "high", ttl: 15 * 60 * 1000 } : {}),
      ...(data.type === "call_incoming" ? { priority: "high", ttl: 45 * 1000 } : {}),
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

  let accepted = 0;
  let rejected = 0;
  for (const deliveryToken of tokens) {
    try {
      await admin.messaging(app).send({ ...baseMessage, token: deliveryToken });
      accepted++;
    } catch (err) {
      rejected++;
      // Token may have been revoked or invalid. Clean just that registration.
      if (INVALID_TOKEN_CODES.has(err.code)) {
        await removeInvalidToken(userId, deliveryToken);
      }
      console.error("[fcm] send error:", safeErrorInfo(err));
    }
  }

  // "accepted" records provider acceptance, never receipt/display on Android.
  return {
    accepted,
    attempted: tokens.length,
    rejected,
    status: accepted > 0 ? "accepted" : "rejected",
    ...(accepted > 0 ? {} : { reason: "fcm_rejected" }),
  };
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

  const hasTokenFilter = { $or: [{ pushToken: { $ne: null } }, { "pushTokens.0": { $exists: true } }] };
  const query = {
    _id: { $in: userIds },
    ...hasTokenFilter,
  };
  // When a category type is provided, skip users who have explicitly disabled
  // it. IMPORTANT: documents created before `pushSettings` existed on the
  // User schema (or otherwise missing the subfield) have no
  // `pushSettings.categories` array stored in MongoDB at all — Mongoose
  // schema defaults are only applied on save/hydration, never inside a raw
  // `.find()` filter. An equality match like `{ "pushSettings.categories": type }`
  // would silently exclude every such user (opted-in by default per the
  // schema) from ever receiving a push, which is the demonstrated root cause
  // of creators' "live" push notifications not reaching existing accounts.
  // Missing categories preserves the legacy default of "all enabled".
  // An explicitly saved empty array is NOT a default; it must suppress
  // notifications as requested by the user, just like any excluded category.
  if (type) {
    query["pushSettings.enabled"] = { $ne: false };
    query.$and = [
      hasTokenFilter,
      {
        $or: [
          { "pushSettings.categories": type },
          { "pushSettings.categories": { $exists: false } },
        ],
      },
    ];
    delete query.$or;
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
