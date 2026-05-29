import { NextResponse } from "next/server";
import { normalizeCallbackPath } from "@/lib/redirects";

function redirectToPath(request, pathname) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  // Drop stale route-specific query params when forcing a known safe route.
  url.search = "";
  return NextResponse.redirect(url);
}

function redirectToLogin(request) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  // Keep only callbackUrl so protected-route params are preserved inside it
  // instead of leaking onto /login as unrelated top-level query params.
  url.search = "";
  // searchParams.set keeps callback queries nested safely inside callbackUrl.
  url.searchParams.set(
    "callbackUrl",
    normalizeCallbackPath(`${request.nextUrl.pathname}${request.nextUrl.search}`)
  );
  return NextResponse.redirect(url);
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    /\.(?:png|jpg|jpeg|svg|webp|gif|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // ── Homepage Protection ────────────────────────────────────────────────────
  // The homepage (/) must ALWAYS be accessible to everyone without redirects.
  // This is a public landing page that should never redirect to admin or auth pages.
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Cookie set by email/password login AND by the dashboard once the backend
  // token is confirmed for Google OAuth users. Only this cookie means the full
  // auth handshake (including the backend JWT) is complete.
  const backendSession = request.cookies.get("auth-session")?.value;

  // NextAuth session cookies (Google OAuth). Present as soon as Google
  // redirects back, but the backend token may not be confirmed yet.
  const nextAuthSession =
    request.cookies.get("next-auth.session-token")?.value ||
    request.cookies.get("__Secure-next-auth.session-token")?.value ||
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  // Cookie set on successful admin login — separate from regular user sessions.
  const adminSession = request.cookies.get("admin-session")?.value;

  const isAuthPage = pathname === "/login" || pathname === "/register";

  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/feed") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/creator") ||
    pathname.startsWith("/chats") ||
    pathname.startsWith("/coins") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/matches") ||
    pathname.startsWith("/crush") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/live") ||
    pathname.startsWith("/wallet");

  // ── Admin routing ──────────────────────────────────────────────────────────

  // Protect /admin/* routes (except /admin/login) — must have admin session.
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminLoginPage = pathname === "/admin/login";

  if (isAdminRoute && !isAdminLoginPage && !adminSession) {
    return redirectToPath(request, "/admin/login");
  }

  // Already-authenticated admin on admin login page → send to dashboard.
  if (isAdminLoginPage && adminSession) {
    return redirectToPath(request, "/admin");
  }

  // Admin users must not access regular user pages.
  // Redirect to /admin/blocked only for protected routes so they see an explanation.
  // For auth pages, redirect directly to /admin (they shouldn't be logging in again).
  if (adminSession && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/blocked";
    url.search = "";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Admins on auth pages (trying to login again) → send to admin dashboard
  if (adminSession && isAuthPage) {
    return redirectToPath(request, "/admin");
  }

  // ── Regular user routing ───────────────────────────────────────────────────

  // Only redirect away from auth pages once the backend session is confirmed.
  // Using only nextAuthSession here would cause a redirect loop: Google OAuth
  // sets the NextAuth cookie before the backend token is fetched, so the
  // home page would have no token and redirect back to /login, which the
  // middleware would immediately bounce back to home — infinitely.
  // Regular authenticated users on auth pages should go to /feed, not homepage.
  if (backendSession && isAuthPage) {
    return redirectToPath(request, "/feed");
  }

  // Block unauthenticated access to protected routes (either session type is
  // sufficient here; the page itself validates the backend token).
  if (!backendSession && !nextAuthSession && isProtectedRoute) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
