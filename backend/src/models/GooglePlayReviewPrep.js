const mongoose = require("mongoose");

/**
 * GooglePlayReviewPrep
 *
 * Internal bookkeeping collection used ONLY by
 * `backend/scripts/set-google-play-review-accounts.js` to make the
 * Google Play review account preparation safely reversible.
 *
 * It is never read by any controller/route/middleware and has no effect
 * on runtime application behavior — it exists purely so the admin script
 * can restore the reviewer's original coin balance on `--revert` instead
 * of assuming it was 0.
 */
const googlePlayReviewPrepSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    accountType: { type: String, enum: ["reviewer", "demo_creator"], required: true },
    // Snapshot of the fields this script overwrote, captured ONLY the first
    // time the script is applied, so `--revert` can restore the exact
    // pre-existing state regardless of how many times --execute is re-run.
    previousState: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Whether the account already existed before the script ran (relevant
    // for the demo creator account, which the script may create).
    existedBefore: { type: Boolean, default: true },
    appliedAt: { type: Date, default: null },
    revertedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.GooglePlayReviewPrep
  || mongoose.model("GooglePlayReviewPrep", googlePlayReviewPrepSchema);
