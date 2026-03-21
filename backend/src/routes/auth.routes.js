const { Router } = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User.js");

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
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
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
    res.status(400).json({ message: err.message });
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

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Contraseña incorrecta" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
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
    const adminExists = await User.exists({ role: "admin" });
    if (adminExists) {
      return res.status(409).json({ message: "Ya existe un administrador" });
    }

    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Nombre de usuario, email y contraseña son requeridos" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await User.create({ username, email, password: hashedPassword, role: "admin" });
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ message: "Administrador creado", token });
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
    res.status(500).json({ message: err.message });
  }
});

router.post("/google-session", async (req, res) => {
  const secret = req.headers["x-nextauth-secret"];
  if (!process.env.NEXTAUTH_SECRET || secret !== process.env.NEXTAUTH_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { name } = req.body;
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  if (!email) {
    return res.status(400).json({ message: "email es requerido" });
  }

  try {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: name || email.split("@")[0],
        email,
        password: crypto.randomBytes(32).toString("hex"),
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const safeUser = { id: user._id, email: user.email, name: user.name, username: user.username, role: user.role };
    res.json({ ok: true, token, user: safeUser });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
