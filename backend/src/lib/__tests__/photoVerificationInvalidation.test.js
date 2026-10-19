const { buildPhotoVerificationResetOnPhotoChange } = require("../photoVerificationInvalidation.js");

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
