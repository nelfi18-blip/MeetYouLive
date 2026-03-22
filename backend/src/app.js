const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
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

const baseAllowedOrigins = [
  "https://meetyoulive.net",
  "https://www.meetyoulive.net",
  "https://meetyoulive.onrender.com",
  "http://localhost:3000",
];

// Construye la lista final de orígenes permitidos
const allowedOrigins = process.env.FRONTEND_URL
  ? [...new Set([...baseAllowedOrigins, ...buildAllowedOrigins(process.env.FRONTEND_URL)])]
  : baseAllowedOrigins;

app.use(
  cors({
    origin: (origin, cb) => {
      // Si no hay origen (como apps móviles o curl) o está en la lista, permitir
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        console.log("Bloqueado por CORS:", origin);
        cb(new Error("No permitido por CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-nextauth-secret"],
  })
);
app.use(morgan("dev"));
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
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/moderation", moderationRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/videos", videoRoutes);

module.exports = app;
