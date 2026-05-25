"use client";

import { usePathname } from "next/navigation";

export default function MainContentWrapper({ children }) {
  const pathname = usePathname();
  const isFeedRoute = pathname === "/feed" || pathname?.startsWith("/feed/");
  const className = isFeedRoute
    ? "main-content main-content-feed"
    : "main-content";

  return <main className={className}>{children}</main>;
}
