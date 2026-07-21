"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAdminToken, getToken } from "@/lib/token";
import { getPrimaryProfileImage } from "@/lib/imageHelpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const RECENT_ITEMS_LIMIT = 3;
const SKELETON_EXEC_CARDS = ["users", "revenue", "lives", "reports", "payouts"];
const SKELETON_ACTIVITY_CARDS = ["users", "creators", "purchases", "reports"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSafeNonAdminRedirect() {
  try {
    return getToken() ? "/feed" : "/login";
  } catch {
    return "/login";
  }
}

function fmt(n) {
  return (n ?? 0).toLocaleString();
}

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getDisplayName(user) {
  return user?.name || user?.username || user?.email || "—";
}

function getShortUserName(user, fallback = "Usuario") {
  const name = user?.name || user?.username;
  if (name) return name;
  if (user?.email) {
    const emailName = user.email.split("@")[0];
    return emailName || fallback;
  }
  return fallback;
}

function getSafeActivityAvatar(user) {
  const avatar = getPrimaryProfileImage(user);
  return avatar && (/^https?:\/\//i.test(avatar) || avatar.startsWith("/")) ? avatar : null;
}

function getStatusLabel(value, fallback = "Nuevo") {
  if (!value) return fallback;
  const normalized = String(value).toLowerCase();
  if (normalized === "approved") return "Aprobado";
  if (normalized === "pending") return "Pendiente";
  if (normalized === "open") return "Abierto";
  if (normalized === "closed") return "Cerrado";
  if (normalized === "purchase") return "Compra";
  if (normalized === "active") return "Activo";
  return value;
}

function getTodaySeriesValue(series, key = "total") {
  return series?.length ? series[series.length - 1]?.[key] ?? 0 : 0;
}

function getTodayRevenueSummary(series) {
  if (!series?.length) {
    return { value: "—", sub: "Sin compras" };
  }
  return {
    value: `${fmt(getTodaySeriesValue(series, "total"))} 🪙`,
    sub: "Hoy",
  };
}

function getRevenueChartTitle(series) {
  return series?.length ? `Ingresos (${series.length}d)` : "Ingresos";
}

function getRecentActivityItems(items = []) {
  return items.slice(0, RECENT_ITEMS_LIMIT);
}

function CountBadge({ value }) {
  if (value === null || value === undefined || value <= 0) return null;
  return <span className="sc-badge">{value > 99 ? "99+" : value}</span>;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon, href, accent, badge }) {
  const inner = (
    <div className={["sc", accent ? `sc--${accent}` : "", href ? "sc--link" : ""].filter(Boolean).join(" ")}>
      <div className="sc-head">
        <span className="sc-icon">{icon}</span>
        <CountBadge value={badge} />
      </div>
      <div className="sc-val">{value ?? "—"}</div>
      <div className="sc-title">{title}</div>
      {sub && <div className="sc-sub">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

// ── Executive Card ────────────────────────────────────────────────────────────

function ExecutiveCard({ title, value, sub, icon, href, accent, badge }) {
  const inner = (
    <div className={["exec-card", accent ? `exec-card--${accent}` : "", href ? "exec-card--link" : ""].filter(Boolean).join(" ")}>
      <div className="exec-top">
        <span className="exec-icon">{icon}</span>
        <CountBadge value={badge} />
      </div>
      <div className="exec-value">{value ?? "—"}</div>
      <div className="exec-title">{title}</div>
      {sub && <div className="exec-sub">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
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

// ── Collapsible Section ───────────────────────────────────────────────────────

function CollapsibleSection({ id, icon, title, accent, link, linkLabel, isOpen, onToggle, children }) {
  return (
    <section className={["collapse", isOpen ? "collapse--open" : ""].filter(Boolean).join(" ")}>
      <div className="collapse-summary">
        <button type="button" className="collapse-trigger" onClick={() => onToggle(id)} aria-expanded={isOpen} aria-label={`${isOpen ? "Cerrar" : "Abrir"} sección ${title}`}>
          <span className={`sh-dot sh-dot--${accent || "purple"}`} />
          <span className="sh-icon">{icon}</span>
          <span className="sh-title">{title}</span>
          <span className="collapse-chevron">⌄</span>
        </button>
        {link && <Link href={link} className="collapse-link">{linkLabel || "Ver todos →"}</Link>}
      </div>
      {isOpen && <div className="collapse-body">{children}</div>}
    </section>
  );
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────

function MiniBarChart({ data, valueKey = "total", labelKey = "label", color }) {
  if (!data?.length) return <p className="chart-empty">Sin datos recientes</p>;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="mbchart">
      {data.map((item, i) => {
        const value = item[valueKey] || 0;
        const pct = (value / max) * 100;
        return (
          <div key={i} className="mbc-item">
            <div className="mbc-bar-wrap">
              <div
                className="mbc-bar"
                style={{ height: `${Math.max(pct, 2)}%`, background: color || "var(--accent-purple)" }}
                title={`${item[labelKey]}: ${value.toLocaleString()}`}
              />
            </div>
            <div className="mbc-value">{value.toLocaleString()}</div>
            <div className="mbc-label">{item[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

function ChartPanel({ title, data, valueKey, color }) {
  return (
    <div className="chart-panel">
      <div className="chart-title">{title}</div>
      <MiniBarChart data={data} valueKey={valueKey} labelKey="label" color={color} />
    </div>
  );
}

// ── Top Table ─────────────────────────────────────────────────────────────────

function TopTable({ title, rows, valueLabel = "coins", linkHref }) {
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
                {(r.totalGifts ?? r.totalSpent ?? 0).toLocaleString()} {valueLabel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recent Activity ───────────────────────────────────────────────────────────

function ActivityList({ title, items, empty, renderItem, href, icon }) {
  const visibleItems = getRecentActivityItems(items);
  return (
    <div className="activity-card">
      <div className="activity-head">
        <span><span className="activity-head-icon">{icon}</span>{title}</span>
        {href && <Link href={href} className="tt-link">Ver todos →</Link>}
      </div>
      {!visibleItems.length ? (
        <div className="activity-empty">{empty || "Sin actividad reciente"}</div>
      ) : (
        <div className="activity-list">
          {visibleItems.map((item, i) => (
            <div className="activity-item" key={item._id || i}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityLine({ name, date, status, avatar, icon, accent }) {
  return (
    <>
      {avatar ? (
        <img src={avatar} alt={`Foto de perfil de ${name}`} className="activity-avatar" />
      ) : (
        <span className={["activity-avatar", "activity-avatar--ph", accent ? `activity-avatar--${accent}` : ""].filter(Boolean).join(" ")}>
          {icon || (name || "?")[0].toUpperCase()}
        </span>
      )}
      <div className="activity-copy">
        <div className="activity-primary">{name}</div>
        <div className="activity-secondary">{date}</div>
      </div>
      <span className={["activity-status", accent ? `activity-status--${accent}` : ""].filter(Boolean).join(" ")}>{status}</span>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dash">
      <div className="dash-header">
        <div>
          <div className="sk sk-title" />
          <div className="sk sk-line" />
        </div>
        <div className="sk sk-button" />
      </div>
      <div className="exec-grid">
        {SKELETON_EXEC_CARDS.map((key) => <div className="sk sk-card" key={key} />)}
      </div>
      <div className="activity-grid sk-gap">
        {SKELETON_ACTIVITY_CARDS.map((key) => <div className="sk sk-activity" key={key} />)}
      </div>
    </div>
  );
}

async function readOptionalJson(response, fallback, label) {
  if (!response.ok) {
    console.error(`[admin-dashboard] ${label} request failed`, response.status, response.statusText || "");
    return fallback;
  }
  return response.json();
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
  const [revenue, setRevenue] = useState(null);
  const [recent, setRecent] = useState({
    users: [],
    creators: [],
    purchases: [],
    reports: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState([]);
  const [isSingleAccordionMode, setIsSingleAccordionMode] = useState(false);
  const recentLoadedRef = useRef(false);

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadRecentData = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) return;
    try {
      const recentRequests = [
        ["users", `${API_URL}/api/admin/users?page=1&limit=${RECENT_ITEMS_LIMIT}`],
        ["creators", `${API_URL}/api/admin/creators?page=1&limit=${RECENT_ITEMS_LIMIT}`],
        ["purchases", `${API_URL}/api/admin/transactions?page=1&limit=${RECENT_ITEMS_LIMIT}&type=purchase`],
        ["reports", `${API_URL}/api/admin/reports?page=1&limit=${RECENT_ITEMS_LIMIT}`],
      ];
      const responses = await Promise.allSettled(
        recentRequests.map(([, url]) => fetch(url, { headers: authHeader(), cache: "no-store" }))
      );
      const [usersRes, creatorsRes, purchasesRes, reportsRes] = responses.map((result, index) => {
        if (result.status === "fulfilled") return result.value;
        console.error(`[admin-dashboard] ${recentRequests[index][0]} request failed`, result.reason);
        return { ok: false, status: 0 };
      });
      if (usersRes.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      const [usersData, creatorsData, purchasesData, historyLivesData, reportsData] = await Promise.all([
        readOptionalJson(usersRes, { users: [] }, "users"),
        readOptionalJson(creatorsRes, { creators: [] }, "creators"),
        readOptionalJson(purchasesRes, { transactions: [] }, "purchases"),
        readOptionalJson(reportsRes, { reports: [] }, "reports"),
      ]);
      setRecent({
        users: usersData.users || [],
        creators: creatorsData.creators || [],
        purchases: purchasesData.transactions || [],
        reports: reportsData.reports || [],
      });
      recentLoadedRef.current = true;
    } catch (err) {
      console.error("[admin-dashboard] recent activity failed", err);
      setRecent({ users: [], creators: [], purchases: [], reports: [] });
    }
  }, [authHeader, router]);

  const loadData = useCallback(async () => {
    recentLoadedRef.current = false;
    setLoading(true);
    setError("");
    const token = localStorage.getItem("admin_token");
    if (!token) {
      clearAdminToken();
      router.replace(getSafeNonAdminRedirect());
      return;
    }
    try {
      const [overviewRes, analyticsRes, revenueRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/overview`, { headers: authHeader(), cache: "no-store" }),
        fetch(`${API_URL}/api/admin/analytics`, { headers: authHeader(), cache: "no-store" }),
        fetch(`${API_URL}/api/admin/revenue`, { headers: authHeader(), cache: "no-store" }),
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
      if (revenueRes.ok) {
        const d = await revenueRes.json();
        setRevenue(d.revenue || null);
      } else {
        setRevenue(null);
      }
    } catch {
      setError("Error cargando datos del dashboard.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!loading && !error && !recentLoadedRef.current) loadRecentData();
  }, [error, loadRecentData, loading]);
  useEffect(() => {
    const updateViewport = () => setIsSingleAccordionMode(window.innerWidth < 768);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <div className="dash-error">{error}</div>;
  }

  const s = stats || {};
  const a = analytics || {};

  const dailyRevenueSeries = revenue?.coins?.dailyCoinRevenue || [];
  const todayRevenue = getTodayRevenueSummary(dailyRevenueSeries);
  const toggleSection = (id) => {
    setOpenSections((current) => {
      if (isSingleAccordionMode) return current.includes(id) ? [] : [id];
      return current.includes(id) ? current.filter((sectionId) => sectionId !== id) : [...current, id];
    });
  };

  return (
    <div className="dash">
      {/* ── Page Header ── */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">
            <span className="dash-title-icon">⊞</span>
            Command Center
          </h1>
          <p className="dash-sub">Dashboard administrativo · MeetYouLive</p>
        </div>
        <button className="btn-refresh" onClick={loadData} disabled={loading}>
          ↺ Actualizar
        </button>
      </div>

      {/* ── Executive Summary ── */}
      <section className="section section--tight">
        <SectionHeader icon="✦" title="Resumen Ejecutivo" accent="purple" />
        <div className="exec-grid">
          <ExecutiveCard icon="👥" title="Usuarios" value={fmt(s.totalUsers)} sub="Total" accent="purple" href="/admin/users" />
          <ExecutiveCard icon="💰" title="Ingresos" value={todayRevenue.value} sub={todayRevenue.sub} accent="gold" href="/admin/revenue" />
          <ExecutiveCard icon="🔴" title="Lives" value={fmt(s.activeLives)} sub={s.activeLives > 0 ? "En vivo" : "Sin streams"} accent={s.activeLives > 0 ? "red" : "blue"} href="/admin/lives" badge={s.activeLives} />
          <ExecutiveCard icon="🚨" title="Reportes" value={fmt(s.openReports)} sub={s.openReports > 0 ? "Pendiente" : "Al día"} accent={s.openReports > 0 ? "red" : "green"} href="/admin/reports" badge={s.openReports} />
          <ExecutiveCard icon="💸" title="Retiros" value={fmt(s.pendingPayoutsCount)} sub={s.pendingPayoutsCount > 0 ? `${fmt(s.pendingPayoutsCoins)} coins` : "Sin retiros"} accent={s.pendingPayoutsCount > 0 ? "yellow" : "green"} href="/admin/payouts?status=pending" badge={s.pendingPayoutsCount} />
        </div>
      </section>

      {/* ── Quick Links ── */}
      <section className="section section--tight">
        <SectionHeader icon="⚡" title="Acciones rápidas" accent="purple" />
        <div className="quick-grid">
          <Link href="/admin/reports" className={["qbtn", s.openReports > 0 ? "qbtn--red" : ""].filter(Boolean).join(" ")}>
            <span className="qbtn-icon">🚨</span><span>Reportes</span><CountBadge value={s.openReports} />
          </Link>
          <Link href="/admin/payouts?status=pending" className={["qbtn", s.pendingPayoutsCount > 0 ? "qbtn--yellow" : ""].filter(Boolean).join(" ")}>
            <span className="qbtn-icon">💸</span><span>Retiros</span><CountBadge value={s.pendingPayoutsCount} />
          </Link>
          <Link href="/admin/creators?status=pending" className={["qbtn", s.pendingCreators > 0 ? "qbtn--yellow" : ""].filter(Boolean).join(" ")}>
            <span className="qbtn-icon">🎬</span><span>Creadores</span><CountBadge value={s.pendingCreators} />
          </Link>
          <Link href="/admin/users" className="qbtn"><span className="qbtn-icon">👥</span><span>Usuarios</span></Link>
          <Link href="/admin/lives" className={["qbtn", s.activeLives > 0 ? "qbtn--red" : ""].filter(Boolean).join(" ")}>
            <span className="qbtn-icon">📡</span><span>Lives</span><CountBadge value={s.activeLives} />
          </Link>
          <Link href="/admin/transactions" className="qbtn"><span className="qbtn-icon">💰</span><span>Transacciones</span></Link>
        </div>
      </section>

      {/* ── Recent Activity ── */}
      <section className="section">
        <SectionHeader icon="⏱" title="Actividad reciente" accent="blue" />
        <div className="activity-grid">
          <ActivityList
            title="Nuevos usuarios"
            icon="👥"
            items={recent.users}
            href="/admin/users"
            renderItem={(user) => (
              <ActivityLine name={getShortUserName(user)} date={fmtDate(user.createdAt)} status={getStatusLabel(user.role, "Usuario")} avatar={getSafeActivityAvatar(user)} accent="purple" />
            )}
          />
          <ActivityList
            title="Nuevos creadores"
            icon="🎬"
            items={recent.creators}
            href="/admin/creators"
            renderItem={(creator) => (
              <ActivityLine name={getShortUserName(creator, "Creador")} date={fmtDate(creator.creatorApplication?.submittedAt || creator.createdAt)} status={getStatusLabel(creator.creatorStatus, "Creador")} avatar={getSafeActivityAvatar(creator)} accent="green" />
            )}
          />
          <ActivityList
            title="Compras recientes"
            icon="🪙"
            items={recent.purchases}
            href="/admin/transactions"
            renderItem={(tx) => (
              <ActivityLine name={getShortUserName(tx.userId)} date={fmtDate(tx.createdAt)} status={`${fmt(tx.amount)} coins`} avatar={getSafeActivityAvatar(tx.userId)} accent="gold" />
            )}
          />
          <ActivityList
            title="Reportes recientes"
            icon="🚨"
            items={recent.reports}
            href="/admin/reports"
            renderItem={(report) => (
              <ActivityLine name={report.reason || "Reporte"} date={fmtDate(report.createdAt)} status={getStatusLabel(report.status, "Abierto")} icon="!" accent="red" />
            )}
          />
        </div>
      </section>

      <div className="collapse-stack">
        <CollapsibleSection id="finance" icon="💰" title="Finanzas" accent="gold" link="/admin/transactions" linkLabel="Transacciones →" isOpen={openSections.includes("finance")} onToggle={toggleSection}>
          <div className="grid grid-4">
            <StatCard icon="🪙" title="Coins comprados" value={fmt(s.totalCoinsPurchased)} sub="Acumulado total" accent="gold" href="/admin/transactions" />
            <StatCard icon="🎁" title="Coins en regalos" value={fmt(s.totalGiftsCoins)} sub={`${fmt(s.totalGiftsSent)} regalos enviados`} accent="purple" />
            <StatCard icon="🏦" title="Ingresos plataforma (est.)" value={fmt(s.platformEarningsEstimatedCoins)} sub="40% de coins en regalos" accent="green" href="/admin/revenue" />
            <StatCard icon="💳" title="Suscripciones activas" value={fmt(s.subscriptions)} sub="Premium" accent="blue" />
          </div>
          <div className="grid grid-4 grid-spaced">
            <StatCard icon="⏳" title="Retiros pendientes" value={fmt(s.pendingPayoutsCount)} sub={`${fmt(s.pendingPayoutsCoins)} coins`} accent="yellow" href="/admin/payouts?status=pending" badge={s.pendingPayoutsCount} />
            <StatCard icon="✅" title="Retiros aprobados" value={fmt(s.approvedPayoutsCount)} sub={`${fmt(s.approvedPayoutsCoins)} coins`} accent="blue" href="/admin/payouts?status=approved" />
            <StatCard icon="💚" title="Pagados (completados)" value={fmt(s.paidPayoutsCount)} sub={`${fmt(s.paidPayoutsCoins)} coins retirados`} accent="green" href="/admin/payouts?status=paid" />
            <StatCard icon="❌" title="Rechazados" value={fmt(s.rejectedPayoutsCount)} accent="red" href="/admin/payouts?status=rejected" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="creators" icon="🎬" title="Creadores" accent="purple" link="/admin/creators" linkLabel="Gestionar →" isOpen={openSections.includes("creators")} onToggle={toggleSection}>
          <div className="grid grid-4">
            <StatCard icon="✅" title="Creadores aprobados" value={fmt(s.totalCreators)} accent="green" href="/admin/creators?status=approved" />
            <StatCard icon="⏳" title="Solicitudes pendientes" value={fmt(s.pendingCreators)} sub={s.pendingCreators > 0 ? "Acción requerida" : "Al día"} accent={s.pendingCreators > 0 ? "yellow" : undefined} href="/admin/creators?status=pending" badge={s.pendingCreators} />
            <StatCard icon="🚫" title="Creadores suspendidos" value={fmt(s.suspendedCreators)} accent={s.suspendedCreators > 0 ? "red" : undefined} href="/admin/creators?status=suspended" />
            <StatCard icon="📊" title="Total registros (7d)" value={fmt(s.recentRegistrations)} sub="Nuevos usuarios" accent="blue" />
          </div>
          <div className="tables-duo">
            <TopTable title="🏆 Top creadores por regalos (24h)" rows={a.topCreators} valueLabel="coins" linkHref="/admin/creators" />
            <TopTable title="💸 Top gastadores de coins (24h)" rows={a.topSpenders} valueLabel="coins" linkHref="/admin/transactions" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="lives" icon="📡" title="Lives" accent="red" link="/admin/lives" linkLabel="Ver streams →" isOpen={openSections.includes("lives")} onToggle={toggleSection}>
          <div className="grid grid-4">
            <StatCard icon="🔴" title="Streams activos ahora" value={fmt(s.activeLives)} sub={s.activeLives > 0 ? "En directo" : "Sin streams"} accent={s.activeLives > 0 ? "red" : undefined} href="/admin/lives" badge={s.activeLives} />
            <StatCard icon="📼" title="Lives totales" value={fmt(s.totalLives)} href="/admin/lives" />
            <StatCard icon="🎁" title="Regalos totales enviados" value={fmt(s.totalGiftsSent)} sub="Acumulado" accent="purple" />
            <StatCard icon="🚨" title="Reportes abiertos" value={fmt(s.openReports)} sub={s.openReports > 0 ? "Pendientes de revisión" : "Sin reportes"} accent={s.openReports > 0 ? "red" : undefined} href="/admin/reports" badge={s.openReports} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="moderation" icon="🛡️" title="Moderación" accent="red" link="/admin/reports" linkLabel="Reportes →" isOpen={openSections.includes("moderation")} onToggle={toggleSection}>
          <div className="grid grid-4">
            <StatCard icon="🚨" title="Reportes abiertos" value={fmt(s.openReports)} sub={s.openReports > 0 ? "Pendientes de revisión" : "Sin reportes"} accent={s.openReports > 0 ? "red" : "green"} href="/admin/reports" badge={s.openReports} />
            <StatCard icon="⏳" title="Creadores pendientes" value={fmt(s.pendingCreators)} sub="Solicitudes por revisar" accent={s.pendingCreators > 0 ? "yellow" : undefined} href="/admin/creators?status=pending" badge={s.pendingCreators} />
            <StatCard icon="🚫" title="Creadores suspendidos" value={fmt(s.suspendedCreators)} accent={s.suspendedCreators > 0 ? "red" : undefined} href="/admin/creators?status=suspended" />
            <StatCard icon="🔴" title="Streams activos" value={fmt(s.activeLives)} sub="Monitoreo en vivo" accent={s.activeLives > 0 ? "red" : undefined} href="/admin/lives" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="agencies" icon="🏢" title="Agencias" accent="blue" link="/admin/agencies" linkLabel="Gestionar →" isOpen={openSections.includes("agencies")} onToggle={toggleSection}>
          <div className="grid grid-4">
            <StatCard icon="🏢" title="Agencias activas" value={fmt(s.activeAgencies)} accent="blue" href="/admin/agencies" />
            <StatCard icon="👥" title="Sub-creadores activos" value={fmt(s.activeAgencyLinks)} sub="Relaciones aprobadas" href="/admin/agencies" />
            <StatCard icon="💰" title="Comisiones totales" value={fmt(s.totalAgencyCommissionCoins)} sub="coins generados por agencias" accent="gold" />
            <StatCard icon="🔗" title="Total retiros solicitados" value={fmt(s.totalPayoutRequests)} sub="Historial completo" href="/admin/payouts" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="analytics" icon="📊" title="Analíticas" accent="green" link="/admin/analytics" linkLabel="Ver analíticas →" isOpen={openSections.includes("analytics")} onToggle={toggleSection}>
          {a.retention && (
            <div className="ret-row">
              <RetentionCard label="DAU" value={a.retention.dau} sub="Hoy" />
              <RetentionCard label="WAU" value={a.retention.wau} sub="7d" />
              <RetentionCard label="MAU" value={a.retention.mau} sub="30d" />
              <RetentionCard label="Total" value={s.totalUsers} sub="Usuarios" />
            </div>
          )}
          <div className="charts-row">
            <ChartPanel title="Registros 7d" data={a.dailyRegistrations} valueKey="count" color="var(--accent-purple)" />
            <ChartPanel title="Coins 7d" data={a.dailyPurchases} valueKey="total" color="var(--accent-gold)" />
            <ChartPanel title={getRevenueChartTitle(dailyRevenueSeries)} data={dailyRevenueSeries} valueKey="total" color="var(--accent-green)" />
          </div>
        </CollapsibleSection>
      </div>

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
          --exec-card-min-height: 132px;
          --exec-card-min-height-mobile: 118px;
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
        .sk {
          border-radius: 14px;
          background: linear-gradient(90deg, rgba(30,37,53,0.72), rgba(51,65,85,0.72), rgba(30,37,53,0.72));
          background-size: 220% 100%;
          animation: shimmer 1.25s ease-in-out infinite;
        }

        .sk-title { width: 220px; height: 32px; margin-bottom: 0.55rem; }
        .sk-line { width: 170px; height: 12px; }
        .sk-button { width: 118px; height: 40px; }
        .sk-card { min-height: var(--exec-card-min-height); }
        .sk-gap { margin-top: 1.2rem; }
        .sk-activity { height: 136px; }
        @keyframes shimmer { to { background-position: -220% 0; } }

        .dash-error {
          padding: 2rem;
          text-align: center;
          color: #f87171;
          font-size: 0.9rem;
        }

        /* ── Sections ── */
        .section { margin-bottom: 2.25rem; }
        .section--tight { margin-bottom: 1.35rem; }

        /* ── Executive Summary ── */
        .exec-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }

        @media (min-width: 900px) {
          .exec-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        }

        .exec-card {
          min-height: var(--exec-card-min-height);
          border-radius: 18px;
          border: 1px solid rgba(124,58,237,0.2);
          background:
            radial-gradient(circle at top right, rgba(124,58,237,0.22), transparent 45%),
            linear-gradient(180deg, #171c2a, #111622);
          padding: 1rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 18px 50px rgba(0,0,0,0.18);
          transition: transform 0.2s, border-color 0.2s, filter 0.2s;
          animation: fade-up 0.35s ease both;
        }

        .exec-card--link:hover {
          transform: translateY(-2px);
          border-color: rgba(167,139,250,0.48);
          filter: brightness(1.06);
        }

        .exec-card--gold { border-color: rgba(251,191,36,0.28); background: radial-gradient(circle at top right, rgba(251,191,36,0.2), transparent 44%), linear-gradient(180deg, #171c2a, #111622); }
        .exec-card--green { border-color: rgba(52,211,153,0.28); background: radial-gradient(circle at top right, rgba(52,211,153,0.18), transparent 44%), linear-gradient(180deg, #171c2a, #111622); }
        .exec-card--blue { border-color: rgba(96,165,250,0.28); background: radial-gradient(circle at top right, rgba(96,165,250,0.18), transparent 44%), linear-gradient(180deg, #171c2a, #111622); }
        .exec-card--red { border-color: rgba(248,113,113,0.3); background: radial-gradient(circle at top right, rgba(248,113,113,0.18), transparent 44%), linear-gradient(180deg, #171c2a, #111622); }
        .exec-card--yellow { border-color: rgba(251,191,36,0.32); background: radial-gradient(circle at top right, rgba(251,191,36,0.18), transparent 44%), linear-gradient(180deg, #171c2a, #111622); }

        .exec-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .exec-icon { font-size: 1.55rem; }

        .exec-value {
          color: #f8fafc;
          font-size: clamp(1.8rem, 6vw, 2.45rem);
          font-weight: 900;
          letter-spacing: -0.05em;
          line-height: 0.95;
          margin-top: 0.7rem;
        }

        .exec-title {
          color: #cbd5e1;
          font-size: 0.76rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-top: 0.55rem;
        }

        .exec-sub {
          color: #64748b;
          font-size: 0.72rem;
          margin-top: 0.2rem;
        }

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

        /* ── Collapsible Groups ── */
        .collapse-stack {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 2.25rem;
        }

        .collapse {
          background: rgba(22,27,39,0.72);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          transition: border-color 0.2s, background 0.2s;
        }

        .collapse-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.8rem;
          padding: 0.4rem;
        }

        .collapse--open {
          border-color: rgba(167,139,250,0.32);
          background: rgba(22,27,39,0.9);
        }

        .collapse-trigger {
          flex: 1;
          min-width: 0;
          min-height: 48px;
          border: 0;
          background: transparent;
          color: inherit;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 0.7rem;
          cursor: pointer;
          font: inherit;
          text-align: left;
          border-radius: 12px;
          transition: background 0.15s;
        }

        .collapse-trigger:hover { background: rgba(124,58,237,0.06); }
        .collapse-trigger:focus {
          outline: 2px solid rgba(167,139,250,0.45);
          outline-offset: 2px;
        }
        .collapse-trigger:focus-visible {
          outline: 2px solid rgba(167,139,250,0.75);
          outline-offset: 2px;
        }

        .collapse-chevron {
          margin-left: auto;
          color: #64748b;
          font-weight: 800;
          transition: transform 0.2s, color 0.2s;
        }

        .collapse--open .collapse-chevron {
          transform: rotate(180deg);
          color: #a78bfa;
        }

        .collapse-link {
          color: #7c3aed;
          font-size: 0.72rem;
          font-weight: 700;
          text-decoration: none;
          padding: 0.7rem;
          white-space: nowrap;
        }

        .collapse-link:hover { color: #a78bfa; }

        .collapse-body {
          border-top: 1px solid #131825;
          padding: 1rem;
        }

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

        .grid-spaced { margin-top: 0.75rem; }

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

        .collapse-body .tables-duo { margin-top: 0.85rem; }

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

        /* ── Activity ── */
        .activity-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.65rem;
        }

        @media (min-width: 760px) {
          .activity-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (min-width: 1180px) {
          .activity-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }

        .activity-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 0.9rem;
          min-width: 0;
        }

        .activity-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
          color: #e2e8f0;
          font-size: 0.78rem;
          font-weight: 800;
          margin-bottom: 0.65rem;
        }

        .activity-head-icon {
          margin-right: 0.35rem;
        }

        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .activity-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
        }

        .activity-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .activity-avatar--ph {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(167,139,250,0.18);
          color: #ddd6fe;
          font-size: 0.72rem;
          font-weight: 900;
          box-shadow: 0 0 0 4px rgba(167,139,250,0.06);
        }

        .activity-avatar--gold { background: rgba(251,191,36,0.18); color: #fde68a; box-shadow: 0 0 0 4px rgba(251,191,36,0.06); }
        .activity-avatar--green { background: rgba(52,211,153,0.18); color: #a7f3d0; box-shadow: 0 0 0 4px rgba(52,211,153,0.06); }
        .activity-avatar--blue { background: rgba(96,165,250,0.18); color: #bfdbfe; box-shadow: 0 0 0 4px rgba(96,165,250,0.06); }
        .activity-avatar--red { background: rgba(248,113,113,0.18); color: #fecaca; box-shadow: 0 0 0 4px rgba(248,113,113,0.06); }

        .activity-copy {
          flex: 1;
          min-width: 0;
        }

        .activity-primary {
          color: #cbd5e1;
          font-size: 0.78rem;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .activity-secondary {
          color: #64748b;
          font-size: 0.68rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 0.05rem;
        }

        .activity-status {
          color: #a78bfa;
          background: rgba(167,139,250,0.08);
          border: 1px solid rgba(167,139,250,0.16);
          border-radius: 999px;
          padding: 0.18rem 0.42rem;
          font-size: 0.64rem;
          font-weight: 800;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .activity-status--gold { color: #fbbf24; background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.18); }
        .activity-status--green { color: #34d399; background: rgba(52,211,153,0.08); border-color: rgba(52,211,153,0.18); }
        .activity-status--blue { color: #60a5fa; background: rgba(96,165,250,0.08); border-color: rgba(96,165,250,0.18); }
        .activity-status--red { color: #f87171; background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.18); }

        .activity-empty {
          color: #475569;
          font-size: 0.76rem;
          border: 1px dashed rgba(100,116,139,0.28);
          border-radius: 12px;
          padding: 0.8rem;
          text-align: center;
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
        }

        @media (max-width: 760px) { .charts-row { grid-template-columns: 1fr; } }

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
          height: 96px;
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

        .mbc-value {
          font-size: 0.58rem;
          font-weight: 800;
          color: #94a3b8;
          line-height: 1;
        }

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
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.65rem;
        }

        @media (min-width: 760px) {
          .quick-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }

        .qbtn {
          background:
            radial-gradient(circle at top right, rgba(124,58,237,0.14), transparent 46%),
            #1e2535;
          border: 1px solid var(--border);
          color: #cbd5e1;
          border-radius: 16px;
          padding: 0.8rem 0.85rem;
          font-size: 0.82rem;
          font-weight: 800;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 0.45rem;
          text-align: left;
          min-height: 58px;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .qbtn:hover { background: #2d3748; color: #e2e8f0; }

        .qbtn-icon {
          width: 30px;
          height: 30px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(167,139,250,0.12);
          flex-shrink: 0;
        }

        .qbtn .sc-badge {
          margin-left: auto;
          flex-shrink: 0;
        }

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
          .dash { max-width: 100%; }

          .dash-header {
            align-items: center;
            margin-bottom: 1rem;
          }

          .dash-title { font-size: 1.25rem; }
          .dash-sub { font-size: 0.72rem; }

          .btn-refresh {
            min-height: 42px;
            padding: 0.45rem 0.75rem;
          }

          .section { margin-bottom: 1.25rem; }
          .section--tight { margin-bottom: 1rem; }

          .exec-grid { gap: 0.6rem; }

          .exec-card {
            min-height: var(--exec-card-min-height-mobile);
            padding: 0.8rem;
            border-radius: 16px;
          }

          .exec-icon { font-size: 1.3rem; }
          .exec-value { font-size: clamp(1.55rem, 8vw, 2rem); margin-top: 0.45rem; }
          .exec-title { font-size: 0.68rem; margin-top: 0.42rem; }
          .exec-sub { font-size: 0.66rem; }

          .activity-card { padding: 0.8rem; }
          .collapse-stack { gap: 0.6rem; margin-bottom: 1rem; }
          .collapse-body { padding: 0.75rem; }
          .grid { gap: 0.65rem; }
          .charts-row { gap: 0.65rem; }
          .ret-row { gap: 0.6rem; margin-bottom: 0.75rem; }
        }

        @media (max-width: 400px) {
          .quick-grid { gap: 0.55rem; }
          .qbtn { padding: 0.7rem; min-height: 54px; font-size: 0.78rem; }
          .qbtn-icon { width: 28px; height: 28px; }
        }
      `}</style>
    </div>
  );
}
