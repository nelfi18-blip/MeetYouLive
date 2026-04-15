"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { clearAdminToken } from "@/lib/token";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "⊞", exact: true },
  { href: "/admin/users", label: "Usuarios", icon: "👥" },
  { href: "/admin/creators", label: "Creadores", icon: "🎬" },
  { href: "/admin/lives", label: "Streams", icon: "📡" },
  { href: "/admin/transactions", label: "Transacciones", icon: "💰" },
  { href: "/admin/reports", label: "Reportes", icon: "🚨" },
  { href: "/admin/analytics", label: "Analíticas", icon: "📊" },
  { href: "/admin/settings", label: "Configuración", icon: "⚙️" },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adminUser, setAdminUser] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") return;
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    try {
      const raw = localStorage.getItem("admin_user");
      if (raw) setAdminUser(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [pathname, router]);

  const handleLogout = () => {
    clearAdminToken();
    window.location.href = "/admin/login";
  };

  const isActive = (item) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  // /admin/login doesn't use this layout
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="min-h-screen flex bg-[#0f1117] text-slate-200">
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-[220px] bg-dark bg-[#161b27] z-50 transition-transform duration-300 flex flex-col border-r border-[#1e2535] ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        aria-label="Admin navigation"
      >
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4 border-b border-[#1e2535]">
          <span className="text-[1.4rem]">🛡️</span>
          <span className="text-sm font-bold tracking-[0.04em] text-violet-400 uppercase">Admin</span>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium no-underline border-l-[3px] transition-colors ${
                isActive(item)
                  ? "bg-violet-400/12 text-violet-400 border-violet-400 font-semibold"
                  : "text-slate-400 border-transparent hover:bg-violet-400/8 hover:text-slate-200"
              }`}
              onClick={() => setOpen(false)}
            >
              <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-[#1e2535] flex flex-col gap-3">
          {adminUser && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-700 to-fuchsia-500 flex items-center justify-center font-bold text-sm text-white shrink-0">
                {(adminUser.name || adminUser.username || "A")[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-200 truncate">{adminUser.name || adminUser.username}</div>
                <div className="text-xs text-slate-500">Administrador</div>
              </div>
            </div>
          )}
          <button
            className="w-full bg-red-500/8 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer text-left hover:bg-red-500/16"
            onClick={handleLogout}
          >
            ⏻ Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="w-full flex-1 min-w-0 flex flex-col md:pl-[220px]">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#161b27] border-b border-[#1e2535] sticky top-0 z-30">
          <button
            className="bg-transparent border-0 text-slate-200 text-2xl cursor-pointer leading-none p-1"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="text-[0.95rem] font-bold text-violet-400">MeetYouLive Admin</span>
        </header>

        <div className="flex-1 p-4 md:p-6 overflow-x-hidden">{children}</div>
      </div>
    </div>
  );
}
