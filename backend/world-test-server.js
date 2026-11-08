"use strict";

// Test-only entrypoint for the already-existing World Render Free service.
// Does NOT import src/app.js or index.js: no Stripe, OAuth, Live, push, jobs,
// migrations, admin seeding, SMTP, billing, analytics or production services.
const { verifyWorldTestEnvironment } = require("./src/worldTestConfig");

async function startWorldTestServer(env = process.env) {
  const cfg = verifyWorldTestEnvironment(env); // Must fail before any DB access.
  process.env.JWT_SECRET = cfg.jwtSecret; // Only the isolated World namespace can use it.
  const express = require("express");
  const helmet = require("helmet");
  const cors = require("cors");
  const rateLimit = require("express-rate-limit");
  const bcrypt = require("bcryptjs");
  const jwt = require("jsonwebtoken");
  const mongoose = require("mongoose");
  const http = require("http");
  const { Server } = require("socket.io");
  const User = require("./src/models/User");
  const Report = require("./src/models/Report");
  const { initVcrWorld } = require("./src/lib/vcrWorld");

  await mongoose.connect(cfg.mongoUri, { serverSelectionTimeoutMS: 15000 });
  if (mongoose.connection.name !== "world_test") {
    await mongoose.disconnect();
    throw new Error("Refusing to start outside world_test database");
  }

  // Synthetic accounts only, under reserved invalid emails. No real mailbox,
  // no email delivery, no external identities or reused user data.
  for (const item of cfg.accounts) {
    const existing = await User.findOne({ email: item.email });
    if (existing) {
      if (existing.username !== item.username || !await bcrypt.compare(item.password, existing.password)) {
        throw new Error("Existing World Test account does not match configured identity");
      }
      continue;
    }
    await User.create({
      email: item.email, username: item.username,
      name: item.username,
      password: await bcrypt.hash(item.password, 10),
      role: "user", emailVerified: true, onboardingComplete: true,
      gender: "other", interestedIn: "both",
      interestedInConfirmed: true, intent: "casual",
      birthdate: new Date("1990-01-01T00:00:00Z"),
      location: { country: "Pruebas", city: "World Test" },
      interests: ["World Test"],
    });
  }

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use((_, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || origin === cfg.origin),
    // Email/password login currently uses credentials: include in the web client.
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }));
  app.use(express.json({ limit: "16kb" }));
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });

  const authenticate = async (req, res, next) => {
    try {
      const value = req.headers.authorization || "";
      if (!value.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required" });
      const token = jwt.verify(value.slice(7), cfg.jwtSecret, { algorithms: ["HS256"] });
      if (!mongoose.isValidObjectId(token.id)) throw new Error("Invalid user");
      const user = await User.findById(token.id);
      if (!user || user.isBlocked || !cfg.accounts.some((x) => x.email === user.email)) throw new Error("Invalid account");
      req.worldUser = user;
      next();
    } catch {
      return res.status(401).json({ message: "Invalid test session" });
    }
  };

  app.get("/api/health", (_req, res) => res.json({ status: "ok", environment: "world_test", pilot: "isolated" }));
  app.post("/api/auth/login", limiter, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const candidate = cfg.accounts.find((x) => x.email === email);
    if (!candidate || password.length > 200) return res.status(401).json({ message: "Invalid test account" });
    const user = await User.findOne({ email: candidate.email });
    if (!user || user.isBlocked || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: "Invalid test account" });
    }
    return res.json({ token: jwt.sign({ id: String(user._id) }, cfg.jwtSecret, { algorithm: "HS256", expiresIn: "12h" }) });
  });
  app.get("/api/user/me", authenticate, (req, res) => {
    const u = req.worldUser;
    res.json({ _id: String(u._id), id: String(u._id), username: u.username,
      name: u.name, role: u.role, onboardingComplete: true, emailVerified: true });
  });
  app.post("/api/moderation/users/:id/block", limiter, authenticate, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id) || String(req.worldUser._id) === req.params.id) {
      return res.status(400).json({ message: "Invalid target" });
    }
    const target = await User.findById(req.params.id);
    if (!target || !cfg.accounts.some((x) => x.email === target.email)) {
      return res.status(404).json({ message: "Test user not found" });
    }
    await User.updateOne({ _id: req.worldUser._id }, { $addToSet: { blockedUsers: target._id } });
    res.json({ ok: true, blockedUserId: String(target._id) });
  });
  app.post("/api/moderation/report", limiter, authenticate, async (req, res) => {
    const target = String(req.body?.targetId || "");
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    if (req.body?.targetType !== "user" || !reason || !mongoose.isValidObjectId(target) ||
        target === String(req.worldUser._id)) {
      return res.status(400).json({ message: "Invalid report" });
    }
    const other = await User.findById(target);
    if (!other || !cfg.accounts.some((x) => x.email === other.email)) {
      return res.status(404).json({ message: "Test user not found" });
    }
    const report = await Report.create({
      reporter: req.worldUser._id, targetType: "user", targetId: other._id, reason,
    });
    return res.status(201).json({ _id: report._id, status: "pending" });
  });
  // Crucial: never expose the full app API to this disposable test service.
  app.use((_req, res) => res.status(404).json({ message: "Route unavailable in isolated World test" }));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: cfg.origin, methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });
  const authenticateSocket = async (socket, next) => {
    try {
      const value = socket.handshake.auth?.token;
      const token = jwt.verify(value, cfg.jwtSecret, { algorithms: ["HS256"] });
      if (!mongoose.isValidObjectId(token.id)) throw new Error("Invalid user");
      const user = await User.findById(token.id).select("email isBlocked").lean();
      if (!user || user.isBlocked || !cfg.accounts.some((x) => x.email === user.email)) throw new Error("Invalid test account");
      socket._userId = String(token.id);
      next();
    } catch {
      next(new Error("Invalid World Test session"));
    }
  };
  initVcrWorld(io, authenticateSocket); // ONLY the opt-in /vcr namespace
  const port = Number(env.PORT) || 10000;
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
  console.log("[world-test] isolated pilot ready, with no production integrations");
  return { server, io, close: async () => {
    await new Promise((resolve) => io.close(resolve));
    await mongoose.disconnect();
  } };
}

if (require.main === module) {
  startWorldTestServer().catch((error) => {
    // Never print Mongo URI, JWT, email addresses or configured passwords.
    console.error("[world-test] startup rejected:", error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[REDACTED]"));
    process.exitCode = 1;
  });
}

module.exports = { startWorldTestServer };
