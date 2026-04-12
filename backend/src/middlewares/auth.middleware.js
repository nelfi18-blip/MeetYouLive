const jwt = require("jsonwebtoken");
const User = require("../models/User.js");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token requerido" });
  }

  const token = authHeader.split(" ")[1];

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "JWT_SECRET no configurado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("isBlocked");
    if (!user) return res.status(401).json({ message: "Token inválido" });
    if (user.isBlocked) return res.status(403).json({ message: "Tu cuenta ha sido bloqueada" });
    req.userId = decoded.id;

    // Stamp lastActiveAt and clear any pending reactivation notifications (fire-and-forget)
    User.updateOne(
      { _id: decoded.id },
      {
        lastActiveAt: new Date(),
        "reactivation.day1SentAt": null,
        "reactivation.day2SentAt": null,
        "reactivation.day3SentAt": null,
      }
    ).catch(() => {});

    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido" });
  }
};

// Sets req.userId if a valid Bearer token is present, but does not fail if absent.
const optionalVerifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.split(" ")[1];
  if (!process.env.JWT_SECRET) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("isBlocked");
    if (user && !user.isBlocked) {
      req.userId = decoded.id;
    }
  } catch {
    // ignore invalid token
  }
  next();
};

module.exports = { verifyToken, optionalVerifyToken };
