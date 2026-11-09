const { flushQueue } = require("../services/push.service.js");

// Only dispatch real, newly queued events. Time-delayed second reminders are
// paused: "unopened push" does not prove a Live is ongoing, a call was missed,
// a reward is unclaimed or a match is waiting.
const FLUSH_INTERVAL_MS =
  parseInt(process.env.PUSH_FLUSH_INTERVAL_MS || "", 10) || 5 * 60 * 1000;
const FLUSH_INITIAL_DELAY_MS = 60 * 1000;

function startPushJob() {
  const runFlush = async () => {
    try {
      await flushQueue();
    } catch (err) {
      console.error("[push-job] flushQueue error:", err.message);
    }
  };

  setTimeout(() => {
    runFlush();
    setInterval(runFlush, FLUSH_INTERVAL_MS);
  }, FLUSH_INITIAL_DELAY_MS);

  console.log(`⏰ Push dispatch scheduled every ${FLUSH_INTERVAL_MS / 60000} min; unverified reminders paused`);
}

module.exports = { startPushJob };
