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
      authProvider: "google",
      emailVerified: true,
      avatar: "https://lh3.googleusercontent.com/a/google-photo=s96-c",
    }));
    expect(user.location).toBeUndefined();
  });

  test("marks an existing Google login as verified and stores provider fields", async () => {
    const existingUser = User.hydrate({
      _id: "507f1f77bcf86cd799439012",
      email: "existing-google@example.com",
      password: "secret",
      username: "existinggoogle",
      emailVerified: false,
      emailVerificationCode: "123456",
      emailVerificationExpires: new Date("2026-01-01T00:00:00.000Z"),
      emailVerificationSentAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    existingUser.save = jest.fn().mockResolvedValue(existingUser);
    jest.spyOn(User, "findOne").mockResolvedValue(existingUser);

    const user = await findOrCreateGoogleUser({
      id: "google-oauth-id",
      displayName: "Existing Google User",
      emails: [{ value: "Existing-Google@Example.COM" }],
    });

    expect(User.findOne).toHaveBeenCalledWith({ email: "existing-google@example.com" });
    expect(user.authProvider).toBe("google");
    expect(user.googleId).toBe("google-oauth-id");
    expect(user.emailVerified).toBe(true);
    expect(user.emailVerificationCode).toBeNull();
    expect(user.emailVerificationExpires).toBeNull();
    expect(user.emailVerificationSentAt).toBeNull();
    expect(existingUser.save).toHaveBeenCalledTimes(1);
  });

  test("Google login can save an old user that had primitive location data", async () => {
    const legacyUser = User.hydrate({
      _id: "507f1f77bcf86cd799439011",
      email: "legacy-google@example.com",
      password: "secret",
      location: "usa",
    });
    legacyUser.save = jest.fn().mockResolvedValue(legacyUser);
    jest.spyOn(User, "findOne").mockResolvedValue(legacyUser);
    jest.spyOn(User, "exists").mockResolvedValue(false);

    const user = await findOrCreateGoogleUser({
      displayName: "Legacy Google User",
      emails: [{ value: "legacy-google@example.com" }],
    });

    expect(user.location.toObject()).toMatchObject({
      type: "Point",
      country: "usa",
      label: "usa",
    });
    expect(legacyUser.save).toHaveBeenCalledTimes(1);
  });
});
