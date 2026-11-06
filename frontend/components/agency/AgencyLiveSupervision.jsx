"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createAgencySupervisionStore } from "@/lib/agencySupervisionStore";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken } from "@/lib/token";
import styles from "./AgencyLiveSupervision.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const CATEGORIES = [
  "commercial_sex", "grooming", "off_platform", "external_payment",
  "harassment", "fraud", "other",
];

export default function AgencyLiveSupervision() {
  const { t } = useLanguage();
  const store = useMemo(() => createAgencySupervisionStore({ getToken, apiUrl: API_URL }), []);
  const { lives, loading, selectedId, audience, localCount, audiencePage, target, category,
    reason, error, notice, sending } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => store.start(), [store]);
  const submitReport = (event) => { event.preventDefault(); store.submitReport(); };
  const currentLive = lives.find((entry) => entry.id === selectedId);

  return (
    <section className={styles.panel} aria-labelledby="agency-live-supervision-title">
      <div className={styles.header}>
        <div>
          <h2 id="agency-live-supervision-title">{t("agencySupervision.title")}</h2>
          <p>{t("agencySupervision.description")}</p>
        </div>
        <button type="button" className={styles.refresh} onClick={() => store.refresh()}>
          {t("agencySupervision.refresh")}
        </button>
      </div>
      {error && <p role="alert" className={styles.error}>{t("agencySupervision." + error)}</p>}
      {notice && <p role="status" className={styles.success}>{t("agencySupervision." + notice)}</p>}
      {loading ? <p className={styles.empty}>{t("agencySupervision.loading")}</p> :
        lives.length === 0 ? <p className={styles.empty}>{t("agencySupervision.empty")}</p> :
        <div className={styles.liveGrid}>
          {lives.map((live) => (
            <article key={live.id} className={styles.liveCard}>
              <div className={styles.liveHeading}>
                <strong>{live.title}</strong>
                <span className={styles.liveBadge}>{t("agencySupervision.live")}</span>
              </div>
              <p>@{live.creator}</p>
              <div className={styles.actions}>
                <button type="button" onClick={() => store.chooseLive(live.id)}
                  aria-pressed={selectedId === live.id}>{t("agencySupervision.audience")}</button>
                <Link href={"/live/" + encodeURIComponent(live.id)}>
                  {t("agencySupervision.watch")}
                </Link>
              </div>
            </article>
          ))}
        </div>}
      {currentLive && (
        <div className={styles.details}>
          <h3>{t("agencySupervision.audience")} — {currentLive.title}</h3>
          <p className={styles.note}>{t("agencySupervision.localCount").replace("{count}", String(localCount))}</p>
          <p className={styles.note}>{t("agencySupervision.scope")}</p>
          <div className={styles.people}>
            {audience.length === 0 ? <p className={styles.empty}>{t("agencySupervision.noAudience")}</p> :
              audience.map((person) => (
                <div className={styles.person} key={person.userId}>
                  <span>@{person.username || t("agencySupervision.anonymous")}
                    {" · "}{t("agencySupervision." + person.role)}</span>
                  <button type="button" onClick={() => {
                    store.setTarget({ targetType: person.role, targetId: person.userId });
                  }}>{t("agencySupervision.reportPerson")}</button>
                </div>
              ))}
          </div>
          {localCount > 40 && (
            <div className={styles.pagination}>
              <button type="button" disabled={audiencePage <= 1}
                onClick={() => store.setPage(Math.max(1, audiencePage - 1))}>
                {t("agencySupervision.previous")}
              </button>
              <span>{t("agencySupervision.pageOf")
                .replace("{page}", String(audiencePage))
                .replace("{total}", String(Math.max(1, Math.ceil(localCount / 40))))}</span>
              <button type="button" disabled={audiencePage * 40 >= localCount}
                onClick={() => store.setPage(audiencePage + 1)}>
                {t("agencySupervision.next")}
              </button>
            </div>
          )}
          <form onSubmit={submitReport} className={styles.form}>
            <h3>{t("agencySupervision.reportTitle")}</h3>
            <p className={styles.note}>{target.targetType === "live" ?
              t("agencySupervision.reportingLive") : t("agencySupervision.reportingPerson")}</p>
            <button type="button" className={styles.reset} onClick={() =>
              store.setTarget({ targetType: "live", targetId: "" })}>
              {t("agencySupervision.reportLive")}
            </button>
            <label htmlFor="agency-report-category">{t("agencySupervision.category")}</label>
            <select id="agency-report-category" value={category} onChange={(e) => store.setCategory(e.target.value)}>
              {CATEGORIES.map((id) => <option key={id} value={id}>
                {t("agencySupervision.categories." + id)}
              </option>)}
            </select>
            <label htmlFor="agency-report-reason">{t("agencySupervision.reason")}</label>
            <textarea id="agency-report-reason" required minLength={10} maxLength={500}
              value={reason} onChange={(e) => store.setReason(e.target.value)} rows={3} />
            <button type="submit" className={styles.submit} disabled={sending || reason.trim().length < 10}>
              {sending ? t("agencySupervision.sending") : t("agencySupervision.submit")}
            </button>
          </form>
          <p className={styles.note}>{t("agencySupervision.staffOnly")}</p>
        </div>
      )}
    </section>
  );
}
