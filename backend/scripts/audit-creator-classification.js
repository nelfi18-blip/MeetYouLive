#!/usr/bin/env node
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../src/models/User");
const { runCreatorClassificationAudit } = require("../src/services/creatorClassificationAudit.service");

const CONFIRMATION = "REPAIR_CREATOR_CLASSIFICATION";

function parseOptions(argv = process.argv.slice(2)) {
  const execute = argv.includes("--execute");
  const confirmArg = argv.find((arg) => arg.startsWith("--confirm="));
  const confirm = confirmArg ? confirmArg.split("=").slice(1).join("=") : "";
  const json = argv.includes("--json");
  return { execute, confirm, json };
}

function printUsage() {
  console.log(`MeetYouLive creator classification audit

Dry-run by default:
  cd backend && node scripts/audit-creator-classification.js
  cd backend && node scripts/audit-creator-classification.js --json

Repair only with explicit confirmation:
  cd backend && node scripts/audit-creator-classification.js --execute --confirm=${CONFIRMATION} --json

The repair never modifies admin accounts and only repairs accounts with persisted approval evidence.
`);
}

async function main() {
  const options = parseOptions();
  if (options.execute && options.confirm !== CONFIRMATION) {
    printUsage();
    throw new Error(`Para reparar debes pasar --confirm=${CONFIRMATION}`);
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI/MONGODB_URI no está configurado");

  await mongoose.connect(mongoUri);
  const report = await runCreatorClassificationAudit(User, { execute: options.execute });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("MeetYouLive — auditoría de clasificación Creator");
  console.log("Modo:", report.dryRun ? "dry-run (sin cambios)" : "repair");
  console.log("Regla oficial:", report.officialApprovedCreatorRule);
  console.log("Resumen:", report.counts);
  console.log("Modificados:", report.modifiedCount);
  console.log("Cuentas con inconsistencias/reparables:", report.users.length);
  for (const row of report.users) {
    console.log({
      userId: row.userId,
      role: row.role,
      creatorStatus: row.creatorStatus,
      issues: row.issues,
      repairable: row.repairable,
      repair: row.repair,
    });
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
