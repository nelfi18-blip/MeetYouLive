"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

const HIDDEN_ROUTES = ["/login", "/register", "/", "/onboarding"];

export default function NavbarWrapper() {
  const pathname = usePathname();
  if (HIDDEN_ROUTES.includes(pathname) || pathname.startsWith("/admin")) return null;
  return <Navbar />;
}
