"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";
import { CREATOR_PROFILE_SAVED_NOTICE_KEY } from "@/lib/creatorOnboarding";
import { getDisplayName } from "@/lib/imageHelpers";
import {
  COUNTRIES,
  COUNTRY_DISPLAY_LOCALE,
  COUNTRY_ISO_CODES,
  detectCountryNonGPS,
  normalizeText,
  resolveCountryOption,
} from "@/lib/countryDetection";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MIN_CREATOR_AGE = 18;

// Reuses the same birthdate the user already has on file — this is not a
// second age system, just the canonical calculation applied client-side
// for UX. The backend remains the source of truth and re-validates.
function calculateAgeFromBirthdate(birthdate) {
  if (!birthdate) return null;
  const date = new Date(birthdate);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

const CATEGORIES = [
  { value: "Entretenimiento", key: "entertainment" },
  { value: "Música", key: "music" },
  { value: "Gaming", key: "gaming" },
  { value: "Deportes", key: "sports" },
  { value: "Arte y Diseño", key: "artDesign" },
  { value: "Educación", key: "education" },
  { value: "Tecnología", key: "technology" },
  { value: "Cocina", key: "cooking" },
  { value: "Viajes", key: "travel" },
  { value: "Moda y Belleza", key: "fashionBeauty" },
  { value: "Fitness y Salud", key: "fitnessHealth" },
  { value: "Humor y Comedia", key: "humorComedy" },
  { value: "Noticias y Política", key: "newsPolitics" },
  { value: "Otro", key: "other" },
];

const LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ru", label: "Русский" },
];

const DEFAULT_LANGUAGE = "es";
const SOCIAL_PROOF_COUNT = 120;
const SEGMENT_THRESHOLDS = {
  newMaxLogins: 3,
  activeMinLogins: 8,
  spenderMinLogins: 20,
  spenderMaxCoins: 40,
};

function CreatorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
    </svg>
  );
}

export default function CreatorRequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, lang } = useLanguage();
  const inviteCode = searchParams.get("creatorInvite") || null;
  const profileSaved = searchParams.get("profileSaved") === "1";
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [detectingCountry, setDetectingCountry] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [profileSavedNotice, setProfileSavedNotice] = useState("");
  const [step, setStep] = useState(1);
  const [inviterInfo, setInviterInfo] = useState(null);
  const [eligibilityAccepted, setEligibilityAccepted] = useState(false);
  const [creatorRulesAccepted, setCreatorRulesAccepted] = useState(false);

  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    category: "",
    country: "",
    languages: [],
    socialLinks: { twitter: "", instagram: "", tiktok: "", youtube: "" },
  });

  useEffect(() => {
    if (!profileSaved) return;
    try {
      setProfileSavedNotice(sessionStorage.getItem(CREATOR_PROFILE_SAVED_NOTICE_KEY) || t("creatorRequest.profileSavedNextStepNotice"));
      sessionStorage.removeItem(CREATOR_PROFILE_SAVED_NOTICE_KEY);
    } catch {
      setProfileSavedNotice(t("creatorRequest.profileSavedNextStepNotice"));
    }
  }, [profileSaved, t]);

  useEffect(() => {
    if (!inviteCode) return;
    fetch(`${API_URL}/api/user/creator-invite-info?code=${encodeURIComponent(inviteCode)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.valid && data.creator) setInviterInfo(data.creator); })
      .catch((err) => console.warn("[creator-request] invite-info fetch failed:", err));
  }, [inviteCode]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (!data) return;
        if (data.role === "creator" || data.creatorStatus === "approved") {
          router.replace("/creator");
          return;
        }
        if (data.role === "admin") {
          router.replace("/admin");
          return;
        }

        setUser(data);

        const previous = data.creatorApplication;
        if (previous) {
          const previousHasOptionalData =
            !!previous.bio?.trim() ||
            (Array.isArray(previous.languages) && previous.languages.length > 0) ||
            Object.values(previous.socialLinks || {}).some((value) => !!value?.trim());

          setForm({
            displayName: previous.displayName || getDisplayName(data),
            bio: previous.bio?.trim() || "",
            category: previous.category || "",
            country: resolveCountryOption(previous.country || data.country || ""),
            languages: Array.isArray(previous.languages) ? previous.languages : [],
            socialLinks: {
              twitter: previous.socialLinks?.twitter || "",
              instagram: previous.socialLinks?.instagram || "",
              tiktok: previous.socialLinks?.tiktok || "",
              youtube: previous.socialLinks?.youtube || "",
            },
          });

          if (previousHasOptionalData) setStep(2);
          return;
        }

        setForm((prev) => ({
          ...prev,
          displayName: getDisplayName(data),
          country: resolveCountryOption(data.country || ""),
        }));
      })
      .catch(() => setError(t("creatorRequest.profileLoadError")))
      .finally(() => setLoading(false));
  }, [router, t]);

  useEffect(() => {
    if (loading || form.country) return;

    let cancelled = false;
    setDetectingCountry(true);

    detectCountryNonGPS()
      .then((detected) => {
        if (!cancelled && detected) {
          setForm((prev) => (prev.country ? prev : { ...prev, country: detected }));
        }
      })
      .finally(() => {
        if (!cancelled) setDetectingCountry(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, form.country]);

  // Country values are always stored/sent in Spanish (the canonical list
  // above), matching what the backend already expects. Only the visible
  // label is translated to the active MeetYouLive language, so switching
  // languages never changes the saved/submitted country value.
  const countryDisplayNames = useMemo(() => {
    const locale = COUNTRY_DISPLAY_LOCALE[lang] || "es";
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [lang]);

  const getCountryLabel = (country) => {
    const code = COUNTRY_ISO_CODES[country];
    if (!code || !countryDisplayNames) return country;
    try {
      return countryDisplayNames.of(code) || country;
    } catch {
      return country;
    }
  };

  const countryOptions = useMemo(() => {
    const options = [...COUNTRIES];
    const current = resolveCountryOption(form.country);
    if (current && !options.some((country) => normalizeText(country) === normalizeText(current))) {
      options.push(current);
    }
    const locale = COUNTRY_DISPLAY_LOCALE[lang] || "es";
    return options.sort((a, b) => getCountryLabel(a).localeCompare(getCountryLabel(b), locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.country, lang, countryDisplayNames]);

  const userAge = useMemo(() => calculateAgeFromBirthdate(user?.birthdate), [user]);
  const birthdateMissing = !!user && !user.birthdate;
  const isUnderage = userAge !== null && userAge < MIN_CREATOR_AGE;
  const isAgeEligible = !birthdateMissing && !isUnderage;

  const behaviorSegment = useMemo(() => {
    const loginCount = Number(user?.loginCount || 0);
    if (loginCount <= SEGMENT_THRESHOLDS.newMaxLogins) return "new";
    if (
      loginCount >= SEGMENT_THRESHOLDS.spenderMinLogins &&
      (user?.coins ?? 0) <= SEGMENT_THRESHOLDS.spenderMaxCoins
    ) {
      return "spender";
    }
    if (loginCount >= SEGMENT_THRESHOLDS.activeMinLogins) return "active";
    return "default";
  }, [user]);

  const segmentHeadline =
    user?.creatorStatus === "pending"
      ? t("creatorRequest.segmentPendingReview")
      : behaviorSegment === "new"
      ? t("creatorRequest.segmentWantEarnLive")
      : behaviorSegment === "spender"
      ? t("creatorRequest.segmentRecoverSpending")
      : behaviorSegment === "active"
      ? t("creatorRequest.segmentReadyToMonetize")
      : t("creatorRequest.segmentLimitedAccess");

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSocialLink = (network, value) => {
    setForm((prev) => ({
      ...prev,
      socialLinks: { ...prev.socialLinks, [network]: value },
    }));
  };

  const toggleLanguage = (code) => {
    setForm((prev) => {
      const langs = prev.languages.includes(code)
        ? prev.languages.filter((l) => l !== code)
        : [...prev.languages, code];
      return { ...prev, languages: langs };
    });
  };

  const validateStep1 = () => {
    if (!form.displayName.trim()) {
      setError(t("creatorRequest.displayNameRequired"));
      return false;
    }
    if (!form.category) {
      setError(t("creatorRequest.categoryRequired"));
      return false;
    }
    if (!form.country.trim()) {
      setError(t("creatorRequest.countryRequired"));
      return false;
    }
    return true;
  };

  const validateEligibility = () => {
    if (birthdateMissing) {
      setError(t("creatorRequest.birthdateRequired"));
      return false;
    }
    if (isUnderage) {
      setError(t("creatorRequest.ageRestricted"));
      return false;
    }
    if (!eligibilityAccepted || !creatorRulesAccepted) {
      setError(t("creatorRequest.eligibilityConsentRequired"));
      return false;
    }
    return true;
  };

  const getFallbackLanguage = () => {
    const browserLang = (navigator.language || DEFAULT_LANGUAGE).slice(0, 2).toLowerCase();
    return LANGUAGES.some((lang) => lang.code === browserLang) ? browserLang : DEFAULT_LANGUAGE;
  };

  const buildPayload = () => {
    const safeCategory = form.category.trim() || t("creatorRequest.fallbackBioCategory");
    const safeCountry = form.country.trim() || t("creatorRequest.fallbackBioCountry");
    const fallbackBio = t("creatorRequest.fallbackBio")
      .replace("{category}", safeCategory)
      .replace("{country}", safeCountry);
    return {
      displayName: form.displayName.trim(),
      bio: form.bio.trim() || fallbackBio,
      category: form.category.trim(),
      country: resolveCountryOption(form.country.trim()),
      languages: form.languages.length > 0 ? form.languages : [getFallbackLanguage()],
      socialLinks: {
        twitter: form.socialLinks.twitter.trim(),
        instagram: form.socialLinks.instagram.trim(),
        tiktok: form.socialLinks.tiktok.trim(),
        youtube: form.socialLinks.youtube.trim(),
      },
      eligibilityAccepted,
      creatorRulesAccepted,
      ...(inviteCode ? { creatorInvite: inviteCode } : {}),
    };
  };

  const CREATOR_ERROR_MESSAGES = {
    CREATOR_BIRTHDATE_REQUIRED: t("creatorRequest.birthdateRequired"),
    CREATOR_AGE_RESTRICTED: t("creatorRequest.ageRestricted"),
    CREATOR_ELIGIBILITY_CONSENT_REQUIRED:
      t("creatorRequest.eligibilityConsentRequired"),
  };

  const handleContinue = (e) => {
    e.preventDefault();
    setError("");
    if (!validateStep1()) return;
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateStep1()) return;
    if (!validateEligibility()) return;

    setSubmitting(true);
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_URL}/api/creator/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();

      if (!res.ok) {
        setError((data?.code && CREATOR_ERROR_MESSAGES[data.code]) || data?.message || t("creatorRequest.submitError"));
      } else {
        setSuccess(true);
        setProfileSavedNotice(t("creatorRequest.profileSavedNotice"));
      }
    } catch {
      setError(t("onboarding.serverConnecting"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius)" }} />
        <style jsx>{`.page { max-width: 640px; margin: 0 auto; }`}</style>
      </div>
    );
  }

  const isPending = user?.creatorStatus === "pending";
  const isApproved = user?.creatorStatus === "approved";
  const isSuspended = user?.creatorStatus === "suspended";
  const canSubmit = isAgeEligible && eligibilityAccepted && creatorRulesAccepted;

  return (
    <div className="page">
      <div className="card">
        <div className="card-icon">
          <CreatorIcon />
        </div>

        <h1 className="title">
          {inviterInfo ? t("creatorRequest.invitedTitle") : t("creatorRequest.limitedAccessTitle")}
        </h1>
        <p className="sub">
          {inviterInfo
            ? t("creatorRequest.invitedSubtitle")
            : t("creatorRequest.limitedAccessSubtitle")}
        </p>

        {inviterInfo && (
          <div className="invite-banner">
            {inviterInfo.avatar && (
              <img src={inviterInfo.avatar} alt="" className="invite-avatar" />
            )}
            <div className="invite-text">
              <div className="invite-label">{t("creatorRequest.invitedBy")}</div>
              <div className="invite-name">{inviterInfo.displayName || inviterInfo.name || inviterInfo.username}</div>
            </div>
          </div>
        )}

        <div className="segment-pill">{segmentHeadline}</div>

        <div className="proof-grid">
          <div className="proof-item">{t("creatorRequest.proofCreatorsEarning").replace("{count}", SOCIAL_PROOF_COUNT)}</div>
          <div className="proof-item">{t("creatorRequest.proofActivePayments")}</div>
          <div className="proof-item">{t("creatorRequest.proofJoinToday")}</div>
        </div>

        <div className="features-grid">
          <div className="feature-item">
            <span className="feature-icon">🎥</span>
            <span className="feature-label">{t("creatorRequest.featureGoLive")}</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💖</span>
            <span className="feature-label">{t("creatorRequest.featureReceiveGifts")}</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💬</span>
            <span className="feature-label">{t("creatorRequest.featurePaidPrivateChats")}</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔥</span>
            <span className="feature-label">{t("creatorRequest.featureOneOnOneCalls")}</span>
          </div>
        </div>

        {isPending || success ? (
          <div className="status-box status-pending">
            <span className="status-icon">⏳</span>
            <div>
            <div className="status-title">{t("creatorRequest.pendingStatusTitle")}</div>
              <div className="status-desc">
                {profileSavedNotice || t("creatorRequest.pendingReviewNotice")}
              </div>
            </div>
          </div>
        ) : isApproved ? (
          <div className="status-box status-approved">
            <span className="status-icon">✅</span>
            <div>
              <div className="status-title">{t("creatorRequest.approvedStatusTitle")}</div>
              <div className="status-desc">{t("creatorRequest.approvedStatusDesc")}</div>
            </div>
          </div>
        ) : isSuspended ? (
          <div className="status-box status-suspended">
            <span className="status-icon">🚫</span>
            <div>
              <div className="status-title">{t("creatorRequest.suspendedStatusTitle")}</div>
              <div className="status-desc">{t("creatorRequest.suspendedStatusDesc")}</div>
            </div>
          </div>
        ) : birthdateMissing ? (
          <div className="status-box status-suspended">
            <span className="status-icon">🎂</span>
            <div>
              <div className="status-title">{t("creatorRequest.completeBirthdateTitle")}</div>
              <div className="status-desc">
                {t("creatorRequest.completeBirthdateDesc")}
              </div>
              <button type="button" className="btn-submit" style={{ marginTop: "0.75rem" }} onClick={() => router.push("/onboarding")}>
                {t("creatorRequest.completeProfile")}
              </button>
            </div>
          </div>
        ) : isUnderage ? (
          <div className="status-box status-suspended">
            <span className="status-icon">🔞</span>
            <div>
              <div className="status-title">{t("creatorRequest.adultsOnlyTitle")}</div>
              <div className="status-desc">
                {t("creatorRequest.adultsOnlyDesc")}
              </div>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            {user?.creatorStatus === "rejected" && (
              <div className="status-box status-rejected">
                <span className="status-icon">❌</span>
                <div>
                  <div className="status-title">{t("creatorRequest.rejectedStatusTitle")}</div>
                  <div className="status-desc">{t("creatorRequest.rejectedStatusDesc")}</div>
                </div>
              </div>
            )}

            {profileSavedNotice && (
              <div className="status-box status-pending">
                <span className="status-icon">⏳</span>
                <div>
                  <div className="status-title">{t("creatorRequest.profileSavedTitle")}</div>
                  <div className="status-desc">{profileSavedNotice}</div>
                </div>
              </div>
            )}

            <div className="stepper">
              <div className={`step-chip${step === 1 ? " step-chip-active" : ""}`}>1. {t("creatorRequest.stepRequired")}</div>
              <div className={`step-chip${step === 2 ? " step-chip-active" : ""}`}>2. {t("creatorRequest.stepOptional")}</div>
            </div>

            <div className="field eligibility-box">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={eligibilityAccepted}
                  onChange={(e) => setEligibilityAccepted(e.target.checked)}
                />
                <span>{t("creatorRequest.confirmAgeEligibility")}</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={creatorRulesAccepted}
                  onChange={(e) => setCreatorRulesAccepted(e.target.checked)}
                />
                <span>
                  {t("creatorRequest.acceptRulesPrefix")}{" "}
                  <a href="/creator-policy" target="_blank" rel="noopener noreferrer">{t("creatorRequest.creatorRulesLink")}</a>
                  {" "}{t("creatorRequest.acceptRulesMiddle")}{" "}
                  <a href="/community-guidelines" target="_blank" rel="noopener noreferrer">{t("creatorRequest.communityRulesLink")}</a>
                  {" "}{t("creatorRequest.acceptRulesSuffix")}
                </span>
              </label>
              <div className="hint">
                {t("creatorRequest.explicitContentWarning")}
              </div>
            </div>

            {step === 1 ? (
              <>
                <div className="field">
                  <label className="label">{t("creatorRequest.displayNameLabel")} <span className="req">*</span></label>
                  <input
                    className="input"
                    type="text"
                    placeholder={t("creatorRequest.displayNamePlaceholder")}
                    value={form.displayName}
                    onChange={(e) => handleChange("displayName", e.target.value)}
                    maxLength={60}
                  />
                </div>

                <div className="field">
                  <label className="label">{t("creatorRequest.categoryLabel")} <span className="req">*</span></label>
                  <select
                    className="input select"
                    value={form.category}
                    onChange={(e) => handleChange("category", e.target.value)}
                  >
                    <option value="">{t("creatorRequest.categoryPlaceholder")}</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{t(`creatorRequest.categories.${c.key}`)}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">{t("creatorRequest.countryLabel")} <span className="req">*</span></label>
                  <select
                    className="input select"
                    value={resolveCountryOption(form.country)}
                    onChange={(e) => handleChange("country", e.target.value)}
                    required
                  >
                    <option value="">{t("creatorRequest.countryPlaceholder")}</option>
                    {countryOptions.map((country) => (
                      <option key={country} value={country}>{getCountryLabel(country)}</option>
                    ))}
                  </select>
                  {detectingCountry && <div className="hint">{t("creatorRequest.detectingCountry")}</div>}
                </div>

                <div className="cta-row">
                  <button className="btn-secondary" type="button" onClick={handleContinue} disabled={submitting}>
                    {t("common.continue")}
                  </button>
                  <button className="btn-submit" type="submit" disabled={submitting || !canSubmit}>
                    {submitting ? t("creatorRequest.submitting") : t("creatorRequest.requestAccess")}
                  </button>
                </div>
                <div className="hint">{t("creatorRequest.optionalDataHint")}</div>
              </>
            ) : (
              <>
                <div className="field">
                  <label className="label">{t("creatorRequest.bioLabel")} <span className="opt">({t("creatorRequest.optional")})</span></label>
                  <textarea
                    className="input textarea"
                    placeholder={t("creatorRequest.bioPlaceholder")}
                    value={form.bio}
                    onChange={(e) => handleChange("bio", e.target.value)}
                    maxLength={400}
                    rows={4}
                  />
                  <div className="char-count">{form.bio.length}/400</div>
                </div>

                <div className="field">
                  <label className="label">{t("creatorRequest.languagesLabel")} <span className="opt">({t("creatorRequest.optional")})</span></label>
                  <div className="lang-grid">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        className={`lang-chip${form.languages.includes(l.code) ? " lang-chip-active" : ""}`}
                        onClick={() => toggleLanguage(l.code)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label className="label">{t("creatorRequest.socialLinksLabel")} <span className="opt">({t("creatorRequest.optional")})</span></label>
                  <div className="social-grid">
                    <div className="social-row">
                      <span className="social-label">🐦 Twitter/X</span>
                      <input
                        className="input social-input"
                        type="text"
                        placeholder="@usuario"
                        value={form.socialLinks.twitter}
                        onChange={(e) => handleSocialLink("twitter", e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="social-row">
                      <span className="social-label">📸 Instagram</span>
                      <input
                        className="input social-input"
                        type="text"
                        placeholder="@usuario"
                        value={form.socialLinks.instagram}
                        onChange={(e) => handleSocialLink("instagram", e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="social-row">
                      <span className="social-label">🎵 TikTok</span>
                      <input
                        className="input social-input"
                        type="text"
                        placeholder="@usuario"
                        value={form.socialLinks.tiktok}
                        onChange={(e) => handleSocialLink("tiktok", e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="social-row">
                      <span className="social-label">▶️ YouTube</span>
                      <input
                        className="input social-input"
                        type="text"
                        placeholder={t("creatorRequest.youtubePlaceholder")}
                        value={form.socialLinks.youtube}
                        onChange={(e) => handleSocialLink("youtube", e.target.value)}
                        maxLength={120}
                      />
                    </div>
                  </div>
                </div>

                <div className="cta-row">
                  <button className="btn-secondary" type="button" onClick={() => setStep(1)} disabled={submitting}>
                    {t("common.back")}
                  </button>
                  <button className="btn-submit" type="submit" disabled={submitting || !canSubmit}>
                    {submitting ? t("creatorRequest.submitting") : t("creatorRequest.activateCreator")}
                  </button>
                </div>
              </>
            )}

            {error && <div className="error-box">{error}</div>}
          </form>
        )}
      </div>

      <style jsx>{`
        .page {
          max-width: 640px;
          margin: 0 auto;
        }

        .card {
          background: rgba(15,8,32,0.8);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: var(--radius);
          padding: 2.5rem 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          text-align: center;
        }

        .card-icon {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-2);
        }

        .card-icon :global(svg) { width: 32px; height: 32px; }

        .title {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .sub {
          color: var(--text-muted);
          font-size: 0.9rem;
          line-height: 1.6;
          max-width: 480px;
        }

        .segment-pill {
          padding: 0.45rem 0.85rem;
          border-radius: var(--radius-pill);
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.35);
          color: var(--text);
          font-size: 0.82rem;
          font-weight: 700;
        }

        .invite-banner {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          background: rgba(139,92,246,0.1);
          border: 1px solid rgba(139,92,246,0.4);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          text-align: left;
        }

        .invite-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(139,92,246,0.5);
          flex-shrink: 0;
        }

        .invite-text { flex: 1; min-width: 0; }

        .invite-label {
          font-size: 0.72rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }

        .invite-name {
          font-size: 0.95rem;
          font-weight: 700;
          color: #a78bfa;
        }

        .invite-agency {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 0.1rem;
        }

        .proof-grid {
          width: 100%;
          display: grid;
          gap: 0.5rem;
        }

        .proof-item {
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.25);
          border-radius: var(--radius-sm);
          padding: 0.55rem 0.8rem;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          width: 100%;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(139,92,246,0.18);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }

        .feature-icon {
          font-size: 1.25rem;
          line-height: 1;
          flex-shrink: 0;
        }

        .feature-label { line-height: 1.3; }

        .form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          text-align: left;
        }

        .stepper {
          display: flex;
          gap: 0.6rem;
        }

        .step-chip {
          font-size: 0.75rem;
          padding: 0.3rem 0.65rem;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          color: var(--text-muted);
          background: rgba(255,255,255,0.02);
        }

        .step-chip-active {
          border-color: rgba(139,92,246,0.5);
          color: var(--text);
          background: rgba(139,92,246,0.12);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }

        .req { color: var(--error, #f87171); }
        .opt { color: var(--text-muted); font-weight: 400; font-size: 0.8rem; }

        .input {
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          font-size: 0.9rem;
          padding: 0.6rem 0.875rem;
          outline: none;
          transition: border-color 0.15s;
          width: 100%;
          box-sizing: border-box;
        }

        .input:focus {
          border-color: rgba(139,92,246,0.5);
        }

        .textarea {
          resize: vertical;
          min-height: 90px;
          font-family: inherit;
        }

        .select {
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
        }

        .char-count {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-align: right;
        }

        .lang-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .lang-chip {
          padding: 0.35rem 0.85rem;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }

        .lang-chip-active {
          border-color: rgba(139,92,246,0.6);
          background: rgba(139,92,246,0.12);
          color: var(--text);
        }

        .social-grid {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .social-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .social-label {
          font-size: 0.82rem;
          color: var(--text-muted);
          white-space: nowrap;
          width: 110px;
          flex-shrink: 0;
        }

        .social-input {
          flex: 1;
        }

        .hint {
          font-size: 0.78rem;
          color: var(--text-muted);
        }

        .eligibility-box {
          text-align: left;
          gap: 0.6rem;
          padding: 0.9rem 1rem;
          border-radius: var(--radius);
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.25);
        }

        .checkbox-row {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          font-size: 0.85rem;
          color: var(--text);
          text-align: left;
          cursor: pointer;
        }

        .checkbox-row input {
          margin-top: 0.15rem;
          flex-shrink: 0;
        }

        .checkbox-row a {
          color: var(--accent-2);
        }

        .cta-row {
          display: grid;
          gap: 0.65rem;
          grid-template-columns: 1fr 1fr;
        }

        .btn-secondary,
        .btn-submit {
          width: 100%;
          padding: 0.875rem 1.5rem;
          border-radius: var(--radius-pill);
          font-size: 0.95rem;
          font-weight: 700;
          transition: opacity var(--transition), box-shadow var(--transition);
          cursor: pointer;
        }

        .btn-secondary {
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
          color: var(--text);
        }

        .btn-submit {
          background: var(--grad-primary);
          border: none;
          color: #fff;
          box-shadow: 0 4px 20px rgba(224,64,251,0.35);
        }

        .btn-submit:hover:not(:disabled) {
          opacity: 0.9;
          box-shadow: 0 6px 28px rgba(224,64,251,0.5);
        }

        .btn-secondary:hover:not(:disabled) {
          border-color: rgba(139,92,246,0.5);
        }

        .btn-secondary:disabled,
        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error-box {
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.3);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          color: var(--error, #f87171);
          font-size: 0.875rem;
          width: 100%;
          text-align: left;
        }

        .status-box {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-sm);
          text-align: left;
          width: 100%;
        }

        .status-pending {
          background: rgba(251,146,60,0.08);
          border: 1px solid rgba(251,146,60,0.25);
        }

        .status-approved {
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.25);
        }

        .status-rejected {
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.25);
        }

        .status-suspended {
          background: rgba(251,146,60,0.08);
          border: 1px solid rgba(251,146,60,0.4);
        }

        .status-icon { font-size: 1.4rem; flex-shrink: 0; }

        .status-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text);
        }

        .status-desc {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          line-height: 1.5;
        }

        @media (max-width: 480px) {
          .card { padding: 1.75rem 1.25rem; }
          .title { font-size: 1.35rem; }
          .features-grid { grid-template-columns: 1fr; }
          .social-row { flex-direction: column; align-items: flex-start; }
          .social-label { width: auto; }
          .cta-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
