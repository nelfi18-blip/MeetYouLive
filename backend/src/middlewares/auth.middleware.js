const jwt = require("jsonwebtoken");
const User = require("../models/User.js");

const sendAuthError = (req, res, status, message, code, error) => {
  if (req.structuredErrors) {
    return res.status(status).json({
      ok: false,
      status,
      error,
      message,
      code,
    });
  }

  return res.status(status).json({ message });
};

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendAuthError(req, res, 401, "Token requerido", "SESSION_EXPIRED", "Unauthorized");
  }

  const token = authHeader.split(" ")[1];

  if (!process.env.JWT_SECRET) {
    return sendAuthError(req, res, 500, "JWT_SECRET no configurado", "AUTH_CONFIG_ERROR", "Auth configuration error");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("isBlocked");
    if (!user) return sendAuthError(req, res, 401, "Token inválido", "SESSION_EXPIRED", "Unauthorized");
    if (user.isBlocked) return sendAuthError(req, res, 403, "Tu cuenta ha sido bloqueada", "AUTH_FAILED", "Forbidden");
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
    return sendAuthError(req, res, 401, "Token inválido", "SESSION_EXPIRED", "Unauthorized");
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
