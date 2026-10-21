const {
  canAppearInFeed,
  getMissingProfileFields,
  getProfileCompletionStatus,
} = require("../profileCompletion.js");

const completeUser = {
  role: "user",
  name: "Photo User",
  images: [{ url: "https://example.com/photo.jpg", isPrimary: true }],
  birthdate: new Date("2000-01-01T00:00:00.000Z"),
  location: { country: "Chile", city: "Santiago", label: "Santiago, Chile" },
  gender: "female",
  interestedIn: "male",
  intent: "dating",
  interests: ["music", "travel", "movies"],
};

describe("profileCompletion", () => {
  test("detects a valid canonical image as a completed photo", () => {
    expect(getMissingProfileFields(completeUser)).not.toContain("photo");
    expect(getProfileCompletionStatus(completeUser).complete).toBe(true);
  });

  test("only allows feed appearance when required fields include a photo", () => {
    const missingPhotoUser = { ...completeUser, images: [], avatar: "" };

    expect(getMissingProfileFields(missingPhotoUser)).toContain("photo");
    expect(canAppearInFeed(missingPhotoUser)).toBe(false);
    expect(canAppearInFeed(completeUser)).toBe(true);
  });

  test("rejects empty canonical image slots without a valid URL", () => {
    const missingPhotoUser = {
      ...completeUser,
      images: [{ url: "", isPrimary: true }, { publicId: "legacy-without-url" }],
      avatar: "",
      profilePhotos: [""],
    };

    expect(getMissingProfileFields(missingPhotoUser)).toContain("photo");
    expect(getProfileCompletionStatus(missingPhotoUser)).toMatchObject({
      complete: false,
      missingFields: ["photo"],
      canAppearInFeed: false,
    });
  });

  test("allows feed appearance with locationPoint and a normalized primary photo", () => {
    const locationPointUser = {
      ...completeUser,
      location: {},
      locationLabel: "",
      locationPoint: { type: "Point", coordinates: [-70.66, -33.45] },
      images: [{ url: "https://example.com/primary.jpg", isPrimary: true }],
      onboardingComplete: true,
    };

    expect(getProfileCompletionStatus(locationPointUser)).toMatchObject({
      complete: true,
      missingFields: [],
      canAppearInFeed: true,
    });
  });

  test("accepts structured location objects and reports exact missing fields", () => {
    const incompleteUser = {
      ...completeUser,
      location: { type: "Point", coordinates: [-70.66, -33.45], city: "Santiago", country: "Chile" },
      intent: "",
      interests: ["music"],
    };

    expect(getMissingProfileFields(incompleteUser)).toEqual(["intent", "interests"]);
    expect(getProfileCompletionStatus(incompleteUser)).toMatchObject({
      complete: false,
      missingFields: ["intent", "interests"],
      canAppearInFeed: false,
    });
  });
});

describe("profileCompletion interestedIn confirmation", () => {
  test("a brand new user with the default 'both' needs preference confirmation, but completeness/feed eligibility are unaffected", () => {
    const newUser = { ...completeUser, interestedIn: "both" };

    const status = getProfileCompletionStatus(newUser);
    expect(status.interestedInConfirmed).toBe(false);
    expect(status.preferenceCompletionNeeded).toBe(true);
    expect(status.missingPreferenceFields).toContain("interestedIn");
    // Discovery visibility/matching ("canAppearInFeed") must not regress for
    // legacy/default-"both" users just because confirmation is pending.
    expect(status.complete).toBe(true);
    expect(status.missingFields).toEqual([]);
    expect(status.canAppearInFeed).toBe(true);
  });

  test("an explicitly confirmed preference clears the confirmation prompt", () => {
    const confirmedUser = { ...completeUser, interestedIn: "both", interestedInConfirmed: true };

    const status = getProfileCompletionStatus(confirmedUser);
    expect(status.interestedInConfirmed).toBe(true);
    expect(status.preferenceCompletionNeeded).toBe(false);
    expect(status.missingPreferenceFields).not.toContain("interestedIn");
  });

  test("a legacy explicit 'men'/'women' value is treated as already confirmed", () => {
    const legacyUser = { ...completeUser, interestedIn: "men" };

    const status = getProfileCompletionStatus(legacyUser);
    expect(status.interestedInConfirmed).toBe(true);
    expect(status.preferenceCompletionNeeded).toBe(false);
  });

  test("gender missing AND interestedIn unconfirmed both surface as preference fields", () => {
    const user = { ...completeUser, gender: "", interestedIn: "both" };

    const status = getProfileCompletionStatus(user);
    expect(status.missingPreferenceFields.sort()).toEqual(["gender", "interestedIn"]);
    expect(status.preferenceCompletionNeeded).toBe(true);
  });
});

