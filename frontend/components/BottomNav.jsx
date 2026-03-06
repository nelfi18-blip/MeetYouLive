"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/dashboard", label: "Inicio", icon: "🏠" },
  { href: "/explore", label: "Explorar", icon: "🔍" },
  { href: "/live", label: "Directos", icon: "🎥" },
  { href: "/chats", label: "Chats", icon: "💬" },
  { href: "/profile", label: "Perfil", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`bottom-nav-item${pathname === link.href ? " active" : ""}`}
        >
          <span>{link.icon}</span>
          <span>{link.label}</span>
        </Link>
      ))}

      <style jsx>{`
        .bottom-nav {
          display: flex;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(24, 24, 24, 0.95);
          backdrop-filter: blur(12px);
          border-top: 1px solid var(--border);
          height: 60px;
          padding: 0 0.5rem;
          gap: 0;
        }

        .bottom-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          font-size: 0.65rem;
          gap: 0.2rem;
          color: var(--text-muted) !important;
          transition: color var(--transition);
          padding: 0.5rem;
        }

        .bottom-nav-item span:first-child { font-size: 1.2rem; }

        .bottom-nav-item:hover,
        .bottom-nav-item.active { color: var(--accent) !important; }
      `}</style>
    </nav>
  );
}
