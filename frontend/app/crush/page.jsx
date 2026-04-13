"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/Badge";
import MatchModal from "@/components/MatchModal";
import socket from "@/lib/socket";
import HiddenLikesSection from "@/components/HiddenLikesSection";
import ActivityBar from "@/components/ActivityBar";
import StatusBadges from "@/components/StatusBadges";
import { computeStatusBadges } from "@/lib/statusBadges";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const USERS_PER_PAGE = 20;
const ACTION_FEEDBACK_DURATION_MS = 700;
const ACTIVITY_BANNER_DURATION_MS = 3500;
const DAILY_FREE_SWIPES = 20;
const EXTRA_SWIPES_BATCH = 10;
const DAILY_LOGIN_REWARD_COINS = 5;

// Messages that rotate in the done-state
const DONE_MESSAGES = [
  { icon: "🔥", text: "Nuevas personas pronto" },
  { icon: "💎", text: "Desbloquea más perfiles" },
  { icon: "🎥", text: "Entra a directos mientras tanto" },
];

// ─── localStorage swipe limit helpers ────────────────────────────────────────
function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getSwipeState() {
  if (typeof window === "undefined") return { date: getTodayKey(), count: 0, extra: 0 };
  try {
    const raw = localStorage.getItem("crush_swipes");
    const parsed = raw ? JSON.parse(raw) : null;
    const today = getTodayKey();
    if (parsed?.date === today) return parsed;
    return { date: today, count: 0, extra: 0 };
  } catch {
    return { date: getTodayKey(), count: 0, extra: 0 };
  }
}
function saveSwipeState(state) {
  if (typeof window === "undefined") return;
  localStorage.setItem("crush_swipes", JSON.stringify(state));
}
function incrementSwipeCount() {
  const s = getSwipeState();
  s.count += 1;
  saveSwipeState(s);
  return s;
}
function addExtraSwipes(n) {
  const s = getSwipeState();
  s.extra = (s.extra || 0) + n;
  saveSwipeState(s);
  return s;
}
function getRemainingSwipes() {
  const s = getSwipeState();
  const used = s.count || 0;
  const extra = s.extra || 0;
  const total = DAILY_FREE_SWIPES + extra;
  return Math.max(0, total - used);
}

// ─── Daily login reward helpers ───────────────────────────────────────────────
function getDailyRewardKey() { return `crush_daily_reward_${getTodayKey()}`; }
function checkAndClaimDailyReward() {
  if (typeof window === "undefined") return false;
  const key = getDailyRewardKey();
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, "1");
  return true;
}

/** Calculate age from a birthdate string/Date. Returns null if not available. */
function calcAge(birthdate) {
  if (!birthdate) return null;
  const bd = new Date(birthdate);
  if (isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age -= 1;
  return age > 0 ? age : null;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function PassIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function HeartIcon({ filled = false }) {
  return filled ? (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  ) : (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

// ─── SuperCrushConfirmModal ───────────────────────────────────────────────────
function SuperCrushConfirmModal({ user, price, coins, loading, onConfirm, onCancel }) {
  const displayName = user?.username || user?.name || "Usuario";
  const hasBalance = coins === null || coins >= price;

  return (
    <div className="sc-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="sc-modal">
        <div className="sc-glow" aria-hidden="true" />
        <div className="sc-icon">⚡</div>
        <h3 className="sc-title">Super Crush</h3>
        <p className="sc-desc">
          Destácate entre todos y haz que <strong>{displayName}</strong> sepa que eres especial.
        </p>

        <div className="sc-price-row">
          <span className="sc-price-label">Costo</span>
          <span className="sc-price-value">🪙 {price} monedas</span>
        </div>

        {coins !== null && (
          <div className="sc-balance-row">
            <span className="sc-balance-label">Tu saldo</span>
            <span className={`sc-balance-value${hasBalance ? "" : " sc-balance-low"}`}>
              🪙 {coins} monedas
            </span>
          </div>
        )}

        {!hasBalance && (
          <div className="sc-insufficient">
            <span className="sc-insuf-icon">⚠️</span>
            <span>Saldo insuficiente.</span>
            <Link href="/coins" className="sc-buy-link" onClick={onCancel}>Comprar monedas →</Link>
          </div>
        )}

        <div className="sc-actions">
          <button className="sc-btn sc-btn-cancel" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button
            className="sc-btn sc-btn-confirm"
            onClick={onConfirm}
            disabled={loading || !hasBalance}
          >
            {loading ? "Enviando…" : `⚡ Enviar · 🪙${price}`}
          </button>
        </div>
      </div>

      <style jsx>{`
        .sc-overlay {
          position: fixed;
          inset: 0;
          z-index: 3000;
          background: rgba(4,0,14,0.82);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
        }
        .sc-modal {
          position: relative;
          background: linear-gradient(155deg, #130525 0%, #0b0219 100%);
          border: 1px solid rgba(251,191,36,0.4);
          border-radius: 22px;
          padding: 2rem 1.75rem 1.5rem;
          max-width: 360px;
          width: 100%;
          text-align: center;
          box-shadow: 0 0 60px rgba(251,191,36,0.18), 0 0 120px rgba(224,64,251,0.1);
          animation: sc-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
          overflow: hidden;
        }
        @keyframes sc-pop {
          from { transform: scale(0.75); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        .sc-glow {
          position: absolute;
          top: -40%;
          left: 50%;
          transform: translateX(-50%);
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .sc-icon {
          font-size: 2.8rem;
          margin-bottom: 0.5rem;
          animation: sc-pulse 1.5s ease-in-out infinite;
        }
        @keyframes sc-pulse {
          0%,100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(251,191,36,0.5)); }
          50%     { transform: scale(1.15); filter: drop-shadow(0 0 18px rgba(251,191,36,0.8)); }
        }
        .sc-title {
          font-size: 1.35rem;
          font-weight: 900;
          color: #fbbf24;
          margin: 0 0 0.5rem;
          letter-spacing: 0.03em;
        }
        .sc-desc {
          font-size: 0.83rem;
          color: rgba(255,255,255,0.6);
          margin: 0 0 1.25rem;
          line-height: 1.5;
        }
        .sc-desc strong { color: rgba(255,255,255,0.85); }
        .sc-price-row, .sc-balance-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          border-radius: 10px;
          margin-bottom: 0.4rem;
        }
        .sc-price-row {
          background: rgba(251,191,36,0.07);
          border: 1px solid rgba(251,191,36,0.2);
        }
        .sc-balance-row {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .sc-price-label, .sc-balance-label {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.45);
          font-weight: 600;
        }
        .sc-price-value {
          font-size: 0.9rem;
          font-weight: 800;
          color: #fbbf24;
        }
        .sc-balance-value {
          font-size: 0.85rem;
          font-weight: 700;
          color: rgba(255,255,255,0.7);
        }
        .sc-balance-low { color: #f87171 !important; }
        .sc-insufficient {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 0.75rem;
          border-radius: 10px;
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.25);
          margin: 0.5rem 0;
          font-size: 0.78rem;
          color: #f87171;
          flex-wrap: wrap;
        }
        .sc-insuf-icon { font-size: 0.9rem; }
        .sc-buy-link {
          color: #fbbf24;
          text-decoration: none;
          font-weight: 700;
          margin-left: auto;
        }
        .sc-buy-link:hover { text-decoration: underline; }
        .sc-actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 1.25rem;
        }
        .sc-btn {
          flex: 1;
          padding: 0.75rem 0.5rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid;
          transition: all 0.2s;
        }
        .sc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sc-btn-cancel {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.5);
        }
        .sc-btn-cancel:hover:not(:disabled) {
          background: rgba(255,255,255,0.08);
        }
        .sc-btn-confirm {
          background: linear-gradient(135deg, rgba(251,191,36,0.2), rgba(224,64,251,0.2));
          border-color: rgba(251,191,36,0.6);
          color: #fbbf24;
          box-shadow: 0 0 18px rgba(251,191,36,0.2);
        }
        .sc-btn-confirm:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(251,191,36,0.32), rgba(224,64,251,0.32));
          box-shadow: 0 0 32px rgba(251,191,36,0.35);
        }
      `}</style>
    </div>
  );
}

// ─── CrushActivityBanner ──────────────────────────────────────────────────────
function CrushActivityBanner({ event, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, ACTIVITY_BANNER_DURATION_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!event) return null;
  const isSuper = event.type === "super";

  return (
    <div className={`cab${isSuper ? " cab-super" : ""}`} role="status">
      <span className="cab-icon">{isSuper ? "⚡" : "💘"}</span>
      <span className="cab-text">
        {isSuper
          ? `¡${event.username} te envió un Super Crush!`
          : `¡Alguien te acaba de dar like!`}
      </span>
      <button className="cab-close" onClick={onDismiss} aria-label="Cerrar">✕</button>

      <style jsx>{`
        .cab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1rem;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(255,45,120,0.12), rgba(224,64,251,0.12));
          border: 1px solid rgba(255,45,120,0.3);
          font-size: 0.82rem;
          color: rgba(255,255,255,0.85);
          animation: cab-slide 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .cab-super {
          background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(224,64,251,0.12));
          border-color: rgba(251,191,36,0.35);
        }
        @keyframes cab-slide {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cab-icon { font-size: 1rem; }
        .cab-text { flex: 1; font-weight: 600; }
        .cab-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.35);
          cursor: pointer;
          font-size: 0.75rem;
          padding: 0;
          line-height: 1;
        }
        .cab-close:hover { color: rgba(255,255,255,0.65); }
      `}</style>
    </div>
  );
}

// ─── SwipeLimitModal ──────────────────────────────────────────────────────────
function SwipeLimitModal({ coins, extraSwipesPrice, extraSwipesBatch, loading, onUnlock, onClose }) {
  const hasCoins = coins !== null && coins >= extraSwipesPrice;
  const msUntilMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);
    return midnight - now;
  };
  const [timeLeft, setTimeLeft] = useState(() => {
    const ms = msUntilMidnight();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  });
  useEffect(() => {
    const id = setInterval(() => {
      const ms = msUntilMidnight();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setTimeLeft(`${h}h ${m}m`);
    }, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sl-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sl-modal">
        <div className="sl-glow" aria-hidden="true" />
        <div className="sl-icon">🔥</div>
        <h3 className="sl-title">¡Límite diario alcanzado!</h3>
        <p className="sl-desc">Has usado tus {DAILY_FREE_SWIPES} swipes diarios gratuitos.</p>

        <div className="sl-options">
          <div className="sl-option sl-option-coins">
            <div className="sl-opt-icon">🪙</div>
            <div className="sl-opt-body">
              <p className="sl-opt-title">Desbloquear {extraSwipesBatch} swipes</p>
              <p className="sl-opt-price">{extraSwipesPrice} monedas</p>
            </div>
            <button
              className="sl-opt-btn sl-btn-coins"
              onClick={onUnlock}
              disabled={loading || !hasCoins}
            >
              {loading ? "…" : hasCoins ? "Usar" : "Sin saldo"}
            </button>
          </div>
          {!hasCoins && (
            <Link href="/coins" className="sl-buy-link" onClick={onClose}>
              + Comprar monedas →
            </Link>
          )}
          <div className="sl-option sl-option-timer">
            <div className="sl-opt-icon">⏳</div>
            <div className="sl-opt-body">
              <p className="sl-opt-title">Esperar reset gratuito</p>
              <p className="sl-opt-price">Disponible en {timeLeft}</p>
            </div>
          </div>
        </div>

        <div className="sl-alt-actions">
          <Link href="/live" className="sl-alt-btn" onClick={onClose}>🎥 Ver directos</Link>
          <Link href="/matches" className="sl-alt-btn" onClick={onClose}>💖 Ver matches</Link>
        </div>

        <button className="sl-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>

        <style jsx>{`
          .sl-overlay {
            position: fixed; inset: 0; z-index: 3000;
            background: rgba(4,0,14,0.88);
            backdrop-filter: blur(12px);
            display: flex; align-items: center; justify-content: center;
            padding: 1.25rem;
          }
          .sl-modal {
            position: relative;
            background: linear-gradient(155deg, #130525 0%, #0b0219 100%);
            border: 1px solid rgba(255,45,120,0.35);
            border-radius: 22px;
            padding: 2rem 1.75rem 1.5rem;
            max-width: 360px; width: 100%;
            text-align: center;
            box-shadow: 0 0 60px rgba(255,45,120,0.15), 0 0 120px rgba(224,64,251,0.08);
            animation: sl-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
            overflow: hidden;
          }
          @keyframes sl-pop {
            from { transform: scale(0.75); opacity: 0; }
            to   { transform: scale(1); opacity: 1; }
          }
          .sl-glow {
            position: absolute; top: -40%; left: 50%;
            transform: translateX(-50%);
            width: 200px; height: 200px; border-radius: 50%;
            background: radial-gradient(circle, rgba(255,45,120,0.15) 0%, transparent 70%);
            pointer-events: none;
          }
          .sl-icon { font-size: 2.8rem; margin-bottom: 0.5rem; animation: sl-pulse 2s ease-in-out infinite; }
          @keyframes sl-pulse {
            0%,100% { transform: scale(1); }
            50% { transform: scale(1.12); }
          }
          .sl-title { font-size: 1.2rem; font-weight: 900; color: #fff; margin: 0 0 0.4rem; }
          .sl-desc { font-size: 0.82rem; color: rgba(255,255,255,0.52); margin: 0 0 1.25rem; }
          .sl-options { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem; }
          .sl-option {
            display: flex; align-items: center; gap: 0.75rem;
            padding: 0.75rem 1rem; border-radius: 14px; text-align: left;
          }
          .sl-option-coins { background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.22); }
          .sl-option-timer { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
          .sl-opt-icon { font-size: 1.4rem; flex-shrink: 0; }
          .sl-opt-body { flex: 1; min-width: 0; }
          .sl-opt-title { font-size: 0.82rem; font-weight: 700; color: rgba(255,255,255,0.85); margin: 0; }
          .sl-opt-price { font-size: 0.72rem; color: rgba(255,255,255,0.45); margin: 0.1rem 0 0; }
          .sl-opt-btn {
            flex-shrink: 0; padding: 0.42rem 0.9rem;
            border-radius: 999px; font-size: 0.78rem; font-weight: 700;
            cursor: pointer; border: 1px solid; transition: all 0.2s;
          }
          .sl-opt-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .sl-btn-coins {
            background: rgba(251,191,36,0.12); border-color: rgba(251,191,36,0.45); color: #fbbf24;
          }
          .sl-btn-coins:hover:not(:disabled) {
            background: rgba(251,191,36,0.22); box-shadow: 0 0 14px rgba(251,191,36,0.3);
          }
          .sl-buy-link {
            display: block; font-size: 0.75rem; font-weight: 700;
            color: #fbbf24; text-decoration: none; text-align: center; margin-top: -0.2rem;
          }
          .sl-buy-link:hover { text-decoration: underline; }
          .sl-alt-actions {
            display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;
          }
          .sl-alt-btn {
            padding: 0.45rem 1rem; border-radius: 999px;
            border: 1px solid rgba(255,45,120,0.28);
            background: rgba(255,45,120,0.07);
            color: rgba(255,255,255,0.7); font-size: 0.78rem; font-weight: 700;
            text-decoration: none; transition: all 0.2s;
          }
          .sl-alt-btn:hover { background: rgba(255,45,120,0.16); color: #fff; }
          .sl-close-btn {
            position: absolute; top: 0.85rem; right: 0.9rem;
            background: none; border: none; color: rgba(255,255,255,0.3);
            cursor: pointer; font-size: 0.85rem; line-height: 1; padding: 0.25rem;
          }
          .sl-close-btn:hover { color: rgba(255,255,255,0.65); }
        `}</style>
      </div>
    </div>
  );
}

// ─── BoostModal ───────────────────────────────────────────────────────────────
function BoostModal({
  coins,
  boostPrice,
  boostPacks,
  storedBoosts,
  activeBoostCount,
  isBoosted,
  boostUntil,
  loading,
  packLoading,
  onBoost,
  onBuyPack,
  onClose,
}) {
  const [countdown, setCountdown] = useState("");
  const [packTab, setPackTab] = useState(false); // false = activate, true = buy packs

  useEffect(() => {
    if (!boostUntil) return;
    const tick = () => {
      const ms = new Date(boostUntil) - Date.now();
      if (ms <= 0) { setCountdown(""); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setCountdown(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [boostUntil]);

  const hasCoins = coins !== null && coins >= boostPrice;
  const hasStoredBoost = storedBoosts > 0;
  const canActivate = hasStoredBoost || hasCoins;

  const packs = boostPacks || [
    { quantity: 1, coins: 100, label: "1 Boost", badge: null },
    { quantity: 3, coins: 250, label: "3 Boosts", badge: "Descuento" },
    { quantity: 5, coins: 400, label: "5 Boosts", badge: "Mejor valor" },
  ];

  return (
    <div className="bm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bm-modal${isBoosted ? " bm-modal-active" : ""}`}>
        <div className="bm-glow" aria-hidden="true" />

        {/* Live activity indicator */}
        {activeBoostCount !== null && (
          <div className="bm-live-count">
            🔥 <strong>{activeBoostCount}</strong> personas están usando Boost ahora
          </div>
        )}

        <div className="bm-icon">🚀</div>
        <h3 className="bm-title">Boost Crush</h3>

        {/* Urgency phrases */}
        {!isBoosted && (
          <div className="bm-urgency-phrases">
            <span>🔥 Destácate ahora</span>
            <span>💖 Aumenta tus matches</span>
            <span>⚡ Más visibilidad en tiempo real</span>
          </div>
        )}

        <p className="bm-desc">
          Aparece primero en la lista de perfiles · Más visibilidad · Más matches en 30 min
        </p>

        {isBoosted && countdown ? (
          <div className="bm-active-countdown">
            <div className="bm-active">
              <span className="bm-active-icon">✅</span>
              <span>Boost activo</span>
            </div>
            <div className="bm-countdown">
              <span className="bm-countdown-label">Tiempo restante</span>
              <span className="bm-countdown-value">{countdown}</span>
            </div>
          </div>
        ) : (
          <>
            {/* Stored boosts indicator */}
            {storedBoosts > 0 && (
              <div className="bm-stored">
                <span className="bm-stored-icon">🎯</span>
                <span>Tienes <strong>{storedBoosts}</strong> boost{storedBoosts > 1 ? "s" : ""} guardado{storedBoosts > 1 ? "s" : ""}</span>
              </div>
            )}

            {/* Tab switcher */}
            <div className="bm-tabs">
              <button
                className={`bm-tab${!packTab ? " bm-tab-active" : ""}`}
                onClick={() => setPackTab(false)}
              >
                Activar
              </button>
              <button
                className={`bm-tab${packTab ? " bm-tab-active" : ""}`}
                onClick={() => setPackTab(true)}
              >
                Comprar packs
              </button>
            </div>

            {!packTab ? (
              /* Activate tab */
              <>
                {hasStoredBoost ? (
                  <div className="bm-free-note">
                    <span>⚡ Se usará 1 boost guardado (sin costo)</span>
                  </div>
                ) : (
                  <>
                    <div className="bm-price-row">
                      <span className="bm-price-label">Costo directo</span>
                      <span className="bm-price-value">🪙 {boostPrice} monedas</span>
                    </div>
                    {coins !== null && (
                      <div className="bm-balance-row">
                        <span className="bm-balance-label">Tu saldo</span>
                        <span className={`bm-balance-value${!hasCoins ? " bm-low" : ""}`}>
                          🪙 {coins} monedas
                        </span>
                      </div>
                    )}
                    {!hasCoins && (
                      <div className="bm-insufficient">
                        <span>⚠️ Saldo insuficiente</span>
                        <Link href="/coins" className="bm-buy-link" onClick={onClose}>Comprar monedas →</Link>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              /* Buy packs tab */
              <div className="bm-packs">
                {packs.map((pack) => {
                  const isLoading = packLoading === pack.quantity;
                  const canAfford = coins !== null && coins >= pack.coins;
                  return (
                    <button
                      key={pack.quantity}
                      className={`bm-pack-btn${pack.badge === "Mejor valor" ? " bm-pack-best" : ""}`}
                      onClick={() => onBuyPack(pack.quantity)}
                      disabled={!canAfford || !!packLoading}
                    >
                      {pack.badge && <span className="bm-pack-badge">{pack.badge}</span>}
                      <span className="bm-pack-label">{pack.label}</span>
                      <span className="bm-pack-cost">🪙 {pack.coins}</span>
                      {isLoading && <span className="spinner spinner-sm" />}
                    </button>
                  );
                })}
                {coins !== null && (
                  <div className="bm-pack-balance">Tu saldo: 🪙 {coins}</div>
                )}
              </div>
            )}
          </>
        )}

        <div className="bm-actions">
          <button className="bm-btn bm-btn-cancel" onClick={onClose} disabled={loading || !!packLoading}>
            {isBoosted ? "Cerrar" : "Cancelar"}
          </button>
          {!isBoosted && !packTab && (
            <button
              className="bm-btn bm-btn-confirm"
              onClick={onBoost}
              disabled={loading || !!packLoading || !canActivate}
            >
              {loading ? "Activando…" : hasStoredBoost ? "🚀 Activar boost" : `🚀 Boost · 🪙${boostPrice}`}
            </button>
          )}
        </div>

        <style jsx>{`
          .bm-overlay {
            position: fixed; inset: 0; z-index: 3000;
            background: rgba(4,0,14,0.85); backdrop-filter: blur(12px);
            display: flex; align-items: center; justify-content: center; padding: 1.25rem;
          }
          .bm-modal {
            position: relative;
            background: linear-gradient(155deg, #130525 0%, #0b0219 100%);
            border: 1px solid rgba(224,64,251,0.4); border-radius: 22px;
            padding: 1.5rem 1.75rem 1.5rem; max-width: 380px; width: 100%;
            text-align: center;
            box-shadow: 0 0 60px rgba(224,64,251,0.18), 0 0 120px rgba(255,45,120,0.08);
            animation: bm-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
            overflow: hidden;
          }
          .bm-modal-active {
            border-color: rgba(52,211,153,0.5);
            box-shadow: 0 0 60px rgba(52,211,153,0.15), 0 0 120px rgba(52,211,153,0.08);
            animation: bm-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both, bm-glow-pulse 2s ease-in-out infinite;
          }
          @keyframes bm-glow-pulse {
            0%, 100% { box-shadow: 0 0 60px rgba(52,211,153,0.15), 0 0 120px rgba(52,211,153,0.08); }
            50% { box-shadow: 0 0 80px rgba(52,211,153,0.3), 0 0 140px rgba(52,211,153,0.15); }
          }
          @keyframes bm-pop {
            from { transform: scale(0.75); opacity: 0; }
            to   { transform: scale(1); opacity: 1; }
          }
          .bm-glow {
            position: absolute; top: -40%; left: 50%; transform: translateX(-50%);
            width: 200px; height: 200px; border-radius: 50%;
            background: radial-gradient(circle, rgba(224,64,251,0.18) 0%, transparent 70%);
            pointer-events: none;
          }
          .bm-live-count {
            font-size: 0.72rem; color: rgba(255,255,255,0.65); margin-bottom: 0.6rem;
            background: rgba(255,100,0,0.08); border: 1px solid rgba(255,100,0,0.22);
            border-radius: 20px; padding: 0.3rem 0.75rem; display: inline-block;
          }
          .bm-live-count strong { color: #fb923c; }
          .bm-icon { font-size: 2.8rem; margin-bottom: 0.3rem; animation: bm-pulse 1.8s ease-in-out infinite; }
          @keyframes bm-pulse {
            0%,100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(224,64,251,0.5)); }
            50% { transform: scale(1.15); filter: drop-shadow(0 0 18px rgba(224,64,251,0.9)); }
          }
          .bm-title { font-size: 1.35rem; font-weight: 900; color: #e040fb; margin: 0 0 0.35rem; }
          .bm-urgency-phrases {
            display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center;
            margin-bottom: 0.6rem;
          }
          .bm-urgency-phrases span {
            font-size: 0.7rem; font-weight: 700;
            background: rgba(224,64,251,0.1); border: 1px solid rgba(224,64,251,0.3);
            border-radius: 20px; padding: 0.2rem 0.55rem; color: rgba(255,255,255,0.8);
          }
          .bm-desc { font-size: 0.78rem; color: rgba(255,255,255,0.45); margin: 0 0 1rem; line-height: 1.5; }
          .bm-active-countdown { margin-bottom: 1rem; }
          .bm-active {
            display: flex; align-items: center; gap: 0.5rem; justify-content: center;
            padding: 0.55rem; border-radius: 10px;
            background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.3);
            color: #34d399; font-size: 0.85rem; font-weight: 700; margin-bottom: 0.5rem;
          }
          .bm-countdown {
            display: flex; flex-direction: column; align-items: center; gap: 0.1rem;
          }
          .bm-countdown-label { font-size: 0.65rem; color: rgba(255,255,255,0.35); font-weight: 600; }
          .bm-countdown-value {
            font-size: 2rem; font-weight: 900; color: #34d399;
            font-variant-numeric: tabular-nums;
            text-shadow: 0 0 16px rgba(52,211,153,0.5);
          }
          .bm-stored {
            display: flex; align-items: center; gap: 0.5rem; justify-content: center;
            padding: 0.5rem 0.75rem; border-radius: 10px; margin-bottom: 0.75rem;
            background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.25);
            font-size: 0.8rem; color: rgba(255,255,255,0.75);
          }
          .bm-stored-icon { font-size: 1rem; }
          .bm-stored strong { color: #fbbf24; }
          .bm-tabs {
            display: flex; border-radius: 10px; overflow: hidden;
            border: 1px solid rgba(255,255,255,0.1); margin-bottom: 0.85rem;
          }
          .bm-tab {
            flex: 1; padding: 0.5rem; font-size: 0.75rem; font-weight: 700; cursor: pointer;
            background: transparent; border: none; color: rgba(255,255,255,0.4); transition: all 0.2s;
          }
          .bm-tab-active { background: rgba(224,64,251,0.15); color: #e040fb; }
          .bm-free-note {
            padding: 0.6rem 0.75rem; border-radius: 10px; margin-bottom: 0.75rem;
            background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.25);
            font-size: 0.8rem; color: #fbbf24; font-weight: 700;
          }
          .bm-price-row, .bm-balance-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.5rem 0.75rem; border-radius: 10px; margin-bottom: 0.4rem;
          }
          .bm-price-row { background: rgba(224,64,251,0.07); border: 1px solid rgba(224,64,251,0.2); }
          .bm-balance-row { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); }
          .bm-price-label, .bm-balance-label { font-size: 0.75rem; color: rgba(255,255,255,0.45); font-weight: 600; }
          .bm-price-value { font-size: 0.9rem; font-weight: 800; color: #e040fb; }
          .bm-balance-value { font-size: 0.85rem; font-weight: 700; color: rgba(255,255,255,0.7); }
          .bm-low { color: #f87171 !important; }
          .bm-insufficient {
            display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
            padding: 0.6rem 0.75rem; border-radius: 10px; margin: 0.5rem 0;
            background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.25);
            font-size: 0.78rem; color: #f87171;
          }
          .bm-buy-link { color: #fbbf24; text-decoration: none; font-weight: 700; margin-left: auto; }
          .bm-buy-link:hover { text-decoration: underline; }
          .bm-packs { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem; }
          .bm-pack-btn {
            position: relative; display: flex; align-items: center; gap: 0.6rem;
            padding: 0.65rem 0.9rem; border-radius: 12px; cursor: pointer;
            background: rgba(224,64,251,0.07); border: 1px solid rgba(224,64,251,0.25);
            color: rgba(255,255,255,0.8); font-size: 0.82rem; font-weight: 700; text-align: left;
            transition: all 0.2s;
          }
          .bm-pack-btn:hover:not(:disabled) {
            background: rgba(224,64,251,0.15); border-color: rgba(224,64,251,0.5);
          }
          .bm-pack-btn:disabled { opacity: 0.45; cursor: not-allowed; }
          .bm-pack-best {
            background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.4);
          }
          .bm-pack-best:hover:not(:disabled) {
            background: rgba(251,191,36,0.16); border-color: rgba(251,191,36,0.6);
          }
          .bm-pack-badge {
            position: absolute; top: -8px; right: 10px;
            font-size: 0.6rem; font-weight: 800; color: #fbbf24;
            background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.35);
            border-radius: 20px; padding: 0.1rem 0.45rem;
          }
          .bm-pack-label { flex: 1; }
          .bm-pack-cost { color: #e040fb; font-size: 0.85rem; }
          .bm-pack-balance {
            font-size: 0.72rem; color: rgba(255,255,255,0.35); text-align: right; margin-top: 0.15rem;
          }
          .bm-actions { display: flex; gap: 0.6rem; margin-top: 1.1rem; }
          .bm-btn {
            flex: 1; padding: 0.75rem 0.5rem; border-radius: 12px;
            font-size: 0.85rem; font-weight: 700; cursor: pointer; border: 1px solid; transition: all 0.2s;
          }
          .bm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .bm-btn-cancel {
            background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.5);
          }
          .bm-btn-cancel:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
          .bm-btn-confirm {
            background: linear-gradient(135deg, rgba(224,64,251,0.2), rgba(255,45,120,0.2));
            border-color: rgba(224,64,251,0.6); color: #e040fb;
            box-shadow: 0 0 18px rgba(224,64,251,0.25);
          }
          .bm-btn-confirm:hover:not(:disabled) {
            background: linear-gradient(135deg, rgba(224,64,251,0.35), rgba(255,45,120,0.35));
            box-shadow: 0 0 32px rgba(224,64,251,0.45);
          }
          .spinner-sm { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #e040fb; border-radius: 50%; animation: spin 0.7s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}

// ─── BoostResultModal ─────────────────────────────────────────────────────────
function BoostResultModal({ result, onClose }) {
  return (
    <div className="br-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="br-modal">
        <div className="br-glow" aria-hidden="true" />
        <div className="br-icon">🚀</div>
        <h3 className="br-title">Resultado de tu Boost</h3>
        <p className="br-subtitle">Tu perfil brilló durante 30 minutos</p>

        <div className="br-stats">
          <div className="br-stat">
            <span className="br-stat-value">{result.matchesGained}</span>
            <span className="br-stat-label">💗 Matches ganados</span>
          </div>
          <div className="br-stat">
            <span className="br-stat-value">{result.profileViews}</span>
            <span className="br-stat-label">👀 Vistas de perfil</span>
          </div>
          <div className="br-stat">
            <span className="br-stat-value">{result.chatsStarted}</span>
            <span className="br-stat-label">💬 Chats iniciados</span>
          </div>
        </div>

        <button className="br-btn" onClick={onClose}>¡Genial! 🎉</button>

        <style jsx>{`
          .br-overlay {
            position: fixed; inset: 0; z-index: 3100;
            background: rgba(4,0,14,0.88); backdrop-filter: blur(14px);
            display: flex; align-items: center; justify-content: center; padding: 1.25rem;
          }
          .br-modal {
            position: relative;
            background: linear-gradient(155deg, #0e1f14 0%, #070d10 100%);
            border: 1px solid rgba(52,211,153,0.45); border-radius: 22px;
            padding: 2rem 1.75rem 1.5rem; max-width: 340px; width: 100%;
            text-align: center;
            box-shadow: 0 0 60px rgba(52,211,153,0.18), 0 0 120px rgba(52,211,153,0.08);
            animation: br-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
            overflow: hidden;
          }
          @keyframes br-pop {
            from { transform: scale(0.7) translateY(20px); opacity: 0; }
            to   { transform: scale(1) translateY(0); opacity: 1; }
          }
          .br-glow {
            position: absolute; top: -40%; left: 50%; transform: translateX(-50%);
            width: 220px; height: 220px; border-radius: 50%;
            background: radial-gradient(circle, rgba(52,211,153,0.18) 0%, transparent 70%);
            pointer-events: none;
          }
          .br-icon { font-size: 3rem; margin-bottom: 0.35rem; animation: br-bounce 0.6s ease-out both; }
          @keyframes br-bounce {
            0% { transform: scale(0) rotate(-20deg); }
            70% { transform: scale(1.2) rotate(5deg); }
            100% { transform: scale(1) rotate(0); }
          }
          .br-title { font-size: 1.3rem; font-weight: 900; color: #34d399; margin: 0 0 0.2rem; }
          .br-subtitle { font-size: 0.78rem; color: rgba(255,255,255,0.4); margin: 0 0 1.5rem; }
          .br-stats {
            display: flex; gap: 0.75rem; justify-content: center; margin-bottom: 1.5rem;
          }
          .br-stat {
            flex: 1; background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.2);
            border-radius: 14px; padding: 0.85rem 0.5rem; display: flex; flex-direction: column; gap: 0.3rem;
          }
          .br-stat-value { font-size: 1.9rem; font-weight: 900; color: #34d399; line-height: 1; }
          .br-stat-label { font-size: 0.62rem; color: rgba(255,255,255,0.5); font-weight: 600; line-height: 1.3; }
          .br-btn {
            width: 100%; padding: 0.85rem; border-radius: 14px; font-size: 0.9rem; font-weight: 800;
            cursor: pointer; border: 1px solid rgba(52,211,153,0.5);
            background: linear-gradient(135deg, rgba(52,211,153,0.18), rgba(52,211,153,0.08));
            color: #34d399;
            box-shadow: 0 0 18px rgba(52,211,153,0.2);
            transition: all 0.2s;
          }
          .br-btn:hover { background: linear-gradient(135deg, rgba(52,211,153,0.28), rgba(52,211,153,0.14)); box-shadow: 0 0 28px rgba(52,211,153,0.35); }
        `}</style>
      </div>
    </div>
  );
}

// ─── DailyRewardBanner ───────────────────────────────────────────────────────
function DailyRewardBanner({ onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="drb" role="status" aria-live="polite">
      <span className="drb-icon">🎁</span>
      <div className="drb-body">
        <span className="drb-title">¡Recompensa diaria!</span>
        <span className="drb-desc">+{DAILY_LOGIN_REWARD_COINS} monedas por volver hoy · ¡Regresa mañana para más matches!</span>
      </div>
      <button className="drb-close" onClick={onDismiss} aria-label="Cerrar">✕</button>

      <style jsx>{`
        .drb {
          display: flex; align-items: center; gap: 0.65rem;
          padding: 0.7rem 1rem;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(251,191,36,0.1), rgba(224,64,251,0.08));
          border: 1px solid rgba(251,191,36,0.32);
          position: relative; z-index: 1;
          animation: drb-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes drb-in {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .drb-icon { font-size: 1.5rem; flex-shrink: 0; animation: drb-bounce 1.5s ease-in-out infinite; }
        @keyframes drb-bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2) rotate(-5deg); }
        }
        .drb-body { flex: 1; min-width: 0; }
        .drb-title { display: block; font-size: 0.85rem; font-weight: 800; color: #fbbf24; line-height: 1.2; }
        .drb-desc { display: block; font-size: 0.72rem; color: rgba(255,255,255,0.52); margin-top: 0.15rem; line-height: 1.3; }
        .drb-close { background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 0.8rem; padding: 0.2rem; flex-shrink: 0; }
        .drb-close:hover { color: rgba(255,255,255,0.65); }
      `}</style>
    </div>
  );
}

// ─── FeaturedCreatorsStrip ────────────────────────────────────────────────────
function FeaturedCreatorsStrip({ creators }) {
  if (!creators || creators.length === 0) return null;

  return (
    <div className="fcs" aria-label="Creadores destacados">
      <div className="fcs-header">
        <span className="fcs-title">⚡ En vivo y destacados</span>
        <Link href="/explore" className="fcs-see-all">Ver todos →</Link>
      </div>
      <div className="fcs-scroll">
        {creators.map((c) => (
          <Link
            key={c._id || c.userId}
            href={c.isLive && c.liveId ? `/live/${c.liveId}` : `/profile/${c._id || c.userId}`}
            className="fcs-card"
          >
            <div className="fcs-avatar-wrap">
              {c.avatar ? (
                <img src={c.avatar} alt={c.username || c.name || "Creator"} className="fcs-avatar" />
              ) : (
                <div className="fcs-avatar fcs-avatar-fallback">
                  {(c.username || c.name || "?")[0]?.toUpperCase()}
                </div>
              )}
              {c.isLive && <span className="fcs-live-dot" aria-label="En vivo" />}
            </div>
            <span className="fcs-name">{c.username || c.name || "Creator"}</span>
            {c.isLive ? (
              <span className="fcs-badge fcs-badge-live">🔴 VIVO</span>
            ) : c.totalCoins ? (
              <span className="fcs-badge fcs-badge-hot">🔥 Top</span>
            ) : (
              <span className="fcs-badge fcs-badge-premium">💎 Premium</span>
            )}
          </Link>
        ))}
      </div>

      <style jsx>{`
        .fcs { position: relative; z-index: 1; }
        .fcs-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
        .fcs-title { font-size: 0.82rem; font-weight: 800; color: rgba(255,255,255,0.75); letter-spacing: 0.01em; }
        .fcs-see-all { font-size: 0.72rem; font-weight: 700; color: #e040fb; text-decoration: none; }
        .fcs-see-all:hover { text-decoration: underline; }
        .fcs-scroll {
          display: flex; gap: 0.75rem;
          overflow-x: auto; padding-bottom: 0.35rem;
          scrollbar-width: none;
        }
        .fcs-scroll::-webkit-scrollbar { display: none; }
        .fcs-card {
          display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
          flex-shrink: 0; width: 72px; text-decoration: none;
          transition: transform 0.18s;
        }
        .fcs-card:hover { transform: translateY(-3px); }
        .fcs-avatar-wrap { position: relative; }
        .fcs-avatar {
          width: 56px; height: 56px; border-radius: 50%; object-fit: cover;
          border: 2px solid rgba(224,64,251,0.4);
          display: flex; align-items: center; justify-content: center;
        }
        .fcs-avatar-fallback {
          background: linear-gradient(135deg, #1c0938, #2a0d4f);
          font-size: 1.4rem; font-weight: 900; color: rgba(255,255,255,0.3);
        }
        .fcs-live-dot {
          position: absolute; bottom: 1px; right: 1px;
          width: 12px; height: 12px; border-radius: 50%;
          background: #ff2d78; border: 2px solid #060112;
          animation: fcs-pulse 1.4s ease-in-out infinite;
        }
        @keyframes fcs-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,45,120,0.55); }
          50% { box-shadow: 0 0 0 5px rgba(255,45,120,0); }
        }
        .fcs-name {
          font-size: 0.65rem; font-weight: 700; color: rgba(255,255,255,0.7);
          text-align: center; max-width: 68px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .fcs-badge {
          font-size: 0.55rem; font-weight: 800; padding: 0.15rem 0.45rem;
          border-radius: 999px; letter-spacing: 0.04em;
        }
        .fcs-badge-live { background: rgba(255,45,120,0.14); border: 1px solid rgba(255,45,120,0.4); color: #ff2d78; }
        .fcs-badge-hot { background: rgba(251,113,36,0.12); border: 1px solid rgba(251,113,36,0.35); color: #fb923c; }
        .fcs-badge-premium { background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); color: #fbbf24; }
      `}</style>
    </div>
  );
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────
function SwipeCard({ user, onPass, onLike }) {
  const cardRef = useRef(null);
  const startXRef = useRef(null);
  const velRef = useRef(0);
  const lastXRef = useRef(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [dragging, setDragging] = useState(false);

  const displayName = user.username || user.name || "Usuario";
  const age = calcAge(user.birthdate);
  const isCreator = user.role === "creator";
  const isLive = isCreator && user.isLive && user.liveId;
  const privateCallEnabled = isCreator && user.creatorProfile?.privateCallEnabled;
  const pricePerMinute = user.creatorProfile?.pricePerMinute ?? 0;
  const compatibilityScore = user?.compatibilityScore ?? null;
  const sharedInterests = user?.sharedInterests || [];
  const statusBadges = computeStatusBadges(user) || [];

  const getClientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

  const onDragStart = (e) => {
    startXRef.current = getClientX(e);
    lastXRef.current = getClientX(e);
    velRef.current = 0;
    setDragging(true);
  };

  const onDragMove = (e) => {
    if (startXRef.current === null) return;
    const x = getClientX(e);
    velRef.current = x - (lastXRef.current ?? x);
    lastXRef.current = x;
    const dx = x - startXRef.current;
    setDragDelta(dx);
  };

  const onDragEnd = () => {
    if (startXRef.current === null) return;
    const threshold = 75;
    const velocityBoost = dragDelta + velRef.current * 6;
    if (velocityBoost > threshold) {
      onLike(user._id);
    } else if (velocityBoost < -threshold) {
      onPass(user._id);
    }
    startXRef.current = null;
    lastXRef.current = null;
    velRef.current = 0;
    setDragDelta(0);
    setDragging(false);
  };

  const rotation = dragDelta / 16;
  const likeOpacity = Math.min(Math.max(dragDelta / 70, 0), 1);
  const passOpacity = Math.min(Math.max(-dragDelta / 70, 0), 1);

  return (
    <div
      ref={cardRef}
      className={`swipe-card${dragging ? " dragging" : ""}`}
      style={{
        transform: `translateX(${dragDelta}px) rotate(${rotation}deg)`,
        transition: dragging ? "none" : "transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94)",
      }}
      onMouseDown={onDragStart}
      onMouseMove={dragging ? onDragMove : undefined}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
      onTouchStart={onDragStart}
      onTouchMove={onDragMove}
      onTouchEnd={onDragEnd}
    >
      {/* Drag feedback overlays */}
      <div className="drag-hint drag-hint-like" style={{ opacity: likeOpacity }}>
        <span className="drag-hint-text">💖 LIKE</span>
      </div>
      <div className="drag-hint drag-hint-pass" style={{ opacity: passOpacity }}>
        <span className="drag-hint-text">✕ PASS</span>
      </div>

      {/* Live ribbon */}
      {isLive && (
        <div className="card-ribbon-live">
          <Badge variant="live" pulse>EN VIVO</Badge>
        </div>
      )}

      {/* Photo */}
      <div className="card-photo-wrap">
        {user.avatar ? (
          <img src={user.avatar} alt={displayName} className="card-photo" draggable={false} />
        ) : (
          <div className="card-photo-placeholder">
            <span className="placeholder-initial">{displayName[0]?.toUpperCase()}</span>
          </div>
        )}
        {/* Multi-layer gradient for depth */}
        <div className="card-gradient-overlay" />
        <div className="card-gradient-top" />
      </div>

      {/* Info overlay */}
      <div className="card-info">
        <div className="card-info-top">
          <div className="card-name-row">
            <div className="card-name-age">
              <span className="card-name">{displayName}</span>
              {age && <span className="card-age">{age}</span>}
            </div>
            {user.location && <span className="card-location">📍 {user.location}</span>}
          </div>
          <div className="card-badges-row">
            {compatibilityScore !== null && compatibilityScore > 0 && (
              <span className="card-compat-badge">
                🔥 {compatibilityScore}%
              </span>
            )}
            {isCreator && <Badge variant="creator">CREATOR</Badge>}
            {user.isVerified && <Badge variant="verified">✓</Badge>}
            <StatusBadges badges={Array.isArray(statusBadges) ? statusBadges : []} compact />
          </div>
        </div>

        {user.bio && <p className="card-bio">{user.bio}</p>}

        {user.interests?.length > 0 && (
          <div className="card-tags">
            {user.interests.slice(0, 4).map((t) => (
              <span key={t} className={`card-tag${sharedInterests.includes(t) ? " card-tag-shared" : ""}`}>{t}</span>
            ))}
          </div>
        )}

        {isCreator && (
          <div className="card-creator-row">
            {isLive && (
              <Link href={`/live/${user.liveId}`} className="creator-action-link creator-live-link">
                🔴 Ver en vivo
              </Link>
            )}
            {privateCallEnabled && (
              <span className="creator-action-link creator-call-link">
                📞 🪙{pricePerMinute}/min
              </span>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .swipe-card {
          position: absolute;
          top: 0; left: 0; right: 0;
          width: 100%;
          max-width: 440px;
          margin: 0 auto;
          height: 100%;
          border-radius: 24px;
          overflow: hidden;
          background: linear-gradient(160deg, #12052a, #0a0218);
          border: 1px solid rgba(255,45,120,0.25);
          box-shadow:
            0 10px 50px rgba(0,0,0,0.6),
            0 0 40px rgba(224,64,251,0.1),
            0 0 0 1px rgba(255,255,255,0.03) inset;
          cursor: grab;
          user-select: none;
          touch-action: none;
          will-change: transform;
        }
        .swipe-card.dragging { cursor: grabbing; }

        .drag-hint {
          position: absolute;
          top: 1.75rem;
          z-index: 10;
          pointer-events: none;
          transition: opacity 0.08s;
        }
        .drag-hint-like { right: 1.5rem; }
        .drag-hint-pass { left: 1.5rem; }
        .drag-hint-text {
          font-size: 1.05rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          padding: 0.4rem 1.1rem;
          border-radius: 8px;
          border: 3px solid;
          text-transform: uppercase;
          display: block;
        }
        .drag-hint-like .drag-hint-text {
          color: #34d399;
          border-color: #34d399;
          background: rgba(52,211,153,0.08);
          text-shadow: 0 0 14px rgba(52,211,153,0.7);
          box-shadow: 0 0 20px rgba(52,211,153,0.2);
        }
        .drag-hint-pass .drag-hint-text {
          color: #f87171;
          border-color: #f87171;
          background: rgba(248,113,113,0.08);
          text-shadow: 0 0 14px rgba(248,113,113,0.7);
          box-shadow: 0 0 20px rgba(248,113,113,0.2);
        }

        .card-ribbon-live {
          position: absolute;
          top: 0.85rem;
          right: 0.85rem;
          z-index: 5;
        }

        .card-photo-wrap {
          position: absolute;
          inset: 0;
        }
        .card-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          pointer-events: none;
        }
        .card-photo-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(160deg, #1c0938 0%, #2a0d4f 50%, #1a0630 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .placeholder-initial {
          font-size: 7rem;
          font-weight: 900;
          color: rgba(255,255,255,0.08);
          text-shadow: 0 0 60px rgba(224,64,251,0.15);
          user-select: none;
        }
        .card-gradient-overlay {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 70%;
          background: linear-gradient(
            to top,
            rgba(6,1,18,0.99) 0%,
            rgba(6,1,18,0.75) 35%,
            rgba(6,1,18,0.3) 60%,
            transparent 100%
          );
        }
        .card-gradient-top {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 30%;
          background: linear-gradient(
            to bottom,
            rgba(6,1,18,0.45) 0%,
            transparent 100%
          );
        }

        .card-info {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: 1.25rem 1.35rem 1.1rem;
          z-index: 2;
        }
        .card-info-top {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }
        .card-name-row {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .card-name-age {
          display: flex;
          align-items: baseline;
          gap: 0.45rem;
        }
        .card-name {
          font-size: 1.5rem;
          font-weight: 900;
          color: #fff;
          line-height: 1.1;
          text-shadow: 0 2px 12px rgba(0,0,0,0.5);
        }
        .card-age {
          font-size: 1.1rem;
          font-weight: 600;
          color: rgba(255,255,255,0.75);
        }
        .card-location {
          font-size: 0.73rem;
          color: rgba(255,255,255,0.48);
          margin-top: 0.1rem;
        }
        .card-badges-row {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: flex-end;
        }
        .card-bio {
          font-size: 0.82rem;
          color: rgba(255,255,255,0.62);
          line-height: 1.45;
          margin: 0 0 0.55rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card-tags {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          margin-bottom: 0.45rem;
        }
        .card-tag {
          font-size: 0.66rem;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.22);
          color: #e040fb;
          font-weight: 600;
          backdrop-filter: blur(4px);
        }
        .card-tag-shared {
          background: rgba(255,45,120,0.15);
          border-color: rgba(255,45,120,0.45);
          color: #ff2d78;
          box-shadow: 0 0 8px rgba(255,45,120,0.2);
        }
        .card-compat-badge {
          font-size: 0.72rem;
          font-weight: 800;
          padding: 0.22rem 0.65rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(255,45,120,0.2), rgba(251,191,36,0.2));
          border: 1px solid rgba(255,45,120,0.5);
          color: #fbbf24;
          letter-spacing: 0.02em;
          box-shadow: 0 0 12px rgba(255,45,120,0.25);
          backdrop-filter: blur(4px);
          white-space: nowrap;
        }
        .card-creator-row {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .creator-action-link {
          font-size: 0.73rem;
          font-weight: 700;
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          text-decoration: none;
          border: 1px solid;
          backdrop-filter: blur(4px);
        }
        .creator-live-link {
          background: rgba(255,15,138,0.14);
          border-color: rgba(255,15,138,0.4);
          color: #ff2d78;
          box-shadow: 0 0 12px rgba(255,15,138,0.15);
        }
        .creator-call-link {
          background: rgba(99,102,241,0.1);
          border-color: rgba(99,102,241,0.32);
          color: #a5b4fc;
        }
      `}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CrushPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null); // "like" | "pass" | "super"
  const [matchData, setMatchData] = useState(null); // { user, isSuperCrush }
  const [superCrushPrice, setSuperCrushPrice] = useState(50);
  const [extraSwipesPrice, setExtraSwipesPrice] = useState(5);
  const [boostPrice, setBoostPrice] = useState(100);
  const [boostPacks, setBoostPacks] = useState(null);
  const [coins, setCoins] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [superCrushConfirm, setSuperCrushConfirm] = useState(false);
  const [crushActivity, setCrushActivity] = useState(null); // { type: "crush"|"super", username }
  const [swipeLimitModal, setSwipeLimitModal] = useState(false);
  const [boostModal, setBoostModal] = useState(false);
  const [isBoosted, setIsBoosted] = useState(false);
  const [boostUntil, setBoostUntil] = useState(null);
  const [boostLoading, setBoostLoading] = useState(false);
  const [packLoading, setPackLoading] = useState(null); // quantity being purchased
  const [storedBoosts, setStoredBoosts] = useState(0);
  const [activeBoostCount, setActiveBoostCount] = useState(null);
  const [boostResult, setBoostResult] = useState(null); // stats after boost ends
  const [showBoostResult, setShowBoostResult] = useState(false);
  const prevIsBoostedRef = useRef(false);
  const [swipeUnlockLoading, setSwipeUnlockLoading] = useState(false);
  const [remainingSwipes, setRemainingSwipes] = useState(DAILY_FREE_SWIPES);
  const [showDailyReward, setShowDailyReward] = useState(false);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [doneMsgIndex, setDoneMsgIndex] = useState(0);

  const currentUser = users[currentIndex] || null;
  const nextUser = users[currentIndex + 1] || null;

  // Sync remaining swipes from localStorage on mount
  useEffect(() => {
    setRemainingSwipes(getRemainingSwipes());
    // Daily login reward
    if (checkAndClaimDailyReward()) {
      setShowDailyReward(true);
    }
  }, []);

  const fetchUsers = useCallback(async (pageNum = 1) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.replace("/login"); return; }
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    setError("");
    try {
      const res = await fetch(
        `${API_URL}/api/user/discover?page=${pageNum}&limit=${USERS_PER_PAGE}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) { router.replace("/login"); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newUsers = data.users || [];
      setUsers((prev) => (pageNum === 1 ? newUsers : [...prev, ...newUsers]));
      setHasMore(newUsers.length === USERS_PER_PAGE);
    } catch {
      setError("No se pudo cargar los perfiles");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [router]);

  const fetchConfig = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    try {
      const [cfgRes, meRes, boostRes, activeRes] = await Promise.all([
        fetch(`${API_URL}/api/matches/config`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/user/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/matches/boost-status`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/matches/boost-active-count`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setSuperCrushPrice(cfg.superCrushPrice ?? 50);
        setExtraSwipesPrice(cfg.extraSwipesPrice ?? 5);
        setBoostPrice(cfg.boostPrice ?? 100);
        if (cfg.boostPacks) setBoostPacks(cfg.boostPacks);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setCoins(me.coins ?? 0);
      }
      if (boostRes.ok) {
        const boost = await boostRes.json();
        const newIsBoosted = boost.isBoosted ?? false;
        // Detect expiry: was active, now ended → show results
        if (prevIsBoostedRef.current && !newIsBoosted && boost.boostResult) {
          setBoostResult(boost.boostResult);
          setShowBoostResult(true);
        }
        prevIsBoostedRef.current = newIsBoosted;
        setIsBoosted(newIsBoosted);
        setBoostUntil(boost.boostUntil ?? null);
        setStoredBoosts(boost.storedBoosts ?? 0);
        if (boost.boostPacks) setBoostPacks(boost.boostPacks);
      }
      if (activeRes.ok) {
        const active = await activeRes.json();
        setActiveBoostCount(active.count ?? null);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchUsers(1);
    fetchConfig();
  }, [fetchUsers, fetchConfig]);

  // Fire a single fetchConfig just after boost expires to detect expiry and show results
  useEffect(() => {
    if (!isBoosted || !boostUntil) return;
    const msLeft = new Date(boostUntil) - Date.now();
    if (msLeft <= 0) return;
    // Add a small buffer (2s) so the server has finished expiring the boost
    const id = setTimeout(fetchConfig, msLeft + 2000);
    return () => clearTimeout(id);
  }, [isBoosted, boostUntil, fetchConfig]);

  // Pre-load more when nearing the end
  useEffect(() => {
    const remaining = users.length - currentIndex;
    if (remaining <= 3 && hasMore && !loadingMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchUsers(nextPage);
    }
  }, [currentIndex, users.length, hasMore, loadingMore, loading, page, fetchUsers]);

  // Fetch featured / live creators
  useEffect(() => {
    fetch(`${API_URL}/api/rankings/featured`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        // Merge liveNow + topWeek, deduplicate, cap at 10
        const live = (d.liveNow || []).map((l) => ({
          _id: l.userId || l._id,
          userId: l.userId,
          username: l.username || l.user?.username,
          name: l.name || l.user?.name,
          avatar: l.avatar || l.user?.avatar,
          isLive: true,
          liveId: l._id || l.liveId,
          totalCoins: 0,
        }));
        const top = (d.topWeek || []).map((c) => ({
          _id: c.userId,
          userId: c.userId,
          username: c.username,
          name: c.name,
          avatar: c.avatar,
          isLive: false,
          liveId: null,
          totalCoins: c.totalCoins || 0,
        }));
        const seen = new Set();
        const merged = [...live, ...top].filter((c) => {
          const id = String(c._id || c.userId || "");
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        setFeaturedCreators(merged.slice(0, 10));
      })
      .catch(() => { /* featured creators are optional — fail silently */ });
  }, []);

  // Rotate done-state message every 3s
  useEffect(() => {
    if (!isDone) return;
    const id = setInterval(() => {
      setDoneMsgIndex((i) => (i + 1) % DONE_MESSAGES.length);
    }, 3000);
    return () => clearInterval(id);
  }, [isDone]);

  // ─── Socket: page-level crush events ──────────────────────────────────────
  useEffect(() => {
    const handleCrushReceived = ({ fromUsername, crushType }) => {
      setCrushActivity({
        type: crushType === "super_crush" ? "super" : "crush",
        username: fromUsername || "",
      });
    };

    const handleSuperCrushReceived = ({ fromUsername }) => {
      setCrushActivity({ type: "super", username: fromUsername || "" });
    };

    const handleMatchCreatedSocket = ({ matchedUserId, matchedUsername }) => {
      setMatchData((prev) => {
        if (prev) return prev;
        const matchedUser = users.find((u) => String(u._id) === String(matchedUserId));
        if (matchedUser) return { user: matchedUser, isSuperCrush: false };
        return {
          user: { _id: matchedUserId, username: matchedUsername, name: matchedUsername },
          isSuperCrush: false,
        };
      });
    };

    socket.on("CRUSH_RECEIVED", handleCrushReceived);
    socket.on("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);
    socket.on("MATCH_CREATED", handleMatchCreatedSocket);
    return () => {
      socket.off("CRUSH_RECEIVED", handleCrushReceived);
      socket.off("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);
      socket.off("MATCH_CREATED", handleMatchCreatedSocket);
    };
  }, [users]);

  const showFeedback = (type) => {
    setActionFeedback(type);
    setTimeout(() => setActionFeedback(null), ACTION_FEEDBACK_DURATION_MS);
  };

  const advance = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
  }, []);

  // Track a swipe; returns false if limit hit (shows modal instead)
  const trackSwipe = useCallback(() => {
    const state = incrementSwipeCount();
    const remaining = Math.max(0, DAILY_FREE_SWIPES + (state.extra || 0) - state.count);
    setRemainingSwipes(remaining);
    if (remaining <= 0) {
      setSwipeLimitModal(true);
      return false;
    }
    return true;
  }, []);

  const handlePass = useCallback(async (userId) => {
    if (actionLoading) return;
    if (!trackSwipe()) return;
    showFeedback("pass");
    const token = localStorage.getItem("token");
    if (token) {
      fetch(`${API_URL}/api/matches/like/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    advance();
  }, [actionLoading, advance, trackSwipe]);

  const handleLike = useCallback(async (userId) => {
    if (actionLoading) return;
    if (!trackSwipe()) return;
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setActionLoading(true);
    showFeedback("like");
    try {
      const res = await fetch(`${API_URL}/api/matches/like/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.match) {
          const matchedUser = users.find((u) => String(u._id) === String(userId));
          if (matchedUser) setMatchData({ user: matchedUser, isSuperCrush: false });
        }
      }
    } catch { /* ignore */ } finally {
      setActionLoading(false);
      advance();
    }
  }, [actionLoading, advance, users, router, trackSwipe]);

  const requestSuperCrush = useCallback(() => {
    if (actionLoading || !currentUser) return;
    setSuperCrushConfirm(true);
  }, [actionLoading, currentUser]);

  const handleSuperCrush = useCallback(async () => {
    const userId = currentUser?._id;
    if (!userId) return;
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setActionLoading(true);
    setSuperCrushConfirm(false);
    showFeedback("super");
    try {
      const res = await fetch(`${API_URL}/api/matches/super-crush/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCoins((c) => (c !== null ? c - superCrushPrice : c));
        if (data.match) {
          const matchedUser = users.find((u) => String(u._id) === String(userId));
          if (matchedUser) setMatchData({ user: matchedUser, isSuperCrush: true });
        }
      } else {
        setError(data.message || "No se pudo enviar el Super Crush");
        setTimeout(() => setError(""), 5000);
      }
    } catch {
      setError("Error de conexión");
      setTimeout(() => setError(""), 5000);
    } finally {
      setActionLoading(false);
      advance();
    }
  }, [actionLoading, advance, coins, superCrushPrice, users, router, currentUser]);

  const handleBoost = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setBoostLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/matches/boost`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        // If a stored boost was consumed, don't deduct coins
        if (!data.usedStoredBoost) {
          setCoins((c) => (c !== null ? c - boostPrice : c));
        } else {
          setStoredBoosts((s) => Math.max(0, s - 1));
        }
        prevIsBoostedRef.current = true;
        setIsBoosted(true);
        setBoostUntil(data.boostUntil);
      } else {
        setError(data.message || "No se pudo activar el Boost");
        setTimeout(() => setError(""), 5000);
      }
    } catch {
      setError("Error de conexión");
      setTimeout(() => setError(""), 5000);
    } finally {
      setBoostLoading(false);
    }
  }, [boostPrice, router]);

  const handleBuyBoostPack = useCallback(async (quantity) => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setPackLoading(quantity);
    try {
      const res = await fetch(`${API_URL}/api/matches/boost-pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quantity }),
      });
      const data = await res.json();
      if (res.ok) {
        if (typeof data.coins === "number") setCoins(data.coins);
        else if (data.coinsSpent) setCoins((c) => (c !== null ? c - data.coinsSpent : c));
        if (typeof data.storedBoosts === "number") setStoredBoosts(data.storedBoosts);
        else setStoredBoosts((s) => s + quantity);
      } else {
        setError(data.message || "No se pudo comprar el pack");
        setTimeout(() => setError(""), 5000);
      }
    } catch {
      setError("Error de conexión");
      setTimeout(() => setError(""), 5000);
    } finally {
      setPackLoading(null);
    }
  }, [router]);

  const handleUnlockSwipes = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setSwipeUnlockLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/matches/unlock-swipes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCoins((c) => (c !== null ? c - extraSwipesPrice : c));
        const newState = addExtraSwipes(data.unlockedSwipes ?? EXTRA_SWIPES_BATCH);
        const remaining = Math.max(0, DAILY_FREE_SWIPES + (newState.extra || 0) - newState.count);
        setRemainingSwipes(remaining);
        setSwipeLimitModal(false);
      } else {
        setError(data.message || "No se pudo desbloquear swipes");
        setTimeout(() => setError(""), 5000);
      }
    } catch {
      setError("Error de conexión");
      setTimeout(() => setError(""), 5000);
    } finally {
      setSwipeUnlockLoading(false);
    }
  }, [extraSwipesPrice, router]);

  const handleExploreMore = useCallback(() => {
    setUsers([]);
    setCurrentIndex(0);
    setPage(1);
    setHasMore(true);
    fetchUsers(1);
  }, [fetchUsers]);

  const isDone = !loading && currentIndex >= users.length;
  const canSuperCrush = coins === null || coins >= superCrushPrice;

  return (
    <div className="crush-page">
      {/* Ambient background glow */}
      <div className="page-glow page-glow-1" aria-hidden="true" />
      <div className="page-glow page-glow-2" aria-hidden="true" />

      {/* Header */}
      <div className="crush-header">
        <div>
          <h1 className="page-title">
            <span className="title-icon">💘</span> Crush
          </h1>
          <p className="page-subtitle">Desliza · conecta · enamórate</p>
        </div>
        <div className="header-actions">
          {coins !== null && (
            <div className="coin-chip">
              <span className="coin-icon">🪙</span>
              <span className="coin-value">{coins}</span>
            </div>
          )}
          <div className="swipe-counter" title={`${remainingSwipes} swipes restantes hoy`}>
            🔥 {remainingSwipes}
          </div>
          <button
            className={`boost-btn${isBoosted ? " boost-btn-active" : ""}`}
            onClick={() => setBoostModal(true)}
            title={isBoosted ? "Boost activo" : "Activar Boost Crush"}
          >
            🚀 {isBoosted ? "Boosted" : "Boost"}
          </button>
          <Link href="/matches" className="matches-link-btn">
            💗 Matches
          </Link>
        </div>
      </div>

      {/* Activity banner (socket events) */}
      {crushActivity && (
        <CrushActivityBanner
          event={crushActivity}
          onDismiss={() => setCrushActivity(null)}
        />
      )}

      {/* ── 📊 ACTIVITY SIGNALS — social proof ── */}
      <ActivityBar variant="pills" />

      {/* Daily login reward banner */}
      {showDailyReward && (
        <DailyRewardBanner onDismiss={() => setShowDailyReward(false)} />
      )}

      {error && <div className="banner-error">{error}</div>}

      {/* Remaining likes indicator */}
      {!loading && !isDone && currentUser && remainingSwipes <= 5 && (
        <div className="likes-warning">
          <span className="likes-warning-icon">⚡</span>
          <span className="likes-warning-text">
            Te quedan <strong>{remainingSwipes}</strong> like{remainingSwipes !== 1 ? "s" : ""} hoy
          </span>
          <Link href="/coins" className="likes-warning-cta">Comprar monedas →</Link>
        </div>
      )}

      {/* Card stack */}
      <div className="card-stack-wrap">
        {loading ? (
          <div className="skeleton-card">
            <div className="skeleton-shimmer" />
          </div>
        ) : isDone ? (
          <div className="done-state">
            <div className="done-glow" aria-hidden="true" />

            {/* Rotating engaging message */}
            <div className="done-rotating-msg" key={DONE_MESSAGES[doneMsgIndex].text}>
              <span className="done-rotating-icon">{DONE_MESSAGES[doneMsgIndex].icon}</span>
              <span className="done-rotating-text">{DONE_MESSAGES[doneMsgIndex].text}</span>
            </div>

            <div className="done-icon">💖</div>
            <h3>¡Te estás acercando a tu match perfecto!</h3>
            <div className="done-return-row">
              <span className="done-return-msg">🗓️ Regresa mañana ·</span>
              <Link href="/coins" className="done-unlock-link">desbloquea más ahora →</Link>
            </div>

            <button className="done-btn-primary" onClick={handleExploreMore}>
              🔥 Seguir explorando
            </button>

            <div className="done-actions-secondary">
              <Link href="/live" className="done-btn-secondary">🎥 Explorar directos</Link>
              <Link href="/matches" className="done-btn-secondary">💖 Ver mis matches</Link>
              <Link href="/coins" className="done-btn-secondary done-btn-coins">🪙 Comprar monedas</Link>
            </div>

            {/* Confidence room tie-in */}
            <Link href="/rooms" className="done-confidence-card">
              <span className="done-confidence-icon">💬</span>
              <div className="done-confidence-body">
                <p className="done-confidence-title">Practica conversación mientras llegan más perfiles</p>
                <p className="done-confidence-desc">Mejora tu confianza en el amor · Sala segura y amigable</p>
              </div>
              <span className="done-confidence-cta">Entrar ahora</span>
            </Link>

            <div className="done-monetize-row">
              <Link href="/coins" className="done-monetize-card">
                <span className="done-monetize-icon">💎</span>
                <div>
                  <p className="done-monetize-title">Ver perfiles premium</p>
                  <p className="done-monetize-desc">Desbloquea acceso exclusivo</p>
                </div>
              </Link>
              <button className="done-monetize-card" onClick={() => setBoostModal(true)}>
                <span className="done-monetize-icon">🚀</span>
                <div>
                  <p className="done-monetize-title">Boost Crush</p>
                  <p className="done-monetize-desc">Más visibilidad · 24h activo</p>
                </div>
              </button>
              <Link href="/matches" className="done-monetize-card">
                <span className="done-monetize-icon">👀</span>
                <div>
                  <p className="done-monetize-title">Ver quién te dio like</p>
                  <p className="done-monetize-desc">💎 Desbloquea más con monedas</p>
                </div>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {nextUser && (
              <div className="ghost-card">
                {nextUser.avatar ? (
                  <img src={nextUser.avatar} alt="" className="ghost-photo" draggable={false} />
                ) : (
                  <div className="ghost-photo-placeholder">
                    {(nextUser.username || nextUser.name || "?")[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            )}

            {currentUser && (
              <>
                {actionFeedback === "like" && (
                  <div className="action-flash action-flash-like">💖 LIKE</div>
                )}
                {actionFeedback === "pass" && (
                  <div className="action-flash action-flash-pass">✕ PASS</div>
                )}
                {actionFeedback === "super" && (
                  <div className="action-flash action-flash-super">⚡ SUPER CRUSH!</div>
                )}

                <SwipeCard
                  key={currentUser._id}
                  user={currentUser}
                  onPass={handlePass}
                  onLike={handleLike}
                />
              </>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      {!loading && !isDone && currentUser && (
        <div className="action-buttons">
          <button
            className="action-btn btn-pass"
            onClick={() => handlePass(currentUser._id)}
            disabled={actionLoading}
            aria-label="Pasar"
            title="Pasar"
          >
            <PassIcon />
          </button>

          <button
            className={`action-btn btn-super${!canSuperCrush ? " btn-super-disabled" : ""}`}
            onClick={requestSuperCrush}
            disabled={actionLoading}
            aria-label={`Super Crush · ${superCrushPrice} monedas`}
            title={canSuperCrush ? `Super Crush · ${superCrushPrice} 🪙` : "Saldo insuficiente"}
          >
            <span className="btn-super-inner">
              <StarIcon />
              <span className="super-price">⚡ {superCrushPrice} 🪙</span>
            </span>
            {!canSuperCrush && <span className="super-locked-hint">Sin saldo</span>}
          </button>

          <button
            className="action-btn btn-like"
            onClick={() => handleLike(currentUser._id)}
            disabled={actionLoading}
            aria-label="Like"
            title="Like"
          >
            <HeartIcon />
          </button>
        </div>
      )}

      {/* Super Crush confirm modal */}
      {superCrushConfirm && currentUser && (
        <SuperCrushConfirmModal
          user={currentUser}
          price={superCrushPrice}
          coins={coins}
          loading={actionLoading}
          onConfirm={handleSuperCrush}
          onCancel={() => setSuperCrushConfirm(false)}
        />
      )}

      {/* Match modal */}
      {matchData && (
        <MatchModal
          user={matchData.user}
          isSuperCrush={matchData.isSuperCrush}
          onClose={() => setMatchData(null)}
        />
      )}

      {swipeLimitModal && (
        <SwipeLimitModal
          coins={coins}
          extraSwipesPrice={extraSwipesPrice}
          extraSwipesBatch={EXTRA_SWIPES_BATCH}
          loading={swipeUnlockLoading}
          onUnlock={handleUnlockSwipes}
          onClose={() => setSwipeLimitModal(false)}
        />
      )}

      {boostModal && (
        <BoostModal
          coins={coins}
          boostPrice={boostPrice}
          boostPacks={boostPacks}
          storedBoosts={storedBoosts}
          activeBoostCount={activeBoostCount}
          isBoosted={isBoosted}
          boostUntil={boostUntil}
          loading={boostLoading}
          packLoading={packLoading}
          onBoost={handleBoost}
          onBuyPack={handleBuyBoostPack}
          onClose={() => setBoostModal(false)}
        />
      )}

      {showBoostResult && boostResult && (
        <BoostResultModal
          result={boostResult}
          onClose={() => { setShowBoostResult(false); setBoostResult(null); }}
        />
      )}

      {/* Featured creators strip — always visible */}
      {featuredCreators.length > 0 && (
        <FeaturedCreatorsStrip creators={featuredCreators} />
      )}

      {/* Hidden likes monetization section */}
      <HiddenLikesSection compact />

      <style jsx>{`
        .crush-page {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-height: calc(100svh - 80px);
          padding-bottom: 1.5rem;
          position: relative;
          overflow-x: hidden;
        }

        .page-glow {
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          filter: blur(80px);
        }
        .page-glow-1 {
          width: 400px; height: 400px;
          top: -100px; left: -100px;
          background: radial-gradient(circle, rgba(224,64,251,0.08) 0%, transparent 70%);
        }
        .page-glow-2 {
          width: 350px; height: 350px;
          bottom: 100px; right: -80px;
          background: radial-gradient(circle, rgba(255,45,120,0.07) 0%, transparent 70%);
        }

        .crush-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          position: relative;
          z-index: 1;
        }
        .page-title {
          font-size: 1.65rem;
          font-weight: 900;
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          line-height: 1.15;
        }
        .title-icon { -webkit-text-fill-color: initial; }
        .page-subtitle {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.38);
          margin: 0.15rem 0 0;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .coin-chip {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.38rem 0.9rem;
          border-radius: 999px;
          background: rgba(251,191,36,0.07);
          border: 1px solid rgba(251,191,36,0.22);
          backdrop-filter: blur(6px);
        }
        .coin-icon { font-size: 0.9rem; }
        .coin-value { font-size: 0.82rem; font-weight: 700; color: #fbbf24; }
        .matches-link-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.42rem 1rem;
          border-radius: 999px;
          border: 1px solid rgba(255,45,120,0.3);
          background: rgba(255,45,120,0.07);
          color: #ff2d78;
          font-size: 0.8rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          backdrop-filter: blur(6px);
        }
        .matches-link-btn:hover {
          background: rgba(255,45,120,0.14);
          box-shadow: 0 0 16px rgba(255,45,120,0.22);
        }

        .swipe-counter {
          display: flex;
          align-items: center;
          padding: 0.38rem 0.75rem;
          border-radius: 999px;
          background: rgba(255,100,0,0.07);
          border: 1px solid rgba(255,100,0,0.22);
          font-size: 0.78rem;
          font-weight: 700;
          color: #fb923c;
          backdrop-filter: blur(6px);
          animation: swipe-counter-pulse 3s ease-in-out infinite;
        }

        @keyframes swipe-counter-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(255,100,0,0); }
          50%       { box-shadow: 0 0 10px rgba(255,100,0,0.2); }
        }

        .likes-warning {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.6rem 1rem;
          border-radius: var(--radius-sm);
          background: linear-gradient(135deg, rgba(255,100,0,0.1), rgba(251,191,36,0.07));
          border: 1px solid rgba(255,100,0,0.3);
          position: relative;
          z-index: 1;
          animation: likes-warn-in 0.4s ease both;
        }

        @keyframes likes-warn-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .likes-warning-icon {
          font-size: 1rem;
          animation: likes-icon-pulse 1.5s ease-in-out infinite;
        }

        @keyframes likes-icon-pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.2); }
        }

        .likes-warning-text {
          flex: 1;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.75);
          font-weight: 500;
        }

        .likes-warning-text strong {
          color: #fb923c;
          font-weight: 800;
        }

        .likes-warning-cta {
          font-size: 0.75rem;
          font-weight: 800;
          color: #fbbf24;
          text-decoration: none;
          white-space: nowrap;
          padding: 0.25rem 0.7rem;
          border-radius: var(--radius-pill);
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          transition: all 0.2s;
        }

        .likes-warning-cta:hover {
          background: rgba(251,191,36,0.2);
          box-shadow: 0 0 10px rgba(251,191,36,0.3);
        }

        .boost-btn {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.38rem 0.9rem;
          border-radius: 999px;
          border: 1px solid rgba(224,64,251,0.35);
          background: rgba(224,64,251,0.07);
          color: #e040fb;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(6px);
        }
        .boost-btn:hover {
          background: rgba(224,64,251,0.16);
          box-shadow: 0 0 16px rgba(224,64,251,0.3);
        }
        .boost-btn-active {
          border-color: rgba(52,211,153,0.5);
          background: rgba(52,211,153,0.08);
          color: #34d399;
          box-shadow: 0 0 12px rgba(52,211,153,0.2);
        }
        .boost-btn-active:hover {
          background: rgba(52,211,153,0.14);
          box-shadow: 0 0 20px rgba(52,211,153,0.35);
        }

        .banner-error {
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.3);
          color: #f87171;
          border-radius: 12px;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          position: relative;
          z-index: 1;
        }

        .card-stack-wrap {
          position: relative;
          width: 100%;
          max-width: 440px;
          margin: 0 auto;
          height: clamp(460px, calc(100svh - 290px), 580px);
          z-index: 1;
        }

        .skeleton-card {
          position: absolute;
          inset: 0;
          border-radius: 24px;
          background: linear-gradient(160deg, #12052a, #0a0218);
          border: 1px solid rgba(255,45,120,0.1);
          overflow: hidden;
        }
        .skeleton-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .ghost-card {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%) scale(0.95);
          width: 100%;
          max-width: 440px;
          height: 100%;
          border-radius: 24px;
          overflow: hidden;
          background: rgba(12,4,28,0.5);
          border: 1px solid rgba(255,45,120,0.1);
          z-index: 0;
        }
        .ghost-photo {
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0.28;
          filter: blur(3px);
          pointer-events: none;
        }
        .ghost-photo-placeholder {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          font-size: 5rem; font-weight: 900;
          color: rgba(255,255,255,0.06);
          background: linear-gradient(135deg, #0e0425, #180845);
        }

        .action-flash {
          position: absolute;
          top: 42%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 20;
          font-size: 1.65rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          padding: 0.55rem 1.75rem;
          border-radius: 14px;
          border: 3px solid;
          pointer-events: none;
          animation: flash-pop 0.7s ease forwards;
        }
        @keyframes flash-pop {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          28%  { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
          75%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.02); }
        }
        .action-flash-like {
          color: #34d399; border-color: #34d399;
          background: rgba(52,211,153,0.07);
          text-shadow: 0 0 20px rgba(52,211,153,0.7);
          box-shadow: 0 0 40px rgba(52,211,153,0.2);
        }
        .action-flash-pass {
          color: #f87171; border-color: #f87171;
          background: rgba(248,113,113,0.07);
          text-shadow: 0 0 20px rgba(248,113,113,0.7);
          box-shadow: 0 0 40px rgba(248,113,113,0.2);
        }
        .action-flash-super {
          color: #fbbf24; border-color: #fbbf24;
          background: rgba(251,191,36,0.08);
          text-shadow: 0 0 24px rgba(251,191,36,0.8);
          box-shadow: 0 0 50px rgba(251,191,36,0.25);
        }

        .action-buttons {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.25rem;
          padding: 0.25rem 0;
          position: relative;
          z-index: 1;
        }
        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.22s ease;
          flex-shrink: 0;
          position: relative;
        }
        .action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .action-btn:active:not(:disabled) { transform: scale(0.93) !important; }

        .btn-pass {
          width: 60px; height: 60px;
          background: rgba(248,113,113,0.07);
          border: 2px solid rgba(248,113,113,0.32);
          color: #f87171;
        }
        .btn-pass:hover:not(:disabled) {
          background: rgba(248,113,113,0.16);
          box-shadow: 0 0 28px rgba(248,113,113,0.35);
          transform: scale(1.1);
        }

        .btn-like {
          width: 60px; height: 60px;
          background: rgba(255,45,120,0.08);
          border: 2px solid rgba(255,45,120,0.38);
          color: #ff2d78;
        }
        .btn-like:hover:not(:disabled) {
          background: rgba(255,45,120,0.18);
          box-shadow: 0 0 28px rgba(255,45,120,0.38);
          transform: scale(1.1);
        }

        .btn-super {
          width: 76px; height: 76px;
          background: linear-gradient(135deg, rgba(251,191,36,0.1), rgba(224,64,251,0.1));
          border: 2px solid rgba(251,191,36,0.5);
          color: #fbbf24;
          border-radius: 50%;
          box-shadow: 0 0 24px rgba(251,191,36,0.18), 0 0 0 1px rgba(251,191,36,0.08) inset;
        }
        .btn-super:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(251,191,36,0.2), rgba(224,64,251,0.2));
          box-shadow: 0 0 40px rgba(251,191,36,0.42), 0 0 0 1px rgba(251,191,36,0.12) inset;
          transform: scale(1.12);
        }
        .btn-super-disabled {
          border-color: rgba(255,255,255,0.18) !important;
          box-shadow: none !important;
          opacity: 0.5;
        }
        .btn-super-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.15rem;
        }
        .super-price {
          font-size: 0.58rem;
          font-weight: 800;
          color: #fbbf24;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }
        .super-locked-hint {
          position: absolute;
          bottom: -1.4rem;
          left: 50%;
          transform: translateX(-50%);
          font-size: 0.6rem;
          color: rgba(248,113,113,0.7);
          white-space: nowrap;
          font-weight: 600;
        }

        .done-state {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.65rem;
          text-align: center;
          border: 1px solid rgba(224,64,251,0.22);
          border-radius: 24px;
          background: linear-gradient(160deg, rgba(20,4,50,0.92), rgba(8,2,22,0.96));
          padding: 1.75rem 1.5rem;
          backdrop-filter: blur(12px);
          overflow: hidden;
        }
        .done-glow {
          position: absolute;
          top: -60px; left: 50%;
          transform: translateX(-50%);
          width: 280px; height: 280px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,45,120,0.18) 0%, rgba(224,64,251,0.1) 50%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }
        .done-state > * { position: relative; z-index: 1; }
        .done-icon { font-size: 3rem; animation: done-pulse 2.2s ease-in-out infinite; }
        @keyframes done-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(255,45,120,0.5)); }
          50% { transform: scale(1.12); filter: drop-shadow(0 0 20px rgba(255,45,120,0.9)); }
        }
        .done-state h3 {
          color: #fff;
          font-size: 1.15rem;
          font-weight: 800;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .done-state > p {
          color: rgba(255,255,255,0.52);
          font-size: 0.8rem;
          margin: 0;
        }
        .done-actions-secondary {
          display: flex;
          gap: 0.55rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        .done-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.48rem 1.05rem;
          border-radius: 999px;
          border: 1px solid rgba(255,45,120,0.3);
          background: rgba(255,45,120,0.07);
          color: rgba(255,255,255,0.75);
          font-size: 0.78rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          backdrop-filter: blur(4px);
        }
        .done-btn-secondary:hover {
          background: rgba(255,45,120,0.16);
          border-color: rgba(255,45,120,0.55);
          color: #fff;
          box-shadow: 0 0 12px rgba(255,45,120,0.22);
        }
        .done-promo-card {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 14px;
          background: rgba(224,64,251,0.06);
          border: 1px solid rgba(224,64,251,0.2);
          text-align: left;
          margin-top: 0.3rem;
        }
        .done-promo-icon { font-size: 1.5rem; flex-shrink: 0; }
        .done-promo-body { flex: 1; min-width: 0; }
        .done-promo-title {
          font-size: 0.8rem;
          font-weight: 700;
          color: #e8b4ff;
          margin: 0;
          line-height: 1.3;
        }
        .done-promo-desc {
          font-size: 0.68rem;
          color: rgba(255,255,255,0.4);
          margin: 0.15rem 0 0;
          line-height: 1.3;
        }
        .done-promo-cta {
          flex-shrink: 0;
          padding: 0.38rem 0.85rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #e040fb, #ff2d78);
          color: #fff;
          font-size: 0.72rem;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
          box-shadow: 0 0 12px rgba(224,64,251,0.4);
          transition: box-shadow 0.2s, transform 0.15s;
          border: none;
          cursor: pointer;
        }
        .done-promo-cta:hover {
          box-shadow: 0 0 20px rgba(224,64,251,0.65);
          transform: translateY(-1px);
        }
        .done-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.65rem 1.6rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 800;
          text-decoration: none;
          letter-spacing: 0.01em;
          box-shadow: 0 0 22px rgba(255,45,120,0.55), 0 0 6px rgba(224,64,251,0.35);
          transition: box-shadow 0.2s, transform 0.15s;
          margin-top: 0.3rem;
          border: none;
          cursor: pointer;
        }
        .done-btn-primary:hover {
          box-shadow: 0 0 34px rgba(255,45,120,0.75), 0 0 12px rgba(224,64,251,0.5);
          transform: translateY(-1px);
        }

        .done-rotating-msg {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          animation: done-msg-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes done-msg-in {
          from { opacity: 0; transform: scale(0.85) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .done-rotating-icon { font-size: 1rem; }
        .done-rotating-text { font-size: 0.78rem; font-weight: 700; color: rgba(255,255,255,0.7); }

        .done-return-msg {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.38);
          margin: 0;
        }

        .done-return-row {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .done-unlock-link {
          color: #e040fb;
          font-weight: 700;
          text-decoration: none;
          font-size: 0.72rem;
        }

        .done-unlock-link:hover { text-decoration: underline; }

        .done-btn-coins {
          background: rgba(251,191,36,0.08) !important;
          border-color: rgba(251,191,36,0.3) !important;
          color: #fbbf24 !important;
        }
        .done-btn-coins:hover {
          background: rgba(251,191,36,0.18) !important;
          box-shadow: 0 0 14px rgba(251,191,36,0.25) !important;
        }

        .done-monetize-row {
          display: flex;
          gap: 0.55rem;
          width: 100%;
          flex-wrap: wrap;
        }
        .done-monetize-card {
          flex: 1;
          min-width: 130px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 0.85rem;
          border-radius: 14px;
          background: rgba(224,64,251,0.05);
          border: 1px solid rgba(224,64,251,0.18);
          text-decoration: none;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }
        .done-monetize-card:hover {
          background: rgba(224,64,251,0.12);
          border-color: rgba(224,64,251,0.38);
          transform: translateY(-2px);
          box-shadow: 0 4px 18px rgba(224,64,251,0.18);
        }
        .done-monetize-icon { font-size: 1.3rem; flex-shrink: 0; }
        .done-monetize-title {
          font-size: 0.75rem; font-weight: 800; color: #e8b4ff; margin: 0; line-height: 1.2;
        }
        .done-monetize-desc {
          font-size: 0.62rem; color: rgba(255,255,255,0.38); margin: 0.1rem 0 0; line-height: 1.25;
        }

        /* Confidence room tie-in card */
        .done-confidence-card {
          display: flex; align-items: center; gap: 0.75rem;
          width: 100%; padding: 0.85rem 1rem;
          border-radius: 14px;
          background: rgba(244,114,182,0.07);
          border: 1px solid rgba(244,114,182,0.25);
          text-decoration: none; text-align: left; cursor: pointer;
          transition: all 0.2s;
        }
        .done-confidence-card:hover {
          background: rgba(244,114,182,0.14);
          border-color: rgba(244,114,182,0.45);
          transform: translateY(-2px);
          box-shadow: 0 4px 18px rgba(244,114,182,0.2);
        }
        .done-confidence-icon { font-size: 1.5rem; flex-shrink: 0; }
        .done-confidence-body { flex: 1; min-width: 0; }
        .done-confidence-title {
          font-size: 0.78rem; font-weight: 800; color: #fce7f3; margin: 0; line-height: 1.3;
        }
        .done-confidence-desc {
          font-size: 0.65rem; color: rgba(255,255,255,0.4); margin: 0.1rem 0 0; line-height: 1.25;
        }
        .done-confidence-cta {
          flex-shrink: 0; padding: 0.35rem 0.8rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #f472b6, #a855f7);
          color: #fff; font-size: 0.7rem; font-weight: 800;
          white-space: nowrap;
          box-shadow: 0 0 10px rgba(244,114,182,0.35);
          transition: box-shadow 0.2s, transform 0.15s;
        }
        .done-confidence-card:hover .done-confidence-cta {
          box-shadow: 0 0 18px rgba(244,114,182,0.55);
          transform: translateY(-1px);
        }

        @media (max-width: 480px) {
          .card-stack-wrap { height: clamp(400px, calc(100svh - 280px), 520px); }
          .action-btn { touch-action: manipulation; }
        }
      `}</style>
    </div>
  );
}
