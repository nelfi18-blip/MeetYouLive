"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";


// Force dynamic rendering - this page requires client-side logic
export const dynamic = 'force-dynamic';


const API_URL = process.env.NEXT_PUBLIC_API_URL;

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

const TIER_DISPLAY = {
  silver: { gradient: "linear-gradient(135deg, #a8a8a8, #e8e8e8, #a8a8a8)", glow: "rgba(192,192,192,0.4)" },
  gold:   { gradient: "linear-gradient(135deg, #b8860b, #ffd700, #b8860b)", glow: "rgba(255,215,0,0.4)" },
  platinum: { gradient: "linear-gradient(135deg, #8a8a8a, #e5e4e2, #8a8a8a)", glow: "rgba(229,228,226,0.4)" },
};

export default function VIPPage() {
  const router = useRouter();
  const [tiers, setTiers] = useState([]);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

    // Load tiers (public)
    fetch(`${API_URL}/api/subscriptions/tiers`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.tiers) setTiers(d.tiers); })
      .catch(() => {});

    // Load current subscription status (authenticated)
    if (token) {
      fetch(`${API_URL}/api/subscriptions/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setCurrentStatus(d); })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleSubscribe = async (tierId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }

    setSubscribing(tierId);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/subscriptions/subscribe-tier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier: tierId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Error al procesar la suscripción."); return; }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setSubscribing(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("¿Estás seguro de que deseas cancelar tu suscripción VIP?")) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/subscriptions/cancel`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentStatus((prev) => ({ ...prev, status: "canceled", isVIP: false, vipTier: null }));
      } else {
        setError(data.message || "Error al cancelar la suscripción.");
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="vip-page">
      <div className="vip-hero">
        <div className="vip-hero-icon"><StarIcon /></div>
        <h1 className="vip-title">VIP MeetYouLive</h1>
        <p className="vip-subtitle">Mejora tu experiencia con beneficios exclusivos</p>
      </div>

      {currentStatus?.isVIP && currentStatus.vipTier && (
        <div className="vip-current">
          <span className="vip-current-badge">
            {TIER_DISPLAY[currentStatus.vipTier] ? "✨ " : ""}
            Actualmente: <strong>{currentStatus.vipTier?.toUpperCase()}</strong>
          </span>
          {currentStatus.vipExpiresAt && (
            <span className="vip-current-exp">
              Válido hasta {new Date(currentStatus.vipExpiresAt).toLocaleDateString("es")}
            </span>
          )}
          <button className="vip-cancel-btn" onClick={handleCancel}>
            Cancelar suscripción
          </button>
        </div>
      )}

      {error && <p className="vip-error">{error}</p>}

      {loading ? (
        <p className="vip-loading">Cargando planes...</p>
      ) : (
        <div className="vip-tiers">
          {tiers.map((tier) => {
            const display = TIER_DISPLAY[tier.id] || {};
            const isCurrent = currentStatus?.vipTier === tier.id && currentStatus?.isVIP;
            const isGold = tier.id === "gold";
            return (
              <div
                key={tier.id}
                className={`vip-card${isGold ? " vip-card--featured" : ""}${isCurrent ? " vip-card--current" : ""}`}
              >
                {isGold && <div className="vip-card-badge">Popular</div>}
                {isCurrent && <div className="vip-card-current-label">Tu plan actual</div>}
                <div
                  className="vip-card-icon"
                  style={{ background: display.gradient, boxShadow: `0 0 20px ${display.glow}` }}
                >
                  {tier.badge}
                </div>
                <h2 className="vip-card-name">{tier.name}</h2>
                <div className="vip-card-price">
                  <span className="vip-price-value">${tier.priceUsd.toFixed(2)}</span>
                  <span className="vip-price-period">/mes</span>
                </div>
                <ul className="vip-perks">
                  {(tier.perks || []).map((perk, i) => (
                    <li key={i} className="vip-perk">
                      <span className="vip-perk-icon"><CheckIcon /></span>
                      {perk}
                    </li>
                  ))}
                </ul>
                <button
                  className={`vip-subscribe-btn${isCurrent ? " vip-subscribe-btn--current" : ""}`}
                  onClick={() => !isCurrent && handleSubscribe(tier.id)}
                  disabled={subscribing === tier.id || isCurrent || !tier.available}
                >
                  {isCurrent
                    ? "Plan activo"
                    : !tier.available
                    ? "Próximamente"
                    : subscribing === tier.id
                    ? "Procesando…"
                    : "Suscribirme"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tiers.length === 0 && !loading && (
        <p className="vip-empty">Los planes VIP estarán disponibles próximamente.</p>
      )}

      <style jsx>{`
        .vip-page {
          min-height: 100vh;
          padding: 2rem 1rem 6rem;
          max-width: 1000px;
          margin: 0 auto;
        }

        .vip-hero {
          text-align: center;
          padding: 2.5rem 1rem 2rem;
        }

        .vip-hero-icon {
          width: 56px;
          height: 56px;
          margin: 0 auto 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #e040fb, #ff2d78);
          border-radius: 50%;
          color: #fff;
        }

        .vip-title {
          font-size: clamp(1.6rem, 5vw, 2.2rem);
          font-weight: 900;
          margin: 0 0 0.5rem;
        }

        .vip-subtitle {
          color: var(--text-muted, #aaa);
          font-size: 1rem;
          margin: 0;
        }

        .vip-current {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.3);
          border-radius: 12px;
          padding: 0.75rem 1.25rem;
          margin-bottom: 1.5rem;
        }

        .vip-current-badge { font-size: 0.95rem; }
        .vip-current-exp { font-size: 0.85rem; color: var(--text-muted, #aaa); margin-left: auto; }

        .vip-cancel-btn {
          background: transparent;
          border: 1px solid rgba(255,60,60,0.4);
          border-radius: 8px;
          color: #ff6b6b;
          cursor: pointer;
          font-size: 0.8rem;
          padding: 0.3rem 0.8rem;
          transition: all 0.15s;
        }
        .vip-cancel-btn:hover { background: rgba(255,60,60,0.1); }

        .vip-error {
          color: #ff6b6b;
          text-align: center;
          font-size: 0.9rem;
          margin-bottom: 1rem;
        }

        .vip-loading, .vip-empty {
          text-align: center;
          color: var(--text-muted, #aaa);
          padding: 3rem 0;
        }

        .vip-tiers {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1.5rem;
          padding: 1rem 0;
        }

        .vip-card {
          position: relative;
          background: rgba(20,12,46,0.6);
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: 16px;
          padding: 2rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          text-align: center;
          transition: transform 0.2s, border-color 0.2s;
        }

        .vip-card:hover { transform: translateY(-4px); border-color: rgba(224,64,251,0.45); }

        .vip-card--featured {
          border-color: rgba(224,64,251,0.55);
          box-shadow: 0 0 30px rgba(224,64,251,0.15);
        }

        .vip-card--current { border-color: rgba(99,255,130,0.5); }

        .vip-card-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #e040fb, #ff2d78);
          border-radius: 999px;
          color: #fff;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 0.2rem 0.8rem;
          text-transform: uppercase;
        }

        .vip-card-current-label {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #00c875, #00a060);
          border-radius: 999px;
          color: #fff;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 0.2rem 0.8rem;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .vip-card-icon {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          flex-shrink: 0;
        }

        .vip-card-name {
          font-size: 1.2rem;
          font-weight: 800;
          margin: 0;
        }

        .vip-card-price {
          display: flex;
          align-items: baseline;
          gap: 0.2rem;
        }

        .vip-price-value {
          font-size: 2rem;
          font-weight: 900;
        }

        .vip-price-period {
          font-size: 0.85rem;
          color: var(--text-muted, #aaa);
        }

        .vip-perks {
          list-style: none;
          margin: 0;
          padding: 0;
          width: 100%;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .vip-perk {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          font-size: 0.88rem;
          color: var(--text-muted, #ccc);
          line-height: 1.4;
        }

        .vip-perk-icon {
          color: #63ff82;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .vip-subscribe-btn {
          width: 100%;
          background: linear-gradient(135deg, #e040fb, #ff2d78);
          border: none;
          border-radius: 10px;
          color: #fff;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 700;
          padding: 0.75rem;
          transition: opacity 0.15s, transform 0.1s;
          margin-top: auto;
        }

        .vip-subscribe-btn:hover:not(:disabled) { opacity: 0.85; transform: scale(1.02); }
        .vip-subscribe-btn:disabled { cursor: not-allowed; opacity: 0.6; }

        .vip-subscribe-btn--current {
          background: rgba(99,255,130,0.15);
          border: 1px solid rgba(99,255,130,0.4);
          color: #63ff82;
        }

        @media (max-width: 640px) {
          .vip-tiers { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
