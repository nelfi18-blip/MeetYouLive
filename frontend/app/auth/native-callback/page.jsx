"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildNativeAuthSuccessDeepLink,
  getNativeAuthSuccessHandoffUrls,
} from "@/lib/nativeAuthRedirect";
import { normalizeCallbackPath } from "@/lib/redirects";

// Give Chrome Custom Tabs enough time to mark the page hidden after a successful
// app handoff, without leaving the user waiting in Chrome before the PR #850
// direct deep-link retry.
const ANDROID_INTENT_FALLBACK_DELAY_MS = 900;

function NativeCallbackHandler() {
  const searchParams = useSearchParams();
  const [deepLink, setDeepLink] = useState("");
  const [error, setError] = useState("");
  const callbackPath = useMemo(
    () => normalizeCallbackPath(searchParams.get("callbackUrl")),
    [searchParams]
  );

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer = null;

    async function completeNativeLogin() {
      try {
        const response = await fetch("/api/auth/backend-token", { method: "POST" });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.token) {
          throw new Error(data?.error || "No se pudo completar el inicio de sesión nativo.");
        }

        const nextDeepLink = buildNativeAuthSuccessDeepLink(data.token, callbackPath);
        const [primaryHandoffUrl, fallbackHandoffUrl] = getNativeAuthSuccessHandoffUrls(
          nextDeepLink,
          window.navigator.userAgent
        );
        if (cancelled) return;
        setDeepLink(nextDeepLink);
        window.location.replace(primaryHandoffUrl);
        if (fallbackHandoffUrl) {
          fallbackTimer = window.setTimeout(() => {
            if (!cancelled && document.visibilityState !== "hidden") {
              window.location.replace(fallbackHandoffUrl);
            }
          }, ANDROID_INTENT_FALLBACK_DELAY_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo completar el inicio de sesión nativo.");
        }
      }
    }

    completeNativeLogin();

    return () => {
      cancelled = true;
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
    };
  }, [callbackPath]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#060411", color: "white", padding: "2rem", textAlign: "center" }}>
      <div>
        <h1>Volviendo a MeetYouLive…</h1>
        {error ? (
          <p>{error}</p>
        ) : (
          <p>Estamos cerrando el navegador seguro y regresando a la app.</p>
        )}
        {deepLink && (
          <p>
            <a href={deepLink} style={{ color: "#f0abfc" }}>Abrir la app</a>
          </p>
        )}
      </div>
    </main>
  );
}

export default function NativeAuthCallbackPage() {
  return (
    <Suspense fallback={<p>Volviendo a MeetYouLive…</p>}>
      <NativeCallbackHandler />
    </Suspense>
  );
}
