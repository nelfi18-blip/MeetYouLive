const Stripe = require("stripe");
const Subscription = require("../models/Subscription.js");
const User = require("../models/User.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const createSubscriptionSession = async (req, res) => {
  try {
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
          price: process.env.STRIPE_SUBSCRIPTION_PRICE_ID,
          quantity: 1,
        },
      ],
      metadata: { userId: String(req.userId) },
      success_url: `${process.env.FRONTEND_URL}/payment/success?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSubscriptionStatus = async (req, res) => {
  try {
    const sub = await Subscription.findOne({ user: req.userId });
    const user = await User.findById(req.userId).select("isVIP vipExpiresAt").lean();
    res.json({
      status: sub?.status || "inactive",
      currentPeriodEnd: sub?.currentPeriodEnd,
      isVIP: !!(user?.isVIP),
      vipExpiresAt: user?.vipExpiresAt || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    const sub = await Subscription.findOne({ user: req.userId });
    if (!sub?.stripeSubscriptionId) {
      return res.status(404).json({ message: "No hay suscripción activa" });
    }
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    sub.status = "canceled";
    await sub.save();
    // Revoke premium and VIP status immediately on manual cancellation
    await User.findByIdAndUpdate(req.userId, { isPremium: false, isVIP: false, vipExpiresAt: null });
    res.json({ message: "Suscripción cancelada" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const handleSubscriptionWebhook = async (event) => {
  const session = event.data.object;
  const userId = session.metadata?.userId;
  if (!userId) {
    console.warn(`[subscription webhook] No userId in metadata for event ${event.type} (${event.id})`);
    return;
  }

  if (event.type === "checkout.session.completed" && session.mode === "subscription") {
    const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
    const periodEnd = new Date(stripeSubscription.current_period_end * 1000);
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
    await User.findByIdAndUpdate(userId, { isPremium: true, isVIP: true, vipExpiresAt: periodEnd });
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
      await User.findByIdAndUpdate(sub.user, { isPremium: false, isVIP: false, vipExpiresAt: null });
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

module.exports = { createSubscriptionSession, getSubscriptionStatus, cancelSubscription, handleSubscriptionWebhook };
