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
//
// This also means the `requestId` unique index added to the Payout model
// (see models/Payout.js) is NOT verified end-to-end here: these tests only
// prove the CONTROLLER reacts correctly to a duplicate-key error shaped
// like MongoDB's E11000 response — they cannot prove the index itself
// rejects a second real insert with the same requestId. That server-side
// guarantee needs the same real-replica-set follow-up described above.

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

// `Payout.findOne({ requestId })` — a plain (non-chained) lookup used to
// verify the outcome of THIS request by its unique requestId, both after an
// ambiguous commit and after a duplicate-key error on retry.
function byRequestId(value) {
  return Promise.resolve(value);
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
      [
        expect.objectContaining({
          creator: "creator-1",
          requestId: expect.any(String),
          amountCoins: 250,
          amountUsd: 25,
          status: "pending",
        }),
      ],
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

    test("correct match: verifies state by THIS request's unique requestId and reports the existing payout as success when the commit actually went through", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);
      session.withTransaction = jest.fn(async () => {
        throw makeAmbiguousError();
      });

      // The transaction actually committed on the server even though the
      // client couldn't confirm it — a subsequent lookup BY THIS REQUEST'S
      // requestId (not by creator+status) finds the payout it created.
      const committedPayout = {
        _id: "payout-committed",
        amountCoins: 250,
        amountUsd: 25,
        method: "stripe",
        status: "pending",
        createdAt: new Date("2024-01-01"),
      };
      Payout.findOne.mockReturnValueOnce(byRequestId(committedPayout));

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

      // Exactly ONE session/transaction attempt — no blind retry.
      expect(mongoose.startSession).toHaveBeenCalledTimes(1);
      expect(User.findOneAndUpdate).not.toHaveBeenCalledTimes(2);
      // The lookup must be keyed on the unique requestId, never on
      // creator+status (which could match an unrelated payout).
      const lookupArg = Payout.findOne.mock.calls[0][0];
      expect(lookupArg).toHaveProperty("requestId");
      expect(typeof lookupArg.requestId).toBe("string");
      expect(lookupArg).not.toHaveProperty("creator");
      expect(lookupArg).not.toHaveProperty("status");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, payout: expect.objectContaining({ _id: "payout-committed" }) })
      );
    });

    test("unrelated prior payout: an unrelated pending payout for the same creator is NEVER mistaken for this request's success", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);
      session.withTransaction = jest.fn(async () => {
        throw makeAmbiguousError();
      });

      // There IS a pending payout for this creator (e.g. from an earlier,
      // unrelated request) — but it does not carry THIS request's
      // requestId, so the lookup (mocked to simulate a requestId-scoped
      // query finding nothing) must still report the ambiguity instead of
      // treating that unrelated payout as proof this request succeeded.
      Payout.findOne.mockReturnValueOnce(byRequestId(null));

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
      const lookupArg = Payout.findOne.mock.calls[0][0];
      expect(lookupArg).not.toHaveProperty("creator");
      expect(lookupArg).not.toHaveProperty("status");
    });

    test("ambiguous commit: never auto-retries the mutation; reports an ambiguous 503 when verification finds no payout", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);
      session.withTransaction = jest.fn(async () => {
        throw makeAmbiguousError();
      });

      Payout.findOne.mockReturnValueOnce(byRequestId(null));

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

      Payout.findOne.mockReturnValueOnce(byRequestId(null));

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: {} }, res);

      expect(mongoose.startSession).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("duplicate requestId retry — unique index protects against double payouts", () => {
    function makeDuplicateKeyError() {
      const err = new Error(
        "E11000 duplicate key error collection: meetyoulive.payouts index: requestId_1 dup key: { requestId: \"abc\" }"
      );
      err.code = 11000;
      err.keyPattern = { requestId: 1 };
      err.keyValue = { requestId: "abc" };
      return err;
    }

    test("duplicate retry: Payout.create hitting the unique requestId index resolves as the same idempotent success, not a 500", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

      Payout.findOne
        // Inside the transaction: no existing pending payout blocks the attempt.
        .mockReturnValueOnce(sessionQuery(null))
        // After the duplicate-key error: the earlier attempt's Payout (same
        // requestId) is found and returned idempotently.
        .mockReturnValueOnce(
          byRequestId({
            _id: "payout-already-created",
            amountCoins: 250,
            amountUsd: 25,
            method: "stripe",
            status: "pending",
            createdAt: new Date("2024-01-01"),
          })
        );

      User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
      Payout.create.mockRejectedValueOnce(makeDuplicateKeyError());

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

      // No blind retry of the whole transaction — exactly one attempt.
      expect(mongoose.startSession).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          payout: expect.objectContaining({ _id: "payout-already-created" }),
        })
      );
    });

    test("duplicate retry with no recoverable document: falls back to the ambiguous 503 rather than a 500", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

      Payout.findOne
        .mockReturnValueOnce(sessionQuery(null))
        .mockReturnValueOnce(byRequestId(null));

      User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
      Payout.create.mockRejectedValueOnce(makeDuplicateKeyError());

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
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
      "server, and that two concurrent real sessions never both reserve the balance, " +
      "and that the unique index on Payout.requestId truly rejects a second real " +
      "insert carrying the same requestId.",
    () => {}
  );
});
