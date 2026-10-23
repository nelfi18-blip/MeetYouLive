"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getMonthKeys,
  getYearOptions,
  formatMinorUnits,
  formatUsd,
  formatCount,
  getStripeChargesSummaryStatus,
  getCoinsReconciliationStatus,
  getQuerySourceStatus,
  getReportNotices,
} from "@/lib/adminAccounting";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const TABS = ["summary", "stripe", "coins", "creators", "warnings"];

const STATUS_BADGE = {
  ok: { icon: "✅", className: "badge--ok" },
  partial: { icon: "⚠️", className: "badge--partial" },
  unavailable: { icon: "⛔", className: "badge--unavailable" },
};

function StatusBadge({ status, label }) {
  const badge = STATUS_BADGE[status] || STATUS_BADGE.unavailable;
  return (
    <span className={`status-badge ${badge.className}`}>
      {badge.icon} {label}
    </span>
  );
}

function Amount({ value }) {
  return <span className={value === null ? "amount amount--na" : "amount"}>{value ?? "—"}</span>;
}

function SectionCard({ title, status, statusLabel, children, note }) {
  return (
    <section className="section-card">
      <div className="section-card-header">
        <h2 className="section-card-title">{title}</h2>
        {status && <StatusBadge status={status} label={statusLabel} />}
      </div>
      {note && <p className="section-card-note">{note}</p>}
      {children}
    </section>
  );
}

/** Compact KPI card used in the Resumen tab. Never fabricates a value: pass `null` to show "—". */
function KpiCard({ icon, title, value, sub, status, statusLabel, accent }) {
  return (
    <div className={`kpi-card kpi-card--${accent || "violet"}`}>
      <div className="kpi-card-top">
        <span className="kpi-icon">{icon}</span>
        {status && <StatusBadge status={status} label={statusLabel} />}
      </div>
      <div className="kpi-value">
        <Amount value={value} />
      </div>
      <div className="kpi-title">{title}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/**
 * Horizontal, CSS-only bar chart for gross vs. fees per currency. Each bar
 * is scoped to ONE currency — amounts from different currencies are never
 * summed or compared on the same scale as a single total.
 */
function CurrencyDistributionChart({ entries, locale, emptyText, note }) {
  if (!entries.length) return <p className="section-empty">{emptyText}</p>;
  return (
    <div className="dist-chart">
      {entries.map(([code, bucket]) => {
        const gross = typeof bucket.grossMinorUnits === "number" ? bucket.grossMinorUnits : 0;
        const fees = typeof bucket.feeMinorUnits === "number" ? bucket.feeMinorUnits : 0;
        const max = Math.max(gross, 1);
        const feesPct = Math.min((fees / max) * 100, 100);
        const netPct = Math.max(100 - feesPct, 0);
        return (
          <div key={code} className="dist-row">
            <div className="dist-row-label">
              <span className="dist-currency">{code.toUpperCase()}</span>
              <span className="dist-amounts">
                <Amount value={formatMinorUnits(bucket.grossMinorUnits, code, locale)} />
              </span>
            </div>
            <div className="dist-track" role="img" aria-label={`${code.toUpperCase()} gross vs fees`}>
              <div className="dist-segment dist-segment--net" style={{ width: `${netPct}%` }} />
              <div className="dist-segment dist-segment--fees" style={{ width: `${feesPct}%` }} />
            </div>
          </div>
        );
      })}
      <div className="dist-legend">
        <span className="legend-item"><i className="legend-dot legend-dot--net" />{note.netLabel}</span>
        <span className="legend-item"><i className="legend-dot legend-dot--fees" />{note.feesLabel}</span>
      </div>
      <p className="section-card-note">{note.currencyNote}</p>
    </div>
  );
}

export default function AdminAccountingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const locale = t("common.locale");

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    const scheme = "Bearer";
    return { Authorization: `${scheme} ${token}` };
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/reports/financial/monthly?year=${year}&month=${month}`,
        { headers: authHeader() }
      );
      if (res.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        setReport(null);
        return;
      }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      if (!data || data.ok === false) {
        setError(t("adminAccounting.reportUnavailable"));
        setReport(null);
        return;
      }
      setReport(data);
    } catch {
      setError(t("adminAccounting.loadError"));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, t, year, month]);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthKeys = getMonthKeys();
  const yearOptions = getYearOptions(now.getFullYear(), 5);

  const stripeChargesSummary = report?.stripeChargesSummary;
  const coinsReconciliation = report?.coinsReconciliation;
  const payoutsPaidInPeriod = report?.creatorPayments?.payouts?.paidInPeriod;
  const payoutsPendingAsOfNow = report?.creatorPayments?.payouts?.pendingAsOfNow;
  const withdrawalsPaidLifetimeIncomplete = report?.creatorPayments?.withdrawalRequests?.paidLifetimeIncomplete;
  const withdrawalsPendingAsOfNow = report?.creatorPayments?.withdrawalRequests?.pendingAsOfNow;

  const stripeStatus = getStripeChargesSummaryStatus(stripeChargesSummary);
  const coinsStatus = getCoinsReconciliationStatus(coinsReconciliation);
  const payoutsPaidStatus = getQuerySourceStatus(payoutsPaidInPeriod);
  const payoutsPendingStatus = getQuerySourceStatus(payoutsPendingAsOfNow);
  const withdrawalsPaidStatus = getQuerySourceStatus(withdrawalsPaidLifetimeIncomplete);
  const withdrawalsPendingStatus = getQuerySourceStatus(withdrawalsPendingAsOfNow);

  const reportNotices = report ? getReportNotices(report) : [];
  const byCurrencyEntries = stripeChargesSummary?.byCurrency
    ? Object.entries(stripeChargesSummary.byCurrency)
    : [];

  const totalPurchaseCount = byCurrencyEntries.length
    ? byCurrencyEntries.reduce((sum, [, bucket]) => {
        return typeof bucket.purchaseCount === "number" ? sum + bucket.purchaseCount : sum;
      }, 0)
    : null;

  const hasCreatorMovements = Boolean(
    (payoutsPaidInPeriod?.count ?? 0) > 0 ||
      (withdrawalsPaidLifetimeIncomplete?.count ?? 0) > 0 ||
      (payoutsPendingAsOfNow?.count ?? 0) > 0 ||
      (withdrawalsPendingAsOfNow?.count ?? 0) > 0
  );

  const warningsCount =
    (Array.isArray(report?.warnings) ? report.warnings.length : 0) +
    (Array.isArray(report?.fiscalDisclaimer) ? report.fiscalDisclaimer.length : 0) +
    reportNotices.length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("adminAccounting.title")}</h1>
          <p className="page-sub">{t("adminAccounting.subtitle")}</p>
        </div>
      </div>

      <div className="controls-bar">
        <label className="control">
          <span>{t("adminAccounting.controls.year")}</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>{t("adminAccounting.controls.month")}</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {monthKeys.map((key, index) => (
              <option key={key} value={index + 1}>
                {t(`adminAccounting.months.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-refresh" onClick={loadReport} disabled={loading}>
          {loading ? "…" : `↺ ${t("adminAccounting.controls.refresh")}`}
        </button>
      </div>

      {forbidden && <div className="alert alert-error">{t("adminAccounting.noAdminPermissions")}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">{t("adminAccounting.loading")}</div>
      ) : !report && !forbidden && !error ? (
        <div className="loading-state">{t("adminAccounting.empty")}</div>
      ) : report ? (
        <>
          <section className="section-card period-card">
            <div className="period-echo">
              <span>
                {t("adminAccounting.period")}: {t(`adminAccounting.months.${monthKeys[report.period.month - 1]}`)}{" "}
                {report.period.year}
              </span>
              <span className={`overall-badge ${report.complete ? "overall-badge--ok" : "overall-badge--partial"}`}>
                {report.complete ? t("adminAccounting.status.complete") : t("adminAccounting.status.incomplete")}
              </span>
            </div>
            {report.completeScopeNote && (
              <div className="complete-scope-note">
                <span className="complete-scope-note-label">
                  ℹ️ {t("adminAccounting.notes.completeScopeNoteLabel")}
                </span>
                <p className="complete-scope-note-text">{report.completeScopeNote}</p>
              </div>
            )}
            {!report.complete && (
              <button className="partial-banner" onClick={() => setActiveTab("warnings")}>
                ⚠️ {t("adminAccounting.warningsSummary.partialBanner")}
              </button>
            )}
          </section>

          {/* Visual KPI summary — "—" instead of fabricated figures */}
          <div className="kpi-grid">
            <KpiCard
              icon="💳"
              accent="violet"
              title={t("adminAccounting.summaryCards.stripeCharges")}
              value={
                byCurrencyEntries.length === 1
                  ? formatMinorUnits(byCurrencyEntries[0][1].grossMinorUnits, byCurrencyEntries[0][0], locale)
                  : formatCount(totalPurchaseCount, locale)
              }
              sub={
                byCurrencyEntries.length > 1
                  ? `${byCurrencyEntries.length} ${t("adminAccounting.summaryCards.currenciesLabel").toLowerCase()}`
                  : byCurrencyEntries.length === 1
                  ? t("adminAccounting.summaryCards.purchasesLabel")
                  : null
              }
              status={stripeStatus}
              statusLabel={t(`adminAccounting.sourceStatus.${stripeStatus}`)}
            />
            <KpiCard
              icon="🧾"
              accent="magenta"
              title={t("adminAccounting.summaryCards.stripeFees")}
              value={
                byCurrencyEntries.length === 1
                  ? formatMinorUnits(byCurrencyEntries[0][1].feeMinorUnits, byCurrencyEntries[0][0], locale)
                  : null
              }
              sub={byCurrencyEntries.length > 1 ? t("adminAccounting.charts.byCurrencyTitle") : null}
              status={stripeStatus}
              statusLabel={t(`adminAccounting.sourceStatus.${stripeStatus}`)}
            />
            <KpiCard
              icon="👤"
              accent="blue"
              title={t("adminAccounting.summaryCards.creatorPayouts")}
              value={formatUsd(payoutsPaidInPeriod?.totalUsd, locale)}
              sub={
                payoutsPaidInPeriod
                  ? `${formatCount(payoutsPaidInPeriod.count, locale) ?? "—"} ${t("adminAccounting.fields.count").toLowerCase()}`
                  : null
              }
              status={payoutsPaidStatus}
              statusLabel={t(`adminAccounting.sourceStatus.${payoutsPaidStatus}`)}
            />
            <KpiCard
              icon="🔗"
              accent="violet"
              title={t("adminAccounting.summaryCards.reconciliation")}
              value={
                coinsStatus === "unavailable"
                  ? null
                  : coinsReconciliation?.reconciled
                  ? t("adminAccounting.yes")
                  : t("adminAccounting.no")
              }
              status={coinsStatus}
              statusLabel={t(`adminAccounting.sourceStatus.${coinsStatus}`)}
            />
          </div>

          <nav className="tabs-bar" aria-label={t("adminAccounting.tabsAriaLabel")}>
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`tab-btn${activeTab === tab ? " tab-btn--active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {t(`adminAccounting.tabs.${tab}`)}
                {tab === "warnings" && warningsCount > 0 && (
                  <span className="tab-count">{warningsCount}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="tab-panel">
            {activeTab === "summary" && (
              <>
                <SectionCard
                  title={t("adminAccounting.charts.distributionTitle")}
                  status={stripeStatus}
                  statusLabel={t(`adminAccounting.sourceStatus.${stripeStatus}`)}
                >
                  {stripeStatus === "unavailable" ? (
                    <p className="section-empty">{t("adminAccounting.notAvailable")}</p>
                  ) : (
                    <CurrencyDistributionChart
                      entries={byCurrencyEntries}
                      locale={locale}
                      emptyText={t("adminAccounting.charts.noData")}
                      note={{
                        netLabel: t("adminAccounting.charts.netLabel"),
                        feesLabel: t("adminAccounting.charts.feesLabel"),
                        currencyNote: t("adminAccounting.charts.currencyNote"),
                      }}
                    />
                  )}
                </SectionCard>

                {reportNotices.length > 0 && (
                  <SectionCard title={t("adminAccounting.warningsSummary.title")}>
                    <ul className="notice-list">
                      {reportNotices.map((key) => (
                        <li key={key} className="notice-item">
                          ⚠️ {t(`adminAccounting.notices.${key}`)}
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                )}
              </>
            )}

            {activeTab === "stripe" && (
              <>
                {/* Stripe charges & fees by currency */}
                <SectionCard
                  title={t("adminAccounting.sections.stripeCharges")}
                  status={stripeStatus}
                  statusLabel={t(`adminAccounting.sourceStatus.${stripeStatus}`)}
                >
                  {stripeStatus === "unavailable" ? (
                    <p className="section-empty">{t("adminAccounting.notAvailable")}</p>
                  ) : byCurrencyEntries.length === 0 ? (
                    <p className="section-empty">{t("adminAccounting.noMovements")}</p>
                  ) : (
                    <div className="currency-grid">
                      {byCurrencyEntries.map(([code, bucket]) => (
                        <div key={code} className="currency-card">
                          <div className="currency-code">
                            {code.toUpperCase()}
                            {bucket.isPartial && <span className="partial-tag">{t("adminAccounting.partialTag")}</span>}
                          </div>
                          <div className="currency-row">
                            <span>{t("adminAccounting.fields.gross")}</span>
                            <Amount value={formatMinorUnits(bucket.grossMinorUnits, code, locale)} />
                          </div>
                          <div className="currency-row">
                            <span>{t("adminAccounting.fields.fees")}</span>
                            <Amount value={formatMinorUnits(bucket.feeMinorUnits, code, locale)} />
                          </div>
                          <div className="currency-row">
                            <span>{t("adminAccounting.fields.chargesNet")}</span>
                            <Amount value={formatMinorUnits(bucket.chargesNetMinorUnits, code, locale)} />
                          </div>
                          <div className="currency-row">
                            <span>{t("adminAccounting.fields.purchaseCount")}</span>
                            <Amount value={formatCount(bucket.purchaseCount, locale)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                {/* Refunds */}
                <SectionCard
                  title={t("adminAccounting.sections.refunds")}
                  status={stripeStatus}
                  statusLabel={t(`adminAccounting.sourceStatus.${stripeStatus}`)}
                >
                  {stripeStatus === "unavailable" ? (
                    <p className="section-empty">{t("adminAccounting.notAvailable")}</p>
                  ) : byCurrencyEntries.length === 0 ? (
                    <p className="section-empty">{t("adminAccounting.noMovements")}</p>
                  ) : (
                    <div className="currency-grid">
                      {byCurrencyEntries.map(([code, bucket]) => (
                        <div key={code} className="currency-card">
                          <div className="currency-code">{code.toUpperCase()}</div>
                          <div className="currency-row">
                            <span>{t("adminAccounting.fields.refunded")}</span>
                            <Amount value={formatMinorUnits(bucket.refundedMinorUnits, code, locale)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </>
            )}

            {activeTab === "coins" && (
              <SectionCard
                title={t("adminAccounting.sections.coinsReconciliation")}
                status={coinsStatus}
                statusLabel={t(`adminAccounting.sourceStatus.${coinsStatus}`)}
                note={t("adminAccounting.notes.coinsScope")}
              >
                {coinsStatus === "unavailable" ? (
                  <p className="section-empty">{t("adminAccounting.notAvailable")}</p>
                ) : (
                  <>
                    <div className="kv-row">
                      <span>{t("adminAccounting.fields.reconciled")}</span>
                      <span>
                        {coinsReconciliation.reconciled ? t("adminAccounting.yes") : t("adminAccounting.no")}
                      </span>
                    </div>
                    <div className="kv-row">
                      <span>{t("adminAccounting.fields.pageCoverage")}</span>
                      <span>{coinsReconciliation.summary?.scope === "full_range"
                        ? t("adminAccounting.fullRange")
                        : t("adminAccounting.currentPageOnly")}</span>
                    </div>
                    {coinsReconciliation.discrepancies && (
                      <div className="kv-row">
                        <span>{t("adminAccounting.fields.discrepancies")}</span>
                        <Amount value={formatCount(coinsReconciliation.discrepancies.total, locale)} />
                      </div>
                    )}
                    {coinsReconciliation.summary?.byCurrency &&
                      Object.entries(coinsReconciliation.summary.byCurrency).map(([code, bucket]) => (
                        <div key={code} className="currency-card">
                          <div className="currency-code">{code.toUpperCase()}</div>
                          <div className="currency-row">
                            <span>{t("adminAccounting.fields.chargesNet")}</span>
                            <Amount value={formatMinorUnits(bucket.netMinorUnits, code, locale)} />
                          </div>
                        </div>
                      ))}
                  </>
                )}
              </SectionCard>
            )}

            {activeTab === "creators" && (
              <>
                {!hasCreatorMovements &&
                payoutsPaidStatus !== "unavailable" &&
                withdrawalsPaidStatus !== "unavailable" &&
                payoutsPendingStatus !== "unavailable" &&
                withdrawalsPendingStatus !== "unavailable" ? (
                  <div className="empty-state-card">
                    <span className="empty-state-icon">🪙</span>
                    <p className="empty-state-text">{t("adminAccounting.emptyCreators")}</p>
                  </div>
                ) : (
                  <>
                    {/* Payouts paid in period */}
                    <SectionCard
                      title={t("adminAccounting.sections.payoutsPaid")}
                      status={payoutsPaidStatus}
                      statusLabel={t(`adminAccounting.sourceStatus.${payoutsPaidStatus}`)}
                    >
                      {payoutsPaidStatus === "unavailable" ? (
                        <p className="section-empty">{t("adminAccounting.notAvailable")}</p>
                      ) : (
                        <>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.totalCoins")}</span>
                            <Amount value={formatCount(payoutsPaidInPeriod.totalCoins, locale)} />
                          </div>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.totalUsd")}</span>
                            <Amount value={formatUsd(payoutsPaidInPeriod.totalUsd, locale)} />
                          </div>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.count")}</span>
                            <Amount value={formatCount(payoutsPaidInPeriod.count, locale)} />
                          </div>
                          {payoutsPaidInPeriod.historicalIncomplete && (
                            <p className="section-empty">
                              ⚠️ {t("adminAccounting.notices.payoutsPaidHistoricalIncomplete")}
                            </p>
                          )}
                        </>
                      )}
                    </SectionCard>

                    {/* Historical withdrawals not attributable to this month */}
                    <SectionCard
                      title={t("adminAccounting.sections.withdrawalsHistorical")}
                      status={withdrawalsPaidStatus}
                      statusLabel={t(`adminAccounting.sourceStatus.${withdrawalsPaidStatus}`)}
                      note={t("adminAccounting.notes.withdrawalsLifetime")}
                    >
                      {withdrawalsPaidStatus === "unavailable" ? (
                        <p className="section-empty">{t("adminAccounting.notAvailable")}</p>
                      ) : (
                        <>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.totalCoins")}</span>
                            <Amount value={formatCount(withdrawalsPaidLifetimeIncomplete.totalCoins, locale)} />
                          </div>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.totalUsd")}</span>
                            <Amount value={formatUsd(withdrawalsPaidLifetimeIncomplete.totalUsd, locale)} />
                          </div>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.count")}</span>
                            <Amount value={formatCount(withdrawalsPaidLifetimeIncomplete.count, locale)} />
                          </div>
                        </>
                      )}
                    </SectionCard>

                    {/* Pending obligations as of now */}
                    <SectionCard
                      title={t("adminAccounting.sections.pendingObligations")}
                      note={t("adminAccounting.notes.asOfNow")}
                    >
                      <h3 className="subsection-title">
                        {t("adminAccounting.fields.payouts")}{" "}
                        <StatusBadge status={payoutsPendingStatus} label={t(`adminAccounting.sourceStatus.${payoutsPendingStatus}`)} />
                      </h3>
                      {payoutsPendingStatus === "unavailable" ? (
                        <p className="section-empty">{t("adminAccounting.notAvailable")}</p>
                      ) : (
                        <>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.totalCoins")}</span>
                            <Amount value={formatCount(payoutsPendingAsOfNow.totalCoins, locale)} />
                          </div>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.totalUsd")}</span>
                            <Amount value={formatUsd(payoutsPendingAsOfNow.totalUsd, locale)} />
                          </div>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.count")}</span>
                            <Amount value={formatCount(payoutsPendingAsOfNow.count, locale)} />
                          </div>
                        </>
                      )}

                      <h3 className="subsection-title">
                        {t("adminAccounting.fields.withdrawals")}{" "}
                        <StatusBadge status={withdrawalsPendingStatus} label={t(`adminAccounting.sourceStatus.${withdrawalsPendingStatus}`)} />
                      </h3>
                      {withdrawalsPendingStatus === "unavailable" ? (
                        <p className="section-empty">{t("adminAccounting.notAvailable")}</p>
                      ) : (
                        <>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.totalCoins")}</span>
                            <Amount value={formatCount(withdrawalsPendingAsOfNow.totalCoins, locale)} />
                          </div>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.totalUsd")}</span>
                            <Amount value={formatUsd(withdrawalsPendingAsOfNow.totalUsd, locale)} />
                          </div>
                          <div className="kv-row">
                            <span>{t("adminAccounting.fields.count")}</span>
                            <Amount value={formatCount(withdrawalsPendingAsOfNow.count, locale)} />
                          </div>
                        </>
                      )}
                      <p className="section-empty">{t("adminAccounting.notes.noSumming")}</p>
                    </SectionCard>
                  </>
                )}
              </>
            )}

            {activeTab === "warnings" && (
              <SectionCard title={t("adminAccounting.sections.warnings")}>
                {reportNotices.length > 0 ? (
                  <ul className="notice-list">
                    {reportNotices.map((key) => (
                      <li key={key} className="notice-item">
                        ⚠️ {t(`adminAccounting.notices.${key}`)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="section-empty">{t("adminAccounting.warningsSummary.none")}</p>
                )}

                {((Array.isArray(report.warnings) && report.warnings.length > 0) ||
                  (Array.isArray(report.fiscalDisclaimer) && report.fiscalDisclaimer.length > 0)) && (
                  <details
                    className="warnings-details"
                    open={warningsExpanded}
                    onToggle={(e) => setWarningsExpanded(e.target.open)}
                  >
                    <summary className="warnings-summary-toggle">
                      {warningsExpanded
                        ? t("adminAccounting.warningsSummary.hideDetails")
                        : t("adminAccounting.warningsSummary.viewDetails")}
                    </summary>
                    <p className="section-card-note">{t("adminAccounting.notes.backendTextDisclaimer")}</p>
                    {Array.isArray(report.warnings) && report.warnings.length > 0 && (
                      <ul className="notice-list">
                        {report.warnings.map((warning, i) => (
                          <li key={i} className="notice-item">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    )}
                    {Array.isArray(report.fiscalDisclaimer) && report.fiscalDisclaimer.length > 0 && (
                      <ul className="notice-list">
                        {report.fiscalDisclaimer.map((line, i) => (
                          <li key={i} className="notice-item">
                            {line}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                )}
              </SectionCard>
            )}
          </div>
        </>
      ) : null}

      <style jsx>{`
        .page { max-width: 1200px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1rem; gap: 1rem; }
        .page-title {
          font-size: 1.5rem;
          font-weight: 800;
          margin: 0 0 0.2rem;
          background: linear-gradient(90deg, #c4b5fd, #f472b6, #60a5fa);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .page-sub { font-size: 0.85rem; color: #64748b; margin: 0; }
        .controls-bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.85rem; margin-bottom: 1.5rem; }
        .control { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.75rem; color: #94a3b8; }
        .control select { background: #161b27; border: 1px solid #2d3748; color: #e2e8f0; border-radius: 8px; padding: 0.6rem 0.65rem; font-size: 0.85rem; font-family: inherit; min-width: 120px; min-height: 44px; }
        .btn-refresh { background: linear-gradient(135deg, #7c3aed, #a855f7); border: 1px solid #7c3aed; color: #fff; border-radius: 8px; padding: 0.6rem 1.1rem; font-size: 0.85rem; cursor: pointer; font-family: inherit; white-space: nowrap; min-height: 44px; }
        .btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }
        .alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; margin-bottom: 1rem; }
        .alert-error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
        .loading-state { text-align: center; padding: 3rem; color: #64748b; }
        .section-card { background: #161b27; border: 1px solid #1e2535; border-radius: 14px; padding: 1.25rem 1.4rem; margin-bottom: 1.25rem; }
        .period-card { margin-bottom: 1.1rem; }
        .section-card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.65rem; }
        .section-card-title { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #c4b5fd; margin: 0; }
        .section-card-note { font-size: 0.78rem; color: #64748b; margin: 0 0 0.75rem; line-height: 1.45; }
        .section-empty { font-size: 0.82rem; color: #64748b; margin: 0.25rem 0; }
        .subsection-title { font-size: 0.78rem; color: #94a3b8; margin: 0.9rem 0 0.5rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .period-echo { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.6rem; font-size: 0.85rem; color: #94a3b8; }
        .overall-badge { font-size: 0.72rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 999px; }
        .overall-badge--ok { background: rgba(34,197,94,0.15); color: #4ade80; }
        .overall-badge--partial { background: rgba(251,191,36,0.15); color: #fbbf24; }
        .complete-scope-note { margin-top: 0.75rem; padding: 0.75rem 0.9rem; background: rgba(124,58,237,0.08); border: 1px solid rgba(124,58,237,0.25); border-radius: 10px; }
        .complete-scope-note-label { display: block; font-size: 0.72rem; font-weight: 700; color: #c4b5fd; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.04em; }
        .complete-scope-note-text { margin: 0; font-size: 0.78rem; color: #94a3b8; line-height: 1.5; word-break: break-word; }
        .partial-banner {
          display: block;
          width: 100%;
          margin-top: 0.85rem;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          color: #fbbf24;
          border-radius: 10px;
          padding: 0.65rem 0.85rem;
          font-size: 0.8rem;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          min-height: 44px;
        }
        .status-badge { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 999px; white-space: nowrap; }
        .badge--ok { background: rgba(34,197,94,0.15); color: #4ade80; }
        .badge--partial { background: rgba(251,191,36,0.15); color: #fbbf24; }
        .badge--unavailable { background: rgba(239,68,68,0.15); color: #f87171; }
        .notice-list { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
        .notice-item { font-size: 0.78rem; color: #fbbf24; line-height: 1.45; }
        .currency-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
        .currency-card { background: #0f131d; border: 1px solid #1e2535; border-radius: 10px; padding: 0.85rem 1rem; }
        .currency-code { font-size: 0.8rem; font-weight: 700; color: #c084fc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
        .partial-tag { font-size: 0.65rem; font-weight: 700; color: #fbbf24; background: rgba(251,191,36,0.12); padding: 0.1rem 0.4rem; border-radius: 999px; }
        .currency-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.78rem; color: #94a3b8; padding: 0.15rem 0; }
        .kv-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; color: #94a3b8; padding: 0.3rem 0; border-bottom: 1px solid #1e2535; }
        .kv-row:last-of-type { border-bottom: none; }
        .amount { color: #e2e8f0; font-weight: 600; }
        .amount--na { color: #64748b; font-weight: 400; font-style: italic; }

        /* KPI summary cards */
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1.1rem; }
        .kpi-card { background: #161b27; border: 1px solid #1e2535; border-radius: 14px; padding: 1rem 1.1rem; position: relative; overflow: hidden; }
        .kpi-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 3px;
        }
        .kpi-card--violet::before { background: linear-gradient(90deg, #7c3aed, #a855f7); }
        .kpi-card--magenta::before { background: linear-gradient(90deg, #d946ef, #f472b6); }
        .kpi-card--blue::before { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
        .kpi-card-top { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-bottom: 0.5rem; }
        .kpi-icon { font-size: 1.3rem; }
        .kpi-value { font-size: 1.3rem; font-weight: 800; line-height: 1.1; }
        .kpi-title { font-size: 0.75rem; color: #94a3b8; margin-top: 0.3rem; }
        .kpi-sub { font-size: 0.68rem; color: #64748b; margin-top: 0.15rem; }

        /* Tabs */
        .tabs-bar { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.25rem; margin-bottom: 1.1rem; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .tabs-bar::-webkit-scrollbar { display: none; }
        .tab-btn {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: #161b27;
          border: 1px solid #1e2535;
          color: #94a3b8;
          border-radius: 999px;
          padding: 0.6rem 1.1rem;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          min-height: 44px;
          white-space: nowrap;
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }
        .tab-btn--active {
          background: linear-gradient(90deg, rgba(124,58,237,0.35), rgba(244,114,182,0.25));
          border-color: #a855f7;
          color: #f3e8ff;
        }
        .tab-count { background: rgba(251,191,36,0.2); color: #fbbf24; font-size: 0.68rem; font-weight: 700; border-radius: 999px; padding: 0.05rem 0.4rem; }

        /* Distribution chart (CSS-only, no charting library) */
        .dist-chart { display: flex; flex-direction: column; gap: 0.75rem; }
        .dist-row { display: flex; flex-direction: column; gap: 0.3rem; }
        .dist-row-label { display: flex; align-items: center; justify-content: space-between; font-size: 0.78rem; color: #94a3b8; }
        .dist-currency { font-weight: 700; color: #c084fc; }
        .dist-track { display: flex; width: 100%; height: 14px; border-radius: 999px; overflow: hidden; background: #0f131d; border: 1px solid #1e2535; }
        .dist-segment { height: 100%; transition: width 0.4s ease; }
        .dist-segment--net { background: linear-gradient(90deg, #7c3aed, #3b82f6); }
        .dist-segment--fees { background: linear-gradient(90deg, #f472b6, #fbbf24); }
        .dist-legend { display: flex; gap: 1rem; margin-top: 0.25rem; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; color: #94a3b8; }
        .legend-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
        .legend-dot--net { background: linear-gradient(90deg, #7c3aed, #3b82f6); }
        .legend-dot--fees { background: linear-gradient(90deg, #f472b6, #fbbf24); }

        /* Empty states */
        .empty-state-card { text-align: center; padding: 2.5rem 1.25rem; background: #161b27; border: 1px dashed #2d3748; border-radius: 14px; }
        .empty-state-icon { font-size: 2rem; display: block; margin-bottom: 0.6rem; }
        .empty-state-text { font-size: 0.85rem; color: #64748b; margin: 0; }

        /* Expandable warnings details */
        .warnings-details { margin-top: 0.85rem; border-top: 1px solid #1e2535; padding-top: 0.75rem; }
        .warnings-summary-toggle {
          cursor: pointer;
          font-size: 0.78rem;
          font-weight: 700;
          color: #60a5fa;
          list-style: none;
          min-height: 44px;
          display: flex;
          align-items: center;
        }
        .warnings-summary-toggle::-webkit-details-marker { display: none; }

        @media (max-width: 640px) {
          .page-header { flex-direction: column; }
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .controls-bar { gap: 0.6rem; }
          .control select { min-width: 100px; }
        }
      `}</style>
    </div>
  );
}
