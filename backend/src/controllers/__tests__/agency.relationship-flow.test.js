jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/AgencyRelationship.js", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

jest.mock("../../models/CoinTransaction.js", () => ({}));

const User = require("../../models/User.js");
const AgencyRelationship = require("../../models/AgencyRelationship.js");
const {
  acceptRelationship,
  declineRelationship,
  getMyRelationship,
  inviteSubCreator,
} = require("../agency.controller.js");
const { finalizeIfReady } = require("../../services/agencyRelationshipState.service.js");

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

const userSelect = (user) => ({
  select: jest.fn().mockResolvedValue(user),
});

const findOnePopulate = (relationship) => ({
  populate: jest.fn().mockResolvedValue(relationship),
});

const makeRelationship = (overrides = {}) => ({
  _id: "rel-1",
  parentCreator: "agency-1",
  subCreator: "sub-1",
  percentage: 10,
  status: "pending",
  approvedAt: null,
  subCreatorAgreed: false,
  save: jest.fn(async function save() {
    return this;
  }),
  populate: jest.fn(async function populate() {
    return this;
  }),
  ...overrides,
});

describe("agency relationship pending flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test("invited user can see a pending relationship without a User snapshot", async () => {
    const relationship = makeRelationship();
    User.findById.mockReturnValue(userSelect({ _id: "sub-1", agencyRelationship: {} }));
    AgencyRelationship.findOne.mockReturnValue(findOnePopulate(relationship));

    const res = makeResponse();
    await getMyRelationship({ userId: "sub-1" }, res);

    expect(AgencyRelationship.findOne).toHaveBeenCalledWith({
      subCreator: "sub-1",
      status: { $in: ["pending", "active", "suspended"] },
    });
    expect(res.json).toHaveBeenCalledWith({ relationship });
  });

  test("non-invited user cannot accept or modify another user's relationship", async () => {
    AgencyRelationship.findOne.mockResolvedValue(null);

    const res = makeResponse();
    await acceptRelationship({ userId: "other-user" }, res);

    expect(AgencyRelationship.findOne).toHaveBeenCalledWith({
      subCreator: "other-user",
      status: { $in: ["pending", "active"] },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test("valid subCreator acceptance records agreement and waits for admin approval", async () => {
    const relationship = makeRelationship();
    AgencyRelationship.findOne.mockResolvedValue(relationship);

    const res = makeResponse();
    await acceptRelationship({ userId: "sub-1" }, res);

    expect(relationship.subCreatorAgreed).toBe(true);
    expect(relationship.subCreatorAgreedAt).toBeInstanceOf(Date);
    expect(relationship.status).toBe("pending");
    expect(relationship.save).toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ relationship }));
  });

  test("valid subCreator acceptance after admin approval activates and syncs the snapshot", async () => {
    const relationship = makeRelationship({ approvedAt: new Date("2026-01-01T00:00:00.000Z") });
    AgencyRelationship.findOne.mockResolvedValue(relationship);

    const res = makeResponse();
    await acceptRelationship({ userId: "sub-1" }, res);

    expect(relationship.status).toBe("active");
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("sub-1", expect.objectContaining({
      "agencyRelationship.parentCreatorId": "agency-1",
      "agencyRelationship.parentCreatorPercentage": 10,
      "agencyRelationship.status": "active",
    }));
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("agency-1", {
      $inc: { "agencyProfile.subCreatorsCount": 1 },
    });
  });

  test("admin approval before subCreator acceptance does not activate or create a ghost snapshot", async () => {
    const relationship = makeRelationship({
      approvedBy: "admin-1",
      approvedAt: new Date("2026-01-01T00:00:00.000Z"),
      subCreatorAgreed: false,
    });

    const activated = await finalizeIfReady(relationship);

    expect(activated).toBe(false);
    expect(relationship.status).toBe("pending");
    expect(relationship.save).toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test("valid subCreator rejection removes the invitation and clears any active snapshot", async () => {
    const relationship = makeRelationship({ status: "active" });
    AgencyRelationship.findOne.mockResolvedValue(relationship);

    const res = makeResponse();
    await declineRelationship({ userId: "sub-1" }, res);

    expect(relationship.status).toBe("removed");
    expect(relationship.removedAt).toBeInstanceOf(Date);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("sub-1", expect.objectContaining({
      "agencyRelationship.parentCreatorId": null,
      "agencyRelationship.status": "removed",
    }));
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("agency-1", {
      $inc: { "agencyProfile.subCreatorsCount": -1 },
    });
  });

  test("duplicate pending or active agency relationship is rejected on invite", async () => {
    User.findById
      .mockResolvedValueOnce({
        _id: "agency-1",
        role: "creator",
        creatorStatus: "approved",
        agencyRelationship: {},
      })
      .mockResolvedValueOnce({
        _id: "sub-1",
        role: "creator",
        creatorStatus: "approved",
        agencyProfile: {},
      });
    AgencyRelationship.findOne.mockResolvedValue(makeRelationship());

    const res = makeResponse();
    await inviteSubCreator({
      userId: "agency-1",
      body: { subCreatorId: "507f1f77bcf86cd799439011", percentage: 10 },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(AgencyRelationship.create).not.toHaveBeenCalled();
  });

  test("removed relationship is not returned as an active relationship", async () => {
    User.findById.mockReturnValue(userSelect({ _id: "sub-1" }));
    AgencyRelationship.findOne.mockReturnValue(findOnePopulate(null));

    const res = makeResponse();
    await getMyRelationship({ userId: "sub-1" }, res);

    expect(AgencyRelationship.findOne.mock.calls[0][0].status.$in).not.toContain("removed");
    expect(res.json).toHaveBeenCalledWith({ relationship: null });
  });
});
