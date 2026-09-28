"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const CREATOR_CENTER_LINKS = [
  { href: "/creator", icon: "🏠", key: "dashboard" },
  { href: "/live", icon: "📺", key: "myLives" },
  { href: "/live/start", icon: "📅", key: "scheduleLive" },
  { href: "/creator#followers", icon: "👥", key: "community" },
  { href: "/creator#earnings", icon: "💰", key: "earnings" },
  { href: "/creator#wallet", icon: "🏦", key: "withdrawals" },
  { href: "/creator#analytics", icon: "📈", key: "analytics" },
  { href: "/settings", icon: "⚙️", key: "settings" },
];

export default function CreatorCenterNav() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  return (
    <nav className="creator-center-nav" aria-label={t("creatorCenterNav.aria")}>
      {CREATOR_CENTER_LINKS.map((item) => {
        const [itemPath, itemHash] = item.href.split("#");
        const isActive = itemHash ? pathname === itemPath && hash === `#${itemHash}` : pathname === itemPath && !hash;
        return (
          <Link key={item.href} href={item.href} className={`creator-center-link${isActive ? " active" : ""}`}>
            {`${item.icon} ${t(`creatorCenterNav.${item.key}`)}`}
          </Link>
        );
      })}
      <style jsx>{`
        .creator-center-nav {
          display: flex;
          gap: 0.45rem;
          overflow-x: auto;
          padding: 0.25rem 0 0.65rem;
          scrollbar-width: thin;
        }
        .creator-center-link {
          flex: 0 0 auto;
          border: 1px solid rgba(224, 64, 251, 0.24);
          background: rgba(255, 255, 255, 0.05);
          color: #d8b4fe;
          border-radius: 999px;
          padding: 0.48rem 0.72rem;
          font-size: 0.76rem;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
        }
        .creator-center-link:hover,
        .creator-center-link.active {
          border-color: rgba(224, 64, 251, 0.5);
          background: rgba(224, 64, 251, 0.16);
          color: #f5d0fe;
        }
      `}</style>
    </nav>
  );
}
