const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const authRoutes = require("./routes/auth.routes.js");
const userRoutes = require("./routes/user.routes.js");
const googleRoutes = require("./routes/google.routes.js");
const passport = require("./config/passport.js");
const paymentRoutes = require("./routes/payment.routes.js");
const webhookRoutes = require("./routes/webhook.routes.js");
const liveRoutes = require("./routes/live.routes.js");
const giftRoutes = require("./routes/gift.routes.js");
const coinsRoutes = require("./routes/coins.routes.js");
const subscriptionRoutes = require("./routes/subscription.routes.js");
const adminRoutes = require("./routes/admin.routes.js");
const moderationRoutes = require("./routes/moderation.routes.js");
const chatRoutes = require("./routes/chat.routes.js");
const matchRoutes = require("./routes/match.routes.js");
const videoRoutes = require("./routes/video.routes.js");
const videoCallRoutes = require("./routes/videoCall.routes.js");
const exclusiveContentRoutes = require("./routes/exclusiveContent.routes.js");
const exclusiveRoutes = require("./routes/exclusive.routes.js");
const sparksRoutes = require("./routes/sparks.routes.js");
const passesRoutes = require("./routes/passes.routes.js");
const creatorRoutes = require("./routes/creator.routes.js");
const agencyRoutes = require("./routes/agency.routes.js");
const agoraRoutes = require("./routes/agora.routes.js");
const rankingsRoutes = require("./routes/rankings.routes.js");

const app = express();

const allowedOrigins = [
  "https://meetyoulive.net",
  "https://www.meetyoulive.net",
  "http://localhost:3000",
];

// Add FRONTEND_URL from environment so production deployments on custom
// domains (or staging URLs) are allowed without changing this file.
if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin(origin, callback) {
    // Permite requests sin origin (health checks, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Permite URLs de preview de Vercel (*.vercel.app)
    if (/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-internal-api-secret"],
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/api/webhooks", webhookRoutes);
app.use(express.json());
app.use(passport.initialize());

app.get("/", (req, res) => {
  res.json({ ok: true, service: "meetyoulive-backend" });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Servidor de MeetYouLive activo",
    port: process.env.PORT || 10000,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/auth", googleRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/lives", liveRoutes);
app.use("/api/gifts", giftRoutes);
app.use("/api/coins", coinsRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/moderation", moderationRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/calls", videoCallRoutes);
app.use("/api/exclusive", exclusiveContentRoutes);
app.use("/api/exclusive-content", exclusiveRoutes);
app.use("/api/sparks", sparksRoutes);
app.use("/api/passes", passesRoutes);
app.use("/api/creator", creatorRoutes);
app.use("/api/agency", agencyRoutes);
app.use("/api/agora", agoraRoutes);
app.use("/api/rankings", rankingsRoutes);

module.exports = app;
