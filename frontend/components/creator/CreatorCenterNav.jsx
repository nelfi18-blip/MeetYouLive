"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const CREATOR_CENTER_LINKS = [
  { href: "/creator", label: "Dashboard" },
  { href: "/creator#earnings", label: "Earnings" },
  { href: "/creator#wallet", label: "Wallet" },
  { href: "/creator#gifts", label: "Gifts" },
  { href: "/creator#followers", label: "Followers" },
  { href: "/creator#live-stats", label: "Live Stats" },
  { href: "/creator#withdrawals", label: "Withdrawals" },
  { href: "/creator/content", label: "Content" },
  { href: "/creator#creator-settings", label: "Creator Settings" },
];

export default function CreatorCenterNav() {
  const pathname = usePathname();

  return (
    <nav className="creator-center-nav" aria-label="Creator Center">
      {CREATOR_CENTER_LINKS.map((item) => {
        const itemPath = item.href.split("#")[0];
        const isActive = pathname === itemPath && (item.href === itemPath || pathname === "/creator/content");
        return (
          <Link key={item.href} href={item.href} className={`creator-center-link${isActive ? " active" : ""}`}>
            {item.label}
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
