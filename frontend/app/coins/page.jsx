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
    icon: "🪙",
    desc: "Ideal para empezar",
    highlight: false,
  },
  {
    value: 500,
    label: "Popular",
    coins: "500",
    price: "$4.49",
    icon: "💰",
    desc: "El más elegido",
    highlight: true,
  },
  {
    value: 1000,
    label: "Pro",
    coins: "1.000",
    price: "$7.99",
    icon: "💎",
    desc: "Mejor precio/moneda",
    highlight: false,
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
        <h1 className="coins-title">💰 Comprar Monedas</h1>
        <p className="coins-sub">
          Usa monedas para enviar regalos virtuales durante los directos y apoyar a tus streamers favoritos.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Packages */}
      <div className="packages-grid">
        {PACKAGES.map((pkg) => (
          <div key={pkg.value} className={`pkg-card card${pkg.highlight ? " pkg-highlight" : ""}`}>
            {pkg.highlight && (
              <div className="pkg-badge-top">⭐ Más popular</div>
            )}
            <div className="pkg-icon">{pkg.icon}</div>
            <div className="pkg-label">{pkg.label}</div>
            <div className="pkg-coins">{pkg.coins} <span>monedas</span></div>
            <div className="pkg-price">{pkg.price}</div>
            <div className="pkg-desc">{pkg.desc}</div>
            <button
              className={`btn btn-lg btn-block${pkg.highlight ? " btn-primary" : " btn-secondary"}`}
              onClick={() => buy(pkg.value)}
              disabled={loading}
            >
              {loading ? "Redirigiendo…" : "Comprar ahora"}
            </button>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="coins-info card">
        <h3 className="info-title">¿Cómo funcionan las monedas?</h3>
        <div className="info-steps">
          <div className="info-step">
            <span className="step-icon">1️⃣</span>
            <div>
              <strong>Compra monedas</strong>
              <p>Elige el paquete que más te convenga y paga de forma segura con Stripe.</p>
            </div>
          </div>
          <div className="info-step">
            <span className="step-icon">2️⃣</span>
            <div>
              <strong>Entra a un directo</strong>
              <p>Encuentra a tu streamer favorito y únete a su transmisión.</p>
            </div>
          </div>
          <div className="info-step">
            <span className="step-icon">3️⃣</span>
            <div>
              <strong>Envía regalos</strong>
              <p>Usa tus monedas para enviar regalos virtuales y destacar en el chat.</p>
            </div>
          </div>
        </div>
      </div>

      <p className="back-link">
        <Link href="/dashboard">← Volver al dashboard</Link>
      </p>

      <style jsx>{`
        .coins-page { display: flex; flex-direction: column; gap: 2rem; max-width: 900px; margin: 0 auto; }

        .coins-header { text-align: center; }
        .coins-title { font-size: 2rem; font-weight: 800; color: var(--text); }
        .coins-sub { color: var(--text-muted); margin-top: 0.5rem; max-width: 520px; margin-inline: auto; }

        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        /* Packages */
        .packages-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .pkg-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          padding: 2rem 1.5rem;
          text-align: center;
          position: relative;
          transition: transform var(--transition), box-shadow var(--transition);
        }

        .pkg-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); }

        .pkg-highlight {
          border-color: var(--accent) !important;
          box-shadow: var(--shadow-accent);
        }

        .pkg-badge-top {
          position: absolute;
          top: -12px;
          background: var(--accent);
          color: #fff;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.2rem 0.75rem;
          border-radius: 20px;
        }

        .pkg-icon { font-size: 2.5rem; }

        .pkg-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .pkg-coins {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
        }

        .pkg-coins span {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-muted);
        }

        .pkg-price {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--accent);
        }

        .pkg-desc {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
        }

        /* Info section */
        .coins-info { padding: 1.75rem; }

        .info-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 1.25rem;
        }

        .info-steps { display: flex; flex-direction: column; gap: 1rem; }

        .info-step {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .step-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: 0.1rem; }

        .info-step strong { color: var(--text); font-size: 0.95rem; }
        .info-step p { color: var(--text-muted); font-size: 0.85rem; margin-top: 0.2rem; }

        .back-link { text-align: center; }

        @media (max-width: 640px) {
          .packages-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
