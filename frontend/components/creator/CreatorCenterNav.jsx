"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ClockIcon,
  CoinIcon,
  TrendUpIcon,
  UsersIcon,
  VideoIcon,
  WalletIcon,
  SettingsGearIcon,
} from "@/components/ui/MonetizationIcons";

function HomeIcon(props) {
  return (
    <svg
      width={props.size || 16}
      height={props.size || 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

const CREATOR_CENTER_LINKS = [
  { href: "/creator", Icon: HomeIcon, key: "dashboard" },
  { href: "/live", Icon: VideoIcon, key: "myLives" },
  { href: "/live/start", Icon: ClockIcon, key: "scheduleLive" },
  { href: "/creator#followers", Icon: UsersIcon, key: "community" },
  { href: "/creator#earnings", Icon: CoinIcon, key: "earnings" },
  { href: "/creator#wallet", Icon: WalletIcon, key: "withdrawals" },
  { href: "/creator#analytics", Icon: TrendUpIcon, key: "analytics" },
  { href: "/settings", Icon: SettingsGearIcon, key: "settings" },
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
      {CREATOR_CENTER_LINKS.map(({ href, Icon, key }) => {
        const [itemPath, itemHash] = href.split("#");
        const isActive = itemHash ? pathname === itemPath && hash === `#${itemHash}` : pathname === itemPath && !hash;
        return (
          <Link key={href} href={href} className={`creator-center-link${isActive ? " active" : ""}`}>
            <span className="creator-center-icon"><Icon size={15} /></span>
            <span className="creator-center-label">{t(`creatorCenterNav.${key}`)}</span>
          </Link>
        );
      })}
      <style jsx>{`
        .creator-center-nav {
          display: flex;
          gap: 0.4rem;
          overflow-x: auto;
          padding: 0.1rem 0 0.1rem;
          scrollbar-width: none;
        }
        .creator-center-nav::-webkit-scrollbar {
          display: none;
        }
        .creator-center-link {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 0.32rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
          border-radius: 999px;
          padding: 0.4rem 0.68rem;
          font-size: 0.7rem;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
          transition: border-color var(--transition), background var(--transition), color var(--transition);
        }
        .creator-center-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #c4b5fd;
        }
        .creator-center-link:hover,
        .creator-center-link.active {
          border-color: rgba(224, 64, 251, 0.5);
          background: linear-gradient(90deg, rgba(224,64,251,0.2), rgba(34,211,238,0.12));
          color: #fff;
        }
        .creator-center-link.active .creator-center-icon,
        .creator-center-link:hover .creator-center-icon {
          color: #f5d0fe;
        }
      `}</style>
    </nav>
  );
}
