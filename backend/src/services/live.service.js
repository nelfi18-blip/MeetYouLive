/**
 * Live stream validation and cleanup service
 * Handles detection and cleanup of stale/ghost live streams
 */

const Live = require("../models/Live.js");

// Maximum duration for a live stream before it's considered stale (in milliseconds)
// 6 hours = 6 * 60 * 60 * 1000
const MAX_LIVE_DURATION_MS = 6 * 60 * 60 * 1000;

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
  if (!live) return false;
  
  // Must have isLive flag set to true
  if (live.isLive !== true) return false;
  
  // Must not have an endedAt timestamp
  if (live.endedAt != null) return false;
  
  // Must have a createdAt timestamp (startedAt equivalent)
  if (!live.createdAt) return false;
  
  // Check if live has exceeded maximum duration
  const now = Date.now();
  const startTime = new Date(live.createdAt).getTime();
  const duration = now - startTime;
  
  if (duration > MAX_LIVE_DURATION_MS) {
    return false; // Live is too old, considered stale
  }
  
  return true;
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

module.exports = {
  MAX_LIVE_DURATION_MS,
  isLiveActuallyActive,
  markLiveAsEnded,
  cleanupStaleLives,
};
