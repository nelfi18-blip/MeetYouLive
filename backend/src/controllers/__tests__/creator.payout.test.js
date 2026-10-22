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

    test("correct match: verifies state by THIS request's unique requestId scoped to this creator, and reports the existing payout as success when the commit actually went through", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);
      session.withTransaction = jest.fn(async () => {
        throw makeAmbiguousError();
      });

      // The transaction actually committed on the server even though the
      // client couldn't confirm it — a subsequent lookup BY THIS REQUEST'S
      // requestId, scoped to this creator (not by creator+status alone),
      // finds the payout it created.
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
      // The lookup must be keyed on requestId AND creator — never on
      // status, which could match an unrelated payout.
      const lookupArg = Payout.findOne.mock.calls[0][0];
      expect(lookupArg).toHaveProperty("requestId");
      expect(typeof lookupArg.requestId).toBe("string");
      expect(lookupArg).toHaveProperty("creator", "creator-1");
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
      // requestId, so the lookup (mocked to simulate a requestId+creator
      // scoped query finding nothing) must still report the ambiguity
      // instead of treating that unrelated payout as proof this request
      // succeeded.
      Payout.findOne.mockReturnValueOnce(byRequestId(null));

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
      const lookupArg = Payout.findOne.mock.calls[0][0];
      expect(lookupArg).toHaveProperty("creator", "creator-1");
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

    test("duplicate retry (own request): Payout.create hitting the unique requestId index resolves as the same idempotent success, not a 500", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

      Payout.findOne
        // Inside the transaction: no existing pending payout blocks the attempt.
        .mockReturnValueOnce(sessionQuery(null))
        // After the duplicate-key error: the earlier attempt's Payout (same
        // requestId, same creator) is found and returned idempotently.
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
      // The post-duplicate-key lookup must be scoped to THIS creator too.
      const lookupArg = Payout.findOne.mock.calls[1][0];
      expect(lookupArg).toHaveProperty("creator", "creator-1");
    });

    test("duplicate retry (reused key belonging to another creator): responds with a generic conflict, never a 500 and never leaking the other creator's payout", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

      // The requestId collides with a payout owned by a DIFFERENT creator.
      // Because the recovery lookup filters by `creator: "creator-1"`, it
      // finds nothing — it must NEVER be able to see the other creator's
      // document, and the response must not describe who owns it.
      Payout.findOne
        .mockReturnValueOnce(sessionQuery(null))
        .mockReturnValueOnce(byRequestId(null));

      User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
      Payout.create.mockRejectedValueOnce(makeDuplicateKeyError());

      const res = makeRes();
      await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

      expect(res.status).toHaveBeenCalledWith(409);
      const payload = res.json.mock.calls[res.json.mock.calls.length - 1][0];
      expect(payload.ok).toBe(false);
      expect(JSON.stringify(payload)).not.toMatch(/payout-|_id/);
    });
  });

  describe("idempotency-key replay — repeated HTTP requests never create a second payout", () => {
    test("repeated request: a fresh HTTP call reusing the same Idempotency-Key returns the SAME payout without touching the balance or creating a new document", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));

      const existingPayout = {
        _id: "payout-from-first-call",
        amountCoins: 250,
        amountUsd: 25,
        method: "stripe",
        status: "pending",
        createdAt: new Date("2024-01-01"),
      };
      Payout.findOne.mockReturnValueOnce(byRequestId(existingPayout));

      const res = makeRes();
      await requestPayout(
        {
          userId: "creator-1",
          body: { method: "stripe" },
          headers: { "idempotency-key": "retry-key-0001" },
        },
        res
      );

      // Short-circuited before ever opening a session/transaction.
      expect(mongoose.startSession).not.toHaveBeenCalled();
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(Payout.create).not.toHaveBeenCalled();
      expect(Payout.findOne).toHaveBeenCalledWith({
        requestId: "retry-key-0001",
        creator: "creator-1",
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          payout: expect.objectContaining({ _id: "payout-from-first-call" }),
        })
      );
    });

    test("first request with a client-supplied key: no existing payout is found, so the key is used to tag the newly created Payout", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

      Payout.findOne
        // Pre-transaction replay check: nothing found for this key yet.
        .mockReturnValueOnce(byRequestId(null))
        // Inside the transaction: no existing pending payout.
        .mockReturnValueOnce(sessionQuery(null));
      User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
      Payout.create.mockResolvedValueOnce([
        { _id: "payout-new", amountCoins: 250, amountUsd: 25, method: "stripe", status: "pending", createdAt: new Date() },
      ]);

      const res = makeRes();
      await requestPayout(
        {
          userId: "creator-1",
          body: { method: "stripe" },
          headers: { "idempotency-key": "client-key-abc12345" },
        },
        res
      );

      expect(Payout.create).toHaveBeenCalledWith(
        [expect.objectContaining({ requestId: "client-key-abc12345" })],
        { session }
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    test("key reused by another creator (no prior success for THIS creator): proceeds normally and does not short-circuit with someone else's payout", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
      const session = makeMockSession();
      jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

      // The key exists in the DB, but for a DIFFERENT creator — the
      // creator-scoped replay lookup must find nothing for "creator-1".
      Payout.findOne
        .mockReturnValueOnce(byRequestId(null))
        .mockReturnValueOnce(sessionQuery(null));
      User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
      Payout.create.mockResolvedValueOnce([
        { _id: "payout-new-2", amountCoins: 250, amountUsd: 25, method: "stripe", status: "pending", createdAt: new Date() },
      ]);

      const res = makeRes();
      await requestPayout(
        {
          userId: "creator-1",
          body: { method: "stripe" },
          headers: { "idempotency-key": "someone-elses-key" },
        },
        res
      );

      expect(Payout.findOne).toHaveBeenNthCalledWith(1, {
        requestId: "someone-elses-key",
        creator: "creator-1",
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    test("malformed client idempotency key is rejected with 400 before touching the database", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));

      const res = makeRes();
      await requestPayout(
        {
          userId: "creator-1",
          body: { method: "stripe" },
          headers: { "idempotency-key": "short" },
        },
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findOne).not.toHaveBeenCalled();
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });

    test("object/array idempotency key (potential NoSQL injection attempt) is rejected with 400", async () => {
      User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));

      const res = makeRes();
      await requestPayout(
        {
          userId: "creator-1",
          body: { method: "stripe", idempotencyKey: { $ne: null } },
        },
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findOne).not.toHaveBeenCalled();
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });
  });
});

describe("Payout model — requestId schema (no mock; real mongoose schema)", () => {
  // These tests load the REAL Payout model (not the jest.mock from the
  // describe block above) to verify the schema definition itself, without
  // needing a live MongoDB connection.
  let RealPayout;

  beforeAll(() => {
    jest.resetModules();
    jest.unmock("../../models/Payout.js");
    RealPayout = require("../../models/Payout.js");
  });

  test("historical documents: a document built without requestId leaves the field completely unset (not null)", () => {
    // Documents created before this field existed have no requestId at all.
    // This simulates that shape and asserts our schema does NOT inject a
    // `null` default, which would make every such document collide under
    // the unique index (sparse only excludes a field that is ABSENT, not
    // one explicitly set to null).
    const doc = new RealPayout({
      creator: new mongoose.Types.ObjectId(),
      amountCoins: 150,
    });

    expect(doc.requestId).toBeUndefined();
    const obj = doc.toObject();
    expect(Object.prototype.hasOwnProperty.call(obj, "requestId")).toBe(false);
  });

  test("unique index: requestId is declared unique + sparse, with no default value", () => {
    const path = RealPayout.schema.path("requestId");
    expect(path).toBeDefined();
    expect(path.options.unique).toBe(true);
    expect(path.options.sparse).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(path.options, "default")).toBe(false);

    const indexes = RealPayout.schema.indexes();
    const requestIdIndex = indexes.find(([fields]) => Object.prototype.hasOwnProperty.call(fields, "requestId"));
    expect(requestIdIndex).toBeDefined();
    const [, indexOptions] = requestIdIndex;
    expect(indexOptions.unique).toBe(true);
    expect(indexOptions.sparse).toBe(true);
  });

  test("a document that DOES set requestId stores it as a plain string, not null", () => {
    const doc = new RealPayout({
      creator: new mongoose.Types.ObjectId(),
      amountCoins: 150,
      requestId: "abc-123-generated-uuid",
    });

    expect(doc.requestId).toBe("abc-123-generated-uuid");
  });

  // NOTE: the assertions above prove the SCHEMA is configured correctly
  // (no spurious null default, unique+sparse index declared). They cannot
  // prove MongoDB itself enforces the uniqueness constraint across two
  // real inserted documents, or that it genuinely treats "field absent" and
  // "field explicitly null" differently at the storage-engine level — that
  // requires a real server and is covered by the documented, currently
  // skipped `mongodb-memory-server` test below.
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
      "insert carrying the same requestId, AND that inserting two historical-style " +
      "documents (requestId absent) alongside it never collide under the sparse index.",
    () => {}
  );
});
