#!/usr/bin/env node
"use strict";

/**
 * set-google-play-review-accounts.js
 *
 * One-off, reversible, idempotent admin script that prepares the two
 * accounts needed for Google Play Review to exercise MeetYouLive's real
 * monetized flows (hidden likes, exclusive content, simulation, gifts,
 * paid video calls, Super Crush/Boost) WITHOUT any Stripe/Google Billing
 * transaction and WITHOUT any runtime bypass in application controllers.
 *
 * Scope (intentionally narrow — see backend/scripts/lib/googlePlayReviewAccounts.js):
 *   - Reviewer account (alvaradomeetyoulive@gmail.com, must already exist):
 *     sets `coins` to a fixed amount (6500). The ORIGINAL balance is
 *     captured before the first `--execute` and restored (never assumed
 *     to be 0) by `--revert`.
 *   - Demo creator account (gp-review-demo-creator@meetyoulive.internal):
 *     created if missing with role "creator" / creatorStatus "approved" so
 *     the reviewer has a dedicated, safe counterparty for paid
 *     interactions. `--revert` restores its prior state, or suspends it if
 *     the script created it (never deletes, to avoid breaking references
 *     created during the review cycle).
 *   - Both emails are HARDCODED constants; this script accepts no email
 *     argument, so it cannot be repurposed to affect any other account.
 *   - Does NOT touch Stripe, Google Billing, Connect, webhooks, payouts,
 *     CoinTransaction, earningsCoins, pricing, or any other user/model.
 *   - Does NOT modify any controller and introduces no runtime bypass.
 *
 * Usage (dry-run by default, no writes):
 *   cd backend && node scripts/set-google-play-review-accounts.js
 *
 * Apply the change:
 *   cd backend && node scripts/set-google-play-review-accounts.js --execute
 *
 * Revert the change (restores original reviewer balance; deactivates/
 * restores the demo creator account):
 *   cd backend && node scripts/set-google-play-review-accounts.js --revert --execute
 */

require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../src/models/User.js");
const GooglePlayReviewPrep = require("../src/models/GooglePlayReviewPrep.js");
const {
  REVIEWER_EMAIL,
  DEMO_CREATOR_EMAIL,
  REVIEW_COINS_AMOUNT,
  DEMO_CREATOR_PRICE_PER_MINUTE,
  prepareReviewerAccount,
  revertReviewerAccount,
  prepareDemoCreatorAccount,
  revertDemoCreatorAccount,
} = require("./lib/googlePlayReviewAccounts.js");

function parseArgs(argv) {
  const options = { execute: false, revert: false, help: false };
  for (const arg of argv) {
    if (arg === "--execute") options.execute = true;
    else if (arg === "--revert") options.revert = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}. Use --help for usage.`);
  }
  return options;
}

function printHelp() {
  console.log(`MeetYouLive Google Play review account preparation

Prepares (or reverts) EXACTLY two hardcoded accounts:
  - Reviewer:     ${REVIEWER_EMAIL}  (coins -> ${REVIEW_COINS_AMOUNT}, restorable)
  - Demo creator: ${DEMO_CREATOR_EMAIL}  (role: creator, creatorStatus: approved, pricePerMinute: ${DEMO_CREATOR_PRICE_PER_MINUTE})

Does not touch Stripe, Google Billing, Connect, webhooks, payouts,
CoinTransaction, earningsCoins, pricing, or any other user.

Dry-run (default, no writes):
  node scripts/set-google-play-review-accounts.js

Apply:
  node scripts/set-google-play-review-accounts.js --execute

Revert (restores reviewer's original balance; deactivates/restores demo creator):
  node scripts/set-google-play-review-accounts.js --revert --execute
`);
}

async function hashRandomPassword() {
  // The demo creator account is never meant to be logged into; it only
  // exists as a discoverable counterparty for the reviewer's real coin
  // spends. A random, never-recorded password prevents anyone from
  // authenticating as it.
  const randomSecret = crypto.randomBytes(32).toString("hex");
  return bcrypt.hash(randomSecret, 10);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error("❌  MONGODB_URI/MONGO_URI/DATABASE_URL env var is not set. Check your .env file.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  console.log("✅  Connected to MongoDB");

  try {
    const { execute, revert } = options;
    if (!execute) {
      console.log("Dry-run mode: no writes will be made. Re-run with --execute to apply.\n");
    }

    if (!revert) {
      // ── Reviewer: fixed coin balance, original balance preserved ──────
      const reviewerResult = await prepareReviewerAccount({ User, GooglePlayReviewPrep, execute });
      if (!reviewerResult.ok) {
        console.error(`❌  Reviewer account not found: ${REVIEWER_EMAIL}. Nothing was changed for it.`);
      } else if (reviewerResult.alreadyApplied) {
        console.log(
          `ℹ️  Reviewer already prepared previously (original balance preserved: ${reviewerResult.previousCoins}). ` +
            `Coins ${execute ? "confirmed at" : "would be set to"} ${reviewerResult.targetCoins}.`
        );
      } else {
        console.log(
          `${execute ? "✅" : "Dry-run:"}  Reviewer ${REVIEWER_EMAIL}: coins ${reviewerResult.previousCoins} → ${reviewerResult.targetCoins}` +
            (execute ? " (original balance saved for --revert)" : "")
        );
      }

      // ── Demo creator: create/approve dedicated counterparty ───────────
      const demoResult = await prepareDemoCreatorAccount({
        User,
        GooglePlayReviewPrep,
        execute,
        hashPassword: hashRandomPassword,
      });
      if (demoResult.alreadyApplied) {
        console.log(`ℹ️  Demo creator already prepared previously: ${DEMO_CREATOR_EMAIL}.`);
      } else if (demoResult.existedBefore) {
        console.log(
          `${execute ? "✅" : "Dry-run:"}  Demo creator ${DEMO_CREATOR_EMAIL} existed already; ` +
            `role/creatorStatus/pricePerMinute ${execute ? "updated" : "would be updated"} (previous state saved for --revert).`
        );
      } else {
        console.log(
          `${execute ? "✅" : "Dry-run:"}  Demo creator ${DEMO_CREATOR_EMAIL} ${execute ? "created" : "would be created"} ` +
            `(role: creator, creatorStatus: approved, pricePerMinute: ${DEMO_CREATOR_PRICE_PER_MINUTE}).`
        );
      }
    } else {
      // ── Revert reviewer ────────────────────────────────────────────────
      const reviewerRevert = await revertReviewerAccount({ User, GooglePlayReviewPrep, execute });
      if (!reviewerRevert.ok) {
        console.log(`ℹ️  No active reviewer preparation found for ${REVIEWER_EMAIL}. Nothing to revert.`);
      } else {
        console.log(
          `${execute ? "✅" : "Dry-run:"}  Reviewer ${REVIEWER_EMAIL}: coins ${execute ? "restored to" : "would be restored to"} ${reviewerRevert.previousCoins} (original balance).`
        );
      }

      // ── Revert demo creator ────────────────────────────────────────────
      const demoRevert = await revertDemoCreatorAccount({ User, GooglePlayReviewPrep, execute });
      if (!demoRevert.ok) {
        console.log(`ℹ️  No active demo creator preparation found for ${DEMO_CREATOR_EMAIL}. Nothing to revert.`);
      } else if (demoRevert.existedBefore) {
        console.log(
          `${execute ? "✅" : "Dry-run:"}  Demo creator ${DEMO_CREATOR_EMAIL}: previous role/creatorStatus/pricePerMinute ${execute ? "restored" : "would be restored"}.`
        );
      } else {
        console.log(
          `${execute ? "✅" : "Dry-run:"}  Demo creator ${DEMO_CREATOR_EMAIL}: ${execute ? "suspended" : "would be suspended"} (account preserved, not deleted, to avoid breaking review-cycle references).`
        );
      }
    }

    if (!options.execute) {
      console.log("\nRe-run with --execute to apply the changes above.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("❌  Script failed:", err.message);
  process.exitCode = 1;
});
