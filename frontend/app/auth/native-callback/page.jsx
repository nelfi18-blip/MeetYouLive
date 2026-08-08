"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildNativeAuthSuccessDeepLink } from "@/lib/nativeAuthRedirect";
import { normalizeCallbackPath } from "@/lib/redirects";

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

    async function completeNativeLogin() {
      try {
        const response = await fetch("/api/auth/backend-token", { method: "POST" });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.token) {
          throw new Error(data?.error || "No se pudo completar el inicio de sesión nativo.");
        }

        const nextDeepLink = buildNativeAuthSuccessDeepLink(data.token, callbackPath);
        if (cancelled) return;
        setDeepLink(nextDeepLink);
        window.location.replace(nextDeepLink);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo completar el inicio de sesión nativo.");
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
