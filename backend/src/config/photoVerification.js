/**
 * Photo verification (selfie liveness + face match) configuration.
 *
 * This feature stays fully OFF until real AWS Rekognition credentials, privacy
 * controls, and real-device tests are in place. `PHOTO_VERIFICATION_ENABLED`
 * must be explicitly set to "true" to turn it on — there is no fallback/demo
 * mode, and the backend NEVER fabricates a "verified" result.
 */

const parseBoolean = (value) => String(value || "").trim().toLowerCase() === "true";

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseFloatInRange = (value, fallback, min, max) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
};

const getPhotoVerificationConfig = () => ({
  // Master switch. Defaults to disabled so the feature can ship dark.
  enabled: parseBoolean(process.env.PHOTO_VERIFICATION_ENABLED),
  awsRegion: process.env.AWS_REKOGNITION_REGION || process.env.AWS_REGION || "",
  accessKeyId: process.env.AWS_REKOGNITION_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.AWS_REKOGNITION_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
  // Rekognition Face Liveness needs an S3 bucket to stage short-lived session
  // artifacts; MeetYouLive never reads selfie bytes back out of it — a lifecycle
  // rule on the bucket must auto-delete objects (see docs in .env.example).
  livenessS3Bucket: process.env.AWS_REKOGNITION_LIVENESS_BUCKET || "",
  // Minimum CompareFaces similarity (0-100) to accept a match automatically.
  similarityThreshold: parseFloatInRange(process.env.PHOTO_VERIFICATION_SIMILARITY_THRESHOLD, 90, 0, 100),
  // Minimum Face Liveness confidence (0-100) to trust the "real person" signal.
  livenessConfidenceThreshold: parseFloatInRange(
    process.env.PHOTO_VERIFICATION_LIVENESS_THRESHOLD,
    80,
    0,
    100
  ),
  // How long a started session stays valid before it must be restarted.
  sessionTtlSeconds: parsePositiveInt(process.env.PHOTO_VERIFICATION_SESSION_TTL_SECONDS, 10 * 60),
  // Minimum time between verification attempts for a given user (abuse control).
  minRetryIntervalSeconds: parsePositiveInt(process.env.PHOTO_VERIFICATION_MIN_RETRY_SECONDS, 60),
  // Max attempts allowed within the rate-limit window (also enforced by the route limiter).
  maxAttemptsPerDay: parsePositiveInt(process.env.PHOTO_VERIFICATION_MAX_ATTEMPTS_PER_DAY, 5),
  // SSRF-safe primary-photo download limits (see lib/secureImageFetch.js).
  maxImageBytes: parsePositiveInt(process.env.PHOTO_VERIFICATION_MAX_IMAGE_BYTES, 8 * 1024 * 1024),
  downloadTimeoutMs: parsePositiveInt(process.env.PHOTO_VERIFICATION_DOWNLOAD_TIMEOUT_MS, 8000),
  maxDownloadRedirects: parsePositiveInt(process.env.PHOTO_VERIFICATION_MAX_DOWNLOAD_REDIRECTS, 3),

  // --- "Perfil Auténtico" reusable face reference (same verification system;
  // NOT a second verification feature) ---------------------------------
  // Master switch for keeping a reusable, encrypted face reference after an
  // approved selfie, so a later primary-photo change can be re-checked
  // without asking for a new selfie. Defaults OFF; also requires an
  // encryption key (see faceReferenceEncryptionKey) to ever be usable —
  // fails closed (never stores a reference) if misconfigured.
  faceReferenceEnabled: parseBoolean(process.env.FACE_REFERENCE_ENABLED),
  // AWS Rekognition Collection used to hold ONLY an opaque, AWS-managed face
  // vector (never a copy of the selfie/image) per consenting user. This is
  // the AWS-native, data-minimizing option: MeetYouLive itself only ever
  // persists the opaque FaceId Rekognition returns, encrypted at rest.
  faceReferenceCollectionId: process.env.FACE_REFERENCE_COLLECTION_ID || "meetyoulive-photo-verification",
  // Minimum SearchFacesByImage similarity (0-100) to reuse the existing
  // verification for a new primary photo without a new selfie.
  faceReferenceMatchThreshold: parseFloatInRange(process.env.FACE_REFERENCE_MATCH_THRESHOLD, 92, 0, 100),
  // Limited retention: a kept reference auto-stops being usable after this
  // many days, even if never explicitly revoked (data-minimization control).
  faceReferenceRetentionDays: parsePositiveInt(process.env.FACE_REFERENCE_RETENTION_DAYS, 365),
  // Base64-encoded 32-byte key used to encrypt the opaque FaceId at rest
  // (AES-256-GCM, see lib/faceReferenceCrypto.js). Without this set, the
  // feature stays fully inert: no reference is ever created.
  faceReferenceEncryptionKey: process.env.FACE_REFERENCE_ENCRYPTION_KEY || "",
});

module.exports = { getPhotoVerificationConfig };
