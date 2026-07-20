process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-client";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test-secret";
process.env.GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "https://api.example.com/callback";

const User = require("../../models/User.js");
const { findOrCreateGoogleUser, getGoogleUserPhotoFields } = require("../passport.js");

describe("Google Passport photo persistence", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("maps a new Google user's profile photo to canonical images and aliases", () => {
    const fields = getGoogleUserPhotoFields({
      photos: [{ value: "https://lh3.googleusercontent.com/a/google-photo=s96-c" }],
    });

    expect(fields.avatar).toBe("https://lh3.googleusercontent.com/a/google-photo=s96-c");
    expect(fields.profilePhotos).toEqual(["https://lh3.googleusercontent.com/a/google-photo=s96-c"]);
    expect(fields.images).toHaveLength(1);
    expect(fields.images[0]).toMatchObject({
      url: "https://lh3.googleusercontent.com/a/google-photo=s96-c",
      isPrimary: true,
      source: "google",
    });
    expect(fields.images[0].uploadedAt).toBeInstanceOf(Date);
  });

  test("creates a Google user without assigning a primitive location", async () => {
    jest.spyOn(User, "findOne").mockResolvedValue(null);
    jest.spyOn(User, "exists").mockResolvedValue(false);
    jest.spyOn(User, "create").mockImplementation(async (payload) => ({ _id: "google-user-1", ...payload }));

    const user = await findOrCreateGoogleUser({
      displayName: "Google User",
      emails: [{ value: "google@example.com" }],
      photos: [{ value: "https://lh3.googleusercontent.com/a/google-photo=s96-c" }],
    });

    expect(User.create).toHaveBeenCalledWith(expect.not.objectContaining({ location: "usa" }));
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      email: "google@example.com",
      username: "google",
      avatar: "https://lh3.googleusercontent.com/a/google-photo=s96-c",
    }));
    expect(user.location).toBeUndefined();
  });
});
