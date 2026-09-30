"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAdminToken, getToken } from "@/lib/token";
import { getDisplayName, getPrimaryProfileImage } from "@/lib/imageHelpers";
import { useLanguage } from "@/contexts/LanguageContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_ORIGIN = API_URL ? new URL(API_URL).origin : "";
const RECENT_ITEMS_LIMIT = 5;
const TIMELINE_ITEMS_LIMIT = 8;
const SKELETON_EXEC_CARDS = ["users", "revenue", "lives", "reports", "payouts", "creators"];

// CSS Modules generate build-scoped class names that work regardless of which
// function component renders the element (unlike styled-jsx, whose scoping
// only applies to JSX written directly inside the component that declares the
// <style jsx> tag). Since this file's presentational pieces (ExecutiveCard,
// OperationalMetric, Timeline, AnalyticsCard, SectionHeader, ...) are declared
// as separate functions, plain class-name strings must be resolved through
// this helper so their styles actually apply.
function cn(...classes) {
  return classes
    .filter(Boolean)
    .map((name) => styles[name] || name)
    .join(" ");
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

function getShortUserName(user, fallback = "") {
  const name = getDisplayName(user);
  return name === "Usuario" ? fallback : name;
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

function getTodayRevenueSummary(series, t) {
  if (!series?.length) {
    return { value: "—", sub: t("adminDashboard.cards.noPurchases") };
  }
  return {
    value: `${fmt(getTodaySeriesValue(series, "total"))} 🪙`,
    sub: t("adminDashboard.cards.today"),
  };
}

function CountBadge({ value }) {
  if (value === null || value === undefined || value <= 0) return null;
  return <span className={cn("sc-badge")}>{value > 99 ? "99+" : value}</span>;
}

function SectionHeader({ icon, title, accent, link, linkLabel, defaultLinkLabel }) {
  return (
    <div className={cn("sh")}>
      <div className={cn("sh-left")}>
        <span className={cn("sh-dot", `sh-dot--${accent || "purple"}`)} />
        <span className={cn("sh-icon")}>{icon}</span>
        <span className={cn("sh-title")}>{title}</span>
      </div>
      {link && (
        <Link href={link} className={cn("sh-link")}>{linkLabel || defaultLinkLabel}</Link>
      )}
    </div>
  );
}

function ExecutiveCard({ title, value, sub, icon, href, accent, badge }) {
  const inner = (
    <div className={cn("exec-card", accent && `exec-card--${accent}`, href && "exec-card--link")}>
      <div className={cn("exec-top")}>
        <span className={cn("exec-icon")}>{icon}</span>
        <CountBadge value={badge} />
      </div>
      <div className={cn("exec-value")}>{value ?? "—"}</div>
      <div className={cn("exec-title")}>{title}</div>
      {sub && <div className={cn("exec-sub")}>{sub}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

function OperationalMetric({ href, icon, label, value, description, tone }) {
  return (
    <Link href={href} className={cn("op-card", tone && `op-card--${tone}`)}>
      <span className={cn("op-icon")}>{icon}</span>
      <span className={cn("op-copy")}>
        <span className={cn("op-label")}>{label}</span>
        <span className={cn("op-description")}>{description}</span>
      </span>
      <span className={cn("op-value")}>{value}</span>
    </Link>
  );
}

function buildTimelineItems(recent, t) {
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
      actor: getShortUserName(user, t("adminDashboard.userFallback")),
      action: t("adminDashboard.timeline.userCreated"),
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
      actor: getShortUserName(creator, t("adminDashboard.creatorFallback")),
      action: status === "approved" ? t("adminDashboard.timeline.creatorApproved") : t("adminDashboard.timeline.creatorRequestedReview"),
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
      actor: getShortUserName(tx.userId, t("adminDashboard.userFallback")),
      action: t("adminDashboard.timeline.coinsPurchased"),
      meta: `${fmt(tx.amount)} ${t("common.coins")}`,
      href: "/admin/transactions",
    });
  }

  for (const report of recent.reports || []) {
    items.push({
      id: `report-${report._id}`,
      date: report.createdAt,
      icon: "🚨",
      accent: "red",
      actor: t("adminDashboard.timeline.moderation"),
      action: t("adminDashboard.timeline.reportReceived")
        .replace("{reason}", report.reason ? `: ${report.reason}` : "")
        .replace("{review}", t("adminDashboard.timeline.requiresReview")),
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

function Timeline({ items, emptyText }) {
  if (!items.length) {
    return <div className={cn("timeline-empty")}>{emptyText}</div>;
  }

  return (
    <div className={cn("timeline")}>
      {items.map((item) => {
        const timelineLabel = `${item.actor} ${item.action} ${formatTimelineMeta(item)}`;
        const content = (
          <>
            {item.avatar ? (
              <img src={item.avatar} alt="" className={cn("timeline-avatar")} />
            ) : (
              <span className={cn("timeline-avatar", "timeline-avatar--ph", `timeline-avatar--${item.accent}`)}>{item.icon}</span>
            )}
            <span className={cn("timeline-dot")} />
            <span className={cn("timeline-copy")}>
              <span className={cn("timeline-actor")}>{item.actor}</span>
              <span className={cn("timeline-action")}>{item.action}</span>
              <span className={cn("timeline-date")}>{formatTimelineMeta(item)}</span>
            </span>
          </>
        );
        return item.href ? (
          <Link href={item.href} className={cn("timeline-item")} key={item.id} aria-label={timelineLabel}>{content}</Link>
        ) : (
          <div className={cn("timeline-item")} key={item.id} role="group" aria-label={timelineLabel}>{content}</div>
        );
      })}
    </div>
  );
}

function AnalyticsCard({ icon, label, value, sub }) {
  return (
    <div className={cn("analytics-card")}>
      <span className={cn("analytics-icon")}>{icon}</span>
      <span className={cn("analytics-value")}>{value}</span>
      <span className={cn("analytics-label")}>{label}</span>
      {sub && <span className={cn("analytics-sub")}>{sub}</span>}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className={cn("dash")}>
      <div className={cn("dash-header")}>
        <div>
          <div className={cn("sk", "sk-title")} />
          <div className={cn("sk", "sk-line")} />
        </div>
        <div className={cn("sk", "sk-button")} />
      </div>
      <div className={cn("exec-grid")}>
        {SKELETON_EXEC_CARDS.map((key) => <div className={cn("sk", "sk-card")} key={key} />)}
      </div>
      <div className={cn("sk", "sk-panel")} />
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
  const { t } = useLanguage();
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
  }, [authHeader, router, t]);

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
        fetch(`${API_URL}/api/admin/analytics/growth?period=7d`, { headers: authHeader(), cache: "no-store" }),
        fetch(`${API_URL}/api/admin/revenue`, { headers: authHeader(), cache: "no-store" }),
      ]);

      if (overviewRes.status === 401 || analyticsRes.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      if (overviewRes.status === 403) {
        setError(t("adminDashboard.noAdminPermissions"));
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
      setError(t("adminDashboard.loadError"));
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, t]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!loading && !error && !recentLoadedRef.current) loadRecentData();
  }, [error, loadRecentData, loading]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <div className={cn("dash-error")}>{error}</div>;
  }

  const s = stats || {};
  const a = analytics || {};
  const dailyRevenueSeries = revenue?.coins?.dailyCoinRevenue || [];
  const todayRevenue = getTodayRevenueSummary(dailyRevenueSeries, t);
  const timelineItems = buildTimelineItems(recent, t);

  return (
    <div className={cn("dash")}>
      <div className={cn("dash-header")}>
        <div>
          <h1 className={cn("dash-title")}>
            <span className={cn("dash-title-icon")}>🛡️</span>
            {t("adminDashboard.title")}
          </h1>
          <p className={cn("dash-sub")}>{t("adminDashboard.subtitle")}</p>
        </div>
        <button className={cn("btn-refresh")} onClick={loadData} disabled={loading}>
          ↺ {t("adminDashboard.refresh")}
        </button>
      </div>

      <section className={cn("section", "section--hero")}>
        <SectionHeader icon="✦" title={t("adminDashboard.sections.dashboard")} accent="purple" defaultLinkLabel={`${t("adminDashboard.viewAll")} →`} />
        <div className={cn("exec-grid")}>
          <ExecutiveCard icon="👥" title={t("adminDashboard.cards.registeredUsers")} value={fmt(s.totalUsers)} sub={t("adminDashboard.cards.totalAccounts")} accent="neutral" href="/admin/users" />
          <ExecutiveCard icon="💰" title={t("adminDashboard.cards.todayRevenue")} value={todayRevenue.value} sub={todayRevenue.sub} accent={getTodaySeriesValue(dailyRevenueSeries, "total") > 0 ? "green" : "neutral"} href="/admin/revenue" />
          <ExecutiveCard icon="📺" title={t("adminDashboard.cards.activeLives")} value={fmt(s.activeLives)} sub={s.activeLives > 0 ? t("adminDashboard.cards.liveNow") : t("adminDashboard.cards.noActiveLives")} accent={s.activeLives > 0 ? "red" : "neutral"} href="/admin/lives" badge={s.activeLives} />
          <ExecutiveCard icon="🚨" title={t("adminDashboard.cards.pendingReports")} value={fmt(s.openReports)} sub={s.openReports > 0 ? t("adminDashboard.cards.requireReview") : t("adminDashboard.cards.moderationUpToDate")} accent={s.openReports > 0 ? "red" : "green"} href="/admin/reports" badge={s.openReports} />
          <ExecutiveCard icon="🏦" title={t("adminDashboard.cards.pendingWithdrawals")} value={fmt(s.pendingPayoutsCount)} sub={s.pendingPayoutsCount > 0 ? t("adminDashboard.cards.coinsToReview").replace("{count}", fmt(s.pendingPayoutsCoins)) : t("adminDashboard.cards.noPendingWithdrawals")} accent={s.pendingPayoutsCount > 0 ? "yellow" : "green"} href="/admin/withdrawals?status=pending" badge={s.pendingPayoutsCount} />
          <ExecutiveCard icon="⭐" title={t("adminDashboard.cards.activeCreators")} value={fmt(s.totalCreators)} sub={t("adminDashboard.cards.approvedCreators")} accent="neutral" href="/admin/creators?status=approved" />
        </div>
      </section>

      <section className={cn("section", "section--quick")}>
        <SectionHeader icon="⚡" title={t("adminDashboard.sections.quickActions")} accent="gold" defaultLinkLabel={`${t("adminDashboard.viewAll")} →`} />
        <div className={cn("op-grid")}>
          <OperationalMetric icon="👥" label={t("adminDashboard.quick.reviewUsers")} value="→" description={t("adminDashboard.quick.manageAccounts")} href="/admin/users" />
          <OperationalMetric icon="🚨" label={t("adminDashboard.quick.moderateReports")} value={fmt(s.openReports)} description={t("adminDashboard.quick.pendingReports")} tone={s.openReports > 0 ? "yellow" : "green"} href="/admin/reports" />
          <OperationalMetric icon="🏦" label={t("adminDashboard.quick.processWithdrawals")} value={fmt(s.pendingPayoutsCount)} description={t("adminDashboard.quick.withdrawalRequests")} tone={s.pendingPayoutsCount > 0 ? "yellow" : "green"} href="/admin/withdrawals?status=pending" />
          <OperationalMetric icon="📺" label={t("adminDashboard.quick.monitorLives")} value={fmt(s.activeLives)} description={t("adminDashboard.quick.liveActivity")} href="/admin/lives" />
        </div>
      </section>

      <section className={cn("section", "section--tight")}>
        <SectionHeader icon="⏱" title={t("adminDashboard.sections.recentActivity")} accent="blue" defaultLinkLabel={`${t("adminDashboard.viewAll")} →`} />
        <Timeline items={timelineItems} emptyText={t("adminDashboard.timeline.empty")} />
      </section>

      <section className={cn("section", "section--analytics")}>
        <SectionHeader icon="📊" title={t("adminDashboard.sections.analytics")} accent="green" link="/admin/analytics" linkLabel={`${t("adminDashboard.viewAnalytics")} →`} defaultLinkLabel={`${t("adminDashboard.viewAll")} →`} />
        <div className={cn("analytics-grid")}>
          <AnalyticsCard icon="👥" label={t("adminDashboard.analytics.visitorsToday")} value={fmt(a.summary?.uniqueVisitorsToday)} sub={t("adminDashboard.analytics.unique")} />
          <AnalyticsCard icon="📝" label={t("adminDashboard.analytics.registrationsToday")} value={fmt(a.summary?.registrationsToday)} sub={t("adminDashboard.analytics.accountsCreated")} />
          <AnalyticsCard icon="📈" label={t("adminDashboard.analytics.conversion")} value={`${(a.summary?.conversion ?? 0).toFixed(1)}%`} sub={t("adminDashboard.analytics.visitorToSignup")} />
          <AnalyticsCard icon="➡️" label={t("adminDashboard.analytics.funnel")} value={t("adminDashboard.analytics.view")} sub={t("adminDashboard.analytics.fullAnalytics")} />
        </div>
      </section>
    </div>
  );
}
