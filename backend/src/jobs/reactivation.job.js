"use strict";

// Inactivity campaigns are paused until messaging is backed by real, new events
// and explicit user preferences. No timers and no mail/push sends are scheduled.
function startReactivationJob() {
  console.info("[reactivation] inactivity marketing paused; event-backed notifications remain enabled");
}

module.exports = { startReactivationJob };
