/**
 * "Face presence" profile-photo validation (AWS Rekognition `DetectFaces`).
 *
 * This is a SEPARATE feature flag from both `PHOTO_VERIFICATION_ENABLED`
 * (selfie liveness + CompareFaces identity check) and
 * `PROFILE_AUTHENTICITY_ENFORCED` (Discover publication gate) — it must
 * never be coupled to either. Ships fully DISABLED by default so existing
 * upload/profile behavior is unchanged until explicitly turned on in a
 * test environment.
 *
 * IMPORTANT: `DetectFaces` only reports that a face-like region exists in an
 * image (count, confidence, bounding box, quality/pose signals). It never
 * confirms WHOSE face it is. Passing this check must never, by itself, grant
 * any "verified identity" status — that is handled exclusively by the
 * existing CompareFaces / face-reference system.
 */

const parseBoolean = (value) => String(value || "").trim().toLowerCase() === "true";

const parseFloatInRange = (value, fallback, min, max) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
};

const getFaceDetectionConfig = () => ({
  // Master switch. Defaults to disabled; independent of every other
  // Rekognition-backed flag in this codebase.
  enabled: parseBoolean(process.env.FACE_PHOTO_VALIDATION_ENABLED),
  // Minimum AWS-reported face detection confidence (0-100) to count a
  // detected region as a real candidate face at all.
  minConfidence: parseFloatInRange(process.env.FACE_PHOTO_VALIDATION_MIN_CONFIDENCE, 90, 0, 100),
  // Minimum face bounding-box area as a fraction of the whole image
  // (BoundingBox.Width * BoundingBox.Height, both already 0-1 ratios from
  // Rekognition) — rejects faces that are technically detected but too
  // small/far away to meaningfully show who the person is.
  minFaceAreaRatio: parseFloatInRange(process.env.FACE_PHOTO_VALIDATION_MIN_FACE_AREA_RATIO, 0.03, 0, 1),
  // Minimum Rekognition Quality.Sharpness / Quality.Brightness (0-100) —
  // rejects photos too blurry or too dark to verify a face in.
  minSharpness: parseFloatInRange(process.env.FACE_PHOTO_VALIDATION_MIN_SHARPNESS, 35, 0, 100),
  minBrightness: parseFloatInRange(process.env.FACE_PHOTO_VALIDATION_MIN_BRIGHTNESS, 25, 0, 100),
  // Maximum absolute head yaw/pitch (degrees) still considered "clearly
  // visible" — extreme profile/tilted angles are rejected.
  maxYawDegrees: parseFloatInRange(process.env.FACE_PHOTO_VALIDATION_MAX_YAW_DEGREES, 50, 0, 180),
  maxPitchDegrees: parseFloatInRange(process.env.FACE_PHOTO_VALIDATION_MAX_PITCH_DEGREES, 40, 0, 180),
});

module.exports = { getFaceDetectionConfig };
