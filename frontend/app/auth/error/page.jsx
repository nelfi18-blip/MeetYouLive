"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const ERROR_MESSAGES = {
    Configuration: t("authError.configuration"),
    AccessDenied: t("authError.accessDenied"),
    Verification: t("authError.verification"),
    Default: t("authError.default"),
  };
  const error = searchParams.get("error");
  const message = ERROR_MESSAGES[error] || ERROR_MESSAGES.Default;

  return (
    <div className="card" style={{ maxWidth: 420, margin: "80px auto", padding: "2rem", textAlign: "center" }}>
      <h1 style={{ marginBottom: "1rem" }}>{t("authError.title")}</h1>
      <p style={{ marginBottom: "1.5rem", color: "var(--text)" }}>{message}</p>
      <Link href="/login" className="btn btn-primary">
        {t("authError.backToLogin")}
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<p>{t("authError.loading")}</p>}>
      <AuthErrorContent />
    </Suspense>
  );
}
