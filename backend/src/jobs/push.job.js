const { flushQueue, sendReminderPushes } = require("../services/push.service.js");

/** How often the flush job runs (default: every 5 minutes). */
const FLUSH_INTERVAL_MS =
  parseInt(process.env.PUSH_FLUSH_INTERVAL_MS || "", 10) || 5 * 60 * 1000;

/** How often the reminder job runs (default: every 15 minutes). */
const REMINDER_INTERVAL_MS =
  parseInt(process.env.PUSH_REMINDER_INTERVAL_MS || "", 10) || 15 * 60 * 1000;

/**
 * Start the smart-push background jobs.
 *
 * – Flush job: dispatches pending push events every FLUSH_INTERVAL_MS.
 * – Reminder job: sends FOMO follow-up pushes for unopened notifications
 *   every REMINDER_INTERVAL_MS.
 *
 * The first flush run is intentionally delayed 1 minute after startup so it
 * does not contend with DB connection setup.
 */
function startPushJob() {
  const runFlush = async () => {
    try {
      await flushQueue();
    } catch (err) {
      console.error("[push-job] flushQueue error:", err.message);
    }
  };

  const runReminders = async () => {
    try {
      await sendReminderPushes();
    } catch (err) {
      console.error("[push-job] sendReminderPushes error:", err.message);
    }
  };

  // Initial delay before first run
  setTimeout(() => {
    runFlush();
    setInterval(runFlush, FLUSH_INTERVAL_MS);
  }, 60 * 1000);

  setTimeout(() => {
    runReminders();
    setInterval(runReminders, REMINDER_INTERVAL_MS);
  }, 90 * 1000);

  console.log(
    `⏰ Push job scheduled — flush every ${FLUSH_INTERVAL_MS / 60000} min, reminders every ${REMINDER_INTERVAL_MS / 60000} min`
  );
}

module.exports = { startPushJob };
