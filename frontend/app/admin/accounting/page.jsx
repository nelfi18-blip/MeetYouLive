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
          <section className="section-card">
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
            {reportNotices.length > 0 && (
              <ul className="notice-list">
                {reportNotices.map((key) => (
                  <li key={key} className="notice-item">
                    ⚠️ {t(`adminAccounting.notices.${key}`)}
                  </li>
                ))}
              </ul>
            )}
          </section>

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

          {/* Coins reconciliation */}
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

          {/* Warnings & limitations (backend-authored text, shown as-is) */}
          <SectionCard title={t("adminAccounting.sections.warnings")}>
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
          </SectionCard>
        </>
      ) : null}

      <style jsx>{`
        .page { max-width: 1200px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; gap: 1rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; margin: 0 0 0.2rem; }
        .page-sub { font-size: 0.85rem; color: #64748b; margin: 0; }
        .controls-bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.85rem; margin-bottom: 1.5rem; }
        .control { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.75rem; color: #94a3b8; }
        .control select { background: #161b27; border: 1px solid #2d3748; color: #e2e8f0; border-radius: 8px; padding: 0.5rem 0.65rem; font-size: 0.85rem; font-family: inherit; min-width: 120px; }
        .btn-refresh { background: #7c3aed; border: 1px solid #7c3aed; color: #fff; border-radius: 8px; padding: 0.55rem 1.1rem; font-size: 0.85rem; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }
        .alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; margin-bottom: 1rem; }
        .alert-error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
        .loading-state { text-align: center; padding: 3rem; color: #64748b; }
        .section-card { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1.25rem 1.4rem; margin-bottom: 1.25rem; }
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
      `}</style>
    </div>
  );
}
