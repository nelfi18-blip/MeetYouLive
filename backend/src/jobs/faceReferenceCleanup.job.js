"use strict";

/**
 * Background retry job for the "Perfil Auténtico" face-reference AWS
 * deletion lifecycle. A reference is NEVER reused once revoked/expired/
 * superseded (see faceReference.service.js), but if AWS's own DeleteFaces
 * call fails (network error, throttling, etc.) the deletion itself can
 * still be pending — this job keeps retrying it on an interval until AWS
 * confirms, instead of leaving an orphaned biometric pointer forever.
 */

const { retryPendingFaceReferenceDeletions } = require("../services/faceReference.service.js");

const INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes
let intervalId = null;

async function runFaceReferenceDeletionRetry() {
  return retryPendingFaceReferenceDeletions({ limit: 50 });
}

function startFaceReferenceDeletionRetryJob() {
  if (intervalId) return intervalId;
  runFaceReferenceDeletionRetry().catch((err) => {
    console.error("[face-reference-cleanup] retry pass failed:", err?.message || err);
  });
  intervalId = setInterval(() => {
    runFaceReferenceDeletionRetry().catch((err) => {
      console.error("[face-reference-cleanup] retry pass failed:", err?.message || err);
    });
  }, INTERVAL_MS);
  return intervalId;
}

module.exports = { runFaceReferenceDeletionRetry, startFaceReferenceDeletionRetryJob };
