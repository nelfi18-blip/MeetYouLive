const {
  getUserPhotoSelection,
  getPrimaryPhotoUrl,
  hasSerializableUserPhoto,
  normalizePhotoUrl,
  normalizeUserImages,
  syncCanonicalPhotoFields,
  syncPhotoAliases,
  withSerializedUserPhotoFields,
} = require("../photoFields.js");

const makeReq = (headers = {}) => ({
  protocol: "https",
  get(name) {
    return headers[name.toLowerCase()];
  },
});

describe("photoFields", () => {
  test("normalizes legacy upload paths against the request origin", () => {
    const req = makeReq({
      host: "api.meetyoulive.net",
      "x-forwarded-proto": "https",
    });

    expect(normalizePhotoUrl(req, "/api/uploads/avatar-user-123.jpg")).toBe(
      "https://api.meetyoulive.net/uploads/avatar-user-123.jpg"
    );
  });

  test("uses legacy real photo aliases when canonical fields are empty", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });
    const user = withSerializedUserPhotoFields(req, {
      _id: "user-1",
      name: "Valid User",
      avatar: "",
      profilePhotos: [],
      photoURL: "https://lh3.googleusercontent.com/a/real-google-photo=s96-c",
    });

    expect(user.avatar).toBe("https://lh3.googleusercontent.com/a/real-google-photo=s96-c");
    expect(user.profileImage).toBe(user.avatar);
    expect(user.photo).toBe(user.avatar);
    expect(user.photos).toEqual([user.avatar]);
    expect(user.profilePhotos).toEqual([user.avatar]);
    expect(user.images[0]).toMatchObject({ url: user.avatar, isPrimary: true });
  });

  test("detects serializable legacy photo aliases without requiring canonical fields", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });

    expect(hasSerializableUserPhoto(req, { imageUrl: "https://example.com/real.jpg" })).toBe(true);
    expect(hasSerializableUserPhoto(req, { imageUrl: "javascript:alert(1)" })).toBe(false);
  });

  test("normalizes legacy avatar into canonical images[0]", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });
    const user = { avatar: "/uploads/avatar.webp", images: [], profilePhotos: [] };

    const state = syncCanonicalPhotoFields(user, req);

    expect(state.avatar).toBe("https://api.meetyoulive.net/uploads/avatar.webp");
    expect(state.images[0]).toMatchObject({ url: state.avatar, isPrimary: true });
    expect(state.profilePhotos).toEqual([state.avatar]);
    expect(user.avatar).toBe(state.avatar);
  });

  test("syncPhotoAliases is an alias for canonical image/avatar/profilePhotos sync", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });
    const user = { avatar: "/uploads/avatar.webp", images: [], profilePhotos: [] };

    expect(syncPhotoAliases(user, req)).toMatchObject({
      avatar: "https://api.meetyoulive.net/uploads/avatar.webp",
      profilePhotos: ["https://api.meetyoulive.net/uploads/avatar.webp"],
      images: [expect.objectContaining({ url: "https://api.meetyoulive.net/uploads/avatar.webp", isPrimary: true })],
    });
  });

  test("normalizes profilePhotos[0] into canonical images[0]", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });
    const images = normalizeUserImages({
      images: [],
      avatar: "",
      profilePhotos: ["", { url: "/uploads/profile.webp" }],
    }, req);

    expect(images[0]).toMatchObject({
      url: "https://api.meetyoulive.net/uploads/profile.webp",
      isPrimary: true,
    });
  });

  test("returns the primary normalized photo URL only from valid photo values", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });

    expect(getPrimaryPhotoUrl({ images: [{ url: "" }, { url: "/uploads/second.webp" }] }, req)).toBe(
      "https://api.meetyoulive.net/uploads/second.webp"
    );
    expect(getPrimaryPhotoUrl({ images: [{ publicId: "missing-url" }], avatar: "" }, req)).toBe("");
  });

  test("keeps canonical profile photos before aliases and removes duplicates", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });
    const user = withSerializedUserPhotoFields(req, {
      profilePhotos: ["/uploads/avatar-user-1.webp"],
      picture: "https://example.com/picture.jpg",
      imageUrl: "https://example.com/picture.jpg",
    });

    expect(user.avatar).toBe("https://api.meetyoulive.net/uploads/avatar-user-1.webp");
    expect(user.profilePhotos).toEqual([
      "https://api.meetyoulive.net/uploads/avatar-user-1.webp",
      "https://example.com/picture.jpg",
    ]);
  });

  test("reports photo count and primary field used for diagnostics", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });
    const selection = getUserPhotoSelection(req, {
      username: "photo-user",
      profilePhotos: ["", "/uploads/first.webp"],
      avatar: "/uploads/avatar.webp",
      image: "https://example.com/image.jpg",
    });

    expect(selection).toEqual({
      primaryPhoto: "https://api.meetyoulive.net/uploads/avatar.webp",
      photos: [
        "https://api.meetyoulive.net/uploads/avatar.webp",
        "https://api.meetyoulive.net/uploads/first.webp",
        "https://example.com/image.jpg",
      ],
      fieldUsed: "avatar",
      photoCount: 3,
    });
  });

  test("rejects non-renderable unsafe photo values", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });

    expect(normalizePhotoUrl(req, "javascript:alert(1)")).toBe("");
    expect(normalizePhotoUrl(req, "/uploads/../secret.jpg")).toBe("");
  });
});
