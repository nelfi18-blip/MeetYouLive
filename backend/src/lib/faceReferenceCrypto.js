/**
 * Encryption helper for the "Perfil Auténtico" reusable face reference.
 *
 * MeetYouLive never stores selfies/videos or biometric templates itself —
 * the only thing persisted is the OPAQUE FaceId that AWS Rekognition returns
 * after IndexFaces (a pointer into AWS's managed Collection, not a usable
 * image or vector). As defense in depth, even that opaque pointer is
 * encrypted at rest with AES-256-GCM before being written to MongoDB.
 *
 * Fails CLOSED: if the encryption key is missing or malformed, encrypt/
 * decrypt throw instead of ever persisting a reference unprotected, and
 * callers (faceReference.service.js) treat that as "feature unavailable",
 * never as "store it anyway".
 */

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Recommended nonce length for GCM.

class FaceReferenceCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = "FaceReferenceCryptoError";
  }
}

const loadKey = (rawKey) => {
  if (!rawKey || typeof rawKey !== "string") {
    throw new FaceReferenceCryptoError("Missing FACE_REFERENCE_ENCRYPTION_KEY.");
  }
  let key;
  try {
    key = Buffer.from(rawKey, "base64");
  } catch {
    throw new FaceReferenceCryptoError("Invalid FACE_REFERENCE_ENCRYPTION_KEY encoding.");
  }
  if (key.length !== 32) {
    throw new FaceReferenceCryptoError("FACE_REFERENCE_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  return key;
};

/**
 * Encrypts a plaintext string (the AWS FaceId) into a single opaque string
 * storing iv + authTag + ciphertext, all base64, colon-separated.
 */
const encryptFaceId = (plaintext, rawKey) => {
  if (typeof plaintext !== "string" || !plaintext) {
    throw new FaceReferenceCryptoError("Nothing to encrypt.");
  }
  const key = loadKey(rawKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
};

/** Reverses encryptFaceId. Throws if the key is wrong or the payload was tampered with. */
const decryptFaceId = (encrypted, rawKey) => {
  if (typeof encrypted !== "string" || encrypted.split(":").length !== 3) {
    throw new FaceReferenceCryptoError("Malformed encrypted payload.");
  }
  const key = loadKey(rawKey);
  const [ivPart, authTagPart, ciphertextPart] = encrypted.split(":");
  const iv = Buffer.from(ivPart, "base64");
  const authTag = Buffer.from(authTagPart, "base64");
  const ciphertext = Buffer.from(ciphertextPart, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
};

module.exports = { FaceReferenceCryptoError, encryptFaceId, decryptFaceId };
