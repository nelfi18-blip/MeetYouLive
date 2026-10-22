"use strict";

// requestPayout — atomic transaction tests.
//
// IMPORTANT — these tests use a MOCKED mongoose session (`withTransaction`
// just invokes the callback inline) to exercise requestPayout's control
// flow in isolation. They verify that the CODE calls the right Mongo APIs
// with the right session/arguments in the right order (reserve → create →
// commit, or throw → no commit), and that HTTP responses/retry decisions
// match. They are NOT a substitute for a real MongoDB replica-set
// transaction test — a mock can't prove that an actual `abortTransaction`
// rolls back a previously-applied `$set` on the server, nor can it reproduce
// genuine write-conflict/commit-ambiguity timing between two real
// connections.
//
// A real-transaction test (using `mongodb-memory-server`'s
// `MongoMemoryReplSet`, which is required for multi-document transactions)
// was attempted for this change but could not run in this sandbox: starting
// it requires downloading a `mongod` binary from `fastdl.mongodb.org`, and
// this environment has no network access to that host (`ENOTFOUND`). The
// project's CI (`.github/workflows/ci.yml`) also does not provision a
// MongoDB service/replica-set for the backend job, so it cannot run such a
// test either as currently configured. See the PR description for the
// recommended follow-up (add a `mongodb` replica-set service, or
// `mongodb-memory-server` with binary caching, to CI) to close this gap.

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../models/Payout.js", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../models/Gift", () => ({}));
jest.mock("../../models/Live", () => ({}));
jest.mock("../../models/VideoCall", () => ({}));
jest.mock("../../models/CoinTransaction", () => ({}));
jest.mock("../../models/AgencyRelationship", () => ({}));

const mongoose = require("mongoose");
const User = require("../../models/User.js");
const Payout = require("../../models/Payout.js");
const { requestPayout } = require("../creator.controller.js");

function makeMockSession() {
  return {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(async () => {}),
  };
}

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

// `User.findById(id).select(...)` — used by requireApprovedCreatorHelper.
function selectOnly(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

function selectRejects(err) {
  return { select: jest.fn().mockRejectedValue(err) };
}

// `User.findById(id).select(...).session(session)` — used for the
// insufficient-balance diagnostic read inside the transaction.
function selectThenSession(value) {
  return { select: jest.fn(() => ({ session: jest.fn().mockResolvedValue(value) })) };
}

// `Payout.findOne(...).session(session)`.
function sessionQuery(value) {
  return { session: jest.fn().mockResolvedValue(value) };
}

// `Payout.findOne(...).sort(...)` — used outside a session to verify state
// after an ambiguous commit result.
function sortQuery(value) {
  return { sort: jest.fn().mockResolvedValue(value) };
}

const APPROVED_CREATOR = {
  _id: "creator-1",
  role: "creator",
  creatorStatus: "approved",
  earningsCoins: 250,
};

describe("requestPayout — control flow with a mocked mongoose session", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("success (simulated transaction): reserves the balance and creates the payout in one transaction call", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeMockSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
    Payout.create.mockResolvedValueOnce([
      {
        _id: "payout-1",
        amountCoins: 250,
        amountUsd: 25,
        method: "stripe",
        status: "pending",
        createdAt: new Date("2024-01-01"),
      },
    ]);

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "creator-1", earningsCoins: { $gte: 100 } },
      { $set: { earningsCoins: 0 } },
      expect.objectContaining({ new: false, session })
    );
    expect(Payout.create).toHaveBeenCalledWith(
      [expect.objectContaining({ creator: "creator-1", amountCoins: 250, amountUsd: 25, status: "pending" })],
      { session }
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        payout: expect.objectContaining({ _id: "payout-1", amountCoins: 250, amountUsd: 25 }),
      })
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test("Payout.create failure (simulated): the transaction callback rejects, so withTransaction never commits", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeMockSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
    Payout.create.mockRejectedValueOnce(new Error("insert failed"));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

    // NOTE: this only proves the controller's callback threw and the error
    // propagated to a 500 response — a real driver would additionally abort
    // the transaction server-side so the earlier `$set` never persists. That
    // server-side guarantee is NOT verified by this mock (see file header).
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test("insufficient balance: rejects with 400 and does not touch Payout", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR, earningsCoins: 40 }));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, minRequired: 100, current: 40 })
    );
    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(Payout.create).not.toHaveBeenCalled();
  });

  test("concurrency (simulated): a conditional update finding the balance already reserved returns 400", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeMockSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    // Simulates a concurrent winner having already zeroed earningsCoins by
    // making the conditional findOneAndUpdate match nothing — it does NOT
    // exercise two real overlapping sessions/connections (see file header).
    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockResolvedValueOnce(null);
    User.findById.mockReturnValueOnce(selectThenSession({ earningsCoins: 0 }));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, minRequired: 100, current: 0 })
    );
    expect(Payout.create).not.toHaveBeenCalled();
  });

  test("existing pending payout: rejects with 409 before any balance mutation", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeMockSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    const pending = {
      _id: "payout-pending",
      amountCoins: 150,
      status: "pending",
      createdAt: new Date("2024-01-01"),
    };
    Payout.findOne.mockReturnValueOnce(sessionQuery(pending));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        payout: expect.objectContaining({ _id: "payout-pending", status: "pending" }),
      })
    );
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("retries (simulated) on a pre-commit write-conflict and succeeds on the next attempt", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));

    const conflictErr = new Error("Write conflict");
    conflictErr.code = 112;
    const failingSession = {
      withTransaction: jest.fn(async () => {
        throw conflictErr;
      }),
      endSession: jest.fn(async () => {}),
    };
    const succeedingSession = makeMockSession();

    jest
      .spyOn(mongoose, "startSession")
      .mockResolvedValueOnce(failingSession)
      .mockResolvedValueOnce(succeedingSession);

    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
    Payout.create.mockResolvedValueOnce([
      { _id: "payout-2", amountCoins: 250, amountUsd: 25, method: "stripe", status: "pending", createdAt: new Date() },
    ]);

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

    expect(mongoose.startSession).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    expect(failingSession.endSession).toHaveBeenCalledTimes(1);
    expect(succeedingSession.endSession).toHaveBeenCalledTimes(1);
  });

  test("rollback (simulated): an unexpected error inside the transaction callback aborts without creating a Payout", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeMockSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockRejectedValueOnce(new Error("db down"));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(Payout.create).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test("controlled error handling: requireApprovedCreatorHelper throwing returns 500, not an unhandled rejection", async () => {
    User.findById.mockReturnValueOnce(selectRejects(new Error("User.findById blew up")));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test("controlled error handling: mongoose.startSession throwing returns 500, not an unhandled rejection", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    jest.spyOn(mongoose, "startSession").mockRejectedValueOnce(new Error("no connection"));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(Payout.findOne).not.toHaveBeenCalled();
  });

  describe("UnknownTransactionCommitResult — ambiguous commit outcome", () => {
    function makeAmbiguousError() {
      const err = new Error("commit result unknown");
      err.hasErrorLabel = (label) => label === "UnknownTransactionCommitResult";
      return err;
    }

    test("never auto-retries the mutation; verifies state and reports the existing payout as success when the commit actually went through", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);
      session.withTransaction = jest.fn(async () => {
        throw makeAmbiguousError();
      });

      // The transaction actually committed on the server even though the
      // client couldn't confirm it — a subsequent read finds the payout.
      const committedPayout = {
        _id: "payout-committed",
        amountCoins: 250,
        amountUsd: 25,
        method: "stripe",
        status: "pending",
        createdAt: new Date("2024-01-01"),
      };
      Payout.findOne.mockReturnValueOnce(sortQuery(committedPayout));

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

      // Exactly ONE session/transaction attempt — no blind retry.
      expect(mongoose.startSession).toHaveBeenCalledTimes(1);
      expect(User.findOneAndUpdate).not.toHaveBeenCalledTimes(2);
      expect(Payout.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ creator: "creator-1", status: { $in: ["pending", "approved"] } })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, payout: expect.objectContaining({ _id: "payout-committed" }) })
      );
    });

    test("never auto-retries the mutation; reports an ambiguous 503 when verification finds no payout", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);
      session.withTransaction = jest.fn(async () => {
        throw makeAmbiguousError();
      });

      Payout.findOne.mockReturnValueOnce(sortQuery(null));

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

      expect(mongoose.startSession).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    });

    test("does not treat a dual-labeled (Transient + UnknownCommitResult) error as a safe pre-commit retry", async () => {
      // A commit attempt can fail with BOTH labels at once; this must be
      // treated as ambiguous (verify, don't retry), never as a safe
      // pre-commit retry — otherwise a second transaction could run after
      // the first one actually committed, creating a duplicate payout.
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

      const dualLabelErr = new Error("commit result unknown");
      dualLabelErr.hasErrorLabel = (label) =>
        label === "TransientTransactionError" || label === "UnknownTransactionCommitResult";
      session.withTransaction = jest.fn(async () => {
        throw dualLabelErr;
      });

      Payout.findOne.mockReturnValueOnce(sortQuery(null));

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: {} }, res);

      expect(mongoose.startSession).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });
});

describe("requestPayout — real MongoDB transaction coverage (documented limitation)", () => {
  test.skip(
    "end-to-end with a real replica-set transaction (mongodb-memory-server) — " +
      "SKIPPED: this sandbox has no network access to fastdl.mongodb.org to download " +
      "a mongod binary (verified: MongoMemoryReplSet.create() fails with ENOTFOUND), " +
      "and .github/workflows/ci.yml does not provision a MongoDB replica-set service " +
      "for the backend job either. Recommended follow-up: add a `mongo` replica-set " +
      "service (or a pre-cached mongodb-memory-server binary) to CI, then un-skip this " +
      "test to assert that abortTransaction truly rolls back earningsCoins on a real " +
      "server, and that two concurrent real sessions never both reserve the balance.",
    () => {}
  );
});
