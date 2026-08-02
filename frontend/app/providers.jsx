"use client";

import { useCallback, useEffect, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import socket, { configureSocketAuth } from "@/lib/socket";
import NotificationCenter, { useNotifications } from "@/components/NotificationCenter";
import NativeAppManager from "@/components/NativeAppManager";
import { registerPush } from "@/lib/notify";
import { initPushNotifications } from "@/lib/fcm";
import { isNativeMobileApp } from "@/lib/mobileEnvironment";
import { initNativePushNotifications } from "@/lib/nativePush";
import { fetchUserRole, activateAdminSession, clearToken, setToken } from "@/lib/token";
import { isProtectedRoutePath } from "@/lib/publicAccess";
import { restoreNativeRoute, restoreNativeToken } from "@/lib/nativeSession";
import { getNativeInvalidSessionPath, getNativeSessionStartPath, shouldReplaceNativeStartPath } from "@/lib/nativeSessionPolicy";

const ADMIN_ROLE_CHECK_TIMEOUT_MS = 8000;
const ADMIN_ROLE_CHECK_RETRIES = 1;
const NATIVE_SESSION_CHECK_TIMEOUT_MS = 8000;

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
    handleWithdrawalStatusChanged,
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
    socket.on("GIFT_RECEIVED", handleGiftSent);
    socket.on("WITHDRAWAL_STATUS_CHANGED", handleWithdrawalStatusChanged);
    socket.on("NEW_NOTIFICATION", handleNewNotification);

    return () => {
      clearInterval(heartbeatInterval);
      socket.off("LIVE_STARTED", handleLiveStarted);
      socket.off("GIFT_SENT", handleGiftSent);
      socket.off("MATCH_CREATED", handleMatchCreated);
      socket.off("CALL_INCOMING", handleCallIncoming);
      socket.off("CRUSH_RECEIVED", handleCrushReceived);
      socket.off("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);
      socket.off("GIFT_RECEIVED", handleGiftSent);
      socket.off("WITHDRAWAL_STATUS_CHANGED", handleWithdrawalStatusChanged);
      socket.off("NEW_NOTIFICATION", handleNewNotification);
    };
  }, [session, handleLiveStarted, handleGiftSent, handleMatchCreated, handleCallIncoming, handleCrushReceived, handleSuperCrushReceived, handleWithdrawalStatusChanged, handleNewNotification]);

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

function NativeSessionBootstrap({ children }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [ready, setReady] = useState(() => typeof window === "undefined" || !isNativeMobileApp());

  useEffect(() => {
    if (!isNativeMobileApp()) {
      setReady(true);
      return undefined;
    }

    let cancelled = false;

    async function bootstrap() {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const existingToken = localStorage.getItem("token");
      const nativeToken = existingToken || await restoreNativeToken();

      if (!nativeToken) {
        setReady(true);
        return;
      }

      setToken(nativeToken);
      const user = await fetchUserRole(nativeToken, NATIVE_SESSION_CHECK_TIMEOUT_MS, 0);
      if (cancelled) return;

      if (!user) {
        clearToken();
        router.replace(getNativeInvalidSessionPath());
        setReady(true);
        return;
      }

      const storedPath = await restoreNativeRoute();
      if (cancelled) return;

      const startPath = getNativeSessionStartPath({ currentPath, storedPath });
      if (shouldReplaceNativeStartPath(currentPath)) {
        router.replace(startPath);
      }
      setReady(true);
    }

    bootstrap().catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[NativeSessionBootstrap] native session restore failed:", error);
      }
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return <div aria-busy="true" aria-label={t("common.loading")} style={{ minHeight: "100vh", background: "#060411" }} />;
  }

  return children;
}

export default function Providers({ children, initialLang }) {
  return (
    <SessionProvider>
      <LanguageProvider initialLang={initialLang}>
        <NativeSessionBootstrap>
          <NativeAppManager />
          <AdminRoleGuard />
          {children}
          <SocketManager />
        </NativeSessionBootstrap>
      </LanguageProvider>
    </SessionProvider>
  );
}
