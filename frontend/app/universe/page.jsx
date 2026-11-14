"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { clearToken, getToken } from "@/lib/token";
import ExploreCarousel3D from "@/components/ExploreCarousel3D";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MESSAGES = {
  es: { checking: "Preparando tu universo…", error: "No pudimos verificar tu sesión.", retry: "Reintentar" },
  en: { checking: "Preparing your universe…", error: "We couldn't verify your session.", retry: "Try again" },
  pt: { checking: "Preparando seu universo…", error: "Não foi possível verificar sua sessão.", retry: "Tentar novamente" },
};

// Real authenticated entry for the 3D selector. Keep /universe-preview public
// and isolated for visual review; regular accounts reach this page only after
// the existing login/backend JWT handshake or onboarding completion.
export default function UniversePage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { lang } = useLanguage();
  const copy = MESSAGES[lang] || MESSAGES.es;
  const [state, setState] = useState("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Wait for NextAuth to hydrate before treating a Google sign-in as logged out.
    const token = getToken() || session?.backendToken;
    if (!token && sessionStatus === "loading") return undefined;
    if (!token) {
      router.replace("/login?callbackUrl=%2Funiverse");
      return undefined;
    }
    if (!API_URL) {
      setState("error");
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState("checking");
    (async () => {
      try {
        const response = await fetch(`${API_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          // Clear the cookie mirrored from the backend JWT before opening
          // /login; otherwise middleware could bounce between /login and
          // /universe on an expired email session. Google sessions must also
          // end when their backend token has been rejected.
          clearToken();
          if (sessionStatus === "authenticated") {
            await signOut({ redirect: false }).catch(() => {});
          }
          if (!cancelled) router.replace("/login?callbackUrl=%2Funiverse");
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        const user = await response.json();
        if (cancelled) return;
        if (user?.role === "admin") {
          router.replace("/admin");
        } else if (user?.onboardingComplete === false) {
          // Never bypass mandatory profile completion or email-based sign-in.
          router.replace("/onboarding");
        } else {
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [router, session?.backendToken, sessionStatus, attempt]);

  if (state === "ready") return <ExploreCarousel3D />;

  return (
    <section role="status" aria-live="polite" aria-busy={state === "checking"}
      style={{
        minHeight: "100svh", background: "#060416", color: "#f8f5ff",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 24, textAlign: "center", gap: 16,
      }}>
      <strong style={{ fontSize: "1.4rem" }}>MeetYouLive</strong>
      <span>{state === "checking" ? copy.checking : copy.error}</span>
      {state === "error" && (
        <button type="button" onClick={() => setAttempt((n) => n + 1)}
          style={{
            padding: "10px 22px", color: "white", cursor: "pointer",
            borderRadius: 20, border: "1px solid #70e8ff",
            background: "linear-gradient(120deg,#b42cba,#244fbd)",
          }}>
          {copy.retry}
        </button>
      )}
    </section>
  );
}
