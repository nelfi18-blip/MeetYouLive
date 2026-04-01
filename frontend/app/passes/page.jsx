"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Duration label mapping for backend durationHours values
function durationLabel(hours) {
  if (!hours) return "";
  if (hours < 24) return `${hours} horas`;
  if (hours === 168) return "7 días";
  return `${Math.round(hours / 24)} días`;
}

const STATUS_LABELS = {
  active: { label: "Activo", color: "var(--accent-green)" },
  used: { label: "Usado", color: "var(--text-dim)" },
  expired: { label: "Expirado", color: "var(--text-dim)" },
};

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeLeft(iso) {
  if (!iso) return "";
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return "Expirado";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

export default function PassesPage() {
  const { data: session } = useSession();
  const [catalog, setCatalog] = useState([]);
  const [sparks, setSparks] = useState(null);
  const [myPasses, setMyPasses] = useState([]);
  const [passesLoading, setPassesLoading] = useState(true);
  const [purchasing, setPurchasing] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const getToken = () =>
    (typeof window !== "undefined" ? localStorage.getItem("token") : null) ||
    session?.backendToken ||
    null;

  const loadData = () => {
    const token = getToken();
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    // Fetch catalog (public endpoint, no auth needed)
    fetch(`${API_URL}/api/passes/catalog`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setCatalog(Array.isArray(d) ? d : []))
      .catch(() => {});

    if (!token) { setPassesLoading(false); return; }

    fetch(`${API_URL}/api/sparks/balance`, { headers: authHeaders })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setSparks(d.sparks); })
      .catch(() => {});

    fetch(`${API_URL}/api/passes/my`, { headers: authHeaders })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setMyPasses(d); })
      .catch(() => {})
      .finally(() => setPassesLoading(false));
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.backendToken]);

  const purchase = async (passType) => {
    setError("");
    setSuccessMsg("");
    setPurchasing(passType);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/passes/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ passType }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Error al adquirir el pase"); return; }
      const passInfo = catalog.find((p) => p.type === passType);
      setSuccessMsg(`✅ ${passInfo?.name || passType} adquirido`);
      setSparks((prev) => (prev !== null ? Math.max(0, prev - (passInfo?.sparkCost || 0)) : prev));
      loadData();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setPurchasing("");
    }
  };

  const activePasses = myPasses.filter((p) => p.status === "active" && new Date(p.expiresAt) > new Date());

  return (
    <div className="passes-page">
      {/* Header */}
      <div className="passes-header">
        <h1 className="page-title">🎭 Access Passes</h1>
        <p className="page-subtitle" style={{ maxWidth: 540, marginInline: "auto", textAlign: "center" }}>
          Canjea tus Sparks por pases de acceso exclusivo. Desde backstage con creators hasta experiencias VIP en vivo.
        </p>
        {sparks !== null && (
          <Link href="/sparks" className="balance-pill">
            <span className="balance-icon">✨</span>
            <span className="balance-value">{sparks}</span>
            <span className="balance-label">Sparks disponibles</span>
          </Link>
        )}
      </div>

      {error && <div className="banner-error">{error}</div>}
      {successMsg && <div className="banner-success">{successMsg}</div>}

      {/* My active passes */}
      {activePasses.length > 0 && (
        <div className="my-passes-card">
          <h3 className="section-title">Mis pases activos</h3>
          <div className="my-passes-grid">
            {activePasses.map((pass) => {
              const info = catalog.find((p) => p.type === pass.type);
              return (
                <div key={pass._id} className="active-pass-item">
                  <div className="active-pass-icon">{info?.icon || "🎫"}</div>
                  <div className="active-pass-info">
                    <div className="active-pass-name">{info?.name || pass.type}</div>
                    <div className="active-pass-expires">Expira en {timeLeft(pass.expiresAt)}</div>
                  </div>
                  <div className="active-pass-status">✅ Activo</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pass catalog */}
      <div className="catalog-grid">
        {catalog.map((pass) => {
          const owned = activePasses.some((p) => p.type === pass.type);
          const canBuy = sparks !== null && sparks >= pass.sparkCost;
          return (
            <div key={pass.type} className={`pass-card${owned ? " pass-owned" : ""}`}>
              {owned && <div className="pass-owned-badge">✅ Activo</div>}
              <div className="pass-icon">{pass.icon}</div>
              <div className="pass-name">{pass.name}</div>
              <div className="pass-desc">{pass.description}</div>
              <div className="pass-meta">
                <div className="pass-duration">⏱ {durationLabel(pass.durationHours)}</div>
                <div className="pass-cost">✨ {pass.sparkCost} Sparks</div>
              </div>
              <button
                className={`pass-btn${!canBuy && !owned ? " pass-btn-disabled" : ""}`}
                onClick={() => !owned && purchase(pass.type)}
                disabled={owned || !!purchasing || !canBuy}
              >
                {purchasing === pass.type ? (
                  <><span className="spinner" />Procesando…</>
                ) : owned ? (
                  "Ya tienes este pase"
                ) : !canBuy ? (
                  "Sparks insuficientes"
                ) : (
                  "Adquirir pase"
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* History */}
      {!passesLoading && myPasses.filter((p) => p.status !== "active" || new Date(p.expiresAt) <= new Date()).length > 0 && (
        <div className="history-card">
          <h3 className="section-title">Historial de pases</h3>
          <div className="history-list">
            {myPasses
              .filter((p) => p.status !== "active" || new Date(p.expiresAt) <= new Date())
              .map((pass) => {
                const info = catalog.find((p) => p.type === pass.type);
                const statusInfo = STATUS_LABELS[pass.status] || STATUS_LABELS.expired;
                return (
                  <div key={pass._id} className="history-row">
                    <div className="history-icon">{info?.icon || "🎫"}</div>
                    <div className="history-info">
                      <div className="history-name">{info?.name || pass.type}</div>
                      <div className="history-date">Adquirido: {formatDate(pass.createdAt)}</div>
                    </div>
                    <div className="history-status" style={{ color: statusInfo.color }}>
                      {statusInfo.label}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <p className="back-link">
        <Link href="/wallet">💼 Ver mi wallet completo</Link>
        {" · "}
        <Link href="/sparks">✨ Comprar Sparks</Link>
        {" · "}
        <Link href="/dashboard">← Dashboard</Link>
      </p>

      <style jsx>{`
        .passes-page {
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .passes-header { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }

        .balance-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(139,92,246,0.1);
          border: 1px solid rgba(139,92,246,0.25);
          border-radius: var(--radius-pill);
          padding: 0.45rem 1.25rem;
          margin-top: 0.25rem;
          text-decoration: none;
          transition: background var(--transition), border-color var(--transition);
        }

        .balance-pill:hover {
          background: rgba(139,92,246,0.18);
          border-color: rgba(139,92,246,0.45);
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

        .section-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 1.25rem;
          letter-spacing: -0.02em;
        }

        /* My active passes */
        .my-passes-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid rgba(52,211,153,0.2);
          border-radius: var(--radius);
          padding: 2rem 2.25rem;
        }

        .my-passes-grid { display: flex; flex-direction: column; gap: 0.75rem; }

        .active-pass-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.85rem 1rem;
          border-radius: var(--radius-sm);
          background: rgba(52,211,153,0.05);
          border: 1px solid rgba(52,211,153,0.15);
        }

        .active-pass-icon { font-size: 1.5rem; flex-shrink: 0; }

        .active-pass-info { flex: 1; }

        .active-pass-name { font-weight: 700; color: var(--text); font-size: 0.9rem; }

        .active-pass-expires { font-size: 0.78rem; color: var(--accent-green); margin-top: 0.1rem; }

        .active-pass-status { font-size: 0.8rem; font-weight: 700; color: var(--accent-green); flex-shrink: 0; }

        /* Catalog grid */
        .catalog-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.25rem;
        }

        .pass-card {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 2rem 1.75rem 1.75rem;
          position: relative;
          border-radius: var(--radius);
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition);
        }

        .pass-card:hover {
          transform: translateY(-3px);
          box-shadow: var(--shadow);
          border-color: rgba(224,64,251,0.25);
        }

        .pass-owned {
          border-color: rgba(52,211,153,0.3);
          background: rgba(52,211,153,0.04);
        }

        .pass-owned-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(52,211,153,0.15);
          color: var(--accent-green);
          border: 1px solid rgba(52,211,153,0.3);
          font-size: 0.68rem;
          font-weight: 800;
          padding: 0.18rem 0.85rem;
          border-radius: var(--radius-pill);
          white-space: nowrap;
        }

        .pass-icon { font-size: 2.5rem; }

        .pass-name {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .pass-desc {
          font-size: 0.83rem;
          color: var(--text-muted);
          line-height: 1.5;
          flex: 1;
        }

        .pass-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .pass-duration {
          font-size: 0.8rem;
          color: var(--text-dim);
          font-weight: 600;
        }

        .pass-cost {
          font-size: 0.9rem;
          font-weight: 800;
          color: var(--accent-3);
        }

        .pass-btn {
          padding: 0.85rem;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 700;
          border: 1px solid rgba(224,64,251,0.25);
          background: rgba(224,64,251,0.08);
          color: var(--accent-2);
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .pass-btn:hover:not(:disabled) {
          background: rgba(224,64,251,0.15);
          border-color: rgba(224,64,251,0.5);
        }

        .pass-btn-disabled {
          border-color: var(--border);
          background: transparent;
          color: var(--text-dim);
        }

        .pass-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .spinner {
          width: 15px; height: 15px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* History */
        .history-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 2rem 2.25rem;
        }

        .history-list { display: flex; flex-direction: column; gap: 0.5rem; }

        .history-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .history-icon { font-size: 1.4rem; flex-shrink: 0; }

        .history-info { flex: 1; }

        .history-name { font-size: 0.875rem; font-weight: 600; color: var(--text); }

        .history-date { font-size: 0.75rem; color: var(--text-dim); margin-top: 0.1rem; }

        .history-status { font-size: 0.8rem; font-weight: 700; flex-shrink: 0; }

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
          .catalog-grid { grid-template-columns: 1fr; }
          .my-passes-card, .history-card { padding: 1.5rem; }
        }
      `}</style>
    </div>
  );
}
