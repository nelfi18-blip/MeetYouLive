"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const PACKAGES = [
  {
    value: 50,
    label: "Starter",
    sparks: "50",
    price: "$0.99",
    icon: "✨",
    desc: "Ideal para explorar",
    highlight: false,
    save: null,
  },
  {
    value: 150,
    label: "Explorer",
    sparks: "150",
    price: "$2.49",
    icon: "⚡",
    desc: "Más presencia social",
    highlight: false,
    save: "Ahorra 16%",
  },
  {
    value: 300,
    label: "Popular",
    sparks: "300",
    price: "$4.49",
    icon: "🌟",
    desc: "El más elegido",
    highlight: true,
    save: "Ahorra 24%",
  },
  {
    value: 600,
    label: "Elite",
    sparks: "600",
    price: "$7.99",
    icon: "💥",
    desc: "Domina la descubierta social",
    highlight: false,
    save: "Ahorra 32%",
  },
];

const BOOSTS = [
  { type: "visibility_boost", label: "Visibility Boost", icon: "📡", cost: 50, desc: "Aumenta tu visibilidad durante 24 horas" },
  { type: "super_interest", label: "Super Interest", icon: "💫", cost: 30, desc: "Señal premium de match intent" },
  { type: "speed_dating", label: "Speed Dating", icon: "⏱️", cost: 100, desc: "Acceso a sesiones de speed dating" },
  { type: "room_entry", label: "Social Room Entry", icon: "🚪", cost: 75, desc: "Entra a salas sociales especiales" },
];

const TX_TYPE_LABELS = {
  purchase: { label: "Compra", color: "var(--accent-green)", sign: "+" },
  boost_used: { label: "Boost activado", color: "var(--error)", sign: "-" },
  pass_purchase: { label: "Pase adquirido", color: "var(--error)", sign: "-" },
  match_boost: { label: "Match boost", color: "var(--error)", sign: "-" },
  speed_dating: { label: "Speed dating", color: "var(--error)", sign: "-" },
  room_entry: { label: "Entrada a sala", color: "var(--error)", sign: "-" },
  admin_adjustment: { label: "Ajuste admin", color: "var(--text-muted)", sign: "" },
};

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SparksPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [boostLoading, setBoostLoading] = useState("");
  const [error, setError] = useState("");
  const [boostMsg, setBoostMsg] = useState("");
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);

  const getToken = () =>
    (typeof window !== "undefined" ? localStorage.getItem("token") : null) ||
    session?.backendToken ||
    null;

  useEffect(() => {
    const token = getToken();
    if (!token) { setTxLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/sparks/balance`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setBalance(d.sparks); })
      .catch(() => {});

    fetch(`${API_URL}/api/sparks/transactions?limit=20`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTransactions(d.transactions || []); })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.backendToken]);

  const buy = async (pkg) => {
    setError("");
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/payments/sparks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Error al iniciar el pago"); return; }
      window.location.href = data.url;
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const activateBoost = async (boostType) => {
    setBoostMsg("");
    setError("");
    setBoostLoading(boostType);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/sparks/boost`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ boostType }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Error al activar boost"); return; }
      setBoostMsg(`✅ ${data.boostType} activado`);
      setBalance((prev) => (prev !== null ? Math.max(0, prev - data.sparkCost) : prev));
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setBoostLoading("");
    }
  };

  return (
    <div className="sparks-page">
      {/* Header */}
      <div className="sparks-header">
        <h1 className="page-title">✨ Sparks</h1>
        <p className="page-subtitle" style={{ maxWidth: 520, marginInline: "auto", textAlign: "center" }}>
          Los Sparks son la moneda social de MeetYouLive. Úsalos para impulsar tu visibilidad, acceder a salas exclusivas y matchear con más intensidad.
        </p>
        {balance !== null && (
          <div className="balance-pill">
            <span className="balance-icon">✨</span>
            <span className="balance-value">{balance}</span>
            <span className="balance-label">Sparks disponibles</span>
          </div>
        )}
      </div>

      {error && <div className="banner-error">{error}</div>}
      {boostMsg && <div className="banner-success">{boostMsg}</div>}

      {/* Packages */}
      <div className="packages-grid">
        {PACKAGES.map((pkg) => (
          <div key={pkg.value} className={`pkg-card${pkg.highlight ? " pkg-highlight" : ""}`}>
            {pkg.highlight && <div className="pkg-badge-top">⭐ Más popular</div>}
            {pkg.save && !pkg.highlight && <div className="pkg-save-badge">{pkg.save}</div>}
            <div className="pkg-icon">{pkg.icon}</div>
            <div className="pkg-label">{pkg.label}</div>
            <div className="pkg-sparks">
              {pkg.sparks}
              <span>Sparks</span>
            </div>
            <div className="pkg-price">{pkg.price}</div>
            {pkg.save && <div className="pkg-save-inline">{pkg.save}</div>}
            <div className="pkg-desc">{pkg.desc}</div>
            <button
              className={`pkg-btn${pkg.highlight ? " pkg-btn-primary" : ""}`}
              onClick={() => buy(pkg.value)}
              disabled={loading}
            >
              {loading ? <><span className="spinner" />Redirigiendo…</> : "Comprar ahora"}
            </button>
          </div>
        ))}
      </div>

      {/* Boosts */}
      <div className="boosts-card">
        <h3 className="boosts-title">⚡ Usa tus Sparks</h3>
        <p className="boosts-subtitle">Activa boosts sociales con tus Sparks para destacar en MeetYouLive</p>
        <div className="boosts-grid">
          {BOOSTS.map((boost) => (
            <div key={boost.type} className="boost-item">
              <div className="boost-icon">{boost.icon}</div>
              <div className="boost-info">
                <div className="boost-label">{boost.label}</div>
                <div className="boost-desc">{boost.desc}</div>
              </div>
              <div className="boost-right">
                <div className="boost-cost">✨ {boost.cost}</div>
                <button
                  className="boost-btn"
                  onClick={() => activateBoost(boost.type)}
                  disabled={!!boostLoading || balance === null || balance < boost.cost}
                >
                  {boostLoading === boost.type ? <span className="spinner spinner-sm" /> : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Access passes teaser */}
      <div className="passes-teaser">
        <div className="passes-teaser-icon">🎭</div>
        <div className="passes-teaser-text">
          <div className="passes-teaser-title">Access Passes — Backstage Pass, VIP Live Pass y más</div>
          <div className="passes-teaser-desc">
            Canjea tus Sparks por pases de acceso a experiencias exclusivas con creators y eventos premium.
          </div>
        </div>
        <Link href="/passes" className="passes-teaser-btn">Ver Pases →</Link>
      </div>

      {/* Transaction history */}
      <div className="tx-card">
        <h3 className="tx-title">Historial de Sparks</h3>
        {txLoading ? (
          <div className="tx-loading">Cargando historial…</div>
        ) : transactions.length === 0 ? (
          <div className="tx-empty">No hay movimientos todavía. ¡Compra tus primeros Sparks!</div>
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
                      {sign}{absAmount} ✨
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
        .sparks-page {
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .sparks-header { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }

        .balance-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(139,92,246,0.1);
          border: 1px solid rgba(139,92,246,0.25);
          border-radius: var(--radius-pill);
          padding: 0.45rem 1.25rem;
          margin-top: 0.25rem;
        }

        .balance-icon { font-size: 1rem; }

        .balance-value {
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--accent-3);
        }

        .balance-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .banner-success {
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.25);
          color: var(--accent-green);
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
          box-shadow: var(--shadow), 0 0 40px rgba(139,92,246,0.2);
        }

        .pkg-highlight:hover {
          box-shadow: var(--shadow), 0 0 60px rgba(139,92,246,0.3);
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
          box-shadow: 0 4px 16px rgba(139,92,246,0.4);
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

        .pkg-sparks {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
          display: flex;
          align-items: baseline;
          gap: 0.4rem;
        }

        .pkg-sparks span {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--text-muted);
        }

        .pkg-price {
          font-size: 1.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #a78bfa, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .pkg-save-inline {
          font-size: 0.68rem;
          font-weight: 800;
          color: var(--accent-green);
          margin-top: -0.35rem;
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

        .pkg-btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
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

        .spinner-sm { width: 12px; height: 12px; }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* Boosts */
        .boosts-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 2rem 2.25rem;
        }

        .boosts-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 0.35rem;
          letter-spacing: -0.02em;
        }

        .boosts-subtitle {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-bottom: 1.5rem;
        }

        .boosts-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .boost-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          transition: background var(--transition);
        }

        .boost-item:hover { background: rgba(255,255,255,0.05); }

        .boost-icon { font-size: 1.6rem; flex-shrink: 0; }

        .boost-info { flex: 1; min-width: 0; }

        .boost-label { font-size: 0.9rem; font-weight: 700; color: var(--text); }

        .boost-desc { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.1rem; }

        .boost-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.35rem;
          flex-shrink: 0;
        }

        .boost-cost {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--accent-3);
        }

        .boost-btn {
          padding: 0.4rem 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.82rem;
          font-weight: 700;
          border: 1px solid rgba(139,92,246,0.3);
          background: rgba(139,92,246,0.1);
          color: var(--accent-3);
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 70px;
        }

        .boost-btn:hover:not(:disabled) {
          background: rgba(139,92,246,0.2);
          border-color: rgba(139,92,246,0.6);
        }

        .boost-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Access passes teaser */
        .passes-teaser {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          background: rgba(224,64,251,0.06);
          border: 1px solid rgba(224,64,251,0.18);
          border-radius: var(--radius);
        }

        .passes-teaser-icon { font-size: 2rem; flex-shrink: 0; }

        .passes-teaser-text { flex: 1; min-width: 0; }

        .passes-teaser-title { font-weight: 700; color: var(--text); font-size: 0.95rem; }

        .passes-teaser-desc { font-size: 0.82rem; color: var(--text-muted); margin-top: 0.15rem; line-height: 1.45; }

        .passes-teaser-btn {
          flex-shrink: 0;
          padding: 0.55rem 1.25rem;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.3);
          border-radius: var(--radius-sm);
          color: var(--accent-2);
          font-size: 0.85rem;
          font-weight: 700;
          text-decoration: none;
          transition: all var(--transition);
          white-space: nowrap;
        }

        .passes-teaser-btn:hover {
          background: rgba(224,64,251,0.18);
          border-color: rgba(224,64,251,0.5);
        }

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

        .tx-list { display: flex; flex-direction: column; gap: 0.5rem; }

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

        .tx-row-left { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }

        .tx-type-badge { font-size: 0.8rem; font-weight: 700; }

        .tx-reason {
          font-size: 0.75rem;
          color: var(--text-dim);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 320px;
        }

        .tx-row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem; flex-shrink: 0; }

        .tx-amount { font-size: 0.9rem; font-weight: 700; }

        .tx-date { font-size: 0.72rem; color: var(--text-dim); }

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
          .passes-teaser { flex-direction: column; text-align: center; }
        }

        @media (max-width: 480px) {
          .packages-grid { grid-template-columns: 1fr; }
          .boosts-card, .tx-card { padding: 1.5rem; }
          .boost-item { flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
