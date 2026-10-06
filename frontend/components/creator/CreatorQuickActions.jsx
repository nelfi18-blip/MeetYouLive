"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CoinIcon,
  GiftIcon,
  SettingsGearIcon,
  SparkIcon,
  VideoIcon,
} from "@/components/ui/MonetizationIcons";

function ContentIcon(props) {
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
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

function ShareIcon(props) {
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
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="M8.1 10.9 15.9 6.6M8.1 13.1l7.8 4.3" />
    </svg>
  );
}

function NetworkIcon(props) {
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
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 7v4m0 4-6 2m12-2-6 2" />
    </svg>
  );
}

const TILE_ACCENTS = {
  purple: { border: "rgba(196,181,253,0.35)", bg: "rgba(196,181,253,0.12)", color: "#ddd6fe" },
  pink: { border: "rgba(244,114,182,0.38)", bg: "rgba(244,114,182,0.14)", color: "#fbcfe8" },
  cyan: { border: "rgba(34,211,238,0.35)", bg: "rgba(34,211,238,0.12)", color: "#a5f3fc" },
  orange: { border: "rgba(251,146,60,0.38)", bg: "rgba(251,146,60,0.14)", color: "#fed7aa" },
  green: { border: "rgba(52,211,153,0.38)", bg: "rgba(52,211,153,0.14)", color: "#86efac" },
  muted: { border: "rgba(148,163,184,0.3)", bg: "rgba(255,255,255,0.05)", color: "#cbd5e1" },
};

function Tile({ href, label, icon, accent = "purple", onClick, disabled }) {
  const style = TILE_ACCENTS[accent] || TILE_ACCENTS.purple;
  const content = (
    <>
      <span
        className="qa-icon"
        style={{ borderColor: style.border, background: style.bg, color: style.color }}
      >
        {icon}
      </span>
      <span className="qa-label">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="qa-tile qa-tile-btn" onClick={onClick} disabled={disabled}>
        {content}
        <style jsx>{`
          .qa-tile-btn {
            width: 100%;
            border: none;
            cursor: pointer;
          }
          .qa-tile-btn:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }
        `}</style>
      </button>
    );
  }

  return (
    <Link href={href} className="qa-tile">
      {content}
    </Link>
  );
}

export default function CreatorQuickActions({
  canMonetize,
  profileHref,
  onRequestPayout,
  payoutDisabled,
}) {
  const { t } = useLanguage();

  const tiles = [
    { key: "myLives", href: "/live", label: t("creatorQuickActions.myLives"), icon: <VideoIcon size={16} />, accent: "purple" },
    { key: "myContent", href: "/creator/content", label: t("creatorQuickActions.myContent"), icon: <ContentIcon size={16} />, accent: "pink" },
    { key: "gifts", href: "#gifts", label: t("creatorQuickActions.giftsReceived"), icon: <GiftIcon size={16} />, accent: "cyan" },
    canMonetize
      ? { key: "withdraw", label: t("creatorQuickActions.withdrawMoney"), icon: <CoinIcon size={16} />, accent: "orange", onClick: onRequestPayout, disabled: payoutDisabled }
      : { key: "withdraw", href: "/creator-request", label: t("creatorQuickActions.withdrawMoney"), icon: <CoinIcon size={16} />, accent: "muted" },
    { key: "editProfile", href: "/profile", label: t("creatorQuickActions.editProfile"), icon: <SparkIcon size={16} />, accent: canMonetize ? "purple" : "muted" },
    { key: "shareProfile", href: profileHref, label: t("creatorQuickActions.shareProfile"), icon: <ShareIcon size={16} />, accent: canMonetize ? "pink" : "muted" },
    { key: "myNetwork", href: "/agency", label: t("creatorQuickActions.myNetwork"), icon: <NetworkIcon size={16} />, accent: canMonetize ? "cyan" : "muted" },
    { key: "settings", href: "/settings", label: t("creatorQuickActions.settings"), icon: <SettingsGearIcon size={16} />, accent: "muted" },
  ];

  return (
    <div className="qa-grid">
      {tiles.map((tile) => (
        <Tile
          key={tile.key}
          href={tile.href}
          label={tile.label}
          icon={tile.icon}
          accent={tile.accent}
          onClick={tile.onClick}
          disabled={tile.disabled}
        />
      ))}

      <style jsx>{`
        .qa-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.5rem;
        }
        :global(.qa-tile) {
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: #e2e8f0;
          text-decoration: none;
          padding: 0.65rem 0.4rem 0.6rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          text-align: center;
          transition: border-color var(--transition), background var(--transition), transform var(--transition);
        }
        :global(.qa-tile:hover) {
          border-color: rgba(224, 64, 251, 0.4);
          background: rgba(224, 64, 251, 0.1);
          transform: translateY(-1px);
        }
        :global(.qa-icon) {
          width: 2.1rem;
          height: 2.1rem;
          border-radius: 11px;
          border: 1px solid;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        :global(.qa-label) {
          font-size: 0.68rem;
          font-weight: 700;
          line-height: 1.25;
        }
        @media (max-width: 420px) {
          .qa-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
