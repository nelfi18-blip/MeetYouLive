"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function StatCard({ title, value, sub, icon, href, highlight }) {
  const card = (
    <div className={`stat-card${highlight ? " stat-card--highlight" : ""}${href ? " stat-card--link" : ""}`}>
      <div className="stat-head">
        <div className="stat-icon">{icon}</div>
        <div className="stat-title">{title}</div>
      </div>
      <div className="stat-body">
        <div className="stat-value">{value ?? "—"}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{card}</Link> : card;
}

function QuickRow({ label, value, href }) {
  return (
    <div className="quick-row">
      <span className="quick-label">{label}</span>
      <span className="quick-value">
        {href ? <Link href={href} className="quick-link">{value}</Link> : value}
      </span>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [topCreators, setTopCreators] = useState([]);
  const [topSpenders, setTopSpenders] = useState([]);

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("admin_token");
    if (!token) { router.replace("/admin/login"); return; }
    try {
      const [overviewRes, analyticsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/overview`, { headers: authHeader() }),
        fetch(`${API_URL}/api/admin/analytics`, { headers: authHeader() }),
      ]);

      if (overviewRes.status === 401 || analyticsRes.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      if (overviewRes.status === 403) {
        setError("Sin permisos de administrador.");
        return;
      }

      if (overviewRes.ok) {
        const d = await overviewRes.json();
        setStats(d.stats || null);
      }
      if (analyticsRes.ok) {
        const d = await analyticsRes.json();
        setTopCreators(d.analytics?.topCreators || []);
        setTopSpenders(d.analytics?.topSpenders || []);
      }
    } catch {
      setError("Error cargando datos del dashboard.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner">⊞</div>
        <p>Cargando dashboard…</p>
      </div>
    );
  }

  if (error) {
    return <div className="error-state">{error}</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Vista operativa de la plataforma</p>
        </div>
        <button className="btn-refresh" onClick={loadData} disabled={loading}>
          ↺ Actualizar
        </button>
      </div>

      {/* Main metrics */}
      {stats && (
        <>
          <section className="section">
            <h2 className="section-title">Usuarios & Actividad</h2>
            <div className="stats-grid">
              <StatCard icon="👥" title="Usuarios totales" value={stats.totalUsers?.toLocaleString()} href="/admin/users" />
              <StatCard icon="🟢" title="Activos hoy" value={stats.activeUsersToday?.toLocaleString()} highlight={stats.activeUsersToday > 0} />
              <StatCard icon="📅" title="Registros (7d)" value={stats.recentRegistrations?.toLocaleString()} />
              <StatCard icon="💎" title="Suscripciones" value={stats.subscriptions?.toLocaleString()} />
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Creadores & Streams</h2>
            <div className="stats-grid">
              <StatCard icon="🎬" title="Creadores aprobados" value={stats.totalCreators?.toLocaleString()} href="/admin/creators" />
              <StatCard
                icon="⏳"
                title="Solicitudes pendientes"
                value={stats.pendingCreators?.toLocaleString()}
                href="/admin/creators?status=pending"
                highlight={stats.pendingCreators > 0}
              />
              <StatCard icon="📡" title="Streams en vivo" value={stats.activeLives?.toLocaleString()} href="/admin/lives" highlight={stats.activeLives > 0} />
              <StatCard icon="📼" title="Lives totales" value={stats.totalLives?.toLocaleString()} href="/admin/lives" />
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Monetización</h2>
            <div className="stats-grid">
              <StatCard icon="🪙" title="Coins comprados" value={(stats.totalCoinsPurchased ?? 0).toLocaleString()} href="/admin/transactions" />
              <StatCard icon="🎁" title="Regalos enviados" value={(stats.totalGiftsSent ?? 0).toLocaleString()} />
              <StatCard icon="💸" title="Coins en regalos" value={(stats.totalGiftsCoins ?? 0).toLocaleString()} />
              <StatCard
                icon="💰"
                title="Pagos pendientes (coins)"
                value={(stats.pendingPayoutsCoins ?? 0).toLocaleString()}
                highlight={stats.pendingPayoutsCoins > 0}
              />
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Moderación</h2>
            <div className="stats-grid">
              <StatCard
                icon="🚨"
                title="Reportes abiertos"
                value={(stats.openReports ?? 0).toLocaleString()}
                href="/admin/reports"
                highlight={stats.openReports > 0}
              />
            </div>
          </section>
        </>
      )}

      {/* Tables row */}
      <div className="tables-row">
        {/* Top creators */}
        <div className="table-panel">
          <div className="table-panel-header">
            <h3 className="table-panel-title">🏆 Top creadores (24h)</h3>
            <Link href="/admin/creators" className="table-link">Ver todos →</Link>
          </div>
          {topCreators.length === 0 ? (
            <p className="empty-text">Sin datos de hoy.</p>
          ) : (
            <table className="mini-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Creador</th>
                  <th>Regalos</th>
                </tr>
              </thead>
              <tbody>
                {topCreators.map((c, i) => (
                  <tr key={c._id}>
                    <td className="rank">{i + 1}</td>
                    <td>
                      <div className="mini-user">
                        {c.user?.avatar ? (
                          <img src={c.user.avatar} alt="" className="mini-avatar" />
                        ) : (
                          <div className="mini-avatar mini-avatar--ph">
                            {(c.user?.name || c.user?.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <span>{c.user?.name || c.user?.username || "—"}</span>
                      </div>
                    </td>
                    <td className="coins">{(c.totalGifts ?? 0).toLocaleString()} 🪙</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top spenders */}
        <div className="table-panel">
          <div className="table-panel-header">
            <h3 className="table-panel-title">💸 Top gastadores (24h)</h3>
            <Link href="/admin/transactions?type=purchase" className="table-link">Ver todos →</Link>
          </div>
          {topSpenders.length === 0 ? (
            <p className="empty-text">Sin datos de hoy.</p>
          ) : (
            <table className="mini-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Usuario</th>
                  <th>Comprado</th>
                </tr>
              </thead>
              <tbody>
                {topSpenders.map((s, i) => (
                  <tr key={s._id}>
                    <td className="rank">{i + 1}</td>
                    <td>
                      <div className="mini-user">
                        {s.user?.avatar ? (
                          <img src={s.user.avatar} alt="" className="mini-avatar" />
                        ) : (
                          <div className="mini-avatar mini-avatar--ph">
                            {(s.user?.name || s.user?.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <span>{s.user?.name || s.user?.username || "—"}</span>
                      </div>
                    </td>
                    <td className="coins">{(s.totalSpent ?? 0).toLocaleString()} 🪙</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="quick-links">
        <h3 className="quick-title">Accesos rápidos</h3>
        <div className="quick-grid">
          <Link href="/admin/users" className="quick-btn">👥 Usuarios</Link>
          <Link href="/admin/creators?status=pending" className="quick-btn quick-btn--highlight">⏳ Creadores pendientes</Link>
          <Link href="/admin/lives" className="quick-btn">📡 Streams en vivo</Link>
          <Link href="/admin/reports" className="quick-btn quick-btn--danger">🚨 Reportes</Link>
          <Link href="/admin/transactions" className="quick-btn">💰 Transacciones</Link>
          <Link href="/admin/analytics" className="quick-btn">📊 Analíticas</Link>
          <Link href="/admin/settings" className="quick-btn">⚙️ Configuración</Link>
        </div>
      </div>

      <style jsx>{`
        .page { max-width: 1280px; }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 2rem;
          gap: 1rem;
        }

        .page-title {
          font-size: 1.6rem;
          font-weight: 800;
          color: #e2e8f0;
          margin: 0 0 0.25rem;
        }

        .page-sub {
          font-size: 0.875rem;
          color: #64748b;
          margin: 0;
        }

        .btn-refresh {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.55rem 1rem;
          font-size: 0.85rem;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .btn-refresh:hover:not(:disabled) { background: #2d3748; }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem;
          color: #64748b;
          gap: 0.75rem;
        }

        .loading-spinner {
          font-size: 2.5rem;
          animation: spin 2s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .error-state {
          padding: 2rem;
          text-align: center;
          color: #f87171;
          font-size: 0.95rem;
        }

        .section {
          margin-bottom: 2rem;
        }

        .section-title {
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
          margin: 0 0 0.75rem;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.9rem;
        }

        @media (min-width: 640px) {
          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (min-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (min-width: 1280px) {
          .stats-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        .stat-card {
          background: #161b27;
          border: 1px solid #1e2535;
          border-radius: 12px;
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.75rem;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
          animation: card-fade-in 0.35s ease both;
        }

        @media (hover: hover) and (pointer: fine) {
          .stat-card--link:hover {
            border-color: #7c3aed;
            background: #1a1f2e;
            transform: translateY(-2px);
          }
        }

        .stat-card--highlight {
          border-color: rgba(251, 191, 36, 0.3);
          background: rgba(251, 191, 36, 0.04);
        }

        .stat-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .stat-icon {
          font-size: 1.4rem;
          flex-shrink: 0;
        }

        .stat-value {
          font-size: clamp(1.8rem, 3.6vw, 2.15rem);
          font-weight: 800;
          color: #e2e8f0;
          line-height: 1;
        }

        .stat-title {
          font-size: 0.8rem;
          color: #64748b;
          margin-top: 0;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .stat-sub {
          font-size: 0.72rem;
          color: #475569;
          margin-top: 0.15rem;
        }

        .tables-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        @media (max-width: 700px) {
          .tables-row { grid-template-columns: 1fr; }
        }

        .table-panel {
          background: #161b27;
          border: 1px solid #1e2535;
          border-radius: 12px;
          padding: 1.1rem 1.25rem;
          animation: card-fade-in 0.4s ease both;
        }

        .table-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.85rem;
        }

        .table-panel-title {
          font-size: 0.875rem;
          font-weight: 700;
          color: #e2e8f0;
          margin: 0;
        }

        .table-link {
          font-size: 0.78rem;
          color: #7c3aed;
          text-decoration: none;
          font-weight: 600;
        }

        .table-link:hover { color: #a78bfa; }

        .empty-text {
          font-size: 0.85rem;
          color: #64748b;
          text-align: center;
          padding: 1rem;
          margin: 0;
        }

        .mini-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }

        .mini-table th {
          text-align: left;
          color: #64748b;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.35rem 0.5rem;
          border-bottom: 1px solid #1e2535;
        }

        .mini-table td {
          padding: 0.45rem 0.5rem;
          color: #cbd5e1;
          border-bottom: 1px solid #131825;
          vertical-align: middle;
        }

        .mini-table tbody tr:last-child td { border-bottom: none; }

        .rank { color: #64748b; font-weight: 700; width: 24px; }
        .coins { color: #fbbf24; font-weight: 600; text-align: right; white-space: nowrap; }

        .mini-user {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .mini-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .mini-avatar--ph {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.65rem;
          color: #fff;
        }

        .quick-links {
          background: #161b27;
          border: 1px solid #1e2535;
          border-radius: 12px;
          padding: 1.25rem;
          margin-bottom: 2rem;
          animation: card-fade-in 0.45s ease both;
        }

        .quick-title {
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
          margin: 0 0 0.85rem;
        }

        .quick-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.55rem;
        }

        .quick-btn {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 999px;
          padding: 0.6rem 0.85rem;
          font-size: 0.82rem;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          min-height: 40px;
        }

        .quick-btn:hover {
          background: #2d3748;
          color: #e2e8f0;
        }

        .quick-btn--highlight {
          background: rgba(251, 191, 36, 0.08);
          border-color: rgba(251, 191, 36, 0.2);
          color: #fbbf24;
        }

        .quick-btn--highlight:hover {
          background: rgba(251, 191, 36, 0.15);
        }

        .quick-btn--danger {
          background: rgba(239, 68, 68, 0.08);
          border-color: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }

        .quick-btn--danger:hover {
          background: rgba(239, 68, 68, 0.15);
        }

        @keyframes card-fade-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: flex-start;
            margin-bottom: 1.5rem;
          }
          .btn-refresh {
            width: 100%;
            text-align: center;
          }
          .table-panel {
            padding: 0.95rem 0.85rem;
          }
          .quick-links {
            padding: 1rem 0.85rem;
          }
          .quick-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
