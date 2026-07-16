"use client";

import { usePathname } from "next/navigation";
import BottomNavEnhanced from "./BottomNavEnhanced";
import { isBottomNavRoute } from "@/lib/bottomNavRoutes";

export default function BottomNavWrapper() {
  const pathname = usePathname();
  
  const shouldShow = isBottomNavRoute(pathname);

  if (!shouldShow) return null;
  
  return <BottomNavEnhanced />;
}
