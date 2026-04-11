"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const DAILY_REWARD_DISMISSED_SESSION_KEY = "daily_reward_dismissed";

/**
 * DailyRewardPopup
 *
 * Fetches GET /api/daily-reward/status on mount (requires auth token in localStorage).
 * - If canClaim=true and not dismissed this session → auto-opens premium modal.
 * - If already claimed today → renders a small inline "already claimed" card.
 * - After a successful claim → transitions to a success state inside the modal.
 *
 * Props:
 *  onClaimed  {(data) => void}  Optional: called after a successful claim with { coinsAwarded, newBalance, streak }
 */
export default function DailyRewardPopup({ onClaimed }) {
  const [status, setStatus] = useState(null); // null | "loading" | "can_claim" | "claimed" | "error"
  const [rewardData, setRewardData] = useState(null); // { canClaim, streak, coinsToAward }
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null); // { coinsAwarded, newBalance, streak }
  const [claimed, setClaimed] = useState(false); // true after successful claim in this session
  const [claimError, setClaimError] = useState(""); // error message shown to user after failed claim
  const hasFetched = useRef(false);

  /* ── Fetch daily reward status once ─────────────────────────────────── */
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    setStatus("loading");
    fetch(`${API_URL}/api/daily-reward/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { setStatus("error"); return; }
        setRewardData(data);
        if (data.canClaim) {
          // Only auto-open if not already dismissed this browser session
          const dismissed = sessionStorage.getItem(DAILY_REWARD_DISMISSED_SESSION_KEY);
          setStatus("can_claim");
          if (!dismissed) setOpen(true);
        } else {
          setStatus("claimed");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  /* ── Claim handler ───────────────────────────────────────────────────── */
  const handleClaim = async () => {
    if (claiming || claimed) return;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    setClaiming(true);
    setClaimError("");
    try {
      const r = await fetch(`${API_URL}/api/daily-reward/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        setClaimResult(data);
        setClaimed(true);
        setStatus("claimed");
        if (onClaimed) onClaimed(data);
      } else {
        const err = await r.json().catch(() => ({}));
        setClaimError(err.message || "No se pudo reclamar la recompensa. Intenta de nuevo.");
      }
    } catch {
      setClaimError("Error de conexión. Comprueba tu red e inténtalo de nuevo.");
    }
    setClaiming(false);
  };

  /* ── Dismiss / close ─────────────────────────────────────────────────── */
  const handleClose = () => {
    setOpen(false);
    sessionStorage.setItem(DAILY_REWARD_DISMISSED_SESSION_KEY, "1");
  };

  /* ── Nothing to render yet ───────────────────────────────────────────── */
  if (!status || status === "loading" || status === "error") return null;

  /* ── Already-claimed inline card (not modal) ─────────────────────────── */
  if (status === "claimed" && !open) {
    const streak = claimResult?.streak ?? rewardData?.streak ?? 0;
    return (
      <div className="dr-claimed-card" role="status">
        <span className="dr-claimed-icon">✅</span>
        <div className="dr-claimed-body">
          <strong>Ya reclamaste tus monedas de hoy</strong>
          {streak > 1 && (
            <span className="dr-claimed-streak">🔥 Racha: {streak} días</span>
          )}
          <span className="dr-claimed-sub">Vuelve mañana para seguir ganando</span>
        </div>
        <div className="dr-claimed-links">
          <Link href="/crush" className="dr-link" aria-label="Ir a Crush">💖 Crush</Link>
          <Link href="/live" className="dr-link" aria-label="Ver directos">🎥 Directos</Link>
        </div>

        <style jsx>{`
          .dr-claimed-card {
            display: flex;
            align-items: center;
            gap: 0.9rem;
            padding: 0.85rem 1.1rem;
            background: linear-gradient(135deg, rgba(52,211,153,0.07) 0%, rgba(224,64,251,0.07) 100%);
            border: 1px solid rgba(52,211,153,0.25);
            border-radius: var(--radius-sm);
            flex-wrap: wrap;
          }
          .dr-claimed-icon { font-size: 1.4rem; flex-shrink: 0; }
          .dr-claimed-body {
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            flex: 1;
            min-width: 0;
          }
          .dr-claimed-body strong {
            font-size: 0.88rem;
            color: var(--text);
            font-weight: 700;
          }
          .dr-claimed-streak {
            font-size: 0.78rem;
            color: #fb923c;
            font-weight: 600;
          }
          .dr-claimed-sub {
            font-size: 0.76rem;
            color: var(--text-muted);
          }
          .dr-claimed-links {
            display: flex;
            gap: 0.5rem;
            flex-shrink: 0;
          }
          .dr-link {
            font-size: 0.76rem;
            font-weight: 700;
            color: var(--accent-2);
            text-decoration: none;
            padding: 0.25rem 0.7rem;
            border-radius: var(--radius-pill);
            background: rgba(224,64,251,0.1);
            border: 1px solid rgba(224,64,251,0.25);
            transition: background 0.2s, box-shadow 0.2s;
            white-space: nowrap;
          }
          .dr-link:hover {
            background: rgba(224,64,251,0.2);
            box-shadow: 0 0 10px rgba(224,64,251,0.3);
          }
        `}</style>
      </div>
    );
  }

  /* ── Modal ───────────────────────────────────────────────────────────── */
  if (!open) return null;

  const streak = claimResult?.streak ?? rewardData?.streak ?? 0;
  const coins = claimed ? claimResult?.coinsAwarded : rewardData?.coinsToAward ?? 20;
  const balance = claimResult?.newBalance;

  return (
    <div className="dr-backdrop" onClick={handleClose} role="dialog" aria-modal="true" aria-label="Recompensa diaria">
      <div className="dr-modal" onClick={(e) => e.stopPropagation()}>
        {/* Decorative orbs */}
        <div className="dr-orb dr-orb-1" />
        <div className="dr-orb dr-orb-2" />

        {/* Close button */}
        <button className="dr-close" onClick={handleClose} aria-label="Cerrar">✕</button>

        {!claimed ? (
          /* ── Claim state ───────────────────────────────────────────── */
          <>
            <div className="dr-gift-icon">🎁</div>
            <h2 className="dr-headline">Reclama tus monedas de hoy</h2>

            {/* Coin display */}
            <div className="dr-coin-wrap">
              <div className="dr-coin-glow" />
              <div className="dr-coin-amount">+{coins}</div>
              <div className="dr-coin-label">monedas</div>
            </div>

            {/* Streak */}
            {streak > 0 && (
              <div className="dr-streak">
                <span className="dr-streak-flame">🔥</span>
                <span className="dr-streak-text">Racha actual: <strong>{streak} {streak === 1 ? "día" : "días"}</strong></span>
              </div>
            )}

            <p className="dr-sub">Vuelve cada día para ganar más</p>

            {claimError && (
              <p className="dr-error" role="alert">{claimError}</p>
            )}

            <button
              className="dr-claim-btn"
              onClick={handleClaim}
              disabled={claiming}
            >
              {claiming ? (
                <span className="dr-spinner" />
              ) : (
                "Reclamar ahora"
              )}
            </button>
          </>
        ) : (
          /* ── Success state ─────────────────────────────────────────── */
          <>
            <div className="dr-success-icon">✅</div>
            <h2 className="dr-headline dr-headline-success">¡Monedas reclamadas!</h2>

            <div className="dr-coin-wrap dr-coin-wrap-success">
              <div className="dr-coin-glow dr-coin-glow-success" />
              <div className="dr-coin-amount">+{coins}</div>
              <div className="dr-coin-label">monedas</div>
            </div>

            {balance !== undefined && (
              <p className="dr-balance">Saldo actual: <strong>{balance} monedas</strong></p>
            )}

            {streak > 0 && (
              <div className="dr-streak dr-streak-success">
                <span className="dr-streak-flame">🔥</span>
                <span className="dr-streak-text">Racha: <strong>{streak} {streak === 1 ? "día" : "días"} seguidos</strong> — ¡sigue así!</span>
              </div>
            )}

            <p className="dr-sub">¿Qué quieres hacer ahora?</p>

            <div className="dr-cta-group">
              <Link href="/crush"   className="dr-cta-btn dr-cta-crush"   onClick={handleClose} aria-label="Ir a Crush">💖 Ir a Crush</Link>
              <Link href="/live"    className="dr-cta-btn dr-cta-live"    onClick={handleClose} aria-label="Ver directos">🎥 Ver directos</Link>
              <Link href="/matches" className="dr-cta-btn dr-cta-matches" onClick={handleClose} aria-label="Ver matches">💬 Ver matches</Link>
            </div>
          </>
        )}

        <style jsx>{`
          /* ── Backdrop ───────────────────────────────────── */
          .dr-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.75);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            padding: 1rem;
            animation: dr-fade-in 0.25s ease;
          }

          @keyframes dr-fade-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }

          /* ── Modal card ─────────────────────────────────── */
          .dr-modal {
            position: relative;
            width: 100%;
            max-width: 380px;
            background: linear-gradient(160deg, rgba(22,8,45,0.97) 0%, rgba(12,5,25,0.99) 100%);
            border: 1px solid rgba(255,45,120,0.35);
            border-radius: var(--radius);
            padding: 2.2rem 1.75rem 2rem;
            text-align: center;
            overflow: hidden;
            box-shadow: 0 0 60px rgba(255,45,120,0.18), 0 24px 64px rgba(0,0,0,0.8);
            animation: dr-slide-up 0.32s cubic-bezier(0.34,1.56,0.64,1);
          }

          @keyframes dr-slide-up {
            from { opacity: 0; transform: translateY(40px) scale(0.94); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
          }

          /* ── Decorative orbs ────────────────────────────── */
          .dr-orb {
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
            filter: blur(60px);
          }
          .dr-orb-1 {
            width: 200px; height: 200px;
            background: rgba(255,45,120,0.18);
            top: -60px; left: -60px;
          }
          .dr-orb-2 {
            width: 160px; height: 160px;
            background: rgba(224,64,251,0.15);
            bottom: -50px; right: -40px;
          }

          /* ── Close button ───────────────────────────────── */
          .dr-close {
            position: absolute;
            top: 0.9rem; right: 1rem;
            background: none;
            border: none;
            color: var(--text-muted);
            font-size: 1rem;
            cursor: pointer;
            padding: 0.25rem 0.4rem;
            border-radius: var(--radius-xs);
            transition: color 0.2s;
            z-index: 1;
          }
          .dr-close:hover { color: var(--text); }

          /* ── Gift / success icon ───────────────────────── */
          .dr-gift-icon, .dr-success-icon {
            font-size: 3rem;
            margin-bottom: 0.6rem;
            display: block;
            animation: dr-bounce 0.6s cubic-bezier(0.34,1.56,0.64,1);
          }
          .dr-success-icon {
            animation: dr-pop 0.5s cubic-bezier(0.34,1.56,0.64,1);
          }

          @keyframes dr-bounce {
            0%   { transform: scale(0.5) rotate(-10deg); opacity: 0; }
            70%  { transform: scale(1.15) rotate(4deg); }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }
          @keyframes dr-pop {
            0%   { transform: scale(0.3); opacity: 0; }
            60%  { transform: scale(1.2); }
            100% { transform: scale(1); opacity: 1; }
          }

          /* ── Headline ───────────────────────────────────── */
          .dr-headline {
            font-size: 1.18rem;
            font-weight: 800;
            color: var(--text);
            margin: 0 0 1.4rem;
            letter-spacing: -0.01em;
            line-height: 1.3;
          }
          .dr-headline-success {
            background: var(--grad-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          /* ── Coin display ───────────────────────────────── */
          .dr-coin-wrap {
            position: relative;
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 1.1rem;
          }
          .dr-coin-glow {
            position: absolute;
            inset: -18px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(251,191,36,0.35) 0%, transparent 70%);
            animation: coin-pulse 2s ease-in-out infinite;
            pointer-events: none;
          }
          .dr-coin-glow-success {
            background: radial-gradient(circle, rgba(52,211,153,0.4) 0%, transparent 70%);
          }

          @keyframes coin-pulse {
            0%, 100% { opacity: 0.7; transform: scale(1); }
            50%       { opacity: 1;   transform: scale(1.12); }
          }

          .dr-coin-amount {
            font-size: 2.8rem;
            font-weight: 900;
            color: #fbbf24;
            text-shadow: 0 0 24px rgba(251,191,36,0.7), 0 0 8px rgba(251,191,36,0.4);
            line-height: 1;
            letter-spacing: -0.02em;
            animation: dr-coin-glow-anim 2s ease-in-out infinite;
          }
          .dr-coin-wrap-success .dr-coin-amount {
            color: #34d399;
            text-shadow: 0 0 24px rgba(52,211,153,0.7), 0 0 8px rgba(52,211,153,0.4);
          }

          @keyframes dr-coin-glow-anim {
            0%, 100% { text-shadow: 0 0 24px rgba(251,191,36,0.7), 0 0 8px rgba(251,191,36,0.4); }
            50%       { text-shadow: 0 0 40px rgba(251,191,36,0.9), 0 0 16px rgba(251,191,36,0.6); }
          }

          .dr-coin-label {
            font-size: 0.78rem;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-top: 0.15rem;
          }

          /* ── Streak ─────────────────────────────────────── */
          .dr-streak {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.35rem 0.85rem;
            background: rgba(251,146,60,0.1);
            border: 1px solid rgba(251,146,60,0.3);
            border-radius: var(--radius-pill);
            margin-bottom: 0.9rem;
          }
          .dr-streak-success {
            background: rgba(52,211,153,0.08);
            border-color: rgba(52,211,153,0.28);
          }
          .dr-streak-flame { font-size: 1rem; }
          .dr-streak-text {
            font-size: 0.8rem;
            color: #fb923c;
            font-weight: 600;
          }
          .dr-streak-success .dr-streak-text { color: #34d399; }

          /* ── Subtext ────────────────────────────────────── */
          .dr-sub {
            font-size: 0.83rem;
            color: var(--text-muted);
            margin: 0 0 1.4rem;
          }

          /* ── Error message ──────────────────────────────── */
          .dr-error {
            font-size: 0.8rem;
            color: var(--error);
            background: var(--error-bg);
            border: 1px solid rgba(248,113,113,0.3);
            border-radius: var(--radius-xs);
            padding: 0.45rem 0.75rem;
            margin: -0.8rem 0 0.9rem;
          }

          /* ── Balance line ───────────────────────────────── */
          .dr-balance {
            font-size: 0.82rem;
            color: var(--text-muted);
            margin: -0.6rem 0 1rem;
          }
          .dr-balance strong { color: var(--text); }

          /* ── Claim button ───────────────────────────────── */
          .dr-claim-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.9rem 1.5rem;
            background: var(--grad-warm);
            border: none;
            border-radius: var(--radius-pill);
            color: #fff;
            font-size: 1rem;
            font-weight: 800;
            cursor: pointer;
            box-shadow: 0 4px 24px rgba(255,45,120,0.45);
            transition: opacity 0.2s, box-shadow 0.2s, transform 0.15s;
            letter-spacing: 0.01em;
          }
          .dr-claim-btn:hover:not(:disabled) {
            opacity: 0.92;
            box-shadow: 0 6px 32px rgba(255,45,120,0.6);
            transform: translateY(-1px);
          }
          .dr-claim-btn:active:not(:disabled) { transform: translateY(0); }
          .dr-claim-btn:disabled { opacity: 0.6; cursor: not-allowed; }

          /* ── Spinner ────────────────────────────────────── */
          .dr-spinner {
            display: inline-block;
            width: 18px; height: 18px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: dr-spin 0.7s linear infinite;
          }
          @keyframes dr-spin { to { transform: rotate(360deg); } }

          /* ── CTA group (post-claim) ─────────────────────── */
          .dr-cta-group {
            display: flex;
            flex-direction: column;
            gap: 0.55rem;
            width: 100%;
          }
          .dr-cta-btn {
            display: block;
            padding: 0.7rem 1rem;
            border-radius: var(--radius-pill);
            font-size: 0.88rem;
            font-weight: 700;
            text-decoration: none;
            text-align: center;
            transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          }
          .dr-cta-btn:hover { opacity: 0.88; transform: translateY(-1px); }
          .dr-cta-crush {
            background: linear-gradient(135deg, #ff2d78, #e040fb);
            color: #fff;
            box-shadow: 0 4px 16px rgba(255,45,120,0.35);
          }
          .dr-cta-live {
            background: rgba(129,140,248,0.12);
            color: #818cf8;
            border: 1px solid rgba(129,140,248,0.3);
          }
          .dr-cta-matches {
            background: rgba(96,165,250,0.1);
            color: #60a5fa;
            border: 1px solid rgba(96,165,250,0.25);
          }
        `}</style>
      </div>
    </div>
  );
}
