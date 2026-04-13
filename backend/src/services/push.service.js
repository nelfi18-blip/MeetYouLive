/**
 * Smart Push Service – aggregation, priority engine, and FOMO reminders.
 *
 * ─── How it works ────────────────────────────────────────────────────────────
 *
 * 1. Callers use `queueEvent()` to record an intent to send a push.
 *    Events are stored as PushEvent documents and are NOT sent immediately.
 *
 * 2. The background job calls `flushQueue()` every 5 minutes.
 *    Events are grouped by (userId, type) and sent in priority order:
 *      match (1) → like (2) → live (3) → reward (4)
 *    Aggregation rules:
 *      like  : 1 like  → personal push; 3+ likes → FOMO grouped push
 *      match : 2+ matches → "🔥 Tienes varios matches nuevos"
 *      live / reward: always individual (already unique per user)
 *
 * 3. After sending, a reminder is scheduled 2–4 h later (random jitter).
 *    `sendReminderPushes()` picks up events whose reminderScheduledAt has
 *    passed and openedAt is still null, then sends a follow-up nudge.
 *
 * 4. When the user taps a notification, the frontend calls
 *    POST /api/push/opened/:eventId which sets openedAt and suppresses
 *    the pending reminder.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const mongoose = require("mongoose");
const User = require("../models/User.js");
const PushEvent = require("../models/PushEvent.js");
const PushAnalytic = require("../models/PushAnalytic.js");
const { sendPush } = require("../lib/fcm.js");

// Priority order (lower number = higher priority)
const PRIORITY = { match: 1, like: 2, live: 3, reward: 4, reactivation: 5 };

// Buffer delay before a queued event becomes eligible for dispatch.
// Matches/live/reward/reactivation are sent on the next flush (≤ 5 min).
// Likes are held for one 5-minute slot so consecutive likes can be aggregated.
const BUFFER_MS = {
  match: 0,
  like: 5 * 60 * 1000,
  live: 0,
  reward: 0,
  reactivation: 0,
};

// If the user was active within this window (ms) we skip the push entirely.
// Avoids notifying users who are already using the app.
const ACTIVE_SUPPRESS_MS = 5 * 60 * 1000;

// Reminder window: send follow-up between 2 h and 4 h after delivery.
const REMINDER_MIN_MS = 2 * 60 * 60 * 1000;
const REMINDER_MAX_MS = 4 * 60 * 60 * 1000;
const REMINDER_JITTER_MS = REMINDER_MAX_MS - REMINDER_MIN_MS;

// Minimum number of likes required to trigger the FOMO grouped message.
const FOMO_LIKE_THRESHOLD = 3;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Queue a push event for eventual delivery.
 *
 * @param {string|ObjectId} userId
 * @param {"match"|"like"|"live"|"reward"} type
 * @param {{ title: string, body: string, data?: Object }} payload
 * @param {Object} [metadata]  – arbitrary extra fields stored on the document
 * @returns {Promise<PushEvent>}
 */
async function queueEvent(userId, type, payload, metadata = {}) {
  const now = Date.now();
  const scheduledAt = new Date(now + (BUFFER_MS[type] || 0));

  // Group key: same user + type + 5-minute slot → eligible for aggregation
  const slot = Math.floor(scheduledAt.getTime() / (5 * 60 * 1000));
  const groupKey = `${userId}:${type}:${slot}`;

  const event = await PushEvent.create({
    userId,
    type,
    priority: PRIORITY[type] || 4,
    payload,
    groupKey,
    status: "pending",
    scheduledAt,
    metadata,
  });

  return event;
}

/**
 * Process all pending push events whose scheduledAt has passed.
 * Called by the background job every 5 minutes.
 */
async function flushQueue() {
  const now = new Date();

  const events = await PushEvent.find({
    status: "pending",
    scheduledAt: { $lte: now },
  })
    .sort({ priority: 1, scheduledAt: 1 })
    .lean();

  if (events.length === 0) return;

  // ── Group by userId ──────────────────────────────────────────────────────
  const byUser = {};
  for (const ev of events) {
    const uid = String(ev.userId);
    if (!byUser[uid]) byUser[uid] = [];
    byUser[uid].push(ev);
  }

  for (const [uid, userEvents] of Object.entries(byUser)) {
    await _processUserEvents(uid, userEvents, now);
  }
}

/**
 * Dispatch reminder pushes for events that were sent but never opened.
 * Called by the background job every 15 minutes.
 */
async function sendReminderPushes() {
  const now = new Date();

  // Find representative events that are overdue for a reminder
  const events = await PushEvent.find({
    status: "sent",
    reminderScheduledAt: { $lte: now },
    reminderSentAt: null,
    openedAt: null,
  })
    .sort({ reminderScheduledAt: 1 })
    .lean();

  if (events.length === 0) return;

  for (const ev of events) {
    try {
      const user = await User.findById(ev.userId)
        .select("pushToken pushSettings")
        .lean();

      if (!user?.pushToken) continue;
      if (!_isAllowed(user, ev.type)) continue;

      // Atomically claim the reminder slot (guards against concurrent job runs
      // and suppresses the reminder if the user has since opened the notification)
      const claimed = await PushEvent.findOneAndUpdate(
        { _id: ev._id, openedAt: null, reminderSentAt: null },
        { reminderSentAt: now }
      );
      if (!claimed) continue; // already sent or opened between queries

      const reminderPayload = _buildReminderPayload(ev);
      await sendPush(
        ev.userId,
        user.pushToken,
        reminderPayload.title,
        reminderPayload.body,
        { ...(ev.payload?.data || {}), pushEventId: String(ev._id), reminder: "1" }
      );

      await PushAnalytic.create({
        userId: ev.userId,
        pushEventId: ev._id,
        type: ev.type,
        action: "sent",
        metadata: { reminder: true },
      }).catch(() => {});
    } catch (err) {
      console.error("[push] reminder error for event", String(ev._id), err.message);
    }
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function _processUserEvents(uid, userEvents, now) {
  try {
    const user = await User.findById(uid)
      .select("pushToken pushSettings lastActiveAt")
      .lean();

    if (!user?.pushToken) {
      await _cancelEvents(userEvents.map((e) => e._id));
      return;
    }

    if (!user.pushSettings?.enabled && user.pushSettings?.enabled !== undefined) {
      await _cancelEvents(userEvents.map((e) => e._id));
      return;
    }

    // Suppress pushes if the user is actively using the app right now
    if (
      user.lastActiveAt &&
      now - new Date(user.lastActiveAt) < ACTIVE_SUPPRESS_MS
    ) {
      await _cancelEvents(userEvents.map((e) => e._id));
      return;
    }

    // Group by type (already sorted by priority)
    const byType = {};
    for (const ev of userEvents) {
      if (!byType[ev.type]) byType[ev.type] = [];
      byType[ev.type].push(ev);
    }

    // Process each type in priority order
    const sortedTypes = Object.keys(byType).sort(
      (a, b) => (PRIORITY[a] || 99) - (PRIORITY[b] || 99)
    );

    for (const type of sortedTypes) {
      const typeEvents = byType[type];

      if (!_isAllowed(user, type)) {
        await _cancelEvents(typeEvents.map((e) => e._id));
        continue;
      }

      const { title, body } = _buildAggregatedPayload(type, typeEvents);
      const link = typeEvents[0].payload?.data?.link || "/";
      const representativeId = String(typeEvents[0]._id);

      await sendPush(uid, user.pushToken, title, body, {
        link,
        pushEventId: representativeId,
        type,
      });

      const sentAt = new Date();
      const reminderDelay = REMINDER_MIN_MS + Math.floor(Math.random() * REMINDER_JITTER_MS);
      const reminderScheduledAt = new Date(sentAt.getTime() + reminderDelay);

      // Mark all events in the batch as sent
      await PushEvent.updateMany(
        { _id: { $in: typeEvents.map((e) => e._id) } },
        { status: "sent", sentAt }
      );

      // Only the first (representative) event carries the reminder
      await PushEvent.updateOne(
        { _id: typeEvents[0]._id },
        { reminderScheduledAt }
      );

      // Analytics
      const analyticDocs = typeEvents.map((e) => ({
        userId: uid,
        pushEventId: e._id,
        type,
        action: "sent",
        metadata: {
          aggregated: typeEvents.length > 1,
          count: typeEvents.length,
        },
      }));
      await PushAnalytic.insertMany(analyticDocs, { ordered: false }).catch(() => {});
    }
  } catch (err) {
    console.error("[push] _processUserEvents error for user", uid, err.message);
  }
}

/** Returns true if the user's pushSettings permit the given event type. */
function _isAllowed(user, type) {
  const settings = user.pushSettings;
  // If the sub-document exists and enabled is explicitly false, block
  if (settings && settings.enabled === false) return false;
  // If categories array is present and non-empty, the type must be included
  if (settings?.categories && settings.categories.length > 0) {
    return settings.categories.includes(type);
  }
  return true;
}

/** Build the title/body for a (potentially aggregated) group of events. */
function _buildAggregatedPayload(type, events) {
  const count = events.length;
  if (type === "match") {
    if (count === 1) {
      return {
        title: events[0].payload.title || "🔥 ¡Tienes un match nuevo!",
        body: events[0].payload.body || "",
      };
    }
    return {
      title: "🔥 ¡Tienes varios matches nuevos!",
      body: `Tienes ${count} matches nuevos esperándote`,
    };
  }

  if (type === "like") {
    if (count < FOMO_LIKE_THRESHOLD) {
      return {
        title: events[0].payload.title || "💖 Alguien te dio like",
        body: events[0].payload.body || "",
      };
    }
    return {
      title: `🔥 ${count} personas quieren conocerte`,
      body: "¡No los dejes esperando!",
    };
  }

  if (type === "reactivation") {
    return {
      title: events[0].payload.title || "🚀 Tu perfil puede destacar ahora",
      body: events[0].payload.body || "¡Vuelve y conecta con alguien hoy!",
    };
  }

  // live / reward: no aggregation, use first event's payload
  return {
    title: events[0].payload.title || "MeetYouLive",
    body: events[0].payload.body || "",
  };
}

/** Build a FOMO-driven reminder payload based on event type. */
function _buildReminderPayload(ev) {
  const type = ev.type;
  const messages = {
    match: {
      title: "🔥 Tu match te está esperando",
      body: "¡No dejes que se enfríe! Empieza a chatear ahora",
    },
    like: {
      title: "⏳ Aún tienes likes sin ver",
      body: "Alguien sigue esperando tu respuesta 💖",
    },
    live: {
      title: "🚀 El directo sigue en marcha",
      body: "¡Únete antes de que termine!",
    },
    reward: {
      title: "🎁 Tu recompensa diaria te espera",
      body: "¡Reclama tus monedas antes de que pierdas tu racha!",
    },
    reactivation: {
      title: "🚀 Tu perfil puede destacar ahora",
      body: "¡No pierdas la oportunidad de conectar hoy!",
    },
  };
  return messages[type] || { title: "MeetYouLive", body: ev.payload?.body || "" };
}

async function _cancelEvents(ids) {
  if (!ids || ids.length === 0) return;
  await PushEvent.updateMany({ _id: { $in: ids } }, { status: "cancelled" }).catch(() => {});
}

module.exports = { queueEvent, flushQueue, sendReminderPushes };
