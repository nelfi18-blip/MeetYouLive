"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { LEGAL_POLICIES } from "@/lib/legalPolicies";

export default function LegalLinks({ compact = false, className = "" }) {
  const { t } = useLanguage();

  return (
    <nav className={`legal-links${compact ? " compact" : ""}${className ? ` ${className}` : ""}`} aria-label={t("legal.navigationAria")}>
      {LEGAL_POLICIES.map((policy, index) => (
        <span key={policy.key} className="legal-link-item">
          <Link href={policy.href}>{t(`legal.policies.${policy.key}.shortTitle`)}</Link>
          {index < LEGAL_POLICIES.length - 1 && <span className="legal-separator">·</span>}
        </span>
      ))}
      <style jsx>{`
        .legal-links {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.4rem 0.65rem;
          color: var(--text-muted);
          font-size: 0.82rem;
          line-height: 1.6;
        }
        .legal-links.compact { justify-content: flex-start; }
        .legal-link-item { display: inline-flex; align-items: center; gap: 0.65rem; }
        .legal-links :global(a) { color: var(--accent-3); text-decoration: none; }
        .legal-links :global(a:hover) { text-decoration: underline; }
        .legal-separator { color: var(--text-muted); opacity: 0.65; }
      `}</style>
    </nav>
  );
}
