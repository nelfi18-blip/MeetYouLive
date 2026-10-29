const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");
const User = require("../../models/User.js");
const Live = require("../../models/Live.js");

const currentUserId = "507f1f77bcf86cd799439011";
const legacyUserId = "507f1f77bcf86cd799439021";
const newVerifiedUserId = "507f1f77bcf86cd799439022";
const newOnePhotoUserId = "507f1f77bcf86cd799439023";
const newDuplicatePhotoUserId = "507f1f77bcf86cd799439024";
const newUnverifiedSelfieUserId = "507f1f77bcf86cd799439025";
const newStalePrimaryPhotoUserId = "507f1f77bcf86cd799439026";
const CUTOFF = "2026-06-01T00:00:00.000Z";
const PHOTO_A = "https://cdn.example.com/a.jpg";
const PHOTO_B = "https://cdn.example.com/b.jpg";
const PHOTO_B_UNTRIMMED = "  https://cdn.example.com/b.jpg  ";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = currentUserId;
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
  aggregate: jest.fn(),
}));

jest.mock("../../models/Live.js", () => ({ find: jest.fn() }));

jest.mock("../../services/compatibility.service.js", () => ({
  calculateCompatibility: jest.fn(() => ({ compatibilityScore: 0, sharedInterests: [] })),
}));

jest.mock("../../lib/cloudinary.js", () => ({ uploadProfilePhoto: jest.fn() }));

const userRoutes = require("../user.routes.js");

const objectId = (id) => new mongoose.Types.ObjectId(id);
const sameId = (left, right) => String(left) === String(right);

const valueMatches = (value, condition) => {
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    if (condition.$nin) return !condition.$nin.some((id) => sameId(value, id));
    if (condition.$ne !== undefined) {
      if (Array.isArray(value)) return !value.some((item) => sameId(item, condition.$ne));
      return !sameId(value, condition.$ne);
    }
    if (condition.$in) return condition.$in.includes(value);
    if (condition.$lt !== undefined) return value !== undefined && new Date(value) < new Date(condition.$lt);
    if (condition.$exists !== undefined) return condition.$exists ? value !== undefined : value === undefined;
  }
  return value === condition;
};

const getByPath = (obj, path) =>
  path.split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);

const candidateMatches = (candidate, match) => {
  if (match.$or) return match.$or.some((clause) => candidateMatches(candidate, clause));
  const clauses = match.$and || [];
  const directMatch = Object.entries(match).every(([field, condition]) => {
    if (field === "$and" || field === "$or") return true;
    return valueMatches(getByPath(candidate, field), condition);
  });
  return directMatch && clauses.every((clause) => candidateMatches(candidate, clause));
};

const makeLiveFindChain = (value) => ({
  populate: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(value),
    })),
  })),
});

const makeUser = (id, overrides = {}) => ({
  _id: objectId(id),
  username: `user-${id}`,
  name: "User",
  avatar: PHOTO_A,
  primaryPhoto: PHOTO_A,
  profilePhotos: [PHOTO_A, PHOTO_B],
  emailVerified: true,
  photoVerification: { status: "verified", verifiedPhoto: PHOTO_A },
  gender: "female",
  interestedIn: "both",
  interests: ["music"],
  intent: "dating",
  role: "user",
  onboardingComplete: true,
  isBlocked: false,
  isSuspended: false,
  blockedUsers: [],
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  ...overrides,
});

describe("GET /api/user/discover — Perfil Auténtico publication gate", () => {
  let app;
  let candidates;
  let originalEnforced;
  let originalCutoff;

  beforeAll(() => {
    originalEnforced = process.env.PROFILE_AUTHENTICITY_ENFORCED;
    originalCutoff = process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM;
    app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use("/api/user", userRoutes);
  });

  afterAll(() => {
    if (originalEnforced === undefined) delete process.env.PROFILE_AUTHENTICITY_ENFORCED;
    else process.env.PROFILE_AUTHENTICITY_ENFORCED = originalEnforced;
    if (originalCutoff === undefined) delete process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM;
    else process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = originalCutoff;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PROFILE_AUTHENTICITY_ENFORCED;
    delete process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM;

    candidates = [];
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: objectId(currentUserId),
        interests: ["music"],
        intent: "dating",
        interestedIn: "both",
        blockedUsers: [],
      }),
    });
    User.aggregate.mockImplementation(async (pipeline) => {
      const matches = pipeline.filter((stage) => stage.$match).map((stage) => stage.$match);
      const limit = pipeline.find((stage) => stage.$limit)?.$limit || candidates.length;
      return candidates
        .filter((candidate) => matches.every((match) => candidateMatches(candidate, match)))
        .slice(0, limit);
    });
    // The strict, authoritative post-fetch check re-reads full documents by id.
    User.find.mockImplementation(({ _id: { $in: ids } }) => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(
        candidates.filter((candidate) => ids.some((id) => sameId(id, candidate._id)))
      ),
    }));
    Live.find.mockReturnValue(makeLiveFindChain([]));
  });

  const usernamesIn = (res) => res.body.users.map((u) => u.username);

  test("flag apagado (default): un usuario nuevo con 1 foto y sin selfie verificada igual aparece", async () => {
    candidates = [
      makeUser(newOnePhotoUserId, {
        profilePhotos: [PHOTO_A],
        primaryPhoto: PHOTO_A,
        photoVerification: { status: "none", verifiedPhoto: "" },
        createdAt: new Date("2026-07-05T00:00:00.000Z"),
      }),
    ];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([`user-${newOnePhotoUserId}`]);
  });

  test("enforced=true pero sin fecha de corte: nadie queda filtrado", async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    candidates = [
      makeUser(newOnePhotoUserId, {
        profilePhotos: [PHOTO_A],
        primaryPhoto: PHOTO_A,
        photoVerification: { status: "none", verifiedPhoto: "" },
      }),
    ];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([`user-${newOnePhotoUserId}`]);
  });

  test("perfil anterior a la fecha de corte queda exento aunque no cumpla requisitos", async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = CUTOFF;
    candidates = [
      makeUser(legacyUserId, {
        profilePhotos: [PHOTO_A],
        emailVerified: false,
        photoVerification: { status: "none", verifiedPhoto: "" },
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([`user-${legacyUserId}`]);
  });

  test("usuario nuevo con 2 fotos distintas y selfie aprobada aparece", async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = CUTOFF;
    candidates = [makeUser(newVerifiedUserId)];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([`user-${newVerifiedUserId}`]);
  });

  test("usuario nuevo con solo 1 foto no aparece", async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = CUTOFF;
    candidates = [makeUser(newOnePhotoUserId, { profilePhotos: [PHOTO_A], primaryPhoto: PHOTO_A })];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([]);
  });

  test("fotos duplicadas (misma URL, incluso con espacios) cuentan como 1 y no aparece", async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = CUTOFF;
    candidates = [
      makeUser(newDuplicatePhotoUserId, {
        primaryPhoto: PHOTO_A,
        // Same photo repeated, plus an untrimmed duplicate of itself — none of
        // this should ever count as a second DISTINCT photo.
        profilePhotos: [PHOTO_A, PHOTO_A, `  ${PHOTO_A}  `],
      }),
    ];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([]);
  });

  test("una segunda foto con espacios alrededor de la URL sí cuenta como distinta", async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = CUTOFF;
    candidates = [
      makeUser(newVerifiedUserId, {
        primaryPhoto: PHOTO_A,
        profilePhotos: [PHOTO_A, PHOTO_B_UNTRIMMED],
      }),
    ];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([`user-${newVerifiedUserId}`]);
  });

  test("selfie no verificada (pending/failed/review) bloquea publicación aunque haya 2 fotos", async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = CUTOFF;
    candidates = [
      makeUser(newUnverifiedSelfieUserId, { photoVerification: { status: "pending", verifiedPhoto: "" } }),
    ];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([]);
  });

  test("cambio de foto principal invalida la selfie aprobada previa y no aparece", async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = CUTOFF;
    candidates = [
      makeUser(newStalePrimaryPhotoUserId, {
        primaryPhoto: PHOTO_B,
        profilePhotos: [PHOTO_B, PHOTO_A],
        photoVerification: { status: "verified", verifiedPhoto: PHOTO_A },
      }),
    ];
    const res = await request(app).get("/api/user/discover");
    expect(res.status).toBe(200);
    expect(usernamesIn(res)).toEqual([]);
  });
});
