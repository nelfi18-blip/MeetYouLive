"use client";

import Link from "next/link";

const NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard", label: "Inicio", icon: "🏠" },
  { key: "explore", href: "/explore", label: "Explorar", icon: "🔍" },
  { key: "live", href: "/live", label: "Directos", icon: "🎥" },
  { key: "vr", href: "/vr", label: "VR", icon: "🥽" },
  { key: "profile", href: "/profile", label: "Perfil", icon: "👤" },
];

export default function BottomNav({ active = "dashboard" }) {
  const baseClass =
    "flex flex-col items-center gap-1 text-xs text-zinc-300 transition";
  const activeClass = "text-pink-400";
  const vrActiveClass = "text-cyan-300";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-around bg-[rgba(24,24,24,0.95)] backdrop-blur-md border-t border-zinc-800 h-[60px] px-2 md:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.key;
        const colorClass = isActive
          ? item.key === "vr"
            ? vrActiveClass
            : activeClass
          : "";

        return (
          <Link
            key={item.key}
            href={item.href}
            className={`${baseClass} ${colorClass} flex-1 justify-center py-2`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
