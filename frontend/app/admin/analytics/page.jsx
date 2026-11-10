"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PERIODS = ["today", "7d", "30d"];
const SOURCE_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  google: "Google",
};

function fmt(value) {
  return (value ?? 0).toLocaleString();
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function sumBy(items = [], key) {
  return items.reduce((total, item) => total + Number(item?.[key] || 0), 0);
}

function MetricCard({ title, value, sub }) {
  return (
    <div className="metric-card">
      <strong>{value ?? "—"}</strong>
      <span>{title}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function TinyBars({ data, valueKey, labelKey, empty }) {
  if (!data?.length || data.every((item) => Number(item?.[valueKey] || 0) === 0)) return <div className="empty compact">{empty}</div>;
  const max = Math.max(...data.map((item) => item[valueKey] || 0), 1);
  return (
    <div className="tiny-bars">
      {data.map((item) => (
        <div className="tiny-row" key={item[labelKey]}>
          <span>{item[labelKey]}</span>
          <div className="tiny-track"><i style={{ width: `${((item[valueKey] || 0) / max) * 100}%` }} /></div>
          <b>{fmt(item[valueKey])}</b>
        </div>
      ))}
    </div>
  );
}

function RankingList({ items, valueKey, empty }) {
  if (!items?.length) return <div className="empty compact">{empty}</div>;
  return (
    <div className="ranking-list">
      {items.map((item) => {
        const name = item.user?.username || item.user?.name || "—";
        return (
          <div className="ranking-row" key={item._id || name}>
            <span>{name}</span>
            <b>{fmt(item[valueKey])}</b>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminGrowthAnalyticsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [period, setPeriod] = useState("7d");
  const [currentAnalytics, setCurrentAnalytics] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latestRequestRef = useRef(0);

  const labels = useMemo(() => ({
    title: t("adminAnalytics.title"),
    snapshotNote: t("adminAnalytics.snapshotNote"),
    acquisitionNote: t("adminAnalytics.acquisitionNote"),
    funnelNote: t("adminAnalytics.funnelNote"),
    zeroTrafficNote: t("adminAnalytics.zeroTrafficNote"),
    subtitle: t("adminAnalytics.subtitle"),
    refresh: t("adminAnalytics.refresh"),
    loading: t("adminAnalytics.loading"),
    empty: t("adminAnalytics.empty"),
    visitorsToday: t("adminAnalytics.metrics.visitorsToday"),
    uniqueToday: t("adminAnalytics.metrics.uniqueToday"),
    visitors7d: t("adminAnalytics.metrics.visitors7d"),
    registerClicks: t("adminAnalytics.metrics.registerClicks"),
    registrationStarted: t("adminAnalytics.metrics.registrationStarted"),
    registrationCompleted: t("adminAnalytics.metrics.registrationCompleted"),
    emailVerified: t("adminAnalytics.metrics.emailVerified"),
    onboardingCompleted: t("adminAnalytics.metrics.onboardingCompleted"),
    feedReached: t("adminAnalytics.metrics.feedReached"),
    conversion: t("adminAnalytics.metrics.conversion"),
    funnel: t("adminAnalytics.funnel"),
    sources: t("adminAnalytics.sources"),
    trends: t("adminAnalytics.trends"),
    devices: t("adminAnalytics.devices"),
    locales: t("adminAnalytics.locales"),
    visitors: t("adminAnalytics.visitors"),
    registrations: t("adminAnalytics.registrations"),
    trafficSources: t("adminAnalytics.trafficSources"),
    retention: t("adminAnalytics.retention"),
    currentMetrics: t("adminAnalytics.currentMetrics"),
    registrationsTotal: t("adminAnalytics.registrationsTotal"),
    coinPurchases: t("adminAnalytics.coinPurchases"),
    last7Days: t("adminAnalytics.last7Days"),
    dropoff: t("adminAnalytics.dropoff"),
    dailyRegistrations: t("adminAnalytics.dailyRegistrations"),
    dailyPurchases: t("adminAnalytics.dailyPurchases"),
    topCreators: t("adminAnalytics.topCreators"),
    topSpenders: t("adminAnalytics.topSpenders"),
    sourceStats: {
      visitors: t("adminAnalytics.sourceStats.visitors"),
      registrations: t("adminAnalytics.sourceStats.registrations"),
      conversion: t("adminAnalytics.sourceStats.conversion"),
    },
    acquisition: {
      totalVisitors: t("adminAnalytics.acquisition.totalVisitors"),
      uniqueVisitors: t("adminAnalytics.acquisition.uniqueVisitors"),
      sessions: t("adminAnalytics.acquisition.sessions"),
      instagram: t("adminAnalytics.acquisition.instagram"),
      facebook: t("adminAnalytics.acquisition.facebook"),
      tiktok: t("adminAnalytics.acquisition.tiktok"),
      google: t("adminAnalytics.acquisition.google"),
      direct: t("adminAnalytics.acquisition.direct"),
      other: t("adminAnalytics.acquisition.other"),
    },
    funnelSteps: {
      visitors: t("adminAnalytics.funnelSteps.visitors"),
      registerClicks: t("adminAnalytics.funnelSteps.registerClicks"),
      registrationStarted: t("adminAnalytics.funnelSteps.registrationStarted"),
      registrationCompleted: t("adminAnalytics.funnelSteps.registrationCompleted"),
      emailVerified: t("adminAnalytics.funnelSteps.emailVerified"),
      onboardingCompleted: t("adminAnalytics.funnelSteps.onboardingCompleted"),
      feedReached: t("adminAnalytics.funnelSteps.feedReached"),
    },
  }), [t]);

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    const scheme = "Bearer";
    return { Authorization: `${scheme} ${token || ""}` };
  }, []);

  const loadAnalytics = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    setLoading(true);
    setError("");
    // Never keep showing a previous period after a failed or forbidden refresh.
    setCurrentAnalytics(null);
    setAnalytics(null);
    try {
      const [currentRes, growthRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/analytics`, {
          headers: authHeader(),
          cache: "no-store",
        }),
        fetch(`${API_URL}/api/admin/analytics/growth?period=${period}`, {
          headers: authHeader(),
          cache: "no-store",
        }),
      ]);
      if (requestId !== latestRequestRef.current) return;
      if (currentRes.status === 401 || growthRes.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      if (currentRes.status === 403 || growthRes.status === 403) {
        setError(t("adminAnalytics.noPermissions"));
        return;
      }
      if (!currentRes.ok || !growthRes.ok) throw new Error("server");
      const [currentData, growthData] = await Promise.all([currentRes.json(), growthRes.json()]);
      if (requestId !== latestRequestRef.current) return;
      setCurrentAnalytics(currentData.analytics || null);
      setAnalytics(growthData.analytics || null);
    } catch {
      if (requestId === latestRequestRef.current) setError(t("adminAnalytics.loadError"));
    } finally {
      if (requestId === latestRequestRef.current) setLoading(false);
    }
  }, [authHeader, period, router, t]);

  useEffect(() => {
    loadAnalytics();
    return () => { latestRequestRef.current += 1; };
  }, [loadAnalytics]);

  const summary = analytics?.summary || {};
  const acquisition = analytics?.acquisitionSummary || {};
  const funnel = analytics?.funnel || [];
  const trend = analytics?.trend || [];
  const retention = currentAnalytics?.retention || {};
  const dailyRegistrations = currentAnalytics?.dailyRegistrations || [];
  const dailyPurchases = currentAnalytics?.dailyPurchases || [];

  return (
    <div className="admin-analytics-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("adminAnalytics.eyebrow")}</p>
          <h1>{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        <button className="btn-refresh" onClick={loadAnalytics} disabled={loading}>
          {loading ? "…" : labels.refresh}
        </button>
      </div>

      <div className="periods">
        {PERIODS.map((item) => (
          <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>
            {t(`adminAnalytics.periods.${item}`)}
          </button>
        ))}
      </div>

      {error && <div className="alert">{error}</div>}
      {loading ? (
        <div className="empty">{labels.loading}</div>
      ) : error ? null : !analytics ? (
        <div className="empty">{labels.empty}</div>
      ) : (
        <>
          <section className="panel">
            <h2>{labels.currentMetrics}</h2>
            <p className="section-note">{labels.snapshotNote}</p>
            <div className="metrics-grid">
              <MetricCard title="DAU" value={fmt(retention.dau)} />
              <MetricCard title="WAU" value={fmt(retention.wau)} />
              <MetricCard title="MAU" value={fmt(retention.mau)} />
              <MetricCard title={labels.registrationsTotal} value={fmt(sumBy(dailyRegistrations, "count"))} sub={labels.last7Days} />
              <MetricCard title={labels.coinPurchases} value={fmt(sumBy(dailyPurchases, "total"))} sub={labels.last7Days} />
              <MetricCard title={labels.visitorsToday} value={fmt(summary.visitorsToday)} />
              <MetricCard title={labels.uniqueToday} value={fmt(summary.uniqueVisitorsToday)} />
              <MetricCard title={labels.visitors7d} value={fmt(summary.visitors7d)} />
            </div>
          </section>

          <div className="split">
            <section className="panel">
              <h2>{labels.dailyRegistrations}</h2>
              <TinyBars data={dailyRegistrations} valueKey="count" labelKey="label" empty={labels.empty} />
            </section>
            <section className="panel">
              <h2>{labels.dailyPurchases}</h2>
              <TinyBars data={dailyPurchases} valueKey="total" labelKey="label" empty={labels.empty} />
            </section>
          </div>

          <div className="split">
            <section className="panel">
              <h2>{labels.topCreators}</h2>
              <RankingList items={currentAnalytics?.topCreators || []} valueKey="totalGifts" empty={labels.empty} />
            </section>
            <section className="panel">
              <h2>{labels.topSpenders}</h2>
              <RankingList items={currentAnalytics?.topSpenders || []} valueKey="totalSpent" empty={labels.empty} />
            </section>
          </div>

          <section className="panel">
            <h2>{labels.funnel}</h2>
            <p className="section-note">{labels.acquisitionNote}</p>
            <div className="metrics-grid">
              <MetricCard title={labels.acquisition.totalVisitors} value={fmt(acquisition.totalVisitors)} />
              <MetricCard title={labels.acquisition.uniqueVisitors} value={fmt(acquisition.uniqueVisitors)} />
              <MetricCard title={labels.acquisition.sessions} value={fmt(acquisition.sessions)} />
            </div>

            <p className="section-note">{labels.funnelNote}</p>
            <div className="funnel">
              {funnel.map((step) => (
                <div className="funnel-step" key={step.event}>
                  <div className="funnel-copy">
                    <strong>{labels.funnelSteps[step.key] || step.key}</strong>
                    <span>{fmt(step.count)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>{labels.trafficSources}</h2>
            <div className="sources">
              {Number(acquisition.totalVisitors || 0) === 0
                ? <div className="empty source-empty">{labels.zeroTrafficNote}</div>
                : (analytics.sources || []).filter((source) => source.visitors > 0 || source.registrations > 0).map((source) => (
                  <div className="source-card" key={source.source}>
                    <strong>{SOURCE_LABELS[source.source] || t(`adminAnalytics.sourceNames.${source.source}`) || source.source}</strong>
                    <span>{labels.sourceStats.visitors}: {fmt(source.visitors)}</span>
                    <span>{labels.sourceStats.registrations}: {fmt(source.registrations)}</span>
                    <b>{labels.sourceStats.conversion}: {source.visitors > 0 && source.registrations <= source.visitors ? pct(source.conversion) : "—"}</b>
                  </div>
                ))}
            </div>
          </section>

          <section className="panel">
            <h2>{labels.trends}</h2>
            {trend.some((item) => Number(item.visits || 0) > 0 || Number(item.registrations || 0) > 0) ? (
              <div className="trend-grid">
                <div>
                  <h3>{labels.visitors}</h3>
                  <TinyBars data={trend} valueKey="visits" labelKey="label" empty={labels.empty} />
                </div>
                <div>
                  <h3>{labels.registrations}</h3>
                  <TinyBars data={trend} valueKey="registrations" labelKey="label" empty={labels.empty} />
                </div>
              </div>
            ) : <div className="empty compact">{labels.zeroTrafficNote}</div>}
          </section>

          <div className="split">
            <section className="panel">
              <h2>{labels.devices}</h2>
              <TinyBars data={analytics.devices || []} valueKey="visitors" labelKey="deviceCategory" empty={labels.empty} />
            </section>
            <section className="panel">
              <h2>{labels.locales}</h2>
              <TinyBars data={analytics.locales || []} valueKey="visitors" labelKey="locale" empty={labels.empty} />
            </section>
          </div>

          <p className="retention">{labels.retention}: {analytics.retention?.note}</p>
        </>
      )}

      <style jsx global>{`
        .admin-analytics-page { max-width: 1180px; margin: 0 auto; padding-bottom: 2rem; }
        .admin-analytics-page .page-header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
        .admin-analytics-page .eyebrow { color: #22d3ee; font-size: 0.75rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 0.35rem; }
        .admin-analytics-page h1 { margin: 0; color: #f8fafc; font-size: clamp(1.7rem, 5vw, 2.4rem); }
        .admin-analytics-page .page-header p:not(.eyebrow) { color: #94a3b8; margin: 0.35rem 0 0; }
        .admin-analytics-page .btn-refresh, .admin-analytics-page .periods button { border: 1px solid rgba(124,58,237,0.38); color: #c4b5fd; background: rgba(124,58,237,0.12); border-radius: 999px; padding: 0.65rem 1rem; font-weight: 800; cursor: pointer; }
        .admin-analytics-page .periods { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .admin-analytics-page .periods button.active { background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; }
        .admin-analytics-page .alert { padding: 0.8rem 1rem; border-radius: 14px; background: rgba(248,113,113,0.1); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
        .admin-analytics-page .empty { color: #94a3b8; text-align: center; padding: 2rem; }
        .admin-analytics-page .empty.compact { padding: 0.75rem; }
        .admin-analytics-page .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.8rem; margin-bottom: 1rem; }
        .admin-analytics-page .metric-card, .admin-analytics-page .panel, .admin-analytics-page .source-card { border: 1px solid rgba(148,163,184,0.14); background: linear-gradient(180deg, #171c2a, #101522); border-radius: 22px; }
        .admin-analytics-page .metric-card { padding: 1rem; display: flex; flex-direction: column; gap: 0.55rem; min-width: 0; }
        .admin-analytics-page .metric-card strong { color: #fff; font-size: 1.8rem; line-height: 1.15; font-variant-numeric: tabular-nums; }
        .admin-analytics-page .metric-card span, .admin-analytics-page .metric-card small { color: #94a3b8; font-size: 0.78rem; }
        .admin-analytics-page .panel { padding: 1rem; margin-bottom: 1rem; }
        .admin-analytics-page .panel h2 { margin: 0 0 0.9rem; font-size: 0.82rem; color: #c4b5fd; text-transform: uppercase; letter-spacing: 0.09em; }
        .admin-analytics-page .funnel { display: grid; gap: 0.7rem; }
        .admin-analytics-page .funnel-step { display: flex; justify-content: space-between; gap: 0.8rem; align-items: center; padding: 0.85rem; border-radius: 16px; background: rgba(255,255,255,0.04); position: relative; }
        .admin-analytics-page .funnel-step + .funnel-step::before { content: "↓"; position: absolute; top: -0.85rem; left: 1rem; color: #22d3ee; font-weight: 900; }
        .admin-analytics-page .funnel-copy { display: grid; gap: 0.25rem; }
        .admin-analytics-page .funnel-copy strong { color: #f8fafc; }
        .admin-analytics-page .funnel-copy span, .admin-analytics-page .funnel-step small { color: #94a3b8; }
        .admin-analytics-page .sources, .admin-analytics-page .split, .admin-analytics-page .trend-grid { display: grid; gap: 0.75rem; }
        .admin-analytics-page .sources { grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); }
        .admin-analytics-page .source-card { padding: 0.9rem; display: grid; gap: 0.3rem; }
        .admin-analytics-page .source-card strong { color: #f8fafc; }
        .admin-analytics-page .source-card span { color: #94a3b8; font-size: 0.78rem; }
        .admin-analytics-page .source-card b { color: #22d3ee; }
        .admin-analytics-page .tiny-bars { display: grid; gap: 0.55rem; }
        .admin-analytics-page .tiny-row { display: grid; grid-template-columns: 62px 1fr 48px; gap: 0.6rem; align-items: center; color: #94a3b8; font-size: 0.78rem; }
        .admin-analytics-page .tiny-track { height: 8px; border-radius: 999px; background: #1e2535; overflow: hidden; }
        .admin-analytics-page .tiny-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #7c3aed, #22d3ee); min-width: 0; }
        .admin-analytics-page .tiny-row b { color: #f8fafc; text-align: right; }
        .admin-analytics-page .ranking-list { display: grid; gap: 0.55rem; }
        .admin-analytics-page .ranking-row { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.7rem 0; border-bottom: 1px solid rgba(148,163,184,0.1); color: #94a3b8; }
        .admin-analytics-page .ranking-row:last-child { border-bottom: 0; }
        .admin-analytics-page .ranking-row b { color: #f8fafc; }
        .admin-analytics-page .trend-grid, .admin-analytics-page .split { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 1rem; }
        .admin-analytics-page .retention { color: #64748b; font-size: 0.8rem; line-height: 1.5; }
        @media (max-width: 640px) {
          .admin-analytics-page .page-header { display: grid; }
          .admin-analytics-page .btn-refresh { width: 100%; }
          .admin-analytics-page .tiny-row { grid-template-columns: 54px 1fr 42px; }
        }
      
        .admin-analytics-page .section-note { color: #94a3b8; margin: -0.35rem 0 1rem; font-size: 0.83rem; line-height: 1.55; }
        .admin-analytics-page .metric-card span { line-height: 1.4; overflow-wrap: anywhere; }
        .admin-analytics-page .source-card span, .admin-analytics-page .source-card b { overflow-wrap: anywhere; line-height: 1.45; }
        .admin-analytics-page .metrics-grid { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
        .admin-analytics-page .source-empty { grid-column: 1 / -1; }
        .admin-analytics-page .trend-grid { margin-top: 0; }
        .admin-analytics-page .trend-grid h3 { color: #cbd5e1; font-size: 0.85rem; margin: 0 0 0.75rem; }
        .admin-analytics-page .funnel-step, .admin-analytics-page .funnel-copy { min-width: 0; }
        .admin-analytics-page .funnel-copy strong { overflow-wrap: anywhere; }
        @media (max-width: 640px) {
          .admin-analytics-page .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; }
          .admin-analytics-page .metric-card { border-radius: 15px; padding: 0.85rem; }
          .admin-analytics-page .metric-card strong { font-size: 1.65rem; }
          .admin-analytics-page .sources { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .admin-analytics-page .source-card { border-radius: 16px; padding: 0.8rem; min-width: 0; }
          .admin-analytics-page .panel { border-radius: 18px; }
        }
`}</style>
    </div>
  );
}
