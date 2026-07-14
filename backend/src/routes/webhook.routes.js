const { Router } = require("express");
const express = require("express");
const rateLimit = require("express-rate-limit");
const Stripe = require("stripe");
const User = require("../models/User.js");
const { handlePaymentCompleted } = require("../controllers/payment.controller.js");
const { handleSubscriptionWebhook } = require("../controllers/subscription.controller.js");

let stripeClient;

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY || (process.env.NODE_ENV === "test" ? "sk_test_placeholder" : null);
  if (!secretKey) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
};
const SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.deleted",
]);

const CONNECT_EVENTS = new Set([
  "account.updated",
]);

const router = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes" },
});

router.post(
  "/stripe",
  webhookLimiter,
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const stripe = getStripe();
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("[stripe webhook] Stripe webhook is not configured", {
        hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
        hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      });
      return res.status(503).json({ message: "Webhook de Stripe no configurado" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[stripe webhook] signature verification failed", {
        path: "/api/webhooks/stripe",
        hasSignatureHeader: Boolean(sig),
        errorType: err?.type || "signature_verification_error",
      });
      return res.status(400).json({ message: `Webhook error: ${err.message}` });
    }

    try {
      const session = event.data?.object;
      console.log("[stripe webhook] event received", {
        path: "/api/webhooks/stripe",
        eventId: event.id,
        eventType: event.type,
        sessionId: session?.id || null,
      });

      if (event.type === "checkout.session.completed" && event.data.object.mode === "payment") {
        await handlePaymentCompleted(event.data.object);
      } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
        await handleSubscriptionWebhook(event);
      } else if (CONNECT_EVENTS.has(event.type)) {
        // account.updated — sync Stripe Connect account status to the User document
        const account = event.data.object;
        if (account.id && account.metadata?.userId) {
          const enabled = account.charges_enabled && account.payouts_enabled;
          const status = enabled
            ? "enabled"
            : account.requirements?.currently_due?.length > 0
            ? "restricted"
            : "pending";
          await User.findOneAndUpdate(
            { stripeAccountId: account.id },
            { stripeAccountStatus: status }
          ).catch((err) =>
            console.error("[webhook] Failed to update stripeAccountStatus:", err.message)
          );
        }
      } else {
        console.log("[stripe webhook] event ignored", {
          eventId: event.id,
          eventType: event.type,
        });
      }
    } catch (err) {
      console.error("[stripe webhook] handler error", {
        eventId: event?.id,
        eventType: event?.type,
        message: err.message,
      });
      return res.status(500).json({ message: err.message });
    }

    res.json({ received: true });
  }
);

module.exports = router;
