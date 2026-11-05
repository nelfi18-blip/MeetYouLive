const Stripe = require("stripe");
const mongoose = require("mongoose");
const Subscription = require("../models/Subscription.js");
const User = require("../models/User.js");
const { trackAnalyticsEvent } = require("../services/analytics.service.js");
const { notifySubscription } = require("../services/essentialNotification.service.js");
const { VIP_TIERS, TIER_IDS, getStripePriceId } = require("../config/vip-tiers.js");
const { VIP_SOFT_LAUNCH_MESSAGE, isVipCheckoutEnabled } = require("../config/soft-launch.js");

const { withSubscriptionLifecycle, getCheckoutCustomer, verifyCustomer, assertDeletionSafe, sendLifecycleError, SubscriptionLifecycleError } =
  require("../services/stripeSubscriptionLifecycle.service.js");

let stripeClient;

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, { timeout: 10000, maxNetworkRetries: 0 });
  }
  return stripeClient;
};

const getFrontendUrl = () => process.env.FRONTEND_URL || null;
const normalizeObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) return null;
  return String(value);
};

const getStripeId = (value) => {
  if (!value) return null;
  return typeof value === "string" ? value : value.id || null;
};

const getSubscriptionIdFromInvoice = (invoice) =>
  getStripeId(invoice.subscription) ||
  getStripeId(invoice.subscription_details?.subscription) ||
  getStripeId(invoice.parent?.subscription_details?.subscription) ||
  getStripeId(invoice.lines?.data?.[0]?.subscription);

const resolveVipTier = (...sources) => {
  for (const source of sources) {
    const tier = source?.vipTier || source?.tier;
    if (TIER_IDS.includes(tier)) return tier;
  }
  return null;
};

const resolveVipTierFromStripeSubscription = (stripeSubscription) => {
  const metadataTier = resolveVipTier(stripeSubscription?.metadata);
  if (metadataTier) return metadataTier;

  const priceIds = stripeSubscription?.items?.data
    ?.map((item) => getStripeId(item.price))
    .filter(Boolean) || [];
  return TIER_IDS.find((tier) => priceIds.includes(getStripePriceId(tier))) || null;
};

const getCurrentPeriodEnd = (stripeSubscription, fallbackUnix) => {
  const periodEnd = stripeSubscription?.current_period_end || fallbackUnix;
  return periodEnd ? new Date(periodEnd * 1000) : null;
};

const getPlanName = (vipTier) => (vipTier ? "VIP" : "Premium");

const findSubscriptionRecord = async ({ userId, customerId, subscriptionId }) => {
  if (subscriptionId) {
    const sub = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
    if (sub) return sub;
  }
  if (customerId) {
    const sub = await Subscription.findOne({ stripeCustomerId: customerId });
    if (sub) return sub;
  }
  if (normalizeObjectId(userId)) {
    return Subscription.findOne({ user: userId });
  }
  return null;
};

const resolveSubscriptionUserId = async ({ stripe, metadata = {}, customerId, subscriptionId, stripeSubscription }) => {
  const existingSub = await findSubscriptionRecord({
    userId: metadata.userId,
    customerId,
    subscriptionId,
  });

  const candidateUserId =
    normalizeObjectId(existingSub?.user) ||
    normalizeObjectId(metadata.userId) ||
    normalizeObjectId(stripeSubscription?.metadata?.userId);
  if (candidateUserId) {
    return { userId: candidateUserId, existingSub };
  }

  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    const customerUserId = normalizeObjectId(customer?.metadata?.userId);
    if (customerUserId) {
      return { userId: customerUserId, existingSub };
    }
  }

  throw new Error(
    `User not found for subscription webhook after checking local subscription records, event metadata, subscription metadata, and customer metadata: subscription=${subscriptionId || "unknown"} customer=${customerId || "unknown"}`
  );
};

const createSubscriptionSession = async (req, res) => {
  try {
    if (!isVipCheckoutEnabled()) {
      return res.status(403).json({ message: VIP_SOFT_LAUNCH_MESSAGE });
    }

    const stripe = getStripe();
    const frontendUrl = getFrontendUrl();
    const priceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID;
    if (!stripe || !frontendUrl || !priceId) {
      return res.status(503).json({ message: "Servicio de suscripción no configurado" });
    }

    const url = await withSubscriptionLifecycle(req.userId, "checkout", async (lifecycle) => {
      const user = await User.findById(req.userId);
      if (!user) throw new Error("User disappeared before Checkout");
      const customerId = await getCheckoutCustomer(lifecycle, stripe, user);
      await assertDeletionSafe(lifecycle);

      const session = await lifecycle.mutate("checkout.create", (key) => stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: { userId: String(req.userId) },
        subscription_data: { metadata: { userId: String(req.userId) } },
        success_url: `${frontendUrl}/payment/success?token={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/payment/cancel`,
      }, { idempotencyKey: key }));
      return session.url;
    });
    res.json({ url });
  } catch (err) {
    if (sendLifecycleError(res, err)) return;
    console.error("[subscriptions] Failed to create checkout session:", err.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * POST /api/subscriptions/subscribe-tier
 * Creates a Stripe Checkout session for a specific VIP tier.
 * Body: { tier: "silver" | "gold" | "platinum" }
 */
const createTierSubscriptionSession = async (req, res) => {
  try {
    if (!isVipCheckoutEnabled()) {
      return res.status(403).json({ message: VIP_SOFT_LAUNCH_MESSAGE });
    }

    const stripe = getStripe();
    const frontendUrl = getFrontendUrl();
    if (!stripe || !frontendUrl) {
      return res.status(503).json({ message: "Servicio de suscripción no configurado" });
    }

    const { tier } = req.body;
    if (!TIER_IDS.includes(tier)) {
      return res.status(400).json({
        message: `Tier inválido. Valores permitidos: ${TIER_IDS.join(", ")}`,
      });
    }

    const priceId = getStripePriceId(tier);
    if (!priceId) {
      return res.status(503).json({
        message: `El tier ${tier} no está configurado en este momento.`,
      });
    }

    const url = await withSubscriptionLifecycle(req.userId, "checkout", async (lifecycle) => {
      const user = await User.findById(req.userId);
      if (!user) throw new Error("User disappeared before Checkout");
      const customerId = await getCheckoutCustomer(lifecycle, stripe, user);
      await assertDeletionSafe(lifecycle);

      const session = await lifecycle.mutate("checkout.create", (key) => stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { userId: String(req.userId), vipTier: tier },
        subscription_data: { metadata: { userId: String(req.userId), vipTier: tier } },
        success_url: `${frontendUrl}/payment/success?token={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/vip`,
      }, { idempotencyKey: key }));
      return session.url;
    });
    res.json({ url });
  } catch (err) {
    if (sendLifecycleError(res, err)) return;
    console.error("[subscriptions] Failed to create tier checkout session:", err.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * GET /api/subscriptions/tiers — returns the available VIP tier definitions
 * (without internal Stripe Price IDs, which are server-only).
 */
const getVipTiers = (_req, res) => {
  const tiers = TIER_IDS.map((id) => {
    // eslint-disable-next-line no-unused-vars
    const { stripePriceIdEnvKey, ...safe } = VIP_TIERS[id];
    return { ...safe, available: isVipCheckoutEnabled() && Boolean(getStripePriceId(id)) };
  });
  res.json({ tiers });
};

const getSubscriptionStatus = async (req, res) => {
  try {
    const sub = await Subscription.findOne({ user: req.userId });
    const user = await User.findById(req.userId).select("isVIP vipTier vipExpiresAt").lean();
    res.json({
      status: sub?.status || "inactive",
      currentPeriodEnd: sub?.currentPeriodEnd,
      isVIP: !!(user?.isVIP),
      vipTier: user?.vipTier || null,
      vipExpiresAt: user?.vipExpiresAt || null,
    });
  } catch (err) {
    console.error("[subscriptions] Failed to get subscription status:", err.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Servicio de suscripción no configurado" });
    }

    await withSubscriptionLifecycle(req.userId, "cancel", async (lifecycle) => {
      const sub = await Subscription.findOne({ user: req.userId });
      if (!sub?.stripeSubscriptionId) {
        throw new SubscriptionLifecycleError("STRIPE_SUBSCRIPTION_MISSING", "No hay suscripción identificada. Contacta con soporte si hay una operación pendiente.", 409, "manual_review");
      }
      await verifyCustomer(lifecycle, sub.stripeCustomerId);
      if (!/^sub_[A-Za-z0-9]+$/.test(sub.stripeSubscriptionId)) throw new Error("Invalid subscription identifier");
      const current = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      if (current.id !== sub.stripeSubscriptionId || (current.metadata?.userId && String(current.metadata.userId) !== String(req.userId)) ||
        (typeof current.customer === "string" ? current.customer : current.customer?.id) !== sub.stripeCustomerId) {
        await lifecycle.requireReview("subscription_customer_mismatch");
        throw new Error("Subscription ownership mismatch");
      }
      // This is the existing explicit user cancellation endpoint, never a
      // deletion side effect. Unknown results remain durably fenced for review.
      if (current.status !== "canceled") {
        await lifecycle.mutate("subscription.cancel", (key) =>
          stripe.subscriptions.cancel(sub.stripeSubscriptionId, {}, { idempotencyKey: key }));
      }
      const confirmed = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      if (confirmed.status !== "canceled") throw new Error("Cancellation not confirmed");
      sub.status = "canceled";
      await sub.save();
      await User.findByIdAndUpdate(req.userId, { isPremium: false, isVIP: false, vipTier: null, vipExpiresAt: null });
    });
    // Analytics: vip_canceled (fire-and-forget)
    trackAnalyticsEvent("vip_canceled", String(req.userId), {});
    res.json({ message: "Suscripción cancelada" });
  } catch (err) {
    if (sendLifecycleError(res, err)) return;
    console.error("[subscriptions] Failed to cancel subscription:", err.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

const applySubscriptionWebhook = async (event) => {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  const session = event.data.object;
  if (event.type === "checkout.session.completed" && session.mode === "subscription") {
    if (session.payment_status !== "paid") {
      console.warn("[subscriptions webhook] unpaid subscription checkout ignored", {
        eventId: event.id,
        sessionId: session.id,
        paymentStatus: session.payment_status,
      });
      return;
    }
    const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
    if (stripeSubscription.status && stripeSubscription.status !== "active") {
      console.warn("[subscriptions webhook] inactive subscription checkout ignored", {
        eventId: event.id,
        sessionId: session.id,
        subscriptionId: getStripeId(session.subscription),
        subscriptionStatus: stripeSubscription.status,
      });
      return;
    }
    const periodEnd = getCurrentPeriodEnd(stripeSubscription);
    // vipTier is set in metadata when using createTierSubscriptionSession; falls back to null for legacy checkout
    const vipTier = resolveVipTier(session.metadata, stripeSubscription.metadata) ||
      resolveVipTierFromStripeSubscription(stripeSubscription);
    const { userId } = await resolveSubscriptionUserId({
      stripe,
      metadata: session.metadata,
      customerId: getStripeId(session.customer),
      subscriptionId: getStripeId(session.subscription),
      stripeSubscription,
    });
    await Subscription.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        stripeCustomerId: getStripeId(session.customer),
        stripeSubscriptionId: getStripeId(session.subscription),
        status: "active",
        currentPeriodEnd: periodEnd,
      },
      { upsert: true, new: true }
    );
    // Grant premium and VIP access on successful subscription checkout
    await User.findByIdAndUpdate(userId, { isPremium: true, isVIP: true, vipTier, vipExpiresAt: periodEnd });
    // Analytics: vip_subscribed (fire-and-forget)
    trackAnalyticsEvent("vip_subscribed", userId, {
      amount_usd: session.amount_total != null ? session.amount_total / 100 : null,
      vipTier,
    });
    await notifySubscription({
      userId,
      action: "activated",
      plan: getPlanName(vipTier),
      eventId: event.id,
      subscriptionId: getStripeId(session.subscription),
    });
  }

  if (event.type === "invoice.payment_succeeded") {
    // Re-activate premium on successful renewal (e.g. after past_due recovery)
    const invoiceObj = event.data.object;
    const customerId = getStripeId(invoiceObj.customer);
    const subscriptionId = getSubscriptionIdFromInvoice(invoiceObj);
    const stripeSubscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
    if (!stripeSubscription || !["active", "trialing"].includes(stripeSubscription.status)) return;
    // Try to get period end from invoice line items first (no extra API call)
    let periodEnd = null;
    const linePeriodEnd = invoiceObj.lines?.data?.[0]?.period?.end;
    if (linePeriodEnd) {
      periodEnd = new Date(linePeriodEnd * 1000);
    } else {
      periodEnd = getCurrentPeriodEnd(stripeSubscription);
    }
    const vipTier = resolveVipTier(invoiceObj.metadata, stripeSubscription?.metadata) ||
      resolveVipTierFromStripeSubscription(stripeSubscription);
    const { userId, existingSub } = await resolveSubscriptionUserId({
      stripe,
      metadata: invoiceObj.metadata,
      customerId,
      subscriptionId,
      stripeSubscription,
    });
    const sub = await Subscription.findOneAndUpdate(
      existingSub ? { _id: existingSub._id } : { user: userId },
      {
        user: userId,
        stripeCustomerId: customerId,
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        status: "active",
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      },
      { upsert: true, new: true }
    );
    if (sub?.user) {
      await User.findByIdAndUpdate(sub.user, {
        isPremium: true,
        isVIP: true,
        ...(vipTier ? { vipTier } : {}),
        ...(periodEnd ? { vipExpiresAt: periodEnd } : {}),
      });
      await notifySubscription({
        userId: sub.user,
        action: "renewed",
        plan: getPlanName(vipTier),
        eventId: event.id,
        subscriptionId,
      });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const stripeSubscription = event.data.object;
    const subscriptionId = getStripeId(stripeSubscription.id);
    const customerId = getStripeId(stripeSubscription.customer);
    const { userId, existingSub } = await resolveSubscriptionUserId({
      stripe,
      metadata: stripeSubscription.metadata,
      customerId,
      subscriptionId,
      stripeSubscription,
    });
    const sub = await Subscription.findOneAndUpdate(
      existingSub ? { _id: existingSub._id } : { user: userId },
      {
        user: userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: "canceled",
      },
      { upsert: true, new: true }
    );
    // Revoke premium access and VIP status when subscription is fully deleted in Stripe
    if (sub?.user) {
      await User.findByIdAndUpdate(sub.user, { isPremium: false, isVIP: false, vipTier: null, vipExpiresAt: null });
      // Analytics: vip_canceled (fire-and-forget)
      trackAnalyticsEvent("vip_canceled", String(sub.user), {});
      await notifySubscription({
        userId: sub.user,
        action: "canceled",
        plan: getPlanName(resolveVipTier(stripeSubscription.metadata) || resolveVipTierFromStripeSubscription(stripeSubscription)),
        eventId: event.id,
        subscriptionId,
      });
    }
  }

  if (event.type === "invoice.payment_failed") {
    const invoiceObj = event.data.object;
    const customerId = getStripeId(invoiceObj.customer);
    const subscriptionId = getSubscriptionIdFromInvoice(invoiceObj);
    const stripeSubscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
    const { userId, existingSub } = await resolveSubscriptionUserId({
      stripe,
      metadata: invoiceObj.metadata,
      customerId,
      subscriptionId,
      stripeSubscription,
    });
    await Subscription.findOneAndUpdate(
      existingSub ? { _id: existingSub._id } : { user: userId },
      {
        user: userId,
        stripeCustomerId: customerId,
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        status: "past_due",
      },
      { upsert: true, new: true }
    );
    await notifySubscription({
      userId,
      action: "payment_failed",
      plan: getPlanName(resolveVipTier(invoiceObj.metadata, stripeSubscription?.metadata) || resolveVipTierFromStripeSubscription(stripeSubscription)),
      eventId: event.id,
      subscriptionId,
    });
    // Keep access during Stripe's retry window; subscription.deleted is the
    // authoritative event that revokes Premium/VIP access.
  }
};

// Resolve by durable provider/user IDs only. No email matching. The same
// per-user fence serializes webhook writes with Checkout and account deletion.
const handleSubscriptionWebhook = async (event) => {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const object = event.data.object;
  const isInvoice = event.type.startsWith("invoice.");
  const subscriptionId = isInvoice ? getSubscriptionIdFromInvoice(object)
    : event.type === "checkout.session.completed" ? getStripeId(object.subscription) : getStripeId(object.id);
  const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
  const customerId = getStripeId(object.customer) || getStripeId(subscription?.customer);
  const { userId } = await resolveSubscriptionUserId({ stripe, metadata: object.metadata,
    customerId, subscriptionId, stripeSubscription: subscription });
  await withSubscriptionLifecycle(userId, "webhook", async (lifecycle) => {
    if (customerId && !lifecycle.state.customerIds.includes(customerId)) {
      // Preserve evidence for manual review without declaring legacy history complete.
      await lifecycle.requireReview("webhook_untracked_customer");
      const State = require("../models/StripeSubscriptionLifecycle.js");
      await State.updateOne({ _id: userId, owner: lifecycle.owner }, { $addToSet: { customerIds: customerId } });
      lifecycle.state.customerIds.push(customerId);
    }
    await verifyCustomer(lifecycle, customerId);
    await applySubscriptionWebhook(event);
  });
};

module.exports = { createSubscriptionSession, createTierSubscriptionSession, getVipTiers, getSubscriptionStatus, cancelSubscription, handleSubscriptionWebhook };
