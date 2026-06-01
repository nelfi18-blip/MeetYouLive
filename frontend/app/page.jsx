"use client";

// Root page (`/`) — auth-aware router.
//
// Behavior (per product requirement):
//   • Logged-out visitor  → redirect to /login (the real login page)
//   • Normal user         → redirect to /feed
//   • Admin user          → redirect to /admin
//
// Normal users must NEVER be defaulted to /dashboard from here.
// A short timeout guarantees the user is never stuck on a blank screen if
// the NextAuth session takes too long to hydrate or the backend role check
// hangs.

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { fetchUserRole, getToken, getAdminToken } from "@/lib/token";

// Hard ceiling for the role lookup; after this we send the user to /feed
// as a safe default so the homepage never stays blank.
const ROLE_LOOKUP_TIMEOUT_MS = 4000;

export default function RootRedirectPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (navigatedRef.current) return;

    // Fast path: admin session present → go straight to /admin.
    // Admin flow does not use NextAuth, so `status` would otherwise be
    // "unauthenticated" and we'd send them through /login unnecessarily.
    if (typeof window !== "undefined" && getAdminToken()) {
      navigatedRef.current = true;
      router.replace("/admin");
      return;
    }

    // Fast path: email/password session present in localStorage. NextAuth
    // doesn't know about these users so status will be "unauthenticated";
    // do the role check ourselves and go to /feed (or /admin if applicable).
    const localToken = typeof window !== "undefined" ? getToken() : null;
    if (localToken && status !== "authenticated") {
      let cancelled = false;
      const t = setTimeout(() => {
        if (cancelled || navigatedRef.current) return;
        navigatedRef.current = true;
        router.replace("/feed");
      }, ROLE_LOOKUP_TIMEOUT_MS);
      fetchUserRole(localToken)
        .then((user) => {
          if (cancelled || navigatedRef.current) return;
          clearTimeout(t);
          navigatedRef.current = true;
          router.replace(user?.role === "admin" ? "/admin" : "/feed");
        })
        .catch(() => {
          if (cancelled || navigatedRef.current) return;
          clearTimeout(t);
          navigatedRef.current = true;
          router.replace("/feed");
        });
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    // Wait for NextAuth to finish hydrating, but not forever.
    if (status === "loading") {
      const fallback = setTimeout(() => {
        if (navigatedRef.current) return;
        // If session hydration takes too long, assume logged out and send
        // the visitor to the real login page.
        navigatedRef.current = true;
        router.replace("/login");
      }, ROLE_LOOKUP_TIMEOUT_MS);
      return () => clearTimeout(fallback);
    }

    if (status === "unauthenticated") {
      navigatedRef.current = true;
      router.replace("/login");
      return;
    }

    // status === "authenticated"
    const token = session?.backendToken;

    if (!token) {
      // NextAuth session exists but the backend token handshake isn't done
      // yet. /login already handles that flow (it shows the "Connecting…"
      // screen and retries the backend-token endpoint), so route there.
      navigatedRef.current = true;
      router.replace("/login");
      return;
    }

    let cancelled = false;
    const roleTimeout = setTimeout(() => {
      if (cancelled || navigatedRef.current) return;
      // Don't leave the user staring at a blank page if the role lookup
      // hangs — default authenticated users to /feed (never /dashboard).
      navigatedRef.current = true;
      router.replace("/feed");
    }, ROLE_LOOKUP_TIMEOUT_MS);

    fetchUserRole(token)
      .then((user) => {
        if (cancelled || navigatedRef.current) return;
        clearTimeout(roleTimeout);
        navigatedRef.current = true;
        if (user?.role === "admin") {
          router.replace("/admin");
        } else {
          router.replace("/feed");
        }
      })
      .catch((err) => {
        if (cancelled || navigatedRef.current) return;
        clearTimeout(roleTimeout);
        console.warn("[/] role lookup failed, defaulting to /feed:", err?.message);
        navigatedRef.current = true;
        router.replace("/feed");
      });

    return () => {
      cancelled = true;
      clearTimeout(roleTimeout);
    };
  }, [status, session?.backendToken, router]);

  // Minimal placeholder while we decide where to send the user. Kept dark
  // and empty (no flashing content) — the redirect is near-instant in
  // practice.
  return (
    <div
      aria-busy="true"
      aria-label="Cargando…"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#060411",
        color: "#c9c3df",
        fontWeight: 700,
      }}
    >
      Cargando...
    </div>
  );
}
