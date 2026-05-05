"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";

// Pages that should show the modern bottom nav
const BOTTOM_NAV_ROUTES = [
  "/feed",
  "/explore",
  "/matches",
  "/chats",
  "/profile",
  "/coins",
  "/notifications",
  "/gifts",
  "/ranking",
  "/sparks",
  "/passes"
];

export default function BottomNavWrapper() {
  const pathname = usePathname();
  
  // Show bottom nav on specific routes or routes that start with certain paths
  const shouldShow = BOTTOM_NAV_ROUTES.some(route => 
    pathname === route || pathname?.startsWith(route + "/")
  );

  if (!shouldShow) return null;
  
  return <BottomNav />;
}
