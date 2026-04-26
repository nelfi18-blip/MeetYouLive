"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C9 7 6.5 8.5 6.5 11.5A5.5 5.5 0 0 0 12 17a5.5 5.5 0 0 0 5.5-5.5C17.5 8.5 15 7 12 2Zm0 13a3.5 3.5 0 0 1-3.5-3.5c0-2 1.5-3.5 3.5-5.5 2 2 3.5 3.5 3.5 5.5A3.5 3.5 0 0 1 12 15Z" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 10h3.2a1.8 1.8 0 1 1 0 3.6H9.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/**
 * DailyStreakCard
 *
 * Compact card for the dashboard that shows:
 * - current daily streak
 * - coins to earn on next claim
 * - a "Vuelve mañana" prompt when already claimed today
 * - a claim CTA when reward is still available
 *
 * Props:
 *   onClaimed  {(data) => void}  Optional: called after successful claim with { coinsAwarded, newBalance, streak }
 */
export default function DailyStreakCard({ onClaimed }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { setLoading(false); return; }

    fetch(`${API_URL}/api/daily-reward/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleClaim = async () => {
    if (claiming || !data?.canClaim) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    setClaiming(true);
    setClaimError("");
    try {
      const r = await fetch(`${API_URL}/api/daily-reward/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      if (r.ok) {
        setData((prev) => ({
          ...prev,
          canClaim: false,
          streak: json.streak,
          coinsToAward: json.nextMilestone?.coins ?? prev?.coinsToAward,
          nextMilestone: json.nextMilestone,
        }));
        if (onClaimed) onClaimed(json);
      } else {
        setClaimError(json?.message || "Error al reclamar");
      }
    } catch {
      setClaimError("Error de conexión");
    } finally {
      setClaiming(false);
    }
  };

  if (loading || !data) return null;

  const { canClaim, streak, coinsToAward, nextMilestone } = data;

  const streakTierLabel =
    streak >= 30 ? "🏆 Racha máxima" :
    streak >= 14 ? "💎 Racha élite" :
    streak >= 7  ? "🔥 Racha de fuego" :
    streak >= 3  ? "⚡ Buena racha" :
    streak >= 1  ? "✨ Empezando" :
    "Empieza tu racha";

  const nextLabel = nextMilestone?.day
    ? `Día ${nextMilestone.day}: +${nextMilestone.coins} monedas`
    : `+${coinsToAward} monedas (nivel máximo)`;

  return (
    <div className="dsc-wrap" aria-label="Recompensa diaria y racha">
      <div className="dsc-orb dsc-orb-1" />
      <div className="dsc-orb dsc-orb-2" />

      <div className="dsc-left">
        <span className={`dsc-flame${canClaim ? " dsc-flame-glow" : ""}`}>
          {canClaim ? <FlameIcon /> : <MoonIcon />}
        </span>
        <div className="dsc-text">
          <span className="dsc-streak-label">{streakTierLabel}</span>
          <span className="dsc-streak-value">
            {streak} {streak === 1 ? "día" : "días"} de racha
          </span>
          {nextMilestone?.day && (
            <span className="dsc-next">{nextLabel}</span>
          )}
        </div>
      </div>

      <div className="dsc-right">
        {canClaim ? (
          <>
            <div className="dsc-reward-badge">
              <CoinIcon />
              +{coinsToAward}
            </div>
            <button
              className="dsc-btn-claim"
              onClick={handleClaim}
              disabled={claiming}
            >
              {claiming ? "…" : "Reclamar"}
            </button>
          </>
        ) : (
          <div className="dsc-claimed-state">
            <span className="dsc-check">✓ Reclamado</span>
            <span className="dsc-tomorrow">Vuelve mañana 🌙</span>
          </div>
        )}
      </div>

      {claimError && <p className="dsc-error">{claimError}</p>}

      <style jsx>{`
        .dsc-wrap {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          background: linear-gradient(135deg, rgba(251,146,60,0.08) 0%, rgba(239,68,68,0.06) 100%);
          border: 1px solid rgba(251,146,60,0.22);
          border-radius: 14px;
          padding: 0.9rem 1rem;
          flex-wrap: wrap;
        }

        .dsc-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(50px);
        }
        .dsc-orb-1 {
          width: 160px; height: 160px;
          background: radial-gradient(circle, rgba(251,146,60,0.15), transparent 70%);
          top: -60px; right: -40px;
        }
        .dsc-orb-2 {
          width: 100px; height: 100px;
          background: radial-gradient(circle, rgba(239,68,68,0.1), transparent 70%);
          bottom: -40px; left: 20%;
        }

        .dsc-left {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex: 1;
          min-width: 0;
        }

        .dsc-flame {
          width: 28px;
          height: 28px;
          flex-shrink: 0;
          color: #fb923c;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }
        .dsc-flame :global(svg) { width: 28px; height: 28px; }
        .dsc-flame-glow { color: #f97316; filter: drop-shadow(0 0 8px rgba(251,146,60,0.6)); animation: dsc-pulse 2s ease-in-out infinite; }
        @keyframes dsc-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }

        .dsc-text {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }

        .dsc-streak-label {
          font-size: 0.7rem;
          font-weight: 700;
          color: #fb923c;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .dsc-streak-value {
          font-size: 0.9rem;
          font-weight: 800;
          color: #f1f5f9;
        }

        .dsc-next {
          font-size: 0.68rem;
          color: rgba(255,255,255,0.45);
        }

        .dsc-right {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .dsc-reward-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.85rem;
          font-weight: 800;
          color: #fbbf24;
          background: rgba(251,191,36,0.12);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 999px;
          padding: 0.25rem 0.65rem;
        }
        .dsc-reward-badge :global(svg) { width: 14px; height: 14px; }

        .dsc-btn-claim {
          background: linear-gradient(135deg, #f97316, #ef4444);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 0.4rem 0.9rem;
          font-size: 0.8rem;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          transition: opacity 0.15s;
        }
        .dsc-btn-claim:disabled { opacity: 0.55; cursor: not-allowed; }
        .dsc-btn-claim:not(:disabled):hover { opacity: 0.88; }

        .dsc-claimed-state {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.1rem;
        }

        .dsc-check {
          font-size: 0.78rem;
          font-weight: 700;
          color: #34d399;
        }

        .dsc-tomorrow {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.4);
        }

        .dsc-error {
          width: 100%;
          font-size: 0.75rem;
          color: #f87171;
          margin: 0;
        }

        @media (max-width: 480px) {
          .dsc-wrap { flex-direction: column; align-items: flex-start; }
          .dsc-right { width: 100%; justify-content: space-between; }
        }
      `}</style>
    </div>
  );
}
