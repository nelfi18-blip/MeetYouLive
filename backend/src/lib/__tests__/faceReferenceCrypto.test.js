const crypto = require("crypto");
const { FaceReferenceCryptoError, encryptFaceId, decryptFaceId } = require("../faceReferenceCrypto.js");

const KEY = crypto.randomBytes(32).toString("base64");

describe("faceReferenceCrypto", () => {
  it("round-trips a plaintext FaceId", () => {
    const encrypted = encryptFaceId("aws-face-id-123", KEY);
    expect(decryptFaceId(encrypted, KEY)).toBe("aws-face-id-123");
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const a = encryptFaceId("same-face-id", KEY);
    const b = encryptFaceId("same-face-id", KEY);
    expect(a).not.toBe(b);
    expect(decryptFaceId(a, KEY)).toBe("same-face-id");
    expect(decryptFaceId(b, KEY)).toBe("same-face-id");
  });

  it("throws (fails closed) when no key is configured", () => {
    expect(() => encryptFaceId("face-id", "")).toThrow(FaceReferenceCryptoError);
  });

  it("throws when the key does not decode to 32 bytes", () => {
    expect(() => encryptFaceId("face-id", Buffer.from("too-short").toString("base64"))).toThrow(
      FaceReferenceCryptoError
    );
  });

  it("rejects decryption with the wrong key (never silently returns garbage)", () => {
    const encrypted = encryptFaceId("face-id", KEY);
    const wrongKey = crypto.randomBytes(32).toString("base64");
    expect(() => decryptFaceId(encrypted, wrongKey)).toThrow();
  });

  it("detects a tampered ciphertext via the GCM auth tag", () => {
    const encrypted = encryptFaceId("face-id", KEY);
    const [iv, authTag, ciphertext] = encrypted.split(":");
    const tamperedBuffer = Buffer.from(ciphertext, "base64");
    tamperedBuffer[0] ^= 0xff;
    const tampered = [iv, authTag, tamperedBuffer.toString("base64")].join(":");
    expect(() => decryptFaceId(tampered, KEY)).toThrow();
  });

  it("rejects a malformed encrypted payload", () => {
    expect(() => decryptFaceId("not-a-valid-payload", KEY)).toThrow(FaceReferenceCryptoError);
  });
});
