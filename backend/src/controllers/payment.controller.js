const Stripe = require("stripe");
const Video = require("../models/Video.js");
const Purchase = require("../models/Purchase.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const createCheckoutSession = async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);
    if (!video) return res.status(404).json({ message: "Vídeo no encontrado" });
    if (!video.isPrivate || video.price <= 0) {
      return res.status(400).json({ message: "Este vídeo no requiere pago" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: video.title,
            },
            unit_amount: Math.round(video.price * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.userId,
        videoId: String(video._id),
        amount: String(video.price),
      },
      success_url: `${process.env.FRONTEND_URL}/payment/success`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const handlePaymentCompleted = async (session) => {
  const { userId, videoId, amount } = session.metadata;
  const existing = await Purchase.findOne({ stripeSessionId: session.id });
  if (!existing) {
    await Purchase.create({
      user: userId,
      video: videoId,
      amount: parseFloat(amount),
      stripeSessionId: session.id,
    });
  }
};

module.exports = { createCheckoutSession, handlePaymentCompleted };
