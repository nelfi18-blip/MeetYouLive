const { Router } = require("express");
const express = require("express");
const rateLimit = require("express-rate-limit");
const Stripe = require("stripe");
const { handlePaymentCompleted } = require("../controllers/payment.controller.js");
const { handleSubscriptionWebhook } = require("../controllers/subscription.controller.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.deleted",
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
