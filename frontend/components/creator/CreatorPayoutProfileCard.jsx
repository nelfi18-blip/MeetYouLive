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
 * "Mi cuenta de cobros" — a single, compact payout profile form (beneficiary
 * + PayPal destination saved together in one PATCH) backed by the same
 * /api/creator/payout-profile endpoint and completeness rules as before.
 * Once complete, collapses into a summary card with a masked PayPal email
 * and an "Editar" action instead of always showing the full form. Never
 * claims PayPal verification or tax-residence verification — a
 * syntactically valid email is only a registered destination, and the tax
 * country fields are purely declarative (see backend model docblock).
 */
export default function CreatorPayoutProfileCard({ onProfileChange } = {}) {
  const { t, lang } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState({
    legalName: "",
    residenceCountry: "",
    beneficiaryType: "",
    paypalEmail: "",
  });
  const [sameTaxResidence, setSameTaxResidence] = useState(true);
  const [taxResidenceCountry, setTaxResidenceCountry] = useState("");
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

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

  const applyProfileToForm = (nextProfile) => {
    const residenceCountry = nextProfile?.beneficiary?.residenceCountry || "";
    const savedTaxCountry = nextProfile?.beneficiary?.taxResidenceCountry || "";
    setForm({
      legalName: nextProfile?.beneficiary?.legalName || "",
      residenceCountry,
      beneficiaryType: nextProfile?.beneficiary?.beneficiaryType || "",
      paypalEmail: nextProfile?.destination?.paypalEmail || "",
    });
    // Default to "same country" unless the creator previously saved a
    // genuinely different tax residence — this keeps the common case
    // (same country) a single tap instead of two selects.
    const isDifferent = Boolean(savedTaxCountry) && savedTaxCountry !== residenceCountry;
    setSameTaxResidence(!isDifferent);
    setTaxResidenceCountry(isDifferent ? savedTaxCountry : "");
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
        applyProfileToForm(nextProfile);
        setEditing(nextProfile?.completionStatus !== "complete");
      })
      .catch((err) => setLoadError(err.message || t("creatorPage.payoutProfileLoadError")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wasComplete = Boolean(profile?.completionStatus === "complete");
  const lockedDestination = Boolean(profile?.lockedDestination);

  const handleCancelEdit = () => {
    applyProfileToForm(profile);
    setErrors({});
    setFeedback("");
    setEditing(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    const effectiveTaxCountry = sameTaxResidence ? form.residenceCountry : taxResidenceCountry;
    const nextErrors = {};
    if (!form.legalName.trim() || form.legalName.trim().length < 2) {
      nextErrors.legalName = t("creatorPage.payoutProfileLegalNameInvalid");
    }
    if (!form.residenceCountry) {
      nextErrors.residenceCountry = t("creatorPage.payoutProfileCountryInvalid");
    }
    if (!effectiveTaxCountry) {
      nextErrors.taxResidenceCountry = t("creatorPage.payoutProfileCountryInvalid");
    }
    if (!["individual", "company"].includes(form.beneficiaryType)) {
      nextErrors.beneficiaryType = t("creatorPage.payoutProfileBeneficiaryTypeInvalid");
    }
    const trimmedEmail = form.paypalEmail.trim();
    if (!isValidPaypalEmail(trimmedEmail)) {
      nextErrors.paypalEmail = t("creatorPage.payoutProfilePaypalEmailInvalid");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const headers = authHeaders();
    if (!headers) return;

    setSaving(true);
    setFeedback("");
    try {
      const res = await fetch(`${API_URL}/api/creator/payout-profile`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: form.legalName.trim(),
          residenceCountry: form.residenceCountry,
          taxResidenceCountry: effectiveTaxCountry,
          beneficiaryType: form.beneficiaryType,
          destinationMethod: "paypal",
          paypalEmail: trimmedEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("creatorPage.payoutProfileSaveError"));
      setProfile(data.profile);
      onProfileChange?.(data.profile);
      applyProfileToForm(data.profile);
      setFeedback(t("creatorPage.payoutProfileSaveSuccess"));
      setEditing(data.profile?.completionStatus !== "complete");
    } catch (err) {
      setFeedback(err.message || t("creatorPage.payoutProfileSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const completionStatus = profile?.completionStatus || "incomplete";

  // Missing-fields count derived purely from the current form state (the
  // same fields handleSave validates) — never a claim about backend/business
  // status, just a friendlier readout of what's left to fill in. Residence
  // country and tax-residence country are only two SEPARATE pending actions
  // when the creator declared a different tax country; when "same country"
  // is checked, picking the residence country also satisfies the tax one,
  // so it must only be counted once.
  const missingCount = useMemo(() => {
    if (completionStatus === "complete") return 0;
    let count = 0;
    if (!form.legalName.trim() || form.legalName.trim().length < 2) count += 1;
    if (!form.residenceCountry) {
      count += 1;
    } else if (!sameTaxResidence && !taxResidenceCountry) {
      count += 1;
    }
    if (!["individual", "company"].includes(form.beneficiaryType)) count += 1;
    if (!isValidPaypalEmail(form.paypalEmail.trim())) count += 1;
    return count;
  }, [completionStatus, form, sameTaxResidence, taxResidenceCountry]);

  const statusLabel =
    completionStatus === "complete"
      ? t("creatorPage.payoutProfileStatusComplete")
      : missingCount > 0
      ? t("creatorPage.payoutProfileStatusMissingCount").replace("{count}", String(missingCount))
      : t("creatorPage.payoutProfileStatusIncomplete");

  return (
    <FuturisticCard className="payout-profile-card" accent="purple" hover={false}>
      <div className="ppc-header">
        <div className="ppc-title-row">
          <h3 className="ppc-title">{t("creatorPage.payoutProfileTitle")}</h3>
          <span className={`ppc-status-pill ppc-status-${completionStatus}`}>{statusLabel}</span>
        </div>
        <p className="ppc-subtitle">{t("creatorPage.payoutProfileSubtitle")}</p>
      </div>

      {loadError ? (
        <div className="ppc-feedback ppc-feedback-error">
          <AlertIcon size={13} /> {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="ppc-skeleton" />
      ) : wasComplete && !editing ? (
        <div className="ppc-summary">
          <div className="ppc-summary-icon">
            <CheckCircleIcon size={18} />
          </div>
          <div className="ppc-summary-copy">
            <strong>{t("creatorPage.payoutProfileConfiguredTitle")}</strong>
            <span>{t("creatorPage.payoutProfileConfiguredSubtitle")}</span>
            <span className="ppc-summary-email">
              PayPal: <strong>{profile?.destination?.maskedPaypalEmail}</strong>
            </span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm ppc-edit-btn" onClick={() => setEditing(true)}>
            {t("creatorPage.payoutProfileEditCta")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="ppc-form">
          <section className="ppc-section">
            <h4 className="ppc-section-title">{t("creatorPage.payoutProfileSectionBeneficiary")}</h4>

            <label className="ppc-label" htmlFor="ppc-legal-name">
              {t("creatorPage.payoutProfileLegalNameLabel")}
            </label>
            <input
              id="ppc-legal-name"
              type="text"
              className="ppc-input"
              placeholder={t("creatorPage.payoutProfileLegalNamePlaceholder")}
              value={form.legalName}
              maxLength={120}
              onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
              disabled={saving}
            />
            {errors.legalName ? <p className="ppc-error">{errors.legalName}</p> : null}

            <div className="ppc-field-row">
              <div className="ppc-field-col">
                <label className="ppc-label" htmlFor="ppc-residence-country">
                  {t("creatorPage.payoutProfileResidenceCountryLabel")}
                </label>
                <select
                  id="ppc-residence-country"
                  className="ppc-input"
                  value={form.residenceCountry}
                  onChange={(e) => setForm((prev) => ({ ...prev, residenceCountry: e.target.value }))}
                  disabled={saving}
                >
                  <option value="">—</option>
                  {countryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.residenceCountry ? <p className="ppc-error">{errors.residenceCountry}</p> : null}
              </div>

              <div className="ppc-field-col">
                <label className="ppc-label">{t("creatorPage.payoutProfileBeneficiaryTypeLabel")}</label>
                <div className="ppc-segmented" role="radiogroup" aria-label={t("creatorPage.payoutProfileBeneficiaryTypeLabel")}>
                  {["individual", "company"].map((type) => (
                    <button
                      type="button"
                      key={type}
                      role="radio"
                      aria-checked={form.beneficiaryType === type}
                      className={`ppc-radio-chip ${form.beneficiaryType === type ? "ppc-radio-chip-active" : ""}`}
                      onClick={() => setForm((prev) => ({ ...prev, beneficiaryType: type }))}
                      disabled={saving}
                    >
                      {type === "individual"
                        ? t("creatorPage.payoutProfileBeneficiaryIndividual")
                        : t("creatorPage.payoutProfileBeneficiaryCompany")}
                    </button>
                  ))}
                </div>
                {errors.beneficiaryType ? <p className="ppc-error">{errors.beneficiaryType}</p> : null}
              </div>
            </div>
          </section>

          <section className="ppc-section">
            <h4 className="ppc-section-title">{t("creatorPage.payoutProfileSectionFiscal")}</h4>

            <label className="ppc-checkbox-row" htmlFor="ppc-same-tax-residence">
              <input
                id="ppc-same-tax-residence"
                type="checkbox"
                checked={sameTaxResidence}
                onChange={(e) => setSameTaxResidence(e.target.checked)}
                disabled={saving}
              />
              <span>{t("creatorPage.payoutProfileSameTaxResidence")}</span>
            </label>

            {!sameTaxResidence ? (
              <div className="ppc-field-col ppc-field-col-indented">
                <label className="ppc-label" htmlFor="ppc-tax-country">
                  {t("creatorPage.payoutProfileTaxCountryLabel")}
                </label>
                <select
                  id="ppc-tax-country"
                  className="ppc-input"
                  value={taxResidenceCountry}
                  onChange={(e) => setTaxResidenceCountry(e.target.value)}
                  disabled={saving}
                >
                  <option value="">—</option>
                  {countryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.taxResidenceCountry ? <p className="ppc-error">{errors.taxResidenceCountry}</p> : null}
                <p className="ppc-note">{t("creatorPage.payoutProfileTaxCountryHelp")}</p>
              </div>
            ) : null}
          </section>

          <section className="ppc-section">
            <h4 className="ppc-section-title">{t("creatorPage.payoutProfileSectionDestination")}</h4>

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
              value={form.paypalEmail}
              maxLength={254}
              onChange={(e) => setForm((prev) => ({ ...prev, paypalEmail: e.target.value }))}
              disabled={saving || lockedDestination}
            />
            {errors.paypalEmail ? <p className="ppc-error">{errors.paypalEmail}</p> : null}
            <p className="ppc-note ppc-note-soft">{t("creatorPage.payoutProfileNotVerifiedNote")}</p>
            {lockedDestination ? <p className="ppc-note ppc-note-warning">{t("creatorPage.payoutProfileLockedNote")}</p> : null}
          </section>

          {feedback ? <p className="ppc-feedback-inline">{feedback}</p> : null}

          <div className="ppc-actions">
            {wasComplete ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancelEdit} disabled={saving}>
                {t("creatorPage.payoutProfileCancelEdit")}
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary btn-sm ppc-save-btn" disabled={saving}>
              {saving ? t("creatorPage.payoutProfileSaving") : t("creatorPage.payoutProfileSaveAll")}
            </button>
          </div>
        </form>
      )}

      <style jsx>{`
        /* FuturisticCard renders this component's own wrapping <div>, so a
           plain ".payout-profile-card" rule here never matches — styled-jsx
           only scopes elements literally written in THIS component's JSX.
           :global() is required to actually reach that outer div (same
           pattern used for FuturisticCard/Link elsewhere in the app). */
        :global(.payout-profile-card) {
          padding: 0.9rem 1rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          margin-bottom: 0.4rem;
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
          background: rgba(52, 211, 153, 0.14);
          color: #86efac;
          border: 1px solid rgba(52, 211, 153, 0.3);
        }
        .ppc-subtitle {
          font-size: 0.74rem;
          color: var(--text-muted);
          margin: 0;
        }

        .ppc-skeleton {
          height: 160px;
          border-radius: var(--radius);
          background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03));
        }

        .ppc-summary {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(167, 139, 250, 0.22);
          border-radius: 12px;
          padding: 0.7rem 0.75rem;
        }
        .ppc-summary-icon {
          width: 2rem;
          height: 2rem;
          border-radius: 10px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #86efac;
          background: rgba(52, 211, 153, 0.12);
          border: 1px solid rgba(52, 211, 153, 0.3);
        }
        .ppc-summary-copy {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
          flex: 1;
          font-size: 0.76rem;
          color: var(--text-muted);
        }
        .ppc-summary-copy strong {
          font-size: 0.85rem;
          color: #fff;
        }
        .ppc-summary-email {
          color: #c4b5fd;
        }
        .ppc-edit-btn {
          flex-shrink: 0;
        }

        .ppc-form {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .ppc-section {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0.65rem 0.7rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }
        .ppc-section-title {
          margin: 0 0 0.1rem;
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #d8b4fe;
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
        .ppc-input:disabled {
          opacity: 0.6;
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
        .ppc-field-col-indented {
          margin-top: 0.15rem;
          padding-top: 0.45rem;
          border-top: 1px dashed rgba(255, 255, 255, 0.08);
        }
        .ppc-segmented {
          display: flex;
          gap: 0.3rem;
          padding: 0.2rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .ppc-radio-chip {
          flex: 1;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-muted);
          border-radius: 8px;
          padding: 0.4rem 0.5rem;
          font-size: 0.74rem;
          font-weight: 700;
          cursor: pointer;
          min-height: 2.25rem;
          transition: background var(--transition), border-color var(--transition), color var(--transition);
        }
        .ppc-radio-chip-active {
          background: linear-gradient(135deg, rgba(232, 121, 249, 0.3), rgba(167, 139, 250, 0.3));
          border-color: #c084fc;
          color: #fff;
          box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.25) inset;
        }
        .ppc-checkbox-row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 0.76rem;
          color: #fff;
          cursor: pointer;
          padding: 0.15rem 0;
        }
        .ppc-checkbox-row input {
          width: 1.15rem;
          height: 1.15rem;
          accent-color: #c084fc;
          flex-shrink: 0;
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
        .ppc-note-soft {
          padding: 0.4rem 0.55rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          line-height: 1.35;
        }
        .ppc-note-warning {
          color: #fcd34d;
        }
        .ppc-feedback-inline {
          font-size: 0.7rem;
          color: #c4b5fd;
          margin: 0;
        }
        .ppc-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.3rem;
          padding-bottom: 0.2rem;
        }
        .ppc-save-btn {
          flex: 1;
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
