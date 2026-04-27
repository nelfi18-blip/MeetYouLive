"use strict";

/**
 * Anti-fraud middleware for coin and gift economy protection.
 *
 * Uses in-memory tracking maps (TTL-cleaned) for fast per-request checks plus
 * MongoDB-backed FraudAlert documents for audit and admin review.
 *
 * Checks applied (in order):
 *   1. Self-gifting prevention   — gifts to own account
 *   2. New account restriction   — accounts < 24 h cannot send gifts > 50 coins
 *   3. Rate limit                — max 20 gift transactions per user per minute
 *   4. Velocity check            — flag if user spends > 500 coins in 5 minutes
 *   5. Duplicate detection       — identical gift (sender+recipient+amount) within 10 s
 */

const User = require("../models/User.js");
const FraudAlert = require("../models/FraudAlert.js");

// ─── In-memory tracking (server-restart safe is acceptable) ──────────────────

// Map<userId, { count: number, resetAt: number }>
const giftRateMap = new Map();

// Map<userId, { total: number, resetAt: number }>
const velocityMap = new Map();

// Map<`${userId}:${recipientId}:${amount}`, expiresAt: number>
const dedupMap = new Map();

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const VELOCITY_MAX_COINS = 500;
const VELOCITY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEDUP_WINDOW_MS = 10 * 1000; // 10 seconds
const NEW_ACCOUNT_MAX_COINS = 50; // max per-gift for accounts < 24 h
const NEW_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

// Light TTL cleanup — run every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of giftRateMap) { if (v.resetAt <= now) giftRateMap.delete(k); }
  for (const [k, v] of velocityMap) { if (v.resetAt <= now) velocityMap.delete(k); }
  for (const [k, exp] of dedupMap)  { if (exp <= now)       dedupMap.delete(k);    }
}, 5 * 60 * 1000).unref(); // .unref() so the timer doesn't keep the process alive in tests

// ─── Helper: log alert to DB (fire-and-forget, never throws) ─────────────────

async function logAlert(userId, alertType, severity, details, req, blocked) {
  try {
    await FraudAlert.create({
      userId,
      alertType,
      severity,
      details,
      route: req.originalUrl || req.path || "",
      ip: req.ip || "",
      userAgent: req.headers?.["user-agent"] || "",
      blocked,
    });
  } catch (err) {
    console.error("[fraud] failed to log alert:", err.message);
  }
}

// ─── Helper: extract coin cost from request body ──────────────────────────────

function extractCoinCost(body) {
  // Gift send: coinCost or quantity (quantity * unitCost is handled in controller;
  // here we use a conservative upper-bound from the request for velocity tracking)
  const v = body?.coinCost ?? body?.amount ?? body?.quantity ?? 0;
  return Number(v) || 0;
}

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * Creates anti-fraud middleware.
 *
 * @param {{ checkSelfGift?: boolean, checkNewAccount?: boolean }} [options]
 */
function fraudCheck(options = {}) {
  const { checkSelfGift = false, checkNewAccount = false } = options;

  return async function fraudMiddleware(req, res, next) {
    if (!req.userId) return next(); // unauthenticated — skip (auth middleware will reject)

    const userId = String(req.userId);
    const now = Date.now();

    // ── 1. Self-gifting prevention ──────────────────────────────────────────
    if (checkSelfGift) {
      const recipientId = String(req.body?.recipientId || req.body?.receiverId || "");
      if (recipientId && recipientId === userId) {
        await logAlert(userId, "self_gifting", "medium", { recipientId }, req, true);
        return res.status(400).json({ message: "No puedes enviarte regalos a ti mismo." });
      }
    }

    // ── 2. New account restriction ──────────────────────────────────────────
    if (checkNewAccount) {
      const coinCost = extractCoinCost(req.body);
      if (coinCost > NEW_ACCOUNT_MAX_COINS) {
        try {
          const user = await User.findById(userId).select("createdAt").lean();
          if (user && now - new Date(user.createdAt).getTime() < NEW_ACCOUNT_AGE_MS) {
            await logAlert(
              userId,
              "new_account_restriction",
              "medium",
              { coinCost, maxAllowed: NEW_ACCOUNT_MAX_COINS, accountAgeMs: now - new Date(user.createdAt).getTime() },
              req,
              true
            );
            return res.status(403).json({
              message: "Las cuentas nuevas (menos de 24 horas) no pueden enviar regalos de más de 50 monedas.",
            });
          }
        } catch (err) {
          console.error("[fraud] new account check failed:", err.message);
          // Non-fatal: continue to next check
        }
      }
    }

    // ── 3. Gift rate limiting (20 transactions / user / minute) ────────────
    const rateEntry = giftRateMap.get(userId);
    if (rateEntry && rateEntry.resetAt > now) {
      if (rateEntry.count >= RATE_LIMIT_MAX) {
        await logAlert(
          userId,
          "rate_limit_exceeded",
          "high",
          { count: rateEntry.count, windowMs: RATE_LIMIT_WINDOW_MS },
          req,
          true
        );
        return res.status(429).json({
          message: "Demasiadas transacciones. Por favor espera un momento e inténtalo de nuevo.",
        });
      }
      rateEntry.count += 1;
    } else {
      giftRateMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }

    // ── 4. Velocity check (500 coins in 5 minutes) — flag, don't block ─────
    const coinCost = extractCoinCost(req.body);
    if (coinCost > 0) {
      const velEntry = velocityMap.get(userId);
      if (velEntry && velEntry.resetAt > now) {
        velEntry.total += coinCost;
        if (velEntry.total > VELOCITY_MAX_COINS) {
          // Log as non-blocking "flag" for admin review
          await logAlert(
            userId,
            "velocity_exceeded",
            "high",
            { total: velEntry.total, windowMs: VELOCITY_WINDOW_MS, coinCost },
            req,
            false // flagged but not blocked
          );
          // We continue to allow but the alert is recorded
        }
      } else {
        velocityMap.set(userId, { total: coinCost, resetAt: now + VELOCITY_WINDOW_MS });
      }
    }

    // ── 5. Duplicate detection (same sender + recipient + amount in 10 s) ──
    if (checkSelfGift) {
      const recipientId = String(req.body?.recipientId || req.body?.receiverId || "");
      if (recipientId && coinCost > 0) {
        const dedupKey = `${userId}:${recipientId}:${coinCost}`;
        const expiry = dedupMap.get(dedupKey);
        if (expiry && expiry > now) {
          await logAlert(
            userId,
            "duplicate_transaction",
            "medium",
            { recipientId, coinCost, dedupWindowMs: DEDUP_WINDOW_MS },
            req,
            true
          );
          return res.status(429).json({
            message: "Transacción duplicada detectada. Por favor espera unos segundos antes de volver a intentarlo.",
          });
        }
        dedupMap.set(dedupKey, now + DEDUP_WINDOW_MS);
      }
    }

    next();
  };
}

module.exports = { fraudCheck };
