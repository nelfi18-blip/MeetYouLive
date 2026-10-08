const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const { serializeUserPhotoFields } = require("../../lib/photoFields.js");

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

const PHOTO_A = "https://example.com/uploads/photo-a.jpg";
const PHOTO_B = "https://example.com/uploads/photo-b.jpg";
const PHOTO_C = "https://example.com/uploads/photo-c.jpg";

const makeQuery = (value) => ({
  select: jest.fn().mockResolvedValue(value),
});

/**
 * Builds a fake persisted user document (as it would look right after the
 * reorder/delete endpoints wrote their $set payload) so GET /me re-reads the
 * same authoritative values instead of re-deriving a stale primary photo.
 */
const makeUser = ({ avatar, primaryPhoto, profilePhotos, images }) => ({
  _id: "507f1f77bcf86cd799439011",
  name: "Gallery User",
  role: "user",
  isBlocked: false,
  isSuspended: false,
  avatar,
  primaryPhoto,
  profilePhotos,
  images: images.map((url, index) => ({ url, isPrimary: index === 0 })),
  toObject() {
    return { ...this };
  },
});

describe("Profile photo gallery regressions", () => {
  let app;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    User.updateOne.mockReturnValue(Promise.resolve({}));
    app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use("/api/user", userRoutes);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("changing the primary photo via reorder does not restore the stale old primary", async () => {
    // The stored document still has A as primaryPhoto/avatar; the user is
    // requesting B to become primary via the reorder endpoint.
    const currentUser = makeUser({
      avatar: PHOTO_A,
      primaryPhoto: PHOTO_A,
      profilePhotos: [PHOTO_A, PHOTO_B],
      images: [PHOTO_A, PHOTO_B],
    });
    User.findById.mockReturnValueOnce(makeQuery(currentUser));

    let setPayload;
    User.findByIdAndUpdate.mockImplementationOnce((_id, update) => {
      setPayload = update.$set;
      return makeQuery(
        makeUser({
          avatar: setPayload.avatar,
          primaryPhoto: setPayload.primaryPhoto,
          profilePhotos: setPayload.profilePhotos,
          images: setPayload.images.map((image) => image.url),
        })
      );
    });

    const res = await request(app)
      .patch("/api/user/me/photos/reorder")
      .set("Authorization", "******")
      .send({ images: [PHOTO_B, PHOTO_A] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Root-cause regression check: the stale primaryPhoto (A) must not win.
    expect(setPayload.primaryPhoto).toBe(PHOTO_B);
    expect(setPayload.avatar).toBe(PHOTO_B);
    expect(setPayload.profilePhotos).toEqual([PHOTO_B, PHOTO_A]);
    expect(res.body.avatar).toBe(PHOTO_B);
    expect(res.body.profilePhotos).toEqual([PHOTO_B, PHOTO_A]);
  });

  test("deleting the primary photo promotes the next photo instead of reviving it later", async () => {
    const currentUser = makeUser({
      avatar: PHOTO_A,
      primaryPhoto: PHOTO_A,
      profilePhotos: [PHOTO_A, PHOTO_B, PHOTO_C],
      images: [PHOTO_A, PHOTO_B, PHOTO_C],
    });
    User.findById.mockReturnValueOnce(makeQuery(currentUser));

    let setPayload;
    User.findByIdAndUpdate.mockImplementationOnce((_id, update) => {
      setPayload = update.$set;
      return makeQuery(
        makeUser({
          avatar: setPayload.avatar,
          primaryPhoto: setPayload.primaryPhoto,
          profilePhotos: setPayload.profilePhotos,
          images: setPayload.images.map((image) => image.url),
        })
      );
    });

    const res = await request(app)
      .delete(`/api/user/me/photos/${encodeURIComponent(PHOTO_A)}`)
      .set("Authorization", "******");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(setPayload.profilePhotos).toEqual([PHOTO_B, PHOTO_C]);
    expect(setPayload.primaryPhoto).toBe(PHOTO_B);
    expect(setPayload.avatar).toBe(PHOTO_B);
    expect(res.body.profilePhotos).toEqual([PHOTO_B, PHOTO_C]);
    expect(res.body.avatar).toBe(PHOTO_B);
  });

  test("deleting a secondary photo keeps the current primary photo unchanged", async () => {
    const currentUser = makeUser({
      avatar: PHOTO_A,
      primaryPhoto: PHOTO_A,
      profilePhotos: [PHOTO_A, PHOTO_B, PHOTO_C],
      images: [PHOTO_A, PHOTO_B, PHOTO_C],
    });
    User.findById.mockReturnValueOnce(makeQuery(currentUser));

    let setPayload;
    User.findByIdAndUpdate.mockImplementationOnce((_id, update) => {
      setPayload = update.$set;
      return makeQuery(
        makeUser({
          avatar: setPayload.avatar,
          primaryPhoto: setPayload.primaryPhoto,
          profilePhotos: setPayload.profilePhotos,
          images: setPayload.images.map((image) => image.url),
        })
      );
    });

    const res = await request(app)
      .delete(`/api/user/me/photos/${encodeURIComponent(PHOTO_C)}`)
      .set("Authorization", "******");

    expect(res.status).toBe(200);
    expect(setPayload.primaryPhoto).toBe(PHOTO_A);
    expect(setPayload.avatar).toBe(PHOTO_A);
    expect(setPayload.profilePhotos).toEqual([PHOTO_A, PHOTO_B]);
    expect(res.body.avatar).toBe(PHOTO_A);
    expect(res.body.profilePhotos).toEqual([PHOTO_A, PHOTO_B]);
  });

  test("the requested primary photo persists after a simulated reload via GET /me", async () => {
    // Persisted document as it would be stored right after the reorder call
    // above (B is now the authoritative primary photo).
    const persistedUser = makeUser({
      avatar: PHOTO_B,
      primaryPhoto: PHOTO_B,
      profilePhotos: [PHOTO_B, PHOTO_A],
      images: [PHOTO_B, PHOTO_A],
    });
    User.findById.mockReturnValueOnce(makeQuery(persistedUser));

    const res = await request(app).get("/api/user/me").set("Authorization", "******");

    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe(PHOTO_B);
    expect(res.body.primaryPhoto).toBe(PHOTO_B);
    expect(res.body.profilePhotos).toEqual([PHOTO_B, PHOTO_A]);

    // Cross-check directly against the shared photoFields helper used by /me,
    // guaranteeing re-serialization never reshuffles the persisted order.
    const reserialized = serializeUserPhotoFields({ protocol: "https", get: () => "" }, persistedUser);
    expect(reserialized.primaryPhoto).toBe(PHOTO_B);
    expect(reserialized.profilePhotos).toEqual([PHOTO_B, PHOTO_A]);
  });
});
