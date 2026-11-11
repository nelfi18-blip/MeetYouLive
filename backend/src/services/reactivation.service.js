"use strict";

/**
 * Pause the old inactivity campaign: it sent claims about new likes and
 * expiring matches based on elapsed time, not verified unread events.
 * Transactional, event-backed like/match/message/Live/call pushes remain active
 * through their independent event producers.
 *
 * Before re-enabling reactivation, require explicit user marketing preferences,
 * actual new/unread event checks, and a safe sending frequency.
 */
async function runReactivationJob() {
  return { paused: true, sent: 0 };
}

module.exports = { runReactivationJob };
