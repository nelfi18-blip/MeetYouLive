const Stripe = require("stripe");
const Subscription = require("../models/Subscription.js");
const User = require("../models/User.js");
const { trackAnalyticsEvent } = require("../services/analytics.service.js");
const { VIP_TIERS, TIER_IDS, getStripePriceId } = require("../config/vip-tiers.js");

let stripeClient;

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== "test") {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
  }
  return stripeClient;
};

const getFrontendUrl = () => process.env.FRONTEND_URL || null;

const createSubscriptionSession = async (req, res) => {
  try {
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
      const customer = await stripe.customers.create({ email: user.email });
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
      success_url: `${frontendUrl}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/subscriptions/subscribe-tier
 * Creates a Stripe Checkout session for a specific VIP tier.
 * Body: { tier: "silver" | "gold" | "platinum" }
 */
const createTierSubscriptionSession = async (req, res) => {
  try {
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
      const customer = await stripe.customers.create({ email: user.email });
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
      success_url: `${frontendUrl}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/vip`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    return { ...safe, available: Boolean(getStripePriceId(id)) };
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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
};

const handleSubscriptionWebhook = async (event) => {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  const session = event.data.object;
  const userId = session.metadata?.userId;
  if (!userId) {
    console.warn(`[subscription webhook] No userId in metadata for event ${event.type} (${event.id})`);
    return;
  }

  if (event.type === "checkout.session.completed" && session.mode === "subscription") {
    const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
    const periodEnd = new Date(stripeSubscription.current_period_end * 1000);
    // vipTier is set in metadata when using createTierSubscriptionSession; falls back to null for legacy checkout
    const vipTier = TIER_IDS.includes(session.metadata?.vipTier) ? session.metadata.vipTier : null;
    await Subscription.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
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
  }

  if (event.type === "invoice.payment_succeeded") {
    // Re-activate premium on successful renewal (e.g. after past_due recovery)
    const invoiceObj = event.data.object;
    // Try to get period end from invoice line items first (no extra API call)
    let periodEnd = null;
    const linePeriodEnd = invoiceObj.lines?.data?.[0]?.period?.end;
    if (linePeriodEnd) {
      periodEnd = new Date(linePeriodEnd * 1000);
    } else if (invoiceObj.subscription) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(invoiceObj.subscription);
        periodEnd = new Date(stripeSub.current_period_end * 1000);
      } catch (_) {
        // non-fatal: period end is best-effort for renewal
      }
    }
    const sub = await Subscription.findOneAndUpdate(
      { stripeCustomerId: invoiceObj.customer },
      { status: "active", ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}) },
      { new: true }
    );
    if (sub?.user) {
      await User.findByIdAndUpdate(sub.user, { isPremium: true, isVIP: true, ...(periodEnd ? { vipExpiresAt: periodEnd } : {}) });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: event.data.object.id },
      { status: "canceled" },
      { new: true }
    );
    // Revoke premium access and VIP status when subscription is fully deleted in Stripe
    if (sub?.user) {
      await User.findByIdAndUpdate(sub.user, { isPremium: false, isVIP: false, vipTier: null, vipExpiresAt: null });
      // Analytics: vip_canceled (fire-and-forget)
      trackAnalyticsEvent("vip_canceled", String(sub.user), {});
    }
  }

  if (event.type === "invoice.payment_failed") {
    await Subscription.findOneAndUpdate(
      { stripeCustomerId: event.data.object.customer },
      { status: "past_due" }
    );
    // Do not revoke isPremium on first failure; Stripe will retry and
    // fire invoice.payment_succeeded if the charge eventually succeeds.
    // isPremium is revoked when the subscription is fully deleted above.
  }
};

module.exports = { createSubscriptionSession, createTierSubscriptionSession, getVipTiers, getSubscriptionStatus, cancelSubscription, handleSubscriptionWebhook };
