"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { LEGAL_POLICIES } from "@/lib/legalPolicies";

export default function LegalIndexPage() {
  const { t } = useLanguage();

  return (
    <main className="legal-index">
      <section className="legal-index-hero">
        <Link href="/login" className="back-link">← {t("legal.backToApp")}</Link>
        <p className="legal-eyebrow">{t("legal.eyebrow")}</p>
        <h1>{t("legal.indexTitle")}</h1>
        <p>{t("legal.indexDescription")}</p>
      </section>
      <section className="legal-grid" aria-label={t("legal.navigationAria")}>
        {LEGAL_POLICIES.map((policy) => (
          <Link key={policy.key} href={policy.href} className="legal-card">
            <span>{t(`legal.policies.${policy.key}.shortTitle`)}</span>
            <strong>{t(`legal.policies.${policy.key}.title`)}</strong>
            <small>{t(`legal.policies.${policy.key}.description`)}</small>
          </Link>
        ))}
      </section>
      <style jsx>{`
        .legal-index { min-height: 100vh; max-width: 1020px; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
        .legal-index-hero { margin-bottom: 2rem; }
        .back-link { display: inline-block; color: var(--text-muted); text-decoration: none; margin-bottom: 1rem; }
        .back-link:hover { color: var(--text); }
        .legal-eyebrow { margin: 0 0 0.5rem; color: var(--accent-3); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
        h1 { margin: 0 0 0.75rem; color: var(--text); font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -0.04em; }
        p { margin: 0; color: var(--text-muted); line-height: 1.7; max-width: 760px; }
        .legal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
        .legal-card { border: 1px solid var(--border); border-radius: 20px; padding: 1.25rem; background: rgba(255,255,255,0.03); text-decoration: none; display: flex; flex-direction: column; gap: 0.55rem; min-height: 180px; transition: transform 0.15s, border-color 0.15s; }
        .legal-card:hover { transform: translateY(-2px); border-color: rgba(224,64,251,0.45); }
        .legal-card span { color: var(--accent-3); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
        .legal-card strong { color: var(--text); font-size: 1.05rem; }
        .legal-card small { color: var(--text-muted); line-height: 1.6; }
      `}</style>
    </main>
  );
}
