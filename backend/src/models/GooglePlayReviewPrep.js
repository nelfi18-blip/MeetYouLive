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
 *
 * Supports repeated `prepare -> revert -> prepare` cycles: a `--revert`
 * never deletes the document, it only stamps `revertedAt`, so the full
 * history of a cycle is preserved. A subsequent `--execute` (after a
 * revert) creates a BRAND NEW document for the same `email`/`accountType`
 * with a fresh snapshot of whatever the state was at that point — it does
 * NOT reuse or mutate the previous (already-reverted) document. Because of
 * that, uniqueness cannot be enforced on `email` alone (that would reject
 * the new document once an older, reverted one already exists for the same
 * email). Instead, uniqueness is scoped to only the currently ACTIVE
 * (non-reverted) document per email/accountType via a partial unique index
 * below, which is exactly the invariant the lookup queries in
 * `googlePlayReviewAccounts.js` rely on (`revertedAt: null`).
 */
const googlePlayReviewPrepSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
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

// Only one ACTIVE (non-reverted) prep per email/accountType is allowed at a
// time — this is what actually needs to be unique, not the email itself.
// A partial index lets any number of already-reverted (historical) documents
// exist for the same email/accountType, which is required to support
// prepare -> revert -> prepare -> revert -> ... cycles without ever hitting
// a duplicate-key error.
googlePlayReviewPrepSchema.index(
  { email: 1, accountType: 1 },
  { unique: true, partialFilterExpression: { revertedAt: null } }
);

module.exports = mongoose.models.GooglePlayReviewPrep
  || mongoose.model("GooglePlayReviewPrep", googlePlayReviewPrepSchema);
