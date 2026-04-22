"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function timeLeft(iso) {
  if (!iso) return "";
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return "Expirado";
  const h = Math.floor(diff / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h`;
}

const PASS_INFO = {
  backstage_pass: { name: "Backstage Pass", icon: "🎭" },
  vip_live_pass: { name: "VIP Live Pass", icon: "👑" },
  private_date: { name: "Private Date", icon: "🌹" },
  inner_circle: { name: "Inner Circle", icon: "✨" },
};

const COIN_TX_LABELS = {
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
  daily_reward: { label: "Recompensa diaria", color: "var(--accent-green)", sign: "+" },
  referral_reward: { label: "Recompensa referido", color: "var(--accent-green)", sign: "+" },
  agency_earned: { label: "Comisión agencia", color: "var(--accent-green)", sign: "+" },
  admin_adjustment: { label: "Ajuste admin", color: "var(--text-muted)", sign: "" },
};

const SPARK_TX_LABELS = {
  purchase: { label: "Compra", color: "var(--accent-green)", sign: "+" },
  boost_used: { label: "Boost activado", color: "var(--error)", sign: "-" },
  pass_purchase: { label: "Pase adquirido", color: "var(--error)", sign: "-" },
  match_boost: { label: "Match boost", color: "var(--error)", sign: "-" },
  speed_dating: { label: "Speed dating", color: "var(--error)", sign: "-" },
  room_entry: { label: "Entrada a sala", color: "var(--error)", sign: "-" },
  admin_adjustment: { label: "Ajuste admin", color: "var(--text-muted)", sign: "" },
};

export default function WalletPage() {
  const { data: session } = useSession();
  const [coins, setCoins] = useState(null);
  const [sparks, setSparks] = useState(null);
  const [earningsCoins, setEarningsCoins] = useState(null);
  const [activePasses, setActivePasses] = useState([]);
  const [recentCoinTx, setRecentCoinTx] = useState([]);
  const [recentSparkTx, setRecentSparkTx] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const localToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const token = localToken || session?.backendToken || null;
    if (!token) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/api/user/coins`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_URL}/api/coins/transactions?limit=5`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_URL}/api/sparks/transactions?limit=5`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_URL}/api/passes/my`, { headers }).then((r) => r.ok ? r.json() : null),
    ])
      .then(([balanceData, coinTxData, sparkTxData, passesData]) => {
        if (balanceData) {
          setCoins(balanceData.coins ?? 0);
          setSparks(balanceData.sparks ?? 0);
          setEarningsCoins(balanceData.earningsCoins ?? 0);
        }
        if (coinTxData) setRecentCoinTx(coinTxData.transactions || []);
        if (sparkTxData) setRecentSparkTx(sparkTxData.transactions || []);
        if (passesData) {
          setActivePasses(passesData.filter(
            (p) => p.status === "active" && new Date(p.expiresAt) > new Date()
          ));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.backendToken]);

  if (loading) {
    return (
      <div className="wallet-loading">
        <span className="spinner" />
        <span>Cargando tu wallet…</span>
      </div>
    );
  }

  return (
    <div className="wallet-page">
      {/* Header */}
      <div className="wallet-header">
        <h1 className="page-title">💼 Mi Wallet</h1>
        <p className="page-subtitle" style={{ textAlign: "center", maxWidth: 480, marginInline: "auto" }}>
          Gestiona tus MYL Coins, Sparks y Access Passes desde un solo lugar.
        </p>
      </div>

      {/* Balance cards */}
      <div className="balance-grid">
        <div className="balance-card balance-coins">
          <div className="bc-header">
            <span className="bc-icon">🪙</span>
            <span className="bc-label">MYL Coins</span>
          </div>
          <div className="bc-amount">{coins ?? "—"}</div>
          <div className="bc-desc">Para regalos, llamadas privadas y contenido exclusivo</div>
          <Link href="/coins" className="bc-action">Comprar Coins →</Link>
        </div>

        <div className="balance-card balance-sparks">
          <div className="bc-header">
            <span className="bc-icon">✨</span>
            <span className="bc-label">Sparks</span>
          </div>
          <div className="bc-amount">{sparks ?? "—"}</div>
          <div className="bc-desc">Para boosts sociales, speed dating y access passes</div>
          <Link href="/sparks" className="bc-action">Comprar Sparks →</Link>
        </div>

        {earningsCoins !== null && earningsCoins > 0 && (
          <div className="balance-card balance-earnings">
            <div className="bc-header">
              <span className="bc-icon">💰</span>
              <span className="bc-label">Ganancias (creator)</span>
            </div>
            <div className="bc-amount">{earningsCoins}</div>
            <div className="bc-desc">Coins ganados por regalos, llamadas y contenido exclusivo</div>
          </div>
        )}
      </div>

      {/* Active passes */}
      <div className="section-card">
        <div className="section-header">
          <h3 className="section-title">🎭 Access Passes Activos</h3>
          <Link href="/passes" className="section-link">Ver todos →</Link>
        </div>
        {activePasses.length === 0 ? (
          <div className="empty-state">
            No tienes pases activos.{" "}
            <Link href="/passes" className="inline-link">Explorar pases →</Link>
          </div>
        ) : (
          <div className="passes-list">
            {activePasses.map((pass) => {
              const info = PASS_INFO[pass.type] || { name: pass.type, icon: "🎫" };
              return (
                <div key={pass._id} className="pass-row">
                  <span className="pass-row-icon">{info.icon}</span>
                  <div className="pass-row-info">
                    <div className="pass-row-name">{info.name}</div>
                    <div className="pass-row-expires">Expira en {timeLeft(pass.expiresAt)}</div>
                  </div>
                  <div className="pass-row-status">✅ Activo</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent coin transactions */}
      <div className="section-card">
        <div className="section-header">
          <h3 className="section-title">🪙 Últimas transacciones de Coins</h3>
          <Link href="/coins" className="section-link">Ver todas →</Link>
        </div>
        {recentCoinTx.length === 0 ? (
          <div className="empty-state">No hay transacciones de coins todavía.</div>
        ) : (
          <div className="tx-list">
            {recentCoinTx.map((tx) => {
              const info = COIN_TX_LABELS[tx.type] || { label: tx.type, color: "var(--text-muted)", sign: "" };
              const sign = tx.amount > 0 ? "+" : tx.amount < 0 ? "-" : "";
              return (
                <div key={tx._id} className="tx-row">
                  <div className="tx-row-left">
                    <span className="tx-type" style={{ color: info.color }}>{info.label}</span>
                    <span className="tx-reason">{tx.reason}</span>
                  </div>
                  <div className="tx-row-right">
                    <span className="tx-amount" style={{ color: info.color }}>{sign}{Math.abs(tx.amount)} 🪙</span>
                    <span className="tx-date">{formatDate(tx.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent spark transactions */}
      <div className="section-card">
        <div className="section-header">
          <h3 className="section-title">✨ Últimas transacciones de Sparks</h3>
          <Link href="/sparks" className="section-link">Ver todas →</Link>
        </div>
        {recentSparkTx.length === 0 ? (
          <div className="empty-state">No hay transacciones de sparks todavía.</div>
        ) : (
          <div className="tx-list">
            {recentSparkTx.map((tx) => {
              const info = SPARK_TX_LABELS[tx.type] || { label: tx.type, color: "var(--text-muted)", sign: "" };
              const sign = tx.amount > 0 ? "+" : tx.amount < 0 ? "-" : "";
              return (
                <div key={tx._id} className="tx-row">
                  <div className="tx-row-left">
                    <span className="tx-type" style={{ color: info.color }}>{info.label}</span>
                    <span className="tx-reason">{tx.reason}</span>
                  </div>
                  <div className="tx-row-right">
                    <span className="tx-amount" style={{ color: info.color }}>{sign}{Math.abs(tx.amount)} ✨</span>
                    <span className="tx-date">{formatDate(tx.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="quick-links">
        <Link href="/coins" className="ql-card ql-coins">
          <span className="ql-icon">🪙</span>
          <div className="ql-label">Comprar MYL Coins</div>
        </Link>
        <Link href="/sparks" className="ql-card ql-sparks">
          <span className="ql-icon">✨</span>
          <div className="ql-label">Comprar Sparks</div>
        </Link>
        <Link href="/passes" className="ql-card ql-passes">
          <span className="ql-icon">🎭</span>
          <div className="ql-label">Access Passes</div>
        </Link>
        <Link href="/explore" className="ql-card ql-explore">
          <span className="ql-icon">🔍</span>
          <div className="ql-label">Explorar Creators</div>
        </Link>
      </div>

      <p className="back-link">
        <Link href="/dashboard">← Volver al dashboard</Link>
      </p>

      <style jsx>{`
        .wallet-page {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          max-width: 860px;
          margin: 0 auto;
        }

        .wallet-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 4rem 0;
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .wallet-header { text-align: center; }

        /* Balance grid */
        .balance-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1.25rem;
        }

        .balance-card {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          padding: 1.75rem 1.5rem;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: rgba(15,8,32,0.8);
          transition: transform var(--transition-slow), box-shadow var(--transition-slow);
        }

        .balance-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }

        .balance-coins { border-color: rgba(251,146,60,0.2); }
        .balance-sparks { border-color: rgba(139,92,246,0.2); }
        .balance-earnings { border-color: rgba(52,211,153,0.2); }

        .bc-header { display: flex; align-items: center; gap: 0.5rem; }

        .bc-icon { font-size: 1.25rem; }

        .bc-label {
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .bc-amount {
          font-size: 2.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.03em;
          line-height: 1;
        }

        .balance-coins .bc-amount { color: var(--accent-orange); }
        .balance-sparks .bc-amount { color: var(--accent-3); }
        .balance-earnings .bc-amount { color: var(--accent-green); }

        .bc-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.4;
          flex: 1;
        }

        .bc-action {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--accent-3);
          text-decoration: none;
          transition: color var(--transition);
        }

        .balance-coins .bc-action { color: var(--accent-orange); }
        .bc-action:hover { opacity: 0.8; }

        /* Section cards */
        .section-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.75rem 2rem;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.25rem;
        }

        .section-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .section-link {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--accent-3);
          text-decoration: none;
          transition: color var(--transition);
        }

        .section-link:hover { color: var(--accent-2); }

        .empty-state {
          color: var(--text-muted);
          font-size: 0.875rem;
          padding: 1rem 0;
        }

        .inline-link {
          color: var(--accent-3);
          font-weight: 600;
          text-decoration: none;
        }

        /* Passes */
        .passes-list { display: flex; flex-direction: column; gap: 0.65rem; }

        .pass-row {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          background: rgba(52,211,153,0.05);
          border: 1px solid rgba(52,211,153,0.12);
        }

        .pass-row-icon { font-size: 1.4rem; flex-shrink: 0; }

        .pass-row-info { flex: 1; }

        .pass-row-name { font-size: 0.875rem; font-weight: 700; color: var(--text); }

        .pass-row-expires { font-size: 0.75rem; color: var(--accent-green); margin-top: 0.1rem; }

        .pass-row-status { font-size: 0.78rem; font-weight: 700; color: var(--accent-green); flex-shrink: 0; }

        /* TX list */
        .tx-list { display: flex; flex-direction: column; gap: 0.4rem; }

        .tx-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.6rem 0.85rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
        }

        .tx-row-left { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }

        .tx-type { font-size: 0.78rem; font-weight: 700; }

        .tx-reason {
          font-size: 0.72rem;
          color: var(--text-dim);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 280px;
        }

        .tx-row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.1rem; flex-shrink: 0; }

        .tx-amount { font-size: 0.85rem; font-weight: 700; }

        .tx-date { font-size: 0.7rem; color: var(--text-dim); }

        /* Quick links */
        .quick-links {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
        }

        .ql-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1.25rem 1rem;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: rgba(15,8,32,0.8);
          text-decoration: none;
          transition: all var(--transition);
          text-align: center;
        }

        .ql-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow);
        }

        .ql-coins:hover { border-color: rgba(251,146,60,0.35); }
        .ql-sparks:hover { border-color: rgba(139,92,246,0.35); }
        .ql-passes:hover { border-color: rgba(224,64,251,0.35); }
        .ql-explore:hover { border-color: rgba(52,211,153,0.35); }

        .ql-icon { font-size: 1.75rem; }

        .ql-label {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-muted);
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

        .spinner {
          width: 22px; height: 22px;
          border: 3px solid rgba(255,255,255,0.15);
          border-top-color: var(--accent-3);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .quick-links { grid-template-columns: repeat(2, 1fr); }
          .section-card { padding: 1.5rem; }
        }
      `}</style>
    </div>
  );
}
