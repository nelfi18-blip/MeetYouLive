"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  direct: "Directo",
  other: "Otros",
};

function fmt(value) {
  return (value ?? 0).toLocaleString();
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
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
  if (!data?.length) return <div className="empty">{empty}</div>;
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

export default function AdminGrowthAnalyticsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [period, setPeriod] = useState("7d");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const labels = useMemo(() => ({
    title: t("adminAnalytics.title"),
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
    retention: t("adminAnalytics.retention"),
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
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/analytics/growth?period=${period}`, {
        headers: authHeader(),
        cache: "no-store",
      });
      if (res.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      if (res.status === 403) {
        setError("Sin permisos.");
        return;
      }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setAnalytics(data.analytics || null);
    } catch {
      setError("Error cargando analíticas.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, period, router]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const summary = analytics?.summary || {};
  const funnel = analytics?.funnel || [];
  const trend = analytics?.trend || [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin → Analíticas</p>
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
      ) : !analytics ? (
        <div className="empty">{labels.empty}</div>
      ) : (
        <>
          <section className="metrics-grid">
            <MetricCard title={labels.visitorsToday} value={fmt(summary.visitorsToday)} />
            <MetricCard title={labels.uniqueToday} value={fmt(summary.uniqueVisitorsToday)} />
            <MetricCard title={labels.visitors7d} value={fmt(summary.visitors7d)} />
            <MetricCard title={labels.registerClicks} value={fmt(summary.registerClicks)} />
            <MetricCard title={labels.registrationStarted} value={fmt(summary.registrationStarted)} />
            <MetricCard title={labels.registrationCompleted} value={fmt(summary.registrationCompleted)} />
            <MetricCard title={labels.emailVerified} value={fmt(summary.emailVerified)} />
            <MetricCard title={labels.onboardingCompleted} value={fmt(summary.onboardingCompleted)} />
            <MetricCard title={labels.feedReached} value={fmt(summary.feedReached)} />
          </section>

          <section className="panel">
            <h2>{labels.funnel}</h2>
            <div className="funnel">
              {funnel.map((step, index) => (
                <div className="funnel-step" key={step.event}>
                  <div className="funnel-copy">
                    <strong>{labels.funnelSteps[step.key] || step.key}</strong>
                    <span>{fmt(step.count)} · {index === 0 ? "100%" : pct(step.conversionFromPrevious)}</span>
                  </div>
                  {index > 0 && <small>-{fmt(step.dropoffFromPrevious)} · {pct(step.dropoffPercent)}</small>}
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>{labels.sources}</h2>
            <div className="sources">
              {(analytics.sources || []).map((source) => (
                <div className="source-card" key={source.source}>
                  <strong>{SOURCE_LABELS[source.source] || source.source}</strong>
                  <span>{labels.visitors}: {fmt(source.visitors)}</span>
                  <span>{labels.registrations}: {fmt(source.registrations)}</span>
                  <b>{pct(source.conversion)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>{labels.trends}</h2>
            <TinyBars data={trend} valueKey="visits" labelKey="label" empty={labels.empty} />
            <div className="trend-grid">
              <TinyBars data={trend} valueKey="uniqueVisitors" labelKey="label" empty={labels.empty} />
              <TinyBars data={trend} valueKey="registrations" labelKey="label" empty={labels.empty} />
              <TinyBars data={trend} valueKey="conversion" labelKey="label" empty={labels.empty} />
            </div>
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

      <style jsx>{`
        .page { max-width: 1180px; margin: 0 auto; padding-bottom: 2rem; }
        .page-header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
        .eyebrow { color: #22d3ee; font-size: 0.75rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 0.35rem; }
        h1 { margin: 0; color: #f8fafc; font-size: clamp(1.7rem, 5vw, 2.4rem); }
        .page-header p:not(.eyebrow) { color: #94a3b8; margin: 0.35rem 0 0; }
        .btn-refresh, .periods button { border: 1px solid rgba(124,58,237,0.38); color: #c4b5fd; background: rgba(124,58,237,0.12); border-radius: 999px; padding: 0.65rem 1rem; font-weight: 800; cursor: pointer; }
        .periods { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .periods button.active { background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; }
        .alert { padding: 0.8rem 1rem; border-radius: 14px; background: rgba(248,113,113,0.1); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
        .empty { color: #94a3b8; text-align: center; padding: 2rem; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.8rem; margin-bottom: 1rem; }
        .metric-card, .panel, .source-card { border: 1px solid rgba(148,163,184,0.14); background: linear-gradient(180deg, #171c2a, #101522); border-radius: 22px; }
        .metric-card { padding: 1rem; display: grid; gap: 0.35rem; }
        .metric-card strong { color: #fff; font-size: 1.65rem; line-height: 1; }
        .metric-card span, .metric-card small { color: #94a3b8; font-size: 0.78rem; }
        .panel { padding: 1rem; margin-bottom: 1rem; }
        .panel h2 { margin: 0 0 0.9rem; font-size: 0.82rem; color: #c4b5fd; text-transform: uppercase; letter-spacing: 0.09em; }
        .funnel { display: grid; gap: 0.7rem; }
        .funnel-step { display: flex; justify-content: space-between; gap: 0.8rem; align-items: center; padding: 0.85rem; border-radius: 16px; background: rgba(255,255,255,0.04); position: relative; }
        .funnel-step + .funnel-step::before { content: "↓"; position: absolute; top: -0.85rem; left: 1rem; color: #22d3ee; font-weight: 900; }
        .funnel-copy { display: grid; gap: 0.25rem; }
        .funnel-copy strong { color: #f8fafc; }
        .funnel-copy span, .funnel-step small { color: #94a3b8; }
        .sources, .split, .trend-grid { display: grid; gap: 0.75rem; }
        .sources { grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); }
        .source-card { padding: 0.9rem; display: grid; gap: 0.3rem; }
        .source-card strong { color: #f8fafc; }
        .source-card span { color: #94a3b8; font-size: 0.78rem; }
        .source-card b { color: #22d3ee; }
        .tiny-bars { display: grid; gap: 0.55rem; }
        .tiny-row { display: grid; grid-template-columns: 62px 1fr 48px; gap: 0.6rem; align-items: center; color: #94a3b8; font-size: 0.78rem; }
        .tiny-track { height: 8px; border-radius: 999px; background: #1e2535; overflow: hidden; }
        .tiny-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #7c3aed, #22d3ee); min-width: 2px; }
        .tiny-row b { color: #f8fafc; text-align: right; }
        .trend-grid, .split { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 1rem; }
        .retention { color: #64748b; font-size: 0.8rem; line-height: 1.5; }
        @media (max-width: 640px) {
          .page-header { display: grid; }
          .btn-refresh { width: 100%; }
          .tiny-row { grid-template-columns: 54px 1fr 42px; }
        }
      `}</style>
    </div>
  );
}
