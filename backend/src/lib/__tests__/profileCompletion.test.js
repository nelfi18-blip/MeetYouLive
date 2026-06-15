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
