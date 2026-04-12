const { runReactivationJob } = require("../services/reactivation.service.js");

/** How often (ms) the reactivation job runs. Default: every hour. */
const JOB_INTERVAL_MS = parseInt(process.env.REACTIVATION_JOB_INTERVAL_MS || "", 10) || 60 * 60 * 1000;

/**
 * Start the reactivation background job.
 * Runs immediately on startup, then repeats on the configured interval.
 */
function startReactivationJob() {
  const run = async () => {
    try {
      await runReactivationJob();
    } catch (err) {
      console.error("[reactivation] Unexpected job error:", err.message);
    }
  };

  // First run shortly after startup so we do not block the boot sequence.
  setTimeout(run, 5 * 60 * 1000); // delay 5 minutes on first run

  // Subsequent runs on the regular interval.
  setInterval(run, JOB_INTERVAL_MS);

  console.log(`⏰ Reactivation job scheduled every ${JOB_INTERVAL_MS / 60000} min`);
}

module.exports = { startReactivationJob };
