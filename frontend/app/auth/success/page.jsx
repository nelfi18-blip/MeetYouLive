"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "@/lib/token";

/**
 * Inner component that reads search params and performs the redirect.
 * Must be wrapped in <Suspense> because useSearchParams() opts into
 * client-side rendering and Next.js requires a boundary for SSG/SSR.
 */
function AuthSuccessHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    // Basic JWT format guard: three Base64URL segments separated by dots.
    const isValidJwt = token && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*$/.test(token);
    if (isValidJwt) {
      setToken(token);
      router.replace("/dashboard");
    } else {
      // No valid token in the URL — something went wrong; redirect to login.
      router.replace("/login");
    }
  }, [router, searchParams]);

  return <p>Iniciando sesión...</p>;
}

/**
 * Handles the redirect from the backend Passport-based Google OAuth callback.
 * The backend redirects to /auth/success?token=<jwt> after a successful OAuth flow.
 * This page saves the token to localStorage and navigates to the dashboard.
 */
export default function AuthSuccessPage() {
  return (
    <Suspense fallback={<p>Cargando...</p>}>
      <AuthSuccessHandler />
    </Suspense>
  );
}
