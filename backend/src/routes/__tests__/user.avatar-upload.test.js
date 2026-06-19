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
    User.updateOne.mockReturnValue(Promise.resolve({}));
    app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use("/api/user", userRoutes);
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  const makeCompleteUser = (overrides = {}) => ({
    _id: "507f1f77bcf86cd799439011",
    name: "Complete User",
    birthdate: new Date("2000-01-01T00:00:00.000Z"),
    location: { type: "Point", coordinates: [-70.6693, -33.4489], country: "Chile", city: "Santiago" },
    locationPoint: { type: "Point", coordinates: [-70.6693, -33.4489] },
    gender: "female",
    interestedIn: "male",
    intent: "dating",
    interests: ["music", "travel", "movies"],
    role: "user",
    isBlocked: false,
    isSuspended: false,
    toObject() {
      return { ...this };
    },
    ...overrides,
  });

  test("returns raw stored photo debug fields for the current user", async () => {
    const debugUser = {
      _id: "507f1f77bcf86cd799439011",
      name: "Complete User",
      avatar: "/uploads/avatar-raw.png",
      profilePhotos: ["/uploads/avatar-raw.png"],
      images: [{ url: "/uploads/avatar-raw.png", isPrimary: true }],
      onboardingComplete: true,
      birthdate: new Date("2000-01-01T00:00:00.000Z"),
      location: { country: "Chile", city: "Santiago", label: "Santiago, Chile" },
      gender: "female",
      interestedIn: "male",
      intent: "dating",
      interests: ["music", "travel", "movies"],
      role: "user",
      isBlocked: false,
      isSuspended: false,
      toObject() {
        return { ...this };
      },
    };

    User.findById.mockReturnValueOnce(makeQuery(debugUser));

    const res = await request(app)
      .get("/api/user/me/photo-debug")
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      avatar: debugUser.avatar,
      profilePhotos: debugUser.profilePhotos,
      images: debugUser.images,
      onboardingComplete: true,
      canAppearInFeed: true,
      missingFields: [],
    });
  });

  test("returns complete profile status diagnostics when all required fields are present", async () => {
    const debugUser = {
      _id: "507f1f77bcf86cd799439011",
      name: "Complete User",
      avatar: "/uploads/avatar-raw.png",
      profilePhotos: ["/uploads/avatar-raw.png"],
      images: [{ url: "/uploads/avatar-raw.png", isPrimary: true }],
      onboardingComplete: true,
      birthdate: new Date("2000-01-01T00:00:00.000Z"),
      location: { type: "Point", coordinates: [-70.6693, -33.4489], country: "Chile", city: "Santiago" },
      locationPoint: { type: "Point", coordinates: [-70.6693, -33.4489] },
      gender: "female",
      interestedIn: "male",
      intent: "dating",
      interests: ["music", "travel", "movies"],
      role: "user",
      isBlocked: false,
      isSuspended: false,
      toObject() {
        return { ...this };
      },
    };

    User.findById.mockReturnValueOnce(makeQuery(debugUser));

    const res = await request(app)
      .get("/api/user/me/profile-status")
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      onboardingComplete: true,
      canAppearInFeed: true,
      missingFields: [],
      imagesCount: 1,
      hasPrimaryPhoto: true,
      hasLocationPoint: true,
      hasGender: true,
      hasInterestedIn: true,
      hasBirthdate: true,
      hasIntent: true,
      hasInterests: true,
    });
  });

  test("reorders current user photos through the focused photos endpoint", async () => {
    const primaryPhoto = "https://api.meetyoulive.net/uploads/avatar-a.png";
    const secondaryPhoto = "https://api.meetyoulive.net/uploads/avatar-b.png";
    const reorderedPhotos = [secondaryPhoto, primaryPhoto];
    const currentUser = makeCompleteUser({
      avatar: primaryPhoto,
      profilePhotos: [primaryPhoto, secondaryPhoto],
      images: [
        { url: primaryPhoto, isPrimary: true },
        { url: secondaryPhoto, isPrimary: false },
      ],
    });
    const savedUser = makeCompleteUser({
      avatar: secondaryPhoto,
      profilePhotos: reorderedPhotos,
      images: [
        { url: secondaryPhoto, isPrimary: true },
        { url: primaryPhoto, isPrimary: false },
      ],
    });

    User.findById.mockReturnValueOnce(makeQuery(currentUser));
    User.findByIdAndUpdate.mockReturnValueOnce(makeQuery(savedUser));

    const res = await request(app)
      .patch("/api/user/me/photos/reorder")
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https")
      .send({ images: reorderedPhotos });

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      expect.objectContaining({
        $set: expect.objectContaining({
          avatar: secondaryPhoto,
          profilePhotos: reorderedPhotos,
        }),
      }),
      { new: true }
    );
    expect(res.body.profilePhotos).toEqual(reorderedPhotos);
    expect(res.body.user.avatar).toBe(secondaryPhoto);
  });

  test("deletes a current user photo through the focused photos endpoint", async () => {
    const primaryPhoto = "https://api.meetyoulive.net/uploads/avatar-a.png";
    const secondaryPhoto = "https://api.meetyoulive.net/uploads/avatar-b.png";
    const currentUser = makeCompleteUser({
      avatar: primaryPhoto,
      profilePhotos: [primaryPhoto, secondaryPhoto],
      images: [
        { url: primaryPhoto, isPrimary: true },
        { url: secondaryPhoto, isPrimary: false },
      ],
    });
    const savedUser = makeCompleteUser({
      avatar: primaryPhoto,
      profilePhotos: [primaryPhoto],
      images: [{ url: primaryPhoto, isPrimary: true }],
    });

    User.findById.mockReturnValueOnce(makeQuery(currentUser));
    User.findByIdAndUpdate.mockReturnValueOnce(makeQuery(savedUser));

    const res = await request(app)
      .delete(`/api/user/me/photos/${encodeURIComponent(secondaryPhoto)}`)
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https");

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      expect.objectContaining({
        $set: expect.objectContaining({
          avatar: primaryPhoto,
          profilePhotos: [primaryPhoto],
        }),
      }),
      { new: true }
    );
    expect(res.body.profilePhotos).toEqual([primaryPhoto]);
  });

  test("GET /me returns normalized photos and embedded profileStatus", async () => {
    const meUser = {
      _id: "507f1f77bcf86cd799439011",
      name: "Complete User",
      email: "complete@example.com",
      avatar: "/uploads/avatar-raw.png",
      profilePhotos: ["/uploads/avatar-raw.png"],
      images: [{ url: "/uploads/avatar-raw.png", isPrimary: true }],
      onboardingComplete: true,
      birthdate: new Date("2000-01-01T00:00:00.000Z"),
      location: { type: "Point", coordinates: [-70.6693, -33.4489], country: "Chile", city: "Santiago" },
      locationPoint: { type: "Point", coordinates: [-70.6693, -33.4489] },
      gender: "female",
      interestedIn: "male",
      intent: "dating",
      interests: ["music", "travel", "movies"],
      role: "user",
      creatorStatus: "none",
      isBlocked: false,
      isSuspended: false,
      toObject() {
        return { ...this };
      },
    };

    User.findById.mockReturnValueOnce(makeQuery(meUser));

    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https");

    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe("https://api.meetyoulive.net/uploads/avatar-raw.png");
    expect(res.body.profilePhotos).toEqual(["https://api.meetyoulive.net/uploads/avatar-raw.png"]);
    expect(res.body.images[0]).toMatchObject({
      url: "https://api.meetyoulive.net/uploads/avatar-raw.png",
      isPrimary: true,
    });
    expect(res.body.profileStatus).toMatchObject({
      imagesCount: 1,
      hasPrimaryPhoto: true,
      onboardingComplete: true,
      canAppearInFeed: true,
      missingFields: [],
    });
  });

  test("returns incomplete profile status diagnostics for missing profile fields", async () => {
    const diagnosticUser = {
      _id: "507f1f77bcf86cd799439011",
      name: "Incomplete User",
      images: [{ url: "https://api.meetyoulive.net/uploads/avatar-primary.png", isPrimary: true }],
      onboardingComplete: false,
      birthdate: new Date("2000-01-01T00:00:00.000Z"),
      location: {},
      locationPoint: { type: "Point", coordinates: [-70.66, -33.45] },
      locationLabel: "",
      gender: "female",
      interestedIn: "male",
      intent: "",
      interests: ["music"],
      role: "user",
      isBlocked: false,
      isSuspended: false,
      toObject() {
        return { ...this };
      },
    };

    User.findById.mockReturnValueOnce(makeQuery(diagnosticUser));

    const res = await request(app)
      .get("/api/user/me/profile-status")
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      onboardingComplete: false,
      canAppearInFeed: false,
      missingFields: ["intent", "interests"],
      imagesCount: 1,
      hasPrimaryPhoto: true,
      hasLocationPoint: true,
      hasGender: true,
      hasInterestedIn: true,
      hasBirthdate: true,
      hasIntent: false,
      hasInterests: false,
    });
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
          onboardingComplete: false,
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
      onboardingComplete: false,
      canAppearInFeed: false,
      missingFields: expect.arrayContaining(["name", "birthdate", "location", "gender", "intent", "interests"]),
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

  test("keeps the current primary photo when uploading an extra photo", async () => {
    const primaryPhoto = "https://api.meetyoulive.net/uploads/avatar-primary.png";
    const existingUser = {
      _id: "507f1f77bcf86cd799439011",
      avatar: primaryPhoto,
      profilePhotos: [primaryPhoto],
      images: [{ url: primaryPhoto, isPrimary: true }],
    };
    const savedUser = {
      _id: existingUser._id,
      avatar: primaryPhoto,
      profilePhotos: [
        primaryPhoto,
        "https://api.meetyoulive.net/uploads/avatar-507f1f77bcf86cd799439011-456.png",
      ],
      images: [
        {
          url: primaryPhoto,
          isPrimary: true,
          source: "",
          uploadedAt: new Date("2026-06-14T00:00:00.000Z"),
        },
        {
          url: "https://api.meetyoulive.net/uploads/avatar-507f1f77bcf86cd799439011-456.png",
          isPrimary: false,
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
      .post("/api/user/me/avatar-upload?setAsMain=0")
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https")
      .attach("avatar", Buffer.from("not-a-real-png-but-valid-for-multer"), {
        filename: "extra.png",
        contentType: "image/png",
      });



    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      existingUser._id,
      expect.objectContaining({
        $set: expect.objectContaining({
          avatar: primaryPhoto,
          profilePhotos: [
            primaryPhoto,
            expect.stringMatching(/^https:\/\/api\.meetyoulive\.net\/uploads\/avatar-/),
          ],
          images: [
            expect.objectContaining({ url: primaryPhoto, isPrimary: true }),
            expect.objectContaining({
              url: expect.stringMatching(/^https:\/\/api\.meetyoulive\.net\/uploads\/avatar-/),
              isPrimary: false,
            }),
          ],
        }),
      }),
      { new: true }
    );
    expect(res.body.avatar).toBe(primaryPhoto);
    expect(res.body.images[0]).toMatchObject({ url: primaryPhoto, isPrimary: true });
  });

  test("sets onboardingComplete true after upload when the merged profile is complete", async () => {
    const photoUrl = "https://api.meetyoulive.net/uploads/avatar-507f1f77bcf86cd799439011-789.png";
    const existingUser = {
      _id: "507f1f77bcf86cd799439011",
      name: "Complete User",
      avatar: "",
      profilePhotos: [],
      images: [],
      birthdate: new Date("2000-01-01T00:00:00.000Z"),
      location: { country: "Chile", city: "Santiago", label: "Santiago, Chile" },
      gender: "female",
      interestedIn: "male",
      intent: "dating",
      interests: ["music", "travel", "movies"],
      role: "user",
      isBlocked: false,
      isSuspended: false,
      toObject() {
        return { ...this };
      },
    };
    const savedUser = {
      ...existingUser,
      avatar: photoUrl,
      profilePhotos: [photoUrl],
      images: [{ url: photoUrl, isPrimary: true, source: "", uploadedAt: new Date("2026-06-14T00:00:00.000Z") }],
      onboardingComplete: true,
      toObject() {
        return { ...this };
      },
    };

    User.findById.mockReturnValueOnce(makeQuery(existingUser));
    User.findByIdAndUpdate.mockReturnValueOnce(makeQuery(savedUser));

    const res = await request(app)
      .post("/api/user/me/avatar-upload")
      .set("Authorization", "******")
      .set("Host", "api.meetyoulive.net")
      .set("X-Forwarded-Proto", "https")
      .attach("avatar", Buffer.from("image"), {
        filename: "avatar.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      existingUser._id,
      expect.objectContaining({
        $set: expect.objectContaining({ onboardingComplete: true }),
      }),
      { new: true }
    );
    expect(res.body).toMatchObject({
      onboardingComplete: true,
      canAppearInFeed: true,
      missingFields: [],
      user: {
        onboardingComplete: true,
        canAppearInFeed: true,
        missingFields: [],
      },
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
