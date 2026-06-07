"use client";

import { usePathname } from "next/navigation";
import { isBottomNavRoute } from "@/lib/bottomNavRoutes";

export default function MainContentWrapper({ children }) {
  const pathname = usePathname();
  const isFeedRoute = pathname === "/feed" || pathname?.startsWith("/feed/");
  const isProfileRoute = pathname === "/profile";
  const className = [
    "main-content",
    isFeedRoute && "main-content-feed",
    isBottomNavRoute(pathname) && "main-content-bottom-nav",
    isProfileRoute && "main-content-profile",
  ]
    .filter(Boolean)
    .join(" ");

  return <main className={className}>{children}</main>;
}
