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
  : [];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow server-to-server requests with no origin header
      if (!origin) return cb(null, true);
      // Allow all Vercel preview and production deployments
      if (/\.vercel\.app$/.test(origin)) return cb(null, true);
      // Allow configured frontend domain (both www and non-www)
      if (allowedOrigins.length && allowedOrigins.includes(origin))
        return cb(null, true);
      // Allow localhost in development
      if (
        process.env.NODE_ENV !== "production" &&
        /^http:\/\/localhost(:\d+)?$/.test(origin)
      )
        return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-nextauth-secret"],
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
