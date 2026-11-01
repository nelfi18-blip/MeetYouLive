const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = "507f1f77bcf86cd799439011";
    next();
  },
  optionalVerifyToken: (_req, _res, next) => next(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  exists: jest.fn(),
  bulkWrite: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock("../../lib/cloudinary.js", () => ({
  uploadProfilePhoto: jest.fn(),
}));

// Mock only the two async validators actually called from the routes; keep
// every other export (codes, error class, messages) real so route-level
// error handling (`sendFacePhotoValidationErrorIfApplicable`) and the
// thrown error type stay consistent with production code.
jest.mock("../../lib/facePhotoValidation.js", () => {
  const actual = jest.requireActual("../../lib/facePhotoValidation.js");
  return {
    ...actual,
    validateFacePhotoBuffer: jest.fn(),
    validateNewPhotoUrls: jest.fn(),
  };
});

const userRoutes = require("../user.routes.js");
const { uploadProfilePhoto } = require("../../lib/cloudinary.js");
const {
  FACE_PHOTO_VALIDATION_CODES,
  validateFacePhotoBuffer,
  validateNewPhotoUrls,
} = require("../../lib/facePhotoValidation.js");

const USER_ID = "507f1f77bcf86cd799439011";
const EXISTING_PHOTO = "https://res.cloudinary.com/meetyoulive/image/upload/v1/existing.jpg";
const NEW_PHOTO_URL = "https://res.cloudinary.com/meetyoulive/image/upload/v2/new-photo.jpg";
const CLOUDINARY_URL = "https://res.cloudinary.com/meetyoulive/image/upload/v123/avatar-upload.png";

const makeQuery = (value) => ({ select: jest.fn().mockResolvedValue(value) });

const makeUser = (overrides = {}) => ({
  _id: USER_ID,
  name: "Face Check User",
  role: "user",
  isBlocked: false,
  isSuspended: false,
  avatar: EXISTING_PHOTO,
  primaryPhoto: EXISTING_PHOTO,
  profilePhotos: [EXISTING_PHOTO],
  images: [{ url: EXISTING_PHOTO, isPrimary: true }],
  birthdate: new Date("2000-01-01T00:00:00.000Z"),
  location: { type: "Point", coordinates: [-70.6693, -33.4489], country: "Chile", city: "Santiago" },
  locationPoint: { type: "Point", coordinates: [-70.6693, -33.4489] },
  gender: "female",
  interestedIn: "male",
  intent: "dating",
  interests: ["music", "travel", "movies"],
  toObject() {
    return { ...this };
  },
  ...overrides,
});

describe("Face-presence profile photo validation wiring", () => {
  let app;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    User.updateOne.mockReturnValue(Promise.resolve({}));
    validateFacePhotoBuffer.mockResolvedValue({ ok: true, skipped: true });
    validateNewPhotoUrls.mockResolvedValue({ ok: true });
    uploadProfilePhoto.mockResolvedValue({
      secure_url: CLOUDINARY_URL,
      public_id: "meetyoulive/profile-photos/avatar-upload",
    });
    app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use("/api/user", userRoutes);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("POST /me/avatar-upload", () => {
    test("rejects the upload and never touches Cloudinary when no face is detected", async () => {
      validateFacePhotoBuffer.mockResolvedValue({
        ok: false,
        code: FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED,
        message: "No pudimos detectar un rostro. Selecciona otra fotografía.",
      });

      const res = await request(app)
        .post("/api/user/me/avatar-upload")
        .set("Authorization", "Bearer test")
        .attach("avatar", Buffer.from("fake-bytes"), { filename: "photo.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED);
      expect(uploadProfilePhoto).not.toHaveBeenCalled();
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("forwards the authenticated userId/ip to the validator so the identity gate (CompareFaces reuse) can run", async () => {
      validateFacePhotoBuffer.mockResolvedValue({ ok: true, faceDetail: {} });
      const user = makeUser();
      User.findById.mockReturnValueOnce(makeQuery(user));
      User.findByIdAndUpdate.mockReturnValueOnce(makeQuery({ ...user }));

      await request(app)
        .post("/api/user/me/avatar-upload")
        .set("Authorization", "******")
        .attach("avatar", Buffer.from("fake-bytes"), { filename: "photo.jpg", contentType: "image/jpeg" });

      expect(validateFacePhotoBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ userId: USER_ID })
      );
    });

    test("rejects the upload WITHOUT ever touching Cloudinary when the new photo mismatches the user's authorized face reference", async () => {
      validateFacePhotoBuffer.mockResolvedValue({
        ok: false,
        code: FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH,
        message: "Esta fotografia no coincide con tu verificacion de identidad anterior.",
      });

      const res = await request(app)
        .post("/api/user/me/avatar-upload")
        .set("Authorization", "******")
        .attach("avatar", Buffer.from("fake-bytes"), { filename: "photo.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH);
      expect(uploadProfilePhoto).not.toHaveBeenCalled();
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("proceeds to Cloudinary + DB write when a valid face is detected", async () => {
      validateFacePhotoBuffer.mockResolvedValue({ ok: true, faceDetail: {} });
      const user = makeUser();
      User.findById.mockReturnValueOnce(makeQuery(user));
      User.findByIdAndUpdate.mockReturnValueOnce(
        makeQuery({
          ...user,
          avatar: CLOUDINARY_URL,
          primaryPhoto: CLOUDINARY_URL,
          profilePhotos: [CLOUDINARY_URL, EXISTING_PHOTO],
          images: [{ url: CLOUDINARY_URL, isPrimary: true }, { url: EXISTING_PHOTO, isPrimary: false }],
        })
      );

      const res = await request(app)
        .post("/api/user/me/avatar-upload")
        .set("Authorization", "Bearer test")
        .attach("avatar", Buffer.from("fake-bytes"), { filename: "photo.jpg", contentType: "image/jpeg" });

      expect(res.status).toBe(200);
      expect(uploadProfilePhoto).toHaveBeenCalledTimes(1);
    });
  });

  describe("PATCH /me — anti-evasion for brand-new photo URLs", () => {
    test("rejects a brand-new avatar URL submitted directly (never downloaded via upload)", async () => {
      const currentUser = makeUser();
      User.findById.mockReturnValueOnce(makeQuery(currentUser));
      validateNewPhotoUrls.mockResolvedValue({
        ok: false,
        code: FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED,
        message: "No pudimos detectar un rostro. Selecciona otra fotografía.",
        url: NEW_PHOTO_URL,
      });

      const res = await request(app)
        .patch("/api/user/me")
        .set("Authorization", "Bearer test")
        .send({ avatar: NEW_PHOTO_URL });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(validateNewPhotoUrls).toHaveBeenCalledWith(
        [NEW_PHOTO_URL],
        expect.objectContaining({ userId: USER_ID })
      );
    });

    test("rejects a NEW secondary/gallery photo URL that mismatches the user's authorized face reference", async () => {
      const currentUser = makeUser();
      User.findById.mockReturnValueOnce(makeQuery(currentUser));
      validateNewPhotoUrls.mockResolvedValue({
        ok: false,
        code: FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH,
        message: "identity mismatch",
        url: NEW_PHOTO_URL,
      });

      const res = await request(app)
        .patch("/api/user/me")
        .set("Authorization", "******")
        .send({ images: [EXISTING_PHOTO, NEW_PHOTO_URL] });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(FACE_PHOTO_VALIDATION_CODES.FACE_IDENTITY_MISMATCH);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("does not re-validate when only existing photos are resubmitted", async () => {
      const currentUser = makeUser();
      User.findById.mockReturnValueOnce(makeQuery(currentUser));
      User.findByIdAndUpdate.mockReturnValueOnce(makeQuery({ ...currentUser }));

      const res = await request(app)
        .patch("/api/user/me")
        .set("Authorization", "Bearer test")
        .send({ avatar: EXISTING_PHOTO });

      expect(res.status).toBe(200);
      expect(validateNewPhotoUrls).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /me/photos/reorder — reordering never re-validates", () => {
    test("reordering the user's own existing photos does not call face validation", async () => {
      const currentUser = makeUser({
        profilePhotos: [EXISTING_PHOTO, "https://res.cloudinary.com/meetyoulive/image/upload/v1/second.jpg"],
        images: [
          { url: EXISTING_PHOTO, isPrimary: true },
          { url: "https://res.cloudinary.com/meetyoulive/image/upload/v1/second.jpg", isPrimary: false },
        ],
      });
      User.findById.mockReturnValueOnce(makeQuery(currentUser));
      User.findByIdAndUpdate.mockReturnValueOnce(makeQuery({ ...currentUser }));

      const res = await request(app)
        .patch("/api/user/me/photos/reorder")
        .set("Authorization", "Bearer test")
        .send({ images: ["https://res.cloudinary.com/meetyoulive/image/upload/v1/second.jpg", EXISTING_PHOTO] });

      expect(res.status).toBe(200);
      expect(validateNewPhotoUrls).not.toHaveBeenCalled();
    });

    test("rejects a brand-new URL smuggled into a reorder payload", async () => {
      const currentUser = makeUser();
      User.findById.mockReturnValueOnce(makeQuery(currentUser));
      validateNewPhotoUrls.mockResolvedValue({
        ok: false,
        code: FACE_PHOTO_VALIDATION_CODES.URL_NOT_ALLOWED,
        message: "No pudimos verificar esa imagen. Sube la foto directamente desde la app.",
        url: NEW_PHOTO_URL,
      });

      const res = await request(app)
        .patch("/api/user/me/photos/reorder")
        .set("Authorization", "Bearer test")
        .send({ images: [EXISTING_PHOTO, NEW_PHOTO_URL] });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(FACE_PHOTO_VALIDATION_CODES.URL_NOT_ALLOWED);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
