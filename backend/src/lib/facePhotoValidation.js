/**
 * Central "does this profile photo show a sufficiently visible human face?"
 * validator. Gates NEW/CHANGED profile photos (avatar upload, gallery
 * additions, primary-photo changes submitted by URL) — it is never applied
 * to reordering or removing photos the user already has on file.
 *
 * Reuses the existing AWS Rekognition client (`rekognitionClient.js`) and the
 * existing SSRF-safe downloader (`secureImageFetch.js`) — no new AWS client,
 * no new biometric storage. AWS Rekognition `DetectFaces` alone only
 * confirms "a face-like region was detected with reasonable size/quality/
 * confidence" — it does NOT mean the photo belongs to the account holder.
 *
 * When a caller supplies `userId` (see `validateFacePhotoBuffer`/
 * `validateFacePhotoUrl` options), and ONLY then, this module additionally
 * reuses the EXISTING "Perfil Auténtico" identity system
 * (`faceReferenceService.compareAgainstReference`, itself backed by AWS
 * `SearchFacesByImage` against the user's own consented, reusable face
 * reference) to confirm the new photo is actually the same person —
 * never a second biometric system. If the user has no usable reference yet,
 * this identity step is skipped entirely and the photo may still pass on
 * face-presence alone, WITHOUT ever being granted verified-identity status.
 * If a usable reference exists, a confirmed mismatch, an uncertain result,
 * or any AWS/provider failure are ALL treated as a rejection of the new
 * photo itself (never just a badge downgrade) — the photo is never
 * auto-approved in those cases.
 *
 * Fully gated behind `FACE_PHOTO_VALIDATION_ENABLED` (see
 * `backend/src/config/faceDetection.js`). When disabled, every exported
 * function is a no-op that reports `{ ok: true, skipped: true }` so existing
 * upload/profile behavior is completely unchanged. This flag is independent
 * from `PROFILE_AUTHENTICITY_ENFORCED`/mandatory-selfie verification, which
 * this module never activates or reads.
 *
 * Fail-closed: any AWS error, unreadable/forged image, or inconclusive
 * result is treated as a REJECTION while the flag is on — never an
 * automatic pass.
 */

const sharp = require("sharp");
const { getFaceDetectionConfig } = require("../config/faceDetection.js");
const { detectFaces } = require("./rekognitionClient.js");
const { downloadVerifiedImageBytes, SecureImageFetchError } = require("./secureImageFetch.js");
// Reused ONLY to invoke the EXISTING CompareFaces/SearchFacesByImage identity
// system ("Perfil Auténtico") when the user already has a consented, usable
// face reference — never a second biometric system. DetectFaces (below)
// only confirms *a* face is visible; identity ("is this the account
// holder?") can only ever come from `faceReferenceService.compareAgainstReference`.
const faceReferenceService = require("../services/faceReference.service.js");

// Rekognition `DetectFaces` with inline bytes: 5 MB request limit, images
// must not exceed 4096x4096 — both are enforced below regardless of what the
// original upload/download already capped, since the converted JPEG could in
// principle differ in size from the source bytes.
const MAX_DETECT_FACES_BYTES = 5 * 1024 * 1024;
// Long-edge cap applied before Rekognition to keep requests small/fast and
// stay well under AWS's 4096x4096 dimension limit; detection accuracy does
// not need more resolution than this.
const RESIZE_LONG_EDGE = 1600;

const SUPPORTED_SNIFFED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

const FACE_PHOTO_VALIDATION_CODES = {
  OK: "OK",
  INVALID_IMAGE: "INVALID_IMAGE",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  ANIMATED_NOT_SUPPORTED: "ANIMATED_NOT_SUPPORTED",
  IMAGE_TOO_LARGE: "IMAGE_TOO_LARGE",
  NO_FACE_DETECTED: "NO_FACE_DETECTED",
  FACE_TOO_SMALL: "FACE_TOO_SMALL",
  LOW_QUALITY: "LOW_QUALITY",
  MULTIPLE_FACES: "MULTIPLE_FACES",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  URL_NOT_ALLOWED: "URL_NOT_ALLOWED",
  // Identity-gate codes (see `evaluateIdentityForNewPhoto` below). Only ever
  // produced when the user already has a usable, consented face reference —
  // DetectFaces alone can never produce these.
  FACE_IDENTITY_MISMATCH: "FACE_IDENTITY_MISMATCH",
  FACE_IDENTITY_UNVERIFIED: "FACE_IDENTITY_UNVERIFIED",
};

// Default (Spanish) messages — the frontend may remap `code` to a localized
// string (see `frontend/lib/avatarUpload.js`); this text is always a safe,
// clear fallback on its own (existing backend error-message convention).
const FACE_PHOTO_VALIDATION_MESSAGES = {
  [FACE_PHOTO_VALIDATION_CODES.INVALID_IMAGE]:
    "No pudimos procesar este archivo como imagen. Intenta con otra fotografía.",
  [FACE_PHOTO_VALIDATION_CODES.UNSUPPORTED_FORMAT]:
    "Formato de imagen no compatible. Usa JPG, PNG, WebP o GIF.",
  [FACE_PHOTO_VALIDATION_CODES.ANIMATED_NOT_SUPPORTED]:
    "Las imágenes animadas no son compatibles. Sube una fotografía estática (JPG, PNG o WebP).",
  [FACE_PHOTO_VALIDATION_CODES.IMAGE_TOO_LARGE]:
    "La imagen es demasiado grande para verificarla. Intenta con una foto más pequeña.",
  [FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED]:
    "No pudimos detectar un rostro. Selecciona otra fotografía.",
  [FACE_PHOTO_VALIDATION_CODES.FACE_TOO_SMALL]:
    "La foto debe mostrar claramente tu rostro: acércate o recorta la imagen.",
  [FACE_PHOTO_VALIDATION_CODES.LOW_QUALITY]:
    "La calidad no permite verificar la foto. Prueba con mejor luz y enfoque.",
  [FACE_PHOTO_VALIDATION_CODES.MULTIPLE_FACES]:
    "Detectamos más de un rostro y no podemos confirmar cuál es el tuyo. Usa una foto donde solo aparezcas tú.",
  [FACE_PHOTO_VALIDATION_CODES.PROVIDER_UNAVAILABLE]:
    "No pudimos verificar la imagen ahora. Inténtalo de nuevo.",
  [FACE_PHOTO_VALIDATION_CODES.URL_NOT_ALLOWED]:
    "No pudimos verificar esa imagen. Sube la foto directamente desde la app.",
  [FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH]:
    "Esta fotografía no coincide con tu verificación de identidad anterior. Sube una foto donde se te reconozca a ti.",
  [FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_UNVERIFIED]:
    "No pudimos confirmar que esta fotografía seas tú. Inténtalo de nuevo.",
};

/**
 * Thrown by route-layer helpers (see `user.routes.js`) when a NEW photo URL
 * fails face-presence validation. Callers should catch this specifically and
 * respond 422 with `{ code: err.validationCode, message: err.message }`
 * instead of falling through to a generic 500.
 */
class FacePhotoValidationRejectedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FacePhotoValidationRejectedError";
    this.code = "FACE_PHOTO_VALIDATION_FAILED";
    this.validationCode = code;
  }
}

const fail = (code, overrideMessage) => ({
  ok: false,
  code,
  message: overrideMessage || FACE_PHOTO_VALIDATION_MESSAGES[code] || FACE_PHOTO_VALIDATION_MESSAGES.INVALID_IMAGE,
});

/**
 * Decodes+normalizes an arbitrary image buffer (JPEG/PNG/WebP/GIF — the same
 * set multer already accepts) into a single, non-animated JPEG buffer
 * suitable for `DetectFaces`. The REAL decoded content is what determines
 * the format (via sharp/libvips), never the client-supplied MIME type or
 * file extension, so a renamed/forged file cannot sneak past this check.
 * Returns `{ error: code }` on anything sharp cannot decode at all
 * (corrupted file, disguised non-image content) or decodes as a format
 * outside our supported set (e.g. TIFF, BMP, SVG); returns `{ buffer }` with
 * the prepared JPEG bytes on success.
 */
const prepareImageForDetectFaces = async (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { error: FACE_PHOTO_VALIDATION_CODES.INVALID_IMAGE };
  }

  let metadata;
  try {
    // `animated: false` ensures only the first frame of a GIF/animated WebP
    // is decoded — we only ever need a single still frame to look for a face.
    metadata = await sharp(buffer, { animated: false }).metadata();
  } catch {
    return { error: FACE_PHOTO_VALIDATION_CODES.INVALID_IMAGE };
  }
  if (!metadata?.format) return { error: FACE_PHOTO_VALIDATION_CODES.INVALID_IMAGE };
  if (!SUPPORTED_SNIFFED_FORMATS.has(metadata.format)) {
    return { error: FACE_PHOTO_VALIDATION_CODES.UNSUPPORTED_FORMAT };
  }
  // `metadata.pages` reports the TRUE original frame count even when decoded
  // with `animated: false` (which only affects how later frames are
  // discarded, not what libvips reports about the source). Validating only
  // the first frame while allowing the full animated file to be persisted
  // would let unreviewed later frames reach the profile/gallery, so we
  // reject multi-frame GIF/WebP outright rather than validate-then-publish
  // content that was never actually checked.
  if ((metadata.pages || 1) > 1) {
    return { error: FACE_PHOTO_VALIDATION_CODES.ANIMATED_NOT_SUPPORTED };
  }

  try {
    const jpegBuffer = await sharp(buffer, { animated: false })
      .rotate() // honor EXIF orientation before measuring face size/position
      .resize({
        width: RESIZE_LONG_EDGE,
        height: RESIZE_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" }) // drop alpha (e.g. PNG/WebP) before JPEG encoding
      .jpeg({ quality: 90 })
      .toBuffer();
    return { buffer: jpegBuffer };
  } catch {
    return { error: FACE_PHOTO_VALIDATION_CODES.INVALID_IMAGE };
  }
};

/**
 * Evaluates a single AWS `FaceDetail` (from `DetectFaces`) against our
 * conservative thresholds. Returns a fail()-shaped result or `null` when the
 * face passes every check.
 */
const evaluateFaceDetail = (faceDetail, config) => {
  const box = faceDetail.BoundingBox || {};
  const areaRatio = (box.Width || 0) * (box.Height || 0);
  if (areaRatio < config.minFaceAreaRatio) {
    return fail(FACE_PHOTO_VALIDATION_CODES.FACE_TOO_SMALL);
  }

  const quality = faceDetail.Quality || {};
  const sharpness = quality.Sharpness ?? 100;
  const brightness = quality.Brightness ?? 100;
  if (sharpness < config.minSharpness || brightness < config.minBrightness) {
    return fail(FACE_PHOTO_VALIDATION_CODES.LOW_QUALITY);
  }

  const pose = faceDetail.Pose || {};
  const yaw = Math.abs(pose.Yaw ?? 0);
  const pitch = Math.abs(pose.Pitch ?? 0);
  if (yaw > config.maxYawDegrees || pitch > config.maxPitchDegrees) {
    return fail(FACE_PHOTO_VALIDATION_CODES.LOW_QUALITY);
  }

  return null;
};

/**
 * Identity gate reused from the EXISTING "Perfil Auténtico" system. No-op
 * (`{ ok: true }`) unless `userId` is provided — callers that don't pass a
 * `userId` (e.g. tests exercising presence-only behavior) never trigger this
 * step. When a `userId` IS provided:
 *   - no usable/consented reference yet -> `{ ok: true }` (presence-only
 *     pass; this never grants verified-identity status on its own).
 *   - confirmed match -> `{ ok: true, identity: "matched" }`.
 *   - confirmed mismatch, an uncertain ("review") result, or ANY provider
 *     failure (AWS error, rate-limited, decrypt failure, etc.) -> rejection
 *     (fail-closed — never an automatic pass while a reference exists).
 */
const evaluateIdentityForNewPhoto = async ({ imageBytes, userId, ip }) => {
  if (!userId) return { ok: true };

  let decision;
  try {
    decision = await faceReferenceService.compareAgainstReference({ userId, imageBytes, ip });
  } catch (err) {
    console.error("[facePhotoValidation] identity comparison threw unexpectedly:", err?.message || err);
    return fail(FACE_PHOTO_VALIDATION_CODES.PROVIDER_UNAVAILABLE);
  }

  switch (decision?.status) {
    case "verified":
      return { ok: true, identity: "matched" };
    case "no_reference":
    case "unavailable":
      // No usable reference to compare against (or the reference system
      // itself is unconfigured) — presence-only pass, no identity granted.
      return { ok: true, identity: "no_reference" };
    case "mismatch":
      return fail(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH);
    case "review":
    case "error":
    default:
      // Uncertain result or any AWS/provider failure while a reference
      // exists — fail closed, never auto-approve.
      return fail(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_UNVERIFIED);
  }
};

/**
 * Core validator: given raw image bytes (as received from multer or
 * downloaded from an allowlisted host), decides whether the image shows one
 * sufficiently visible human face — and, when `options.userId` is supplied
 * and the user has a usable face reference, whether it is actually THIS
 * user (see `evaluateIdentityForNewPhoto`).
 *
 * Returns `{ ok: true, skipped: true }` immediately when the feature flag is
 * off. Otherwise returns `{ ok: true, faceDetail }` on success, or
 * `{ ok: false, code, message }` on any rejection — including AWS/provider
 * failures (fail-closed; never auto-approved).
 */
const validateFacePhotoBuffer = async (buffer, options = {}) => {
  const config = options.config || getFaceDetectionConfig();
  if (!config.enabled) return { ok: true, skipped: true };

  const prepared = await prepareImageForDetectFaces(buffer);
  if (prepared.error) return fail(prepared.error);
  const jpegBuffer = prepared.buffer;
  if (jpegBuffer.length > MAX_DETECT_FACES_BYTES) {
    return fail(FACE_PHOTO_VALIDATION_CODES.IMAGE_TOO_LARGE);
  }

  let faceDetails;
  try {
    faceDetails = await detectFaces(jpegBuffer);
  } catch (err) {
    console.error("[facePhotoValidation] DetectFaces failed:", err?.message || err);
    return fail(FACE_PHOTO_VALIDATION_CODES.PROVIDER_UNAVAILABLE);
  }

  const candidates = (faceDetails || []).filter((face) => (face.Confidence ?? 0) >= config.minConfidence);
  if (candidates.length === 0) return fail(FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED);
  if (candidates.length > 1) return fail(FACE_PHOTO_VALIDATION_CODES.MULTIPLE_FACES);

  const qualityFailure = evaluateFaceDetail(candidates[0], config);
  if (qualityFailure) return qualityFailure;

  // Decided BEFORE any DB/Cloudinary write by every caller — this function
  // itself never persists anything, so a mismatch/uncertain identity result
  // here always arrives in time to block the photo from ever being saved.
  const identityResult = await evaluateIdentityForNewPhoto({
    imageBytes: jpegBuffer,
    userId: options.userId,
    ip: options.ip,
  });
  if (!identityResult.ok) return identityResult;

  return { ok: true, faceDetail: candidates[0], identity: identityResult.identity };
};

/**
 * Validates a NEW photo URL (one the user did not already have on file) by
 * downloading it through the same SSRF-safe allowlisted downloader used for
 * photo-verification comparisons, then running it through
 * `validateFacePhotoBuffer` (presence AND, when `options.userId` is
 * supplied, identity). Any download failure (disallowed host, unreachable,
 * oversized, malformed) is reported as a rejection — never silently skipped
 * — so a URL-only submission can never bypass the face check that a real
 * multipart upload would have gone through.
 */
const validateFacePhotoUrl = async (url, options = {}) => {
  const config = options.config || getFaceDetectionConfig();
  if (!config.enabled) return { ok: true, skipped: true };

  let bytes;
  try {
    bytes = await downloadVerifiedImageBytes(url);
  } catch (err) {
    if (err instanceof SecureImageFetchError) {
      return fail(FACE_PHOTO_VALIDATION_CODES.URL_NOT_ALLOWED);
    }
    console.error("[facePhotoValidation] image download failed:", err?.message || err);
    return fail(FACE_PHOTO_VALIDATION_CODES.PROVIDER_UNAVAILABLE);
  }

  return validateFacePhotoBuffer(bytes, { config, userId: options.userId, ip: options.ip });
};

/**
 * Validates every URL in `newUrls` that is not already present in
 * `alreadyValidatedUrls` (e.g. a photo whose bytes were just validated
 * directly via `validateFacePhotoBuffer` in the SAME request, so re-fetching
 * it by URL would be redundant). Stops at the first failure. `userId`/`ip`
 * (when provided) are threaded through to the identity gate for every URL —
 * applies equally to primary AND secondary/gallery photos.
 */
const validateNewPhotoUrls = async (newUrls, { alreadyValidatedUrls = new Set(), userId, ip } = {}) => {
  const config = getFaceDetectionConfig();
  if (!config.enabled) return { ok: true, skipped: true };

  for (const url of newUrls) {
    if (!url || alreadyValidatedUrls.has(url)) continue;
    // eslint-disable-next-line no-await-in-loop -- must validate sequentially and stop at first failure
    const result = await validateFacePhotoUrl(url, { config, userId, ip });
    if (!result.ok) return { ...result, url };
  }
  return { ok: true };
};

module.exports = {
  FACE_PHOTO_VALIDATION_CODES,
  FACE_PHOTO_VALIDATION_MESSAGES,
  FacePhotoValidationRejectedError,
  validateFacePhotoBuffer,
  validateFacePhotoUrl,
  validateNewPhotoUrls,
};
