const AnalyticsEvent = require("../models/AnalyticsEvent.js");

/**
 * Record an analytics event. Fire-and-forget: errors are logged but never
 * propagate to the caller so a tracking failure can never break a user flow.
 *
 * @param {string} event   - One of the enum values in AnalyticsEvent.event
 * @param {string|null} userId - The acting user's ObjectId string (optional)
 * @param {object} data    - Event-specific payload (stored as-is)
 */
const trackAnalyticsEvent = (event, userId, data = {}) => {
  AnalyticsEvent.create({ event, ...(userId ? { userId } : {}), data }).catch((err) =>
    console.error(`[analytics] failed to track "${event}":`, err.message)
  );
};

module.exports = { trackAnalyticsEvent };
