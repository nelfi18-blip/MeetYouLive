#!/usr/bin/env node
"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const {
  PRODUCTION_EXECUTE_CONFIRMATION,
  cleanupTestData,
  formatCleanupReport,
} = require("../src/services/testDataCleanup.service");

function parseArgs(argv) {
  const options = {
    execute: false,
    confirm: "",
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--execute") options.execute = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--confirm=")) options.confirm = arg.slice("--confirm=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  options.confirm = options.confirm || process.env.PRODUCTION_USER_CLEANUP_CONFIRM || "";
  options.execute = options.execute || process.env.PRODUCTION_USER_CLEANUP_EXECUTE === "true";
  return options;
}

function printHelp() {
  console.log(`MeetYouLive production non-admin user cleanup

Dry-run only (default, no deletion):
  npm run cleanup:production-users -- --json

Execute only after human approval of the dry-run counts:
  npm run cleanup:production-users -- --execute --confirm=${PRODUCTION_EXECUTE_CONFIRMATION} --json

This script selects every User whose role is not one of the configured administrative/staff roles.
It does not print emails, names, tokens, connection strings, or secrets.`);
}

function safeErrorMessage(error) {
  const message = error?.message || "Unknown cleanup error";
  return String(message)
    .replace(/mongodb(?:\+srv)?:\/\/(?:[^\s/@]+:[^\s/@]*@)?[^\s]+/gi, "[redacted-mongodb-uri]")
    .replace(/(password|secret|token|key)=([^&\s]+)/gi, "$1=[redacted]");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  await connectDB();
  const report = await cleanupTestData({
    allNonAdministrative: true,
    execute: options.execute,
    confirm: options.confirm,
    includeAmbiguousReport: false,
    includeSelectedUsers: false,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatCleanupReport(report));
  console.log("\nProtected administrative users preserved:", report.counts.administratorsPreserved);
  console.log("Non-administrative users selected:", report.counts.users);
  console.log("Legacy creators selected:", report.counts.creators);
  console.log("\nDetailed counts:");
  console.log(JSON.stringify(report.counts, null, 2));
  console.log("\nSensitive user identifiers were intentionally omitted from this report.");
}

main()
  .catch((error) => {
    console.error(`Production cleanup failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
