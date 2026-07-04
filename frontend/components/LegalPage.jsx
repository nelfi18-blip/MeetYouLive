"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import LegalLinks from "@/components/LegalLinks";

export default function LegalPage({ policyKey }) {
  const { t } = useLanguage();
  const policy = t(`legal.policies.${policyKey}`);
  const title = typeof policy?.title === "string" ? policy.title : policyKey;
  const description = typeof policy?.description === "string" ? policy.description : "";
  const lastUpdated = typeof policy?.lastUpdated === "string" ? policy.lastUpdated : "";
  const sections = Array.isArray(policy?.sections) ? policy.sections : [];

  return (
    <div className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <Link href="/legal" className="back-link">← {t("legal.backToLegal")}</Link>
          <p className="legal-eyebrow">{t("legal.eyebrow")}</p>
          <h1 className="legal-title">{title}</h1>
          {description && <p className="legal-description">{description}</p>}
          {lastUpdated && <p className="legal-date">{t("legal.lastUpdated")}: {lastUpdated}</p>}
        </header>

        <div className="legal-content">
          {sections.map((section, index) => (
            <section key={`${policyKey}-${index}`}>
              <h2>{section.heading}</h2>
              {(section.body || []).map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="legal-footer">
          <LegalLinks compact />
          <Link href="/login" className="app-link">{t("legal.backToApp")}</Link>
        </footer>
      </div>

      <style jsx>{`
        .legal-page { min-height: 100vh; padding: 2rem 1rem 4rem; }
        .legal-container { max-width: 820px; margin: 0 auto; }
        .legal-header { margin-bottom: 2.5rem; }
        .back-link, .app-link { display: inline-block; font-size: 0.875rem; color: var(--text-muted); text-decoration: none; margin-bottom: 1rem; transition: color 0.15s; }
        .back-link:hover, .app-link:hover { color: var(--text); }
        .legal-eyebrow { margin: 0 0 0.5rem; color: var(--accent-3); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
        .legal-title { font-size: clamp(2rem, 5vw, 3rem); font-weight: 900; color: var(--text); margin: 0 0 0.75rem; letter-spacing: -0.04em; }
        .legal-description { color: var(--text-muted); font-size: 1rem; line-height: 1.7; margin: 0 0 0.75rem; }
        .legal-date { font-size: 0.82rem; color: var(--text-muted); margin: 0; }
        .legal-content { display: flex; flex-direction: column; gap: 2rem; }
        .legal-content :global(section) { border-top: 1px solid var(--border); padding-top: 1.5rem; }
        .legal-content :global(h2) { font-size: 1.08rem; font-weight: 800; color: var(--text); margin: 0 0 0.75rem; }
        .legal-content :global(p) { font-size: 0.92rem; color: var(--text-muted); line-height: 1.75; margin: 0 0 0.85rem; }
        .legal-content :global(p:last-child) { margin-bottom: 0; }
        .legal-footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 1rem; }
      `}</style>
    </div>
  );
}
