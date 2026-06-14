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
}));

const userRoutes = require("../user.routes.js");

const makeQuery = (value) => ({
  select: jest.fn().mockResolvedValue(value),
});

describe("POST /api/user/me/avatar-upload", () => {
  let app;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.set("trust proxy", 1);
    app.use("/api/user", userRoutes);
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("stores uploaded photo in canonical image fields without saving the full user document", async () => {
    const existingUser = {
      _id: "507f1f77bcf86cd799439011",
      avatar: "",
      profilePhotos: [],
      images: [],
      save: jest.fn(),
    };
    const savedUser = {
      _id: existingUser._id,
      avatar: "https://api.meetyoulive.net/uploads/avatar-507f1f77bcf86cd799439011-123.png",
      profilePhotos: ["https://api.meetyoulive.net/uploads/avatar-507f1f77bcf86cd799439011-123.png"],
      images: [
        {
          url: "https://api.meetyoulive.net/uploads/avatar-507f1f77bcf86cd799439011-123.png",
          isPrimary: true,
          source: "",
          uploadedAt: new Date("2026-06-14T00:00:00.000Z"),
        },
      ],
      toObject() {
        return {
          _id: this._id,
          avatar: this.avatar,
          profilePhotos: this.profilePhotos,
          images: this.images,
        };
      },
    };

    User.findById.mockReturnValueOnce(makeQuery(existingUser));
    User.findByIdAndUpdate.mockReturnValueOnce(makeQuery(savedUser));

    const res = await request(app)
      .post("/api/user/me/avatar-upload")
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https")
      .attach("avatar", Buffer.from("not-a-real-png-but-valid-for-multer"), {
        filename: "avatar.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      existingUser._id,
      expect.objectContaining({
        $set: expect.objectContaining({
          avatar: expect.stringMatching(/^https:\/\/api\.meetyoulive\.net\/uploads\/avatar-/),
          profilePhotos: [expect.stringMatching(/^https:\/\/api\.meetyoulive\.net\/uploads\/avatar-/)],
          images: [
            expect.objectContaining({
              url: expect.stringMatching(/^https:\/\/api\.meetyoulive\.net\/uploads\/avatar-/),
              isPrimary: true,
            }),
          ],
        }),
      }),
      { new: true }
    );
    expect(existingUser.save).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      ok: true,
      avatar: savedUser.avatar,
      profileImage: savedUser.avatar,
      profilePhotos: savedUser.profilePhotos,
      photoUrl: expect.stringMatching(/^https:\/\/api\.meetyoulive\.net\/uploads\/avatar-/),
      url: savedUser.avatar,
      images: [
        expect.objectContaining({
          url: savedUser.avatar,
          isPrimary: true,
          uploadedAt: expect.any(String),
        }),
      ],
      user: {
        avatar: savedUser.avatar,
        profileImage: savedUser.avatar,
        profilePhotos: savedUser.profilePhotos,
        photos: savedUser.profilePhotos,
      },
    });
    expect(res.body.user.images[0]).toMatchObject({
      url: savedUser.avatar,
      isPrimary: true,
    });
  });

  test("returns diagnostic JSON when no avatar file is sent", async () => {
    const res = await request(app)
      .post("/api/user/me/avatar-upload")
      .set("Authorization", "******");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      status: 400,
      error: "File required",
      message: "No se recibió archivo.",
      code: "FILE_REQUIRED",
    });
  });

  test("returns diagnostic JSON when multipart field is not avatar", async () => {
    const res = await request(app)
      .post("/api/user/me/avatar-upload")
      .set("Authorization", "******")
      .attach("photo", Buffer.from("image"), {
        filename: "avatar.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      status: 400,
      error: "Unexpected file field",
      message: 'El campo multipart debe llamarse "avatar".',
      code: "INVALID_FILE_FIELD",
    });
  });

  test("returns diagnostic JSON for unsupported MIME types", async () => {
    const res = await request(app)
      .post("/api/user/me/avatar-upload")
      .set("Authorization", "******")
      .attach("avatar", Buffer.from("not-image"), {
        filename: "avatar.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({
      ok: false,
      status: 415,
      error: "Unsupported media type",
      message: "Formato no permitido. Usa JPG, PNG, WebP o GIF.",
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  test("returns diagnostic JSON when avatar file is too large", async () => {
    const res = await request(app)
      .post("/api/user/me/avatar-upload")
      .set("Authorization", "******")
      .attach("avatar", Buffer.alloc((5 * 1024 * 1024) + 1), {
        filename: "avatar.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      ok: false,
      status: 413,
      error: "File too large",
      message: "La imagen es demasiado grande. Intenta con una foto más pequeña.",
      code: "FILE_TOO_LARGE",
    });
  });
});
