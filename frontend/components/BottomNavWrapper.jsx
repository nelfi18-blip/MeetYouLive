"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";

// Routes where the bottom nav should NOT appear.
// Mirrors NavbarWrapper's HIDDEN_ROUTES so the BottomNav is shown on every
// route the main Navbar is shown on. This makes the dedicated BottomNav the
// single source of truth for mobile navigation across the app.
const HIDDEN_ROUTES = ["/login", "/register", "/", "/onboarding"];

export default function BottomNavWrapper() {
  const pathname = usePathname();

  if (!pathname) return null;
  if (HIDDEN_ROUTES.includes(pathname)) return null;
  if (pathname.startsWith("/admin")) return null;

  return <BottomNav />;
}

