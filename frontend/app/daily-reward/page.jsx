"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notify } from "@/lib/notify";


// Force dynamic rendering - this page requires client-side logic
export const dynamic = 'force-dynamic';


const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STREAK_MILESTONES = [
  { day: 1,  coins: 20,  icon: "✨", label: "Día 1" },
  { day: 3,  coins: 35,  icon: "⚡", label: "Día 3" },
  { day: 7,  coins: 50,  icon: "🔥", label: "Día 7" },
  { day: 14, coins: 75,  icon: "💎", label: "Día 14" },
  { day: 30, coins: 100, icon: "🏆", label: "Día 30" },
];

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="28" height="28">
      <path d="M12 2C9 7 6.5 8.5 6.5 11.5A5.5 5.5 0 0 0 12 17a5.5 5.5 0 0 0 5.5-5.5C17.5 8.5 15 7 12 2Zm0 13a3.5 3.5 0 0 1-3.5-3.5c0-2 1.5-3.5 3.5-5.5 2 2 3.5 3.5 3.5 5.5A3.5 3.5 0 0 1 12 15Z" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 10h3.2a1.8 1.8 0 1 1 0 3.6H9.5" />
    </svg>
  );
}

export default function DailyRewardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [error, setError] = useState("");
  const hasFetched = useRef(false);

  const fetchStatus = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/daily-reward/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchStatus();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClaim = async () => {
    if (claiming || !data?.canClaim) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setClaiming(true);
    setError("");
    try {
      const r = await fetch(`${API_URL}/api/daily-reward/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      if (r.ok) {
        setClaimResult(json);
        setData((prev) => ({
          ...prev,
          canClaim: false,
          streak: json.streak,
          coinsToAward: json.nextMilestone?.coins ?? prev?.coinsToAward,
          nextMilestone: json.nextMilestone,
        }));
        notify({
          icon: "🎁",
          message: `+${json.coinsAwarded} monedas · Racha ${json.streak} 🔥`,
          href: "/dashboard",
          actionLabel: "Ver dashboard",
          duration: 5000,
        });
      } else {
        setError(json?.message || "Error al reclamar");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setClaiming(false);
    }
  };

  const streak = claimResult?.streak ?? data?.streak ?? 0;
  const canClaim = data?.canClaim ?? false;
  const coinsToAward = data?.coinsToAward ?? 20;
  const coinsAwarded = claimResult?.coinsAwarded;
  const streakAtRisk = canClaim && streak > 0;

  const streakTierLabel =
    streak >= 30 ? "🏆 Racha máxima" :
    streak >= 14 ? "💎 Racha élite" :
    streak >= 7  ? "🔥 Racha de fuego" :
    streak >= 3  ? "⚡ Buena racha" :
    streak >= 1  ? "✨ Empezando" :
    "Comienza tu racha";

  return (
    <div className="dr-page">
      <div className="dr-header">
        <Link href="/dashboard" className="dr-back">← Volver</Link>
        <h1 className="dr-title">🎁 Recompensa Diaria</h1>
        <p className="dr-sub">Reclama tus monedas cada día y mantén tu racha</p>
      </div>

      {loading ? (
        <div className="dr-skeleton" />
      ) : (
        <>
          {/* Streak hero */}
          <div className={`dr-hero${streakAtRisk ? " dr-hero-risk" : canClaim ? " dr-hero-claimable" : " dr-hero-claimed"}`}>
            <div className="dr-hero-orb dr-orb-1" />
            <div className="dr-hero-orb dr-orb-2" />

            <div className="dr-flame-wrap">
              <FlameIcon />
            </div>
            <div className="dr-streak-num">{streak}</div>
            <div className="dr-streak-unit">{streak === 1 ? "día de racha" : "días de racha"}</div>
            <div className="dr-tier-label">{streakTierLabel}</div>

            {streakAtRisk && (
              <div className="dr-risk-banner">
                ⚠️ Tu racha está en riesgo — reclama antes de medianoche
              </div>
            )}
          </div>

          {/* Claim section */}
          <div className="dr-claim-card">
            {canClaim ? (
              <>
                <div className="dr-coins-preview">
                  <CoinIcon />
                  <span className="dr-coins-val">+{coinsToAward}</span>
                  <span className="dr-coins-label">monedas de hoy</span>
                </div>
                <button
                  className="dr-claim-btn"
                  onClick={handleClaim}
                  disabled={claiming}
                >
                  {claiming ? "Reclamando…" : "🎁 Reclamar ahora"}
                </button>
                {error && <p className="dr-error">{error}</p>}
              </>
            ) : claimResult ? (
              <div className="dr-success">
                <span className="dr-success-icon">✅</span>
                <div className="dr-success-body">
                  <strong>¡Recompensa reclamada!</strong>
                  <span>+{coinsAwarded} monedas · Racha: {streak} días 🔥</span>
                  <span className="dr-tomorrow">Vuelve mañana para continuar tu racha 🌙</span>
                </div>
              </div>
            ) : (
              <div className="dr-success">
                <span className="dr-success-icon">✅</span>
                <div className="dr-success-body">
                  <strong>Ya reclamaste hoy</strong>
                  <span>Racha actual: {streak} días 🔥</span>
                  <span className="dr-tomorrow">Vuelve mañana para continuar tu racha 🌙</span>
                </div>
              </div>
            )}
          </div>

          {/* Milestones */}
          <div className="dr-milestones-card">
            <h2 className="dr-milestones-title">Hitos de racha</h2>
            <div className="dr-milestones">
              {STREAK_MILESTONES.map((m) => {
                const reached = streak >= m.day;
                const isCurrent = streak < m.day && (streak >= (STREAK_MILESTONES[STREAK_MILESTONES.indexOf(m) - 1]?.day ?? 0));
                return (
                  <div key={m.day} className={`dr-milestone${reached ? " dr-reached" : ""}${isCurrent ? " dr-current" : ""}`}>
                    <span className="dr-milestone-icon">{m.icon}</span>
                    <span className="dr-milestone-label">{m.label}</span>
                    <span className="dr-milestone-coins">
                      <CoinIcon />+{m.coins}
                    </span>
                    {reached && <span className="dr-milestone-check">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next milestone hint */}
          {data?.nextMilestone?.day && (
            <div className="dr-next-hint">
              <span>🎯 Próximo hito: Día {data.nextMilestone.day} → +{data.nextMilestone.coins} monedas</span>
              <span className="dr-next-sub">Te faltan {data.nextMilestone.day - streak} días</span>
            </div>
          )}

          {/* CTA links */}
          <div className="dr-cta-row">
            <Link href="/missions" className="dr-cta-btn">🎯 Ver misiones</Link>
            <Link href="/live" className="dr-cta-btn dr-cta-secondary">🎥 Ver directos</Link>
          </div>
        </>
      )}

      <style jsx>{`
        .dr-page {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          max-width: 540px;
          margin: 0 auto;
          padding: 1rem;
        }

        .dr-header {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .dr-back {
          font-size: 0.8rem;
          color: rgba(255,255,255,0.5);
          text-decoration: none;
          margin-bottom: 0.25rem;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          transition: color 0.15s;
        }
        .dr-back:hover { color: rgba(255,255,255,0.8); }

        .dr-title {
          font-size: 1.5rem;
          font-weight: 900;
          color: #f1f5f9;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .dr-sub {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.5);
          margin: 0;
        }

        .dr-skeleton {
          height: 220px;
          border-radius: 16px;
          background: rgba(255,255,255,0.05);
          animation: dr-shimmer 1.4s linear infinite;
        }
        @keyframes dr-shimmer {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }

        /* Hero */
        .dr-hero {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          padding: 2rem 1.5rem 1.75rem;
          border-radius: 18px;
          border: 1px solid rgba(139,92,246,0.2);
          background: linear-gradient(135deg, rgba(15,8,32,0.97) 0%, rgba(20,10,42,0.97) 100%);
          text-align: center;
        }
        .dr-hero-claimable {
          border-color: rgba(251,146,60,0.35);
          background: linear-gradient(135deg, rgba(20,10,30,0.97) 0%, rgba(30,12,25,0.97) 100%);
        }
        .dr-hero-risk {
          border-color: rgba(239,68,68,0.4);
          background: linear-gradient(135deg, rgba(25,5,10,0.97) 0%, rgba(30,8,8,0.97) 100%);
        }
        .dr-hero-claimed {
          border-color: rgba(52,211,153,0.3);
        }

        .dr-hero-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(60px);
        }
        .dr-orb-1 {
          width: 200px; height: 200px;
          background: radial-gradient(circle, rgba(251,146,60,0.12), transparent 70%);
          top: -80px; right: -40px;
        }
        .dr-orb-2 {
          width: 140px; height: 140px;
          background: radial-gradient(circle, rgba(139,92,246,0.1), transparent 70%);
          bottom: -50px; left: 20%;
        }

        .dr-flame-wrap {
          position: relative;
          color: #fb923c;
          filter: drop-shadow(0 0 12px rgba(251,146,60,0.7));
          animation: dr-pulse 2s ease-in-out infinite;
        }
        @keyframes dr-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }

        .dr-streak-num {
          font-size: 3.5rem;
          font-weight: 900;
          color: #f1f5f9;
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .dr-streak-unit {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.02em;
        }

        .dr-tier-label {
          font-size: 0.72rem;
          font-weight: 800;
          color: #fb923c;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-top: 0.15rem;
        }

        .dr-risk-banner {
          margin-top: 0.75rem;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.35);
          border-radius: 10px;
          padding: 0.5rem 1rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: #fca5a5;
          position: relative;
          z-index: 1;
        }

        /* Claim card */
        .dr-claim-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .dr-coins-preview {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 1.5rem;
          font-weight: 900;
          color: #fbbf24;
        }
        .dr-coins-val { font-size: 1.6rem; }
        .dr-coins-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: rgba(255,255,255,0.55);
        }

        .dr-claim-btn {
          background: linear-gradient(135deg, #f97316, #ef4444);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 0.75rem 2rem;
          font-size: 0.95rem;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          width: 100%;
          max-width: 280px;
          transition: opacity 0.15s, transform 0.1s;
          box-shadow: 0 4px 20px rgba(249,115,22,0.3);
        }
        .dr-claim-btn:not(:disabled):hover { opacity: 0.9; transform: translateY(-1px); }
        .dr-claim-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .dr-error {
          font-size: 0.78rem;
          color: #f87171;
          margin: 0;
        }

        .dr-success {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          width: 100%;
        }
        .dr-success-icon { font-size: 1.5rem; flex-shrink: 0; }
        .dr-success-body {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .dr-success-body strong {
          font-size: 0.9rem;
          font-weight: 800;
          color: #34d399;
        }
        .dr-success-body span {
          font-size: 0.82rem;
          color: rgba(255,255,255,0.6);
        }
        .dr-tomorrow {
          font-size: 0.75rem !important;
          color: rgba(255,255,255,0.35) !important;
        }

        /* Milestones */
        .dr-milestones-card {
          background: linear-gradient(135deg, rgba(15,8,32,0.95) 0%, rgba(20,10,42,0.95) 100%);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: 16px;
          padding: 1.1rem;
        }

        .dr-milestones-title {
          font-size: 0.88rem;
          font-weight: 800;
          color: #e0aaff;
          margin: 0 0 0.85rem 0;
          letter-spacing: -0.01em;
        }

        .dr-milestones {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .dr-milestone {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(139,92,246,0.1);
          border-radius: 10px;
          padding: 0.55rem 0.8rem;
          position: relative;
          opacity: 0.55;
          transition: opacity 0.2s, border-color 0.2s;
        }

        .dr-milestone.dr-reached {
          opacity: 1;
          border-color: rgba(52,211,153,0.3);
          background: rgba(52,211,153,0.05);
        }

        .dr-milestone.dr-current {
          opacity: 1;
          border-color: rgba(251,146,60,0.3);
          background: rgba(251,146,60,0.05);
        }

        .dr-milestone-icon { font-size: 1.2rem; width: 24px; text-align: center; }

        .dr-milestone-label {
          flex: 1;
          font-size: 0.82rem;
          font-weight: 700;
          color: rgba(255,255,255,0.8);
        }

        .dr-milestone-coins {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8rem;
          font-weight: 800;
          color: #fbbf24;
        }

        .dr-milestone-check {
          font-size: 0.8rem;
          font-weight: 800;
          color: #34d399;
          margin-left: 0.3rem;
        }

        /* Next hint */
        .dr-next-hint {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          background: rgba(251,191,36,0.06);
          border: 1px dashed rgba(251,191,36,0.25);
          border-radius: 12px;
          padding: 0.85rem 1rem;
          text-align: center;
          font-size: 0.82rem;
          color: rgba(255,255,255,0.7);
          font-weight: 600;
        }
        .dr-next-sub {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.38);
          font-weight: 400;
        }

        /* CTA row */
        .dr-cta-row {
          display: flex;
          gap: 0.75rem;
        }

        .dr-cta-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.7rem 1rem;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.1));
          border: 1px solid rgba(139,92,246,0.25);
          color: #d8b4fe;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .dr-cta-btn:hover {
          background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(236,72,153,0.15));
          box-shadow: 0 4px 15px rgba(139,92,246,0.2);
        }
        .dr-cta-secondary {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
        }
        .dr-cta-secondary:hover {
          background: rgba(255,255,255,0.08);
          box-shadow: none;
        }
      `}</style>
    </div>
  );
}
