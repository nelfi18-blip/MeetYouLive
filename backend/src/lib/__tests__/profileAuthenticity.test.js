const {
  countDistinctPublicPhotos,
  getAuthenticityStatus,
  buildAuthenticityDiscoverFilter,
  applyAuthenticityDiscoverFilter,
  isNewUserForAuthenticity,
} = require("../profileAuthenticity.js");

const CUTOFF = new Date("2026-11-01T00:00:00Z");
const ON = { enforced: true, newUsersFrom: CUTOFF };
const OFF = { enforced: false, newUsersFrom: CUTOFF };
const A = "https://cdn.example.com/a.jpg";
const B = "https://cdn.example.com/b.jpg";

const newUser = (over = {}) => ({
  createdAt: new Date("2026-11-05T00:00:00Z"),
  emailVerified: true,
  primaryPhoto: A,
  profilePhotos: [A, B],
  photoVerification: { status: "verified", verifiedPhoto: A },
  ...over,
});

describe("photo counting", () => {
  it("counts the same URL only once", () => {
    expect(countDistinctPublicPhotos({ primaryPhoto: A, profilePhotos: [A, A], avatar: A })).toBe(1);
  });
  it("ignores empty values and caps at six", () => {
    const many = Array.from({ length: 9 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    expect(countDistinctPublicPhotos({ profilePhotos: ["", "  ", ...many] })).toBe(6);
  });
});

describe("getAuthenticityStatus", () => {
  it("new user with all requirements is eligible", () => {
    const s = getAuthenticityStatus(newUser(), { config: ON });
    expect(s.publishEligible).toBe(true);
    expect(s.missing).toEqual([]);
  });
  it("one photo or duplicate photos is not eligible", () => {
    for (const u of [newUser({ profilePhotos: [A] }), newUser({ profilePhotos: [A, A] })]) {
      const s = getAuthenticityStatus(u, { config: ON });
      expect(s.publishEligible).toBe(false);
      expect(s.missing).toEqual(["minPhotos"]);
    }
  });
  it.each(["none", "pending", "processing", "failed", "review"])("selfie %s is not eligible", (status) => {
    const s = getAuthenticityStatus(newUser({ photoVerification: { status, verifiedPhoto: A } }), { config: ON });
    expect(s.publishEligible).toBe(false);
    expect(s.missing).toContain("selfieVerified");
  });
  it("verification bound to a previous primary photo does not count", () => {
    const s = getAuthenticityStatus(newUser({ photoVerification: { status: "verified", verifiedPhoto: B } }), { config: ON });
    expect(s.requirements.selfieVerified).toBe(false);
  });
  it("unverified email blocks publication", () => {
    expect(getAuthenticityStatus(newUser({ emailVerified: false }), { config: ON }).publishEligible).toBe(false);
  });
  it("deleting a secondary photo suspends only eligibility", () => {
    const s = getAuthenticityStatus(newUser({ profilePhotos: [A] }), { config: ON });
    expect(s.publishEligible).toBe(false);
    expect(s.requirements.selfieVerified).toBe(true);
  });
  it("a re-registered account starts with nothing inherited", () => {
    const fresh = { createdAt: new Date("2026-11-10T00:00:00Z"), email: "same@example.com", emailVerified: false };
    const s = getAuthenticityStatus(fresh, { config: ON });
    expect(s.publishEligible).toBe(false);
    expect(s.missing).toEqual(["emailVerified", "minPhotos", "selfieVerified"]);
  });
  it("legacy users are grandfathered and nobody is gated when enforcement is off", () => {
    const legacy = { createdAt: new Date("2025-01-01T00:00:00Z") };
    expect(getAuthenticityStatus(legacy, { config: ON }).publishEligible).toBe(true);
    expect(getAuthenticityStatus(newUser({ profilePhotos: [A] }), { config: OFF }).publishEligible).toBe(true);
  });
  it("without a cutoff nobody counts as new, and missing createdAt is legacy", () => {
    expect(isNewUserForAuthenticity(newUser(), { enforced: true, newUsersFrom: null })).toBe(false);
    expect(isNewUserForAuthenticity({}, ON)).toBe(false);
  });
});

describe("buildAuthenticityDiscoverFilter (cheap Mongo narrowing only)", () => {
  it("is null when enforcement is off or no cutoff is configured", () => {
    expect(buildAuthenticityDiscoverFilter(OFF)).toBeNull();
    expect(buildAuthenticityDiscoverFilter({ enforced: true, newUsersFrom: null })).toBeNull();
  });
  it("keeps legacy users and narrows new ones by the two exact booleans (no photo-count logic)", () => {
    const f = buildAuthenticityDiscoverFilter(ON);
    expect(f.$or[0]).toEqual({ createdAt: { $lt: CUTOFF } });
    expect(f.$or[2]).toEqual({ emailVerified: true, "photoVerification.status": "verified" });
  });
});

describe("applyAuthenticityDiscoverFilter (authoritative, same function as getAuthenticityStatus)", () => {
  it("passes through unchanged when enforcement is off", () => {
    const users = [newUser({ profilePhotos: [A] })];
    expect(applyAuthenticityDiscoverFilter(users, { config: OFF })).toEqual(users);
  });
  it("keeps legacy users and drops new ones missing requirements, matching getAuthenticityStatus exactly", () => {
    const legacy = { createdAt: new Date("2025-01-01T00:00:00Z") };
    const eligible = newUser();
    const oneDistinctPhoto = newUser({ profilePhotos: [A, A, `  ${A}  `] });
    const unverifiedSelfie = newUser({ photoVerification: { status: "pending", verifiedPhoto: A } });
    const staleSelfie = newUser({ primaryPhoto: B, profilePhotos: [B, A], photoVerification: { status: "verified", verifiedPhoto: A } });

    const kept = applyAuthenticityDiscoverFilter(
      [legacy, eligible, oneDistinctPhoto, unverifiedSelfie, staleSelfie],
      { config: ON }
    );

    expect(kept).toEqual([legacy, eligible]);
  });
});
