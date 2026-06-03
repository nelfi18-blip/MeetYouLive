"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function Loading() {
  const { t } = useLanguage();

  return (
    <div className="app-loading" aria-busy="true" aria-live="polite">
      <div className="app-loading__content">
        <div className="app-loading__mark" aria-hidden="true" />
        <div className="app-loading__spinner" aria-hidden="true" />
        <p>{t("common.loading")}</p>
      </div>
    </div>
  );
}
