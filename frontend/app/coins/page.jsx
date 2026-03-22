"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const PACKAGES = [
  {
    value: 100,
    label: "Starter",
    coins: "100",
    price: "$0.99",
    priceNote: "por paquete",
    icon: "🪙",
    desc: "Ideal para empezar",
    highlight: false,
    perCoin: "$0.0099",
  },
  {
    value: 500,
    label: "Popular",
    coins: "500",
    price: "$4.49",
    priceNote: "por paquete",
    icon: "💰",
    desc: "El más elegido por la comunidad",
    highlight: true,
    perCoin: "$0.009",
    save: "Ahorra 9%",
  },
  {
    value: 1000,
    label: "Pro",
    coins: "1.000",
    price: "$7.99",
    priceNote: "por paquete",
    icon: "💎",
    desc: "Mejor precio por moneda",
    highlight: false,
    perCoin: "$0.008",
    save: "Ahorra 19%",
  },
];

export default function BuyCoinsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buy = async (pkg) => {
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/payments/coins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al iniciar el pago");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="coins-page">
      {/* Header */}
      <div className="coins-header">
        <h1 className="page-title">Comprar Monedas</h1>
        <p className="page-subtitle" style={{ maxWidth: 500, marginInline: "auto", textAlign: "center" }}>
          Usa monedas para enviar regalos virtuales durante los directos y apoyar a tus streamers favoritos.
        </p>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {/* Packages */}
      <div className="packages-grid">
        {PACKAGES.map((pkg) => (
          <div key={pkg.value} className={`pkg-card${pkg.highlight ? " pkg-highlight" : ""}`}>
            {pkg.highlight && (
              <div className="pkg-badge-top">⭐ Más popular</div>
            )}
            {pkg.save && !pkg.highlight && (
              <div className="pkg-save-badge">{pkg.save}</div>
            )}
            <div className="pkg-icon">{pkg.icon}</div>
            <div className="pkg-label">{pkg.label}</div>
            <div className="pkg-coins">
              {pkg.coins}
              <span>monedas</span>
            </div>
            <div className="pkg-price">{pkg.price}</div>
            <div className="pkg-note">{pkg.priceNote}</div>
            <div className="pkg-desc">{pkg.desc}</div>
            <button
              className={`pkg-btn${pkg.highlight ? " pkg-btn-primary" : ""}`}
              onClick={() => buy(pkg.value)}
              disabled={loading}
            >
              {loading ? (
                <><span className="spinner" />Redirigiendo…</>
              ) : "Comprar ahora"}
            </button>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="how-card">
        <h3 className="how-title">¿Cómo funcionan las monedas?</h3>
        <div className="how-steps">
          {[
            {
              n: "01",
              title: "Compra monedas",
              desc: "Elige el paquete que más te convenga y paga de forma segura con Stripe.",
              icon: "💳",
            },
            {
              n: "02",
              title: "Entra a un directo",
              desc: "Encuentra a tu streamer favorito y únete a su transmisión en vivo.",
              icon: "📺",
            },
            {
              n: "03",
              title: "Envía regalos",
              desc: "Usa tus monedas para enviar regalos virtuales y destacar en el chat.",
              icon: "🎁",
            },
          ].map((step) => (
            <div key={step.n} className="how-step">
              <div className="step-num">{step.n}</div>
              <div className="step-icon">{step.icon}</div>
              <div>
                <div className="step-title">{step.title}</div>
                <p className="step-desc">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="back-link">
        <Link href="/dashboard">← Volver al dashboard</Link>
      </p>

      <style jsx>{`
        .coins-page {
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .coins-header { text-align: center; }

        /* Banner */
        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        /* Packages */
        .packages-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
          align-items: start;
        }

        .pkg-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.65rem;
          padding: 2.25rem 1.5rem 1.75rem;
          text-align: center;
          position: relative;
          border-radius: var(--radius);
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition);
        }

        .pkg-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow);
          border-color: rgba(139,92,246,0.35);
        }

        .pkg-highlight {
          background: linear-gradient(var(--bg-3), var(--bg-3)) padding-box,
                      var(--grad-primary) border-box;
          border: 1px solid transparent;
          box-shadow: var(--shadow), 0 0 40px rgba(224,64,251,0.2);
        }

        .pkg-highlight:hover {
          box-shadow: var(--shadow), 0 0 60px rgba(224,64,251,0.3);
          transform: translateY(-6px);
        }

        .pkg-badge-top {
          position: absolute;
          top: -14px;
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 0.22rem 0.85rem;
          border-radius: var(--radius-pill);
          letter-spacing: 0.02em;
          box-shadow: 0 4px 16px rgba(224,64,251,0.4);
        }

        .pkg-save-badge {
          position: absolute;
          top: -12px;
          right: 1rem;
          background: rgba(52,211,153,0.15);
          color: var(--accent-green);
          border: 1px solid rgba(52,211,153,0.3);
          font-size: 0.68rem;
          font-weight: 800;
          padding: 0.18rem 0.65rem;
          border-radius: var(--radius-pill);
        }

        .pkg-icon { font-size: 2.75rem; }

        .pkg-label {
          font-size: 0.72rem;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .pkg-coins {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
          display: flex;
          align-items: baseline;
          gap: 0.4rem;
        }

        .pkg-coins span {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--text-muted);
        }

        .pkg-price {
          font-size: 1.5rem;
          font-weight: 800;
          background: var(--grad-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .pkg-note {
          font-size: 0.72rem;
          color: var(--text-dim);
          margin-top: -0.4rem;
        }

        .pkg-desc {
          font-size: 0.8rem;
          color: var(--text-muted);
          line-height: 1.4;
          min-height: 2.5em;
        }

        .pkg-btn {
          width: 100%;
          padding: 0.8rem;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 700;
          border: 1px solid rgba(139,92,246,0.25);
          background: rgba(139,92,246,0.1);
          color: var(--text);
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .pkg-btn:hover:not(:disabled) {
          background: rgba(139,92,246,0.2);
          border-color: rgba(139,92,246,0.5);
        }

        .pkg-btn-primary {
          background: var(--grad-primary);
          border-color: transparent;
          color: #fff;
          box-shadow: var(--shadow-accent);
          position: relative;
          overflow: hidden;
        }

        .pkg-btn-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, transparent 35%, rgba(255,255,255,0.15) 55%, transparent 70%);
          transform: translateX(-100%);
          transition: transform 0.5s ease;
        }

        .pkg-btn-primary:hover:not(:disabled)::before { transform: translateX(100%); }

        .pkg-btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
          box-shadow: var(--glow-pink), var(--shadow-accent);
          transform: translateY(-1px);
        }

        .pkg-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .spinner {
          width: 15px; height: 15px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* How it works */
        .how-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 2rem 2.25rem;
        }

        .how-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 1.5rem;
          letter-spacing: -0.02em;
        }

        .how-steps { display: flex; flex-direction: column; gap: 1.25rem; }

        .how-step {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .step-num {
          font-size: 0.65rem;
          font-weight: 800;
          color: var(--text-dim);
          letter-spacing: 0.08em;
          width: 32px;
          flex-shrink: 0;
          padding-top: 0.15rem;
        }

        .step-icon { font-size: 1.5rem; flex-shrink: 0; }

        .step-title { font-weight: 700; color: var(--text); font-size: 0.9rem; }
        .step-desc { color: var(--text-muted); font-size: 0.82rem; margin-top: 0.2rem; line-height: 1.45; }

        .back-link {
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        .back-link :global(a) {
          color: var(--accent-3);
          font-weight: 600;
          transition: color var(--transition);
        }

        .back-link :global(a):hover { color: var(--accent-2); }

        @media (max-width: 640px) {
          .packages-grid { grid-template-columns: 1fr; }
          .how-card { padding: 1.5rem; }
        }
      `}</style>
    </div>
  );
}
