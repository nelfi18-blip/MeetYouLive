"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { detectBrowserLanguage } from "@/lib/language";

export default function Providers({ children }) {
  useEffect(() => {
    // Detect browser language on first visit and store it for later syncing to DB.
    if (typeof window !== "undefined" && !localStorage.getItem("uiLanguage")) {
      localStorage.setItem("uiLanguage", detectBrowserLanguage());
    }
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
