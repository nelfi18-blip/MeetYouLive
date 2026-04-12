"use client";

import { useEffect, useRef } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import socket from "@/lib/socket";
import NotificationCenter, { useNotifications } from "@/components/NotificationCenter";
import { registerPush } from "@/lib/notify";

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
  const joinedRef = useRef(false);
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

  useEffect(() => {
    // Resolve the backend JWT: OAuth users have it on session, email/password
    // users store it in localStorage.
    const backendToken =
      session?.backendToken ||
      (typeof window !== "undefined" ? localStorage.getItem("token") : null);

    const payload = backendToken ? parseJwtPayload(backendToken) : null;
    const userId = payload?.id;

    if (!userId) return;

    if (!socket.connected) {
      socket.connect();
    }

    const joinRoom = () => {
      if (!joinedRef.current) {
        socket.emit("join_user_room", userId);
        joinedRef.current = true;
      }
    };

    if (socket.connected) {
      joinRoom();
    }

    socket.on("connect", joinRoom);
    socket.on("LIVE_STARTED", handleLiveStarted);
    socket.on("GIFT_SENT", handleGiftSent);
    socket.on("MATCH_CREATED", handleMatchCreated);
    socket.on("CALL_INCOMING", handleCallIncoming);
    socket.on("CRUSH_RECEIVED", handleCrushReceived);
    socket.on("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);

    return () => {
      joinedRef.current = false;
      socket.off("connect", joinRoom);
      socket.off("LIVE_STARTED", handleLiveStarted);
      socket.off("GIFT_SENT", handleGiftSent);
      socket.off("MATCH_CREATED", handleMatchCreated);
      socket.off("CALL_INCOMING", handleCallIncoming);
      socket.off("CRUSH_RECEIVED", handleCrushReceived);
      socket.off("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);
    };
  }, [session, handleLiveStarted, handleGiftSent, handleMatchCreated, handleCallIncoming, handleCrushReceived, handleSuperCrushReceived]);

  return <NotificationCenter notifications={notifications} onDismiss={dismiss} />;
}

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <LanguageProvider>
        {children}
        <SocketManager />
      </LanguageProvider>
    </SessionProvider>
  );
}
