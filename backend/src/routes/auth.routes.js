const { Router } = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User.js");
const { generateUniqueUsername } = require("../services/username.service.js");

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.post("/register", authLimiter, async (req, res) => {
  const { username, password } = req.body;
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  if (!username || !email || !password) {
    return res.status(400).json({ message: "username, email y password son requeridos" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashedPassword });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({ message: "Usuario registrado", userId: user._id, token });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0];
      if (field === "email") {
        return res.status(400).json({ message: "Ya existe una cuenta con ese email" });
      }
      if (field === "username") {
        return res.status(400).json({ message: "Ese nombre de usuario ya está en uso" });
      }
      // Unknown or missing duplicate field
      return res.status(400).json({ message: "Ya existe una cuenta con esos datos" });
    }
    console.error("Register error:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  const { password } = req.body;
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  if (!email || !password) {
    return res.status(400).json({ message: "email y password son requeridos" });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    if (user.isBlocked) return res.status(403).json({ message: "Tu cuenta ha sido bloqueada. Contacta al soporte." });

    // Accounts created via Google OAuth have a random hex password (not a bcrypt hash).
    // Detect this early to avoid a misleading "Contraseña incorrecta" or a bcrypt error.
    // All standard bcrypt variants start with "$2a$", "$2b$", or "$2y$".
    if (!user.password || !/^\$2[aby]\$/.test(user.password)) {
      return res.status(400).json({ code: "GOOGLE_ACCOUNT", message: "Esta cuenta fue creada con Google. Por favor, inicia sesión con Google." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Contraseña incorrecta" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/check-admin", authLimiter, async (req, res) => {
  try {
    const adminExists = await User.exists({ role: "admin" });
    res.json({ adminExists: Boolean(adminExists) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/setup", authLimiter, async (req, res) => {
  try {
    // Only allow creating the first admin when no admin account exists yet
    const adminExists = await User.exists({ role: "admin" });
    if (adminExists) {
      return res.status(403).json({
        message: "Ya existe un administrador. El acceso de configuración está deshabilitado.",
      });
    }

    const { username, password } = req.body;
    const email = req.body.email ? req.body.email.trim().toLowerCase() : "";

    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email y password son requeridos" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashedPassword, role: "admin" });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({ message: "Administrador creado correctamente", token });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0];
      if (field === "email") {
        return res.status(400).json({ message: "Ya existe una cuenta con ese email" });
      }
      if (field === "username") {
        return res.status(400).json({ message: "Ese nombre de usuario ya está en uso" });
      }
      return res.status(400).json({ message: "Ya existe una cuenta con esos datos" });
    }
    console.error("Setup error:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.post("/google-session", authLimiter, async (req, res) => {
  const secret = req.headers["x-internal-api-secret"];
  const hasSecret = Boolean(secret);

  // Only enforce the shared secret when it is explicitly configured.
  // This allows the endpoint to work in fresh deployments before the secret is set.
  // The rate limiter above always applies to prevent abuse regardless.
  if (process.env.INTERNAL_API_SECRET && secret !== process.env.INTERNAL_API_SECRET) {
    console.warn("[google-session] Rejected request: invalid x-internal-api-secret");
    return res.status(401).json({ message: "Unauthorized" });
  }

  console.log(`[google-session] Request received – origin: ${req.headers.origin || "(none)"}, secret-present: ${hasSecret}`);
  if (process.env.NODE_ENV !== "production") {
    console.log("[google-session] Request body:", { email: req.body.email, name: req.body.name });
  }

  const { name } = req.body;
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  if (!email) {
    console.warn("[google-session] Missing email in request body");
    return res.status(400).json({ message: "email es requerido" });
  }

  if (!process.env.JWT_SECRET) {
    console.error("[google-session] JWT_SECRET is not set – cannot sign token");
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    let user = await User.findOne({ email });
    if (!user) {
      console.log(`[google-session] Creating new user for email: ${email}`);
      const username = await generateUniqueUsername(email);
      user = await User.create({
        name: name || email.split("@")[0],
        username,
        email,
        password: crypto.randomBytes(32).toString("hex"),
      });
    } else {
      console.log(`[google-session] Existing user found for email: ${email}`);
      if (user.isBlocked) {
        console.warn(`[google-session] Blocked user attempted login: ${email}`);
        return res.status(403).json({ message: "Tu cuenta ha sido bloqueada. Contacta al soporte." });
      }
      let changed = false;
      if (!user.name && name) { user.name = name; changed = true; }
      if (!user.username) {
        user.username = await generateUniqueUsername(email, user._id);
        changed = true;
      }
      if (changed) await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    const safeUser = { id: user._id, email: user.email, name: user.name, username: user.username, role: user.role };
    console.log(`[google-session] Token issued successfully for email: ${email}`);
    res.json({ ok: true, token, user: safeUser });
  } catch (err) {
    console.error("[google-session] Unexpected error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
