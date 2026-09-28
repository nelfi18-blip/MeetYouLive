"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildNativeAuthSuccessDeepLink } from "@/lib/nativeAuthRedirect";
import { normalizeCallbackPath } from "@/lib/redirects";
import { useLanguage } from "@/contexts/LanguageContext";

function NativeCallbackHandler() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [deepLink, setDeepLink] = useState("");
  const [error, setError] = useState("");
  const callbackPath = useMemo(
    () => normalizeCallbackPath(searchParams.get("callbackUrl")),
    [searchParams]
  );
  useEffect(() => {
    let cancelled = false;

    async function completeNativeLogin() {
      try {
        const response = await fetch("/api/auth/backend-token", { method: "POST" });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.token) {
          throw new Error(data?.error || t("authNativeCallback.defaultError"));
        }

        const nextDeepLink = buildNativeAuthSuccessDeepLink(data.token, callbackPath);
        if (cancelled) return;
        setDeepLink(nextDeepLink);
        window.location.replace(nextDeepLink);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("authNativeCallback.defaultError"));
        }
      }
    }

    completeNativeLogin();

    return () => {
      cancelled = true;
    };
  }, [callbackPath]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#060411", color: "white", padding: "2rem", textAlign: "center" }}>
      <div>
        <h1>{t("authNativeCallback.returning")}</h1>
        {error ? (
          <p>{error}</p>
        ) : (
          <p>{t("authNativeCallback.closingBrowser")}</p>
        )}
        {deepLink && (
          <p>
            <a href={deepLink} style={{ color: "#f0abfc" }}>{t("authNativeCallback.openApp")}</a>
          </p>
        )}
      </div>
    </main>
  );
}

export default function NativeAuthCallbackPage() {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<p>{t("authNativeCallback.returning")}</p>}>
      <NativeCallbackHandler />
    </Suspense>
  );
}
