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
    res.json({ status: sub?.status || "inactive", currentPeriodEnd: sub?.currentPeriodEnd });
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
    // Revoke premium status immediately on manual cancellation
    await User.findByIdAndUpdate(req.userId, { isPremium: false });
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
    await Subscription.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        status: "active",
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      },
      { upsert: true, new: true }
    );
    // Grant premium access on successful subscription checkout
    await User.findByIdAndUpdate(userId, { isPremium: true });
  }

  if (event.type === "invoice.payment_succeeded") {
    // Re-activate premium on successful renewal (e.g. after past_due recovery)
    const sub = await Subscription.findOneAndUpdate(
      { stripeCustomerId: event.data.object.customer },
      { status: "active" },
      { new: true }
    );
    if (sub?.user) {
      await User.findByIdAndUpdate(sub.user, { isPremium: true });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: event.data.object.id },
      { status: "canceled" },
      { new: true }
    );
    // Revoke premium access when subscription is fully deleted in Stripe
    if (sub?.user) {
      await User.findByIdAndUpdate(sub.user, { isPremium: false });
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
