const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes.js");
const userRoutes = require("./routes/user.routes.js");
const googleRoutes = require("./routes/google.routes.js");
const passport = require("./config/passport.js");
const paymentRoutes = require("./routes/payment.routes.js");
const webhookRoutes = require("./routes/webhook.routes.js");
const liveRoutes = require("./routes/live.routes.js");
const giftRoutes = require("./routes/gift.routes.js");
const subscriptionRoutes = require("./routes/subscription.routes.js");
const adminRoutes = require("./routes/admin.routes.js");
const moderationRoutes = require("./routes/moderation.routes.js");
const chatRoutes = require("./routes/chat.routes.js");
const videoRoutes = require("./routes/video.routes.js");

const app = express();

function buildAllowedOrigins(frontendUrl) {
  const withWww = frontendUrl.includes("://www.")
    ? frontendUrl
    : frontendUrl.replace("://", "://www.");
  const withoutWww = frontendUrl.includes("://www.")
    ? frontendUrl.replace("://www.", "://")
    : frontendUrl;
  return [withWww, withoutWww];
}

const allowedOrigins = process.env.FRONTEND_URL
  ? buildAllowedOrigins(process.env.FRONTEND_URL)
  : null;

app.use(
  cors({
    origin: allowedOrigins
      ? (origin, cb) => {
          if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
          if (/\.vercel\.app$/.test(origin)) return cb(null, true);
          cb(new Error("Not allowed by CORS"));
        }
      : /\.vercel\.app$/,
    credentials: true,
  })
);
app.use("/api/webhooks", webhookRoutes);
app.use(express.json());
app.use(passport.initialize());

app.get("/", (req, res) => {
  res.json({ ok: true, service: "meetyoulive-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/auth", googleRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/lives", liveRoutes);
app.use("/api/gifts", giftRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/moderation", moderationRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/videos", videoRoutes);

module.exports = app;
