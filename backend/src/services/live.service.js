/**
 * Live stream validation and cleanup service
 * Handles detection and cleanup of stale/ghost live streams
 */

const Live = require("../models/Live.js");

// Maximum duration for a live stream before it's considered stale (in milliseconds)
// 6 hours = 6 * 60 * 60 * 1000
const MAX_LIVE_DURATION_MS = 6 * 60 * 60 * 1000;

// Brief, explicit tolerance window for host connect/reconnect races (in
// milliseconds). This is NOT a replacement for MAX_LIVE_DURATION_MS — it
// only covers the short gap between `startLive` (HTTP) completing and the
// host's socket finishing `live_host_active` registration, plus brief
// network blips/reconnects. It must stay small so a host that is truly
// gone stops being publicly listed quickly instead of lingering for hours.
const HOST_PRESENCE_GRACE_MS = 45 * 1000;

const PUBLIC_LIVE_ROLES = new Set(["creator", "subCreator"]);
const STAFF_ROLES = new Set(["admin", "moderator", "support", "creator_manager", "finance", "content_reviewer"]);

const getLiveStartTime = (live) => live?.startedAt || live?.createdAt;

function isLiveStale(live, now = Date.now()) {
  const startTime = getLiveStartTime(live);
  if (!startTime) return true;
  return now - new Date(startTime).getTime() > MAX_LIVE_DURATION_MS;
}

function getPersistedActiveLiveQuery(now = new Date()) {
  return {
    isLive: true,
    createdAt: { $gte: new Date(now.getTime() - MAX_LIVE_DURATION_MS) },
    $or: [
      { endedAt: null },
      { endedAt: { $exists: false } },
    ],
  };
}

function isPersistedActiveLive(live, now = Date.now()) {
  if (!live) return false;
  if (live.isLive !== true) return false;
  if (live.endedAt != null) return false;
  return !isLiveStale(live, now);
}

function getLiveUserRole(live) {
  return live?.user?.role || live?.userRole || null;
}

function isApprovedPublicLiveCreator(live) {
  const user = live?.user || {};
  const role = getLiveUserRole(live);
  if (STAFF_ROLES.has(role)) return false;
  return PUBLIC_LIVE_ROLES.has(role) && user.creatorStatus === "approved";
}

/**
 * Whether a disconnected host should still be tolerated as "effectively
 * present" for public-listing purposes, to avoid two known races:
 *  - startLive (HTTP) completing before the host's socket has finished
 *    `live_host_active` registration;
 *  - a brief network blip/reconnect right after the host was last seen.
 *
 * This is intentionally a short, explicit window (HOST_PRESENCE_GRACE_MS),
 * not a second multi-hour timeout — MAX_LIVE_DURATION_MS remains the only
 * long-lived safety net.
 */
function isHostPresenceWithinGrace(live, options = {}) {
  const now = options.now != null ? new Date(options.now).getTime() : Date.now();

  const startTime = getLiveStartTime(live);
  if (startTime) {
    const sinceStart = now - new Date(startTime).getTime();
    if (sinceStart >= 0 && sinceStart <= HOST_PRESENCE_GRACE_MS) return true;
  }

  if (options.hostLastSeenAt) {
    const sinceLastSeen = now - new Date(options.hostLastSeenAt).getTime();
    if (sinceLastSeen >= 0 && sinceLastSeen <= HOST_PRESENCE_GRACE_MS) return true;
  }

  return false;
}

function getLiveState(live, options = {}) {
  const hostConnected = typeof options.hostConnected === "boolean" ? options.hostConnected : false;
  const persistedActive = isPersistedActiveLive(live, options.now);
  const approvedPublicCreator = options.requireApprovedCreator === false
    ? true
    : isApprovedPublicLiveCreator(live);
  const hostPresent = hostConnected || isHostPresenceWithinGrace(live, options);
  const publiclyListed = persistedActive && approvedPublicCreator && hostPresent;
  return {
    persistedActive,
    hostConnected,
    publiclyListed,
  };
}

function isPubliclyActiveLive(live, options = {}) {
  return getLiveState(live, options).publiclyListed;
}

function appendLiveState(live, options = {}) {
  if (!live) return live;
  return {
    ...live,
    liveState: getLiveState(live, options),
  };
}

/**
 * Check if a live stream is actually active
 * A live is considered active only if:
 * - isLive === true
 * - endedAt is null or missing
 * - createdAt exists and is not older than MAX_LIVE_DURATION
 * 
 * @param {Object} live - Live document (plain object or Mongoose doc)
 * @returns {boolean} - true if live is actually active, false otherwise
 */
function isLiveActuallyActive(live) {
  return isPersistedActiveLive(live);
}

/**
 * Mark a stale live stream as ended
 * Sets isLive = false and endedAt = current time
 * 
 * @param {string} liveId - Live document ID
 * @returns {Promise<Object|null>} - Updated live document or null if not found
 */
async function markLiveAsEnded(liveId) {
  try {
    const updated = await Live.findByIdAndUpdate(
      liveId,
      {
        isLive: false,
        endedAt: new Date(),
      },
      { new: true }
    );
    return updated;
  } catch (err) {
    console.error("Error marking live as ended:", err.message);
    return null;
  }
}

/**
 * Clean up stale live streams
 * Finds all lives marked as active but exceeding max duration and marks them as ended
 * 
 * @returns {Promise<number>} - Number of lives cleaned up
 */
async function cleanupStaleLives() {
  try {
    const maxAge = new Date(Date.now() - MAX_LIVE_DURATION_MS);
    
    // Find all lives that are marked as active but are older than max duration
    const staleLives = await Live.find({
      isLive: true,
      createdAt: { $lt: maxAge },
      $or: [
        { endedAt: null },
        { endedAt: { $exists: false } }
      ]
    }).select("_id");
    
    if (staleLives.length === 0) {
      return 0;
    }
    
    // Mark all stale lives as ended
    const result = await Live.updateMany(
      { _id: { $in: staleLives.map(l => l._id) } },
      {
        isLive: false,
        endedAt: new Date(),
      }
    );
    
    console.log(`Cleaned up ${result.modifiedCount} stale live streams`);
    return result.modifiedCount || 0;
  } catch (err) {
    console.error("Error cleaning up stale lives:", err);
    return 0;
  }
}

/**
 * Filter array of lives to include ONLY truly active streams
 * A live is ACTIVE only if:
 * - isLive === true OR status === "live"
 * - AND endedAt is null
 * 
 * Also removes duplicates by _id
 * 
 * @param {Array} lives - Array of live documents
 * @returns {Array} - Filtered array with only active lives (no duplicates)
 */
function filterActiveLives(lives) {
  if (!Array.isArray(lives)) return [];
  const activeLives = lives.filter((live) => isPersistedActiveLive(live));
  
  // Remove duplicates by _id
  const seen = new Set();
  const uniqueLives = [];
  
  for (const live of activeLives) {
    const id = String(live._id);
    if (!seen.has(id)) {
      seen.add(id);
      uniqueLives.push(live);
    }
  }
  
  return uniqueLives;
}

module.exports = {
  MAX_LIVE_DURATION_MS,
  HOST_PRESENCE_GRACE_MS,
  getPersistedActiveLiveQuery,
  getLiveState,
  isPersistedActiveLive,
  isPubliclyActiveLive,
  isApprovedPublicLiveCreator,
  appendLiveState,
  isLiveActuallyActive,
  markLiveAsEnded,
  cleanupStaleLives,
  filterActiveLives,
};
