"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAdminToken, getToken } from "@/lib/token";
import { getPrimaryProfileImage } from "@/lib/imageHelpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_ORIGIN = API_URL ? new URL(API_URL).origin : "";
const RECENT_ITEMS_LIMIT = 5;
const TIMELINE_ITEMS_LIMIT = 8;
const SKELETON_EXEC_CARDS = ["users", "revenue", "lives", "reports", "payouts", "creators"];

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

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

function fmtTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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
  if (!avatar) return null;
  if (avatar.startsWith("/")) return avatar;
  try {
    const url = new URL(avatar);
    return API_ORIGIN && url.origin === API_ORIGIN ? url.toString() : null;
  } catch {
    return null;
  }
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

function sumSeries(series, key = "total") {
  return (series || []).reduce((sum, item) => sum + (item?.[key] || 0), 0);
}

function CountBadge({ value }) {
  if (value === null || value === undefined || value <= 0) return null;
  return <span className="sc-badge">{value > 99 ? "99+" : value}</span>;
}

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

function ExecutiveCard({ title, value, sub, icon, href, accent, badge }) {
  const inner = (
    <div className={cn("exec-card", accent && `exec-card--${accent}`, href && "exec-card--link")}>
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

function QuickAction({ href, icon, label, description, tone }) {
  return (
    <Link href={href} className={cn("qbtn", tone && `qbtn--${tone}`)}>
      <span className="qbtn-icon">{icon}</span>
      <span className="qbtn-copy">
        <span className="qbtn-label">{label}</span>
        {description && <span className="qbtn-description">{description}</span>}
      </span>
      <span className="qbtn-arrow">→</span>
    </Link>
  );
}

function buildTimelineItems(recent) {
  const creatorIds = new Set((recent.creators || []).map((creator) => String(creator._id)).filter(Boolean));
  const items = [];

  for (const user of recent.users || []) {
    // Creators already appear as creator events, so skip matching user rows in the unified timeline
    // and avoid showing the same person twice when both endpoints return them.
    if (creatorIds.has(String(user._id))) continue;
    items.push({
      id: `user-${user._id}`,
      date: user.createdAt,
      icon: "👤",
      accent: "neutral",
      avatar: getSafeActivityAvatar(user),
      actor: getShortUserName(user),
      action: "Creó una cuenta.",
      href: "/admin/users",
    });
  }

  for (const creator of recent.creators || []) {
    const status = String(creator.creatorStatus || "").toLowerCase();
    items.push({
      id: `creator-${creator._id}`,
      date: creator.creatorApplication?.submittedAt || creator.createdAt,
      icon: status === "approved" ? "⭐" : "🎬",
      accent: status === "approved" ? "green" : "yellow",
      avatar: getSafeActivityAvatar(creator),
      actor: getShortUserName(creator, "Creador"),
      action: status === "approved" ? "Creador aprobado." : "Solicitó revisión.",
      href: "/admin/creators",
    });
  }

  for (const tx of recent.purchases || []) {
    items.push({
      id: `purchase-${tx._id}`,
      date: tx.createdAt,
      icon: "🪙",
      accent: "green",
      avatar: getSafeActivityAvatar(tx.userId),
      actor: getShortUserName(tx.userId),
      action: "Compró Coins.",
      meta: `${fmt(tx.amount)} coins`,
      href: "/admin/transactions",
    });
  }

  for (const report of recent.reports || []) {
    items.push({
      id: `report-${report._id}`,
      date: report.createdAt,
      icon: "🚨",
      accent: "red",
      actor: "Moderación",
      action: report.reason ? `Reporte recibido: ${report.reason}. Requiere revisión.` : "Reporte recibido. Requiere revisión.",
      href: "/admin/reports",
    });
  }

  return items
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, TIMELINE_ITEMS_LIMIT);
}

function formatTimelineMeta(item) {
  return [fmtDate(item.date), fmtTime(item.date), item.meta].filter(Boolean).join(" • ");
}

function Timeline({ items }) {
  if (!items.length) {
    return <div className="timeline-empty">No hay actividad reciente.</div>;
  }

  return (
    <div className="timeline">
      {items.map((item) => {
        const content = (
          <>
            {item.avatar ? (
              <img src={item.avatar} alt="" className="timeline-avatar" />
            ) : (
              <span className={cn("timeline-avatar", "timeline-avatar--ph", `timeline-avatar--${item.accent}`)}>{item.icon}</span>
            )}
            <span className="timeline-dot" />
            <span className="timeline-copy">
              <span className="timeline-actor">{item.actor}</span>
              <span className="timeline-action">{item.action}</span>
              <span className="timeline-date">{formatTimelineMeta(item)}</span>
            </span>
          </>
        );
        return item.href ? (
          <Link href={item.href} className="timeline-item" key={item.id}>{content}</Link>
        ) : (
          <div className="timeline-item" key={item.id}>{content}</div>
        );
      })}
    </div>
  );
}

function AnalyticsCard({ icon, label, value, sub }) {
  return (
    <div className="analytics-card">
      <span className="analytics-icon">{icon}</span>
      <span className="analytics-value">{value}</span>
      <span className="analytics-label">{label}</span>
      {sub && <span className="analytics-sub">{sub}</span>}
    </div>
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
      <div className="sk sk-panel" />
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
  const recentLoadedRef = useRef(false);

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    const authScheme = "Bearer";
    return { Authorization: `${authScheme} ${token}` };
  }, []);

  const loadRecentData = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) return;
    try {
      const recentRequests = [
        { label: "users", url: `${API_URL}/api/admin/users?page=1&limit=${RECENT_ITEMS_LIMIT}` },
        { label: "creators", url: `${API_URL}/api/admin/creators?page=1&limit=${RECENT_ITEMS_LIMIT}` },
        { label: "purchases", url: `${API_URL}/api/admin/transactions?page=1&limit=${RECENT_ITEMS_LIMIT}&type=purchase` },
        { label: "reports", url: `${API_URL}/api/admin/reports?page=1&limit=${RECENT_ITEMS_LIMIT}` },
      ];
      const responses = await Promise.allSettled(
        recentRequests.map(({ url }) => fetch(url, { headers: authHeader(), cache: "no-store" }))
      );
      const [usersRes, creatorsRes, purchasesRes, reportsRes] = responses.map((result, index) => {
        if (result.status === "fulfilled") return result.value;
        console.error(`[admin-dashboard] ${recentRequests[index].label} request failed`, result.reason);
        return { ok: false, status: 0 };
      });
      if (usersRes.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      const [usersData, creatorsData, purchasesData, reportsData] = await Promise.all([
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

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <div className="dash-error">{error}</div>;
  }

  const s = stats || {};
  const a = analytics || {};
  const dailyRevenueSeries = revenue?.coins?.dailyCoinRevenue || [];
  const last7RevenueSeries = dailyRevenueSeries.slice(-7);
  const todayRevenue = getTodayRevenueSummary(dailyRevenueSeries);
  const timelineItems = buildTimelineItems(recent);
  const registrations7d = sumSeries(a.dailyRegistrations, "count");
  const revenue7d = sumSeries(last7RevenueSeries, "total");

  return (
    <div className="dash">
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

      <section className="section section--hero">
        <SectionHeader icon="✦" title="Resumen Ejecutivo" accent="purple" />
        <div className="exec-grid">
          <ExecutiveCard icon="👥" title="Usuarios" value={fmt(s.totalUsers)} sub="Usuarios registrados en la plataforma" accent="neutral" href="/admin/users" />
          <ExecutiveCard icon="💰" title="Ingresos" value={todayRevenue.value} sub={`Ingresos ${todayRevenue.sub.toLowerCase()}`} accent={getTodaySeriesValue(dailyRevenueSeries, "total") > 0 ? "green" : "neutral"} href="/admin/revenue" />
          <ExecutiveCard icon="🔴" title="Lives" value={fmt(s.activeLives)} sub={s.activeLives > 0 ? "Streams activos ahora" : "Sin streams activos"} accent={s.activeLives > 0 ? "red" : "neutral"} href="/admin/lives" badge={s.activeLives} />
          <ExecutiveCard icon="🚨" title="Reportes" value={fmt(s.openReports)} sub={s.openReports > 0 ? "Pendientes de revisión" : "Moderación al día"} accent={s.openReports > 0 ? "red" : "green"} href="/admin/reports" badge={s.openReports} />
        </div>
      </section>

      <section className="section section--tight">
        <SectionHeader icon="⚡" title="Acciones rápidas" accent="purple" />
        <div className="quick-grid">
          <QuickAction href="/admin/users" icon="👥" label="Usuarios" description="Gestionar cuentas" />
          <QuickAction href="/admin/creators" icon="⭐" label="Creadores" description="Aprobar perfiles" />
          <QuickAction href="/admin/lives" icon="🔴" label="Lives" description="Ver streams" tone={s.activeLives > 0 ? "red" : undefined} />
          <QuickAction href="/admin/reports" icon="🚨" label="Reportes" description="Moderar contenido" tone={s.openReports > 0 ? "red" : undefined} />
          <QuickAction href="/admin/transactions" icon="💰" label="Transacciones" description="Auditar ingresos" />
          <QuickAction href="/admin/payouts?status=pending" icon="💸" label="Retiros" description="Revisar pagos" tone={s.pendingPayoutsCount > 0 ? "yellow" : undefined} />
          <QuickAction href="/admin/settings" icon="⚙️" label="Configuración" description="Ajustes internos" />
        </div>
      </section>

      <section className="section section--tight">
        <SectionHeader icon="⏱" title="Actividad reciente" accent="blue" />
        <Timeline items={timelineItems} />
      </section>

      <section className="section section--analytics">
        <SectionHeader icon="📊" title="Analíticas" accent="green" link="/admin/analytics" linkLabel="Ver analíticas →" />
        <div className="analytics-grid">
          <AnalyticsCard icon="👥" label="Usuarios últimos 7 días" value={fmt(registrations7d)} sub="Nuevos registros" />
          <AnalyticsCard icon="💰" label="Ingresos últimos 7 días" value={fmt(revenue7d)} sub="Coins últimos 7 días" />
          <AnalyticsCard icon="🪙" label="Coins vendidos" value={fmt(s.totalCoinsPurchased)} sub="Acumulado" />
          <AnalyticsCard icon="📡" label="Lives realizados" value={fmt(s.totalLives)} sub="Histórico" />
        </div>
      </section>

      <style jsx>{`
        :root {
          --accent-purple: #a78bfa;
          --accent-purple-rgb: 167,139,250;
          --accent-gold: #fbbf24;
          --accent-green: #34d399;
          --accent-blue: #60a5fa;
          --accent-red: #f87171;
          --accent-yellow: #fbbf24;
          --bg-card: #161b27;
          --bg-card-hover: #1a2030;
          --border: #1e2535;
          --exec-card-min-height: 172px;
          --exec-card-min-height-mobile: 148px;
        }

        .dash {
          max-width: 1180px;
          margin: 0 auto;
          padding-bottom: 1.5rem;
        }

        .dash-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.7rem;
        }

        .dash-title {
          font-size: clamp(1.55rem, 3vw, 2.15rem);
          font-weight: 900;
          color: #f8fafc;
          margin: 0 0 0.3rem;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          letter-spacing: -0.04em;
        }

        .dash-title-icon {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .dash-sub {
          font-size: 0.8rem;
          color: #64748b;
          margin: 0;
          letter-spacing: 0.03em;
        }

        .btn-refresh {
          background: rgba(124,58,237,0.1);
          border: 1px solid rgba(124,58,237,0.3);
          color: #c4b5fd;
          border-radius: 999px;
          min-height: 42px;
          padding: 0.55rem 1.1rem;
          font-size: 0.82rem;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, transform 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .btn-refresh:hover:not(:disabled) { background: rgba(124,58,237,0.18); transform: translateY(-1px); }
        .btn-refresh:disabled { opacity: 0.5; }

        .sk {
          border-radius: 18px;
          background: linear-gradient(90deg, rgba(30,37,53,0.72), rgba(51,65,85,0.72), rgba(30,37,53,0.72));
          background-size: 220% 100%;
          animation: shimmer 1.25s ease-in-out infinite;
        }

        .sk-title { width: 220px; height: 32px; margin-bottom: 0.55rem; }
        .sk-line { width: 170px; height: 12px; }
        .sk-button { width: 118px; height: 40px; }
        .sk-card { min-height: var(--exec-card-min-height); }
        .sk-panel { height: 190px; margin-top: 1rem; }
        @keyframes shimmer { to { background-position: -220% 0; } }

        .dash-error {
          padding: 2rem;
          text-align: center;
          color: #f87171;
          font-size: 0.9rem;
        }

        .section { margin-bottom: 1.75rem; }
        .section--hero { margin-bottom: 1.55rem; }
        .section--tight { margin-bottom: 1.55rem; }
        .section--analytics { margin: 1.9rem 0 1rem; }

        .sh {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
          gap: 0.75rem;
        }

        .sh-left { display: flex; align-items: center; gap: 0.62rem; min-width: 0; }
        .sh-dot { width: 4px; height: 18px; border-radius: 2px; flex-shrink: 0; }
        .sh-dot--purple { background: #7c3aed; }
        .sh-dot--gold { background: #f59e0b; }
        .sh-dot--green { background: #10b981; }
        .sh-dot--blue { background: #3b82f6; }
        .sh-dot--red { background: #ef4444; }
        .sh-icon {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(148,163,184,0.1);
          font-size: 0.95rem;
          flex-shrink: 0;
        }
        .sh-title {
          font-size: 0.78rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #94a3b8;
        }
        .sh-link {
          font-size: 0.75rem;
          font-weight: 700;
          color: #8b5cf6;
          text-decoration: none;
          transition: color 0.15s;
        }
        .sh-link:hover { color: #c4b5fd; }

        .exec-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        @media (min-width: 900px) {
          .exec-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }

        .exec-card {
          min-height: var(--exec-card-min-height);
          border-radius: 24px;
          border: 1px solid rgba(148,163,184,0.16);
          background: linear-gradient(180deg, #171c2a, #111622);
          padding: 1.18rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 20px 55px rgba(0,0,0,0.2);
          transition: transform 0.2s, border-color 0.2s, filter 0.2s;
          animation: fade-up 0.35s ease both;
        }

        .exec-card--link:hover { transform: translateY(-2px); border-color: rgba(167,139,250,0.46); filter: brightness(1.06); }
        .exec-card--neutral { background: radial-gradient(circle at top right, rgba(148,163,184,0.12), transparent 42%), linear-gradient(180deg, #171c2a, #111622); }
        .exec-card--green { border-color: rgba(52,211,153,0.32); background: radial-gradient(circle at top right, rgba(52,211,153,0.18), transparent 44%), linear-gradient(180deg, #171c2a, #111622); }
        .exec-card--red { border-color: rgba(248,113,113,0.34); background: radial-gradient(circle at top right, rgba(248,113,113,0.18), transparent 44%), linear-gradient(180deg, #171c2a, #111622); }
        .exec-card--yellow { border-color: rgba(251,191,36,0.34); background: radial-gradient(circle at top right, rgba(251,191,36,0.18), transparent 44%), linear-gradient(180deg, #171c2a, #111622); }

        .exec-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; }
        .exec-icon {
          width: 42px;
          height: 42px;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(248,250,252,0.08);
          font-size: 1.35rem;
          line-height: 1;
          flex-shrink: 0;
        }
        .exec-value {
          color: #f8fafc;
          font-size: clamp(2.2rem, 6vw, 3.25rem);
          font-weight: 950;
          letter-spacing: -0.06em;
          line-height: 0.95;
          margin-top: 1.05rem;
          word-break: break-word;
        }
        .exec-title {
          color: #cbd5e1;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-top: 0.72rem;
        }
        .exec-sub {
          color: #64748b;
          font-size: 0.72rem;
          line-height: 1.45;
          margin-top: 0.32rem;
        }
        .sc-badge {
          background: #ef4444;
          color: #fff;
          font-size: 0.65rem;
          font-weight: 800;
          border-radius: 999px;
          padding: 0.1rem 0.45rem;
          min-width: 20px;
          text-align: center;
          line-height: 1.6;
        }

        .quick-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
        }

        @media (min-width: 820px) {
          .quick-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }

        @media (min-width: 1180px) {
          .quick-grid { grid-template-columns: repeat(7, minmax(0, 1fr)); }
        }

        .qbtn {
          background: linear-gradient(180deg, #171d2b, #131824);
          border: 1px solid rgba(148,163,184,0.14);
          color: #cbd5e1;
          border-radius: 20px;
          padding: 0.95rem;
          font-size: 0.86rem;
          font-weight: 900;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.72rem;
          min-height: 82px;
          transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.15s;
        }

        .qbtn:hover {
          background: var(--bg-card-hover);
          border-color: rgba(167,139,250,0.32);
          color: #f8fafc;
          transform: translateY(-1px);
        }
        .qbtn-icon {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(148,163,184,0.1);
          flex-shrink: 0;
          line-height: 1;
          font-size: 1.05rem;
        }
        .qbtn-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .qbtn-label {
          color: #e2e8f0;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .qbtn-description {
          color: #64748b;
          font-size: 0.68rem;
          font-weight: 700;
          line-height: 1.25;
        }
        .qbtn-arrow { margin-left: auto; color: #64748b; }
        .qbtn--yellow { background: rgba(251,191,36,0.07); border-color: rgba(251,191,36,0.24); color: #fbbf24; }
        .qbtn--yellow:hover { background: rgba(251,191,36,0.14); }
        .qbtn--red { background: rgba(239,68,68,0.07); border-color: rgba(239,68,68,0.24); color: #f87171; }
        .qbtn--red:hover { background: rgba(239,68,68,0.14); }

        .timeline {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }

        .timeline-item {
          display: grid;
          grid-template-columns: 42px 10px minmax(0, 1fr);
          align-items: center;
          gap: 0.78rem;
          border: 1px solid rgba(148,163,184,0.12);
          border-radius: 18px;
          padding: 0.85rem;
          min-height: 78px;
          background: rgba(22,27,39,0.72);
          text-decoration: none;
          color: inherit;
          transition: background 0.15s, border-color 0.15s, transform 0.15s;
        }
        .timeline-item:hover {
          background: rgba(26,32,48,0.96);
          border-color: rgba(167,139,250,0.26);
          transform: translateY(-1px);
        }
        .timeline-avatar {
          width: 42px;
          height: 42px;
          border-radius: 16px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .timeline-avatar--ph {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(148,163,184,0.12);
          color: #cbd5e1;
          font-size: 1rem;
          font-weight: 900;
        }
        .timeline-avatar--green { background: rgba(52,211,153,0.15); color: #a7f3d0; }
        .timeline-avatar--yellow { background: rgba(251,191,36,0.15); color: #fde68a; }
        .timeline-avatar--red { background: rgba(248,113,113,0.16); color: #fecaca; }
        .timeline-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #475569;
          box-shadow: 0 0 0 4px rgba(71,85,105,0.12);
        }
        .timeline-copy { min-width: 0; display: flex; flex-direction: column; gap: 0.22rem; }
        .timeline-actor {
          color: #e2e8f0;
          font-size: 0.9rem;
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .timeline-action {
          color: #94a3b8;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .timeline-date {
          color: #64748b;
          font-size: 0.7rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .timeline-empty {
          color: #64748b;
          font-size: 0.84rem;
          border: 1px dashed rgba(100,116,139,0.32);
          border-radius: 18px;
          padding: 1.2rem;
          text-align: center;
          background: rgba(22,27,39,0.52);
        }

        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
        }
        @media (min-width: 900px) {
          .analytics-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        .analytics-card {
          background: linear-gradient(180deg, #151a27, #111622);
          border: 1px solid rgba(148,163,184,0.14);
          border-radius: 20px;
          padding: 1.08rem;
          min-height: 142px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .analytics-icon {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(52,211,153,0.1);
          font-size: 1.1rem;
          line-height: 1;
        }
        .analytics-value {
          color: #f8fafc;
          font-size: clamp(1.9rem, 4vw, 2.45rem);
          font-weight: 950;
          letter-spacing: -0.05em;
          line-height: 1;
          margin-top: 0.75rem;
        }
        .analytics-label {
          color: #94a3b8;
          font-size: 0.72rem;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-top: 0.55rem;
        }
        .analytics-sub {
          color: #475569;
          font-size: 0.68rem;
          line-height: 1.35;
          margin-top: 0.2rem;
        }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 767px) {
          .dash { max-width: 100%; }
          .dash-header { align-items: center; margin-bottom: 1.15rem; gap: 0.75rem; }
          .dash-title { font-size: 1.35rem; }
          .dash-sub { font-size: 0.72rem; }
          .btn-refresh { min-height: 42px; padding: 0.45rem 0.72rem; }
          .section { margin-bottom: 1.35rem; }
          .section--analytics { margin-top: 1.6rem; }
          .sh { margin-bottom: 0.78rem; }
          .sh-icon { width: 26px; height: 26px; border-radius: 9px; }
          .exec-grid { gap: 0.72rem; }
          .exec-card { min-height: var(--exec-card-min-height-mobile); padding: 0.88rem; border-radius: 20px; }
          .exec-icon { width: 36px; height: 36px; border-radius: 14px; font-size: 1.15rem; }
          .exec-value { font-size: clamp(1.8rem, 8vw, 2.35rem); margin-top: 0.72rem; }
          .exec-title { font-size: 0.66rem; margin-top: 0.5rem; }
          .exec-sub { font-size: 0.64rem; line-height: 1.35; }
          .quick-grid { gap: 0.65rem; }
          .qbtn { min-height: 76px; padding: 0.78rem; border-radius: 18px; gap: 0.6rem; }
          .qbtn-icon { width: 34px; height: 34px; border-radius: 13px; }
          .qbtn-description {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0,0,0,0);
            white-space: nowrap;
            border: 0;
          }
          .timeline { gap: 0.62rem; }
          .timeline-item { grid-template-columns: 36px 8px minmax(0, 1fr); gap: 0.58rem; padding: 0.72rem; min-height: 72px; }
          .timeline-avatar { width: 36px; height: 36px; border-radius: 14px; }
          .timeline-actor { font-size: 0.84rem; }
          .timeline-action { font-size: 0.74rem; }
          .analytics-grid { gap: 0.7rem; }
          .analytics-card { min-height: 126px; padding: 0.88rem; border-radius: 18px; }
          .analytics-icon { width: 34px; height: 34px; border-radius: 13px; }
          .analytics-value { font-size: clamp(1.65rem, 7vw, 2.1rem); margin-top: 0.55rem; }
        }

        @media (max-width: 400px) {
          .quick-grid { gap: 0.55rem; }
          .qbtn { padding: 0.68rem; min-height: 66px; font-size: 0.78rem; }
          .qbtn-icon { width: 30px; height: 30px; border-radius: 12px; }
          .timeline-actor { font-size: 0.8rem; }
          .timeline-action { font-size: 0.72rem; }
        }
      `}</style>
    </div>
  );
}
