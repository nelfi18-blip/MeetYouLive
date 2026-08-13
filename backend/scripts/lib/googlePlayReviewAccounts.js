"use strict";

/**
 * googlePlayReviewAccounts.js
 *
 * Core (testable) logic behind
 * `backend/scripts/set-google-play-review-accounts.js`.
 *
 * Scope (intentionally narrow, matches the approved plan):
 *   - Targets ONLY two hardcoded emails below. No email is ever accepted as
 *     a CLI argument or read from user input, so this mechanism cannot be
 *     repurposed to grant coins/creator access to any other account.
 *   - Reviewer account: only its `coins` field is changed (a real user
 *     account, must already exist).
 *   - Demo creator account: only `role`, `creatorStatus`, and
 *     `creatorProfile.pricePerMinute` are set; created if missing.
 *   - Does NOT touch Stripe, Google Billing, Connect, webhooks, payouts,
 *     CoinTransaction, earningsCoins, pricing logic, or any other user.
 *   - `--revert` restores the reviewer's ORIGINAL coin balance (captured
 *     before the first `--execute`), never assumes it was 0.
 */

const REVIEWER_EMAIL = "alvaradomeetyoulive@gmail.com";
const DEMO_CREATOR_EMAIL = "gp-review-demo-creator@meetyoulive.internal";
const DEMO_CREATOR_USERNAME = "gp_review_demo_creator";

// See PR description for the per-flow cost breakdown that adds up to this
// figure (hidden-likes unlock, Super Crush, Boost, extra swipes, a premium
// simulation scenario, exclusive content, a short paid video call, the most
// expensive default gift, plus a ~15% retry buffer).
const REVIEW_COINS_AMOUNT = 6500;
const DEMO_CREATOR_PRICE_PER_MINUTE = 10;

const ALLOWED_EMAILS = Object.freeze([REVIEWER_EMAIL, DEMO_CREATOR_EMAIL]);

function assertHardcodedEmail(email) {
  if (!ALLOWED_EMAILS.includes(email)) {
    // Defense in depth: this function must never be called with an email
    // that isn't one of the two hardcoded review accounts.
    throw new Error(`Refusing to operate on non-whitelisted email: ${email}`);
  }
}

/**
 * Applies (or re-applies, idempotently) the fixed coin balance to the
 * reviewer account, capturing the ORIGINAL balance the first time so
 * `--revert` can restore it safely.
 */
async function prepareReviewerAccount({ User, GooglePlayReviewPrep, execute }) {
  assertHardcodedEmail(REVIEWER_EMAIL);

  const user = await User.findOne({ email: REVIEWER_EMAIL }).select("_id email coins role");
  if (!user) {
    return { ok: false, reason: "not_found", email: REVIEWER_EMAIL };
  }

  const existingPrep = await GooglePlayReviewPrep.findOne({
    email: REVIEWER_EMAIL,
    accountType: "reviewer",
    revertedAt: null,
  });

  if (existingPrep) {
    // Already prepared previously: idempotent re-apply. Never touch the
    // captured previousState (that would corrupt the original balance).
    const alreadyCorrect = user.coins === REVIEW_COINS_AMOUNT;
    if (execute && !alreadyCorrect) {
      user.coins = REVIEW_COINS_AMOUNT;
      await user.save();
    }
    return {
      ok: true,
      alreadyApplied: true,
      previousCoins: existingPrep.previousState?.coins ?? null,
      currentCoins: execute ? REVIEW_COINS_AMOUNT : user.coins,
      targetCoins: REVIEW_COINS_AMOUNT,
    };
  }

  // First-time application: snapshot the real, pre-existing balance.
  const previousCoins = user.coins;

  if (!execute) {
    return {
      ok: true,
      alreadyApplied: false,
      previousCoins,
      currentCoins: user.coins,
      targetCoins: REVIEW_COINS_AMOUNT,
      dryRun: true,
    };
  }

  await GooglePlayReviewPrep.create({
    email: REVIEWER_EMAIL,
    accountType: "reviewer",
    previousState: { coins: previousCoins },
    existedBefore: true,
    appliedAt: new Date(),
  });

  user.coins = REVIEW_COINS_AMOUNT;
  await user.save();

  return {
    ok: true,
    alreadyApplied: false,
    previousCoins,
    currentCoins: REVIEW_COINS_AMOUNT,
    targetCoins: REVIEW_COINS_AMOUNT,
  };
}

/**
 * Restores the reviewer's original coin balance captured by
 * prepareReviewerAccount(). Never assumes the previous balance was 0.
 */
async function revertReviewerAccount({ User, GooglePlayReviewPrep, execute }) {
  assertHardcodedEmail(REVIEWER_EMAIL);

  const prep = await GooglePlayReviewPrep.findOne({
    email: REVIEWER_EMAIL,
    accountType: "reviewer",
    revertedAt: null,
  });

  if (!prep) {
    return { ok: false, reason: "not_applied", email: REVIEWER_EMAIL };
  }

  const previousCoins = prep.previousState?.coins;
  if (typeof previousCoins !== "number" || Number.isNaN(previousCoins)) {
    // Never silently fall back to 0: a missing/corrupted snapshot must fail
    // loudly rather than risk zeroing out a real, unknown balance.
    throw new Error(
      `Corrupted or missing prep snapshot for ${REVIEWER_EMAIL}: previousState.coins is not a number. Refusing to revert.`
    );
  }

  if (!execute) {
    return { ok: true, previousCoins, dryRun: true };
  }

  const user = await User.findOne({ email: REVIEWER_EMAIL }).select("_id coins");
  if (user) {
    user.coins = previousCoins;
    await user.save();
  }

  prep.revertedAt = new Date();
  await prep.save();

  return { ok: true, previousCoins, restored: !!user };
}

/**
 * Creates (if missing) or updates the dedicated demo creator account used
 * exclusively as the counterparty for the reviewer's monetized flows
 * (gifts, paid video calls, Super Crush, exclusive content, etc.).
 */
async function prepareDemoCreatorAccount({ User, GooglePlayReviewPrep, execute, hashPassword }) {
  assertHardcodedEmail(DEMO_CREATOR_EMAIL);

  const existingPrep = await GooglePlayReviewPrep.findOne({
    email: DEMO_CREATOR_EMAIL,
    accountType: "demo_creator",
    revertedAt: null,
  });

  let user = await User.findOne({ email: DEMO_CREATOR_EMAIL });

  if (existingPrep) {
    // Idempotent re-apply: ensure fields match target without touching the
    // stored previousState/existedBefore snapshot.
    if (execute && user) {
      user.role = "creator";
      user.creatorStatus = "approved";
      user.creatorProfile = user.creatorProfile || {};
      user.creatorProfile.pricePerMinute = DEMO_CREATOR_PRICE_PER_MINUTE;
      await user.save();
    }
    return {
      ok: true,
      alreadyApplied: true,
      existedBefore: existingPrep.existedBefore,
      email: DEMO_CREATOR_EMAIL,
    };
  }

  const existedBefore = !!user;
  const previousState = existedBefore
    ? {
        role: user.role,
        creatorStatus: user.creatorStatus,
        pricePerMinute: user.creatorProfile?.pricePerMinute ?? 0,
      }
    : {};

  if (!execute) {
    return { ok: true, alreadyApplied: false, existedBefore, dryRun: true };
  }

  await GooglePlayReviewPrep.create({
    email: DEMO_CREATOR_EMAIL,
    accountType: "demo_creator",
    previousState,
    existedBefore,
    appliedAt: new Date(),
  });

  if (!user) {
    const password = await hashPassword();
    user = new User({
      email: DEMO_CREATOR_EMAIL,
      username: DEMO_CREATOR_USERNAME,
      name: "Google Play Review — Demo Creator",
      password,
      role: "creator",
      creatorStatus: "approved",
      creatorProfile: { pricePerMinute: DEMO_CREATOR_PRICE_PER_MINUTE, exclusiveContentEnabled: true },
    });
  } else {
    user.role = "creator";
    user.creatorStatus = "approved";
    user.creatorProfile = user.creatorProfile || {};
    user.creatorProfile.pricePerMinute = DEMO_CREATOR_PRICE_PER_MINUTE;
  }

  await user.save();

  return { ok: true, alreadyApplied: false, existedBefore, created: !existedBefore };
}

/**
 * Deactivates the demo creator account: restores its previous role/status
 * if it pre-existed, otherwise suspends it (never hard-deletes, to avoid
 * breaking referential integrity of Gift/Like/CoinTransaction documents
 * created against it during a review cycle).
 */
async function revertDemoCreatorAccount({ User, GooglePlayReviewPrep, execute }) {
  assertHardcodedEmail(DEMO_CREATOR_EMAIL);

  const prep = await GooglePlayReviewPrep.findOne({
    email: DEMO_CREATOR_EMAIL,
    accountType: "demo_creator",
    revertedAt: null,
  });

  if (!prep) {
    return { ok: false, reason: "not_applied", email: DEMO_CREATOR_EMAIL };
  }

  if (!execute) {
    return { ok: true, existedBefore: prep.existedBefore, dryRun: true };
  }

  const user = await User.findOne({ email: DEMO_CREATOR_EMAIL });
  if (user) {
    if (prep.existedBefore) {
      user.role = prep.previousState?.role ?? "user";
      user.creatorStatus = prep.previousState?.creatorStatus ?? "none";
      user.creatorProfile = user.creatorProfile || {};
      user.creatorProfile.pricePerMinute = prep.previousState?.pricePerMinute ?? 0;
    } else {
      // Didn't exist before the script created it: deactivate rather than
      // delete, to preserve referential integrity of anything created
      // against it during the review cycle.
      user.creatorStatus = "suspended";
    }
    await user.save();
  }

  prep.revertedAt = new Date();
  await prep.save();

  return { ok: true, restored: !!user, existedBefore: prep.existedBefore };
}

module.exports = {
  REVIEWER_EMAIL,
  DEMO_CREATOR_EMAIL,
  DEMO_CREATOR_USERNAME,
  REVIEW_COINS_AMOUNT,
  DEMO_CREATOR_PRICE_PER_MINUTE,
  ALLOWED_EMAILS,
  assertHardcodedEmail,
  prepareReviewerAccount,
  revertReviewerAccount,
  prepareDemoCreatorAccount,
  revertDemoCreatorAccount,
};
