const { normalizeImages } = require("../onboarding.controller.js");

const req = {
  protocol: "https",
  get(name) {
    return name.toLowerCase() === "host" ? "api.meetyoulive.net" : "";
  },
};

describe("onboarding photo normalization", () => {
  test("stores frontend photoUrl as canonical primary image", () => {
    const images = normalizeImages(req, {
      photoUrl: "https://example.com/onboarding-photo.jpg",
    });

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      url: "https://example.com/onboarding-photo.jpg",
      isPrimary: true,
    });
  });
});
