const mockFindOneAndUpdate = jest.fn();
const mockFindById = jest.fn();
const mockFindOne = jest.fn();
const mockEligibility = jest.fn();
jest.mock("../../models/User.js", () => ({
  findOneAndUpdate: mockFindOneAndUpdate,
  findById: mockFindById,
  findOne: mockFindOne,
}));
jest.mock("../../services/agencyEligibility.service.js", () => ({
  readAgencyEligibility: mockEligibility,
}));
const { requestAgency, getAgencyEligibility, getInviteInfo } = require("../agency.controller.js");

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});
const eligibleCreator = {
  _id: "507f1f77bcf86cd799439011",
  role: "creator", creatorStatus: "approved",
  agencyProfile: { enabled: false, requestStatus: "none" },
  photoVerification: { status: "verified", verifiedPhoto: "https://cdn.example.com/a.jpg" },
};
const progress = {
  eligible: true, daysAsCreator: 35, completedLives: 3,
  requirements: { adult: true, authenticProfile: true, creatorTenure: true, completedLives: true },
};

describe("agency applications are reserved for eligible, approved full creators", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindById.mockReturnValue({ lean: jest.fn().mockResolvedValue(eligibleCreator) });
    mockEligibility.mockResolvedValue(progress);
    mockFindOneAndUpdate.mockResolvedValue({
      agencyProfile: { enabled: false, requestStatus: "pending", requestedName: "My Studio" },
    });
  });

  it("records a pending application but never enables an agency", async () => {
    const res = makeRes();
    await requestAgency({ userId: eligibleCreator._id, body: { agencyName: "  My Studio  ", acceptSupervision: true } }, res);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestStatus: "pending" }));
    expect(mockEligibility).toHaveBeenCalledWith(eligibleCreator);
    const [filter, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({
      _id: eligibleCreator._id, role: "creator", creatorStatus: "approved",
      creatorApprovedAt: { $lte: expect.any(Date) },
      birthdate: { $lte: expect.any(Date) },
      emailVerified: true,
      "photoVerification.status": "verified",
      "photoVerification.verifiedPhoto": eligibleCreator.photoVerification.verifiedPhoto,
      isBlocked: { $ne: true }, isSuspended: { $ne: true },
      "agencyProfile.enabled": { $ne: true },
      "agencyProfile.requestStatus": { $ne: "pending" },
      "agencyRelationship.status": { $nin: ["pending", "active", "suspended"] },
    });
    expect(update.$set).toMatchObject({
      "agencyProfile.requestStatus": "pending",
      "agencyProfile.requestedName": "My Studio",
      "agencyProfile.supervisionAcceptedAt": expect.any(Date),
    });
    expect(update.$set).not.toHaveProperty("agencyProfile.enabled");
  });

  it("does not permit application without explicit supervision acceptance", async () => {
    const res = makeRes();
    await requestAgency({ userId: eligibleCreator._id, body: { agencyName: "Studio Group", acceptSupervision: false } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFindById).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not permit invalid names", async () => {
    const res = makeRes();
    await requestAgency({ userId: eligibleCreator._id, body: { agencyName: "<script>", acceptSupervision: true } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses new applications when real eligibility checks fail", async () => {
    mockEligibility.mockResolvedValue({ ...progress, eligible: false, requirements: { ...progress.requirements, completedLives: false } });
    const res = makeRes();
    await requestAgency({ userId: eligibleCreator._id, body: { agencyName: "Studio Group", acceptSupervision: true } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ eligible: false }));
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects sub-creators and non-approved users", async () => {
    mockFindById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...eligibleCreator, role: "subCreator" }) });
    const res = makeRes();
    await requestAgency({ userId: eligibleCreator._id, body: { agencyName: "Studio Group", acceptSupervision: true } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockEligibility).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects already pending requests", async () => {
    mockFindById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...eligibleCreator, agencyProfile: { requestStatus: "pending" } }) });
    const res = makeRes();
    await requestAgency({ userId: eligibleCreator._id, body: { agencyName: "Studio Group", acceptSupervision: true } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("never claims success when atomic security revalidation fails", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);
    const res = makeRes();
    await requestAgency({ userId: eligibleCreator._id, body: { agencyName: "Studio Group", acceptSupervision: true } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("does not validate invitation codes issued to creators without enabled agencies", async () => {
    mockFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = makeRes();
    await getInviteInfo({ query: { code: "mayas2489" } }, res);
    expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({
      "agencyProfile.agencyCode": "MAYAS2489",
      "agencyProfile.enabled": true,
      role: "creator",
      creatorStatus: "approved",
    }));
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("shows server-verified eligibility only to approved full creators", async () => {
    const res = makeRes();
    await getAgencyEligibility({ userId: eligibleCreator._id }, res);
    expect(res.json).toHaveBeenCalledWith(progress);
    mockFindById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...eligibleCreator, role: "subCreator" }) });
    const denied = makeRes();
    await getAgencyEligibility({ userId: eligibleCreator._id }, denied);
    expect(denied.status).toHaveBeenCalledWith(403);
  });
});
