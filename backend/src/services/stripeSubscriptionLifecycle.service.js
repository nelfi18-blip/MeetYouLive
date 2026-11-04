const crypto = require("crypto");
const Stripe = require("stripe");
const Lifecycle = require("../models/StripeSubscriptionLifecycle.js");
const Subscription = require("../models/Subscription.js");
const User = require("../models/User.js");

class SubscriptionLifecycleError extends Error {
  constructor(code, message, status = 503, resolution = "retry") {
    super(message);
    this.code = code;
    this.status = status;
    this.resolution = resolution;
    this.retriable = resolution === "retry";
  }
}
const unavailable = () => new SubscriptionLifecycleError("STRIPE_SUBSCRIPTION_UNVERIFIED",
  "No se pudo confirmar la operación de forma segura. No se confirmará la eliminación sin verificar Stripe. Mantén la sesión y reintenta; si persiste, contacta con soporte.");
const reviewError = () => new SubscriptionLifecycleError("STRIPE_SUBSCRIPTION_REVIEW_REQUIRED",
  "La vinculación histórica de Stripe requiere revisión manual. Contacta con soporte; tu cuenta no se ha eliminado.", 409, "manual_review");
const actionError = () => new SubscriptionLifecycleError("STRIPE_SUBSCRIPTION_ACTION_REQUIRED",
  "Hay una suscripción o un Checkout pendiente en Stripe. Ve a Suscripción y confirma su cancelación, o espera a que el Checkout expire. Si no aparece, contacta con soporte. Tu cuenta no se ha eliminado.", 409, "subscription");
const idOf = (value) => typeof value === "string" ? value : value?.id;
const validId = (value, prefix) => typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
let client;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw unavailable();
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 0 });
  return client;
}

async function saveOwned(context, update, options = {}) {
  const result = await Lifecycle.updateOne({ _id: context.userId, owner: context.owner, phase: "working" }, update, options);
  if (result.matchedCount !== 1) throw unavailable();
}

async function requireReview(context, reason) {
  await saveOwned(context, { $set: { "review.required": true, "review.reason": reason } });
  context.state.review = { required: true, reason };
}

async function withSubscriptionLifecycle(userId, operation, callback) {
  let context;
  try {
    if (process.env.STRIPE_SUBSCRIPTION_FENCE_READY !== "true") throw unavailable();
    const user = await User.findById(userId).select("_id email stripeSubscriptionTrackingVersion").lean();
    if (!user) {
      if (operation === "delete" || operation === "webhook") return null;
      throw new SubscriptionLifecycleError("STRIPE_SUBSCRIPTION_USER_MISSING", "Usuario no encontrado", 404);
    }
    const initialSub = await Subscription.findOne({ user: userId }).lean();
    try {
      await Lifecycle.updateOne({ _id: userId }, { $setOnInsert: {
        phase: "idle", owner: null,
        customerIds: validId(initialSub?.stripeCustomerId, "cus") ? [initialSub.stripeCustomerId] : [],
        review: { required: user.stripeSubscriptionTrackingVersion !== 1 || Boolean(initialSub?.stripeCustomerId || initialSub?.stripeSubscriptionId), reason: "untracked_history" },
      } }, { upsert: true });
    } catch (error) { if (error.code !== 11000) throw error; }

    const owner = crypto.randomUUID();
    // Briefly wait for a healthy concurrent request. Never expire or steal its
    // fence: a timeout/worker crash is a manual-review condition, not proof of safety.
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const state = await Lifecycle.findOneAndUpdate({ _id: userId, phase: "idle", owner: null },
        { $set: { owner, operation, phase: "working", startedAt: new Date() } }, { new: true }).lean();
      if (state) { context = { userId, user, owner, state, uncertain: false }; break; }
      const current = await Lifecycle.findById(userId).lean();
      if (current?.lastMutation?.status === "unknown") throw reviewError();
      if (current?.phase === "deleted") {
        if (operation === "delete" || operation === "webhook") return null;
        throw new SubscriptionLifecycleError("STRIPE_SUBSCRIPTION_USER_MISSING", "Usuario no encontrado", 404);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!context) throw new SubscriptionLifecycleError("STRIPE_SUBSCRIPTION_BUSY",
      "Hay otra operación de suscripción en curso. Tu cuenta se conserva. Reintenta; si persiste, contacta con soporte.");
    // Recheck after acquiring the fence; the first read could predate deletion.
    if (!await User.exists({ _id: userId })) {
      if (operation === "delete" || operation === "webhook") return null;
      throw new SubscriptionLifecycleError("STRIPE_SUBSCRIPTION_USER_MISSING", "Usuario no encontrado", 404);
    }
    context.requireReview = (reason) => requireReview(context, reason);
    context.markDeleted = (session) => saveOwned(context,
      { $set: { phase: "deleted", owner: null, customerIds: [], "review.required": false },
        $unset: { lastMutation: 1, operation: 1, startedAt: 1,
          "review.reason": 1, "review.reviewedBy": 1, "review.reviewedAt": 1 } }, { session });
    context.mutate = async (kind, mutation) => {
      const key = crypto.randomUUID();
      await saveOwned(context, { $set: { lastMutation: { kind, key, status: "pending", startedAt: new Date() } } });
      context.uncertain = true;
      const result = await mutation(key);
      if (!result?.id) throw unavailable();
      const update = { $set: { "lastMutation.status": "confirmed", "lastMutation.externalId": result.id } };
      if (kind === "customer.create") {
        if (!validId(result.id, "cus")) throw unavailable();
        update.$addToSet = { customerIds: result.id };
      }
      await saveOwned(context, update);
      if (kind === "customer.create") context.state.customerIds.push(result.id);
      context.uncertain = false;
      return result;
    };
    return await callback(context);
  } catch (error) {
    if (context?.uncertain) {
      // The pre-call pending record already protects against a DB outage here.
      await saveOwned(context, { $set: { "lastMutation.status": "unknown",
        "review.required": true, "review.reason": "unknown_stripe_mutation" } }).catch(() => {});
    }
    if (context?.uncertain) throw reviewError();
    if (["FACE_REFERENCE_CLEANUP_PENDING", "PAYOUT_PROFILE_CLEANUP_PENDING", "ACCOUNT_DELETION_CLEANUP_PENDING"].includes(error?.code)) throw error;
    if (error instanceof SubscriptionLifecycleError) throw error;
    throw unavailable();
  } finally {
    if (context && !context.uncertain) {
      // If this fails, the durable fence stays closed. Never hide the failure
      // with a successful Checkout response; the caller must retry/review.
      try {
        const state = await Lifecycle.findById(userId).lean();
        if (state?.phase !== "deleted") await saveOwned(context, { $set: { owner: null, phase: "idle" } });
      } catch { throw unavailable(); }
    }
  }
}

async function allPages(fetchPage) {
  const rows = [];
  let after;
  for (let page = 0; page < 20; page += 1) {
    const result = await fetchPage({ limit: 100, ...(after ? { starting_after: after } : {}) });
    if (!Array.isArray(result?.data) || typeof result.has_more !== "boolean") throw unavailable();
    rows.push(...result.data);
    if (!result.has_more) return rows;
    const next = result.data.at(-1)?.id;
    if (!next || next === after) throw unavailable();
    after = next;
  }
  throw unavailable(); // incomplete coverage never means no subscriptions
}

async function verifyCustomer(context, customerId) {
  if (!validId(customerId, "cus") || !context.state.customerIds.includes(customerId)) {
    await context.requireReview("untracked_customer");
    throw reviewError();
  }
  const customer = await getStripe().customers.retrieve(customerId);
  if (customer?.id !== customerId || customer.deleted || String(customer.metadata?.userId) !== String(context.userId)) {
    await context.requireReview("customer_ownership_unverified");
    throw reviewError();
  }
}

async function assertDeletionSafe(context) {
  if (context.state.review?.required !== false || ["pending", "unknown"].includes(context.state.lastMutation?.status)) throw reviewError();
  const local = await Subscription.findOne({ user: context.userId }).lean();
  if (local?.stripeCustomerId && !context.state.customerIds.includes(local.stripeCustomerId)) {
    await context.requireReview("untracked_local_customer"); throw reviewError();
  }
  if (local && !local.stripeCustomerId && (local.stripeSubscriptionId || local.status !== "inactive")) {
    await context.requireReview("missing_customer_identifier"); throw reviewError();
  }
  const stripe = context.state.customerIds.length || local?.stripeSubscriptionId ? getStripe() : null;
  const terminal = new Set(["canceled", "incomplete_expired"]);
  const checkSubscription = (sub, customer) => {
    if (!validId(sub?.id, "sub") || idOf(sub.customer) !== customer ||
      (sub.metadata?.userId && String(sub.metadata.userId) !== String(context.userId))) throw unavailable();
    if (!terminal.has(sub.status)) throw actionError(); // also blocks scheduled cancellation, paused/unpaid/past_due
  };
  for (const customerId of context.state.customerIds) {
    await verifyCustomer(context, customerId);
    if (local?.stripeSubscriptionId && local.stripeCustomerId === customerId) {
      if (!validId(local.stripeSubscriptionId, "sub")) throw unavailable();
      const current = await stripe.subscriptions.retrieve(local.stripeSubscriptionId);
      if (current?.id !== local.stripeSubscriptionId) throw unavailable();
      checkSubscription(current, customerId);
    }
    for (const sub of await allPages((page) => stripe.subscriptions.list({ customer: customerId, status: "all", ...page }))) {
      checkSubscription(sub, customerId);
    }
    const sessions = await allPages((page) => stripe.checkout.sessions.list({ customer: customerId, status: "open", ...page }));
    if (sessions.some((session) => session.mode === "subscription" || !session.mode)) throw actionError();
    const schedules = await allPages((page) => stripe.subscriptionSchedules.list({ customer: customerId, ...page }));
    if (schedules.some((schedule) => !["canceled", "completed", "released"].includes(schedule.status))) throw actionError();
  }
}

async function getCheckoutCustomer(context, stripe, user) {
  if (context.state.review?.required !== false) throw reviewError();
  const local = await Subscription.findOne({ user: context.userId });
  let customerId = local?.stripeCustomerId || context.state.customerIds[0];
  if (customerId) await verifyCustomer(context, customerId);
  else customerId = (await context.mutate("customer.create", (key) => stripe.customers.create({
    email: user.email, metadata: { userId: String(context.userId) },
  }, { idempotencyKey: key }))).id;
  await Subscription.findOneAndUpdate({ user: context.userId },
    { user: context.userId, stripeCustomerId: customerId }, { upsert: true, new: true });
  return customerId;
}

function sendLifecycleError(res, error) {
  if (!(error instanceof SubscriptionLifecycleError)) return false;
  res.status(error.status).json({ ok: false, code: error.code, message: error.message,
    retriable: error.retriable, resolution: error.resolution });
  return true;
}

module.exports = { withSubscriptionLifecycle, assertDeletionSafe, getCheckoutCustomer,
  verifyCustomer, sendLifecycleError, SubscriptionLifecycleError };
