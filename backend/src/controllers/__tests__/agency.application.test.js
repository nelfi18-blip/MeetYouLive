const mockFindOneAndUpdate = jest.fn();
jest.mock("../../models/User.js", () => ({ findOneAndUpdate: mockFindOneAndUpdate }));
const { requestAgency } = require("../agency.controller.js");

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe("agency applications are reserved for approved full creators", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records a pending application but never enables an agency", async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      agencyProfile: { enabled: false, requestStatus: "pending", requestedName: "My Studio" },
    });
    const res = makeRes();
    await requestAgency({ userId: "creator-id", body: { agencyName: "  My Studio  " } }, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestStatus: "pending" }));
    const [filter, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({
      _id: "creator-id",
      role: "creator",
      creatorStatus: "approved",
      "agencyProfile.enabled": { $ne: true },
      "agencyProfile.requestStatus": { $ne: "pending" },
      "agencyRelationship.status": { $nin: ["pending", "active", "suspended"] },
    });
    expect(update.$set).toMatchObject({
      "agencyProfile.requestStatus": "pending",
      "agencyProfile.requestedName": "My Studio",
    });
    expect(update.$set).not.toHaveProperty("agencyProfile.enabled");
  });

  it("rejects invalid names before accessing the database", async () => {
    const res = makeRes();
    await requestAgency({ userId: "creator-id", body: { agencyName: "<script>" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects duplicate, unapproved, sub-creator or affiliated applications without granting privileges", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);
    const res = makeRes();
    await requestAgency({ userId: "sub-creator-id", body: { agencyName: "Studio Group" } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });
});
