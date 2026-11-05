"use strict";

// No dotenv: operator must select the environment explicitly. Never print keys,
// emails or raw Stripe objects. Default is a read-only single-account rehearsal.
const fs = require("node:fs");
const mongoose = require("mongoose");
const Stripe = require("stripe");
const { prepareReview, reviewAccount, reviewQueue } = require("../src/services/stripeSubscriptionRecovery.service.js");

async function main() {
  const [command, argument, confirmation] = process.argv.slice(2);
  if (!["queue", "prepare", "check", "apply"].includes(command) ||
    (command === "apply" && confirmation !== "--apply-reviewed-evidence")) {
    throw new Error("Usage: stripe-subscription-review.js queue | prepare USER_ID | check EVIDENCE.json | apply EVIDENCE.json --apply-reviewed-evidence");
  }
  if (!process.env.MONGODB_URI) throw new Error("Explicit MONGODB_URI required; no .env files are loaded");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  try {
    let result;
    if (command === "queue") {
      result = await reviewQueue();
      console.log(JSON.stringify(result, null, 2));
      // Monitoring can page an operator on nonzero. Never silently mark overdue
      // requests resolved. This command has no mutations or automatic cancels.
      if (result.some((row) => row.priority !== "review")) process.exitCode = 2;
      return;
    }
    if (command === "prepare") result = await prepareReview(argument);
    else {
      if (!process.env.STRIPE_SECRET_KEY) throw new Error("Explicit read-only Stripe access required");
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 0 });
      result = await reviewAccount(JSON.parse(fs.readFileSync(argument, "utf8")), stripe, { apply: command === "apply" });
    }
    console.log(JSON.stringify(result, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch(() => {
  // Provider/database error messages may contain connection strings. Detailed
  // errors belong in controlled investigation, never stdout/CI logs.
  console.error("Stripe review failed; no recovery is confirmed. Preserve the fence and investigate with the authorized operator.");
  process.exitCode = 1;
});
