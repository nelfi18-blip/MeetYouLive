"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatCount, formatMinorUnits, formatUsd } from "@/lib/adminAccounting";
import {
  getAnnualCoverage,
  getAnnualCurrencyEntries,
  getAnnualMonthRows,
  getAnnualSourceStatus,
  getAnnualYearOptions,
} from "@/lib/adminAnnualAccounting";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const CURRENCY_FIELDS = [
  ["grossMinorUnits", "gross"],
  ["feeMinorUnits", "fees"],
  ["chargesNetMinorUnits", "chargesNet"],
  ["netMinorUnits", "net"],
  ["refundedMinorUnits", "refunded"],
  ["purchaseCount", "purchaseCount"],
];
const STRIPE_CHARGE_FIELDS = CURRENCY_FIELDS.filter(([field]) => field !== "feeMinorUnits");
const STRIPE_FEE_FIELDS = CURRENCY_FIELDS.filter(([field]) => field === "feeMinorUnits");

const STATUS_CLASS = {
  complete: "status--complete",
  partial: "status--partial",
  unavailable: "status--unavailable",
};

function Amount({ value }) {
  return <span className={value === null || value === undefined ? "amount amount--na" : "amount"}>{value ?? "—"}</span>;
}

function StatusBadge({ status, label }) {
  return <span className={`status-badge ${STATUS_CLASS[status] || STATUS_CLASS.unavailable}`}>{label}</span>;
}

function SectionCard({ title, status, statusLabel, note, children }) {
  return (
    <section className="section-card">
      <div className="section-header">
        <h2>{title}</h2>
        {status && <StatusBadge status={status} label={statusLabel} />}
      </div>
      {note && <p className="section-note">{note}</p>}
      {children}
    </section>
  );
}

function CoverageDetails({ source, t, months }) {
  const coverage = getAnnualCoverage(source);
  if (coverage.status === "complete") return null;

  const groups = [
    ["completeMonths", coverage.completeMonths],
    ["partialMonths", coverage.partialMonths],
    ["missingMonths", coverage.missingMonths],
  ].filter(([, values]) => values?.length);

  return (
    <div className="coverage-details" aria-label={t("adminAccounting.annual.coverageDetails")}>
      {groups.map(([key, values]) => (
        <p key={key}>
          <strong>{t(`adminAccounting.annual.${key}`)}:</strong>{" "}
          {values.map((month) => t(`adminAccounting.months.${months[month - 1].key}`)).join(", ")}
        </p>
      ))}
    </div>
  );
}

function CurrencyCards({ source, isCoins, locale, t, fieldsToShow = CURRENCY_FIELDS }) {
  const entries = getAnnualCurrencyEntries(source);
  if (getAnnualSourceStatus(source) === "unavailable") {
    return <p className="empty-state">{t("adminAccounting.notAvailable")}</p>;
  }
  if (!entries.length) return <p className="empty-state">{t("adminAccounting.noMovements")}</p>;

  return (
    <div className="currency-grid">
      {entries.map(([code, bucket]) => {
        const fields = isCoins ? bucket?.fields : bucket;
        return (
          <div className="currency-card" key={code}>
            <h3>{code.toUpperCase()}</h3>
            {fieldsToShow.filter(([field]) => fields && Object.hasOwn(fields, field)).map(([field, label]) => (
              <div className="data-row" key={field}>
                <span>{t(`adminAccounting.fields.${label}`)}</span>
                <Amount
                  value={
                    field === "purchaseCount"
                      ? formatCount(fields[field], locale)
                      : formatMinorUnits(fields[field], code, locale)
                  }
                />
              </div>
            ))}
            <div className="data-row">
              <span>{t("adminAccounting.annual.monthsIncluded")}</span>
              <Amount value={formatCount(bucket?.monthsIncluded, locale)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaymentSnapshotCard({ title, source, locale, t, note }) {
  const available = Boolean(source) && source.available !== false;
  const status = available ? "complete" : "unavailable";

  return (
    <SectionCard
      title={title}
      status={status}
      statusLabel={t(`adminAccounting.annual.snapshotStatus.${status}`)}
      note={note}
    >
      {!available ? (
        <p className="empty-state">{t("adminAccounting.notAvailable")}</p>
      ) : (
        <>
          <div className="data-row">
            <span>{t("adminAccounting.fields.totalCoins")}</span>
            <Amount value={formatCount(source.totalCoins, locale)} />
          </div>
          <div className="data-row">
            <span>{t("adminAccounting.fields.totalUsd")}</span>
            <Amount value={formatUsd(source.totalUsd, locale)} />
          </div>
          <div className="data-row">
            <span>{t("adminAccounting.fields.count")}</span>
            <Amount value={formatCount(source.count, locale)} />
          </div>
        </>
      )}
    </SectionCard>
  );
}

export default function AdminAnnualAccountingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const locale = t("common.locale");
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const years = getAnnualYearOptions(now.getFullYear());
  const months = getAnnualMonthRows(report?.months);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`${API_URL}/api/admin/reports/financial/annual?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      if (response.status === 403) {
        setForbidden(true);
        setReport(null);
        return;
      }
      if (!response.ok) {
        setError(t("adminAccounting.annual.loadError"));
        setReport(null);
        return;
      }
      const data = await response.json();
      if (!data || data.ok !== true) {
        setError(t("adminAccounting.annual.reportUnavailable"));
        setReport(null);
        return;
      }
      setReport(data);
    } catch {
      setError(t("adminAccounting.annual.loadError"));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [router, t, year]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const annualTotals = report?.annualTotals;
  const stripe = annualTotals?.stripeCharges;
  const coins = annualTotals?.coinsReconciliation;
  const creatorPayouts = annualTotals?.creatorPayoutsPaidInPeriod;
  const snapshot = report?.creatorPaymentsSnapshot;
  const reportStatus = report?.complete === true ? "complete" : "partial";
  const stripeStatus = getAnnualSourceStatus(stripe);
  const coinsStatus = getAnnualSourceStatus(coins);
  const payoutsStatus = getAnnualSourceStatus(creatorPayouts);
  const payoutSnapshot = snapshot?.payoutsPendingAsOfNow;
  const withdrawalSnapshot = snapshot?.withdrawalRequestsPendingAsOfNow;
  const historicalWithdrawals = snapshot?.withdrawalRequestsPaidLifetimeIncomplete;
  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  const fiscalDisclaimer = Array.isArray(report?.fiscalDisclaimer) ? report.fiscalDisclaimer : [];
  const monthWarnings = months.filter((month) => month.status !== "complete");
  const monthName = (month) => t(`adminAccounting.months.${month.key}`);

  return (
    <div className="annual-page">
      <header className="page-header">
        <div>
          <h1>{t("adminAccounting.annual.title")}</h1>
          <p>{t("adminAccounting.annual.subtitle")}</p>
        </div>
      </header>

      <nav className="period-nav" aria-label={t("adminAccounting.annual.navigationLabel")}>
        <Link href="/admin/accounting">{t("adminAccounting.annual.monthly")}</Link>
        <span aria-current="page">{t("adminAccounting.annual.annual")}</span>
      </nav>

      <div className="controls">
        <label>
          <span>{t("adminAccounting.controls.year")}</span>
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button type="button" onClick={loadReport} disabled={loading}>
          {loading ? "…" : `↺ ${t("adminAccounting.controls.refresh")}`}
        </button>
      </div>

      {forbidden && <div className="alert">{t("adminAccounting.noAdminPermissions")}</div>}
      {error && <div className="alert">{error}</div>}
      {loading && <p className="loading">{t("adminAccounting.annual.loading")}</p>}

      {!loading && report && (
        <>
          <SectionCard
            title={`${t("adminAccounting.annual.period")} ${report.period?.year ?? year}`}
            status={reportStatus}
            statusLabel={t(`adminAccounting.annual.coverageStatus.${reportStatus}`)}
            note={report.completeScopeNote || t("adminAccounting.annual.completeScopeFallback")}
          >
            {reportStatus === "partial" && (
              <p className="warning-banner">{t("adminAccounting.annual.partialWarning")}</p>
            )}
          </SectionCard>

          <SectionCard
            title={t("adminAccounting.sections.stripeCharges")}
            status={stripeStatus}
            statusLabel={t(`adminAccounting.annual.sourceStatus.${stripeStatus}`)}
            note={stripeStatus === "partial" ? stripe?.note : t("adminAccounting.annual.stripeSemantics")}
          >
            <CoverageDetails source={stripe} t={t} months={months} />
            <CurrencyCards source={stripe} locale={locale} t={t} fieldsToShow={STRIPE_CHARGE_FIELDS} />
          </SectionCard>

          <SectionCard
            title={t("adminAccounting.summaryCards.stripeFees")}
            status={stripeStatus}
            statusLabel={t(`adminAccounting.annual.sourceStatus.${stripeStatus}`)}
            note={stripeStatus === "partial" ? stripe?.note : t("adminAccounting.annual.feeSemantics")}
          >
            <CoverageDetails source={stripe} t={t} months={months} />
            <CurrencyCards source={stripe} locale={locale} t={t} fieldsToShow={STRIPE_FEE_FIELDS} />
          </SectionCard>

          <SectionCard
            title={t("adminAccounting.sections.coinsReconciliation")}
            status={coinsStatus}
            statusLabel={t(`adminAccounting.annual.sourceStatus.${coinsStatus}`)}
            note={coinsStatus === "partial" ? coins?.note : t("adminAccounting.annual.coinsSemantics")}
          >
            <div className="data-row">
              <span>{t("adminAccounting.fields.reconciled")}</span>
              <Amount
                value={
                  typeof coins?.reconciled === "boolean"
                    ? coins.reconciled
                      ? t("adminAccounting.yes")
                      : t("adminAccounting.no")
                    : null
                }
              />
            </div>
            {coinsStatus !== "unavailable" && coins?.reconciled !== true && coins?.reconciledNote && (
              <p className="section-note">{coins.reconciledNote}</p>
            )}
            <CoverageDetails source={coins} t={t} months={months} />
            <CurrencyCards source={coins} isCoins locale={locale} t={t} />
          </SectionCard>

          <SectionCard
            title={t("adminAccounting.annual.payoutsPaidTitle")}
            status={payoutsStatus}
            statusLabel={t(`adminAccounting.annual.sourceStatus.${payoutsStatus}`)}
            note={payoutsStatus === "partial" ? creatorPayouts?.note : creatorPayouts?.source}
          >
            <CoverageDetails source={creatorPayouts} t={t} months={months} />
            {payoutsStatus === "unavailable" ? (
              <p className="empty-state">{t("adminAccounting.notAvailable")}</p>
            ) : (
              <>
                <div className="data-row">
                  <span>{t("adminAccounting.fields.totalCoins")}</span>
                  <Amount value={formatCount(creatorPayouts?.totalCoins, locale)} />
                </div>
                <div className="data-row">
                  <span>{t("adminAccounting.fields.totalUsd")}</span>
                  <Amount value={formatUsd(creatorPayouts?.totalUsd, locale)} />
                </div>
                <div className="data-row">
                  <span>{t("adminAccounting.fields.count")}</span>
                  <Amount value={formatCount(creatorPayouts?.count, locale)} />
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard
            title={t("adminAccounting.sections.pendingObligations")}
            note={snapshot?.scopeNote || t("adminAccounting.annual.snapshotNote")}
          >
            {!snapshot || snapshot.available === false ? (
              <p className="empty-state">{t("adminAccounting.notAvailable")}</p>
            ) : (
              <div className="snapshot-grid">
                <PaymentSnapshotCard
                  title={t("adminAccounting.fields.payouts")}
                  source={payoutSnapshot}
                  locale={locale}
                  t={t}
                  note={t("adminAccounting.annual.currentSnapshot")}
                />
                <PaymentSnapshotCard
                  title={t("adminAccounting.fields.withdrawals")}
                  source={withdrawalSnapshot}
                  locale={locale}
                  t={t}
                  note={t("adminAccounting.annual.currentSnapshot")}
                />
                <PaymentSnapshotCard
                  title={t("adminAccounting.sections.withdrawalsHistorical")}
                  source={historicalWithdrawals}
                  locale={locale}
                  t={t}
                  note={t("adminAccounting.annual.historicalWithdrawalNote")}
                />
                <SectionCard
                  title={t("adminAccounting.annual.payoutsWithoutDate")}
                  status={snapshot.payoutsPaidWithoutPaidAt ? "partial" : "complete"}
                  statusLabel={snapshot.payoutsPaidWithoutPaidAt
                    ? t("adminAccounting.annual.sourceStatus.partial")
                    : t("adminAccounting.annual.snapshotStatus.complete")}
                  note={t("adminAccounting.annual.historicalPayoutNote")}
                >
                  <div className="data-row">
                    <span>{t("adminAccounting.fields.count")}</span>
                    <Amount value={formatCount(snapshot.payoutsPaidWithoutPaidAt?.count, locale)} />
                  </div>
                </SectionCard>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={t("adminAccounting.annual.monthsTitle")}
            status={monthWarnings.length ? "partial" : "complete"}
            statusLabel={monthWarnings.length
              ? t("adminAccounting.annual.monthsNeedReview")
              : t("adminAccounting.annual.monthsAvailable")}
          >
            <div className="month-grid">
              {months.map((month) => (
                <details className={`month-card month-card--${month.status}`} key={month.month}>
                  <summary>
                    <span>{monthName(month)}</span>
                    <StatusBadge
                      status={month.status}
                      label={t(`adminAccounting.annual.monthStatus.${month.status}`)}
                    />
                  </summary>
                  {month.warnings.length > 0 && (
                    <ul>{month.warnings.map((warning, index) => <li key={`${month.month}-${index}`}>{warning}</li>)}</ul>
                  )}
                </details>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={t("adminAccounting.sections.warnings")}>
            {warnings.length === 0 && fiscalDisclaimer.length === 0 ? (
              <p className="empty-state">{t("adminAccounting.annual.noWarnings")}</p>
            ) : (
              <ul className="warning-list">
                {warnings.map((warning, index) => <li key={`warning-${index}`}>{warning}</li>)}
                {fiscalDisclaimer.map((warning, index) => <li key={`disclaimer-${index}`}>{warning}</li>)}
              </ul>
            )}
            {monthWarnings.length > 0 && (
              <p className="warning-banner">{t("adminAccounting.annual.monthsWarning")}</p>
            )}
          </SectionCard>
        </>
      )}

      <style jsx>{`
        .annual-page { max-width: 1200px; }
        .page-header { margin-bottom: 1rem; }
        .page-header h1 { margin: 0 0 .25rem; font-size: 1.5rem; font-weight: 800; background: linear-gradient(90deg,#c4b5fd,#f472b6); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .page-header p { margin: 0; color: #94a3b8; font-size: .86rem; }
        .period-nav { display: flex; gap: .5rem; margin-bottom: 1rem; }
        .period-nav a, .period-nav span { display: inline-flex; align-items: center; min-height: 42px; padding: .45rem .9rem; border-radius: 999px; border: 1px solid #342943; color: #c4b5fd; text-decoration: none; font-size: .82rem; }
        .period-nav span { background: linear-gradient(90deg,rgba(124,58,237,.3),rgba(244,114,182,.2)); border-color: #a855f7; color: #fce7f3; }
        .controls { display: flex; align-items: end; gap: .75rem; margin-bottom: 1.2rem; }
        .controls label { display: flex; flex-direction: column; gap: .3rem; color: #94a3b8; font-size: .75rem; }
        .controls select, .controls button { min-height: 44px; border-radius: 8px; border: 1px solid #373047; background: #161b27; color: #e2e8f0; padding: .55rem .75rem; font: inherit; }
        .controls button { cursor: pointer; background: linear-gradient(135deg,#7c3aed,#c026d3); border-color: #8b5cf6; color: white; }
        .controls button:disabled { opacity: .6; cursor: wait; }
        .alert, .warning-banner { border: 1px solid rgba(251,191,36,.35); background: rgba(251,191,36,.1); color: #fbbf24; padding: .7rem .85rem; border-radius: 9px; margin: 0 0 1rem; font-size: .82rem; }
        .loading, .empty-state { color: #94a3b8; font-size: .82rem; }
        .section-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .6rem; margin-bottom: .65rem; }
        .section-header h2 { margin: 0; font-size: .9rem; color: #ddd6fe; }
        .section-note { margin: 0 0 .7rem; color: #94a3b8; font-size: .77rem; line-height: 1.5; overflow-wrap: anywhere; }
        .coverage-details { display: flex; gap: .4rem 1rem; flex-wrap: wrap; margin: 0 0 .7rem; }
        .coverage-details p { margin: 0; font-size: .75rem; color: #fbbf24; }
        .currency-grid, .snapshot-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,250px),1fr)); gap: .75rem; }
        .currency-card { border: 1px solid #292638; border-radius: 10px; background: #0f131d; padding: .8rem; }
        .currency-card h3 { color: #d8b4fe; margin: 0 0 .55rem; font-size: .85rem; }
        .data-row { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; border-bottom: 1px solid #282638; padding: .4rem 0; font-size: .78rem; color: #aab3c2; }
        .data-row:last-child { border-bottom: 0; }
        .month-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: .55rem; }
        .month-card { border: 1px solid #292638; border-radius: 9px; background: #0f131d; padding: .65rem .75rem; }
        .month-card--partial { border-color: rgba(251,191,36,.35); }
        .month-card--unavailable { border-color: rgba(248,113,113,.4); }
        .month-card summary { display: flex; align-items: center; justify-content: space-between; gap: .5rem; cursor: pointer; font-size: .8rem; }
        .month-card ul, .warning-list { color: #fbbf24; font-size: .76rem; line-height: 1.5; padding-left: 1.25rem; overflow-wrap: anywhere; }
        :global(.section-card) { background: #161b27; border: 1px solid #252b3b; border-radius: 14px; padding: 1rem; margin-bottom: .85rem; }
        :global(.status-badge) { display: inline-flex; border-radius: 999px; padding: .25rem .6rem; font-size: .69rem; font-weight: 700; white-space: nowrap; }
        :global(.status--complete) { background: rgba(34,197,94,.14); color: #4ade80; }
        :global(.status--partial) { background: rgba(251,191,36,.14); color: #fbbf24; }
        :global(.status--unavailable) { background: rgba(248,113,113,.14); color: #f87171; }
        :global(.amount) { color: #e2e8f0; font-weight: 650; text-align: right; }
        :global(.amount--na) { color: #64748b; font-weight: 400; }
        @media (max-width: 600px) {
          .controls { align-items: stretch; }
          .controls label { flex: 1; }
          .controls select { width: 100%; }
          .controls button { flex: 0 0 auto; }
        }
      `}</style>
    </div>
  );
}
