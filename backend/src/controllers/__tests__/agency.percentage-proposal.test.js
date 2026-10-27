jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/AgencyRelationship.js", () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  exists: jest.fn(),
  find: jest.fn(),
}));

jest.mock("../../models/CoinTransaction.js", () => ({}));

// Fake session that just runs the transaction body inline (no real MongoDB
// server is available in unit tests). This still lets us assert that
// controller methods wrap their atomic writes in session.withTransaction().
const makeMockSession = () => ({
  withTransaction: jest.fn(async (fn) => fn()),
  endSession: jest.fn(async () => {}),
});

let mockSession;
jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  return {
    ...actual,
    startSession: jest.fn(() => Promise.resolve(mockSession)),
  };
});

const User = require("../../models/User.js");
const AgencyRelationship = require("../../models/AgencyRelationship.js");
const mongoose = require("mongoose");
const {
  updateSubCreatorPercentage,
  cancelPercentageChange,
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
    mockSession = makeMockSession();
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test("parent proposing a new percentage stores it as pending via an atomic CAS, without touching the agreed percentage", async () => {
    const relationship = makeRelationship();
    AgencyRelationship.findById.mockResolvedValue(relationship);
    User.findById.mockReturnValue(userSelect({ role: "creator" }));
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(
      makeRelationship({ pendingPercentage: 20, pendingPercentageProposedBy: "agency-1" })
    );

    const res = makeResponse();
    await updateSubCreatorPercentage({
      userId: "agency-1",
      params: { id: "rel-1" },
      body: { percentage: 20 },
    }, res);

    // The CAS filter must re-check status + the percentage we just read, closing the
    // find->mutate->save race window.
    expect(AgencyRelationship.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "rel-1", status: "active", percentage: 10 },
      {
        $set: expect.objectContaining({
          pendingPercentage: 20,
          pendingPercentageProposedBy: "agency-1",
        }),
      },
      { new: true }
    );
    expect(relationship.save).not.toHaveBeenCalled(); // no more read-modify-write
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  test("a concurrent change between the read and the CAS returns 409 instead of silently overwriting", async () => {
    const relationship = makeRelationship();
    AgencyRelationship.findById.mockResolvedValue(relationship);
    User.findById.mockReturnValue(userSelect({ role: "creator" }));
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(null); // lost the CAS race

    const res = makeResponse();
    await updateSubCreatorPercentage({
      userId: "agency-1",
      params: { id: "rel-1" },
      body: { percentage: 20 },
    }, res);

    expect(res.status).toHaveBeenCalledWith(409);
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
    expect(AgencyRelationship.findOneAndUpdate).not.toHaveBeenCalled();
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
    expect(AgencyRelationship.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("the proposer can cancel a stale/pending proposal before the sub-creator responds", async () => {
    const relationship = makeRelationship({ pendingPercentage: 20, pendingPercentageProposedBy: "agency-1" });
    AgencyRelationship.findById.mockResolvedValue(relationship);
    User.findById.mockReturnValue(userSelect({ role: "creator" }));
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(makeRelationship());

    const res = makeResponse();
    await cancelPercentageChange({ userId: "agency-1", params: { id: "rel-1" } }, res);

    expect(AgencyRelationship.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "rel-1", pendingPercentage: { $ne: null } },
      { $set: { pendingPercentage: null, pendingPercentageProposedBy: null, pendingPercentageProposedAt: null } },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  test("cancelling when nothing is pending returns 404 (idempotent)", async () => {
    const relationship = makeRelationship();
    AgencyRelationship.findById.mockResolvedValue(relationship);
    User.findById.mockReturnValue(userSelect({ role: "creator" }));
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(null);

    const res = makeResponse();
    await cancelPercentageChange({ userId: "agency-1", params: { id: "rel-1" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("sub-creator accepting the proposal applies it atomically in a transaction and records history", async () => {
    const updatedRelationship = makeRelationship({ percentage: 20, pendingPercentage: null });
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(updatedRelationship);

    const res = makeResponse();
    await acceptPercentageChange({ userId: "sub-1", body: {} }, res);

    expect(mongoose.startSession).toHaveBeenCalled();
    expect(mockSession.withTransaction).toHaveBeenCalled();
    const [filterArg, pipelineArg, optsArg] = AgencyRelationship.findOneAndUpdate.mock.calls[0];
    expect(filterArg).toEqual({ subCreator: "sub-1", status: "active", pendingPercentage: { $ne: null } });
    expect(Array.isArray(pipelineArg)).toBe(true); // aggregation-pipeline update, derives fields from the doc itself
    expect(optsArg).toEqual(expect.objectContaining({ new: true, session: mockSession }));
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "sub-1",
      { "agencyRelationship.parentCreatorPercentage": 20 },
      { session: mockSession }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ relationship: updatedRelationship }));
    expect(mockSession.endSession).toHaveBeenCalled();
  });

  test("accepting with a stale expectedPercentage (proposal changed underneath the client) returns 409, not a silent apply", async () => {
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(null);
    AgencyRelationship.exists.mockReturnValue({ session: jest.fn().mockResolvedValue(true) });

    const res = makeResponse();
    await acceptPercentageChange({ userId: "sub-1", body: { expectedPercentage: 20 } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test("a second concurrent accept call (double-accept) finds nothing pending and safely 404s", async () => {
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(null);

    const res = makeResponse();
    await acceptPercentageChange({ userId: "sub-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("a write conflict during accept is retried and eventually succeeds", async () => {
    const updatedRelationship = makeRelationship({ percentage: 20, pendingPercentage: null });
    const conflictErr = Object.assign(new Error("Write conflict"), { code: 112 });
    mockSession.withTransaction
      .mockImplementationOnce(async () => {
        throw conflictErr;
      })
      .mockImplementationOnce(async (fn) => fn());
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(updatedRelationship);

    const res = makeResponse();
    await acceptPercentageChange({ userId: "sub-1", body: {} }, res);

    expect(mockSession.withTransaction).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ relationship: updatedRelationship }));
  });

  test("sub-creator declining the proposal keeps the previous percentage and clears the proposal", async () => {
    const relationship = makeRelationship({ percentage: 10, pendingPercentage: null });
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(relationship);

    const res = makeResponse();
    await declinePercentageChange({ userId: "sub-1", body: {} }, res);

    expect(AgencyRelationship.findOneAndUpdate).toHaveBeenCalledWith(
      { subCreator: "sub-1", status: "active", pendingPercentage: { $ne: null } },
      { $set: { pendingPercentage: null, pendingPercentageProposedBy: null, pendingPercentageProposedAt: null } },
      { new: true }
    );
    expect(relationship.percentage).toBe(10);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test("declining without a pending proposal returns 404 (idempotent against double-decline)", async () => {
    AgencyRelationship.findOneAndUpdate.mockResolvedValue(null);

    const res = makeResponse();
    await declinePercentageChange({ userId: "sub-1", body: {} }, res);

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
