const crypto = require("crypto");
const mongoose = require("mongoose");
const Lifecycle = require("../models/StripeSubscriptionLifecycle.js");
const Review = require("../models/StripeSubscriptionReview.js");
const Subscription = require("../models/Subscription.js");
const User = require("../models/User.js");

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const idOf = (value) => typeof value === "string" ? value : value?.id;
const validId = (value, prefix) => typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
const insist = (condition, message) => { if (!condition) throw new Error(message); };

async function pages(fetch) {
  const rows = [];
  let after;
  for (let i = 0; i < 20; i += 1) {
    const result = await fetch({ limit: 100, ...(after ? { starting_after: after } : {}) });
    insist(Array.isArray(result?.data) && typeof result.has_more === "boolean", "Incomplete provider response");
    rows.push(...result.data);
    if (!result.has_more) return rows;
    const next = result.data.at(-1)?.id;
    insist(next && next !== after, "Incomplete provider pagination");
    after = next;
  }
  throw new Error("Provider pagination limit: split investigation, never clear review");
}

async function snapshot(userId) {
  const state = await Lifecycle.findById(userId).lean();
  insist(state && state.phase !== "deleted" && await User.exists({ _id: userId }), "Missing/deleted account");
  const local = await Subscription.findOne({ user: userId }).lean();
  // Include local links: they must not change unnoticed between review and apply.
  return { state, local, snapshotSha256: hash({ state, local }) };
}

// Read-only case export. No provider secrets or emails. Restricted operator use.
async function prepareReview(userId) {
  const { state, local, snapshotSha256 } = await snapshot(userId);
  return { userId: String(userId), snapshotSha256, phase: state.phase, owner: state.owner,
    mutation: state.lastMutation || null, customerIds: state.customerIds,
    localCustomerId: local?.stripeCustomerId || null, localSubscriptionId: local?.stripeSubscriptionId || null,
    deletionRequest: state.deletionRequest || null };
}

function validateEvidence(evidence) {
  insist(mongoose.isValidObjectId(evidence.userId), "Invalid user ID");
  insist(/^[a-f0-9]{64}$/.test(evidence.snapshotSha256 || "") &&
    /^[a-f0-9]{64}$/.test(evidence.evidenceSha256 || ""), "Evidence and snapshot SHA256 required");
  insist(/^[A-Za-z0-9/_:.-]{3,160}$/.test(evidence.ticket || ""), "Restricted evidence ticket required (no email/PII)");
  insist(Array.isArray(evidence.reviewers) && evidence.reviewers.length === 2 &&
    new Set(evidence.reviewers).size === 2 && evidence.reviewers.every((r) => /^[A-Za-z0-9_.-]{2,80}$/.test(r)),
  "Two distinct authorized reviewer IDs required");
  insist(evidence.historyComplete === true && evidence.writersDrained === true &&
    /^[a-f0-9]{40}$/.test(evidence.deploymentSha || ""), "Complete history and drained-writer evidence required");
  insist(Number.isFinite(Date.parse(evidence.inspectedAt)) && Date.now() - Date.parse(evidence.inspectedAt) >= 0 &&
    Date.now() - Date.parse(evidence.inspectedAt) < 15 * 60000, "Evidence must be inspected within 15 minutes");
  insist(Array.isArray(evidence.customerIds) && evidence.customerIds.length <= 100 &&
    new Set(evidence.customerIds).size === evidence.customerIds.length &&
    evidence.customerIds.every((id) => validId(id, "cus")), "Invalid customer inventory");
  // These are human attestations supported by the immutable evidence artifact;
  // Stripe's APIs cannot prove historical absence or expose request-log outcomes.
}

async function inspectProvider(evidence, current, stripe) {
  const { state, local } = current;
  const known = [...state.customerIds, local?.stripeCustomerId].filter(Boolean);
  insist(known.every((id) => evidence.customerIds.includes(id)), "Cannot discard a known customer link");
  const mutation = state.lastMutation;
  if (state.phase === "working") insist(evidence.stoppedOwner === state.owner && state.owner,
    "Interrupted worker owner must match the stopped-worker evidence");
  if (["pending", "unknown"].includes(mutation?.status)) {
    insist(evidence.mutationKey === mutation.key && ["confirmed", "no_effect"].includes(evidence.outcome),
      "Exact unknown mutation key and authoritative outcome required");
    insist(typeof evidence.requestLogReference === "string" &&
      /^[A-Za-z0-9/_:.-]{3,160}$/.test(evidence.requestLogReference), "Authoritative request-log evidence required");
    if (evidence.outcome === "confirmed") {
      const externalId = evidence.externalId;
      if (mutation.kind === "customer.create") {
        insist(evidence.customerIds.includes(externalId), "Created customer missing from inventory");
      } else if (mutation.kind === "checkout.create") {
        insist(validId(externalId, "cs"), "Invalid Checkout identifier");
        const session = await stripe.checkout.sessions.retrieve(externalId);
        insist(session?.id === externalId && session.mode === "subscription" &&
          evidence.customerIds.includes(idOf(session.customer)) &&
          String(session.metadata?.userId) === evidence.userId, "Checkout ownership unverified");
      } else if (mutation.kind === "subscription.cancel") {
        insist(validId(externalId, "sub") && externalId === local?.stripeSubscriptionId, "Cancellation target mismatch");
        const sub = await stripe.subscriptions.retrieve(externalId);
        insist(sub?.id === externalId && sub.status === "canceled" &&
          evidence.customerIds.includes(idOf(sub.customer)), "Cancellation not confirmed by readback");
      } else throw new Error("Unsupported unknown mutation kind");
    } else {
      insist(!evidence.externalId, "No-effect outcome cannot claim an external result");
      insist(typeof evidence.requestLogReference === "string" &&
        /^[A-Za-z0-9/_:.-]{3,160}$/.test(evidence.requestLogReference),
      "No-effect outcome needs authoritative request-log evidence; elapsed time/absence is insufficient");
    }
  } else {
    insist(!evidence.outcome && !evidence.mutationKey && !evidence.externalId, "Unexpected mutation resolution");
  }
  const inventory = [];
  const legacyCustomerIds = [];
  for (const customerId of evidence.customerIds) {
    const customer = await stripe.customers.retrieve(customerId);
    insist(customer?.id === customerId && !customer.deleted, "Customer unreadable/deleted: manual investigation required");
    insist(!customer.metadata?.userId || String(customer.metadata.userId) === evidence.userId, "Customer ownership conflict");
    if (!customer.metadata?.userId) legacyCustomerIds.push(customerId);
    const subscriptions = await pages((page) => stripe.subscriptions.list({ customer: customerId, status: "all", ...page }));
    const checkouts = await pages((page) => stripe.checkout.sessions.list({ customer: customerId, status: "open", ...page }));
    const schedules = await pages((page) => stripe.subscriptionSchedules.list({ customer: customerId, ...page }));
    for (const [rows, prefix] of [[subscriptions, "sub"], [checkouts, "cs"], [schedules, "sub_sched"]]) {
      insist(rows.every((row) => validId(row?.id, prefix) && idOf(row.customer) === customerId &&
        (!row.metadata?.userId || String(row.metadata.userId) === evidence.userId)), "Inventory ownership/identifier mismatch");
    }
    if (local?.stripeSubscriptionId && local.stripeCustomerId === customerId) {
      insist(validId(local.stripeSubscriptionId, "sub"), "Invalid local subscription ID");
      const sub = await stripe.subscriptions.retrieve(local.stripeSubscriptionId);
      insist(sub?.id === local.stripeSubscriptionId && idOf(sub.customer) === customerId &&
        (!sub.metadata?.userId || String(sub.metadata.userId) === evidence.userId), "Local subscription ownership conflict");
    }
    inventory.push({ customerId, subscriptions: subscriptions.map((s) => ({ id: s.id, status: s.status })),
      openCheckouts: checkouts.filter((s) => s.mode === "subscription" || !s.mode).map((s) => s.id),
      schedules: schedules.map((s) => ({ id: s.id, status: s.status })) });
  }
  insist(!local?.stripeSubscriptionId || local.stripeCustomerId, "Local subscription without customer needs separate evidence repair");
  return { inventory, legacyCustomerIds };
}

// Single-account, explicit operator apply. Never calls Stripe mutations, replays
// idempotency keys, changes entitlements or executes account deletion.
async function reviewAccount(evidence, stripe, { apply = false } = {}) {
  validateEvidence(evidence);
  const current = await snapshot(evidence.userId);
  insist(current.snapshotSha256 === evidence.snapshotSha256, "Stale snapshot: prepare/review again");
  const { inventory, legacyCustomerIds } = await inspectProvider(evidence, current, stripe);
  if (!apply) return { applied: false, inventory, snapshotSha256: current.snapshotSha256 };
  validateEvidence(evidence); // Recheck freshness after bounded provider scans.
  const evidenceId = crypto.randomUUID();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const state = await Lifecycle.findById(evidence.userId).session(session).lean();
      const local = await Subscription.findOne({ user: evidence.userId }).session(session).lean();
      insist(hash({ state, local }) === current.snapshotSha256 &&
        await User.exists({ _id: evidence.userId }).session(session), "State changed: recovery rejected");
      await Review.create([{ _id: evidenceId, user: evidence.userId, ticket: evidence.ticket,
        evidenceSha256: evidence.evidenceSha256, reviewers: evidence.reviewers,
        snapshotSha256: evidence.snapshotSha256, customerIds: evidence.customerIds,
        mutationKey: evidence.mutationKey, outcome: evidence.outcome, externalId: evidence.externalId,
        requestLogReference: evidence.requestLogReference, stoppedOwner: evidence.stoppedOwner,
        deploymentSha: evidence.deploymentSha, inspectedAt: new Date(evidence.inspectedAt),
        reviewedAt: new Date() }], { session });
      const update = { $set: { customerIds: evidence.customerIds, phase: "idle", owner: null,
        review: { required: false, reviewedBy: evidence.reviewers.join("/"), reviewedAt: new Date(), evidenceId, legacyCustomerIds } },
        $unset: { operation: 1, startedAt: 1 } };
      if (["pending", "unknown"].includes(state.lastMutation?.status)) {
        update.$set["lastMutation.status"] = evidence.outcome;
        if (evidence.externalId) update.$set["lastMutation.externalId"] = evidence.externalId;
      }
      const saved = await Lifecycle.updateOne({ _id: evidence.userId, phase: state.phase, owner: state.owner }, update, { session });
      insist(saved.matchedCount === 1, "Fence changed");
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally { await session.endSession(); }
  return { applied: true, evidenceId, inventory, next: "User retries explicit cancellation or deletion; fresh checks still apply" };
}

async function reviewQueue(now = new Date()) {
  const states = await Lifecycle.find({ $or: [
    { "deletionRequest.status": "pending" }, { "review.required": true },
    { "lastMutation.status": { $in: ["pending", "unknown"] } }, { phase: "working" },
  ] }).select("phase owner operation startedAt review lastMutation deletionRequest").lean();
  return states.map((state) => ({ ...state, priority:
    state.deletionRequest?.status === "pending" && state.deletionRequest.escalateAt <= now ? "escalated" :
      state.deletionRequest?.status === "pending" && state.deletionRequest.reviewDueAt <= now ? "overdue" : "review" }));
}
module.exports = { prepareReview, reviewAccount, reviewQueue };
