const {
  hasSerializableUserPhoto,
  normalizePhotoUrl,
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
  });

  test("detects serializable legacy photo aliases without requiring canonical fields", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });

    expect(hasSerializableUserPhoto(req, { imageUrl: "https://example.com/real.jpg" })).toBe(true);
    expect(hasSerializableUserPhoto(req, { imageUrl: "javascript:alert(1)" })).toBe(false);
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

  test("rejects non-renderable unsafe photo values", () => {
    const req = makeReq({ host: "api.meetyoulive.net" });

    expect(normalizePhotoUrl(req, "javascript:alert(1)")).toBe("");
    expect(normalizePhotoUrl(req, "/uploads/../secret.jpg")).toBe("");
  });
});
