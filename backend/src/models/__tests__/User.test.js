const User = require("../User.js");

describe("User model profile fields", () => {
  test("keeps canonical profile fields persisted and compatibility aliases virtual", () => {
    expect(User.schema.path("name")).toBeTruthy();
    expect(User.schema.path("birthdate")).toBeTruthy();
    expect(User.schema.path("interestedIn")).toBeTruthy();
    expect(User.schema.path("avatar")).toBeTruthy();
    expect(User.schema.path("images")).toBeTruthy();
    expect(User.schema.path("profilePhotos")).toBeTruthy();

    expect(User.schema.path("displayName")).toBeUndefined();
    expect(User.schema.path("age")).toBeUndefined();
    expect(User.schema.path("genderPreference")).toBeUndefined();
    expect(User.schema.path("profileImage")).toBeUndefined();

    expect(User.schema.virtuals.displayName).toBeTruthy();
    expect(User.schema.virtuals.age).toBeTruthy();
    expect(User.schema.virtuals.genderPreference).toBeTruthy();
    expect(User.schema.virtuals.profileImage).toBeTruthy();
  });

  test("calculates age from birthdate without storing age", () => {
    const now = new Date();
    const birthdate = new Date(now);
    birthdate.setFullYear(now.getFullYear() - 25);
    birthdate.setDate(now.getDate() - 1);

    const user = new User({
      email: "age@example.com",
      password: "secret",
      name: "Age User",
      birthdate,
    });

    expect(user.age).toBe(25);
    expect(user.toObject()).not.toHaveProperty("age");
  });

  test("maps compatibility aliases to canonical fields", () => {
    const user = new User({
      email: "alias@example.com",
      password: "secret",
      displayName: "Alias User",
      genderPreference: "women",
      profileImage: "https://example.com/avatar.jpg",
    });

    expect(user.name).toBe("Alias User");
    expect(user.displayName).toBe("Alias User");
    expect(user.interestedIn).toBe("women");
    expect(user.genderPreference).toBe("women");
    expect(user.avatar).toBe("https://example.com/avatar.jpg");
    expect(user.profileImage).toBe("https://example.com/avatar.jpg");
  });

  test("supports GeoJSON locationPoint with a 2dsphere index", () => {
    expect(User.schema.path("location")).toBeTruthy();
    expect(User.schema.path("locationPoint")).toBeTruthy();

    const indexes = User.schema.indexes();
    expect(indexes.some(([fields]) => fields.location === "2dsphere")).toBe(true);
    expect(indexes.some(([fields]) => fields.locationPoint === "2dsphere")).toBe(true);

    const validUser = new User({
      email: "geo@example.com",
      password: "secret",
      locationPoint: { type: "Point", coordinates: [-70.66, -33.45] },
    });
    expect(validUser.validateSync()).toBeUndefined();

    const invalidUser = new User({
      email: "bad-geo@example.com",
      password: "secret",
      locationPoint: { type: "Point", coordinates: [-190, -33.45] },
    });
    expect(invalidUser.validateSync().errors["locationPoint.coordinates"]).toBeTruthy();
  });

  test("supports onboarding images and GeoJSON location", () => {
    const user = new User({
      email: "onboarding-schema@example.com",
      password: "secret",
      images: [
        {
          url: "https://example.com/photo.jpg",
          publicId: "photo-public-id",
          isPrimary: true,
          uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      location: {
        type: "Point",
        coordinates: [-70.66, -33.45],
        country: "Chile",
        city: "Santiago",
        region: "RM",
        label: "Santiago, RM, Chile",
      },
      gender: "female",
      interestedIn: "male",
      birthdate: new Date("2000-01-01T00:00:00.000Z"),
      interests: ["Música", "Viajes", "Cine"],
      intent: "dating",
      onboardingComplete: true,
    });

    expect(user.validateSync()).toBeUndefined();
    expect(user.images[0].url).toBe("https://example.com/photo.jpg");
    expect(user.location.coordinates).toEqual([-70.66, -33.45]);
  });

  test("converts legacy string location values to the embedded location object", () => {
    const user = new User({
      email: "legacy-location@example.com",
      password: "secret",
      location: "usa",
    });

    expect(user.validateSync()).toBeUndefined();
    expect(user.location.toObject()).toMatchObject({
      type: "Point",
      country: "usa",
      city: "",
      region: "",
      label: "usa",
    });
  });

  test("hydrates old users with string location without validation errors", () => {
    const user = User.hydrate({
      email: "old-location@example.com",
      password: "secret",
      location: "Santiago, Chile",
    });

    expect(user.validateSync()).toBeUndefined();
    expect(user.location.toObject()).toMatchObject({
      type: "Point",
      country: "Chile",
      city: "Santiago",
      label: "Santiago, Chile",
    });
    expect(user.locationLabel).toBe("Santiago, Chile");
  });

  test("keeps new object location values in the expected format", () => {
    const user = new User({
      email: "object-location@example.com",
      password: "secret",
      location: {
        country: "Chile",
        city: "Santiago",
        region: "RM",
        coordinates: { lat: -33.45, lng: -70.66 },
      },
    });

    expect(user.validateSync()).toBeUndefined();
    expect(user.location.toObject()).toMatchObject({
      type: "Point",
      country: "Chile",
      city: "Santiago",
      region: "RM",
      label: "Santiago, RM, Chile",
      coordinates: [-70.66, -33.45],
    });
  });
});
