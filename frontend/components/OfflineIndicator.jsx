"use client";

import { useState, useEffect } from "react";

/**
 * OfflineIndicator - Shows a notification when the user is offline
 * Displays a banner at the top of the screen with offline status
 */
export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check initial online status
    setIsOnline(navigator.onLine);

    // Handle online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(true);
      // Hide the "back online" banner after 3 seconds
      setTimeout(() => setShowBanner(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!showBanner && isOnline) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        padding: "12px 16px",
        textAlign: "center",
        fontSize: "14px",
        fontWeight: 500,
        background: isOnline
          ? "linear-gradient(135deg, #34d399 0%, #10b981 100%)"
          : "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
        color: "#ffffff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        animation: "slideDown 0.3s ease-out",
      }}
    >
      {isOnline ? (
        <>
          <span style={{ marginRight: "8px" }}>✓</span>
          Conexión restablecida
        </>
      ) : (
        <>
          <span style={{ marginRight: "8px" }}>⚠</span>
          Sin conexión a internet - Algunas funciones no están disponibles
        </>
      )}
      <style jsx>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
