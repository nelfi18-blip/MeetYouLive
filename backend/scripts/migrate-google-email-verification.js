#!/usr/bin/env node
"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const User = require("../src/models/User");
const {
  getGoogleEmailVerificationDiagnostics,
  migrateSafeLegacyGoogleAccounts,
} = require("../src/services/googleAccount.service");

const CONFIRMATION = "MIGRATE_SAFE_LEGACY_GOOGLE_EMAILS";

function parseArgs(argv) {
  const options = { execute: false, json: false, help: false, confirm: "" };
  for (const arg of argv) {
    if (arg === "--execute") options.execute = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--confirm=")) options.confirm = arg.slice("--confirm=".length);
    else throw new Error(`Unknown argument: ${arg}. Use --help for usage.`);
  }
  options.confirm = options.confirm || process.env.GOOGLE_EMAIL_MIGRATION_CONFIRM || "";
  options.execute = options.execute || process.env.GOOGLE_EMAIL_MIGRATION_EXECUTE === "true";
  if (options.execute && options.confirm !== CONFIRMATION) {
    throw new Error(`Refusing to execute without --confirm=${CONFIRMATION}`);
  }
  return options;
}

function printHelp() {
  console.log(`MeetYouLive safe Google email verification migration

Dry-run only (default, no updates):
  node scripts/migrate-google-email-verification.js --json

Execute only after reviewing diagnostics:
  node scripts/migrate-google-email-verification.js --execute --confirm=${CONFIRMATION} --json

This migration only updates users with persisted Google evidence (authProvider, googleId, Google creation metadata, or NextAuth account provider)
and legacy local accounts with valid bcrypt password evidence:
  - authProvider = "google"
  - emailVerified = true
  - OTP fields cleared
  - authProvider = "local" for non-Google legacy accounts with bcrypt password hashes

Dry-run and execute reports include counts only (Google, Local, Admin, Legacy, matched, modified).

It never invents googleId and does not update passwords, roles, profiles, Stripe, payments, coins, payouts, or subscriptions.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await connectDB();
  const diagnostics = await getGoogleEmailVerificationDiagnostics(User);
  const migration = await migrateSafeLegacyGoogleAccounts(User, { execute: options.execute });
  const report = { ok: true, diagnostics, migration };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Diagnostics:", diagnostics);
    console.log("Migration:", migration);
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
