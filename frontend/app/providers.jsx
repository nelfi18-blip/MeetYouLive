"use client";

import { SessionProvider } from "next-auth/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SocketProvider } from "@/contexts/SocketContext";

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <LanguageProvider>
        <SocketProvider>{children}</SocketProvider>
      </LanguageProvider>
    </SessionProvider>
  );
}
