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
 * 3. Time-delayed FOMO reminders are paused; openedAt alone cannot establish
 *    that the original event is still actionable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const mongoose = require("mongoose");
const User = require("../models/User.js");
const PushEvent = require("../models/PushEvent.js");
const PushAnalytic = require("../models/PushAnalytic.js");
const { sendPush } = require("../lib/fcm.js");

// Priority order (lower number = higher priority)
const PRIORITY = {
  match: 1,
  call: 1,
  like: 2,
  message: 2,
  live: 3,
  reward: 4,
  gift: 4,
  creator: 4,
  withdrawal: 4,
  reactivation: 5,
};

// Buffer delay before a queued event becomes eligible for dispatch.
// Matches/live/reward/reactivation are sent on the next flush (≤ 5 min).
// Likes are held for one 5-minute slot so consecutive likes can be aggregated.
const BUFFER_MS = {
  match: 0,
  call: 0,
  like: 5 * 60 * 1000,
  message: 0,
  live: 0,
  reward: 0,
  gift: 0,
  creator: 0,
  withdrawal: 0,
  reactivation: 0,
};

// If the user was active within this window (ms) we skip the push entirely.
// Avoids notifying users who are already using the app.
const ACTIVE_SUPPRESS_MS = 5 * 60 * 1000;

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
 * Deliberately paused until each reminder can revalidate live/call/reward state.
 * Keep the exported function for backward compatibility with existing jobs.
 */
async function sendReminderPushes() {
  return { sent: 0, paused: true };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function _processUserEvents(uid, userEvents, now) {
  try {
    const user = await User.findById(uid)
      .select("pushToken pushTokens pushSettings lastActiveAt")
      .lean();

    if (!user?.pushToken && (!Array.isArray(user?.pushTokens) || user.pushTokens.length === 0)) {
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

      // Cancel unsent legacy marketing events left in MongoDB when the
      // inactivity campaign was paused. Never dispatch stale promotional copy.
      if (type === "reactivation") {
        await _cancelEvents(typeEvents.map((e) => e._id));
        continue;
      }

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

      // Mark all events in the batch as sent. Do not schedule a second push.
      await PushEvent.updateMany(
        { _id: { $in: typeEvents.map((e) => e._id) } },
        { status: "sent", sentAt }
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
      title: `💖 Recibiste ${count} likes`,
      body: "Puedes revisarlos en MeetYouLive.",
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

async function _cancelEvents(ids) {
  if (!ids || ids.length === 0) return;
  await PushEvent.updateMany({ _id: { $in: ids } }, { status: "cancelled" }).catch(() => {});
}

module.exports = { queueEvent, flushQueue, sendReminderPushes };
