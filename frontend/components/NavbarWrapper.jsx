"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import { isChromeHiddenPath } from "@/lib/navRoutes";

export default function NavbarWrapper() {
  const pathname = usePathname();
  if (isChromeHiddenPath(pathname)) return null;
  return <Navbar />;
}
