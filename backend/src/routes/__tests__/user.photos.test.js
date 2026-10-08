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

const USER_ID = "507f1f77bcf86cd799439011";
const PHOTO_A = "https://res.cloudinary.com/demo/image/upload/v1/photo-a.jpg";
const PHOTO_B = "https://res.cloudinary.com/demo/image/upload/v1/photo-b.jpg";
const PHOTO_C = "https://res.cloudinary.com/demo/image/upload/v1/photo-c.jpg";

// Regression coverage for the "Hacer principal" gallery bug: saveUserPhotoState()
// must make the first element of an explicit new photo list the authoritative
// primaryPhoto/avatar/images[0]/profilePhotos[0], and stale legacy fields must
// never reinsert a removed or reordered photo.
describe("profile photo gallery regression (make primary / delete)", () => {
  let app;
  let store;

  const makeStoreDoc = (fields) => ({
    _id: USER_ID,
    name: "Gallery User",
    onboardingComplete: true,
    ...fields,
    toObject() {
      return { ...this };
    },
  });

  const resetStore = (overrides = {}) => {
    store = makeStoreDoc({
      avatar: PHOTO_A,
      primaryPhoto: PHOTO_A,
      profilePhotos: [PHOTO_A, PHOTO_B, PHOTO_C],
      images: [
        { url: PHOTO_A, isPrimary: true },
        { url: PHOTO_B, isPrimary: false },
        { url: PHOTO_C, isPrimary: false },
      ],
      ...overrides,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();

    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(store),
    }));
    User.findByIdAndUpdate.mockImplementation((_id, update) => {
      const changes = update && update.$set ? update.$set : update;
      Object.assign(store, changes);
      return { select: jest.fn().mockResolvedValue(store) };
    });
    User.updateOne.mockResolvedValue({});
    User.findOne.mockResolvedValue(null);

    app = express();
    app.use(express.json());
    app.use("/api/user", userRoutes);
  });

  test("making a secondary photo primary persists the new order (no stale primaryPhoto)", async () => {
    const res = await request(app)
      .patch("/api/user/me/photos/reorder")
      .set("Authorization", "******")
      .send({ images: [PHOTO_C, PHOTO_A, PHOTO_B] });

    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe(PHOTO_C);
    expect(res.body.profilePhotos).toEqual([PHOTO_C, PHOTO_A, PHOTO_B]);
    expect(res.body.images.map((image) => image.url)).toEqual([PHOTO_C, PHOTO_A, PHOTO_B]);
    expect(res.body.user.primaryPhoto).toBe(PHOTO_C);

    // Stale fields on the stored document must not survive the write.
    expect(store.primaryPhoto).toBe(PHOTO_C);
    expect(store.avatar).toBe(PHOTO_C);

    const getRes = await request(app).get("/api/user/me").set("Authorization", "******");
    expect(getRes.status).toBe(200);
    expect(getRes.body.avatar).toBe(PHOTO_C);
    expect(getRes.body.primaryPhoto).toBe(PHOTO_C);
    expect(getRes.body.profilePhotos).toEqual([PHOTO_C, PHOTO_A, PHOTO_B]);
  });

  test("deleting the primary photo promotes the next photo and does not resurrect it", async () => {
    const res = await request(app)
      .delete(`/api/user/me/photos/${encodeURIComponent(PHOTO_A)}`)
      .set("Authorization", "******");

    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe(PHOTO_B);
    expect(res.body.profilePhotos).toEqual([PHOTO_B, PHOTO_C]);
    expect(res.body.profilePhotos).not.toContain(PHOTO_A);
    expect(res.body.images.map((image) => image.url)).not.toContain(PHOTO_A);

    expect(store.primaryPhoto).toBe(PHOTO_B);
    expect(store.profilePhotos).not.toContain(PHOTO_A);

    const getRes = await request(app).get("/api/user/me").set("Authorization", "******");
    expect(getRes.status).toBe(200);
    expect(getRes.body.avatar).toBe(PHOTO_B);
    expect(getRes.body.primaryPhoto).toBe(PHOTO_B);
    expect(getRes.body.profilePhotos).toEqual([PHOTO_B, PHOTO_C]);
  });

  test("deleting a secondary photo keeps the current primary photo and order", async () => {
    const res = await request(app)
      .delete(`/api/user/me/photos/${encodeURIComponent(PHOTO_B)}`)
      .set("Authorization", "******");

    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe(PHOTO_A);
    expect(res.body.profilePhotos).toEqual([PHOTO_A, PHOTO_C]);
    expect(res.body.profilePhotos).not.toContain(PHOTO_B);

    const getRes = await request(app).get("/api/user/me").set("Authorization", "******");
    expect(getRes.status).toBe(200);
    expect(getRes.body.avatar).toBe(PHOTO_A);
    expect(getRes.body.primaryPhoto).toBe(PHOTO_A);
    expect(getRes.body.profilePhotos).toEqual([PHOTO_A, PHOTO_C]);
  });

  test("repeated make-primary calls keep reflecting the exact persisted order", async () => {
    const first = await request(app)
      .patch("/api/user/me/photos/reorder")
      .set("Authorization", "******")
      .send({ images: [PHOTO_B, PHOTO_A, PHOTO_C] });
    expect(first.body.avatar).toBe(PHOTO_B);

    const second = await request(app)
      .patch("/api/user/me/photos/reorder")
      .set("Authorization", "******")
      .send({ images: [PHOTO_C, PHOTO_B, PHOTO_A] });
    expect(second.status).toBe(200);
    expect(second.body.avatar).toBe(PHOTO_C);
    expect(second.body.profilePhotos).toEqual([PHOTO_C, PHOTO_B, PHOTO_A]);

    const getRes = await request(app).get("/api/user/me").set("Authorization", "******");
    expect(getRes.body.avatar).toBe(PHOTO_C);
    expect(getRes.body.profilePhotos).toEqual([PHOTO_C, PHOTO_B, PHOTO_A]);
  });
});
