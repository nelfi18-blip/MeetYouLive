const sharp = require("sharp");

jest.mock("../rekognitionClient.js", () => ({
  detectFaces: jest.fn(),
}));
jest.mock("../secureImageFetch.js", () => {
  class SecureImageFetchError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  return {
    SecureImageFetchError,
    downloadVerifiedImageBytes: jest.fn(),
  };
});
jest.mock("../../services/faceReference.service.js", () => ({
  compareAgainstReference: jest.fn(),
}));

const rekognitionClient = require("../rekognitionClient.js");
const secureImageFetch = require("../secureImageFetch.js");
const faceReferenceService = require("../../services/faceReference.service.js");
const {
  FACE_PHOTO_VALIDATION_CODES,
  validateFacePhotoBuffer,
  validateFacePhotoUrl,
  validateNewPhotoUrls,
} = require("../facePhotoValidation.js");

const ORIGINAL_ENV = process.env;

const ENABLED_ENV = { ...ORIGINAL_ENV, FACE_PHOTO_VALIDATION_ENABLED: "true" };
const DISABLED_ENV = { ...ORIGINAL_ENV, FACE_PHOTO_VALIDATION_ENABLED: "false" };

const makeJpeg = (width = 400, height = 400) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .jpeg()
    .toBuffer();

const makeWebp = (width = 400, height = 400) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .webp()
    .toBuffer();

const makeGif = (width = 400, height = 400) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .gif()
    .toBuffer();

/** A realistic "full-frame selfie" bounding box/quality/pose combination. */
const goodFaceDetail = (overrides = {}) => ({
  Confidence: 99.5,
  BoundingBox: { Width: 0.4, Height: 0.5, Left: 0.3, Top: 0.2 },
  Quality: { Sharpness: 80, Brightness: 70 },
  Pose: { Yaw: 2, Pitch: 1, Roll: 0 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENABLED_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("validateFacePhotoBuffer — flag off", () => {
  it("skips validation entirely and never calls AWS", async () => {
    process.env = { ...DISABLED_ENV };
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result).toEqual({ ok: true, skipped: true });
    expect(rekognitionClient.detectFaces).not.toHaveBeenCalled();
  });
});

describe("validateFacePhotoBuffer — flag on", () => {
  it("accepts a frontal, well-lit, single-face photo", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(true);
    expect(rekognitionClient.detectFaces).toHaveBeenCalledTimes(1);
  });

  it("rejects an image with no detected faces (e.g. a building/landscape)", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED);
  });

  it("rejects a photo with no face candidates (vehicle/object/animal case)", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED);
  });

  it("rejects a face that is too small relative to the frame", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([
      goodFaceDetail({ BoundingBox: { Width: 0.05, Height: 0.05, Left: 0.1, Top: 0.1 } }),
    ]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.FACE_TOO_SMALL);
  });

  it("rejects a blurry photo (low sharpness)", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([
      goodFaceDetail({ Quality: { Sharpness: 5, Brightness: 70 } }),
    ]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.LOW_QUALITY);
  });

  it("rejects a too-dark photo (low brightness)", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([
      goodFaceDetail({ Quality: { Sharpness: 80, Brightness: 3 } }),
    ]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.LOW_QUALITY);
  });

  it("rejects two distinct confident faces as ambiguous", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([
      goodFaceDetail({ BoundingBox: { Width: 0.3, Height: 0.3, Left: 0.05, Top: 0.1 } }),
      goodFaceDetail({ BoundingBox: { Width: 0.3, Height: 0.3, Left: 0.6, Top: 0.1 } }),
    ]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.MULTIPLE_FACES);
  });

  it("ignores a very low-confidence background face when one clear candidate exists", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([
      goodFaceDetail(),
      goodFaceDetail({ Confidence: 40, BoundingBox: { Width: 0.02, Height: 0.02, Left: 0.9, Top: 0.9 } }),
    ]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid/forged file that is not really an image", async () => {
    const buffer = Buffer.from("this is definitely not an image file");
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.INVALID_IMAGE);
    expect(rekognitionClient.detectFaces).not.toHaveBeenCalled();
  });

  it("converts WebP input before calling DetectFaces", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    const buffer = await makeWebp();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(true);
    const [jpegBytes] = rekognitionClient.detectFaces.mock.calls[0];
    expect(jpegBytes[0]).toBe(0xff);
    expect(jpegBytes[1]).toBe(0xd8);
  });

  it("converts (single-frame) GIF input before calling DetectFaces", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    const buffer = await makeGif();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(true);
  });

  it("rejects an animated GIF with multiple distinct frames instead of validating only the first frame", async () => {
    const frame1 = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const frame2 = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer();
    const animatedGif = await sharp([frame1, frame2], {
      join: { animated: true, pageHeight: 200 },
    })
      .gif()
      .toBuffer();

    const result = await validateFacePhotoBuffer(animatedGif);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.ANIMATED_NOT_SUPPORTED);
    // Must be rejected BEFORE ever calling AWS — a validated-vs-persisted
    // mismatch (only frame 1 checked, but the whole animated file saved)
    // must never reach DetectFaces at all.
    expect(rekognitionClient.detectFaces).not.toHaveBeenCalled();
  });

  it("rejects an animated WebP with multiple distinct frames", async () => {
    const frame1 = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const frame2 = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();
    const animatedWebp = await sharp([frame1, frame2], {
      join: { animated: true, pageHeight: 200 },
    })
      .webp()
      .toBuffer();

    const result = await validateFacePhotoBuffer(animatedWebp);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.ANIMATED_NOT_SUPPORTED);
    expect(rekognitionClient.detectFaces).not.toHaveBeenCalled();
  });

  it("fails closed when the Rekognition provider errors out", async () => {
    rekognitionClient.detectFaces.mockRejectedValue(new Error("ThrottlingException"));
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.PROVIDER_UNAVAILABLE);
  });
});

describe("validateFacePhotoUrl", () => {
  it("rejects when the URL is not on the allowlisted host set", async () => {
    secureImageFetch.downloadVerifiedImageBytes.mockRejectedValue(
      new secureImageFetch.SecureImageFetchError("HOST_NOT_ALLOWED", "nope")
    );
    const result = await validateFacePhotoUrl("https://evil.example.com/a.jpg");
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.URL_NOT_ALLOWED);
    expect(rekognitionClient.detectFaces).not.toHaveBeenCalled();
  });

  it("downloads and validates an allowed URL", async () => {
    const buffer = await makeJpeg();
    secureImageFetch.downloadVerifiedImageBytes.mockResolvedValue(buffer);
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    const result = await validateFacePhotoUrl("https://res.cloudinary.com/demo/a.jpg");
    expect(result.ok).toBe(true);
  });
});

describe("validateNewPhotoUrls", () => {
  it("no-ops when the flag is off", async () => {
    process.env = { ...DISABLED_ENV };
    const result = await validateNewPhotoUrls(["https://res.cloudinary.com/demo/a.jpg"]);
    expect(result).toEqual({ ok: true, skipped: true });
    expect(secureImageFetch.downloadVerifiedImageBytes).not.toHaveBeenCalled();
  });

  it("skips URLs already validated in the same request", async () => {
    const result = await validateNewPhotoUrls(["https://res.cloudinary.com/demo/a.jpg"], {
      alreadyValidatedUrls: new Set(["https://res.cloudinary.com/demo/a.jpg"]),
    });
    expect(result).toEqual({ ok: true });
    expect(secureImageFetch.downloadVerifiedImageBytes).not.toHaveBeenCalled();
  });

  it("stops at the first failing new URL", async () => {
    const buffer = await makeJpeg();
    secureImageFetch.downloadVerifiedImageBytes
      .mockResolvedValueOnce(buffer)
      .mockRejectedValueOnce(new secureImageFetch.SecureImageFetchError("DOWNLOAD_FAILED", "nope"));
    rekognitionClient.detectFaces.mockResolvedValueOnce([]); // first URL: no face
    const result = await validateNewPhotoUrls([
      "https://res.cloudinary.com/demo/a.jpg",
      "https://res.cloudinary.com/demo/b.jpg",
    ]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED);
    expect(result.url).toBe("https://res.cloudinary.com/demo/a.jpg");
    expect(secureImageFetch.downloadVerifiedImageBytes).toHaveBeenCalledTimes(1);
  });
});

describe("validateFacePhotoBuffer — identity gate (reused CompareFaces/SearchFacesByImage reference)", () => {
  const USER_ID = "user-identity-1";

  it("never calls the identity system when no userId is supplied (presence-only, pre-existing behavior)", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer);
    expect(result.ok).toBe(true);
    expect(faceReferenceService.compareAgainstReference).not.toHaveBeenCalled();
  });

  it("passes with presence-only status when the user has no usable face reference yet", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    faceReferenceService.compareAgainstReference.mockResolvedValue({
      status: "no_reference",
      reasonCode: "NO_REFERENCE",
    });
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer, { userId: USER_ID, ip: "1.2.3.4" });
    expect(result.ok).toBe(true);
    expect(result.identity).toBe("no_reference");
    expect(faceReferenceService.compareAgainstReference).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, ip: "1.2.3.4", imageBytes: expect.any(Buffer) })
    );
  });

  it("accepts the photo when it matches the user's own authorized reference", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "verified", reasonCode: "MATCH" });
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer, { userId: USER_ID });
    expect(result.ok).toBe(true);
    expect(result.identity).toBe("matched");
  });

  it("rejects the photo WITHOUT saving when it mismatches the user's authorized reference", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "mismatch", reasonCode: "FACE_MISMATCH" });
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer, { userId: USER_ID });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH);
  });

  it("rejects (never auto-approves) an uncertain/borderline identity result", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "review", reasonCode: "LOW_SIMILARITY" });
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer, { userId: USER_ID });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_UNVERIFIED);
  });

  it("rejects (fail-closed) when the identity comparison fails/AWS is unavailable", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "error", reasonCode: "AWS_UNAVAILABLE" });
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer, { userId: USER_ID });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_UNVERIFIED);
  });

  it("rejects (fail-closed) when the identity comparison throws unexpectedly", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    faceReferenceService.compareAgainstReference.mockRejectedValue(new Error("unexpected"));
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer, { userId: USER_ID });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.PROVIDER_UNAVAILABLE);
  });

  it("never runs the identity check at all when presence validation already failed (no face detected)", async () => {
    rekognitionClient.detectFaces.mockResolvedValue([]);
    const buffer = await makeJpeg();
    const result = await validateFacePhotoBuffer(buffer, { userId: USER_ID });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED);
    expect(faceReferenceService.compareAgainstReference).not.toHaveBeenCalled();
  });

  it("applies the identity gate to URL-submitted photos too (validateFacePhotoUrl/validateNewPhotoUrls)", async () => {
    const buffer = await makeJpeg();
    // Reset (not just clear) to drop any leftover queued `...Once` values
    // from earlier tests before establishing a fresh persistent default.
    secureImageFetch.downloadVerifiedImageBytes.mockReset().mockResolvedValue(buffer);
    rekognitionClient.detectFaces.mockResolvedValue([goodFaceDetail()]);
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "mismatch", reasonCode: "FACE_MISMATCH" });

    const urlResult = await validateFacePhotoUrl("https://res.cloudinary.com/demo/a.jpg", { userId: USER_ID });
    expect(urlResult.ok).toBe(false);
    expect(urlResult.code).toBe(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH);

    const batchResult = await validateNewPhotoUrls(["https://res.cloudinary.com/demo/b.jpg"], { userId: USER_ID });
    expect(batchResult.ok).toBe(false);
    expect(batchResult.code).toBe(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH);
  });
});
