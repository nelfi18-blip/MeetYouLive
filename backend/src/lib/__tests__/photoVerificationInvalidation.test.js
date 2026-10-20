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
  preparePhotoVerificationReset,
  reconcilePhotoVerificationAfterChange,
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

describe("preparePhotoVerificationReset (phase 1 — merges into the SAME atomic write as primaryPhoto)", () => {
  it("returns no reset fields/token when there is nothing to invalidate", () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "none" } };
    const { resetFields, changeToken } = preparePhotoVerificationReset(user, "https://img/a.jpg");
    expect(resetFields).toBeNull();
    expect(changeToken).toBeNull();
  });

  it("returns reset fields PLUS a fresh pendingChangeToken when the photo actually changes", () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    const { resetFields, changeToken } = preparePhotoVerificationReset(user, "https://img/b.jpg");
    expect(changeToken).toEqual(expect.any(String));
    expect(changeToken.length).toBeGreaterThan(10);
    expect(resetFields).toEqual({
      "photoVerification.status": "none",
      "photoVerification.verifiedPhoto": "",
      "photoVerification.verifiedAt": null,
      "photoVerification.activeSessionId": null,
      "photoVerification.pendingChangeToken": changeToken,
    });
  });

  it("mints a DIFFERENT token on every call, even for the exact same photo URL (A->B->A support)", () => {
    const user = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    const first = preparePhotoVerificationReset(user, "https://img/a.jpg".replace("a", "b"));
    const second = preparePhotoVerificationReset(user, "https://img/a.jpg".replace("a", "b"));
    expect(first.changeToken).not.toEqual(second.changeToken);
  });
});

describe("reconcilePhotoVerificationAfterChange (phase 2 — AWS compare + gated restore write)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the existing state without calling AWS when phase 1 found nothing to reset", async () => {
    const currentUser = {
      primaryPhoto: "https://img/a.jpg",
      photoVerification: { status: "none", toObject: undefined },
    };
    const result = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/a.jpg",
      changeToken: null,
    });
    expect(result).toEqual({ status: "none" });
    expect(faceReferenceService.compareAgainstReference).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it("restores the verified badge, gated on BOTH primaryPhoto AND the exact transition token, then re-reads authoritative state", async () => {
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "verified" });
    User.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        toObject: () => ({ photoVerification: { status: "verified", verifiedPhoto: "https://img/b.jpg" } }),
      }),
    });

    const result = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
      changeToken: "token-123",
      ip: "1.2.3.4",
    });

    expect(User.updateOne).toHaveBeenCalledWith(
      {
        _id: "u1",
        primaryPhoto: "https://img/b.jpg",
        "photoVerification.pendingChangeToken": "token-123",
      },
      { $set: expect.objectContaining({ "photoVerification.status": "verified" }) }
    );
    expect(result).toEqual({ status: "verified", verifiedPhoto: "https://img/b.jpg" });
  });

  it("falls back to requiring a new selfie when the kept reference does NOT match (different person)", async () => {
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "mismatch", reasonCode: "NO_MATCH" });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ toObject: () => ({ photoVerification: { status: "none" } }) }),
    });

    const result = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
      changeToken: "token-1",
    });
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "none" });
  });

  it("fails closed (no restore write) when the face-reference comparison throws (e.g. AWS unavailable / AWS failure)", async () => {
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockRejectedValue(new Error("AWS down"));
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ toObject: () => ({ photoVerification: { status: "none" } }) }),
    });

    const result = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
      changeToken: "token-1",
    });
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "none" });
  });

  it("fails closed when there is no usable/consented reference (no_reference) or it was removed", async () => {
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "no_reference" });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ toObject: () => ({ photoVerification: { status: "none" } }) }),
    });

    const result = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
      changeToken: "token-1",
    });
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "none" });
  });

  it("fails closed when consent was revoked/withdrawn mid-comparison (relayed by compareAgainstReference)", async () => {
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({
      status: "no_reference",
      reasonCode: "REVOKED_DURING_COMPARISON",
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ toObject: () => ({ photoVerification: { status: "none" } }) }),
    });

    const result = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
      changeToken: "token-1",
    });
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(result.status).toBe("none");
  });

  it("CONCURRENCY: a slow AWS comparison for an OLDER change (stale token) can never overwrite a NEWER change's state, even when it targets the SAME photo URL (A->B->A)", async () => {
    // Timeline: user is on A (verified). Changes to B (phase1 writes
    // token=T1, status=none). While T1's AWS comparison is still running,
    // the user changes BACK to A (phase1 writes token=T2, status=none,
    // primaryPhoto=A again). T1's comparison (for the EARLIER change to B)
    // finally resolves as "verified" — its conditional restore write must
    // be a no-op because, even though nothing else about the DB state
    // obviously looks wrong, the pendingChangeToken no longer matches T1.
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "verified" });
    // The conditional update finds zero matching documents: DB's token is
    // now T2, not T1.
    User.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        toObject: () => ({
          photoVerification: { status: "none", verifiedPhoto: "", pendingChangeToken: "T2" },
        }),
      }),
    });

    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    const result = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg", // the stale request's own target photo
      changeToken: "T1",
    });

    expect(User.updateOne).toHaveBeenCalledWith(
      {
        _id: "u1",
        primaryPhoto: "https://img/b.jpg",
        "photoVerification.pendingChangeToken": "T1",
      },
      expect.anything()
    );
    // Authoritative state always comes from the DB, never the stale decision.
    expect(result).toEqual({ status: "none", verifiedPhoto: "", pendingChangeToken: "T2" });
  });

  it("CONCURRENCY: two concurrent photo changes to DIFFERENT photos each only ever restore their OWN transition", async () => {
    // Request A (photo B, token T1) and request B (photo C, token T2) are
    // both in flight. Both AWS comparisons happen to succeed. Each request's
    // conditional write must only ever match its OWN primaryPhoto+token
    // pair — simulated here by the LAST writer (C) having already committed
    // by the time A's write runs.
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "verified" });
    User.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }); // A's stale write: no match (DB is now C/T2)
    User.findById.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({
        toObject: () => ({ photoVerification: { status: "verified", verifiedPhoto: "https://img/c.jpg", pendingChangeToken: "T2" } }),
      }),
    });

    const resultA = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser: { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } },
      nextPrimaryPhoto: "https://img/b.jpg",
      changeToken: "T1",
    });

    // A's own decision was simply never applied (matchedCount 0) — the
    // authoritative re-read instead reflects C's own, later transition.
    expect(resultA).toEqual({
      status: "verified",
      verifiedPhoto: "https://img/c.jpg",
      pendingChangeToken: "T2",
    });
  });

  it("CONCURRENCY: AWS taking a long time to respond never blocks the reset-to-none state already committed by phase 1", async () => {
    let resolveCompare;
    faceReferenceService.compareAgainstReference.mockReturnValue(
      new Promise((resolve) => {
        resolveCompare = resolve;
      })
    );
    User.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        toObject: () => ({ photoVerification: { status: "verified", verifiedPhoto: "https://img/b.jpg" } }),
      }),
    });

    const pending = reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser: { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } },
      nextPrimaryPhoto: "https://img/b.jpg",
      changeToken: "token-slow",
    });

    // While AWS is "slow", phase 1 has already reset the badge in the DB
    // (verified by the preparePhotoVerificationReset unit tests above) —
    // this just confirms phase 2 does not resolve/write anything until AWS
    // actually responds.
    expect(User.updateOne).not.toHaveBeenCalled();

    resolveCompare({ status: "verified" });
    const result = await pending;
    expect(User.updateOne).toHaveBeenCalled();
    expect(result).toEqual({ status: "verified", verifiedPhoto: "https://img/b.jpg" });
  });

  it("returns null when the user no longer exists on re-read", async () => {
    const currentUser = { primaryPhoto: "https://img/a.jpg", photoVerification: { status: "verified" } };
    faceReferenceService.compareAgainstReference.mockResolvedValue({ status: "mismatch" });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const result = await reconcilePhotoVerificationAfterChange({
      userId: "u1",
      currentUser,
      nextPrimaryPhoto: "https://img/b.jpg",
      changeToken: "token-1",
    });
    expect(result).toBeNull();
  });
});
