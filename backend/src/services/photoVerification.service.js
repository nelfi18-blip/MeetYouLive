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
 */

const crypto = require("crypto");
const User = require("../models/User.js");
const PhotoVerificationSession = require("../models/PhotoVerificationSession.js");
const { getPhotoVerificationConfig } = require("../config/photoVerification.js");
const rekognitionClient = require("../lib/rekognitionClient.js");

class PhotoVerificationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const hashIp = (ip) => (ip ? crypto.createHash("sha256").update(String(ip)).digest("hex") : "");

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
 * Requires explicit consent and blocks reuse/abuse (one active session at a
 * time, minimum retry interval, no session without a primary photo).
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

  const existingPending = await PhotoVerificationSession.findOne({
    userId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
  if (existingPending) {
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
    { $set: { "photoVerification.status": "pending", "photoVerification.lastAttemptAt": now, "photoVerification.consentAt": now } }
  );

  return { sessionId: String(session._id), rekognitionSessionId, expiresAt: session.expiresAt };
};

const downloadImageBytes = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new PhotoVerificationError("PRIMARY_PHOTO_UNREACHABLE", "No se pudo leer la foto principal.", 502);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

/**
 * Completes a pending session: fetches the Rekognition liveness result
 * server-side, compares the reference face against the CURRENT primary
 * photo, applies the decision logic, and persists only the minimal status.
 * The client never supplies (and can never declare) the result.
 */
const completeVerificationSession = async (userId, sessionId) => {
  const config = assertEnabled();

  const session = await PhotoVerificationSession.findOne({ _id: sessionId, userId });
  if (!session) throw new PhotoVerificationError("SESSION_NOT_FOUND", "Sesión no encontrada.", 404);
  if (session.status !== "pending") {
    throw new PhotoVerificationError("SESSION_ALREADY_COMPLETED", "Esta sesión ya fue procesada.", 409);
  }
  if (session.expiresAt.getTime() < Date.now()) {
    session.status = "expired";
    await session.save();
    throw new PhotoVerificationError("SESSION_EXPIRED", "La sesión expiró, inicia una nueva.", 410);
  }

  const user = await User.findById(userId).select("primaryPhoto photoVerification");
  if (!user) throw new PhotoVerificationError("USER_NOT_FOUND", "Usuario no encontrado.", 404);

  // Prevent swapping the primary photo mid-verification to game the match.
  if (user.primaryPhoto !== session.primaryPhotoAtStart) {
    session.status = "failed";
    session.result = { reasonCode: "PRIMARY_PHOTO_CHANGED" };
    session.completedAt = new Date();
    await session.save();
    throw new PhotoVerificationError(
      "PRIMARY_PHOTO_CHANGED",
      "La foto principal cambió durante la verificación. Inicia una nueva.",
      409
    );
  }

  const livenessResult = await rekognitionClient.getFaceLivenessSessionResults(session.rekognitionSessionId);
  if (livenessResult.status !== "SUCCEEDED" || !livenessResult.referenceImageBytes) {
    const decision = { status: "review", reasonCode: "LIVENESS_INCOMPLETE" };
    session.status = decision.status;
    session.result = { livenessConfidence: livenessResult.confidence, reasonCode: decision.reasonCode };
    session.completedAt = new Date();
    await session.save();
    await User.updateOne({ _id: userId }, { $set: { "photoVerification.status": decision.status } });
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

  session.status = decision.status;
  session.result = {
    livenessConfidence: livenessResult.confidence,
    similarity: compareResult.similarity,
    reasonCode: decision.reasonCode,
  };
  session.completedAt = new Date();
  await session.save();

  const userUpdate = { "photoVerification.status": decision.status };
  if (decision.status === "verified") {
    userUpdate["photoVerification.verifiedAt"] = new Date();
    userUpdate["photoVerification.verifiedPhoto"] = user.primaryPhoto;
  }
  await User.updateOne({ _id: userId }, { $set: userUpdate });

  return { status: decision.status, reasonCode: decision.reasonCode };
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
