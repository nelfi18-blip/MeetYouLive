const { Router } = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User.js");
const { generateUniqueUsername } = require("../services/username.service.js");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/email.service.js");

/**
 * Generate a unique 6-character alphanumeric referral code (uppercase).
 * Excludes I, O, 0, 1 to prevent visual confusion between similar characters.
 * The alphabet has exactly 32 characters (2^5), so the bitmask `b & 0x1f` is
 * completely unbiased (256 = 8 × 32) and avoids modulo bias on random bytes.
 */
async function generateReferralCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars (2^5)
  const MAX_ATTEMPTS = 10;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    let code = "";
    const bytes = crypto.randomBytes(6);
    for (const b of bytes) {
      code += chars[b & 0x1f]; // unbiased: 256 / 32 = 8 exactly
    }
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  // Fallback: longer code guaranteed unique via timestamp suffix
  return "MYL" + Date.now().toString(36).toUpperCase().slice(-5);
}

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

const verifyEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { message: "Demasiados intentos. Espera un momento antes de volver a intentarlo." },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Demasiadas solicitudes. Intenta de nuevo más tarde." },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Demasiados intentos. Intenta de nuevo más tarde." },
});

/** Generate a cryptographically random 6-digit numeric code */
function generateSixDigitCode() {
  return String(Math.floor(100000 + (crypto.randomBytes(4).readUInt32BE(0) % 900000)));
}

router.post("/register", authLimiter, async (req, res) => {
  const { username, password, ref } = req.body;
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  if (!username || !email || !password) {
    return res.status(400).json({ message: "username, email y password son requeridos" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
  }
  try {
    // Resolve referrer if a ref code was provided
    let referredBy = null;
    if (ref) {
      const referrer = await User.findOne({ referralCode: ref.trim().toUpperCase() }).select("_id").lean();
      if (referrer) referredBy = referrer._id;
    }

    const code = generateSixDigitCode();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = await generateReferralCode();
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      emailVerified: false,
      emailVerificationCode: code,
      emailVerificationExpires: expires,
      referralCode,
      referredBy,
    });

    // Send verification email (non-blocking — don't fail registration if email fails)
    sendVerificationEmail(email, code).catch((err) => {
      const detail = err && err.code
        ? `${err.code}: ${err.message || "Unknown email error"}`
        : (err && err.message) || "Unknown email error";
      console.error("[register] Failed to send verification email:", detail);
    });

    res.status(201).json({ message: "Cuenta creada. Revisa tu email para verificar tu cuenta.", requiresVerification: true, userId: user._id });
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
    if (!user.password || !/^\$2[aby]\$/.test(user.password)) {
      return res.status(400).json({ code: "GOOGLE_ACCOUNT", message: "Esta cuenta fue creada con Google. Por favor, inicia sesión con Google." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Contraseña incorrecta" });

    // emailVerified === false means a new account that hasn't been verified yet.
    // undefined (old accounts created before this feature) are allowed through.
    if (user.emailVerified === false) {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Debes verificar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.",
        email: user.email,
      });
    }

    // Track login count (fire-and-forget)
    User.findByIdAndUpdate(user._id, { $inc: { loginCount: 1 } }).catch((err) =>
      console.error("[login] Failed to increment loginCount:", err)
    );

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

// Verify email with a 6-digit code
router.post("/verify-email", verifyEmailLimiter, async (req, res) => {
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  const { code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ message: "email y código son requeridos" });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    if (user.emailVerified) {
      // Already verified — issue token so the user can proceed
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
      return res.json({ message: "Email ya verificado", token });
    }
    if (!user.emailVerificationCode || !user.emailVerificationExpires) {
      return res.status(400).json({ message: "No hay código de verificación activo. Solicita uno nuevo." });
    }
    if (new Date() > user.emailVerificationExpires) {
      return res.status(400).json({ code: "CODE_EXPIRED", message: "El código ha caducado. Solicita uno nuevo." });
    }
    if (String(user.emailVerificationCode).trim() !== String(code).trim()) {
      return res.status(400).json({ message: "Código incorrecto. Inténtalo de nuevo." });
    }
    // Mark verified and clear code
    user.emailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationExpires = null;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({ message: "Email verificado correctamente", token });
  } catch (err) {
    console.error("verify-email error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Resend verification email
router.post("/resend-verification", verifyEmailLimiter, async (req, res) => {
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  if (!email) return res.status(400).json({ message: "email es requerido" });
  try {
    const user = await User.findOne({ email });
    if (!user) {
      // Return success to avoid user enumeration
      return res.json({ message: "Si la cuenta existe, se ha reenviado el código." });
    }
    if (user.emailVerified) {
      return res.json({ message: "Tu email ya está verificado. Inicia sesión normalmente." });
    }
    const code = generateSixDigitCode();
    user.emailVerificationCode = code;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    try {
      await sendVerificationEmail(email, code);
    } catch (err) {
      const detail = err && err.code
        ? `${err.code}: ${err.message || "Unknown email error"}`
        : (err && err.message) || "Unknown email error";
      console.error("[resend-verification] Failed to send email:", detail);
      return res.status(503).json({
        code: "EMAIL_DELIVERY_FAILED",
        message: "No se pudo enviar el correo de verificación. Inténtalo de nuevo en unos minutos.",
      });
    }

    res.json({ message: "Código de verificación reenviado. Revisa tu email." });
  } catch (err) {
    console.error("resend-verification error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  if (!email) return res.status(400).json({ message: "email es requerido" });

  const genericMessage = "Si la cuenta existe, te hemos enviado un código de restablecimiento.";

  try {
    const user = await User.findOne({ email });
    if (!user) return res.json({ message: genericMessage });

    const now = Date.now();
    const lastRequestedAt = user.resetPasswordRequestedAt ? new Date(user.resetPasswordRequestedAt).getTime() : 0;
    if (lastRequestedAt && now - lastRequestedAt < 60 * 1000) {
      return res.json({ message: genericMessage });
    }

    const code = generateSixDigitCode();
    user.resetPasswordCode = code;
    user.resetPasswordExpires = new Date(now + 15 * 60 * 1000);
    user.resetPasswordRequestedAt = new Date(now);
    await user.save();

    sendPasswordResetEmail(email, code).catch((err) =>
      console.error("[forgot-password] Failed to send reset email:", err.message)
    );

    return res.json({ message: genericMessage });
  } catch (err) {
    console.error("forgot-password error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  const code = req.body.code ? String(req.body.code).trim() : "";
  const password = req.body.password ? String(req.body.password) : "";

  if (!email || !code || !password) {
    return res.status(400).json({ message: "email, código y password son requeridos" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordCode || !user.resetPasswordExpires) {
      return res.status(400).json({ message: "Código inválido o caducado." });
    }

    if (new Date() > user.resetPasswordExpires) {
      return res.status(400).json({ message: "Código inválido o caducado." });
    }

    if (String(user.resetPasswordCode).trim() !== code) {
      return res.status(400).json({ message: "Código inválido o caducado." });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordCode = null;
    user.resetPasswordExpires = null;
    user.resetPasswordRequestedAt = null;
    await user.save();

    return res.json({ message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
  } catch (err) {
    console.error("reset-password error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
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
  const ref = req.body.ref || null;
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
      const referralCode = await generateReferralCode();

      let referredBy = null;
      if (ref) {
        const referrer = await User.findOne({ referralCode: ref.trim().toUpperCase() }).select("_id").lean();
        if (referrer) referredBy = referrer._id;
      }

      user = await User.create({
        name: name || email.split("@")[0],
        username,
        email,
        password: crypto.randomBytes(32).toString("hex"),
        referralCode,
        referredBy,
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
      if (!user.referralCode) {
        user.referralCode = await generateReferralCode();
        changed = true;
      }
      if (changed) await user.save();
      // Track login count (fire-and-forget)
      User.findByIdAndUpdate(user._id, { $inc: { loginCount: 1 } }).catch((err) =>
        console.error("[google-session] Failed to increment loginCount:", err)
      );
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
