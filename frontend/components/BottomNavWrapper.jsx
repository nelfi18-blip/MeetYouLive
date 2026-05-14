"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import { isChromeHiddenPath } from "@/lib/navRoutes";

// BottomNav is shown wherever the main Navbar is shown (see NavbarWrapper).
// Both wrappers share isChromeHiddenPath so the two visibility rules can't
// drift, and BottomNav remains the single bottom navigation across the app.
export default function BottomNavWrapper() {
  const pathname = usePathname();
  if (isChromeHiddenPath(pathname)) return null;
  return <BottomNav />;
}

