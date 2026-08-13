#!/usr/bin/env node
"use strict";

/**
 * set-google-play-review-premium.js
 *
 * One-off, reversible admin script to grant premium access to the single
 * Google Play review account (alvaradomeetyoulive@gmail.com) so reviewers can
 * see premium surfaces without a real payment.
 *
 * Scope (intentionally narrow):
 *   - Targets ONLY the hardcoded review account email below. It does not
 *     accept an arbitrary email argument, so it cannot be repurposed to grant
 *     premium to any other account.
 *   - Sets ONLY the existing `User.isPremium` field.
 *   - Does NOT change role, creatorStatus, coins, earningsCoins, balances,
 *     purchased content, or any Stripe/Subscription/Connect data.
 *
 * Usage (dry-run by default, no writes):
 *   cd backend && node scripts/set-google-play-review-premium.js
 *
 * Apply the change:
 *   cd backend && node scripts/set-google-play-review-premium.js --execute
 *
 * Revert the change (sets isPremium back to false):
 *   cd backend && node scripts/set-google-play-review-premium.js --revert --execute
 */

require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../src/models/User");

const REVIEW_ACCOUNT_EMAIL = "alvaradomeetyoulive@gmail.com";

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
  console.log(`MeetYouLive Google Play review account premium toggle

Grants (or reverts) isPremium ONLY for ${REVIEW_ACCOUNT_EMAIL}.
Does not touch role, coins, earningsCoins, or any Stripe/Subscription data.

Dry-run (default, no writes):
  node scripts/set-google-play-review-premium.js

Apply (isPremium: true):
  node scripts/set-google-play-review-premium.js --execute

Revert (isPremium: false):
  node scripts/set-google-play-review-premium.js --revert --execute
`);
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
    const user = await User.findOne({ email: REVIEW_ACCOUNT_EMAIL }).select(
      "_id email role isPremium"
    );

    if (!user) {
      console.error(`❌  No user found with email ${REVIEW_ACCOUNT_EMAIL}. Nothing was changed.`);
      process.exitCode = 1;
      return;
    }

    console.log(`Found user  →  id: ${user._id}  |  role: ${user.role}  |  isPremium (current): ${user.isPremium}`);

    if (user.role !== "user") {
      console.warn(
        `⚠️  Warning: account role is "${user.role}", not "user". This script only changes isPremium and will not modify role.`
      );
    }

    const targetIsPremium = !options.revert;

    if (!options.execute) {
      console.log(
        `Dry-run: would set isPremium=${targetIsPremium} for ${REVIEW_ACCOUNT_EMAIL}. Re-run with --execute to apply.`
      );
      return;
    }

    user.isPremium = targetIsPremium;
    await user.save();

    console.log(
      `✅  Updated ${REVIEW_ACCOUNT_EMAIL}: isPremium is now ${targetIsPremium}. role remains "${user.role}" (unchanged).`
    );
    console.log(
      `To revert: node scripts/set-google-play-review-premium.js --revert --execute`
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("❌  Script failed:", err.message);
  process.exitCode = 1;
});
