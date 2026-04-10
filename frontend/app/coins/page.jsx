"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const PACKAGES = [
  {
    value: 100,
    label: "Starter Pack",
    coins: "100",
    price: "$4.99",
    priceNote: "por paquete",
    icon: "🪙",
    desc: "Ideal para empezar a conectar",
    highlight: false,
    perCoin: "$0.0499",
  },
  {
    value: 250,
    label: "Popular Pack",
    coins: "250",
    price: "$9.99",
    priceNote: "por paquete",
    icon: "💰",
    desc: "El más elegido por la comunidad",
    highlight: true,
    perCoin: "$0.0399",
    save: "Más popular",
  },
  {
    value: 700,
    label: "Elite Pack",
    coins: "700",
    price: "$19.99",
    priceNote: "por paquete",
    icon: "💎",
    desc: "Mejor valor · Vive la experiencia completa",
    highlight: false,
    perCoin: "$0.0285",
    save: "Mejor valor",
  },
];

const TX_TYPE_LABELS = {
  purchase: { label: "Compra", color: "var(--accent-green)", sign: "+" },
  gift_sent: { label: "Regalo enviado", color: "var(--error)", sign: "-" },
  gift_received: { label: "Regalo recibido", color: "var(--accent-green)", sign: "+" },
  private_call: { label: "Llamada privada", color: "var(--error)", sign: "-" },
  call_started: { label: "Llamada iniciada", color: "var(--error)", sign: "-" },
  call_earned: { label: "Llamada recibida", color: "var(--accent-green)", sign: "+" },
  room_entry: { label: "Entrada a sala", color: "var(--error)", sign: "-" },
  content_unlock: { label: "Contenido desbloqueado", color: "var(--error)", sign: "-" },
  content_earned: { label: "Contenido exclusivo", color: "var(--accent-green)", sign: "+" },
  refund: { label: "Reembolso", color: "var(--accent-green)", sign: "+" },
  admin_adjustment: { label: "Ajuste admin", color: "var(--text-muted)", sign: "" },
};

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BuyCoinsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState(null);
  const [sparks, setSparks] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);

  useEffect(() => {
    const localToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const token = localToken || session?.backendToken || null;
    if (!token) { setTxLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/coins`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setBalance(d.coins); setSparks(d.sparks ?? null); } })
      .catch(() => {});

    fetch(`${API_URL}/api/coins/transactions?limit=20`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTransactions(d.transactions || []); })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [session?.backendToken]);

  const buy = async (pkg) => {
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("token") || session?.backendToken;
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
        <h1 className="page-title">MYL Coins</h1>
        <p className="page-subtitle" style={{ maxWidth: 500, marginInline: "auto", textAlign: "center" }}>
          Usa MYL Coins para enviar regalos exclusivos, acceder a llamadas privadas con creators y desbloquear contenido premium.
        </p>
        <div className="balance-row">
          {balance !== null && (
            <div className="balance-pill">
              <span className="balance-icon">🪙</span>
              <span className="balance-value">{balance}</span>
              <span className="balance-label">MYL Coins</span>
            </div>
          )}
          {sparks !== null && (
            <Link href="/sparks" className="balance-pill balance-pill-sparks">
              <span className="balance-icon">✨</span>
              <span className="balance-value">{sparks}</span>
              <span className="balance-label">Sparks</span>
            </Link>
          )}
        </div>
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
              <span>MYL Coins</span>
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

      {/* Sparks teaser */}
      <div className="sparks-teaser">
        <div className="sparks-teaser-icon">✨</div>
        <div className="sparks-teaser-text">
          <div className="sparks-teaser-title">¿Sabías que existen los Sparks?</div>
          <div className="sparks-teaser-desc">
            Los Sparks son la moneda social de MeetYouLive. Úsalos para boosts de visibilidad, super interests, speed dating y más.
          </div>
        </div>
        <Link href="/sparks" className="sparks-teaser-btn">Ver Sparks →</Link>
      </div>

      {/* How it works */}
      <div className="how-card">
        <h3 className="how-title">¿Cómo funcionan los MYL Coins?</h3>
        <div className="how-steps">
          {[
            {
              n: "01",
              title: "Compra MYL Coins",
              desc: "Elige el paquete que más te convenga y paga de forma segura con Stripe.",
              icon: "💳",
            },
            {
              n: "02",
              title: "Envía regalos exclusivos",
              desc: "Sorprende a tus creators con Neon Hearts, Golden Rings y más regalos premium.",
              icon: "🎁",
            },
            {
              n: "03",
              title: "Accede a experiencias únicas",
              desc: "Paga llamadas privadas, contenido exclusivo y entradas a salas premium.",
              icon: "🌟",
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

      {/* Transaction history */}
      <div className="tx-card">
        <h3 className="tx-title">Historial de MYL Coins</h3>
        {txLoading ? (
          <div className="tx-loading">Cargando historial…</div>
        ) : transactions.length === 0 ? (
          <div className="tx-empty">No hay transacciones todavía. ¡Compra tus primeros MYL Coins!</div>
        ) : (
          <div className="tx-list">
            {transactions.map((tx) => {
              const info = TX_TYPE_LABELS[tx.type] || { label: tx.type, color: "var(--text-muted)", sign: "" };
              const absAmount = Math.abs(tx.amount);
              const sign = tx.amount > 0 ? "+" : tx.amount < 0 ? "-" : "";
              return (
                <div key={tx._id} className="tx-row">
                  <div className="tx-row-left">
                    <span className="tx-type-badge" style={{ color: info.color }}>{info.label}</span>
                    <span className="tx-reason">{tx.reason}</span>
                  </div>
                  <div className="tx-row-right">
                    <span className="tx-amount" style={{ color: info.color }}>
                      {sign}{absAmount} 🪙
                    </span>
                    <span className="tx-date">{formatDate(tx.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="back-link">
        <Link href="/wallet">💼 Ver mi wallet completo</Link>
        {" · "}
        <Link href="/dashboard">← Dashboard</Link>
      </p>

      <style jsx>{`
        .coins-page {
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .coins-header { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }

        .balance-row {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 0.25rem;
        }

        .balance-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(251,146,60,0.1);
          border: 1px solid rgba(251,146,60,0.25);
          border-radius: var(--radius-pill);
          padding: 0.45rem 1.25rem;
          text-decoration: none;
        }

        .balance-pill-sparks {
          background: rgba(139,92,246,0.1);
          border-color: rgba(139,92,246,0.25);
          transition: background var(--transition), border-color var(--transition);
        }

        .balance-pill-sparks:hover {
          background: rgba(139,92,246,0.2);
          border-color: rgba(139,92,246,0.5);
        }

        .balance-icon { font-size: 1rem; }

        .balance-value {
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--accent-orange);
        }

        .balance-pill-sparks .balance-value { color: var(--accent-3); }

        .balance-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* Sparks teaser */
        .sparks-teaser {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: var(--radius);
        }

        .sparks-teaser-icon { font-size: 2rem; flex-shrink: 0; }

        .sparks-teaser-text { flex: 1; min-width: 0; }

        .sparks-teaser-title { font-weight: 700; color: var(--text); font-size: 0.95rem; }

        .sparks-teaser-desc { font-size: 0.82rem; color: var(--text-muted); margin-top: 0.15rem; line-height: 1.45; }

        .sparks-teaser-btn {
          flex-shrink: 0;
          padding: 0.55rem 1.25rem;
          background: rgba(139,92,246,0.15);
          border: 1px solid rgba(139,92,246,0.35);
          border-radius: var(--radius-sm);
          color: var(--accent-3);
          font-size: 0.85rem;
          font-weight: 700;
          text-decoration: none;
          transition: all var(--transition);
          white-space: nowrap;
        }

        .sparks-teaser-btn:hover {
          background: rgba(139,92,246,0.25);
          border-color: rgba(139,92,246,0.6);
        }

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
          grid-template-columns: repeat(4, 1fr);
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

        /* Transaction history */
        .tx-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 2rem 2.25rem;
        }

        .tx-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 1.25rem;
          letter-spacing: -0.02em;
        }

        .tx-loading, .tx-empty {
          color: var(--text-muted);
          font-size: 0.875rem;
          text-align: center;
          padding: 1.5rem 0;
        }

        .tx-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .tx-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          transition: background var(--transition);
        }

        .tx-row:hover { background: rgba(255,255,255,0.05); }

        .tx-row-left {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 0;
        }

        .tx-type-badge {
          font-size: 0.8rem;
          font-weight: 700;
        }

        .tx-reason {
          font-size: 0.75rem;
          color: var(--text-dim);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 320px;
        }

        .tx-row-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.15rem;
          flex-shrink: 0;
        }

        .tx-amount {
          font-size: 0.9rem;
          font-weight: 700;
        }

        .tx-date {
          font-size: 0.72rem;
          color: var(--text-dim);
        }

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

        @media (max-width: 768px) {
          .packages-grid { grid-template-columns: repeat(2, 1fr); }
          .sparks-teaser { flex-direction: column; text-align: center; }
        }

        @media (max-width: 480px) {
          .packages-grid { grid-template-columns: 1fr; }
          .how-card, .tx-card { padding: 1.5rem; }
        }
      `}</style>
    </div>
  );
}
