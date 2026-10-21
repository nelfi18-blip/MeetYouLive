/**
 * Shared helper to invalidate the "Foto verificada" (photo liveness
 * verification) badge whenever a user's primary photo changes — and, when a
 * consented, reusable face reference exists ("Perfil Auténtico"), to decide
 * whether the badge can instead be CARRIED OVER to the new photo without
 * requiring a brand-new selfie.
 *
 * Verification is only meaningful for the exact primary photo that was
 * matched against the selfie — if the user swaps their main photo, any prior
 * "verified"/"pending"/"review" state must be reset so the badge never shows
 * for a photo that was never checked, UNLESS the new photo is confirmed (by
 * the backend, via Rekognition) to be the same person as the kept reference.
 *
 * Two-phase design (required to close the window where the badge could
 * otherwise show for a brand-new, not-yet-compared photo):
 *   Phase 1 — preparePhotoVerificationReset(): a synchronous, no-AWS-call
 *     helper that computes the reset-to-"none" fields PLUS a freshly minted
 *     transition token. Callers MUST merge these fields into the SAME
 *     single atomic MongoDB write that sets `primaryPhoto` (and any other
 *     photo fields) — never as a second, later write. This guarantees that
 *     the instant the new photo is persisted, the badge is ALSO already
 *     reset; there is no intermediate state where the database (and thus
 *     the frontend) could show "verified" for an unverified, newly-changed
 *     photo.
 *   Phase 2 — reconcilePhotoVerificationAfterChange(): runs AFTER phase 1's
 *     write has committed. Performs the AWS-backed comparison and, only if
 *     it succeeds, a conditional "restore to verified" write gated on BOTH
 *     `primaryPhoto` AND `photoVerification.pendingChangeToken` still
 *     matching exactly what phase 1 wrote. The token (not just the photo
 *     URL) is what prevents a slow/duplicated AWS result from resurrecting
 *     the badge for a LATER, unrelated change to the very same photo URL
 *     (e.g. A -> B -> A, where a stale result for the earlier "B" — or even
 *     a stale result for an earlier "A" — must never apply to the newer
 *     transition that happens to share the same URL).
 */
const crypto = require("crypto");
const faceReferenceService = require("../services/faceReference.service.js");
const User = require("../models/User.js");

const buildPhotoVerificationResetOnPhotoChange = (currentUser, nextPrimaryPhoto) => {
  const currentStatus = currentUser?.photoVerification?.status || "none";
  const previousPrimaryPhoto = currentUser?.primaryPhoto || "";
  const normalizedNext = typeof nextPrimaryPhoto === "string" ? nextPrimaryPhoto : "";

  if (currentStatus === "none") return null;
  if (previousPrimaryPhoto === normalizedNext) return null;

  return {
    "photoVerification.status": "none",
    "photoVerification.verifiedPhoto": "",
    "photoVerification.verifiedAt": null,
    "photoVerification.activeSessionId": null,
  };
};

/**
 * Phase 1. Computes the fields that MUST be written in the exact same
 * atomic DB operation as the primary-photo change itself. Returns
 * `{ resetFields: null, changeToken: null }` when nothing needs to change
 * (the user was never verified, or the photo did not actually change) — in
 * that case the caller does not need to add anything to its own update.
 * Otherwise returns `resetFields` (to spread into the caller's own `$set`)
 * and the `changeToken` that must be passed to
 * `reconcilePhotoVerificationAfterChange` afterward.
 */
const preparePhotoVerificationReset = (currentUser, nextPrimaryPhoto) => {
  const baseReset = buildPhotoVerificationResetOnPhotoChange(currentUser, nextPrimaryPhoto);
  if (!baseReset) return { resetFields: null, changeToken: null };

  const changeToken = crypto.randomUUID();
  return {
    resetFields: { ...baseReset, "photoVerification.pendingChangeToken": changeToken },
    changeToken,
  };
};

/**
 * Phase 2. Must be called AFTER the caller's own atomic write has already
 * persisted `nextPrimaryPhoto` together with the `resetFields`/`changeToken`
 * from `preparePhotoVerificationReset` (same operation). Performs the
 * AWS-backed face-reference comparison and, only on a confirmed match,
 * attempts a conditional "restore to verified" write — gated on BOTH the
 * primary photo AND the transition token still matching exactly what was
 * written in phase 1, evaluated atomically by MongoDB at write time (never
 * against data read earlier in the request). If either no longer matches —
 * because a newer, concurrent change has since moved the photo and/or
 * minted its own token — the write is simply skipped: this stale/slow
 * result can never apply to anything but the exact transition it was
 * computed for.
 *
 * A failure of ANY kind here (AWS unavailable, no reference, consent
 * revoked mid-comparison, mismatch, uncertain result) leaves the photo
 * exactly as phase 1 left it: unverified, requiring a brand-new selfie —
 * never auto-approved.
 *
 * Returns the user's up-to-date `photoVerification` sub-document (always
 * re-read fresh from the database, never assumed), or null when phase 1
 * determined no transition was needed.
 */
const reconcilePhotoVerificationAfterChange = async ({
  userId,
  currentUser,
  nextPrimaryPhoto,
  changeToken,
  ip,
} = {}) => {
  if (!changeToken) {
    // No transition needed (never verified before, or the photo did not
    // actually change) — the current state is already correct; avoid an
    // unnecessary DB round trip.
    const existing = currentUser?.photoVerification;
    if (!existing) return null;
    return typeof existing.toObject === "function" ? existing.toObject() : existing;
  }

  let decisionFields = null;
  try {
    const decision = await faceReferenceService.compareAgainstReference({
      userId: userId || currentUser?._id,
      newPhotoUrl: nextPrimaryPhoto,
      ip,
    });
    if (decision.status === "verified") {
      decisionFields = {
        "photoVerification.status": "verified",
        "photoVerification.verifiedPhoto": nextPrimaryPhoto,
        "photoVerification.verifiedAt": new Date(),
      };
    }
  } catch (err) {
    // Never let a face-reference failure throw out of a profile-photo
    // update — just leave phase 1's reset-to-"none" state in place, same as
    // the pre-existing invalidate-on-photo-change behavior.
    console.error("[photo-verification] reference comparison failed:", err?.message || err);
  }

  if (decisionFields) {
    await User.updateOne(
      {
        _id: userId,
        primaryPhoto: nextPrimaryPhoto,
        "photoVerification.pendingChangeToken": changeToken,
      },
      { $set: decisionFields }
    );
  }

  // Always return the CURRENT authoritative state from the database rather
  // than assuming our own decision is the one that stuck — if a newer photo
  // change raced ahead of us, its own transition (not ours) is correct here.
  const fresh = await User.findById(userId).select("photoVerification");
  return fresh ? fresh.toObject().photoVerification : null;
};

module.exports = {
  buildPhotoVerificationResetOnPhotoChange,
  preparePhotoVerificationReset,
  reconcilePhotoVerificationAfterChange,
};
