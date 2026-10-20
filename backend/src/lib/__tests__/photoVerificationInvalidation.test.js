jest.mock("../../services/faceReference.service.js", () => ({
  compareAgainstReference: jest.fn(),
}));
jest.mock("../../models/User.js", () => ({
  updateOne: jest.fn(),
  findById: jest.fn(),
}));

const faceReferenceService = require("../../services/faceReference.service.js");
const User = require("../../models/User.js");
const {
  buildPhotoVerificationResetOnPhotoChange,
  resolvePhotoVerificationOnPhotoChange,
  applyPhotoVerificationTransition,
} = require("../photoVerificationInvalidation.js");

describe("buildPhotoVerificationResetOnPhotoChange", () => {
  it("returns null when the user has never been verified (status none)", () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "none" } };
    expect(buildPhotoVerificationResetOnPhotoChange(user, "https://img/b.jpg")).toBeNull();
  });

  it("returns null when the primary photo did not actually change", () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    expect(buildPhotoVerificationResetOnPhotoChange(user, "https://img/a.jpg")).toBeNull();
  });

  it("resets a verified badge when the primary photo changes", () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    const reset = buildPhotoVerificationResetOnPhotoChange(user, "https://img/b.jpg");
    expect(reset).toEqual({
      "photoVerification.status": "none",
      "photoVerification.verifiedPhoto": "",
      "photoVerification.verifiedAt": null,
      "photoVerification.activeSessionId": null,
    });
  });

  it("resets a pending/review session when the primary photo changes mid-flight", () => {
    const pendingUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "pending" } };
    expect(buildPhotoVerificationResetOnPhotoChange(pendingUser, "https://img/b.jpg")).toEqual(
      expect.objectContaining({ "photoVerification.status": "none" })
    );

    const reviewUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "review" } };
    expect(buildPhotoVerificationResetOnPhotoChange(reviewUser, "https://img/b.jpg")).toEqual(
      expect.objectContaining({ "photoVerification.status": "none" })
    );
  });

  it("handles a missing photoVerification field gracefully", () => {
    const user = { primaryPhoto: "https://img/a.jpg" };
    expect(buildPhotoVerificationResetOnPhotoChange(user, "https://img/b.jpg")).toBeNull();
  });
});

describe("resolvePhotoVerificationOnPhotoChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null without calling AWS when there is nothing to reset", async () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "none" } };
    const result = await resolvePhotoVerificationOnPhotoChange(user, "https://img/a.jpg", { userId: "u1" });
    expect(result).toBeNull();
    expect(faceReferenceService.compareAgainstReference).not.toHaveBeenCalled();
  });

  it("keeps the verified badge for the new photo when the kept reference matches (same person)", async () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "verified", reasonCode: "MATCH" });

    const result = await resolvePhotoVerificationOnPhotoChange(user, "https://img/b.jpg", { userId: "u1" });
    expect(result).toEqual(
      expect.objectContaining({
        "photoVerification.status": "verified",
        "photoVerification.verifiedPhoto": "https://img/b.jpg",
      })
    );
  });

  it("falls back to requiring a new selfie when the kept reference does NOT match (different person)", async () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "mismatch", reasonCode: "NO_MATCH" });

    const result = await resolvePhotoVerificationOnPhotoChange(user, "https://img/b.jpg", { userId: "u1" });
    expect(result).toEqual(expect.objectContaining({ "photoVerification.status": "none" }));
  });

  it("fails closed (reset) when the face-reference comparison throws (e.g. AWS unavailable)", async () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockRejectedValue(new Error("AWS down"));

    const result = await resolvePhotoVerificationOnPhotoChange(user, "https://img/b.jpg", { userId: "u1" });
    expect(result).toEqual(expect.objectContaining({ "photoVerification.status": "none" }));
  });

  it("fails closed when there is no usable/consented reference (no_reference)", async () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "no_reference" });

    const result = await resolvePhotoVerificationOnPhotoChange(user, "https://img/b.jpg", { userId: "u1" });
    expect(result).toEqual(expect.objectContaining({ "photoVerification.status": "none" }));
  });
});

describe("applyPhotoVerificationTransition (race-condition fix)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the existing state without a DB write when no transition is needed", async () => {
    const currentUser = {
      primaryPhoto: "https://img/a.jpg",
      photoVerification: { status: "none", toObject: undefined },
    };
    const result = await applyPhotoVerificationTransition({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/a.jpg",
    });
    expect(result).toEqual({ status: "none" });
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it("writes the decision fields conditioned on primaryPhoto still matching the compared photo, then re-reads authoritative state", async () => {
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "verified" });
    User.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        toObject: () => ({ photoVerification: { status: "verified", verifiedPhoto: "https://img/b.jpg" } }),
      }),
    });

    const result = await applyPhotoVerificationTransition({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
      ip: "1.2.3.4",
    });

    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: "u1", primaryPhoto: "https://img/b.jpg" },
      { $set: expect.objectContaining({ "photoVerification.status": "verified" }) }
    );
    expect(result).toEqual({ status: "verified", verifiedPhoto: "https://img/b.jpg" });
  });

  it("CONCURRENCY: never grants a stale badge when a second, newer photo change wins the race", async () => {
    // Request A started comparing photo B against the reference; while its
    // AWS call was in flight, request B already changed primaryPhoto to C
    // and committed its own (different) decision. Request A's conditional
    // write must be a no-op, and it must return C's authoritative state —
    // never overwriting it with a decision computed for the stale photo B.
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "verified" });
    // The conditional update does not match any document because the DB's
    // primaryPhoto is already "https://img/c.jpg", not "https://img/b.jpg".
    User.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        toObject: () => ({
          photoVerification: { status: "none", verifiedPhoto: "" }, // C's own, unrelated decision
        }),
      }),
    });

    const result = await applyPhotoVerificationTransition({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
    });

    expect(result).toEqual({ status: "none", verifiedPhoto: "" });
  });

  it("returns null when the user no longer exists on re-read", async () => {
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "mismatch" });
    User.updateOne.mockResolvedValue({ matchedCount: 1 });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const result = await applyPhotoVerificationTransition({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
    });
    expect(result).toBeNull();
  });
});
