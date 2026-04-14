"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function MetricCard({ title, value, sub, icon }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div className="metric-body">
        <div className="metric-value">{value ?? "—"}</div>
        <div className="metric-title">{title}</div>
        {sub && <div className="metric-sub">{sub}</div>}
      </div>
    </div>
  );
}

function BarChart({ data, valueKey, labelKey, colorFn }) {
  if (!data?.length) return <div className="chart-empty">Sin datos disponibles.</div>;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="bar-chart">
      {data.map((item, i) => {
        const pct = ((item[valueKey] || 0) / max) * 100;
        return (
          <div key={i} className="bar-item">
            <div className="bar-label">{item[labelKey]}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${pct}%`,
                  background: colorFn ? colorFn(i) : "#7c3aed",
                }}
              />
            </div>
            <div className="bar-value">{(item[valueKey] || 0).toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/analytics`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos."); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setAnalytics(data.analytics || null);
    } catch {
      setError("Error cargando analíticas.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analíticas</h1>
          <p className="page-sub">Datos de plataforma de los últimos 7 días</p>
        </div>
        <button className="btn-refresh" onClick={loadAnalytics} disabled={loading}>
          {loading ? "…" : "↺ Actualizar"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando analíticas…</div>
      ) : !analytics ? (
        <div className="loading-state">Sin datos disponibles.</div>
      ) : (
        <>
          {/* Retention metrics */}
          <section className="section">
            <h2 className="section-title">Retención de usuarios</h2>
            <div className="metrics-grid">
              <MetricCard icon="🟢" title="Activos hoy (DAU)" value={analytics.retention?.dau?.toLocaleString()} />
              <MetricCard icon="📅" title="Activos esta semana (WAU)" value={analytics.retention?.wau?.toLocaleString()} />
              <MetricCard icon="📆" title="Activos este mes (MAU)" value={analytics.retention?.mau?.toLocaleString()} />
              {analytics.retention?.dau > 0 && analytics.retention?.mau > 0 && (
                <MetricCard
                  icon="📈"
                  title="Ratio DAU/MAU"
                  value={`${((analytics.retention.dau / analytics.retention.mau) * 100).toFixed(1)}%`}
                  sub="Proxy de engagement"
                />
              )}
            </div>
          </section>

          {/* Daily registrations */}
          <section className="section">
            <h2 className="section-title">Registros diarios (últimos 7 días)</h2>
            <div className="chart-panel">
              <BarChart
                data={analytics.dailyRegistrations}
                valueKey="count"
                labelKey="label"
                colorFn={() => "#7c3aed"}
              />
            </div>
          </section>

          {/* Daily coin purchases */}
          <section className="section">
            <h2 className="section-title">Compra de coins diaria (últimos 7 días)</h2>
            <div className="chart-panel">
              <BarChart
                data={analytics.dailyPurchases}
                valueKey="total"
                labelKey="label"
                colorFn={() => "#fbbf24"}
              />
            </div>
          </section>

          {/* Top tables */}
          <div className="tables-row">
            {/* Top creators */}
            <div className="table-panel">
              <h3 className="table-panel-title">🏆 Top creadores por regalos (24h)</h3>
              {!analytics.topCreators?.length ? (
                <p className="empty-text">Sin datos de hoy.</p>
              ) : (
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Creador</th>
                      <th>Regalos recibidos</th>
                      <th>Cantidad (coins)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topCreators.map((c, i) => (
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
                        <td className="text-center">{c.count}</td>
                        <td className="coins">{(c.totalGifts ?? 0).toLocaleString()} 🪙</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top spenders */}
            <div className="table-panel">
              <h3 className="table-panel-title">💸 Top compradores (24h)</h3>
              {!analytics.topSpenders?.length ? (
                <p className="empty-text">Sin datos de hoy.</p>
              ) : (
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Usuario</th>
                      <th>Coins comprados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topSpenders.map((s, i) => (
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
        </>
      )}

      <style jsx>{`
        .page { max-width: 1200px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.75rem; gap: 1rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; margin: 0 0 0.2rem; }
        .page-sub { font-size: 0.85rem; color: #64748b; margin: 0; }
        .btn-refresh { background: #1e2535; border: 1px solid #2d3748; color: #94a3b8; border-radius: 8px; padding: 0.55rem 1rem; font-size: 0.85rem; cursor: pointer; font-family: inherit; white-space: nowrap; flex-shrink: 0; }
        .alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; margin-bottom: 1rem; }
        .alert-error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
        .loading-state { text-align: center; padding: 3rem; color: #64748b; }
        .section { margin-bottom: 2rem; }
        .section-title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 0 0 0.85rem; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }
        .metric-card { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.85rem; }
        .metric-icon { font-size: 1.5rem; flex-shrink: 0; }
        .metric-value { font-size: 1.4rem; font-weight: 800; color: #e2e8f0; line-height: 1; }
        .metric-title { font-size: 0.78rem; color: #64748b; margin-top: 0.2rem; }
        .metric-sub { font-size: 0.7rem; color: #475569; margin-top: 0.1rem; }
        .chart-panel { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1.25rem; }
        .chart-empty { text-align: center; color: #64748b; font-size: 0.875rem; padding: 1.5rem; }
        .bar-chart { display: flex; flex-direction: column; gap: 0.55rem; }
        .bar-item { display: grid; grid-template-columns: 80px 1fr 60px; align-items: center; gap: 0.75rem; }
        .bar-label { font-size: 0.78rem; color: #94a3b8; text-align: right; white-space: nowrap; }
        .bar-track { background: #1e2535; border-radius: 4px; height: 8px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; min-width: 2px; }
        .bar-value { font-size: 0.78rem; color: #e2e8f0; font-weight: 600; text-align: right; }
        .tables-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem; }
        @media (max-width: 700px) { .tables-row { grid-template-columns: 1fr; } }
        .table-panel { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1.1rem 1.25rem; }
        .table-panel-title { font-size: 0.875rem; font-weight: 700; color: #e2e8f0; margin: 0 0 0.85rem; }
        .empty-text { font-size: 0.85rem; color: #64748b; text-align: center; padding: 1rem; margin: 0; }
        .mini-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .mini-table th { text-align: left; color: #64748b; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.35rem 0.5rem; border-bottom: 1px solid #1e2535; }
        .mini-table td { padding: 0.45rem 0.5rem; color: #cbd5e1; border-bottom: 1px solid #131825; vertical-align: middle; }
        .mini-table tbody tr:last-child td { border-bottom: none; }
        .rank { color: #64748b; font-weight: 700; width: 24px; }
        .coins { color: #fbbf24; font-weight: 600; text-align: right; white-space: nowrap; }
        .text-center { text-align: center; }
        .mini-user { display: flex; align-items: center; gap: 0.4rem; }
        .mini-avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .mini-avatar--ph { background: linear-gradient(135deg, #7c3aed, #a855f7); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.65rem; color: #fff; }
      `}</style>
    </div>
  );
}
