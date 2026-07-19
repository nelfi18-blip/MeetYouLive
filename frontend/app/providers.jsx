"use client";

import { useCallback, useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { LanguageProvider } from "@/contexts/LanguageContext";
import socket, { configureSocketAuth } from "@/lib/socket";
import NotificationCenter, { useNotifications } from "@/components/NotificationCenter";
import { registerPush } from "@/lib/notify";
import { initPushNotifications } from "@/lib/fcm";
import { isNativeMobileApp } from "@/lib/mobileEnvironment";
import { initNativePushNotifications } from "@/lib/nativePush";
import { fetchUserRole, activateAdminSession } from "@/lib/token";
import { isProtectedRoutePath } from "@/lib/publicAccess";

const ADMIN_ROLE_CHECK_TIMEOUT_MS = 8000;
const ADMIN_ROLE_CHECK_RETRIES = 1;

/** Decode JWT payload without verifying the signature (client-side only). */
function parseJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function SocketManager() {
  const { data: session } = useSession();
  const {
    notifications,
    push,
    dismiss,
    handleLiveStarted,
    handleGiftSent,
    handleMatchCreated,
    handleCallIncoming,
    handleCrushReceived,
    handleSuperCrushReceived,
  } = useNotifications();

  // Register push globally so any component (e.g. DailyRewardPopup) can call notify()
  useEffect(() => {
    registerPush(push);
  }, [push]);

  // Initialise FCM push notifications once the user is authenticated
  useEffect(() => {
    if (typeof document !== "undefined" && document.cookie.includes("admin-session=")) return;
    const backendToken =
      session?.backendToken ||
      (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    if (!backendToken) return;
    if (isNativeMobileApp()) {
      initNativePushNotifications(backendToken);
    } else {
      initPushNotifications(backendToken);
    }
  }, [session]);

  // Dispatch a window event when a new persisted notification arrives so the
  // Navbar bell can increment its count without needing a shared context.
  const handleNewNotification = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notif:new"));
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined" && document.cookie.includes("admin-session=")) return;
    // Resolve the backend JWT: OAuth users have it on session, email/password
    // users store it in localStorage.
    const backendToken =
      session?.backendToken ||
      (typeof window !== "undefined" ? localStorage.getItem("token") : null);

    const payload = backendToken ? parseJwtPayload(backendToken) : null;
    const userId = payload?.id;

    if (!userId) return;

    configureSocketAuth(backendToken);
    if (!socket.connected) {
      socket.connect();
    }

    // Send heartbeat every 2 minutes to keep the online status updated
    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("heartbeat");
      }
    }, 2 * 60 * 1000); // 2 minutes

    socket.on("LIVE_STARTED", handleLiveStarted);
    socket.on("GIFT_SENT", handleGiftSent);
    socket.on("MATCH_CREATED", handleMatchCreated);
    socket.on("CALL_INCOMING", handleCallIncoming);
    socket.on("CRUSH_RECEIVED", handleCrushReceived);
    socket.on("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);
    socket.on("NEW_NOTIFICATION", handleNewNotification);

    return () => {
      clearInterval(heartbeatInterval);
      socket.off("LIVE_STARTED", handleLiveStarted);
      socket.off("GIFT_SENT", handleGiftSent);
      socket.off("MATCH_CREATED", handleMatchCreated);
      socket.off("CALL_INCOMING", handleCallIncoming);
      socket.off("CRUSH_RECEIVED", handleCrushReceived);
      socket.off("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);
      socket.off("NEW_NOTIFICATION", handleNewNotification);
    };
  }, [session, handleLiveStarted, handleGiftSent, handleMatchCreated, handleCallIncoming, handleCrushReceived, handleSuperCrushReceived, handleNewNotification]);

  return <NotificationCenter notifications={notifications} onDismiss={dismiss} />;
}

/**
 * Verifies the authenticated role on route changes and moves admin users into
 * the admin-only session flow. It redirects admins away from protected social
 * routes to `/admin` while respecting the explicit account-switching flow.
 */
function AdminRoleGuard() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || status === "loading") return;
    // Account switching intentionally lands on /login?switch=1; do not bounce
    // an existing admin session back to /admin until the switch flow clears auth.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("switch") === "1") return;

    const token =
      session?.backendToken ||
      (typeof window !== "undefined" ? localStorage.getItem("admin_token") || localStorage.getItem("token") : null);
    if (!token) return;

    let cancelled = false;
    fetchUserRole(token, ADMIN_ROLE_CHECK_TIMEOUT_MS, ADMIN_ROLE_CHECK_RETRIES)
      .then((user) => {
        if (cancelled || user?.role !== "admin") return;
        activateAdminSession(token, user);
        if (isProtectedRoutePath(pathname) || pathname === "/login" || pathname === "/register") {
          router.replace("/admin");
        }
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[AdminRoleGuard] role check failed:", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router, session?.backendToken, status]);

  return null;
}

export default function Providers({ children, initialLang }) {
  return (
    <SessionProvider>
      <LanguageProvider initialLang={initialLang}>
        <AdminRoleGuard />
        {children}
        <SocketManager />
      </LanguageProvider>
    </SessionProvider>
  );
}
