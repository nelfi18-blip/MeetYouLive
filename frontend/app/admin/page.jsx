"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return (n ?? 0).toLocaleString();
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon, href, accent, badge }) {
  const inner = (
    <div className={["sc", accent ? `sc--${accent}` : "", href ? "sc--link" : ""].filter(Boolean).join(" ")}>
      <div className="sc-head">
        <span className="sc-icon">{icon}</span>
        {badge != null && badge > 0 && (
          <span className="sc-badge">{badge > 99 ? "99+" : badge}</span>
        )}
      </div>
      <div className="sc-val">{value ?? "—"}</div>
      <div className="sc-title">{title}</div>
      {sub && <div className="sc-sub">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

// ── Alert Banner ──────────────────────────────────────────────────────────────

function AlertBanner({ icon, title, sub, href, color }) {
  return (
    <Link href={href} className={`alert-banner alert-banner--${color}`}>
      <span className="alert-icon">{icon}</span>
      <div className="alert-body">
        <div className="alert-title">{title}</div>
        {sub && <div className="alert-sub">{sub}</div>}
      </div>
      <span className="alert-arrow">→</span>
    </Link>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, accent, link, linkLabel }) {
  return (
    <div className="sh">
      <div className="sh-left">
        <span className={`sh-dot sh-dot--${accent || "purple"}`} />
        <span className="sh-icon">{icon}</span>
        <span className="sh-title">{title}</span>
      </div>
      {link && (
        <Link href={link} className="sh-link">{linkLabel || "Ver todo →"}</Link>
      )}
    </div>
  );
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────

function MiniBarChart({ data, valueKey = "total", labelKey = "label", color }) {
  if (!data?.length) return <p className="chart-empty">Sin datos recientes.</p>;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="mbchart">
      {data.map((item, i) => {
        const pct = ((item[valueKey] || 0) / max) * 100;
        return (
          <div key={i} className="mbc-item">
            <div className="mbc-bar-wrap">
              <div
                className="mbc-bar"
                style={{ height: `${Math.max(pct, 2)}%`, background: color || "var(--accent-purple)" }}
                title={`${item[labelKey]}: ${(item[valueKey] || 0).toLocaleString()}`}
              />
            </div>
            <div className="mbc-label">{item[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Top Table ─────────────────────────────────────────────────────────────────

function TopTable({ title, rows, valueLabel, linkHref }) {
  return (
    <div className="top-table">
      <div className="tt-header">
        <span className="tt-title">{title}</span>
        {linkHref && <Link href={linkHref} className="tt-link">Ver todo →</Link>}
      </div>
      {!rows?.length ? (
        <p className="tt-empty">Sin datos de hoy.</p>
      ) : (
        <div className="tt-rows">
          {rows.map((r, i) => (
            <div key={r._id || i} className="tt-row">
              <span className="tt-rank">#{i + 1}</span>
              <div className="tt-user">
                {r.user?.avatar ? (
                  <img src={r.user.avatar} alt="" className="tt-avatar" />
                ) : (
                  <div className="tt-avatar tt-avatar--ph">
                    {(r.user?.name || r.user?.username || "?")[0].toUpperCase()}
                  </div>
                )}
                <span className="tt-name">{r.user?.name || r.user?.username || "—"}</span>
              </div>
              <span className="tt-val">
                {(r.totalGifts ?? r.totalSpent ?? 0).toLocaleString()} 🪙
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Retention Badge ───────────────────────────────────────────────────────────

function RetentionCard({ label, value, sub }) {
  return (
    <div className="ret-card">
      <div className="ret-val">{fmt(value)}</div>
      <div className="ret-label">{label}</div>
      {sub && <div className="ret-sub">{sub}</div>}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        setAnalytics(d.analytics || null);
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
      <div className="dash-loading">
        <div className="dash-spinner" />
        <p>Cargando comando central…</p>
      </div>
    );
  }

  if (error) {
    return <div className="dash-error">{error}</div>;
  }

  const s = stats || {};
  const a = analytics || {};

  // Build critical alerts
  const alerts = [];
  if (s.pendingPayoutsCount > 0) {
    alerts.push({
      icon: "💸",
      color: "yellow",
      title: `${s.pendingPayoutsCount} retiro${s.pendingPayoutsCount > 1 ? "s" : ""} pendiente${s.pendingPayoutsCount > 1 ? "s" : ""}`,
      sub: `${fmt(s.pendingPayoutsCoins)} coins en espera`,
      href: "/admin/payouts?status=pending",
    });
  }
  if (s.pendingCreators > 0) {
    alerts.push({
      icon: "🎬",
      color: "blue",
      title: `${s.pendingCreators} solicitud${s.pendingCreators > 1 ? "es" : ""} de creador pendiente${s.pendingCreators > 1 ? "s" : ""}`,
      sub: "Revisar y aprobar o rechazar",
      href: "/admin/creators?status=pending",
    });
  }
  if (s.openReports > 0) {
    alerts.push({
      icon: "🚨",
      color: "red",
      title: `${s.openReports} reporte${s.openReports > 1 ? "s" : ""} abierto${s.openReports > 1 ? "s" : ""}`,
      sub: "Revisar denuncias de la plataforma",
      href: "/admin/reports",
    });
  }

  return (
    <div className="dash">
      {/* ── Page Header ── */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">
            <span className="dash-title-icon">⊞</span>
            Command Center
          </h1>
          <p className="dash-sub">Panel de control de negocio · MeetYouLive</p>
        </div>
        <button className="btn-refresh" onClick={loadData} disabled={loading}>
          ↺ Actualizar
        </button>
      </div>

      {/* ── Critical Alerts ── */}
      {alerts.length > 0 && (
        <section className="section">
          <SectionHeader icon="🔔" title="Alertas críticas" accent="red" />
          <div className="alerts-grid">
            {alerts.map((al, i) => (
              <AlertBanner key={i} {...al} />
            ))}
          </div>
        </section>
      )}

      {/* ── Financial Summary ── */}
      <section className="section">
        <SectionHeader icon="💰" title="Resumen financiero" accent="gold" link="/admin/transactions" linkLabel="Ver transacciones →" />
        <div className="grid grid-4">
          <StatCard icon="🪙" title="Coins comprados" value={fmt(s.totalCoinsPurchased)} sub="Acumulado total" accent="gold" href="/admin/transactions" />
          <StatCard icon="🎁" title="Coins en regalos" value={fmt(s.totalGiftsCoins)} sub={`${fmt(s.totalGiftsSent)} regalos enviados`} accent="purple" />
          <StatCard icon="🏦" title="Ingresos plataforma (est.)" value={fmt(s.platformEarningsEstimatedCoins)} sub="40% de coins en regalos" accent="green" href="/admin/revenue" />
          <StatCard icon="💳" title="Suscripciones activas" value={fmt(s.subscriptions)} sub="Premium" accent="blue" />
        </div>
        <div className="grid grid-4" style={{ marginTop: "0.75rem" }}>
          <StatCard icon="⏳" title="Retiros pendientes" value={fmt(s.pendingPayoutsCount)} sub={`${fmt(s.pendingPayoutsCoins)} coins`} accent="yellow" href="/admin/payouts?status=pending" badge={s.pendingPayoutsCount} />
          <StatCard icon="✅" title="Retiros aprobados" value={fmt(s.approvedPayoutsCount)} sub={`${fmt(s.approvedPayoutsCoins)} coins`} accent="blue" href="/admin/payouts?status=approved" />
          <StatCard icon="💚" title="Pagados (completados)" value={fmt(s.paidPayoutsCount)} sub={`${fmt(s.paidPayoutsCoins)} coins retirados`} accent="green" href="/admin/payouts?status=paid" />
          <StatCard icon="❌" title="Rechazados" value={fmt(s.rejectedPayoutsCount)} accent="red" href="/admin/payouts?status=rejected" />
        </div>
      </section>

      {/* ── Creator Operations ── */}
      <section className="section">
        <SectionHeader icon="🎬" title="Operaciones de creadores" accent="purple" link="/admin/creators" linkLabel="Gestionar creadores →" />
        <div className="grid grid-4">
          <StatCard icon="✅" title="Creadores aprobados" value={fmt(s.totalCreators)} accent="green" href="/admin/creators?status=approved" />
          <StatCard icon="⏳" title="Solicitudes pendientes" value={fmt(s.pendingCreators)} sub={s.pendingCreators > 0 ? "Acción requerida" : "Al día"} accent={s.pendingCreators > 0 ? "yellow" : undefined} href="/admin/creators?status=pending" badge={s.pendingCreators} />
          <StatCard icon="🚫" title="Creadores suspendidos" value={fmt(s.suspendedCreators)} accent={s.suspendedCreators > 0 ? "red" : undefined} href="/admin/creators?status=suspended" />
          <StatCard icon="📊" title="Total registros (7d)" value={fmt(s.recentRegistrations)} sub="Nuevos usuarios" accent="blue" />
        </div>

        {/* Top creators table */}
        <div className="tables-duo" style={{ marginTop: "1rem" }}>
          <TopTable
            title="🏆 Top creadores por regalos (24h)"
            rows={a.topCreators}
            linkHref="/admin/creators"
          />
          <TopTable
            title="💸 Top gastadores de coins (24h)"
            rows={a.topSpenders}
            linkHref="/admin/transactions"
          />
        </div>
      </section>

      {/* ── Live Operations ── */}
      <section className="section">
        <SectionHeader icon="📡" title="Operaciones de lives" accent="red" link="/admin/lives" linkLabel="Ver streams →" />
        <div className="grid grid-4">
          <StatCard icon="🔴" title="Streams activos ahora" value={fmt(s.activeLives)} sub={s.activeLives > 0 ? "En directo" : "Sin streams"} accent={s.activeLives > 0 ? "red" : undefined} href="/admin/lives" badge={s.activeLives} />
          <StatCard icon="📼" title="Lives totales" value={fmt(s.totalLives)} href="/admin/lives" />
          <StatCard icon="🎁" title="Regalos totales enviados" value={fmt(s.totalGiftsSent)} sub="Acumulado" accent="purple" />
          <StatCard icon="🚨" title="Reportes abiertos" value={fmt(s.openReports)} sub={s.openReports > 0 ? "Pendientes de revisión" : "Sin reportes"} accent={s.openReports > 0 ? "red" : undefined} href="/admin/reports" badge={s.openReports} />
        </div>
      </section>

      {/* ── Agency Performance ── */}
      <section className="section">
        <SectionHeader icon="🏢" title="Rendimiento de agencias" accent="blue" link="/admin/agencies" linkLabel="Gestionar agencias →" />
        <div className="grid grid-4">
          <StatCard icon="🏢" title="Agencias activas" value={fmt(s.activeAgencies)} accent="blue" href="/admin/agencies" />
          <StatCard icon="👥" title="Sub-creadores activos" value={fmt(s.activeAgencyLinks)} sub="Relaciones aprobadas" href="/admin/agencies" />
          <StatCard icon="💰" title="Comisiones totales" value={fmt(s.totalAgencyCommissionCoins)} sub="coins generados por agencias" accent="gold" />
          <StatCard icon="🔗" title="Total retiros solicitados" value={fmt(s.totalPayoutRequests)} sub="Historial completo" href="/admin/payouts" />
        </div>
      </section>

      {/* ── Growth Metrics ── */}
      <section className="section">
        <SectionHeader icon="📈" title="Métricas de crecimiento" accent="green" link="/admin/analytics" linkLabel="Ver analíticas →" />

        {/* Retention */}
        {a.retention && (
          <div className="ret-row">
            <RetentionCard label="DAU" value={a.retention.dau} sub="Activos hoy" />
            <RetentionCard label="WAU" value={a.retention.wau} sub="Activos 7d" />
            <RetentionCard label="MAU" value={a.retention.mau} sub="Activos 30d" />
            <RetentionCard label="Usuarios totales" value={s.totalUsers} sub="Registrados" />
          </div>
        )}

        {/* Charts row */}
        <div className="charts-row">
          <div className="chart-panel">
            <div className="chart-title">Registros diarios (7d)</div>
            <MiniBarChart
              data={a.dailyRegistrations}
              valueKey="count"
              labelKey="label"
              color="var(--accent-purple)"
            />
          </div>
          <div className="chart-panel">
            <div className="chart-title">Coins comprados por día (7d)</div>
            <MiniBarChart
              data={a.dailyPurchases}
              valueKey="total"
              labelKey="label"
              color="var(--accent-gold)"
            />
          </div>
        </div>
      </section>

      {/* ── Quick Links ── */}
      <section className="section">
        <SectionHeader icon="⚡" title="Accesos rápidos" accent="purple" />
        <div className="quick-grid">
          <Link href="/admin/users" className="qbtn">👥 Usuarios</Link>
          <Link href="/admin/creators?status=pending" className="qbtn qbtn--yellow">
            ⏳ Creadores pendientes{s.pendingCreators > 0 ? ` (${s.pendingCreators})` : ""}
          </Link>
          <Link href="/admin/payouts?status=pending" className="qbtn qbtn--yellow">
            💸 Retiros pendientes{s.pendingPayoutsCount > 0 ? ` (${s.pendingPayoutsCount})` : ""}
          </Link>
          <Link href="/admin/lives" className="qbtn qbtn--red">📡 Streams en vivo{s.activeLives > 0 ? ` (${s.activeLives})` : ""}</Link>
          <Link href="/admin/reports" className="qbtn qbtn--red">🚨 Reportes{s.openReports > 0 ? ` (${s.openReports})` : ""}</Link>
          <Link href="/admin/transactions" className="qbtn">💰 Transacciones</Link>
          <Link href="/admin/agencies" className="qbtn">🏢 Agencias</Link>
          <Link href="/admin/revenue" className="qbtn">📈 Ingresos</Link>
          <Link href="/admin/analytics" className="qbtn">📊 Analíticas</Link>
          <Link href="/admin/settings" className="qbtn">⚙️ Configuración</Link>
        </div>
      </section>

      <style jsx>{`
        :root {
          --accent-purple: #a78bfa;
          --accent-gold: #fbbf24;
          --accent-green: #34d399;
          --accent-blue: #60a5fa;
          --accent-red: #f87171;
          --bg-card: #161b27;
          --bg-card-hover: #1a1f2e;
          --border: #1e2535;
        }

        .dash { max-width: 1280px; }

        /* ── Header ── */
        .dash-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .dash-title {
          font-size: clamp(1.35rem, 3vw, 1.7rem);
          font-weight: 800;
          color: #e2e8f0;
          margin: 0 0 0.3rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .dash-title-icon {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .dash-sub {
          font-size: 0.8rem;
          color: #475569;
          margin: 0;
          letter-spacing: 0.03em;
        }

        .btn-refresh {
          background: rgba(124,58,237,0.1);
          border: 1px solid rgba(124,58,237,0.3);
          color: #a78bfa;
          border-radius: 8px;
          padding: 0.55rem 1.1rem;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .btn-refresh:hover:not(:disabled) { background: rgba(124,58,237,0.18); }
        .btn-refresh:disabled { opacity: 0.5; }

        /* ── Loading / Error ── */
        .dash-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 5rem 2rem;
          gap: 1rem;
          color: #475569;
        }

        .dash-spinner {
          width: 44px;
          height: 44px;
          border: 3px solid rgba(167,139,250,0.15);
          border-top-color: #a78bfa;
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .dash-error {
          padding: 2rem;
          text-align: center;
          color: #f87171;
          font-size: 0.9rem;
        }

        /* ── Sections ── */
        .section { margin-bottom: 2.25rem; }

        /* ── Section Header ── */
        .sh {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.9rem;
          gap: 0.5rem;
        }

        .sh-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .sh-dot {
          width: 4px;
          height: 18px;
          border-radius: 2px;
          flex-shrink: 0;
        }

        .sh-dot--purple { background: #7c3aed; }
        .sh-dot--gold { background: #f59e0b; }
        .sh-dot--green { background: #10b981; }
        .sh-dot--blue { background: #3b82f6; }
        .sh-dot--red { background: #ef4444; }

        .sh-icon { font-size: 1rem; }

        .sh-title {
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #94a3b8;
        }

        .sh-link {
          font-size: 0.75rem;
          font-weight: 600;
          color: #7c3aed;
          text-decoration: none;
          transition: color 0.15s;
        }

        .sh-link:hover { color: #a78bfa; }

        /* ── Alert Banners ── */
        .alerts-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.6rem;
        }

        @media (min-width: 640px) {
          .alerts-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
        }

        .alert-banner {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.85rem 1.1rem;
          border-radius: 12px;
          border: 1px solid transparent;
          text-decoration: none;
          transition: filter 0.2s, transform 0.2s;
          animation: fade-up 0.3s ease both;
        }

        .alert-banner:hover { filter: brightness(1.1); transform: translateY(-1px); }

        .alert-banner--yellow {
          background: rgba(251,191,36,0.08);
          border-color: rgba(251,191,36,0.3);
        }

        .alert-banner--blue {
          background: rgba(96,165,250,0.08);
          border-color: rgba(96,165,250,0.3);
        }

        .alert-banner--red {
          background: rgba(248,113,113,0.08);
          border-color: rgba(248,113,113,0.3);
        }

        .alert-icon { font-size: 1.6rem; flex-shrink: 0; }

        .alert-body { flex: 1; min-width: 0; }

        .alert-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: #e2e8f0;
        }

        .alert-sub {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 0.1rem;
        }

        .alert-banner--yellow .alert-title { color: #fbbf24; }
        .alert-banner--blue .alert-title { color: #60a5fa; }
        .alert-banner--red .alert-title { color: #f87171; }

        .alert-arrow {
          font-size: 1.1rem;
          color: #475569;
          flex-shrink: 0;
          transition: transform 0.2s;
        }

        .alert-banner:hover .alert-arrow { transform: translateX(3px); }

        /* ── Stat Cards ── */
        .grid {
          display: grid;
          gap: 0.85rem;
          grid-template-columns: 1fr;
        }

        @media (min-width: 480px) { .grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1024px) { .grid-4 { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 768px) and (max-width: 1023px) { .grid-4 { grid-template-columns: repeat(2, 1fr); } }

        .sc {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.1rem 1.15rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          transition: border-color 0.2s, transform 0.2s, background 0.2s;
          animation: fade-up 0.35s ease both;
          position: relative;
        }

        .sc--link:hover {
          border-color: rgba(124,58,237,0.45);
          background: var(--bg-card-hover);
          transform: translateY(-2px);
        }

        .sc--gold  { border-color: rgba(251,191,36,0.25); background: rgba(251,191,36,0.03); }
        .sc--purple{ border-color: rgba(167,139,250,0.25); background: rgba(167,139,250,0.03); }
        .sc--green { border-color: rgba(52,211,153,0.25); background: rgba(52,211,153,0.03); }
        .sc--blue  { border-color: rgba(96,165,250,0.25); background: rgba(96,165,250,0.03); }
        .sc--red   { border-color: rgba(248,113,113,0.25); background: rgba(248,113,113,0.03); }
        .sc--yellow{ border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.04); }

        .sc-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.4rem;
        }

        .sc-icon { font-size: 1.35rem; }

        .sc-badge {
          background: #ef4444;
          color: #fff;
          font-size: 0.65rem;
          font-weight: 700;
          border-radius: 999px;
          padding: 0.1rem 0.45rem;
          min-width: 20px;
          text-align: center;
          line-height: 1.6;
        }

        .sc-val {
          font-size: clamp(1.6rem, 3.5vw, 2rem);
          font-weight: 800;
          color: #e2e8f0;
          line-height: 1;
        }

        .sc-title {
          font-size: 0.75rem;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 0.15rem;
        }

        .sc-sub {
          font-size: 0.7rem;
          color: #475569;
          margin-top: 0.1rem;
        }

        /* ── Tables duo ── */
        .tables-duo {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.85rem;
        }

        @media (max-width: 700px) { .tables-duo { grid-template-columns: 1fr; } }

        .top-table {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem 1.1rem;
          animation: fade-up 0.4s ease both;
        }

        .tt-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .tt-title {
          font-size: 0.82rem;
          font-weight: 700;
          color: #e2e8f0;
        }

        .tt-link {
          font-size: 0.72rem;
          color: #7c3aed;
          text-decoration: none;
          font-weight: 600;
        }

        .tt-link:hover { color: #a78bfa; }

        .tt-empty {
          font-size: 0.8rem;
          color: #475569;
          text-align: center;
          padding: 1rem 0;
          margin: 0;
        }

        .tt-rows { display: flex; flex-direction: column; gap: 0.4rem; }

        .tt-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.35rem 0;
          border-bottom: 1px solid #131825;
        }

        .tt-row:last-child { border-bottom: none; }

        .tt-rank {
          font-size: 0.7rem;
          font-weight: 700;
          color: #475569;
          width: 22px;
          flex-shrink: 0;
        }

        .tt-user {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex: 1;
          min-width: 0;
        }

        .tt-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .tt-avatar--ph {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 700;
          color: #fff;
        }

        .tt-name {
          font-size: 0.8rem;
          color: #cbd5e1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tt-val {
          font-size: 0.78rem;
          font-weight: 600;
          color: #fbbf24;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* ── Retention ── */
        .ret-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        @media (max-width: 640px) { .ret-row { grid-template-columns: repeat(2, 1fr); } }

        .ret-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.85rem 0.9rem;
          text-align: center;
          animation: fade-up 0.35s ease both;
        }

        .ret-val {
          font-size: 1.5rem;
          font-weight: 800;
          color: #a78bfa;
        }

        .ret-label {
          font-size: 0.7rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-top: 0.2rem;
        }

        .ret-sub {
          font-size: 0.65rem;
          color: #475569;
          margin-top: 0.1rem;
        }

        /* ── Charts ── */
        .charts-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.85rem;
        }

        @media (max-width: 700px) { .charts-row { grid-template-columns: 1fr; } }

        .chart-panel {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem 1.1rem;
          animation: fade-up 0.4s ease both;
        }

        .chart-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 0.85rem;
        }

        .chart-empty {
          font-size: 0.8rem;
          color: #475569;
          text-align: center;
          padding: 1.5rem 0;
          margin: 0;
        }

        .mbchart {
          display: flex;
          align-items: flex-end;
          gap: 0.3rem;
          height: 80px;
        }

        .mbc-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          height: 100%;
          gap: 0.25rem;
        }

        .mbc-bar-wrap {
          flex: 1;
          width: 100%;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .mbc-bar {
          width: 100%;
          min-height: 2px;
          border-radius: 3px 3px 0 0;
          opacity: 0.85;
          transition: opacity 0.15s;
        }

        .mbc-bar:hover { opacity: 1; }

        .mbc-label {
          font-size: 0.55rem;
          color: #475569;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        /* ── Quick Links ── */
        .quick-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 0.5rem;
        }

        .qbtn {
          background: #1e2535;
          border: 1px solid var(--border);
          color: #94a3b8;
          border-radius: 10px;
          padding: 0.65rem 0.85rem;
          font-size: 0.82rem;
          font-weight: 600;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          text-align: center;
          min-height: 42px;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .qbtn:hover { background: #2d3748; color: #e2e8f0; }

        .qbtn--yellow {
          background: rgba(251,191,36,0.07);
          border-color: rgba(251,191,36,0.22);
          color: #fbbf24;
        }

        .qbtn--yellow:hover { background: rgba(251,191,36,0.14); }

        .qbtn--red {
          background: rgba(239,68,68,0.07);
          border-color: rgba(239,68,68,0.22);
          color: #f87171;
        }

        .qbtn--red:hover { background: rgba(239,68,68,0.14); }

        /* ── Animation ── */
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Mobile tweaks ── */
        @media (max-width: 767px) {
          .dash-header {
            flex-direction: column;
            align-items: flex-start;
            margin-bottom: 1.5rem;
          }

          .btn-refresh { width: 100%; text-align: center; }

          .quick-grid { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 400px) {
          .quick-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
