"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CoinIcon,
  GiftIcon,
  SettingsGearIcon,
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

function ProfileIcon(props) {
  return (
    <svg
      width={props.size || 24}
      height={props.size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
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

const ACCENTS = {
  purple: { border: "rgba(196,181,253,0.35)", bg: "rgba(196,181,253,0.12)", color: "#ddd6fe" },
  pink: { border: "rgba(244,114,182,0.38)", bg: "rgba(244,114,182,0.14)", color: "#fbcfe8" },
  cyan: { border: "rgba(34,211,238,0.35)", bg: "rgba(34,211,238,0.12)", color: "#a5f3fc" },
  orange: { border: "rgba(251,146,60,0.38)", bg: "rgba(251,146,60,0.14)", color: "#fed7aa" },
  green: { border: "rgba(52,211,153,0.38)", bg: "rgba(52,211,153,0.14)", color: "#86efac" },
  muted: { border: "rgba(148,163,184,0.3)", bg: "rgba(255,255,255,0.05)", color: "#cbd5e1" },
};

function PriorityTile({ href, label, icon, accent, onClick, disabled }) {
  const style = ACCENTS[accent] || ACCENTS.purple;
  const content = (
    <>
      <span className="pt-icon" style={{ borderColor: style.border, background: style.bg, color: style.color }}>
        {icon}
      </span>
      <span className="pt-label">{label}</span>
    </>
  );

  const Wrapper = onClick ? "button" : Link;
  const wrapperProps = onClick
    ? { type: "button", onClick, disabled, className: "priority-tile priority-tile-btn" }
    : { href, className: "priority-tile" };

  return (
    <Wrapper {...wrapperProps}>
      {content}
      <style jsx>{`
        .priority-tile-btn {
          width: 100%;
          border: none;
          cursor: pointer;
        }
        .priority-tile-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>
    </Wrapper>
  );
}

function CompactTile({ href, label, icon, accent, onClick, disabled }) {
  const style = ACCENTS[accent] || ACCENTS.purple;
  const content = (
    <>
      <span className="ct-icon" style={{ borderColor: style.border, background: style.bg, color: style.color }}>
        {icon}
      </span>
      <span className="ct-label">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="compact-tile compact-tile-btn"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
      >
        {content}
        <style jsx>{`
          .compact-tile-btn {
            cursor: pointer;
          }
          .compact-tile-btn:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }
        `}</style>
      </button>
    );
  }

  return (
    <Link href={href} className="compact-tile" aria-label={label} title={label}>
      {content}
    </Link>
  );
}

/**
 * Compact premium action launcher: a couple of priority tiles with visible
 * labels, plus a responsive grid of labeled compact tiles for the rest. Every
 * route/handler from the previous 8-card grid is preserved.
 */
export default function CreatorActionLauncher({
  canMonetize,
  profileHref,
  onRequestPayout,
  payoutDisabled,
}) {
  const { t } = useLanguage();

  const priorityTiles = [
    { key: "myLives", href: "/live", label: t("creatorQuickActions.myLives"), icon: <VideoIcon size={16} />, accent: "purple" },
    canMonetize
      ? { key: "withdraw", label: t("creatorQuickActions.withdrawMoney"), icon: <CoinIcon size={16} />, accent: "orange", onClick: onRequestPayout, disabled: payoutDisabled }
      : { key: "withdraw", href: "/creator-request", label: t("creatorQuickActions.withdrawMoney"), icon: <CoinIcon size={16} />, accent: "muted" },
  ];

  const compactTiles = [
    { key: "myContent", href: "/creator/content", label: t("creatorQuickActions.myContent"), icon: <ContentIcon size={26} />, accent: "pink" },
    { key: "gifts", href: "#gifts", label: t("creatorQuickActions.giftsReceived"), icon: <GiftIcon size={26} />, accent: "cyan" },
    { key: "editProfile", href: "/profile", label: t("creatorQuickActions.editProfile"), icon: <ProfileIcon size={26} />, accent: canMonetize ? "purple" : "muted" },
    { key: "shareProfile", href: profileHref, label: t("creatorQuickActions.shareProfile"), icon: <ShareIcon size={26} />, accent: canMonetize ? "pink" : "muted" },
    { key: "myNetwork", href: "/agency", label: t("creatorQuickActions.myNetwork"), icon: <NetworkIcon size={26} />, accent: canMonetize ? "cyan" : "muted" },
    { key: "settings", href: "/settings", label: t("creatorQuickActions.settings"), icon: <SettingsGearIcon size={26} />, accent: "muted" },
  ];

  return (
    <div className="launcher">
      <div className="priority-row">
        {priorityTiles.map((tile) => (
          <PriorityTile
            key={tile.key}
            href={tile.href}
            label={tile.label}
            icon={tile.icon}
            accent={tile.accent}
            onClick={tile.onClick}
            disabled={tile.disabled}
          />
        ))}
      </div>
      <div className="compact-row">
        {compactTiles.map((tile) => (
          <CompactTile
            key={tile.key}
            href={tile.href}
            label={tile.label}
            icon={tile.icon}
            accent={tile.accent}
            onClick={tile.onClick}
            disabled={tile.disabled}
          />
        ))}
      </div>

      <style jsx>{`
        .launcher {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .priority-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.45rem;
        }
        :global(.priority-tile) {
          border-radius: 13px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.045);
          color: #e2e8f0;
          text-decoration: none;
          padding: 0.55rem 0.6rem;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          transition: border-color var(--transition), background var(--transition), transform var(--transition);
        }
        :global(.priority-tile:hover) {
          border-color: rgba(224, 64, 251, 0.4);
          background: rgba(224, 64, 251, 0.1);
          transform: translateY(-1px);
        }
        :global(.pt-icon) {
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 9px;
          border: 1px solid;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        :global(.pt-label) {
          font-size: 0.72rem;
          font-weight: 700;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .compact-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.6rem;
        }
        .launcher :global(.compact-tile) {
          min-width: 0;
          min-height: 96px;
          border-radius: 13px;
          border: 1px solid rgba(224, 64, 251, 0.22);
          background: linear-gradient(145deg, rgba(76, 29, 149, 0.16), rgba(15, 23, 42, 0.6));
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
          color: #f8fafc;
          text-decoration: none;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: border-color var(--transition), background var(--transition), transform var(--transition);
        }
        .launcher :global(.compact-tile:hover) {
          border-color: rgba(224, 64, 251, 0.5);
          background: rgba(224, 64, 251, 0.1);
          transform: translateY(-1px);
        }
        .launcher :global(.compact-tile:focus-visible) {
          outline: 2px solid #22d3ee;
          outline-offset: 3px;
        }
        .launcher :global(.ct-label) {
          max-width: 100%;
          font-size: 0.8rem;
          font-weight: 600;
          line-height: 1.35;
          text-align: center;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .launcher :global(.ct-icon) {
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 10px;
          border: 1px solid;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        @media (min-width: 920px) {
          .compact-row {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
