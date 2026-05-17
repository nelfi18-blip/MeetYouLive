"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import { isBottomNavRoute } from "@/lib/bottomNavRoutes";

export default function BottomNavWrapper() {
  const pathname = usePathname();

  if (!isBottomNavRoute(pathname)) return null;

  return <BottomNav />;
}
