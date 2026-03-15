const { Router } = require("express");
const express = require("express");
const rateLimit = require("express-rate-limit");
const Stripe = require("stripe");
const { handlePaymentCompleted } = require("../controllers/payment.controller.js");
const { handleSubscriptionWebhook } = require("../controllers/subscription.controller.js");

let _stripeInstance = null;
const getStripe = () => {
  if (!_stripeInstance) {
    _stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripeInstance;
};

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
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ message: "Stripe no está configurado" });
    }

    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).json({ message: `Webhook error: ${err.message}` });
    }

    try {
      if (event.type === "checkout.session.completed" && event.data.object.mode === "payment") {
        await handlePaymentCompleted(event.data.object);
      } else {
        await handleSubscriptionWebhook(event);
      }
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }

    res.json({ received: true });
  }
);

module.exports = router;
