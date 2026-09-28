"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Native Google sign-in handoff.
 *
 * The Capacitor Browser (an external browser tab, not the app WebView) is
 * pointed at this page instead of navigating straight to
 * `/api/auth/signin/google`. A plain GET to that NextAuth endpoint never
 * reaches Google: NextAuth's GET "signin" action always redirects to the
 * configured `pages.signIn` ("/login") with the callback URL preserved as a
 * query string, ignoring the requested provider. Landing on `/login` inside
 * the external browser (where `isNativeMobileApp()` is false because it is a
 * regular browser tab) causes the standard web sign-in flow to run instead,
 * which finishes on `/feed` in that same tab and never reaches
 * `/auth/native-callback`, so the `meetyoulive://auth/success` deep link is
 * never produced.
 *
 * Calling the `signIn()` client helper here performs the CSRF-verified POST
 * that NextAuth requires to actually redirect to Google, while preserving the
 * `/auth/native-callback` callback URL so the handoff to the app can
 * complete.
 */
function NativeGoogleSignInHandler() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    const callbackUrl = searchParams.get("callbackUrl") || "/auth/native-callback";

    signIn("google", { callbackUrl }).catch((err) => {
      setError(err instanceof Error ? err.message : t("auth.googleNativeError"));
    });
  }, [searchParams, t]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#060411", color: "white", padding: "2rem", textAlign: "center" }}>
      <div>
        <h1>{t("auth.connectingGoogle")}</h1>
        {error ? <p>{error}</p> : <p>{t("auth.redirectingMoment")}</p>}
      </div>
    </main>
  );
}

export default function NativeGoogleSignInPage() {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<p>{t("auth.connectingGoogle")}</p>}>
      <NativeGoogleSignInHandler />
    </Suspense>
  );
}
