#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../src/models/User");
const {
  buildCountsOnlyAuditReport,
  runUserClassificationAudit,
} = require("../src/services/userClassificationAudit.service");

function parseArgs(argv) {
  const options = { json: false, countsOnly: false, limit: null, help: false };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--counts-only") options.countsOnly = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value < 0) throw new Error("--limit must be a non-negative integer");
      options.limit = value;
    } else {
      throw new Error(`Unknown argument: ${arg}. Use --help for usage.`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`MeetYouLive user classification audit (dry-run, read-only)

Usage:
  cd backend && node scripts/audit-user-classification.js
  cd backend && node scripts/audit-user-classification.js --json
  cd backend && node scripts/audit-user-classification.js --counts-only
  cd backend && node scripts/audit-user-classification.js --limit=100

Reads MONGODB_URI, MONGO_URI, or DATABASE_URL. It never writes to MongoDB.
The per-user report masks emails, truncates user ids, and only prints presence/absence for password and OTP fields.
Use --counts-only from Render Shell when you only need the final safe production counts.`);
}

function printTextReport(report, { limit }) {
  const rows = limit === null ? report.users : report.users.slice(0, limit);
  console.log("MeetYouLive — auditoría dry-run de clasificación de usuarios");
  console.log(`Generado: ${report.generatedAt}`);
  console.log("No se modificó MongoDB.\n");

  console.log("Conteos globales:");
  for (const [key, value] of Object.entries(report.counts)) {
    console.log(`- ${key}: ${value}`);
  }

  console.log("\nCausa raíz:");
  console.log(report.rootCause);

  console.log("\nReporte por usuario (sin secretos):");
  for (const row of rows) {
    console.log(
      [
        `- userId=${row.userId}`,
        `email=${row.email || "—"}`,
        `role=${row.role || "—"}`,
        `authProvider=${row.authProvider || "—"}`,
        `googleId=${row.googleId}`,
        `pwdPresence=${row.password}`,
        `classification=${row.classification}`,
        `reason=${row.reason.join("; ")}`,
        `action=${row.recommendedAction}`,
      ].join(" | ")
    );
    if (row.contradictions.length) {
      console.log(`  contradicciones: ${row.contradictions.join("; ")}`);
    }
  }

  if (rows.length < report.users.length) {
    console.log(`\nSe mostraron ${rows.length} de ${report.users.length} usuarios por --limit.`);
  }

  console.log("\nCorrección automática posible:");
  console.log(`- ${report.counts.automaticallyCorrectable} cuentas con evidencia inequívoca pueden normalizarse después.`);
  console.log(`- ${report.counts.mustRemainUnknown} cuentas deben permanecer como “Sin información”.`);
  console.log("\nMigración recomendada (no ejecutada):");
  console.log(report.migrationRecommendation);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("No MongoDB URI found. Set MONGODB_URI, MONGO_URI, or DATABASE_URL.");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  const report = await runUserClassificationAudit(User);

  if (options.countsOnly) console.log(JSON.stringify(buildCountsOnlyAuditReport(report.counts), null, 2));
  else if (options.json) console.log(JSON.stringify(report, null, 2));
  else printTextReport(report, options);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
