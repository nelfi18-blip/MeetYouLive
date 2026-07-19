#!/usr/bin/env node
"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const {
  EXECUTE_CONFIRMATION,
  cleanupTestData,
  formatCleanupReport,
} = require("../src/services/testDataCleanup.service");

function parseArgs(argv) {
  const options = {
    execute: false,
    confirm: "",
    userIds: "",
    emails: "",
    emailDomains: "",
    emailRegex: "",
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--execute") options.execute = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--confirm=")) options.confirm = arg.slice("--confirm=".length);
    else if (arg.startsWith("--user-ids=")) options.userIds = arg.slice("--user-ids=".length);
    else if (arg.startsWith("--emails=")) options.emails = arg.slice("--emails=".length);
    else if (arg.startsWith("--email-domains=")) options.emailDomains = arg.slice("--email-domains=".length);
    else if (arg.startsWith("--email-regex=")) options.emailRegex = arg.slice("--email-regex=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  options.userIds = options.userIds || process.env.TEST_DATA_USER_IDS || "";
  options.emails = options.emails || process.env.TEST_DATA_EMAILS || "";
  options.emailDomains = options.emailDomains || process.env.TEST_DATA_EMAIL_DOMAINS || "";
  options.emailRegex = options.emailRegex || process.env.TEST_DATA_EMAIL_REGEX || "";
  options.confirm = options.confirm || process.env.TEST_DATA_CLEANUP_CONFIRM || "";
  options.execute = options.execute || process.env.TEST_DATA_CLEANUP_EXECUTE === "true";

  return options;
}

function printHelp() {
  console.log(`MeetYouLive test-data cleanup

Dry-run first (default):
  npm run cleanup:test-data -- --email-domains=example.com,test.local
  npm run cleanup:test-data -- --user-ids=<id1>,<id2> --json

Execute after reviewing the dry-run output:
  npm run cleanup:test-data -- --execute --confirm=${EXECUTE_CONFIRMATION} --user-ids=<id1>,<id2>

Selectors are explicit and additive. No users are selected by default.
If a user looks like test data but is not matched by a selector, it is preserved and reported.
Protected staff/admin roles are never selected by this script.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  await connectDB();
  const report = await cleanupTestData(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatCleanupReport(report));
    console.log("\nDetailed counts:");
    console.log(JSON.stringify(report.counts, null, 2));
    if (report.selectedUsers.length) {
      console.log("\nSelected users:");
      console.table(report.selectedUsers.map(({ id, email, username, role, creatorStatus }) => ({ id, email, username, role, creatorStatus })));
    }
    if (report.preservedAmbiguousUsers.length) {
      console.log("\nPreserved ambiguous users (not deleted):");
      console.table(report.preservedAmbiguousUsers.map(({ id, email, username, role, reason }) => ({ id, email, username, role, reason })));
    }
  }
}

main()
  .catch((error) => {
    console.error(`Cleanup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
