jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/AgencyRelationship.js", () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock("../../models/CoinTransaction.js", () => ({}));

const User = require("../../models/User.js");
const AgencyRelationship = require("../../models/AgencyRelationship.js");
const {
  updateSubCreatorPercentage,
  acceptPercentageChange,
  declinePercentageChange,
  searchCreators,
} = require("../agency.controller.js");

const makeResponse = () => {
  const res = {
    statusCode: 200,
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn(() => res),
  };
  return res;
};

const userSelect = (user) => ({ select: jest.fn().mockResolvedValue(user) });

const makeRelationship = (overrides = {}) => ({
  _id: "rel-1",
  parentCreator: "agency-1",
  subCreator: "sub-1",
  percentage: 10,
  status: "active",
  pendingPercentage: null,
  pendingPercentageProposedBy: null,
  pendingPercentageProposedAt: null,
  percentageHistory: [],
  subCreatorAgreed: true,
  save: jest.fn(async function save() { return this; }),
  populate: jest.fn(async function populate() { return this; }),
  ...overrides,
});

describe("agency percentage change requires sub-creator consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test("parent proposing a new percentage stores it as pending, without touching the agreed percentage", async () => {
    const relationship = makeRelationship();
    AgencyRelationship.findById.mockResolvedValue(relationship);
    User.findById.mockReturnValue(userSelect({ role: "creator" }));

    const res = makeResponse();
    await updateSubCreatorPercentage({
      userId: "agency-1",
      params: { id: "rel-1" },
      body: { percentage: 20 },
    }, res);

    expect(relationship.percentage).toBe(10); // unchanged until accepted
    expect(relationship.pendingPercentage).toBe(20);
    expect(relationship.pendingPercentageProposedBy).toBe("agency-1");
    expect(relationship.save).toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  test("a non-parent, non-admin creator cannot propose a percentage change", async () => {
    const relationship = makeRelationship();
    AgencyRelationship.findById.mockResolvedValue(relationship);
    User.findById.mockReturnValue(userSelect({ role: "creator" }));

    const res = makeResponse();
    await updateSubCreatorPercentage({
      userId: "someone-else",
      params: { id: "rel-1" },
      body: { percentage: 20 },
    }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(relationship.save).not.toHaveBeenCalled();
  });

  test("proposing the same percentage currently in effect is rejected", async () => {
    const relationship = makeRelationship();
    AgencyRelationship.findById.mockResolvedValue(relationship);
    User.findById.mockReturnValue(userSelect({ role: "creator" }));

    const res = makeResponse();
    await updateSubCreatorPercentage({
      userId: "agency-1",
      params: { id: "rel-1" },
      body: { percentage: 10 },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(relationship.save).not.toHaveBeenCalled();
  });

  test("sub-creator accepting the proposal applies it and records history", async () => {
    const relationship = makeRelationship({ pendingPercentage: 20, pendingPercentageProposedBy: "agency-1" });
    AgencyRelationship.findOne.mockResolvedValue(relationship);

    const res = makeResponse();
    await acceptPercentageChange({ userId: "sub-1" }, res);

    expect(relationship.percentage).toBe(20);
    expect(relationship.pendingPercentage).toBeNull();
    expect(relationship.percentageHistory).toEqual([{ percentage: 10, changedBy: "agency-1" }]);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("sub-1", expect.objectContaining({
      "agencyRelationship.parentCreatorPercentage": 20,
    }));
  });

  test("sub-creator declining the proposal keeps the previous percentage and clears the proposal", async () => {
    const relationship = makeRelationship({ pendingPercentage: 20, pendingPercentageProposedBy: "agency-1" });
    AgencyRelationship.findOne.mockResolvedValue(relationship);

    const res = makeResponse();
    await declinePercentageChange({ userId: "sub-1" }, res);

    expect(relationship.percentage).toBe(10);
    expect(relationship.pendingPercentage).toBeNull();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test("declining without a pending proposal returns 404", async () => {
    AgencyRelationship.findOne.mockResolvedValue(null);

    const res = makeResponse();
    await declinePercentageChange({ userId: "sub-1" }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("agency searchCreators", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects search for non-approved-creator requesters", async () => {
    User.findById.mockReturnValue(userSelect({ role: "user", creatorStatus: "none" }));

    const res = makeResponse();
    await searchCreators({ userId: "me", query: { q: "jane" } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("returns an empty list for queries shorter than 2 characters", async () => {
    User.findById.mockReturnValue(userSelect({ role: "creator", creatorStatus: "approved" }));

    const res = makeResponse();
    await searchCreators({ userId: "me", query: { q: "a" } }, res);

    expect(res.json).toHaveBeenCalledWith({ results: [] });
    expect(User.find).not.toHaveBeenCalled();
  });

  test("excludes agency-enabled creators and creators already linked to an agency", async () => {
    User.findById.mockReturnValue(userSelect({ role: "creator", creatorStatus: "approved" }));
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: "u1", username: "jane", name: "Jane", avatar: null, agencyProfile: { enabled: false } },
            { _id: "u2", username: "jane2", name: "Jane Two", avatar: null, agencyProfile: { enabled: true } },
            { _id: "u3", username: "jane3", name: "Jane Three", avatar: null, agencyProfile: { enabled: false } },
          ]),
        }),
      }),
    });
    AgencyRelationship.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ subCreator: "u3" }]),
      }),
    });

    const res = makeResponse();
    await searchCreators({ userId: "me", query: { q: "jane" } }, res);

    expect(res.json).toHaveBeenCalledWith({
      results: [{ _id: "u1", username: "jane", name: "Jane", avatar: null }],
    });
  });
});
