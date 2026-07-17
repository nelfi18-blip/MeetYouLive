"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

// Routes where the global Navbar (top bar)
// must not render. /feed has its own sticky in-page header and uses the
// premium navigation from BottomNavWrapper, so rendering the global Navbar
// here would duplicate the header.
const HIDDEN_ROUTES = ["/login", "/register", "/", "/onboarding", "/feed"];

export default function NavbarWrapper() {
  const pathname = usePathname();
  if (!pathname) return null;
  if (HIDDEN_ROUTES.includes(pathname) || pathname.startsWith("/admin")) return null;
  // Also cover nested /feed/* paths.
  if (pathname.startsWith("/feed/")) return null;
  return <Navbar />;
}
