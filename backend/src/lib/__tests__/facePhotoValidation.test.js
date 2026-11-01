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

const rekognitionClient = require("../rekognitionClient.js");
const secureImageFetch = require("../secureImageFetch.js");
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
