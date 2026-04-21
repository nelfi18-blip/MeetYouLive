"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function MetricCard({ title, value, sub, icon, highlight }) {
  return (
    <div className={`metric-card${highlight ? " metric-card--highlight" : ""}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-body">
        <div className="metric-value">{value ?? "—"}</div>
        <div className="metric-title">{title}</div>
        {sub && <div className="metric-sub">{sub}</div>}
      </div>
    </div>
  );
}

function BarChart({ data, valueKey, labelKey, color }) {
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
              <div className="bar-fill" style={{ width: `${pct}%`, background: color || "#7c3aed" }} />
            </div>
            <div className="bar-value">{(item[valueKey] || 0).toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminRevenuePage() {
  const router = useRouter();
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadRevenue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/revenue`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos de administrador."); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setRevenue(data.revenue || null);
    } catch {
      setError("Error cargando métricas de ingresos.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => { loadRevenue(); }, [loadRevenue]);

  const subs = revenue?.subscriptions;
  const coins = revenue?.coins;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ingresos</h1>
          <p className="page-sub">Métricas financieras · Suscripciones y compra de coins</p>
        </div>
        <button className="btn-refresh" onClick={loadRevenue} disabled={loading}>
          {loading ? "…" : "↺ Actualizar"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando métricas de ingresos…</div>
      ) : !revenue ? (
        <div className="loading-state">Sin datos disponibles.</div>
      ) : (
        <>
          {/* MRR & subscription KPIs */}
          <section className="section">
            <h2 className="section-title">Suscripciones</h2>
            <div className="metrics-grid">
              <MetricCard
                icon="💵"
                title="MRR estimado"
                value={`$${subs.estimatedMRR.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                sub={`${subs.active} subs × $${subs.subscriptionPriceUsd}/mes`}
                highlight={subs.estimatedMRR > 0}
              />
              <MetricCard
                icon="✅"
                title="Suscripciones activas"
                value={subs.active.toLocaleString()}
              />
              <MetricCard
                icon="🆕"
                title="Nuevas subs (7d)"
                value={subs.newThisWeek.toLocaleString()}
                highlight={subs.newThisWeek > 0}
              />
              <MetricCard
                icon="📉"
                title="Cancelaciones (30d)"
                value={subs.canceledLast30Days.toLocaleString()}
                highlight={subs.canceledLast30Days > 0}
              />
              <MetricCard
                icon="⚠️"
                title="Pagos fallidos (past_due)"
                value={subs.pastDue.toLocaleString()}
                highlight={subs.pastDue > 0}
              />
              <MetricCard
                icon="🔄"
                title="Tasa de churn (30d)"
                value={`${subs.churnRate}%`}
                sub="Cancelaciones / (activas + canceladas)"
              />
            </div>
          </section>

          {/* Coins KPIs */}
          <section className="section">
            <h2 className="section-title">Compra de Coins (últimos 30 días)</h2>
            <div className="metrics-grid">
              <MetricCard
                icon="🪙"
                title="Coins vendidos (30d)"
                value={coins.totalCoinRevenueLast30Days.toLocaleString()}
                highlight={coins.totalCoinRevenueLast30Days > 0}
              />
              <MetricCard
                icon="👥"
                title="Compradores únicos (30d)"
                value={coins.buyersLast30Days.toLocaleString()}
              />
              <MetricCard
                icon="📊"
                title="Promedio coins / comprador"
                value={coins.avgCoinsPerBuyer.toLocaleString()}
                sub="ARPU proxy"
              />
            </div>
          </section>

          {/* Daily coin revenue chart */}
          <section className="section">
            <h2 className="section-title">Coins comprados por día (últimos 30 días)</h2>
            <div className="chart-panel">
              <BarChart
                data={coins.dailyCoinRevenue}
                valueKey="total"
                labelKey="label"
                color="#fbbf24"
              />
            </div>
          </section>

          {/* Action items */}
          {(subs.pastDue > 0 || subs.canceledLast30Days > 2) && (
            <section className="section">
              <h2 className="section-title">⚡ Acciones recomendadas</h2>
              <div className="actions-list">
                {subs.pastDue > 0 && (
                  <div className="action-item action-item--warning">
                    <span className="action-icon">⚠️</span>
                    <div>
                      <div className="action-title">
                        {subs.pastDue} suscripción{subs.pastDue > 1 ? "es" : ""} con pago fallido
                      </div>
                      <div className="action-desc">
                        Verifica en Stripe si los reintentos automáticos están activos. Considera
                        enviar un email de recuperación.
                      </div>
                    </div>
                  </div>
                )}
                {subs.canceledLast30Days > 2 && (
                  <div className="action-item action-item--info">
                    <span className="action-icon">📉</span>
                    <div>
                      <div className="action-title">Churn elevado este mes</div>
                      <div className="action-desc">
                        {subs.canceledLast30Days} cancelaciones en 30 días. Revisa los motivos más
                        comunes en el panel de Stripe y considera encuestas de salida.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Setup checklist */}
          <section className="section">
            <h2 className="section-title">✅ Checklist de producción Stripe</h2>
            <div className="checklist-card">
              <div className="checklist-item">
                <span className="check-icon">1.</span>
                <span>En Stripe Dashboard → modo <strong>Live</strong> activo (no Test)</span>
              </div>
              <div className="checklist-item">
                <span className="check-icon">2.</span>
                <span>Variable <code>STRIPE_SECRET_KEY</code> = <code>sk_live_…</code> en Render</span>
              </div>
              <div className="checklist-item">
                <span className="check-icon">3.</span>
                <span>Variable <code>STRIPE_WEBHOOK_SECRET</code> configurada en Render</span>
              </div>
              <div className="checklist-item">
                <span className="check-icon">4.</span>
                <span>Webhook en Stripe apuntando a <code>POST https://api.meetyoulive.net/api/webhooks/stripe</code></span>
              </div>
              <div className="checklist-item">
                <span className="check-icon">5.</span>
                <span>
                  Eventos habilitados en el webhook:{" "}
                  <code>checkout.session.completed</code>,{" "}
                  <code>customer.subscription.deleted</code>,{" "}
                  <code>invoice.payment_failed</code>,{" "}
                  <code>invoice.payment_succeeded</code>
                </span>
              </div>
              <div className="checklist-item">
                <span className="check-icon">6.</span>
                <span>Variable <code>STRIPE_SUBSCRIPTION_PRICE_ID</code> con el Price ID del plan live</span>
              </div>
              <div className="checklist-item">
                <span className="check-icon">7.</span>
                <span>Páginas legales publicadas: <a href="/terms" target="_blank">/terms</a>, <a href="/privacy" target="_blank">/privacy</a>, <a href="/refunds" target="_blank">/refunds</a></span>
              </div>
            </div>
          </section>
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
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
        .metric-card { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.85rem; }
        .metric-card--highlight { border-color: #7c3aed; }
        .metric-icon { font-size: 1.5rem; flex-shrink: 0; }
        .metric-value { font-size: 1.4rem; font-weight: 800; color: #e2e8f0; line-height: 1; }
        .metric-title { font-size: 0.78rem; color: #64748b; margin-top: 0.2rem; }
        .metric-sub { font-size: 0.7rem; color: #475569; margin-top: 0.1rem; }
        .chart-panel { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1.25rem; }
        .chart-empty { text-align: center; color: #64748b; font-size: 0.875rem; padding: 1.5rem; }
        .bar-chart { display: flex; flex-direction: column; gap: 0.55rem; }
        .bar-item { display: grid; grid-template-columns: 70px 1fr 60px; align-items: center; gap: 0.75rem; }
        .bar-label { font-size: 0.72rem; color: #94a3b8; text-align: right; white-space: nowrap; }
        .bar-track { background: #1e2535; border-radius: 4px; height: 8px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; min-width: 2px; }
        .bar-value { font-size: 0.72rem; color: #e2e8f0; font-weight: 600; text-align: right; }
        .actions-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .action-item { display: flex; align-items: flex-start; gap: 0.85rem; background: #161b27; border: 1px solid #1e2535; border-radius: 10px; padding: 1rem 1.25rem; }
        .action-item--warning { border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.04); }
        .action-item--info { border-color: rgba(96,165,250,0.3); background: rgba(96,165,250,0.04); }
        .action-icon { font-size: 1.2rem; flex-shrink: 0; margin-top: 0.1rem; }
        .action-title { font-size: 0.875rem; font-weight: 700; color: #e2e8f0; margin-bottom: 0.2rem; }
        .action-desc { font-size: 0.8rem; color: #64748b; line-height: 1.45; }
        .checklist-card { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .checklist-item { display: flex; align-items: baseline; gap: 0.75rem; font-size: 0.875rem; color: #94a3b8; line-height: 1.5; }
        .check-icon { color: #7c3aed; font-weight: 700; font-size: 0.82rem; flex-shrink: 0; width: 18px; }
        .checklist-item code { font-size: 0.78rem; background: rgba(255,255,255,0.06); padding: 0.1rem 0.35rem; border-radius: 4px; color: #c084fc; font-family: monospace; }
        .checklist-item strong { color: #e2e8f0; }
        .checklist-item a { color: #60a5fa; text-decoration: none; }
        .checklist-item a:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
