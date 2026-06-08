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
import { getDisplayName, getUserImage } from "@/lib/imageHelpers";
import { PROFILE_UPDATED_EVENT } from "@/lib/profileSync";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const ACTIVITY_BANNER_DURATION_MS = 3500;
const DAILY_LOGIN_REWARD_COINS = 5;

// ─── Daily login reward helpers ───────────────────────────────────────────────
function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getDailyRewardKey() {
  return `crush_daily_reward_${getTodayKey()}`;
}
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

// ─── SuperCrushConfirmModal ───────────────────────────────────────────────────
function SuperCrushConfirmModal({
  user,
  price,
  coins,
  loading,
  onConfirm,
  onCancel,
}) {
  const displayName = getDisplayName(user);
  const hasBalance = coins === null || coins >= price;

  return (
    <div
      className="sc-overlay"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="sc-modal">
        <div className="sc-glow" aria-hidden="true" />
        <div className="sc-icon">⚡</div>
        <h3 className="sc-title">Super Crush</h3>
        <p className="sc-desc">
          Destácate entre todos y haz que <strong>{displayName}</strong> sepa
          que eres especial.
        </p>

        <div className="sc-price-row">
          <span className="sc-price-label">Costo</span>
          <span className="sc-price-value">🪙 {price} monedas</span>
        </div>

        {coins !== null && (
          <div className="sc-balance-row">
            <span className="sc-balance-label">Tu saldo</span>
            <span
              className={`sc-balance-value${hasBalance ? "" : " sc-balance-low"}`}
            >
              🪙 {coins} monedas
            </span>
          </div>
        )}

        {!hasBalance && (
          <div className="sc-insufficient">
            <span className="sc-insuf-icon">⚠️</span>
            <span>Saldo insuficiente.</span>
            <Link href="/coins" className="sc-buy-link" onClick={onCancel}>
              Comprar monedas →
            </Link>
          </div>
        )}

        <div className="sc-actions">
          <button
            className="sc-btn sc-btn-cancel"
            onClick={onCancel}
            disabled={loading}
          >
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
          background: rgba(4, 0, 14, 0.82);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
        }
        .sc-modal {
          position: relative;
          background: linear-gradient(155deg, #130525 0%, #0b0219 100%);
          border: 1px solid rgba(251, 191, 36, 0.4);
          border-radius: 22px;
          padding: 2rem 1.75rem 1.5rem;
          max-width: 360px;
          width: 100%;
          text-align: center;
          box-shadow:
            0 0 60px rgba(251, 191, 36, 0.18),
            0 0 120px rgba(224, 64, 251, 0.1);
          animation: sc-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          overflow: hidden;
        }
        @keyframes sc-pop {
          from {
            transform: scale(0.75);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .sc-glow {
          position: absolute;
          top: -40%;
          left: 50%;
          transform: translateX(-50%);
          width: 200px;
          height: 200px;
          background: radial-gradient(
            circle,
            rgba(251, 191, 36, 0.18) 0%,
            transparent 70%
          );
          pointer-events: none;
        }
        .sc-icon {
          font-size: 2.8rem;
          margin-bottom: 0.5rem;
          animation: sc-pulse 1.5s ease-in-out infinite;
        }
        @keyframes sc-pulse {
          0%,
          100% {
            transform: scale(1);
            filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.5));
          }
          50% {
            transform: scale(1.15);
            filter: drop-shadow(0 0 18px rgba(251, 191, 36, 0.8));
          }
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
          color: rgba(255, 255, 255, 0.6);
          margin: 0 0 1.25rem;
          line-height: 1.5;
        }
        .sc-desc strong {
          color: rgba(255, 255, 255, 0.85);
        }
        .sc-price-row,
        .sc-balance-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          border-radius: 10px;
          margin-bottom: 0.4rem;
        }
        .sc-price-row {
          background: rgba(251, 191, 36, 0.07);
          border: 1px solid rgba(251, 191, 36, 0.2);
        }
        .sc-balance-row {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .sc-price-label,
        .sc-balance-label {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.45);
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
          color: rgba(255, 255, 255, 0.7);
        }
        .sc-balance-low {
          color: #f87171 !important;
        }
        .sc-insufficient {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 0.75rem;
          border-radius: 10px;
          background: rgba(248, 113, 113, 0.08);
          border: 1px solid rgba(248, 113, 113, 0.25);
          margin: 0.5rem 0;
          font-size: 0.78rem;
          color: #f87171;
          flex-wrap: wrap;
        }
        .sc-insuf-icon {
          font-size: 0.9rem;
        }
        .sc-buy-link {
          color: #fbbf24;
          text-decoration: none;
          font-weight: 700;
          margin-left: auto;
        }
        .sc-buy-link:hover {
          text-decoration: underline;
        }
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
        .sc-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .sc-btn-cancel {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.5);
        }
        .sc-btn-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.08);
        }
        .sc-btn-confirm {
          background: linear-gradient(
            135deg,
            rgba(251, 191, 36, 0.2),
            rgba(224, 64, 251, 0.2)
          );
          border-color: rgba(251, 191, 36, 0.6);
          color: #fbbf24;
          box-shadow: 0 0 18px rgba(251, 191, 36, 0.2);
        }
        .sc-btn-confirm:hover:not(:disabled) {
          background: linear-gradient(
            135deg,
            rgba(251, 191, 36, 0.32),
            rgba(224, 64, 251, 0.32)
          );
          box-shadow: 0 0 32px rgba(251, 191, 36, 0.35);
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
      <button className="cab-close" onClick={onDismiss} aria-label="Cerrar">
        ✕
      </button>

      <style jsx>{`
        .cab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1rem;
          border-radius: 12px;
          background: linear-gradient(
            135deg,
            rgba(255, 45, 120, 0.12),
            rgba(224, 64, 251, 0.12)
          );
          border: 1px solid rgba(255, 45, 120, 0.3);
          font-size: 0.82rem;
          color: rgba(255, 255, 255, 0.85);
          animation: cab-slide 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .cab-super {
          background: linear-gradient(
            135deg,
            rgba(251, 191, 36, 0.12),
            rgba(224, 64, 251, 0.12)
          );
          border-color: rgba(251, 191, 36, 0.35);
        }
        @keyframes cab-slide {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .cab-icon {
          font-size: 1rem;
        }
        .cab-text {
          flex: 1;
          font-weight: 600;
        }
        .cab-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.35);
          cursor: pointer;
          font-size: 0.75rem;
          padding: 0;
          line-height: 1;
        }
        .cab-close:hover {
          color: rgba(255, 255, 255, 0.65);
        }
      `}</style>
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
      if (ms <= 0) {
        setCountdown("");
        return;
      }
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
    <div
      className="bm-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`bm-modal${isBoosted ? " bm-modal-active" : ""}`}>
        <div className="bm-glow" aria-hidden="true" />

        {/* Live activity indicator */}
        {activeBoostCount !== null && (
          <div className="bm-live-count">
            🔥 <strong>{activeBoostCount}</strong> personas están usando Boost
            ahora
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
          Aparece primero en la lista de perfiles · Más visibilidad · Más
          matches en 30 min
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
                <span>
                  Tienes <strong>{storedBoosts}</strong> boost
                  {storedBoosts > 1 ? "s" : ""} guardado
                  {storedBoosts > 1 ? "s" : ""}
                </span>
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
                      <span className="bm-price-value">
                        🪙 {boostPrice} monedas
                      </span>
                    </div>
                    {coins !== null && (
                      <div className="bm-balance-row">
                        <span className="bm-balance-label">Tu saldo</span>
                        <span
                          className={`bm-balance-value${!hasCoins ? " bm-low" : ""}`}
                        >
                          🪙 {coins} monedas
                        </span>
                      </div>
                    )}
                    {!hasCoins && (
                      <div className="bm-insufficient">
                        <span>⚠️ Saldo insuficiente</span>
                        <Link
                          href="/coins"
                          className="bm-buy-link"
                          onClick={onClose}
                        >
                          Comprar monedas →
                        </Link>
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
                      {pack.badge && (
                        <span className="bm-pack-badge">{pack.badge}</span>
                      )}
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
          <button
            className="bm-btn bm-btn-cancel"
            onClick={onClose}
            disabled={loading || !!packLoading}
          >
            {isBoosted ? "Cerrar" : "Cancelar"}
          </button>
          {!isBoosted && !packTab && (
            <button
              className="bm-btn bm-btn-confirm"
              onClick={onBoost}
              disabled={loading || !!packLoading || !canActivate}
            >
              {loading
                ? "Activando…"
                : hasStoredBoost
                  ? "🚀 Activar boost"
                  : `🚀 Boost · 🪙${boostPrice}`}
            </button>
          )}
        </div>

        <style jsx>{`
          .bm-overlay {
            position: fixed;
            inset: 0;
            z-index: 3000;
            background: rgba(4, 0, 14, 0.85);
            backdrop-filter: blur(12px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.25rem;
          }
          .bm-modal {
            position: relative;
            background: linear-gradient(155deg, #130525 0%, #0b0219 100%);
            border: 1px solid rgba(224, 64, 251, 0.4);
            border-radius: 22px;
            padding: 1.5rem 1.75rem 1.5rem;
            max-width: 380px;
            width: 100%;
            text-align: center;
            box-shadow:
              0 0 60px rgba(224, 64, 251, 0.18),
              0 0 120px rgba(255, 45, 120, 0.08);
            animation: bm-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            overflow: hidden;
          }
          .bm-modal-active {
            border-color: rgba(52, 211, 153, 0.5);
            box-shadow:
              0 0 60px rgba(52, 211, 153, 0.15),
              0 0 120px rgba(52, 211, 153, 0.08);
            animation:
              bm-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
              bm-glow-pulse 2s ease-in-out infinite;
          }
          @keyframes bm-glow-pulse {
            0%,
            100% {
              box-shadow:
                0 0 60px rgba(52, 211, 153, 0.15),
                0 0 120px rgba(52, 211, 153, 0.08);
            }
            50% {
              box-shadow:
                0 0 80px rgba(52, 211, 153, 0.3),
                0 0 140px rgba(52, 211, 153, 0.15);
            }
          }
          @keyframes bm-pop {
            from {
              transform: scale(0.75);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }
          .bm-glow {
            position: absolute;
            top: -40%;
            left: 50%;
            transform: translateX(-50%);
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: radial-gradient(
              circle,
              rgba(224, 64, 251, 0.18) 0%,
              transparent 70%
            );
            pointer-events: none;
          }
          .bm-live-count {
            font-size: 0.72rem;
            color: rgba(255, 255, 255, 0.65);
            margin-bottom: 0.6rem;
            background: rgba(255, 100, 0, 0.08);
            border: 1px solid rgba(255, 100, 0, 0.22);
            border-radius: 20px;
            padding: 0.3rem 0.75rem;
            display: inline-block;
          }
          .bm-live-count strong {
            color: #fb923c;
          }
          .bm-icon {
            font-size: 2.8rem;
            margin-bottom: 0.3rem;
            animation: bm-pulse 1.8s ease-in-out infinite;
          }
          @keyframes bm-pulse {
            0%,
            100% {
              transform: scale(1);
              filter: drop-shadow(0 0 8px rgba(224, 64, 251, 0.5));
            }
            50% {
              transform: scale(1.15);
              filter: drop-shadow(0 0 18px rgba(224, 64, 251, 0.9));
            }
          }
          .bm-title {
            font-size: 1.35rem;
            font-weight: 900;
            color: #e040fb;
            margin: 0 0 0.35rem;
          }
          .bm-urgency-phrases {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
            justify-content: center;
            margin-bottom: 0.6rem;
          }
          .bm-urgency-phrases span {
            font-size: 0.7rem;
            font-weight: 700;
            background: rgba(224, 64, 251, 0.1);
            border: 1px solid rgba(224, 64, 251, 0.3);
            border-radius: 20px;
            padding: 0.2rem 0.55rem;
            color: rgba(255, 255, 255, 0.8);
          }
          .bm-desc {
            font-size: 0.78rem;
            color: rgba(255, 255, 255, 0.45);
            margin: 0 0 1rem;
            line-height: 1.5;
          }
          .bm-active-countdown {
            margin-bottom: 1rem;
          }
          .bm-active {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            justify-content: center;
            padding: 0.55rem;
            border-radius: 10px;
            background: rgba(52, 211, 153, 0.08);
            border: 1px solid rgba(52, 211, 153, 0.3);
            color: #34d399;
            font-size: 0.85rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
          }
          .bm-countdown {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.1rem;
          }
          .bm-countdown-label {
            font-size: 0.65rem;
            color: rgba(255, 255, 255, 0.35);
            font-weight: 600;
          }
          .bm-countdown-value {
            font-size: 2rem;
            font-weight: 900;
            color: #34d399;
            font-variant-numeric: tabular-nums;
            text-shadow: 0 0 16px rgba(52, 211, 153, 0.5);
          }
          .bm-stored {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            justify-content: center;
            padding: 0.5rem 0.75rem;
            border-radius: 10px;
            margin-bottom: 0.75rem;
            background: rgba(251, 191, 36, 0.07);
            border: 1px solid rgba(251, 191, 36, 0.25);
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.75);
          }
          .bm-stored-icon {
            font-size: 1rem;
          }
          .bm-stored strong {
            color: #fbbf24;
          }
          .bm-tabs {
            display: flex;
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 0.85rem;
          }
          .bm-tab {
            flex: 1;
            padding: 0.5rem;
            font-size: 0.75rem;
            font-weight: 700;
            cursor: pointer;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.4);
            transition: all 0.2s;
          }
          .bm-tab-active {
            background: rgba(224, 64, 251, 0.15);
            color: #e040fb;
          }
          .bm-free-note {
            padding: 0.6rem 0.75rem;
            border-radius: 10px;
            margin-bottom: 0.75rem;
            background: rgba(251, 191, 36, 0.07);
            border: 1px solid rgba(251, 191, 36, 0.25);
            font-size: 0.8rem;
            color: #fbbf24;
            font-weight: 700;
          }
          .bm-price-row,
          .bm-balance-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.5rem 0.75rem;
            border-radius: 10px;
            margin-bottom: 0.4rem;
          }
          .bm-price-row {
            background: rgba(224, 64, 251, 0.07);
            border: 1px solid rgba(224, 64, 251, 0.2);
          }
          .bm-balance-row {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .bm-price-label,
          .bm-balance-label {
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.45);
            font-weight: 600;
          }
          .bm-price-value {
            font-size: 0.9rem;
            font-weight: 800;
            color: #e040fb;
          }
          .bm-balance-value {
            font-size: 0.85rem;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.7);
          }
          .bm-low {
            color: #f87171 !important;
          }
          .bm-insufficient {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
            padding: 0.6rem 0.75rem;
            border-radius: 10px;
            margin: 0.5rem 0;
            background: rgba(248, 113, 113, 0.08);
            border: 1px solid rgba(248, 113, 113, 0.25);
            font-size: 0.78rem;
            color: #f87171;
          }
          .bm-buy-link {
            color: #fbbf24;
            text-decoration: none;
            font-weight: 700;
            margin-left: auto;
          }
          .bm-buy-link:hover {
            text-decoration: underline;
          }
          .bm-packs {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
          }
          .bm-pack-btn {
            position: relative;
            display: flex;
            align-items: center;
            gap: 0.6rem;
            padding: 0.65rem 0.9rem;
            border-radius: 12px;
            cursor: pointer;
            background: rgba(224, 64, 251, 0.07);
            border: 1px solid rgba(224, 64, 251, 0.25);
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.82rem;
            font-weight: 700;
            text-align: left;
            transition: all 0.2s;
          }
          .bm-pack-btn:hover:not(:disabled) {
            background: rgba(224, 64, 251, 0.15);
            border-color: rgba(224, 64, 251, 0.5);
          }
          .bm-pack-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
          }
          .bm-pack-best {
            background: rgba(251, 191, 36, 0.08);
            border-color: rgba(251, 191, 36, 0.4);
          }
          .bm-pack-best:hover:not(:disabled) {
            background: rgba(251, 191, 36, 0.16);
            border-color: rgba(251, 191, 36, 0.6);
          }
          .bm-pack-badge {
            position: absolute;
            top: -8px;
            right: 10px;
            font-size: 0.6rem;
            font-weight: 800;
            color: #fbbf24;
            background: rgba(251, 191, 36, 0.15);
            border: 1px solid rgba(251, 191, 36, 0.35);
            border-radius: 20px;
            padding: 0.1rem 0.45rem;
          }
          .bm-pack-label {
            flex: 1;
          }
          .bm-pack-cost {
            color: #e040fb;
            font-size: 0.85rem;
          }
          .bm-pack-balance {
            font-size: 0.72rem;
            color: rgba(255, 255, 255, 0.35);
            text-align: right;
            margin-top: 0.15rem;
          }
          .bm-actions {
            display: flex;
            gap: 0.6rem;
            margin-top: 1.1rem;
          }
          .bm-btn {
            flex: 1;
            padding: 0.75rem 0.5rem;
            border-radius: 12px;
            font-size: 0.85rem;
            font-weight: 700;
            cursor: pointer;
            border: 1px solid;
            transition: all 0.2s;
          }
          .bm-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .bm-btn-cancel {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(255, 255, 255, 0.15);
            color: rgba(255, 255, 255, 0.5);
          }
          .bm-btn-cancel:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.08);
          }
          .bm-btn-confirm {
            background: linear-gradient(
              135deg,
              rgba(224, 64, 251, 0.2),
              rgba(255, 45, 120, 0.2)
            );
            border-color: rgba(224, 64, 251, 0.6);
            color: #e040fb;
            box-shadow: 0 0 18px rgba(224, 64, 251, 0.25);
          }
          .bm-btn-confirm:hover:not(:disabled) {
            background: linear-gradient(
              135deg,
              rgba(224, 64, 251, 0.35),
              rgba(255, 45, 120, 0.35)
            );
            box-shadow: 0 0 32px rgba(224, 64, 251, 0.45);
          }
          .spinner-sm {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: #e040fb;
            border-radius: 50%;
            animation: spin 0.7s linear infinite;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

// ─── BoostResultModal ─────────────────────────────────────────────────────────
function BoostResultModal({ result, onClose }) {
  return (
    <div
      className="br-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
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

        <button className="br-btn" onClick={onClose}>
          ¡Genial! 🎉
        </button>

        <style jsx>{`
          .br-overlay {
            position: fixed;
            inset: 0;
            z-index: 3100;
            background: rgba(4, 0, 14, 0.88);
            backdrop-filter: blur(14px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.25rem;
          }
          .br-modal {
            position: relative;
            background: linear-gradient(155deg, #0e1f14 0%, #070d10 100%);
            border: 1px solid rgba(52, 211, 153, 0.45);
            border-radius: 22px;
            padding: 2rem 1.75rem 1.5rem;
            max-width: 340px;
            width: 100%;
            text-align: center;
            box-shadow:
              0 0 60px rgba(52, 211, 153, 0.18),
              0 0 120px rgba(52, 211, 153, 0.08);
            animation: br-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            overflow: hidden;
          }
          @keyframes br-pop {
            from {
              transform: scale(0.7) translateY(20px);
              opacity: 0;
            }
            to {
              transform: scale(1) translateY(0);
              opacity: 1;
            }
          }
          .br-glow {
            position: absolute;
            top: -40%;
            left: 50%;
            transform: translateX(-50%);
            width: 220px;
            height: 220px;
            border-radius: 50%;
            background: radial-gradient(
              circle,
              rgba(52, 211, 153, 0.18) 0%,
              transparent 70%
            );
            pointer-events: none;
          }
          .br-icon {
            font-size: 3rem;
            margin-bottom: 0.35rem;
            animation: br-bounce 0.6s ease-out both;
          }
          @keyframes br-bounce {
            0% {
              transform: scale(0) rotate(-20deg);
            }
            70% {
              transform: scale(1.2) rotate(5deg);
            }
            100% {
              transform: scale(1) rotate(0);
            }
          }
          .br-title {
            font-size: 1.3rem;
            font-weight: 900;
            color: #34d399;
            margin: 0 0 0.2rem;
          }
          .br-subtitle {
            font-size: 0.78rem;
            color: rgba(255, 255, 255, 0.4);
            margin: 0 0 1.5rem;
          }
          .br-stats {
            display: flex;
            gap: 0.75rem;
            justify-content: center;
            margin-bottom: 1.5rem;
          }
          .br-stat {
            flex: 1;
            background: rgba(52, 211, 153, 0.06);
            border: 1px solid rgba(52, 211, 153, 0.2);
            border-radius: 14px;
            padding: 0.85rem 0.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.3rem;
          }
          .br-stat-value {
            font-size: 1.9rem;
            font-weight: 900;
            color: #34d399;
            line-height: 1;
          }
          .br-stat-label {
            font-size: 0.62rem;
            color: rgba(255, 255, 255, 0.5);
            font-weight: 600;
            line-height: 1.3;
          }
          .br-btn {
            width: 100%;
            padding: 0.85rem;
            border-radius: 14px;
            font-size: 0.9rem;
            font-weight: 800;
            cursor: pointer;
            border: 1px solid rgba(52, 211, 153, 0.5);
            background: linear-gradient(
              135deg,
              rgba(52, 211, 153, 0.18),
              rgba(52, 211, 153, 0.08)
            );
            color: #34d399;
            box-shadow: 0 0 18px rgba(52, 211, 153, 0.2);
            transition: all 0.2s;
          }
          .br-btn:hover {
            background: linear-gradient(
              135deg,
              rgba(52, 211, 153, 0.28),
              rgba(52, 211, 153, 0.14)
            );
            box-shadow: 0 0 28px rgba(52, 211, 153, 0.35);
          }
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
        <span className="drb-desc">
          +{DAILY_LOGIN_REWARD_COINS} monedas por volver hoy · ¡Regresa mañana
          para más matches!
        </span>
      </div>
      <button className="drb-close" onClick={onDismiss} aria-label="Cerrar">
        ✕
      </button>

      <style jsx>{`
        .drb {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.7rem 1rem;
          border-radius: 14px;
          background: linear-gradient(
            135deg,
            rgba(251, 191, 36, 0.1),
            rgba(224, 64, 251, 0.08)
          );
          border: 1px solid rgba(251, 191, 36, 0.32);
          position: relative;
          z-index: 1;
          animation: drb-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes drb-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .drb-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
          animation: drb-bounce 1.5s ease-in-out infinite;
        }
        @keyframes drb-bounce {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.2) rotate(-5deg);
          }
        }
        .drb-body {
          flex: 1;
          min-width: 0;
        }
        .drb-title {
          display: block;
          font-size: 0.85rem;
          font-weight: 800;
          color: #fbbf24;
          line-height: 1.2;
        }
        .drb-desc {
          display: block;
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.52);
          margin-top: 0.15rem;
          line-height: 1.3;
        }
        .drb-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.3);
          cursor: pointer;
          font-size: 0.8rem;
          padding: 0.2rem;
          flex-shrink: 0;
        }
        .drb-close:hover {
          color: rgba(255, 255, 255, 0.65);
        }
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
        <Link href="/explore" className="fcs-see-all">
          Ver todos →
        </Link>
      </div>
      <div className="fcs-scroll">
        {creators.map((c) => {
          const displayName = getDisplayName(c);
          const image = getUserImage(c);
          return (
            <Link
              key={c._id || c.userId}
              href={
                c.isLive && c.liveId
                  ? `/live/${c.liveId}`
                  : `/profile/${c._id || c.userId}`
              }
              className="fcs-card"
            >
              <div className="fcs-avatar-wrap">
                {image ? (
                  <img src={image} alt={displayName} className="fcs-avatar" />
                ) : (
                  <div className="fcs-avatar fcs-avatar-fallback">
                    {displayName[0]?.toUpperCase() || "?"}
                  </div>
                )}
                {c.isLive && (
                  <span className="fcs-live-dot" aria-label="En vivo" />
                )}
              </div>
              <span className="fcs-name">{displayName}</span>
              {c.isLive ? (
                <span className="fcs-badge fcs-badge-live">🔴 VIVO</span>
              ) : c.totalCoins ? (
                <span className="fcs-badge fcs-badge-hot">🔥 Top</span>
              ) : (
                <span className="fcs-badge fcs-badge-premium">💎 Premium</span>
              )}
            </Link>
          );
        })}
      </div>

      <style jsx>{`
        .fcs {
          position: relative;
          z-index: 1;
        }
        .fcs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.6rem;
        }
        .fcs-title {
          font-size: 0.82rem;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.75);
          letter-spacing: 0.01em;
        }
        .fcs-see-all {
          font-size: 0.72rem;
          font-weight: 700;
          color: #e040fb;
          text-decoration: none;
        }
        .fcs-see-all:hover {
          text-decoration: underline;
        }
        .fcs-scroll {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding-bottom: 0.35rem;
          scrollbar-width: none;
        }
        .fcs-scroll::-webkit-scrollbar {
          display: none;
        }
        .fcs-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          flex-shrink: 0;
          width: 72px;
          text-decoration: none;
          transition: transform 0.18s;
        }
        .fcs-card:hover {
          transform: translateY(-3px);
        }
        .fcs-avatar-wrap {
          position: relative;
        }
        .fcs-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(224, 64, 251, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .fcs-avatar-fallback {
          background: linear-gradient(135deg, #1c0938, #2a0d4f);
          font-size: 1.4rem;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.3);
        }
        .fcs-live-dot {
          position: absolute;
          bottom: 1px;
          right: 1px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #ff2d78;
          border: 2px solid #060112;
          animation: fcs-pulse 1.4s ease-in-out infinite;
        }
        @keyframes fcs-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(255, 45, 120, 0.55);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(255, 45, 120, 0);
          }
        }
        .fcs-name {
          font-size: 0.65rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
          max-width: 68px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .fcs-badge {
          font-size: 0.55rem;
          font-weight: 800;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          letter-spacing: 0.04em;
        }
        .fcs-badge-live {
          background: rgba(255, 45, 120, 0.14);
          border: 1px solid rgba(255, 45, 120, 0.4);
          color: #ff2d78;
        }
        .fcs-badge-hot {
          background: rgba(251, 113, 36, 0.12);
          border: 1px solid rgba(251, 113, 36, 0.35);
          color: #fb923c;
        }
        .fcs-badge-premium {
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.3);
          color: #fbbf24;
        }
      `}</style>
    </div>
  );
}

// ─── Premium profile cards ───────────────────────────────────────────────────
function PremiumProfileCard({
  user,
  superCrushPrice,
  actionLoading,
  onSuperCrush,
}) {
  if (!user || typeof user !== "object") return null;

  const displayName = getDisplayName(user);
  const image = getUserImage(user);
  const age = calcAge(user?.birthdate);
  const isCreator = user?.role === "creator";
  const isLive = isCreator && !!user?.isLive && !!user?.liveId;
  const privateCallEnabled =
    isCreator && user?.creatorProfile?.privateCallEnabled;
  const pricePerMinute = user?.creatorProfile?.pricePerMinute ?? 0;
  const compatibilityScore = user?.compatibilityScore ?? null;
  const sharedInterests = Array.isArray(user?.sharedInterests)
    ? user.sharedInterests
    : [];
  let statusBadges = [];
  try {
    statusBadges = computeStatusBadges(user) || [];
  } catch (err) {
    console.error("StatusBadges computation failed:", err);
    statusBadges = [];
  }

  return (
    <article className="premium-profile-card">
      <div className="premium-profile-photo-wrap">
        {image ? (
          <img
            src={image}
            alt={displayName}
            className="premium-profile-photo"
          />
        ) : (
          <div className="premium-profile-placeholder">
            {displayName[0]?.toUpperCase() || "?"}
          </div>
        )}
        {isLive && (
          <Badge variant="live" pulse>
            EN VIVO
          </Badge>
        )}
      </div>
      <div className="premium-profile-body">
        <div className="premium-profile-main">
          <div>
            <h3 className="premium-profile-name">
              {displayName}
              {age ? <span>{age}</span> : null}
            </h3>
            {user.location && (
              <p className="premium-profile-location">📍 {user.location}</p>
            )}
          </div>
          {compatibilityScore !== null && compatibilityScore > 0 && (
            <span className="compat-chip">🔥 {compatibilityScore}%</span>
          )}
        </div>

        <div className="premium-profile-badges">
          {isCreator && <Badge variant="creator">CREATOR</Badge>}
          {user.isVerified && <Badge variant="verified">✓</Badge>}
          <StatusBadges
            badges={Array.isArray(statusBadges) ? statusBadges : []}
            compact
          />
        </div>

        {user.bio && <p className="premium-profile-bio">{user.bio}</p>}

        {Array.isArray(user.interests) && user.interests.length > 0 && (
          <div className="premium-profile-tags">
            {user.interests.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className={`premium-profile-tag${sharedInterests.includes(tag) ? " premium-profile-tag-shared" : ""}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="premium-profile-actions">
          {isLive && user.liveId && (
            <Link
              href={`/live/${user.liveId}`}
              className="profile-action-link profile-action-live"
            >
              🔴 Ver live
            </Link>
          )}
          {privateCallEnabled && (
            <span className="profile-action-link profile-action-muted">
              📞 🪙{pricePerMinute}/min
            </span>
          )}
          <button
            className="profile-super-btn"
            onClick={() => onSuperCrush(user)}
            disabled={actionLoading}
            title={`Super Crush · ${superCrushPrice} 🪙`}
          >
            ⚡ Super Crush · 🪙{superCrushPrice}
          </button>
        </div>
      </div>

      <style jsx>{`
        .premium-profile-card {
          display: grid;
          grid-template-columns: 92px minmax(0, 1fr);
          gap: 0.9rem;
          padding: 0.9rem;
          border-radius: 20px;
          background: rgba(15, 8, 32, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
        }
        .premium-profile-photo-wrap {
          position: relative;
          width: 92px;
          height: 118px;
          border-radius: 18px;
          overflow: hidden;
          background: linear-gradient(
            135deg,
            rgba(255, 45, 120, 0.22),
            rgba(224, 64, 251, 0.22)
          );
        }
        .premium-profile-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .premium-profile-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.8);
        }
        .premium-profile-photo-wrap :global(.badge) {
          position: absolute;
          left: 0.45rem;
          bottom: 0.45rem;
        }
        .premium-profile-body {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .premium-profile-main {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: flex-start;
        }
        .premium-profile-name {
          margin: 0;
          color: var(--text);
          font-size: 1rem;
          font-weight: 900;
        }
        .premium-profile-name span {
          margin-left: 0.35rem;
          color: rgba(255, 255, 255, 0.55);
          font-weight: 700;
        }
        .premium-profile-location,
        .premium-profile-bio {
          margin: 0;
          color: rgba(255, 255, 255, 0.52);
          font-size: 0.78rem;
          line-height: 1.4;
        }
        .premium-profile-bio {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .premium-profile-badges,
        .premium-profile-tags,
        .premium-profile-actions {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .compat-chip,
        .premium-profile-tag,
        .profile-action-link {
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.72);
          font-size: 0.68rem;
          font-weight: 800;
          padding: 0.25rem 0.55rem;
          text-decoration: none;
          white-space: nowrap;
        }
        .compat-chip {
          color: #fb923c;
          border-color: rgba(251, 146, 60, 0.32);
          background: rgba(251, 146, 60, 0.08);
        }
        .premium-profile-tag-shared {
          color: #ff6ba8;
          border-color: rgba(255, 45, 120, 0.35);
          background: rgba(255, 45, 120, 0.1);
        }
        .profile-action-live {
          color: #ff5b93;
          border-color: rgba(255, 45, 120, 0.34);
        }
        .profile-action-muted {
          color: rgba(255, 255, 255, 0.52);
        }
        .profile-super-btn {
          border: none;
          border-radius: 999px;
          padding: 0.42rem 0.72rem;
          background: linear-gradient(135deg, #fbbf24, #fb7185);
          color: #19020a;
          font-size: 0.72rem;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(251, 191, 36, 0.18);
        }
        .profile-super-btn:disabled {
          opacity: 0.62;
          cursor: not-allowed;
        }
        @media (max-width: 560px) {
          .premium-profile-card {
            grid-template-columns: 78px minmax(0, 1fr);
            padding: 0.75rem;
          }
          .premium-profile-photo-wrap {
            width: 78px;
            height: 104px;
          }
        }
      `}</style>
    </article>
  );
}

function BoostDashboardCard({
  isBoosted,
  boostUntil,
  storedBoosts,
  activeBoostCount,
  boostPrice,
  boostLoading,
  onOpenBoost,
}) {
  return (
    <section className="dashboard-card boost-dashboard-card">
      <div className="dashboard-card-header">
        <span className="dashboard-card-icon">🚀</span>
        <div>
          <h2>Boost premium</h2>
          <p>
            {isBoosted
              ? "Tu perfil está apareciendo antes que otros."
              : "Activa visibilidad extra para recibir más likes."}
          </p>
        </div>
      </div>
      <div className="boost-status-grid">
        <div className="boost-stat">
          <span>Estado</span>
          <strong>{isBoosted ? "Activo" : "Disponible"}</strong>
        </div>
        <div className="boost-stat">
          <span>Guardados</span>
          <strong>{storedBoosts}</strong>
        </div>
        {activeBoostCount !== null && (
          <div className="boost-stat">
            <span>Boosts activos</span>
            <strong>{activeBoostCount}</strong>
          </div>
        )}
      </div>
      {isBoosted && boostUntil && (
        <p className="boost-until">
          Activo hasta {new Date(boostUntil).toLocaleString()}
        </p>
      )}
      <button
        className="dashboard-primary-btn"
        onClick={onOpenBoost}
        disabled={boostLoading}
      >
        {boostLoading
          ? "Activando…"
          : isBoosted
            ? "Gestionar Boost"
            : `Activar Boost · 🪙${boostPrice}`}
      </button>

      <style jsx>{`
        .dashboard-card {
          position: relative;
          padding: 1rem;
          border-radius: 22px;
          background: rgba(15, 8, 32, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }
        .dashboard-card:before {
          content: "";
          position: absolute;
          inset: -60% auto auto -20%;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(251, 191, 36, 0.12),
            transparent 68%
          );
          pointer-events: none;
        }
        .dashboard-card-header {
          position: relative;
          display: flex;
          gap: 0.8rem;
          align-items: flex-start;
        }
        .dashboard-card-icon {
          font-size: 1.8rem;
          filter: drop-shadow(0 0 12px rgba(251, 191, 36, 0.45));
        }
        h2 {
          margin: 0;
          color: var(--text);
          font-size: 1rem;
          font-weight: 900;
        }
        p {
          margin: 0.2rem 0 0;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.78rem;
          line-height: 1.45;
        }
        .boost-status-grid {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.55rem;
          margin: 1rem 0;
        }
        .boost-stat {
          padding: 0.65rem;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .boost-stat span {
          display: block;
          color: rgba(255, 255, 255, 0.42);
          font-size: 0.68rem;
          font-weight: 700;
        }
        .boost-stat strong {
          display: block;
          margin-top: 0.22rem;
          color: #fbbf24;
          font-size: 0.9rem;
        }
        .boost-until {
          margin: -0.35rem 0 0.8rem;
          color: rgba(255, 255, 255, 0.55);
        }
        .dashboard-primary-btn {
          position: relative;
          width: 100%;
          border: none;
          border-radius: 999px;
          padding: 0.72rem 1rem;
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          color: #fff;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(224, 64, 251, 0.24);
        }
        .dashboard-primary-btn:disabled {
          opacity: 0.62;
          cursor: not-allowed;
        }
        @media (max-width: 640px) {
          .boost-status-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

function SuperCrushDashboardCard({
  featuredUser,
  superCrushPrice,
  coins,
  actionLoading,
  onSuperCrush,
}) {
  const displayName = featuredUser
    ? getDisplayName(featuredUser)
    : "alguien especial";
  return (
    <section className="dashboard-card super-dashboard-card">
      <div className="super-orb">⚡</div>
      <h2>Super Crush destacado</h2>
      <p>
        Hazte notar al instante con una señal premium. Ideal para perfiles
        compatibles o creadores destacados.
      </p>
      <div className="super-price-row">
        <span>Costo</span>
        <strong>🪙 {superCrushPrice}</strong>
      </div>
      {coins !== null && (
        <div className="super-price-row super-balance-row">
          <span>Tu saldo</span>
          <strong>🪙 {coins}</strong>
        </div>
      )}
      <button
        className="super-dashboard-btn"
        onClick={() => featuredUser && onSuperCrush(featuredUser)}
        disabled={actionLoading || !featuredUser}
      >
        {featuredUser ? `Enviar a ${displayName}` : "Busca destacados abajo"}
      </button>

      <style jsx>{`
        .dashboard-card {
          padding: 1rem;
          border-radius: 22px;
          background: linear-gradient(
            155deg,
            rgba(251, 191, 36, 0.13),
            rgba(15, 8, 32, 0.76)
          );
          border: 1px solid rgba(251, 191, 36, 0.24);
          overflow: hidden;
        }
        .super-orb {
          width: 54px;
          height: 54px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(251, 191, 36, 0.14);
          border: 1px solid rgba(251, 191, 36, 0.3);
          font-size: 1.8rem;
          margin-bottom: 0.8rem;
          filter: drop-shadow(0 0 18px rgba(251, 191, 36, 0.35));
        }
        h2 {
          margin: 0;
          color: #fbbf24;
          font-size: 1rem;
          font-weight: 900;
        }
        p {
          margin: 0.35rem 0 1rem;
          color: rgba(255, 255, 255, 0.55);
          font-size: 0.78rem;
          line-height: 1.5;
        }
        .super-price-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.55rem 0.7rem;
          border-radius: 13px;
          background: rgba(0, 0, 0, 0.16);
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 0.5rem;
          color: rgba(255, 255, 255, 0.52);
          font-size: 0.76rem;
        }
        .super-price-row strong {
          color: #fbbf24;
        }
        .super-balance-row strong {
          color: rgba(255, 255, 255, 0.82);
        }
        .super-dashboard-btn {
          width: 100%;
          margin-top: 0.35rem;
          border: none;
          border-radius: 999px;
          padding: 0.72rem 1rem;
          background: linear-gradient(135deg, #fbbf24, #fb7185);
          color: #1d0710;
          font-weight: 900;
          cursor: pointer;
        }
        .super-dashboard-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CrushPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [matchData, setMatchData] = useState(null);
  const [superCrushPrice, setSuperCrushPrice] = useState(50);
  const [boostPrice, setBoostPrice] = useState(100);
  const [boostPacks, setBoostPacks] = useState(null);
  const [coins, setCoins] = useState(null);
  const [superCrushTarget, setSuperCrushTarget] = useState(null);
  const [crushActivity, setCrushActivity] = useState(null);
  const [boostModal, setBoostModal] = useState(false);
  const [isBoosted, setIsBoosted] = useState(false);
  const [boostUntil, setBoostUntil] = useState(null);
  const [boostLoading, setBoostLoading] = useState(false);
  const [packLoading, setPackLoading] = useState(null);
  const [storedBoosts, setStoredBoosts] = useState(0);
  const [activeBoostCount, setActiveBoostCount] = useState(null);
  const [boostResult, setBoostResult] = useState(null);
  const [showBoostResult, setShowBoostResult] = useState(false);
  const [showDailyReward, setShowDailyReward] = useState(false);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const prevIsBoostedRef = useRef(false);

  const highlightedProfiles = featuredCreators.slice(0, 6);
  const featuredSuperCrushTarget = highlightedProfiles[0] || null;
  const canSuperCrush = coins === null || coins >= superCrushPrice;

  const fetchConfig = useCallback(async () => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    try {
      const [cfgRes, meRes, boostRes, activeRes] = await Promise.all([
        fetch(`${API_URL}/api/matches/config`, {
          headers: { Authorization: "Bearer " + token },
        }),
        fetch(`${API_URL}/api/user/me`, {
          headers: { Authorization: "Bearer " + token },
        }),
        fetch(`${API_URL}/api/matches/boost-status`, {
          headers: { Authorization: "Bearer " + token },
        }),
        fetch(`${API_URL}/api/matches/boost-active-count`, {
          headers: { Authorization: "Bearer " + token },
        }),
      ]);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setSuperCrushPrice(cfg.superCrushPrice ?? 50);
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
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.replace("/login");
      return;
    }
    if (checkAndClaimDailyReward()) setShowDailyReward(true);
    fetchConfig();
  }, [router, fetchConfig]);

  useEffect(() => {
    if (!isBoosted || !boostUntil) return;
    const msLeft = new Date(boostUntil) - Date.now();
    if (msLeft <= 0) return;
    const id = setTimeout(fetchConfig, msLeft + 2000);
    return () => clearTimeout(id);
  }, [isBoosted, boostUntil, fetchConfig]);

  const fetchHighlights = useCallback(async ({ signal } = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/feed?cacheBust=${Date.now()}`, {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
        signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      const feedProfiles = Array.isArray(data?.recommendedProfiles) ? data.recommendedProfiles : [];
      const featured = Array.isArray(data?.featuredCreators) ? data.featuredCreators : [];
      const seen = new Set();
      const merged = [...feedProfiles, ...featured].filter((profile) => {
        const id = String(profile._id || profile.userId || "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setFeaturedCreators(merged.slice(0, 10));
    } catch (err) {
      if (err.name !== "AbortError") {
        /* highlighted profiles are optional */
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchHighlights({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchHighlights]);

  useEffect(() => {
    const handleProfileUpdated = () => {
      fetchConfig();
      fetchHighlights();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
  }, [fetchConfig, fetchHighlights]);

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
        const matchedUser = highlightedProfiles.find(
          (u) => String(u._id || u.userId) === String(matchedUserId),
        );
        if (matchedUser) return { user: matchedUser, isSuperCrush: false };
        return {
          user: {
            _id: matchedUserId,
            username: matchedUsername,
            name: matchedUsername,
          },
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
  }, [highlightedProfiles]);

  const requestSuperCrush = useCallback(
    (user) => {
      if (actionLoading || !user) return;
      setSuperCrushTarget(user);
    },
    [actionLoading],
  );

  const handleSuperCrush = useCallback(async () => {
    const userId = superCrushTarget?._id || superCrushTarget?.userId;
    if (!userId) return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    setActionLoading(true);
    const target = superCrushTarget;
    setSuperCrushTarget(null);
    try {
      const res = await fetch(`${API_URL}/api/matches/super-crush/${userId}`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (res.ok) {
        setCoins((c) => (c !== null ? c - superCrushPrice : c));
        if (data.match) setMatchData({ user: target, isSuperCrush: true });
      } else {
        setError(data.message || "No se pudo enviar el Super Crush");
        setTimeout(() => setError(""), 5000);
      }
    } catch {
      setError("Error de conexión");
      setTimeout(() => setError(""), 5000);
    } finally {
      setActionLoading(false);
    }
  }, [router, superCrushPrice, superCrushTarget]);

  const handleBoost = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    setBoostLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/matches/boost`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (res.ok) {
        if (!data.usedStoredBoost)
          setCoins((c) => (c !== null ? c - boostPrice : c));
        else setStoredBoosts((s) => Math.max(0, s - 1));
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

  const handleBuyBoostPack = useCallback(
    async (quantity) => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }
      setPackLoading(quantity);
      try {
        const res = await fetch(`${API_URL}/api/matches/boost-pack`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ quantity }),
        });
        const data = await res.json();
        if (res.ok) {
          if (typeof data.coins === "number") setCoins(data.coins);
          else if (data.coinsSpent)
            setCoins((c) => (c !== null ? c - data.coinsSpent : c));
          if (typeof data.storedBoosts === "number")
            setStoredBoosts(data.storedBoosts);
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
    },
    [router],
  );

  return (
    <div className="crush-page">
      <div className="page-glow page-glow-1" aria-hidden="true" />
      <div className="page-glow page-glow-2" aria-hidden="true" />

      <div className="crush-header">
        <div>
          <h1 className="page-title">
            <span className="title-icon">💘</span> Crush Premium
          </h1>
          <p className="page-subtitle">
            Likes ocultos · Boost · Super Crush · perfiles destacados
          </p>
        </div>
        <div className="header-actions">
          {coins !== null && (
            <Link href="/coins" className="coin-chip">
              <span>🪙</span>
              <strong>{coins}</strong>
            </Link>
          )}
          <button
            className={`boost-btn${isBoosted ? " boost-btn-active" : ""}`}
            onClick={() => setBoostModal(true)}
          >
            🚀 {isBoosted ? "Boost activo" : "Boost"}
          </button>
          <Link href="/matches" className="quick-link-btn">
            💗 Matches
          </Link>
        </div>
      </div>

      {crushActivity && (
        <CrushActivityBanner
          event={crushActivity}
          onDismiss={() => setCrushActivity(null)}
        />
      )}
      <ActivityBar variant="pills" />
      {showDailyReward && (
        <DailyRewardBanner onDismiss={() => setShowDailyReward(false)} />
      )}
      {error && <div className="banner-error">{error}</div>}

      <section className="hero-dashboard">
        <div className="hero-copy">
          <span className="eyebrow">Hub especial</span>
          <h2>Todo lo premium de Crush, sin duplicar el feed.</h2>
          <p>
            Consulta quién ya mostró interés, impulsa tu perfil y destaca con
            Super Crush desde una experiencia curada.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/feed" className="hero-action hero-action-primary">
            Ir al Feed
          </Link>
          <Link href="/matches" className="hero-action">
            Ver Matches
          </Link>
          <Link href="/coins" className="hero-action">
            Comprar Coins
          </Link>
        </div>
      </section>

      <HiddenLikesSection compact />

      <div className="dashboard-grid">
        <BoostDashboardCard
          isBoosted={isBoosted}
          boostUntil={boostUntil}
          storedBoosts={storedBoosts}
          activeBoostCount={activeBoostCount}
          boostPrice={boostPrice}
          boostLoading={boostLoading}
          onOpenBoost={() => setBoostModal(true)}
        />
        <SuperCrushDashboardCard
          featuredUser={featuredSuperCrushTarget}
          superCrushPrice={superCrushPrice}
          coins={coins}
          actionLoading={actionLoading || !canSuperCrush}
          onSuperCrush={requestSuperCrush}
        />
      </div>

      <section className="highlight-section">
        <div className="section-heading-row">
          <div>
            <h2>Perfiles destacados</h2>
            <p>
              Selección curada de perfiles activos y compatibles para acciones
              premium.
            </p>
          </div>
          <Link href="/feed" className="section-link">
            Explorar feed →
          </Link>
        </div>
        {loading ? (
          <div className="highlight-skeleton-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="highlight-skeleton" />
            ))}
          </div>
        ) : highlightedProfiles.length > 0 ? (
          <div className="highlight-list">
            {highlightedProfiles.map((profile) => (
              <PremiumProfileCard
                key={profile._id || profile.userId}
                user={profile}
                superCrushPrice={superCrushPrice}
                actionLoading={actionLoading}
                onSuperCrush={requestSuperCrush}
              />
            ))}
          </div>
        ) : (
          <div className="empty-highlights">
            <span>✨</span>
            <h3>Pronto habrá destacados</h3>
            <p>
              Mientras tanto, usa el Feed para descubrir nuevos perfiles o
              revisa tus Matches.
            </p>
            <div>
              <Link href="/feed">Ir al Feed</Link>
              <Link href="/matches">Ver Matches</Link>
            </div>
          </div>
        )}
      </section>

      {superCrushTarget && (
        <SuperCrushConfirmModal
          user={superCrushTarget}
          price={superCrushPrice}
          coins={coins}
          loading={actionLoading}
          onConfirm={handleSuperCrush}
          onCancel={() => setSuperCrushTarget(null)}
        />
      )}

      {matchData && (
        <MatchModal
          user={matchData.user}
          isSuperCrush={matchData.isSuperCrush}
          onClose={() => setMatchData(null)}
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
          onClose={() => {
            setShowBoostResult(false);
            setBoostResult(null);
          }}
        />
      )}

      {featuredCreators.length > 0 && (
        <FeaturedCreatorsStrip creators={featuredCreators} />
      )}

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
          width: 400px;
          height: 400px;
          top: -100px;
          left: -100px;
          background: radial-gradient(
            circle,
            rgba(224, 64, 251, 0.08) 0%,
            transparent 70%
          );
        }
        .page-glow-2 {
          width: 350px;
          height: 350px;
          bottom: 100px;
          right: -80px;
          background: radial-gradient(
            circle,
            rgba(255, 45, 120, 0.07) 0%,
            transparent 70%
          );
        }
        .crush-header,
        .hero-dashboard,
        .dashboard-grid,
        .highlight-section {
          position: relative;
          z-index: 1;
        }
        .crush-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
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
        .title-icon {
          -webkit-text-fill-color: initial;
        }
        .page-subtitle {
          font-size: 0.78rem;
          color: rgba(255, 255, 255, 0.42);
          margin: 0.15rem 0 0;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .coin-chip,
        .quick-link-btn,
        .boost-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.42rem 0.9rem;
          border-radius: 999px;
          text-decoration: none;
          font-size: 0.8rem;
          font-weight: 800;
          backdrop-filter: blur(6px);
        }
        .coin-chip {
          background: rgba(251, 191, 36, 0.07);
          border: 1px solid rgba(251, 191, 36, 0.22);
          color: #fbbf24;
        }
        .quick-link-btn {
          border: 1px solid rgba(255, 45, 120, 0.3);
          background: rgba(255, 45, 120, 0.07);
          color: #ff5b93;
        }
        .boost-btn {
          border: 1px solid rgba(251, 191, 36, 0.28);
          background: rgba(251, 191, 36, 0.08);
          color: #fbbf24;
          cursor: pointer;
        }
        .boost-btn-active {
          background: linear-gradient(
            135deg,
            rgba(251, 191, 36, 0.18),
            rgba(224, 64, 251, 0.12)
          );
          box-shadow: 0 0 16px rgba(251, 191, 36, 0.2);
        }
        .banner-error {
          position: relative;
          z-index: 1;
          padding: 0.75rem 1rem;
          border-radius: 14px;
          background: rgba(248, 113, 113, 0.1);
          border: 1px solid rgba(248, 113, 113, 0.28);
          color: #fca5a5;
          font-size: 0.82rem;
        }
        .hero-dashboard {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: center;
          padding: 1.15rem;
          border-radius: 24px;
          background: linear-gradient(
            135deg,
            rgba(255, 45, 120, 0.14),
            rgba(224, 64, 251, 0.08)
          );
          border: 1px solid rgba(255, 45, 120, 0.2);
          overflow: hidden;
        }
        .eyebrow {
          display: inline-flex;
          margin-bottom: 0.45rem;
          color: #ff6ba8;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .hero-copy h2 {
          margin: 0;
          color: var(--text);
          font-size: 1.2rem;
          font-weight: 900;
        }
        .hero-copy p {
          margin: 0.35rem 0 0;
          color: rgba(255, 255, 255, 0.55);
          font-size: 0.82rem;
          line-height: 1.45;
          max-width: 620px;
        }
        .hero-actions {
          display: flex;
          gap: 0.55rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .hero-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.6rem 0.85rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.78);
          text-decoration: none;
          font-size: 0.76rem;
          font-weight: 900;
        }
        .hero-action-primary {
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          border-color: transparent;
          color: #fff;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }
        .highlight-section {
          padding: 1rem;
          border-radius: 24px;
          background: rgba(9, 3, 22, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }
        .section-heading-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.9rem;
        }
        .section-heading-row h2 {
          margin: 0;
          color: var(--text);
          font-size: 1rem;
          font-weight: 900;
        }
        .section-heading-row p {
          margin: 0.25rem 0 0;
          color: rgba(255, 255, 255, 0.48);
          font-size: 0.78rem;
        }
        .section-link {
          color: #ff6ba8;
          text-decoration: none;
          font-size: 0.78rem;
          font-weight: 800;
          white-space: nowrap;
        }
        .highlight-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.8rem;
        }
        .highlight-skeleton-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.8rem;
        }
        .highlight-skeleton {
          min-height: 138px;
          border-radius: 20px;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.05),
            rgba(255, 255, 255, 0.1),
            rgba(255, 255, 255, 0.05)
          );
          background-size: 220% 100%;
          animation: shimmer 1.3s infinite;
        }
        @keyframes shimmer {
          from {
            background-position: 120% 0;
          }
          to {
            background-position: -120% 0;
          }
        }
        .empty-highlights {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.55rem;
          padding: 2rem 1rem;
          text-align: center;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.035);
          border: 1px dashed rgba(255, 255, 255, 0.12);
        }
        .empty-highlights span {
          font-size: 2rem;
        }
        .empty-highlights h3 {
          margin: 0;
          color: var(--text);
          font-size: 1rem;
        }
        .empty-highlights p {
          margin: 0;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.8rem;
        }
        .empty-highlights div {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        .empty-highlights a {
          color: #ff6ba8;
          font-weight: 800;
          text-decoration: none;
          font-size: 0.8rem;
        }
        @media (max-width: 820px) {
          .hero-dashboard,
          .dashboard-grid,
          .highlight-list,
          .highlight-skeleton-grid {
            grid-template-columns: 1fr;
          }
          .hero-actions {
            justify-content: flex-start;
          }
        }
        @media (max-width: 560px) {
          .crush-header {
            flex-direction: column;
            align-items: stretch;
          }
          .header-actions {
            justify-content: flex-start;
          }
          .hero-dashboard,
          .highlight-section {
            border-radius: 20px;
            padding: 0.9rem;
          }
          .section-heading-row {
            flex-direction: column;
            gap: 0.45rem;
          }
        }
      `}</style>
    </div>
  );
}
