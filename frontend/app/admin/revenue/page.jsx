"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// CSS Modules generate build-scoped class names that resolve correctly
// regardless of which function component renders the element (unlike
// styled-jsx, whose scoping only applies to JSX written directly inside the
// component that declares the <style jsx> tag). SummaryCard / MetricCard /
// BarChart are declared as separate functions below, so plain class-name
// strings are resolved through this helper so their styles actually apply.
function cn(...classes) {
  return classes
    .filter(Boolean)
    .map((name) => styles[name] || name)
    .join(" ");
}

const ICON_PATHS = {
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  coin: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v12 M15.5 9.5c0-1.4-1.6-2.5-3.5-2.5s-3.5 1.1-3.5 2.5 1.6 2 3.5 2 3.5 .6 3.5 2-1.6 2.5-3.5 2.5-3.5-1.1-3.5-2.5",
  userCheck: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17 11l2 2 4-4",
  checkCircle: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  sparkle: "M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4L12 2z",
  trendingDown: "M23 18l-9.5-9.5-5 5L1 6 M17 18h6v-6",
  alertTriangle: "M10.3 3.9l-8.2 14a1 1 0 0 0 .9 1.6h16.4a1 1 0 0 0 .9-1.6l-8.2-14a1 1 0 0 0-1.8 0z M12 9v4 M12 17h.01",
  refreshCcw: "M1 4v6h6 M23 20v-6h-6 M20.5 9a8.5 8.5 0 0 0-14.8-4.6L1 10 M3.5 15a8.5 8.5 0 0 0 14.8 4.6L23 14",
  barChart: "M12 20V10 M18 20V4 M6 20v-4",
  zap: "M13 2L3 14h8l-1 8 10-12h-8l1-8z",
  shield: "M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z",
  chevronDown: "M6 9l6 6 6-6",
};

function Icon({ name, size = 18, strokeWidth = 2, className }) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function SummaryCard({ icon, tone, value, label, sub }) {
  return (
    <div className={cn("summaryCard", `summaryCard--${tone}`)}>
      <div className={cn("summaryIcon")}><Icon name={icon} size={18} /></div>
      <div>
        <div className={cn("summaryValue")}>{value ?? "—"}</div>
        <div className={cn("summaryLabel")}>{label}</div>
        {sub && <div className={cn("summarySub")}>{sub}</div>}
      </div>
    </div>
  );
}

function MetricCard({ icon, title, value, sub, highlight }) {
  return (
    <div className={cn("metricCard", highlight && "metricCard--highlight")}>
      <div className={cn("metricIcon")}><Icon name={icon} size={17} /></div>
      <div className={cn("metricBody")}>
        <div className={cn("metricValue")}>{value ?? "—"}</div>
        <div className={cn("metricTitle")}>{title}</div>
        {sub && <div className={cn("metricSub")}>{sub}</div>}
      </div>
    </div>
  );
}

function BarChart({ data, valueKey, labelKey, color, emptyText }) {
  // The backend returns one row per day in the period even when there were
  // no purchases (all rows at 0). Only render bars when at least one row has
  // a verifiable positive value; otherwise show the empty state instead of
  // drawing artificial zero-width bars.
  const hasPositiveValue = data?.some((d) => (d[valueKey] || 0) > 0);
  if (!data?.length || !hasPositiveValue) return <div className={cn("chartEmpty")}>{emptyText}</div>;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className={cn("barChart")}>
      {data.map((item, i) => {
        const pct = ((item[valueKey] || 0) / max) * 100;
        return (
          <div key={i} className={cn("barItem")}>
            <div className={cn("barLabel")}>{item[labelKey]}</div>
            <div className={cn("barTrack")}>
              {/* .barFill has min-width: 2px, which would render a visible
                  sliver even at width: 0%. Only mount the fill for days with
                  a real positive value so zero days stay visually empty. */}
              {(item[valueKey] || 0) > 0 && (
                <div className={cn("barFill")} style={{ width: `${pct}%`, background: color || "#7c3aed" }} />
              )}
            </div>
            <div className={cn("barValue")}>{(item[valueKey] || 0).toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminRevenuePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checklistOpen, setChecklistOpen] = useState(false);

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
      if (res.status === 403) { setError(t("adminRevenue.noAdminPermissions")); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setRevenue(data.revenue || null);
    } catch {
      setError(t("adminRevenue.loadError"));
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, t]);

  useEffect(() => { loadRevenue(); }, [loadRevenue]);

  const subs = revenue?.subscriptions;
  const coins = revenue?.coins;

  return (
    <div className={cn("page")}>
      <div className={cn("header")}>
        <div>
          <h1 className={cn("title")}>
            <span className={cn("titleIcon")}><Icon name="dollar" size={16} /></span>
            {t("adminRevenue.title")}
          </h1>
          <p className={cn("subtitle")}>{t("adminRevenue.subtitle")}</p>
        </div>
        <button className={cn("btnRefresh")} onClick={loadRevenue} disabled={loading}>
          <Icon name="refreshCcw" size={15} className={cn("refreshIcon", loading && "refreshIcon--spinning")} />
          {t("adminRevenue.refresh")}
        </button>
      </div>

      {error && (
        <div className={cn("alert", "alertError")}>
          <Icon name="alertTriangle" size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className={cn("loadingState")}>{t("adminRevenue.loading")}</div>
      ) : !revenue ? (
        <div className={cn("loadingState")}>{t("adminRevenue.empty")}</div>
      ) : (
        <>
          {/* Premium top summary */}
          <section className={cn("section")}>
            <div className={cn("sectionHeader")}>
              <span className={cn("sectionDot")} />
              <h2 className={cn("sectionTitle")}>{t("adminRevenue.sections.summary")}</h2>
            </div>
            <div className={cn("summaryGrid")}>
              <SummaryCard
                icon="dollar"
                tone="violet"
                value={`$${subs.estimatedMRR.toLocaleString(t("common.locale"), { minimumFractionDigits: 2 })}`}
                label={t("adminRevenue.cards.estimatedMrr")}
                sub={t("adminRevenue.summary.estimatedMrrSub")}
              />
              <SummaryCard
                icon="users"
                tone="blue"
                value={subs.active.toLocaleString()}
                label={t("adminRevenue.cards.activeSubscriptions")}
              />
              <SummaryCard
                icon="coin"
                tone="gold"
                value={coins.totalCoinRevenueLast30Days.toLocaleString()}
                label={t("adminRevenue.cards.coinsSold30d")}
                sub={t("adminRevenue.summary.coinsSold30dSub")}
              />
              <SummaryCard
                icon="userCheck"
                tone="magenta"
                value={coins.buyersLast30Days.toLocaleString()}
                label={t("adminRevenue.cards.uniqueBuyers30d")}
                sub={t("adminRevenue.summary.uniqueBuyers30dSub")}
              />
            </div>
          </section>

          {/* Subscription KPIs */}
          <section className={cn("section")}>
            <div className={cn("sectionHeader")}>
              <span className={cn("sectionDot", "sectionDot--blue")} />
              <h2 className={cn("sectionTitle")}>{t("adminRevenue.sections.subscriptions")}</h2>
            </div>
            <div className={cn("metricsGrid")}>
              <MetricCard
                icon="dollar"
                title={t("adminRevenue.cards.estimatedMrr")}
                value={`$${subs.estimatedMRR.toLocaleString(t("common.locale"), { minimumFractionDigits: 2 })}`}
                sub={t("adminRevenue.cards.estimatedMrrSub")
                  .replace("{count}", String(subs.active))
                  .replace("{price}", String(subs.subscriptionPriceUsd))}
                highlight={subs.estimatedMRR > 0}
              />
              <MetricCard
                icon="checkCircle"
                title={t("adminRevenue.cards.activeSubscriptions")}
                value={subs.active.toLocaleString()}
              />
              <MetricCard
                icon="sparkle"
                title={t("adminRevenue.cards.newSubscriptions7d")}
                value={subs.newThisWeek.toLocaleString()}
                highlight={subs.newThisWeek > 0}
              />
              <MetricCard
                icon="trendingDown"
                title={t("adminRevenue.cards.cancellations30d")}
                value={subs.canceledLast30Days.toLocaleString()}
                highlight={subs.canceledLast30Days > 0}
              />
              <MetricCard
                icon="alertTriangle"
                title={t("adminRevenue.cards.failedPayments")}
                value={subs.pastDue.toLocaleString()}
                highlight={subs.pastDue > 0}
              />
              <MetricCard
                icon="refreshCcw"
                title={t("adminRevenue.cards.churnRate")}
                value={`${subs.churnRate}%`}
                sub={t("adminRevenue.cards.churnRateSub")}
              />
            </div>
          </section>

          {/* Coins KPIs */}
          <section className={cn("section")}>
            <div className={cn("sectionHeader")}>
              <span className={cn("sectionDot", "sectionDot--gold")} />
              <h2 className={cn("sectionTitle")}>{t("adminRevenue.sections.coinPurchases30d")}</h2>
            </div>
            <div className={cn("metricsGrid")}>
              <MetricCard
                icon="coin"
                title={t("adminRevenue.cards.coinsSold30d")}
                value={coins.totalCoinRevenueLast30Days.toLocaleString()}
                highlight={coins.totalCoinRevenueLast30Days > 0}
              />
              <MetricCard
                icon="userCheck"
                title={t("adminRevenue.cards.uniqueBuyers30d")}
                value={coins.buyersLast30Days.toLocaleString()}
              />
              <MetricCard
                icon="barChart"
                title={t("adminRevenue.cards.avgCoinsPerBuyer")}
                value={coins.avgCoinsPerBuyer.toLocaleString()}
                sub={t("adminRevenue.cards.avgCoinsPerBuyerSub")}
              />
            </div>
          </section>

          {/* Daily coin revenue chart */}
          <section className={cn("section")}>
            <div className={cn("sectionHeader")}>
              <span className={cn("sectionDot", "sectionDot--gold")} />
              <h2 className={cn("sectionTitle")}>{t("adminRevenue.sections.dailyCoins30d")}</h2>
            </div>
            <div className={cn("chartPanel")}>
              <BarChart
                data={coins.dailyCoinRevenue}
                valueKey="total"
                labelKey="label"
                color="#fbbf24"
                emptyText={t("adminRevenue.chart.empty")}
              />
            </div>
          </section>

          {/* Recommended actions (cancellations / failed payments / churn) */}
          {(subs.pastDue > 0 || subs.canceledLast30Days > 2) && (
            <section className={cn("section")}>
              <div className={cn("sectionHeader")}>
                <span className={cn("sectionDot", "sectionDot--magenta")} />
                <h2 className={cn("sectionTitle")}>{t("adminRevenue.sections.recommendedActions")}</h2>
              </div>
              <div className={cn("actionsList")}>
                {subs.pastDue > 0 && (
                  <div className={cn("actionItem", "actionItem--warning")}>
                    <span className={cn("actionIcon")}><Icon name="alertTriangle" size={16} /></span>
                    <div>
                      <div className={cn("actionTitle")}>
                        {t("adminRevenue.actions.failedSubscriptions")
                          .replace("{count}", String(subs.pastDue))
                          .replace("{suffix}", subs.pastDue > 1 ? t("adminRevenue.actions.failedSubscriptionsPlural") : "")}
                      </div>
                      <div className={cn("actionDesc")}>
                        {t("adminRevenue.actions.failedSubscriptionsDesc")}
                      </div>
                    </div>
                  </div>
                )}
                {subs.canceledLast30Days > 2 && (
                  <div className={cn("actionItem", "actionItem--info")}>
                    <span className={cn("actionIcon")}><Icon name="trendingDown" size={16} /></span>
                    <div>
                      <div className={cn("actionTitle")}>{t("adminRevenue.actions.highChurn")}</div>
                      <div className={cn("actionDesc")}>
                        {t("adminRevenue.actions.highChurnDesc").replace("{count}", String(subs.canceledLast30Days))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Stripe checklist — collapsible, reference-only, never a verification claim */}
          <section className={cn("section")}>
            <div className={cn("checklistCard")}>
              <button
                type="button"
                className={cn("checklistToggle")}
                onClick={() => setChecklistOpen((open) => !open)}
                aria-expanded={checklistOpen}
              >
                <span className={cn("checklistToggleLeft")}>
                  <Icon name="shield" size={16} />
                  {t("adminRevenue.sections.stripeChecklist")}
                </span>
                <span>
                  <span style={{ marginRight: "0.5rem", fontWeight: 700, fontSize: "0.72rem", color: "#64748b" }}>
                    {checklistOpen ? t("adminRevenue.checklist.toggleHide") : t("adminRevenue.checklist.toggleShow")}
                  </span>
                  <Icon name="chevronDown" size={16} className={cn("checklistChevron", checklistOpen && "checklistChevron--open")} />
                </span>
              </button>
              {checklistOpen && (
                <div className={cn("checklistBody")}>
                  <p className={cn("checklistDisclaimer")}>{t("adminRevenue.checklist.disclaimer")}</p>
                  <div className={cn("checklistItems")}>
                    <div className={cn("checklistItem")}>
                      <span className={cn("checkIcon")}>1.</span>
                      <span>{t("adminRevenue.checklist.item1.before")} <strong>Live</strong> {t("adminRevenue.checklist.item1.after")}</span>
                    </div>
                    <div className={cn("checklistItem")}>
                      <span className={cn("checkIcon")}>2.</span>
                      <span>{t("adminRevenue.checklist.item2.before")} <code>STRIPE_SECRET_KEY</code> = <code>sk_live_…</code> {t("adminRevenue.checklist.item2.after")}</span>
                    </div>
                    <div className={cn("checklistItem")}>
                      <span className={cn("checkIcon")}>3.</span>
                      <span>{t("adminRevenue.checklist.item3.before")} <code>STRIPE_WEBHOOK_SECRET</code> {t("adminRevenue.checklist.item3.after")}</span>
                    </div>
                    <div className={cn("checklistItem")}>
                      <span className={cn("checkIcon")}>4.</span>
                      <span>{t("adminRevenue.checklist.item4.before")} <code>POST https://meetyoulive.onrender.com/api/webhooks/stripe</code></span>
                    </div>
                    <div className={cn("checklistItem")}>
                      <span className={cn("checkIcon")}>5.</span>
                      <span>
                        {t("adminRevenue.checklist.item5.before")}{" "}
                        <code>checkout.session.completed</code>,{" "}
                        <code>customer.subscription.deleted</code>,{" "}
                        <code>invoice.payment_failed</code>,{" "}
                        <code>invoice.payment_succeeded</code>
                      </span>
                    </div>
                    <div className={cn("checklistItem")}>
                      <span className={cn("checkIcon")}>6.</span>
                      <span>{t("adminRevenue.checklist.item6.before")} <code>STRIPE_SUBSCRIPTION_PRICE_ID</code> {t("adminRevenue.checklist.item6.after")}</span>
                    </div>
                    <div className={cn("checklistItem")}>
                      <span className={cn("checkIcon")}>7.</span>
                      <span>{t("adminRevenue.checklist.item7.before")} <a href="/terms" target="_blank" rel="noreferrer">/terms</a>, <a href="/privacy" target="_blank" rel="noreferrer">/privacy</a>, <a href="/payments-refunds" target="_blank" rel="noreferrer">/payments-refunds</a></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
