const Stripe = require("stripe");
const mongoose = require("mongoose");
const Subscription = require("../models/Subscription.js");
const User = require("../models/User.js");
const { trackAnalyticsEvent } = require("../services/analytics.service.js");
const { notifySubscription } = require("../services/essentialNotification.service.js");
const { VIP_TIERS, TIER_IDS, getStripePriceId } = require("../config/vip-tiers.js");

let stripeClient;

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
};

const getFrontendUrl = () => process.env.FRONTEND_URL || null;
const VIP_SOFT_LAUNCH_MESSAGE = "VIP estará disponible próximamente. Durante el soft launch la monetización principal son Coins, regalos, contenido exclusivo, videollamadas privadas y retiros de creadores.";
const isVipCheckoutEnabled = () => process.env.ENABLE_VIP_CHECKOUT === "true";

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

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    let sub = await Subscription.findOne({ user: req.userId });
    let customerId = sub?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(req.userId) },
      });
      customerId = customer.id;
      // Persist the customer ID immediately so future calls reuse the same
      // Stripe customer even if the checkout webhook hasn't fired yet.
      await Subscription.findOneAndUpdate(
        { user: req.userId },
        { user: req.userId, stripeCustomerId: customerId },
        { upsert: true, new: true }
      );
    }

    const session = await stripe.checkout.sessions.create({
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
    });

    res.json({ url: session.url });
  } catch (err) {
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

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    let sub = await Subscription.findOne({ user: req.userId });
    let customerId = sub?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(req.userId) },
      });
      customerId = customer.id;
      await Subscription.findOneAndUpdate(
        { user: req.userId },
        { user: req.userId, stripeCustomerId: customerId },
        { upsert: true, new: true }
      );
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: String(req.userId), vipTier: tier },
      subscription_data: { metadata: { userId: String(req.userId), vipTier: tier } },
      success_url: `${frontendUrl}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/vip`,
    });

    res.json({ url: session.url });
  } catch (err) {
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

    const sub = await Subscription.findOne({ user: req.userId });
    if (!sub?.stripeSubscriptionId) {
      return res.status(404).json({ message: "No hay suscripción activa" });
    }
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    sub.status = "canceled";
    await sub.save();
    // Revoke premium and VIP status immediately on manual cancellation
    await User.findByIdAndUpdate(req.userId, { isPremium: false, isVIP: false, vipTier: null, vipExpiresAt: null });
    // Analytics: vip_canceled (fire-and-forget)
    trackAnalyticsEvent("vip_canceled", String(req.userId), {});
    res.json({ message: "Suscripción cancelada" });
  } catch (err) {
    console.error("[subscriptions] Failed to cancel subscription:", err.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

const handleSubscriptionWebhook = async (event) => {
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

module.exports = { createSubscriptionSession, createTierSubscriptionSession, getVipTiers, getSubscriptionStatus, cancelSubscription, handleSubscriptionWebhook };
