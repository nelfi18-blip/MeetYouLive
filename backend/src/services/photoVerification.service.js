/**
 * Photo verification service — "Verificar mi foto" (Amazon Rekognition Face
 * Liveness + CompareFaces against the user's persisted primary photo).
 *
 * Design goals enforced here:
 *   - The backend is the sole authority on the result; the client can never
 *     declare itself verified (see controller — no client-supplied status).
 *   - No selfies/videos/documents/biometric templates are ever persisted;
 *     only a minimal, TTL'd session record + a status string on User.
 *   - Independent from email verification, document/identity verification,
 *     and creator approval.
 *   - Uncertain results go to "review" (human review / retry), never an
 *     automatic hard block.
 *   - Session completion is atomic: a "pending" session can only ever be
 *     claimed by ONE "complete" call (pending -> processing is a conditional
 *     write), so concurrent/duplicate completion requests can never both run
 *     CompareFaces or both write a result.
 *   - The user's photoVerification status is only updated by the session
 *     that is still the user's "activeSessionId" at write time — a slower,
 *     superseded session can never clobber a newer session's result.
 */

const crypto = require("crypto");
const User = require("../models/User.js");
const PhotoVerificationSession = require("../models/PhotoVerificationSession.js");
const { getPhotoVerificationConfig } = require("../config/photoVerification.js");
const rekognitionClient = require("../lib/rekognitionClient.js");
const { downloadVerifiedImageBytes, SecureImageFetchError } = require("../lib/secureImageFetch.js");

class PhotoVerificationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const hashIp = (ip) => (ip ? crypto.createHash("sha256").update(String(ip)).digest("hex") : "");

const ACTIVE_SESSION_STATUSES = ["pending", "processing"];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure decision function — given AWS's raw signals, decide the final status.
 * Kept side-effect free so it can be unit tested exhaustively without AWS
 * credentials or network access.
 *
 * @param {{livenessConfidence: number|null, similarity: number|null}} result
 * @param {{similarityThreshold: number, livenessConfidenceThreshold: number}} config
 * @returns {{status: "verified"|"failed"|"review", reasonCode: string}}
 */
const evaluateVerificationResult = (result, config) => {
  const { livenessConfidence, similarity } = result || {};

  if (typeof livenessConfidence !== "number" || typeof similarity !== "number") {
    return { status: "review", reasonCode: "INCOMPLETE_RESULT" };
  }

  if (livenessConfidence < config.livenessConfidenceThreshold) {
    // Not necessarily a fraud attempt (poor lighting/camera angle) — allow a
    // retry or a human reviewer to decide, never an automatic hard fail.
    return { status: "review", reasonCode: "LOW_LIVENESS_CONFIDENCE" };
  }

  if (similarity >= config.similarityThreshold) {
    return { status: "verified", reasonCode: "MATCH" };
  }

  // Clearly a different face from the primary photo.
  if (similarity < config.similarityThreshold / 2) {
    return { status: "failed", reasonCode: "FACE_MISMATCH" };
  }

  // Borderline similarity — send to human review instead of auto-approving
  // or auto-blocking.
  return { status: "review", reasonCode: "LOW_SIMILARITY" };
};

const assertEnabled = () => {
  const config = getPhotoVerificationConfig();
  if (!config.enabled) {
    throw new PhotoVerificationError(
      "PHOTO_VERIFICATION_DISABLED",
      "La verificación de foto no está disponible todavía.",
      503
    );
  }
  return config;
};

/**
 * Starts a new verification session for the user's CURRENT primary photo.
 * Requires explicit consent and blocks reuse/abuse: one active (pending or
 * processing) session at a time, a minimum retry interval, a hard daily
 * attempt cap, and no session without a primary photo.
 */
const startVerificationSession = async (userId, { consent, ip } = {}) => {
  const config = assertEnabled();

  if (consent !== true) {
    throw new PhotoVerificationError(
      "CONSENT_REQUIRED",
      "Debes aceptar el procesamiento de tus datos faciales para continuar.",
      400
    );
  }

  const user = await User.findById(userId).select("primaryPhoto photoVerification");
  if (!user) throw new PhotoVerificationError("USER_NOT_FOUND", "Usuario no encontrado.", 404);
  if (!user.primaryPhoto) {
    throw new PhotoVerificationError(
      "PRIMARY_PHOTO_REQUIRED",
      "Debes tener una foto principal antes de verificarla.",
      400
    );
  }

  const existingActive = await PhotoVerificationSession.findOne({
    userId,
    status: { $in: ACTIVE_SESSION_STATUSES },
    expiresAt: { $gt: new Date() },
  });
  if (existingActive) {
    throw new PhotoVerificationError(
      "SESSION_ALREADY_ACTIVE",
      "Ya tienes una verificación en curso.",
      409
    );
  }

  const lastAttemptAt = user.photoVerification?.lastAttemptAt;
  if (lastAttemptAt) {
    const elapsedSeconds = (Date.now() - new Date(lastAttemptAt).getTime()) / 1000;
    if (elapsedSeconds < config.minRetryIntervalSeconds) {
      throw new PhotoVerificationError(
        "RETRY_TOO_SOON",
        "Espera un momento antes de volver a intentarlo.",
        429
      );
    }
  }

  // Daily attempt cap — independent from (and in addition to) the per-hour
  // route-level rate limiter, so a user cannot exceed the configured daily
  // budget even by spacing requests out across multiple hourly windows.
  const attemptsToday = await PhotoVerificationSession.countDocuments({
    userId,
    createdAt: { $gte: new Date(Date.now() - ONE_DAY_MS) },
  });
  if (attemptsToday >= config.maxAttemptsPerDay) {
    throw new PhotoVerificationError(
      "DAILY_LIMIT_REACHED",
      "Alcanzaste el máximo de intentos de verificación por hoy.",
      429
    );
  }

  const rekognitionSessionId = await rekognitionClient.createFaceLivenessSession();
  const now = new Date();
  const session = await PhotoVerificationSession.create({
    userId,
    rekognitionSessionId,
    primaryPhotoAtStart: user.primaryPhoto,
    status: "pending",
    consentedAt: now,
    expiresAt: new Date(now.getTime() + config.sessionTtlSeconds * 1000),
    ipHash: hashIp(ip),
  });

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        "photoVerification.status": "pending",
        "photoVerification.lastAttemptAt": now,
        "photoVerification.consentAt": now,
        "photoVerification.activeSessionId": session._id,
      },
    }
  );

  return { sessionId: String(session._id), rekognitionSessionId, expiresAt: session.expiresAt };
};

/**
 * Wraps the SSRF-safe downloader and maps its errors to the service's own
 * error type. Never logs the URL or any bytes — only a generic error code.
 */
const downloadImageBytes = async (url) => {
  try {
    return await downloadVerifiedImageBytes(url);
  } catch (err) {
    if (err instanceof SecureImageFetchError) {
      throw new PhotoVerificationError("PRIMARY_PHOTO_UNREACHABLE", "No se pudo leer la foto principal.", 502);
    }
    throw err;
  }
};

/** Atomically claims a pending session for processing, or throws a precise 409/410. */
const claimSessionForProcessing = async (userId, sessionId) => {
  const existing = await PhotoVerificationSession.findOne({ _id: sessionId, userId });
  if (!existing) throw new PhotoVerificationError("SESSION_NOT_FOUND", "Sesión no encontrada.", 404);

  // Only a still-"pending" session can be expired here — if it is already
  // "processing"/terminal, let the atomic claim below report the precise
  // concurrent/duplicate-completion error instead.
  if (existing.status === "pending" && existing.expiresAt.getTime() < Date.now()) {
    await PhotoVerificationSession.updateOne(
      { _id: sessionId, userId, status: "pending" },
      { $set: { status: "expired" } }
    );
    throw new PhotoVerificationError("SESSION_EXPIRED", "La sesión expiró, inicia una nueva.", 410);
  }

  const claimed = await PhotoVerificationSession.findOneAndUpdate(
    { _id: sessionId, userId, status: "pending" },
    { $set: { status: "processing", processingStartedAt: new Date() } },
    { new: true }
  );

  if (!claimed) {
    // Someone else already claimed/completed it — re-read to report a
    // precise, non-racy error instead of a generic failure.
    const current = await PhotoVerificationSession.findOne({ _id: sessionId, userId });
    if (current?.status === "processing") {
      throw new PhotoVerificationError(
        "SESSION_PROCESSING",
        "Esta verificación ya se está procesando.",
        409
      );
    }
    throw new PhotoVerificationError("SESSION_ALREADY_COMPLETED", "Esta sesión ya fue procesada.", 409);
  }

  return claimed;
};

/** Marks a claimed ("processing") session as a final status, recording only non-biometric metadata. */
const finalizeSession = async (session, status, result) =>
  PhotoVerificationSession.updateOne(
    { _id: session._id, userId: session.userId, status: "processing" },
    { $set: { status, result, completedAt: new Date() } }
  );

/**
 * Conditionally writes the user's photoVerification status — ONLY if this
 * session is still the one the user's `activeSessionId` points to. This is
 * what prevents an older/slower session from overwriting a newer session's
 * result (e.g. if the user somehow has a more recent attempt in flight).
 */
const applyUserStatusIfStillActive = async (userId, session, userUpdate) => {
  const updateResult = await User.updateOne(
    { _id: userId, "photoVerification.activeSessionId": session._id },
    { $set: userUpdate }
  );
  return (updateResult.matchedCount ?? updateResult.n ?? 0) > 0;
};

/**
 * Completes a pending session: fetches the Rekognition liveness result
 * server-side, compares the reference face against the CURRENT primary
 * photo, applies the decision logic, and persists only the minimal status.
 * The client never supplies (and can never declare) the result.
 */
const completeVerificationSession = async (userId, sessionId) => {
  const config = assertEnabled();

  // Atomic pending -> processing claim: only one concurrent "complete" call
  // for this session can ever get past this point.
  const session = await claimSessionForProcessing(userId, sessionId);

  const user = await User.findById(userId).select("primaryPhoto photoVerification");
  if (!user) throw new PhotoVerificationError("USER_NOT_FOUND", "Usuario no encontrado.", 404);

  // Prevent swapping the primary photo mid-verification to game the match.
  if (user.primaryPhoto !== session.primaryPhotoAtStart) {
    await finalizeSession(session, "failed", { reasonCode: "PRIMARY_PHOTO_CHANGED" });
    await applyUserStatusIfStillActive(userId, session, { "photoVerification.status": "failed" });
    throw new PhotoVerificationError(
      "PRIMARY_PHOTO_CHANGED",
      "La foto principal cambió durante la verificación. Inicia una nueva.",
      409
    );
  }

  const livenessResult = await rekognitionClient.getFaceLivenessSessionResults(session.rekognitionSessionId);
  if (livenessResult.status !== "SUCCEEDED" || !livenessResult.referenceImageBytes) {
    const decision = { status: "review", reasonCode: "LIVENESS_INCOMPLETE" };
    await finalizeSession(session, decision.status, {
      livenessConfidence: livenessResult.confidence,
      reasonCode: decision.reasonCode,
    });
    await applyUserStatusIfStillActive(userId, session, { "photoVerification.status": decision.status });
    return { status: decision.status, reasonCode: decision.reasonCode };
  }

  const targetImageBytes = await downloadImageBytes(user.primaryPhoto);
  const compareResult = await rekognitionClient.compareFaces(
    livenessResult.referenceImageBytes,
    targetImageBytes,
    config.similarityThreshold
  );

  const decision = evaluateVerificationResult(
    { livenessConfidence: livenessResult.confidence, similarity: compareResult.similarity },
    config
  );

  // Re-check the primary photo right before persisting the result — the
  // Rekognition/compare calls above are async and may take a while, so this
  // closes the window between the first check and the final write.
  const userBeforeWrite = await User.findById(userId).select("primaryPhoto");
  const finalStatus =
    userBeforeWrite && userBeforeWrite.primaryPhoto !== session.primaryPhotoAtStart ? "failed" : decision.status;
  const finalReasonCode =
    finalStatus === decision.status ? decision.reasonCode : "PRIMARY_PHOTO_CHANGED";

  await finalizeSession(session, finalStatus, {
    livenessConfidence: livenessResult.confidence,
    similarity: compareResult.similarity,
    reasonCode: finalReasonCode,
  });

  const userUpdate = { "photoVerification.status": finalStatus };
  if (finalStatus === "verified") {
    userUpdate["photoVerification.verifiedAt"] = new Date();
    userUpdate["photoVerification.verifiedPhoto"] = user.primaryPhoto;
  }

  const stillActive = await applyUserStatusIfStillActive(userId, session, userUpdate);
  if (!stillActive) {
    // A newer session has since taken over the user's badge/status; this
    // session's own result is recorded above, but it must not overwrite the
    // newer one.
    throw new PhotoVerificationError(
      "SESSION_SUPERSEDED",
      "Esta verificación ya no está activa.",
      409
    );
  }

  return { status: finalStatus, reasonCode: finalReasonCode };
};

const getVerificationStatus = async (userId) => {
  const user = await User.findById(userId).select("photoVerification");
  if (!user) throw new PhotoVerificationError("USER_NOT_FOUND", "Usuario no encontrado.", 404);
  return {
    enabled: getPhotoVerificationConfig().enabled,
    status: user.photoVerification?.status || "none",
    verifiedAt: user.photoVerification?.verifiedAt || null,
  };
};

module.exports = {
  PhotoVerificationError,
  evaluateVerificationResult,
  startVerificationSession,
  completeVerificationSession,
  getVerificationStatus,
};
