"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { getNativeAuthCallbackPath } from "@/lib/nativeAuthRedirect";
import { normalizeCallbackPath } from "@/lib/redirects";

function NativeStartHandler() {
  const searchParams = useSearchParams();
  const hasStartedRef = useRef(false);
  const [error, setError] = useState("");
  const callbackPath = useMemo(
    () => normalizeCallbackPath(searchParams.get("callbackUrl")),
    [searchParams]
  );
  const nativeCallbackUrl = useMemo(
    () => getNativeAuthCallbackPath(callbackPath),
    [callbackPath]
  );

  useEffect(() => {
    let cancelled = false;

    async function startGoogleSignIn() {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;

      try {
        await signIn("google", { callbackUrl: nativeCallbackUrl });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo iniciar sesión con Google.");
        }
      }
    }

    startGoogleSignIn();

    return () => {
      cancelled = true;
    };
  }, [nativeCallbackUrl]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#060411", color: "white", padding: "2rem", textAlign: "center" }}>
      <div>
        <h1>Conectando con Google…</h1>
        {error ? (
          <p>{error}</p>
        ) : (
          <p>Estamos abriendo el inicio de sesión seguro de Google.</p>
        )}
      </div>
    </main>
  );
}

export default function NativeAuthStartPage() {
  return (
    <Suspense fallback={<p>Conectando con Google…</p>}>
      <NativeStartHandler />
    </Suspense>
  );
}
