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
 *   - Demo creator account: created if missing, or upgraded in place, as a
 *     REAL, LOGGABLE creator counterparty — the fields set are exactly the
 *     ones that gate the flows Google Play review needs to exercise
 *     (login, Live, paid video calls, gifts/Super Crush, exclusive
 *     content): `role`, `creatorStatus`, `emailVerified`, `isBlocked`,
 *     `isSuspended`, `password` (from the admin-controlled
 *     `GOOGLE_PLAY_DEMO_CREATOR_PASSWORD` env var — never a lost random
 *     secret), and `creatorProfile.{pricePerMinute,privateCallEnabled,
 *     liveEnabled,giftsEnabled,exclusiveContentEnabled}`.
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
// Fields that must be set on the demo creator so it is an actually
// functional creator counterparty for the reviewer, per the real production
// gates (see comments below for the file/condition each one satisfies):
//   - role/creatorStatus:            discovery, Live, video calls, exclusive
//                                     content, gift/Super Crush earnings.
//   - username (non-null):           creatorDiscovery.controller.js listing.
//   - emailVerified:                 auth login gate (new local accounts
//                                     otherwise cannot log in).
//   - isBlocked/isSuspended:         auth login gate.
//   - creatorProfile.privateCallEnabled + pricePerMinute >= 1:
//                                     callRules.service.js video-call gate.
//   - creatorProfile.liveEnabled:    kept true for consistency (not
//                                     currently enforced, but expected).
//   - creatorProfile.giftsEnabled:   kept true so gifts UI doesn't hide it.
//   - creatorProfile.exclusiveContentEnabled:
//                                     lets the account expose exclusive
//                                     content if any is uploaded.
function applyDemoCreatorFunctionalFields(user) {
  user.role = "creator";
  user.creatorStatus = "approved";
  user.isBlocked = false;
  user.isSuspended = false;
  user.emailVerified = true;
  user.creatorProfile = user.creatorProfile || {};
  user.creatorProfile.pricePerMinute = DEMO_CREATOR_PRICE_PER_MINUTE;
  user.creatorProfile.privateCallEnabled = true;
  user.creatorProfile.liveEnabled = true;
  user.creatorProfile.giftsEnabled = true;
  user.creatorProfile.exclusiveContentEnabled = true;
}

function snapshotDemoCreatorState(user) {
  return {
    role: user.role,
    creatorStatus: user.creatorStatus,
    isBlocked: user.isBlocked,
    isSuspended: user.isSuspended,
    emailVerified: user.emailVerified,
    pricePerMinute: user.creatorProfile?.pricePerMinute ?? 0,
    privateCallEnabled: user.creatorProfile?.privateCallEnabled ?? false,
    liveEnabled: user.creatorProfile?.liveEnabled ?? true,
    giftsEnabled: user.creatorProfile?.giftsEnabled ?? true,
    exclusiveContentEnabled: user.creatorProfile?.exclusiveContentEnabled ?? false,
  };
}

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
    // stored previousState/existedBefore snapshot. The password is
    // re-hashed from the (admin-controlled) env var on every re-apply so
    // rotating GOOGLE_PLAY_DEMO_CREATOR_PASSWORD and re-running --execute
    // actually updates the login credential.
    if (execute && user) {
      applyDemoCreatorFunctionalFields(user);
      user.password = await hashPassword();
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
  const previousState = existedBefore ? snapshotDemoCreatorState(user) : {};

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

  const password = await hashPassword();

  if (!user) {
    user = new User({
      email: DEMO_CREATOR_EMAIL,
      username: DEMO_CREATOR_USERNAME,
      name: "Google Play Review — Demo Creator",
      password,
      creatorProfile: {},
    });
  } else {
    user.password = password;
  }

  applyDemoCreatorFunctionalFields(user);

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
      const prev = prep.previousState || {};
      user.role = prev.role ?? "user";
      user.creatorStatus = prev.creatorStatus ?? "none";
      user.isBlocked = prev.isBlocked ?? false;
      user.isSuspended = prev.isSuspended ?? false;
      user.emailVerified = prev.emailVerified ?? false;
      user.creatorProfile = user.creatorProfile || {};
      user.creatorProfile.pricePerMinute = prev.pricePerMinute ?? 0;
      user.creatorProfile.privateCallEnabled = prev.privateCallEnabled ?? false;
      user.creatorProfile.liveEnabled = prev.liveEnabled ?? true;
      user.creatorProfile.giftsEnabled = prev.giftsEnabled ?? true;
      user.creatorProfile.exclusiveContentEnabled = prev.exclusiveContentEnabled ?? false;
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
