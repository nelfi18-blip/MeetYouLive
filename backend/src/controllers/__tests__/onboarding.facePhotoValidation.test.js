/**
 * Integration coverage for the security gap ChatGPT flagged on PR #1109:
 * `PUT /api/onboarding` (handled by `updateOnboarding`) is the endpoint the
 * onboarding frontend actually calls, and is a SEPARATE code path from
 * `PATCH /me/onboarding` in `user.routes.js`. It must run the exact same
 * anti-evasion face-presence gate (`facePhotoValidationGate.js`) and the
 * exact same photoVerification invalidation/reconciliation wiring
 * (`photoVerificationInvalidation.js`) — never a second, divergent system.
 */

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock("../../services/analytics.service.js", () => ({
  trackSafeAnalyticsEvent: jest.fn(),
}));

jest.mock("../../services/faceReference.service.js", () => ({
  compareAgainstReference: jest.fn(),
}));

// Keep every other export (codes, error class, messages) real so
// `sendFacePhotoValidationErrorIfApplicable`/`rejectNewPhotosWithoutFace`
// behave exactly as they do in production; only the AWS-backed network call
// is replaced.
jest.mock("../../lib/facePhotoValidation.js", () => {
  const actual = jest.requireActual("../../lib/facePhotoValidation.js");
  return { ...actual, validateNewPhotoUrls: jest.fn() };
});

const User = require("../../models/User.js");
const faceReferenceService = require("../../services/faceReference.service.js");
const { updateOnboarding } = require("../onboarding.controller.js");
const { FACE_PHOTO_VALIDATION_CODES, validateNewPhotoUrls } = require("../../lib/facePhotoValidation.js");

const USER_ID = "507f1f77bcf86cd799439011";
const EXISTING_PHOTO = "https://res.cloudinary.com/meetyoulive/image/upload/v1/existing.jpg";
const NEW_PHOTO_URL = "https://res.cloudinary.com/meetyoulive/image/upload/v2/new-photo.jpg";

const req = {
  protocol: "https",
  get(name) {
    return name.toLowerCase() === "host" ? "meetyoulive.onrender.com" : "";
  },
};

const makeReq = (body, overrides = {}) => ({
  ...req,
  userId: USER_ID,
  body,
  ip: "203.0.113.5",
  ...overrides,
});

const makeResponse = () => {
  const res = {
    statusCode: 200,
    status: jest.fn(function status(code) {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn(() => res),
  };
  return res;
};

const setNestedPath = (target, path, value) => {
  const segments = path.split(".");
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (!cursor[segment] || typeof cursor[segment] !== "object") cursor[segment] = {};
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
};

const makeCurrentUser = (overrides = {}) => {
  const user = {
    _id: USER_ID,
    name: "Onboarding User",
    role: "user",
    isBlocked: false,
    isSuspended: false,
    avatar: EXISTING_PHOTO,
    primaryPhoto: EXISTING_PHOTO,
    profilePhotos: [EXISTING_PHOTO],
    images: [{ url: EXISTING_PHOTO, isPrimary: true }],
    birthdate: new Date("2000-01-01T00:00:00.000Z"),
    location: { type: "Point", coordinates: [-70.6693, -33.4489], country: "Chile", city: "Santiago" },
    gender: "female",
    interestedIn: "male",
    interestedInConfirmed: true,
    intent: "dating",
    interests: ["music", "travel", "movies"],
    photoVerification: { status: "none" },
    toObject() {
      return { ...this };
    },
    // Mirrors Mongoose Document#set's support for dotted paths (e.g.
    // "photoVerification.status"), which `preparePhotoVerificationReset`'s
    // resetFields rely on being applied to the SAME atomic write.
    set(updates) {
      Object.entries(updates).forEach(([key, value]) => {
        if (key.includes(".")) {
          setNestedPath(this, key, value);
        } else {
          this[key] = value;
        }
      });
    },
    save: jest.fn(async function save() {
      return this;
    }),
    ...overrides,
  };
  return user;
};

const baseBody = {
  name: "Onboarding User",
  birthdate: "2000-01-01",
  gender: "female",
  interestedIn: "male",
  intent: "dating",
  interests: ["music", "travel", "movies"],
  location: { type: "Point", coordinates: [-70.6693, -33.4489], country: "Chile", city: "Santiago" },
};

describe("PUT /api/onboarding — face-presence validation wiring", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    validateNewPhotoUrls.mockResolvedValue({ ok: true });
    User.updateOne.mockResolvedValue({});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("rejects a brand-new photo URL submitted via onboarding (closes the PUT /api/onboarding evasion route)", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(currentUser) });
    validateNewPhotoUrls.mockResolvedValue({
      ok: false,
      code: FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED,
      message: "No pudimos detectar un rostro. Selecciona otra fotografía.",
      url: NEW_PHOTO_URL,
    });

    const res = makeResponse();
    await updateOnboarding(makeReq({ ...baseBody, photoUrl: NEW_PHOTO_URL }), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, code: FACE_PHOTO_VALIDATION_CODES.NO_FACE_DETECTED })
    );
    expect(currentUser.save).not.toHaveBeenCalled();
    expect(validateNewPhotoUrls).toHaveBeenCalledWith([NEW_PHOTO_URL], expect.anything());
  });

  test("preserves old photos untouched when onboarding is resubmitted with only the existing photo", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(currentUser) });

    const res = makeResponse();
    await updateOnboarding(makeReq({ ...baseBody, photoUrl: EXISTING_PHOTO }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(validateNewPhotoUrls).not.toHaveBeenCalled();
    expect(currentUser.save).toHaveBeenCalled();
    expect(currentUser.images).toHaveLength(1);
    expect(currentUser.images[0]).toMatchObject({ url: EXISTING_PHOTO, isPrimary: true });
  });

  test("accepts a new photo that passes face validation and persists it", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(currentUser) });
    validateNewPhotoUrls.mockResolvedValue({ ok: true });

    const res = makeResponse();
    await updateOnboarding(makeReq({ ...baseBody, photoUrl: NEW_PHOTO_URL }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(currentUser.save).toHaveBeenCalled();
    expect(validateNewPhotoUrls).toHaveBeenCalledWith([NEW_PHOTO_URL], expect.anything());
  });

  test("changing the primary photo via onboarding invalidates a prior 'verified' badge, then reconciles via CompareFaces on a match", async () => {
    const currentUser = makeCurrentUser({ photoVerification: { status: "verified", verifiedPhoto: EXISTING_PHOTO } });
    User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(currentUser) });
    // Fresh re-read performed by reconcilePhotoVerificationAfterChange after
    // its own conditional write.
    User.findById.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({
        toObject: () => ({ status: "verified", verifiedPhoto: NEW_PHOTO_URL }),
      }),
    });
    validateNewPhotoUrls.mockResolvedValue({ ok: true });
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "verified" });

    const res = makeResponse();
    await updateOnboarding(makeReq({ ...baseBody, photoUrl: NEW_PHOTO_URL }), res);

    expect(res.status).not.toHaveBeenCalled();
    // Phase 1: the SAME save() that persists the new photo also reset the
    // badge to "none" (+ a transition token) before any AWS call happened.
    expect(currentUser.photoVerification.status).toBe("none");
    expect(faceReferenceService.compareAgainstReference).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, newPhotoUrl: NEW_PHOTO_URL })
    );
    // Phase 2: a confirmed match performs the conditional restore write.
    expect(User.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: USER_ID,
        primaryPhoto: NEW_PHOTO_URL,
        "photoVerification.pendingChangeToken": expect.any(String),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ "photoVerification.status": "verified" }),
      })
    );
  });

  test("does not restore the verified badge when the new photo does not match the authorized reference", async () => {
    const currentUser = makeCurrentUser({ photoVerification: { status: "verified", verifiedPhoto: EXISTING_PHOTO } });
    User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(currentUser) });
    User.findById.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({ toObject: () => ({ status: "none" }) }),
    });
    validateNewPhotoUrls.mockResolvedValue({ ok: true });
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "mismatch" });

    const res = makeResponse();
    await updateOnboarding(makeReq({ ...baseBody, photoUrl: NEW_PHOTO_URL }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(currentUser.photoVerification.status).toBe("none");
  });

  test("user without an authorized face reference: photo passes presence-only validation but never receives verified status", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(currentUser) });
    validateNewPhotoUrls.mockResolvedValue({ ok: true });

    const res = makeResponse();
    await updateOnboarding(makeReq({ ...baseBody, photoUrl: NEW_PHOTO_URL }), res);

    expect(res.status).not.toHaveBeenCalled();
    // No prior verified badge existed ("none"), so phase 1 is a no-op and
    // CompareFaces is never invoked — face detection alone never grants
    // identity-verified status.
    expect(faceReferenceService.compareAgainstReference).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test("fails closed when AWS/the provider is unavailable for the face-presence check", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(currentUser) });
    validateNewPhotoUrls.mockResolvedValue({
      ok: false,
      code: FACE_PHOTO_VALIDATION_CODES.PROVIDER_UNAVAILABLE,
      message: "No pudimos verificar la imagen ahora. Inténtalo de nuevo.",
      url: NEW_PHOTO_URL,
    });

    const res = makeResponse();
    await updateOnboarding(makeReq({ ...baseBody, photoUrl: NEW_PHOTO_URL }), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: FACE_PHOTO_VALIDATION_CODES.PROVIDER_UNAVAILABLE })
    );
    expect(currentUser.save).not.toHaveBeenCalled();
  });

  test("flag disabled (validateNewPhotoUrls reports skipped): preserves prior onboarding behavior unchanged", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(currentUser) });
    validateNewPhotoUrls.mockResolvedValue({ ok: true, skipped: true });

    const res = makeResponse();
    await updateOnboarding(makeReq({ ...baseBody, photoUrl: NEW_PHOTO_URL }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(currentUser.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});
