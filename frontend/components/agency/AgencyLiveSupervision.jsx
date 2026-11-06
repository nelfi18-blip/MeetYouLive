"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [lives, setLives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [audience, setAudience] = useState([]);
  const [localCount, setLocalCount] = useState(0);
  const [audiencePage, setAudiencePage] = useState(1);
  const [target, setTarget] = useState({ targetType: "live", targetId: "" });
  const [category, setCategory] = useState("commercial_sex");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  const loadLives = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const response = await fetch(API_URL + "/api/agency/supervision/lives", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("not_available");
      const payload = await response.json();
      const next = Array.isArray(payload.lives) ? payload.lives : [];
      setLives(next);
      setSelectedId((current) => next.some((entry) => entry.id === current) ? current : "");
    } catch {
      setError(t("agencySupervision.loadError"));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => {
    loadLives();
    const timer = setInterval(loadLives, 30000);
    return () => clearInterval(timer);
  }, [loadLives]);

  useEffect(() => {
    if (!selectedId) { setAudience([]); setLocalCount(0); return; }
    let active = true;
    const loadAudience = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const response = await fetch(API_URL + "/api/agency/supervision/lives/" +
          encodeURIComponent(selectedId) + "/audience?page=" + audiencePage, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        if (!response.ok) {
          if (active) { setSelectedId(""); setError(t("agencySupervision.accessRevoked")); }
          return;
        }
        const payload = await response.json();
        if (active) {
          setAudience(Array.isArray(payload.viewers) ? payload.viewers : []);
          setLocalCount(Number(payload.totalLocal) || 0);
        }
      } catch { if (active) setError(t("agencySupervision.loadError")); }
    };
    loadAudience();
    const timer = setInterval(loadAudience, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [selectedId, audiencePage, t]);

  const chooseLive = (id) => {
    setSelectedId(id); setAudience([]); setLocalCount(0); setAudiencePage(1);
    setTarget({ targetType: "live", targetId: "" });
    setError(""); setNotice("");
  };

  const submitReport = async (event) => {
    event.preventDefault();
    if (!selectedId || reason.trim().length < 10 || sending) return;
    setSending(true); setError(""); setNotice("");
    const token = getToken();
    try {
      const response = await fetch(API_URL + "/api/agency/supervision/lives/" +
        encodeURIComponent(selectedId) + "/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ ...target, category, reason: reason.trim() }),
      });
      if (response.status === 409) { setError(t("agencySupervision.duplicate")); return; }
      if (!response.ok) throw new Error("report_failure");
      setReason(""); setNotice(t("agencySupervision.sent"));
    } catch { setError(t("agencySupervision.reportError")); }
    finally { setSending(false); }
  };
  const currentLive = lives.find((entry) => entry.id === selectedId);

  return (
    <section className={styles.panel} aria-labelledby="agency-live-supervision-title">
      <div className={styles.header}>
        <div>
          <h2 id="agency-live-supervision-title">{t("agencySupervision.title")}</h2>
          <p>{t("agencySupervision.description")}</p>
        </div>
        <button type="button" className={styles.refresh} onClick={loadLives}>
          {t("agencySupervision.refresh")}
        </button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
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
                <button type="button" onClick={() => chooseLive(live.id)}
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
                    setTarget({ targetType: person.role, targetId: person.userId });
                    setNotice("");
                  }}>{t("agencySupervision.reportPerson")}</button>
                </div>
              ))}
          </div>
          {localCount > 40 && (
            <div className={styles.pagination}>
              <button type="button" disabled={audiencePage <= 1}
                onClick={() => setAudiencePage((page) => Math.max(1, page - 1))}>
                {t("agencySupervision.previous")}
              </button>
              <span>{t("agencySupervision.pageOf")
                .replace("{page}", String(audiencePage))
                .replace("{total}", String(Math.max(1, Math.ceil(localCount / 40))))}</span>
              <button type="button" disabled={audiencePage * 40 >= localCount}
                onClick={() => setAudiencePage((page) => page + 1)}>
                {t("agencySupervision.next")}
              </button>
            </div>
          )}
          <form onSubmit={submitReport} className={styles.form}>
            <h3>{t("agencySupervision.reportTitle")}</h3>
            <p className={styles.note}>{target.targetType === "live" ?
              t("agencySupervision.reportingLive") : t("agencySupervision.reportingPerson")}</p>
            <button type="button" className={styles.reset} onClick={() =>
              setTarget({ targetType: "live", targetId: "" })}>
              {t("agencySupervision.reportLive")}
            </button>
            <label htmlFor="agency-report-category">{t("agencySupervision.category")}</label>
            <select id="agency-report-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((id) => <option key={id} value={id}>
                {t("agencySupervision.categories." + id)}
              </option>)}
            </select>
            <label htmlFor="agency-report-reason">{t("agencySupervision.reason")}</label>
            <textarea id="agency-report-reason" required minLength={10} maxLength={500}
              value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
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
