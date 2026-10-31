"use client";

import { useEffect, useMemo, useState } from "react";
import FuturisticCard from "@/components/ui/FuturisticCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { isValidPaypalEmail } from "@/lib/payoutValidation";
import { COUNTRY_ISO_CODES } from "@/lib/countryDetection";
import { CheckCircleIcon, AlertIcon } from "@/components/ui/MonetizationIcons";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// ISO 3166-1 alpha-2 codes, sorted by localized display name at render time
// (see useMemo below) — reused from the canonical country list so this
// form never maintains its own separate set of countries.
const COUNTRY_CODES = Array.from(new Set(Object.values(COUNTRY_ISO_CODES))).sort();

function resolveLocalizedCountryName(code, lang) {
  try {
    const displayNames = new Intl.DisplayNames([lang], { type: "region" });
    return displayNames.of(code) || code;
  } catch {
    return code;
  }
}

/**
 * "Mi cuenta de cobros" — permanent, two-step payout profile card.
 * Step 1 (beneficiary) and step 2 (destination/PayPal) can each be saved
 * independently. Never claims PayPal verification or tax-verification; a
 * syntactically valid email is only a registered destination, and the tax
 * documentation badge is purely informational (see backend model docblock).
 */
export default function CreatorPayoutProfileCard({ onProfileChange } = {}) {
  const { t, lang } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [beneficiaryForm, setBeneficiaryForm] = useState({
    legalName: "",
    residenceCountry: "",
    taxResidenceCountry: "",
    beneficiaryType: "",
  });
  const [beneficiaryErrors, setBeneficiaryErrors] = useState({});
  const [beneficiarySaving, setBeneficiarySaving] = useState(false);
  const [beneficiaryFeedback, setBeneficiaryFeedback] = useState("");

  const [editingDestination, setEditingDestination] = useState(false);
  const [paypalEmailInput, setPaypalEmailInput] = useState("");
  const [destinationError, setDestinationError] = useState("");
  const [destinationSaving, setDestinationSaving] = useState(false);
  const [destinationFeedback, setDestinationFeedback] = useState("");

  const countryOptions = useMemo(
    () =>
      COUNTRY_CODES.map((code) => ({ code, label: resolveLocalizedCountryName(code, lang) })).sort((a, b) =>
        a.label.localeCompare(b.label, lang)
      ),
    [lang]
  );

  const authHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const loadProfile = () => {
    const headers = authHeaders();
    if (!headers) return;
    setLoading(true);
    setLoadError("");
    fetch(`${API_URL}/api/creator/payout-profile`, { headers })
      .then(async (res) => {
        if (!res.ok) throw new Error(t("creatorPage.payoutProfileLoadError"));
        return res.json();
      })
      .then((data) => {
        const nextProfile = data.profile;
        setProfile(nextProfile);
        onProfileChange?.(nextProfile);
        setBeneficiaryForm({
          legalName: nextProfile?.beneficiary?.legalName || "",
          residenceCountry: nextProfile?.beneficiary?.residenceCountry || "",
          taxResidenceCountry: nextProfile?.beneficiary?.taxResidenceCountry || "",
          beneficiaryType: nextProfile?.beneficiary?.beneficiaryType || "",
        });
        setPaypalEmailInput(nextProfile?.destination?.paypalEmail || "");
      })
      .catch((err) => setLoadError(err.message || t("creatorPage.payoutProfileLoadError")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveBeneficiary = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!beneficiaryForm.legalName.trim() || beneficiaryForm.legalName.trim().length < 2) {
      errors.legalName = t("creatorPage.payoutProfileLegalNameInvalid");
    }
    if (!beneficiaryForm.residenceCountry) {
      errors.residenceCountry = t("creatorPage.payoutProfileCountryInvalid");
    }
    if (!beneficiaryForm.taxResidenceCountry) {
      errors.taxResidenceCountry = t("creatorPage.payoutProfileCountryInvalid");
    }
    if (!["individual", "company"].includes(beneficiaryForm.beneficiaryType)) {
      errors.beneficiaryType = t("creatorPage.payoutProfileBeneficiaryTypeInvalid");
    }
    setBeneficiaryErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const headers = authHeaders();
    if (!headers) return;

    setBeneficiarySaving(true);
    setBeneficiaryFeedback("");
    try {
      const res = await fetch(`${API_URL}/api/creator/payout-profile`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: beneficiaryForm.legalName.trim(),
          residenceCountry: beneficiaryForm.residenceCountry,
          taxResidenceCountry: beneficiaryForm.taxResidenceCountry,
          beneficiaryType: beneficiaryForm.beneficiaryType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("creatorPage.payoutProfileSaveError"));
      setProfile(data.profile);
      onProfileChange?.(data.profile);
      setBeneficiaryFeedback(t("creatorPage.payoutProfileSaveSuccess"));
    } catch (err) {
      setBeneficiaryFeedback(err.message || t("creatorPage.payoutProfileSaveError"));
    } finally {
      setBeneficiarySaving(false);
    }
  };

  const handleSaveDestination = async (event) => {
    event.preventDefault();
    const trimmedEmail = paypalEmailInput.trim();
    if (!isValidPaypalEmail(trimmedEmail)) {
      setDestinationError(t("creatorPage.payoutProfilePaypalEmailInvalid"));
      return;
    }
    setDestinationError("");

    const headers = authHeaders();
    if (!headers) return;

    setDestinationSaving(true);
    setDestinationFeedback("");
    try {
      const res = await fetch(`${API_URL}/api/creator/payout-profile`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ destinationMethod: "paypal", paypalEmail: trimmedEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("creatorPage.payoutProfileSaveError"));
      setProfile(data.profile);
      onProfileChange?.(data.profile);
      setEditingDestination(false);
      setDestinationFeedback(t("creatorPage.payoutProfileSaveSuccess"));
    } catch (err) {
      setDestinationFeedback(err.message || t("creatorPage.payoutProfileSaveError"));
    } finally {
      setDestinationSaving(false);
    }
  };

  const beneficiaryComplete = Boolean(profile?.beneficiary?.complete);
  const destinationComplete = Boolean(profile?.destination?.complete);
  const completionStatus = profile?.completionStatus || "incomplete";
  const progressStep = Number(beneficiaryComplete) + Number(destinationComplete);
  const taxStatus = profile?.taxDocsStatus || "not_started";
  const lockedDestination = Boolean(profile?.lockedDestination);

  return (
    <FuturisticCard className="payout-profile-card" accent="purple" hover={false}>
      <div className="ppc-header">
        <div className="ppc-title-row">
          <h3 className="ppc-title">{t("creatorPage.payoutProfileTitle")}</h3>
          <span
            className={`ppc-status-pill ppc-status-${completionStatus}`}
          >
            {completionStatus === "complete"
              ? t("creatorPage.payoutProfileStatusComplete")
              : t("creatorPage.payoutProfileStatusIncomplete")}
          </span>
        </div>
        <p className="ppc-subtitle">{t("creatorPage.payoutProfileSubtitle")}</p>

        <div className="ppc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={2} aria-valuenow={progressStep}>
          <span className={`ppc-progress-step ${beneficiaryComplete ? "ppc-progress-done" : ""}`}>
            {beneficiaryComplete ? <CheckCircleIcon size={12} /> : "1"}
          </span>
          <span className={`ppc-progress-bar ${progressStep === 2 ? "ppc-progress-bar-full" : progressStep === 1 ? "ppc-progress-bar-half" : ""}`} />
          <span className={`ppc-progress-step ${destinationComplete ? "ppc-progress-done" : ""}`}>
            {destinationComplete ? <CheckCircleIcon size={12} /> : "2"}
          </span>
        </div>
      </div>

      {loadError ? (
        <div className="ppc-feedback ppc-feedback-error">
          <AlertIcon size={13} /> {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="ppc-skeleton" />
      ) : (
        <>
          <section className="ppc-step">
            <h4 className="ppc-step-title">
              {t("creatorPage.payoutProfileStepOf").replace("{step}", "1")} · {t("creatorPage.payoutProfileStepBeneficiary")}
            </h4>
            <form onSubmit={handleSaveBeneficiary} className="ppc-form">
              <label className="ppc-label" htmlFor="ppc-legal-name">
                {t("creatorPage.payoutProfileLegalNameLabel")}
              </label>
              <input
                id="ppc-legal-name"
                type="text"
                className="ppc-input"
                placeholder={t("creatorPage.payoutProfileLegalNamePlaceholder")}
                value={beneficiaryForm.legalName}
                maxLength={120}
                onChange={(e) => setBeneficiaryForm((prev) => ({ ...prev, legalName: e.target.value }))}
                disabled={beneficiarySaving}
              />
              {beneficiaryErrors.legalName ? <p className="ppc-error">{beneficiaryErrors.legalName}</p> : null}

              <div className="ppc-field-row">
                <div className="ppc-field-col">
                  <label className="ppc-label" htmlFor="ppc-residence-country">
                    {t("creatorPage.payoutProfileResidenceCountryLabel")}
                  </label>
                  <select
                    id="ppc-residence-country"
                    className="ppc-input"
                    value={beneficiaryForm.residenceCountry}
                    onChange={(e) => setBeneficiaryForm((prev) => ({ ...prev, residenceCountry: e.target.value }))}
                    disabled={beneficiarySaving}
                  >
                    <option value="">—</option>
                    {countryOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {beneficiaryErrors.residenceCountry ? <p className="ppc-error">{beneficiaryErrors.residenceCountry}</p> : null}
                </div>

                <div className="ppc-field-col">
                  <label className="ppc-label" htmlFor="ppc-tax-country">
                    {t("creatorPage.payoutProfileTaxCountryLabel")}
                  </label>
                  <select
                    id="ppc-tax-country"
                    className="ppc-input"
                    value={beneficiaryForm.taxResidenceCountry}
                    onChange={(e) => setBeneficiaryForm((prev) => ({ ...prev, taxResidenceCountry: e.target.value }))}
                    disabled={beneficiarySaving}
                  >
                    <option value="">—</option>
                    {countryOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {beneficiaryErrors.taxResidenceCountry ? <p className="ppc-error">{beneficiaryErrors.taxResidenceCountry}</p> : null}
                </div>
              </div>

              <label className="ppc-label">{t("creatorPage.payoutProfileBeneficiaryTypeLabel")}</label>
              <div className="ppc-radio-row">
                {["individual", "company"].map((type) => (
                  <button
                    type="button"
                    key={type}
                    className={`ppc-radio-chip ${beneficiaryForm.beneficiaryType === type ? "ppc-radio-chip-active" : ""}`}
                    onClick={() => setBeneficiaryForm((prev) => ({ ...prev, beneficiaryType: type }))}
                    disabled={beneficiarySaving}
                  >
                    {type === "individual"
                      ? t("creatorPage.payoutProfileBeneficiaryIndividual")
                      : t("creatorPage.payoutProfileBeneficiaryCompany")}
                  </button>
                ))}
              </div>
              {beneficiaryErrors.beneficiaryType ? <p className="ppc-error">{beneficiaryErrors.beneficiaryType}</p> : null}

              {beneficiaryFeedback ? <p className="ppc-feedback-inline">{beneficiaryFeedback}</p> : null}

              <button type="submit" className="btn btn-primary btn-sm ppc-save-btn" disabled={beneficiarySaving}>
                {t("creatorPage.payoutProfileSaveBeneficiary")}
              </button>
            </form>
          </section>

          <section className="ppc-step">
            <h4 className="ppc-step-title">
              {t("creatorPage.payoutProfileStepOf").replace("{step}", "2")} · {t("creatorPage.payoutProfileStepDestination")}
            </h4>

            <div className="ppc-label">{t("creatorPage.payoutProfileDestinationMethodLabel")}</div>
            <div className="ppc-method-chip">{t("creatorPage.payoutProfileMethodPaypal")}</div>

            {destinationComplete && !editingDestination ? (
              <div className="ppc-destination-summary">
                <span>{t("creatorPage.payoutProfileSavedDestination")}: <strong>{profile?.destination?.maskedPaypalEmail}</strong></span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditingDestination(true)}
                >
                  {t("creatorPage.payoutProfileEditDestination")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveDestination} className="ppc-form">
                <label className="ppc-label" htmlFor="ppc-paypal-email">
                  {t("creatorPage.payoutProfilePaypalEmailLabel")}
                </label>
                <input
                  id="ppc-paypal-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="ppc-input"
                  placeholder={t("creatorPage.payoutProfilePaypalEmailPlaceholder")}
                  value={paypalEmailInput}
                  maxLength={254}
                  onChange={(e) => {
                    setPaypalEmailInput(e.target.value);
                    setDestinationError("");
                  }}
                  disabled={destinationSaving}
                />
                {destinationError ? <p className="ppc-error">{destinationError}</p> : null}
                <p className="ppc-note">{t("creatorPage.payoutProfileNotVerifiedNote")}</p>

                {destinationFeedback ? <p className="ppc-feedback-inline">{destinationFeedback}</p> : null}

                <div className="ppc-destination-actions">
                  {editingDestination ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEditingDestination(false);
                        setPaypalEmailInput(profile?.destination?.paypalEmail || "");
                        setDestinationError("");
                      }}
                      disabled={destinationSaving}
                    >
                      {t("common.cancel")}
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary btn-sm ppc-save-btn" disabled={destinationSaving}>
                    {t("creatorPage.payoutProfileSaveDestination")}
                  </button>
                </div>
              </form>
            )}

            {lockedDestination ? <p className="ppc-note ppc-note-warning">{t("creatorPage.payoutProfileLockedNote")}</p> : null}
          </section>

          {beneficiaryComplete ? (
            <p className="ppc-tax-note">
              <span className={`ppc-tax-pill ${taxStatus === "pending_review" ? "ppc-tax-pill-review" : ""}`}>
                {t("creatorPage.payoutProfileStatusReview")}
              </span>
              <span>{t("creatorPage.payoutProfileTaxPendingNote")}</span>
            </p>
          ) : null}
        </>
      )}

      <style jsx>{`
        .payout-profile-card {
          padding: 1rem 1.1rem 1.15rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .ppc-header {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .ppc-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .ppc-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: #fff;
          margin: 0;
          background: linear-gradient(90deg, #e879f9, #a78bfa);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .ppc-status-pill {
          font-size: 0.62rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          white-space: nowrap;
          flex-shrink: 0;
          transition: background var(--transition), color var(--transition);
        }
        .ppc-status-incomplete {
          background: rgba(244, 114, 182, 0.14);
          color: #f9a8d4;
          border: 1px solid rgba(244, 114, 182, 0.3);
        }
        .ppc-status-complete {
          background: rgba(167, 139, 250, 0.16);
          color: #c4b5fd;
          border: 1px solid rgba(167, 139, 250, 0.32);
        }
        .ppc-subtitle {
          font-size: 0.74rem;
          color: var(--text-muted);
          margin: 0;
        }
        .ppc-progress {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-top: 0.2rem;
        }
        .ppc-progress-step {
          width: 1.4rem;
          height: 1.4rem;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.68rem;
          font-weight: 800;
          color: #e9d5ff;
          background: rgba(167, 139, 250, 0.12);
          border: 1px solid rgba(167, 139, 250, 0.35);
          flex-shrink: 0;
          transition: background var(--transition-slow), border-color var(--transition-slow), transform var(--transition);
        }
        .ppc-progress-done {
          background: linear-gradient(135deg, #e879f9, #a78bfa);
          color: #140b2e;
          border-color: transparent;
        }
        .ppc-progress-bar {
          flex: 1;
          height: 3px;
          border-radius: 999px;
          background: rgba(167, 139, 250, 0.16);
          position: relative;
          overflow: hidden;
        }
        .ppc-progress-bar::after {
          content: "";
          position: absolute;
          inset: 0;
          width: 0%;
          background: linear-gradient(90deg, #e879f9, #a78bfa);
          transition: width var(--transition-slow);
        }
        .ppc-progress-bar-half::after { width: 50%; }
        .ppc-progress-bar-full::after { width: 100%; }

        .ppc-skeleton {
          height: 160px;
          border-radius: var(--radius);
          background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03));
        }

        .ppc-step {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding-top: 0.35rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .ppc-step-title {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #d8b4fe;
          margin: 0;
        }
        .ppc-form {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .ppc-label {
          font-size: 0.68rem;
          font-weight: 700;
          color: var(--text-muted);
        }
        .ppc-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          color: #fff;
          padding: 0.5rem 0.65rem;
          font-size: 0.82rem;
          transition: border-color var(--transition), box-shadow var(--transition);
        }
        .ppc-input:focus {
          outline: none;
          border-color: #c084fc;
          box-shadow: 0 0 0 3px rgba(192, 132, 252, 0.18);
        }
        .ppc-field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        @media (max-width: 480px) {
          .ppc-field-row {
            grid-template-columns: 1fr;
          }
        }
        .ppc-field-col {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .ppc-radio-row {
          display: flex;
          gap: 0.45rem;
        }
        .ppc-radio-chip {
          flex: 1;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-muted);
          border-radius: 10px;
          padding: 0.45rem 0.6rem;
          font-size: 0.76rem;
          font-weight: 700;
          cursor: pointer;
          transition: background var(--transition), border-color var(--transition), color var(--transition);
        }
        .ppc-radio-chip-active {
          background: linear-gradient(135deg, rgba(232, 121, 249, 0.22), rgba(167, 139, 250, 0.22));
          border-color: #c084fc;
          color: #fff;
        }
        .ppc-error {
          font-size: 0.68rem;
          color: #fca5a5;
          margin: 0;
        }
        .ppc-note {
          font-size: 0.66rem;
          color: var(--text-muted);
          margin: 0;
        }
        .ppc-note-warning {
          color: #fcd34d;
        }
        .ppc-feedback-inline {
          font-size: 0.7rem;
          color: #c4b5fd;
          margin: 0;
        }
        .ppc-save-btn {
          align-self: flex-start;
        }
        .ppc-method-chip {
          display: inline-flex;
          align-self: flex-start;
          font-size: 0.74rem;
          font-weight: 700;
          color: #fff;
          background: rgba(96, 165, 250, 0.16);
          border: 1px solid rgba(96, 165, 250, 0.3);
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
        }
        .ppc-destination-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          font-size: 0.78rem;
          color: #fff;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 0.5rem 0.65rem;
        }
        .ppc-destination-actions {
          display: flex;
          gap: 0.5rem;
        }
        .ppc-tax-note {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.68rem;
          color: var(--text-muted);
          margin: 0;
          flex-wrap: wrap;
        }
        .ppc-tax-pill {
          font-size: 0.62rem;
          font-weight: 700;
          padding: 0.18rem 0.5rem;
          border-radius: 999px;
          white-space: nowrap;
        }
        .ppc-tax-pill-review {
          background: rgba(251, 191, 36, 0.14);
          color: #fcd34d;
          border: 1px solid rgba(251, 191, 36, 0.3);
        }
        .ppc-feedback {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.74rem;
          padding: 0.45rem 0.6rem;
          border-radius: 10px;
        }
        .ppc-feedback-error {
          color: #fca5a5;
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.22);
        }
      `}</style>
    </FuturisticCard>
  );
}
