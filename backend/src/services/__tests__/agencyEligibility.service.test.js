const mockCount = jest.fn();
const mockExists = jest.fn();
jest.mock("../../models/Live.js", () => ({ countDocuments: mockCount }));
jest.mock("../../models/AgencyRelationship.js", () => ({ exists: mockExists }));
const { getProgress, readAgencyEligibility } = require("../agencyEligibility.service.js");

const now = new Date("2026-11-10T12:00:00.000Z");
const A = "https://cdn.example.com/a.jpg";
const B = "https://cdn.example.com/b.jpg";
const good = (over = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  role: "creator", creatorStatus: "approved",
  creatorApprovedAt: new Date("2026-10-01T00:00:00.000Z"),
  birthdate: new Date("1996-05-12T00:00:00.000Z"),
  emailVerified: true,
  primaryPhoto: A,
  profilePhotos: [A, B],
  photoVerification: { status: "verified", verifiedPhoto: A },
  isBlocked: false, isSuspended: false,
  agencyRelationship: { status: "none" },
  ...over,
});

describe("agency eligibility uses verified backend evidence only", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCount.mockResolvedValue(3);
    mockExists.mockResolvedValue(null);
  });

  it("requires creator approval, adult status, authentic profile, 30 days and 3 completed Lives", async () => {
    const result = await readAgencyEligibility(good(), { now });
    expect(result.eligible).toBe(true);
    expect(result.daysAsCreator).toBeGreaterThanOrEqual(30);
    expect(result.completedLives).toBe(3);
    expect(result.requirements).toEqual({
      approvedCreator: true, adult: true, authenticProfile: true,
      creatorTenure: true, completedLives: true, goodStanding: true,
      independentCreator: true,
    });
    expect(mockCount).toHaveBeenCalledWith({
      user: good()._id, isLive: false,
      createdAt: { $gte: good().creatorApprovedAt, $lte: now },
      endedAt: { $type: "date", $lte: now },
      $expr: { $gt: ["$endedAt", "$createdAt"] },
    });
    expect(mockExists).toHaveBeenCalledWith({
      subCreator: good()._id,
      status: { $in: ["pending", "active", "suspended"] },
    });
  });

  it.each([
    ["under 18", { birthdate: new Date("2010-01-01") }, "adult"],
    ["not approved", { creatorStatus: "pending" }, "approvedCreator"],
    ["subCreator", { role: "subCreator" }, "approvedCreator"],
    ["creator approved too recently", { creatorApprovedAt: new Date("2026-11-02") }, "creatorTenure"],
    ["missing approval date", { creatorApprovedAt: null }, "creatorTenure"],
    ["email unverified", { emailVerified: false }, "authenticProfile"],
    ["duplicate photos", { profilePhotos: [A, A] }, "authenticProfile"],
    ["old selfie", { photoVerification: { status: "verified", verifiedPhoto: B } }, "authenticProfile"],
    ["blocked", { isBlocked: true }, "goodStanding"],
    ["suspended", { isSuspended: true }, "goodStanding"],
    ["linked", { agencyRelationship: { status: "active", parentCreatorId: "parent" } }, "independentCreator"],
  ])("blocks %s", (_, override, key) => {
    const result = getProgress(good(override), { now, completedLives: 3 });
    expect(result.requirements[key]).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("requires three genuinely completed stream records", () => {
    const result = getProgress(good(), { now, completedLives: 2 });
    expect(result.eligible).toBe(false);
    expect(result.requirements.completedLives).toBe(false);
  });

  it("denies an externally affiliated creator even if their embedded snapshot is stale", async () => {
    mockExists.mockResolvedValue({ _id: "relationship-id" });
    const result = await readAgencyEligibility(good(), { now });
    expect(result.eligible).toBe(false);
    expect(result.requirements.independentCreator).toBe(false);
  });

  it("counts no completed Lives when approval history is missing", async () => {
    const result = await readAgencyEligibility(good({ creatorApprovedAt: null }), { now });
    expect(result.eligible).toBe(false);
    expect(mockCount).not.toHaveBeenCalled();
  });
});
