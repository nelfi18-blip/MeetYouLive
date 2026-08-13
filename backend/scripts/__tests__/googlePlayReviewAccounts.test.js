"use strict";

const {
  REVIEWER_EMAIL,
  DEMO_CREATOR_EMAIL,
  REVIEW_COINS_AMOUNT,
  DEMO_CREATOR_PRICE_PER_MINUTE,
  assertHardcodedEmail,
  prepareReviewerAccount,
  revertReviewerAccount,
  prepareDemoCreatorAccount,
  revertDemoCreatorAccount,
} = require("../lib/googlePlayReviewAccounts.js");

// ─── Lightweight in-memory fakes (no real DB / no new dependencies) ────────

function createFakeUserModel(seedDocs = []) {
  const store = new Map();

  class FakeUser {
    constructor(data) {
      Object.assign(this, data);
    }
    async save() {
      store.set(this.email, this);
      return this;
    }
  }

  seedDocs.forEach((d) => store.set(d.email, new FakeUser(d)));

  FakeUser.findOne = jest.fn((filter) => {
    const doc = store.get(filter.email) || null;
    return {
      select: () => Promise.resolve(doc),
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
  });

  return { FakeUser, store };
}

function createFakePrepModel() {
  const docs = [];

  class FakePrep {
    constructor(data) {
      Object.assign(this, data);
    }
    async save() {
      return this;
    }
  }

  function matches(doc, filter) {
    return Object.entries(filter).every(([key, value]) => (doc[key] ?? null) === value);
  }

  FakePrep.findOne = jest.fn((filter) => {
    const doc = docs.find((d) => matches(d, filter)) || null;
    return Promise.resolve(doc);
  });

  FakePrep.create = jest.fn(async (data) => {
    const doc = new FakePrep(data);
    docs.push(doc);
    return doc;
  });

  return { FakePrep, docs };
}

// ─── assertHardcodedEmail ───────────────────────────────────────────────────

describe("assertHardcodedEmail", () => {
  it("allows only the two hardcoded review accounts", () => {
    expect(() => assertHardcodedEmail(REVIEWER_EMAIL)).not.toThrow();
    expect(() => assertHardcodedEmail(DEMO_CREATOR_EMAIL)).not.toThrow();
  });

  it("rejects any other email, including a normal user's", () => {
    expect(() => assertHardcodedEmail("random.user@example.com")).toThrow(
      /non-whitelisted/
    );
  });
});

// ─── prepareReviewerAccount / revertReviewerAccount ────────────────────────

describe("prepareReviewerAccount", () => {
  it("returns not found when the reviewer account does not exist", async () => {
    const { FakeUser } = createFakeUserModel([]);
    const { FakePrep } = createFakePrepModel();

    const result = await prepareReviewerAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: true,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_found");
  });

  it("dry-run makes no writes and reports the original balance", async () => {
    const { FakeUser, store } = createFakeUserModel([
      { email: REVIEWER_EMAIL, coins: 137 },
    ]);
    const { FakePrep, docs } = createFakePrepModel();

    const result = await prepareReviewerAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: false,
    });

    expect(result.dryRun).toBe(true);
    expect(result.previousCoins).toBe(137);
    expect(result.targetCoins).toBe(REVIEW_COINS_AMOUNT);
    expect(store.get(REVIEWER_EMAIL).coins).toBe(137); // unchanged
    expect(docs.length).toBe(0); // no snapshot persisted
  });

  it("applies the fixed balance and snapshots the ORIGINAL (non-zero) balance", async () => {
    const { FakeUser, store } = createFakeUserModel([
      { email: REVIEWER_EMAIL, coins: 250 },
    ]);
    const { FakePrep, docs } = createFakePrepModel();

    const result = await prepareReviewerAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: true,
    });

    expect(result.ok).toBe(true);
    expect(result.previousCoins).toBe(250);
    expect(store.get(REVIEWER_EMAIL).coins).toBe(REVIEW_COINS_AMOUNT);
    expect(docs).toHaveLength(1);
    expect(docs[0].previousState.coins).toBe(250);
    expect(docs[0].accountType).toBe("reviewer");
  });

  it("is idempotent: re-running --execute never overwrites the original snapshot", async () => {
    const { FakeUser, store } = createFakeUserModel([
      { email: REVIEWER_EMAIL, coins: 250 },
    ]);
    const { FakePrep, docs } = createFakePrepModel();

    await prepareReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });
    // Simulate coins drifting (e.g. manual admin edit) then re-running the script.
    store.get(REVIEWER_EMAIL).coins = 999;
    const second = await prepareReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });

    expect(second.alreadyApplied).toBe(true);
    expect(second.previousCoins).toBe(250); // original snapshot preserved
    expect(store.get(REVIEWER_EMAIL).coins).toBe(REVIEW_COINS_AMOUNT); // corrected back
    expect(docs).toHaveLength(1); // no duplicate snapshot
  });
});

describe("revertReviewerAccount", () => {
  it("does nothing and reports not_applied when never prepared", async () => {
    const { FakeUser } = createFakeUserModel([{ email: REVIEWER_EMAIL, coins: 40 }]);
    const { FakePrep } = createFakePrepModel();

    const result = await revertReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_applied");
  });

  it("restores the ORIGINAL non-zero balance, not 0", async () => {
    const { FakeUser, store } = createFakeUserModel([{ email: REVIEWER_EMAIL, coins: 320 }]);
    const { FakePrep } = createFakePrepModel();

    await prepareReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });
    expect(store.get(REVIEWER_EMAIL).coins).toBe(REVIEW_COINS_AMOUNT);

    const revertResult = await revertReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });

    expect(revertResult.ok).toBe(true);
    expect(revertResult.previousCoins).toBe(320);
    expect(store.get(REVIEWER_EMAIL).coins).toBe(320);
  });

  it("dry-run revert makes no writes", async () => {
    const { FakeUser, store } = createFakeUserModel([{ email: REVIEWER_EMAIL, coins: 320 }]);
    const { FakePrep } = createFakePrepModel();

    await prepareReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });
    await revertReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: false });

    expect(store.get(REVIEWER_EMAIL).coins).toBe(REVIEW_COINS_AMOUNT); // still prepared, not reverted
  });

  it("refuses to revert (never falls back to 0) if the snapshot is corrupted/missing", async () => {
    const { FakeUser } = createFakeUserModel([{ email: REVIEWER_EMAIL, coins: REVIEW_COINS_AMOUNT }]);
    const { FakePrep, docs } = createFakePrepModel();
    // Simulate a corrupted snapshot (missing previousState.coins).
    docs.push({
      email: REVIEWER_EMAIL,
      accountType: "reviewer",
      previousState: {},
      revertedAt: null,
    });

    await expect(
      revertReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true })
    ).rejects.toThrow(/Corrupted or missing prep snapshot/);
  });
});

// ─── prepareDemoCreatorAccount / revertDemoCreatorAccount ──────────────────

describe("prepareDemoCreatorAccount", () => {
  it("creates the demo creator when it does not exist yet", async () => {
    const { FakeUser, store } = createFakeUserModel([]);
    const { FakePrep, docs } = createFakePrepModel();

    const result = await prepareDemoCreatorAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: true,
      hashPassword: async () => "hashed-review-password",
    });

    expect(result.created).toBe(true);
    expect(result.existedBefore).toBe(false);
    const created = store.get(DEMO_CREATOR_EMAIL);
    expect(created.role).toBe("creator");
    expect(created.creatorStatus).toBe("approved");
    expect(created.emailVerified).toBe(true);
    expect(created.isBlocked).toBe(false);
    expect(created.creatorProfile.pricePerMinute).toBe(DEMO_CREATOR_PRICE_PER_MINUTE);
    expect(created.creatorProfile.privateCallEnabled).toBe(true);
    expect(created.creatorProfile.liveEnabled).toBe(true);
    expect(created.creatorProfile.giftsEnabled).toBe(true);
    expect(created.creatorProfile.exclusiveContentEnabled).toBe(true);
    expect(created.password).toBe("hashed-review-password");
    expect(docs[0].existedBefore).toBe(false);
  });

  it("upgrades an existing account and snapshots its previous state", async () => {
    const { FakeUser, store } = createFakeUserModel([
      { email: DEMO_CREATOR_EMAIL, role: "user", creatorStatus: "none", creatorProfile: { pricePerMinute: 0 } },
    ]);
    const { FakePrep, docs } = createFakePrepModel();

    const result = await prepareDemoCreatorAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: true,
      hashPassword: async () => "unused",
    });

    expect(result.existedBefore).toBe(true);
    expect(store.get(DEMO_CREATOR_EMAIL).role).toBe("creator");
    expect(store.get(DEMO_CREATOR_EMAIL).creatorStatus).toBe("approved");
    expect(store.get(DEMO_CREATOR_EMAIL).creatorProfile.privateCallEnabled).toBe(true);
    expect(docs[0].previousState).toEqual({
      role: "user",
      creatorStatus: "none",
      isBlocked: undefined,
      isSuspended: undefined,
      emailVerified: undefined,
      pricePerMinute: 0,
      privateCallEnabled: false,
      liveEnabled: true,
      giftsEnabled: true,
      exclusiveContentEnabled: false,
    });
  });

  it("dry-run makes no writes", async () => {
    const { FakeUser, store } = createFakeUserModel([]);
    const { FakePrep, docs } = createFakePrepModel();

    await prepareDemoCreatorAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: false,
      hashPassword: async () => "unused",
    });

    expect(store.has(DEMO_CREATOR_EMAIL)).toBe(false);
    expect(docs).toHaveLength(0);
  });
});

describe("revertDemoCreatorAccount", () => {
  it("suspends (does not delete) an account the script created", async () => {
    const { FakeUser, store } = createFakeUserModel([]);
    const { FakePrep } = createFakePrepModel();

    await prepareDemoCreatorAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: true,
      hashPassword: async () => "hashed",
    });

    const revertResult = await revertDemoCreatorAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });

    expect(revertResult.ok).toBe(true);
    expect(revertResult.existedBefore).toBe(false);
    // Still present in the store (not deleted), just deactivated.
    expect(store.has(DEMO_CREATOR_EMAIL)).toBe(true);
    expect(store.get(DEMO_CREATOR_EMAIL).creatorStatus).toBe("suspended");
  });

  it("restores prior role/creatorStatus for an account that existed before", async () => {
    const { FakeUser, store } = createFakeUserModel([
      { email: DEMO_CREATOR_EMAIL, role: "user", creatorStatus: "none", creatorProfile: { pricePerMinute: 0 } },
    ]);
    const { FakePrep } = createFakePrepModel();

    await prepareDemoCreatorAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: true,
      hashPassword: async () => "unused",
    });

    const revertResult = await revertDemoCreatorAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });

    expect(revertResult.existedBefore).toBe(true);
    expect(store.get(DEMO_CREATOR_EMAIL).role).toBe("user");
    expect(store.get(DEMO_CREATOR_EMAIL).creatorStatus).toBe("none");
  });

  it("reports not_applied when nothing was ever prepared", async () => {
    const { FakeUser } = createFakeUserModel([]);
    const { FakePrep } = createFakePrepModel();

    const result = await revertDemoCreatorAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_applied");
  });
});

// ─── Full cycle: prepare -> revert -> prepare (no uniqueness violation) ────

describe("full prepare -> revert -> prepare cycle", () => {
  it("reviewer: a second prepare after a revert creates a fresh, correct snapshot", async () => {
    const { FakeUser, store } = createFakeUserModel([{ email: REVIEWER_EMAIL, coins: 100 }]);
    const { FakePrep, docs } = createFakePrepModel();

    // Cycle 1: prepare -> revert.
    await prepareReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });
    expect(store.get(REVIEWER_EMAIL).coins).toBe(REVIEW_COINS_AMOUNT);
    await revertReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });
    expect(store.get(REVIEWER_EMAIL).coins).toBe(100);

    // Between cycles the reviewer's balance changed (e.g. spent during
    // review, or manually adjusted) — the NEXT prepare must snapshot
    // *this* balance, not the one from cycle 1.
    store.get(REVIEWER_EMAIL).coins = 42;

    // Cycle 2: prepare again. Must not throw / must not reuse the reverted doc.
    const second = await prepareReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });

    expect(second.ok).toBe(true);
    expect(second.alreadyApplied).toBe(false);
    expect(second.previousCoins).toBe(42);
    expect(store.get(REVIEWER_EMAIL).coins).toBe(REVIEW_COINS_AMOUNT);

    // Two prep documents now exist for the reviewer: one reverted (cycle 1)
    // and one active (cycle 2) — exactly one of them is active at a time,
    // which is what the partial unique index on the real model enforces.
    const reviewerDocs = docs.filter((d) => d.email === REVIEWER_EMAIL && d.accountType === "reviewer");
    expect(reviewerDocs).toHaveLength(2);
    expect(reviewerDocs.filter((d) => d.revertedAt === null || d.revertedAt === undefined)).toHaveLength(1);

    // Cycle 2 can be reverted too, restoring the cycle-2 snapshot (42), not cycle 1's (100).
    const secondRevert = await revertReviewerAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });
    expect(secondRevert.previousCoins).toBe(42);
    expect(store.get(REVIEWER_EMAIL).coins).toBe(42);
  });

  it("demo creator: a second prepare after a revert creates a fresh snapshot without a duplicate-key error", async () => {
    const { FakeUser, store } = createFakeUserModel([]);
    const { FakePrep, docs } = createFakePrepModel();

    // Cycle 1: prepare (creates the account) -> revert (suspends it).
    await prepareDemoCreatorAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: true,
      hashPassword: async () => "hashed-pw-1",
    });
    expect(store.get(DEMO_CREATOR_EMAIL).creatorStatus).toBe("approved");
    await revertDemoCreatorAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });
    expect(store.get(DEMO_CREATOR_EMAIL).creatorStatus).toBe("suspended");

    // Cycle 2: prepare again — the account now pre-exists (suspended), so
    // this run must treat it as an upgrade (existedBefore: true this time)
    // and must not collide with the reverted cycle-1 prep document.
    const second = await prepareDemoCreatorAccount({
      User: FakeUser,
      GooglePlayReviewPrep: FakePrep,
      execute: true,
      hashPassword: async () => "hashed-pw-2",
    });

    expect(second.ok).toBe(true);
    expect(second.alreadyApplied).toBe(false);
    expect(second.existedBefore).toBe(true);
    expect(store.get(DEMO_CREATOR_EMAIL).creatorStatus).toBe("approved");
    expect(store.get(DEMO_CREATOR_EMAIL).password).toBe("hashed-pw-2");

    const demoDocs = docs.filter((d) => d.email === DEMO_CREATOR_EMAIL && d.accountType === "demo_creator");
    expect(demoDocs).toHaveLength(2);
    expect(demoDocs.filter((d) => d.revertedAt === null || d.revertedAt === undefined)).toHaveLength(1);

    // Cycle 2 revert must restore cycle-2's snapshot (suspended, since that
    // was the state cycle 2 started from), not delete/crash.
    const secondRevert = await revertDemoCreatorAccount({ User: FakeUser, GooglePlayReviewPrep: FakePrep, execute: true });
    expect(secondRevert.ok).toBe(true);
    expect(secondRevert.existedBefore).toBe(true);
    expect(store.get(DEMO_CREATOR_EMAIL).creatorStatus).toBe("suspended");
  });
});
