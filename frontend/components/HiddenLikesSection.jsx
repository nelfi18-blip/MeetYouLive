"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDisplayName, getUserImage } from "@/lib/imageHelpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l2.13 2.08 2.96-.42.53 2.95 2.62 1.46-1.35 2.68 1.35 2.68-2.62 1.46-.53 2.95-2.96-.42L12 22l-2.13-2.08-2.96.42-.53-2.95-2.62-1.46 1.35-2.68-1.35-2.68 2.62-1.46.53-2.95 2.96.42L12 2zm-1.13 13.2l5.64-5.65-1.42-1.41-4.22 4.23-1.96-1.96L7.5 11.82l3.37 3.38z" />
    </svg>
  );
}

function calcAge(birthdate) {
  if (!birthdate) return null;
  const date = new Date(birthdate);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age > 0 ? age : null;
}

function getLocationLabel(user, fallback) {
  return (
    user?.distanceLabel ||
    user?.distance ||
    user?.city ||
    user?.location?.city ||
    user?.country ||
    fallback
  );
}

function hasBio(user) {
  return Boolean(user?.bio && String(user.bio).trim());
}

function getActivityLabel(user, t) {
  if (user?.isLive) return t("hiddenLikes.liveNow");
  if (user?.isOnline) return t("hiddenLikes.activeNow");

  const rawLastActive = user?.lastActiveAt || user?.lastSeenAt || user?.updatedAt;
  if (!rawLastActive) return null;

  const lastActive = new Date(rawLastActive);
  if (Number.isNaN(lastActive.getTime())) return null;

  const daysSinceActiveFloat = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceActiveFloat <= 7 ? t("hiddenLikes.recentlyActive") : null;
}

function showsLockedLikes(filterId) {
  return filterId !== "verified" && filterId !== "bio";
}

function buildFilterLabel(icon, label, count) {
  return `${icon} ${label}${count > 0 ? ` (${count})` : ""}`;
}

/**
 * HiddenLikesSection
 *
 * Shows people who liked the current user, splitting them into revealed
 * (clear avatar + name) and locked (blurred avatar + lock icon) groups.
 * Locked likers can be revealed for UNLOCK_PRICE coins via the API.
 *
 * Props:
 *   compact – if true, renders a smaller layout (used inside the crush page)
 *   onTotalChange – optional callback with the current total likes count
 */
export default function HiddenLikesSection({ compact = false, onTotalChange }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null); // { revealed, locked, lockedCount, unlockPrice }
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const fetchLikes = useCallback(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/api/matches/likes-received`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar los likes");
        return r.json();
      })
      .then((d) => {
        if (d) setData(d);
      })
      .catch(() => setError("No se pudieron cargar los likes"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLikes();
  }, [fetchLikes]);

  useEffect(() => {
    if (!data || typeof onTotalChange !== "function") return;
    onTotalChange((data.revealed?.length ?? 0) + (data.lockedCount ?? 0));
  }, [data, onTotalChange]);

  const handleUnlock = async () => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setUnlocking(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/matches/unlock-likes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || "Error al desbloquear");
      } else {
        // Refresh to show revealed profiles
        fetchLikes();
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setUnlocking(false);
    }
  };

  // Nothing to show while loading or if there's no data at all
  if (loading) return null;
  if (!data) return null;

  const total = (data.revealed?.length ?? 0) + (data.lockedCount ?? 0);
  if (total === 0) return null;

  const unlockPrice = data.unlockPrice ?? 50;
  const hasLocked = (data.lockedCount ?? 0) > 0;
  const revealed = data.revealed ?? [];
  const locked = data.locked ?? [];
  const verifiedCount = revealed.filter(({ user }) => user?.isVerified).length;
  const bioCount = revealed.filter(({ user }) => hasBio(user)).length;
  const visibleRevealed = revealed.filter(({ user }) => {
    if (activeFilter === "verified") return user?.isVerified;
    if (activeFilter === "bio") return hasBio(user);
    return true;
  });
  const visibleLocked = showsLockedLikes(activeFilter) ? locked : [];
  const counterLabel =
    total === 1 ? t("hiddenLikes.counterSingular") : t("hiddenLikes.counterPlural");
  const unlockLikeLabel =
    data.lockedCount === 1 ? t("hiddenLikes.likeSingular") : t("hiddenLikes.likePlural");
  const filters = [
    { id: "near", label: buildFilterLabel("📍", t("hiddenLikes.filterNearby")), disabled: true },
    { id: "verified", label: buildFilterLabel("✓", t("hiddenLikes.filterVerified"), verifiedCount) },
    { id: "bio", label: buildFilterLabel("📝", t("hiddenLikes.filterBio"), bioCount) },
    { id: "new", label: buildFilterLabel("✨", t("hiddenLikes.filterNew")), disabled: true },
  ];

  return (
    <div className={`hls-wrap${compact ? " hls-compact" : ""}`}>
      <div className="hls-header">
        <div>
          <span className="hls-eyebrow">💖 {t("hiddenLikes.eyebrow")}</span>
          <h2 className="hls-title">Likes</h2>
          <p className="hls-subtitle">
            {t("hiddenLikes.subtitle")}
          </p>
        </div>
        <div className="hls-counter-card" aria-label={`${total} personas te dieron like`}>
          <span className="hls-counter-value">{total}</span>
          <span className="hls-counter-label">
            {counterLabel}
          </span>
        </div>
      </div>

      <div className="hls-tabs" role="tablist" aria-label="Categorías de likes">
        <button type="button" role="tab" aria-selected="true" className="hls-tab hls-tab-active">
          <span>{t("hiddenLikes.receivedTab")}</span>
          <strong>{total}</strong>
        </button>
      </div>

      <div className="hls-filters" aria-label="Filtros disponibles">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`hls-filter-chip${activeFilter === filter.id ? " hls-filter-chip-active" : ""}${
              filter.disabled ? " hls-filter-chip-disabled" : ""
            }`}
            onClick={() => {
              if (!filter.disabled) setActiveFilter(filter.id);
            }}
            aria-pressed={activeFilter === filter.id}
            disabled={filter.disabled}
          >
            {filter.label}
            {filter.disabled && <span className="hls-filter-soon">{t("hiddenLikes.soon")}</span>}
          </button>
        ))}
      </div>

      <div className="hls-panel" role="tabpanel">
        <div className="hls-grid">
          {visibleRevealed.map(({ likeId, user, crushType }) => {
            const displayName = getDisplayName(user);
            const image = getUserImage(user);
            const initial = displayName[0]?.toUpperCase() || "?";
            const age = calcAge(user?.birthdate || user?.dateOfBirth || user?.birthday);
            const locationLabel = getLocationLabel(user, t("hiddenLikes.nearYou"));
            const isVerified = Boolean(user?.isVerified);
            const activityLabel = getActivityLabel(user, t);
            return (
              <Link
                key={likeId}
                href={`/profile/${user?._id}`}
                className="hls-card hls-card-revealed"
              >
                <div className="hls-photo-wrap">
                  {image ? (
                    <img
                      src={image}
                      alt={displayName}
                      className="hls-photo-img"
                      loading="lazy"
                    />
                  ) : (
                    <div className="hls-photo-placeholder">{initial}</div>
                  )}
                  {activityLabel && <span className="hls-active-pill">{activityLabel}</span>}
                  {crushType === "super_crush" && (
                    <span className="hls-super-badge" title="Super Crush">
                      ⚡ Super
                    </span>
                  )}
                </div>
                <div className="hls-card-body">
                  <div className="hls-name-row">
                    <span className="hls-name">
                      {displayName}
                      {age ? `, ${age}` : ""}
                    </span>
                    {isVerified && (
                      <span className="hls-verified" title="Verificado">
                        <VerifiedIcon />
                      </span>
                    )}
                  </div>
                  <div className="hls-location">📍 {locationLabel}</div>
                  {hasBio(user) && <p className="hls-bio">{user.bio}</p>}
                </div>
              </Link>
            );
          })}

          {visibleLocked.map(({ likeId, crushType }) => (
            <div key={likeId} className="hls-card hls-card-locked">
              <div className="hls-photo-wrap">
                <div className="hls-photo-blurred" aria-hidden="true" />
                {crushType === "super_crush" && (
                  <span
                    className="hls-super-badge hls-super-badge-locked"
                    title="Super Crush"
                  >
                    ⚡ Super
                  </span>
                )}
                <div className="hls-lock-icon" aria-label="Bloqueado">
                  <LockIcon />
                </div>
                <span className="hls-active-pill">{t("hiddenLikes.hiddenLike")}</span>
              </div>
              <div className="hls-card-body">
                <div className="hls-name-row">
                  <span className="hls-locked-title">{t("hiddenLikes.hiddenProfile")}</span>
                </div>
                <div className="hls-location">{t("hiddenLikes.unlockDetails")}</div>
              </div>
            </div>
          ))}
        </div>
        {visibleRevealed.length === 0 && visibleLocked.length === 0 && (
          <div className="hls-filter-empty">{t("hiddenLikes.emptyFilter")}</div>
        )}
      </div>

      {error && <p className="hls-error">{error}</p>}

      {hasLocked && (
        <div className="hls-cta-wrap">
          <div className="hls-cta-glow" aria-hidden="true" />
          <p className="hls-cta-hint">
            👀 {t("hiddenLikes.unlockHint")}
          </p>
          <div className="hls-cta-buttons">
            <button
              className="hls-unlock-btn"
              onClick={handleUnlock}
              disabled={unlocking}
            >
              {unlocking
                ? t("hiddenLikes.unlocking")
                : `💎 ${t("hiddenLikes.unlock")} ${data.lockedCount} ${unlockLikeLabel} · 🪙${unlockPrice}`}
            </button>
            <Link href="/coins" className="hls-coins-link">
              {t("hiddenLikes.buyCoins")} →
            </Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .hls-wrap {
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
          padding: 1.25rem;
          border-radius: 28px;
          background:
            radial-gradient(circle at top left, rgba(255, 45, 120, 0.2), transparent 34%),
            linear-gradient(145deg, rgba(20, 8, 43, 0.96), rgba(7, 4, 18, 0.94));
          border: 1px solid rgba(255, 255, 255, 0.11);
          box-shadow:
            0 18px 55px rgba(0, 0, 0, 0.36),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          position: relative;
          overflow: hidden;
          animation: hls-fade-in 0.35s ease-out both;
        }
        .hls-wrap::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.06), transparent);
          opacity: 0.45;
          pointer-events: none;
        }
        .hls-compact {
          padding: 1rem;
          gap: 0.75rem;
        }
        @keyframes hls-fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .hls-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          position: relative;
          z-index: 1;
        }
        .hls-eyebrow {
          display: inline-flex;
          color: #ff9ac8;
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-weight: 800;
        }
        .hls-title {
          font-size: clamp(1.65rem, 7vw, 2.35rem);
          line-height: 0.95;
          margin: 0.2rem 0 0.35rem;
          color: #fff;
          letter-spacing: -0.05em;
        }
        .hls-subtitle {
          font-size: 0.82rem;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.58);
          margin: 0;
          max-width: 520px;
        }
        .hls-counter-card {
          min-width: 118px;
          padding: 0.85rem;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          text-align: center;
          box-shadow: 0 12px 35px rgba(255, 45, 120, 0.14);
        }
        .hls-counter-value {
          display: block;
          font-size: 2rem;
          font-weight: 950;
          line-height: 1;
          color: #fff;
        }
        .hls-counter-label {
          display: block;
          margin-top: 0.25rem;
          color: rgba(255, 255, 255, 0.58);
          font-size: 0.68rem;
          font-weight: 750;
        }
        .hls-tabs {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.45rem;
          padding: 0.35rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.09);
        }
        .hls-tab {
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: rgba(255, 255, 255, 0.58);
          cursor: pointer;
          font-weight: 800;
          font-size: 0.74rem;
          padding: 0.62rem 0.65rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          transition:
            transform 0.2s ease,
            background 0.2s ease,
            color 0.2s ease,
            box-shadow 0.2s ease;
        }
        .hls-tab strong {
          min-width: 1.3rem;
          height: 1.3rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: inherit;
          font-size: 0.68rem;
        }
        .hls-tab:hover {
          color: rgba(255, 255, 255, 0.9);
          transform: translateY(-1px);
        }
        .hls-tab-active {
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          color: #fff;
          box-shadow: 0 10px 25px rgba(224, 64, 251, 0.26);
        }
        .hls-filters {
          position: relative;
          z-index: 1;
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding-bottom: 0.15rem;
          scrollbar-width: none;
        }
        .hls-filters::-webkit-scrollbar {
          display: none;
        }
        .hls-filter-chip {
          flex: 0 0 auto;
          padding: 0.5rem 0.75rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.075);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.72);
          font-size: 0.72rem;
          font-weight: 800;
          backdrop-filter: blur(12px);
          cursor: pointer;
          transition:
            transform 0.2s ease,
            color 0.2s ease,
            border-color 0.2s ease,
            background 0.2s ease;
        }
        .hls-filter-chip:hover:not(:disabled),
        .hls-filter-chip-active {
          color: #fff;
          border-color: rgba(255, 45, 120, 0.34);
          background: rgba(255, 45, 120, 0.16);
          transform: translateY(-1px);
        }
        .hls-filter-chip-disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }
        .hls-filter-soon {
          margin-left: 0.35rem;
          padding: 0.1rem 0.34rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.58);
          font-size: 0.58rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .hls-panel {
          position: relative;
          z-index: 1;
          animation: hls-panel-in 0.24s ease-out both;
        }
        @keyframes hls-panel-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .hls-grid { 
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
          gap: 0.85rem;
        }

        .hls-card {
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 238px;
          border-radius: 24px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.075);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 16px 35px rgba(0, 0, 0, 0.28);
          transition:
            transform 0.22s ease,
            border-color 0.22s ease,
            box-shadow 0.22s ease;
        }
        .hls-card-revealed {
          color: inherit;
          text-decoration: none;
        }
        .hls-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 45, 120, 0.34);
          box-shadow: 0 22px 48px rgba(255, 45, 120, 0.14);
        }
        .hls-photo-wrap {
          position: relative;
          height: 162px;
          background: linear-gradient(135deg, rgba(255, 45, 120, 0.18), rgba(224, 64, 251, 0.18));
          flex-shrink: 0;
        }
        .hls-photo-wrap::after {
          content: "";
          position: absolute;
          inset: 38% 0 0;
          background: linear-gradient(180deg, transparent, rgba(8, 4, 20, 0.55) 42%, rgba(8, 4, 20, 0.95));
          pointer-events: none;
        }
        .hls-photo-img,
        .hls-photo-placeholder,
        .hls-photo-blurred {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hls-photo-placeholder {
          background: linear-gradient(
            135deg,
            rgba(255, 45, 120, 0.45),
            rgba(224, 64, 251, 0.38)
          );
          color: #fff;
          font-size: 3.3rem;
          font-weight: 950;
        }
        .hls-photo-blurred {
          background:
            linear-gradient(135deg, rgba(255, 45, 120, 0.55), rgba(224, 64, 251, 0.5)),
            radial-gradient(circle at 35% 22%, rgba(255, 255, 255, 0.45), transparent 16%);
          filter: blur(10px);
          transform: scale(1.05);
        }
        .hls-active-pill {
          position: absolute;
          left: 0.65rem;
          bottom: 0.65rem;
          padding: 0.28rem 0.55rem;
          border-radius: 999px;
          background: rgba(12, 8, 24, 0.74);
          border: 1px solid rgba(74, 222, 128, 0.28);
          color: #bbf7d0;
          font-size: 0.62rem;
          font-weight: 850;
          backdrop-filter: blur(10px);
          z-index: 2;
        }
        .hls-lock-icon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.88);
          filter: drop-shadow(0 0 12px rgba(0, 0, 0, 0.55));
        }
        .hls-super-badge {
          position: absolute;
          top: 0.65rem;
          right: 0.65rem;
          font-size: 0.66rem;
          font-weight: 900;
          color: #fde68a;
          background: rgba(30, 18, 4, 0.72);
          border: 1px solid rgba(251, 191, 36, 0.5);
          border-radius: 999px;
          padding: 0.26rem 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          z-index: 2;
        }
        .hls-super-badge-locked {
          opacity: 0.86;
        }
        .hls-card-body {
          position: relative;
          z-index: 2;
          margin-top: -3.1rem;
          padding: 0.82rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-height: 5.25rem;
          justify-content: flex-end;
        }
        .hls-name-row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .hls-name,
        .hls-locked-title {
          color: rgba(255, 255, 255, 0.94);
          font-size: 0.95rem;
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hls-verified {
          flex: 0 0 auto;
          display: inline-flex;
          color: #60a5fa;
          filter: drop-shadow(0 0 8px rgba(96, 165, 250, 0.45));
        }
        .hls-location {
          color: rgba(255, 255, 255, 0.56);
          font-size: 0.72rem;
          font-weight: 700;
        }
        .hls-bio {
          margin: 0;
          color: rgba(255, 255, 255, 0.44);
          font-size: 0.7rem;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          /* autoprefixer: ignore next -- preserves line clamping in WebKit browsers */
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .hls-filter-empty {
          margin-top: 0.75rem;
          border-radius: 18px;
          padding: 0.9rem;
          text-align: center;
          color: rgba(255, 255, 255, 0.58);
          background: rgba(255, 255, 255, 0.055);
          border: 1px dashed rgba(255, 255, 255, 0.14);
          font-size: 0.82rem;
          font-weight: 700;
        }

        .hls-error {
          position: relative;
          z-index: 1;
          font-size: 0.78rem;
          color: #f87171;
          margin: 0;
          padding: 0.45rem 0.75rem;
          border-radius: 8px;
          background: rgba(248, 113, 113, 0.08);
          border: 1px solid rgba(248, 113, 113, 0.25);
        }

        .hls-cta-wrap {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.55rem;
          padding: 1rem;
          border-radius: 22px;
          background:
            radial-gradient(circle at top, rgba(224, 64, 251, 0.16), transparent 70%),
            rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(224, 64, 251, 0.24);
          text-align: center;
          overflow: hidden;
        }
        .hls-cta-glow {
          position: absolute;
          top: -60%;
          left: 50%;
          transform: translateX(-50%);
          width: 200px;
          height: 200px;
          background: radial-gradient(
            circle,
            rgba(224, 64, 251, 0.15) 0%,
            transparent 70%
          );
          pointer-events: none;
        }
        .hls-cta-hint {
          font-size: 0.78rem;
          color: rgba(255, 255, 255, 0.68);
          margin: 0;
          position: relative;
        }
        .hls-cta-buttons {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: center;
          position: relative;
        }
        .hls-unlock-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          animation: hls-glow 2.5s ease-in-out infinite;
          white-space: nowrap;
        }
        .hls-unlock-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          animation: none;
        }
        @keyframes hls-glow {
          0%,
          100% {
            box-shadow: 0 4px 20px rgba(224, 64, 251, 0.3);
          }
          50% {
            box-shadow:
              0 4px 35px rgba(224, 64, 251, 0.6),
              0 0 20px rgba(255, 45, 120, 0.35);
          }
        }
        .hls-unlock-btn:hover:not(:disabled) {
          filter: brightness(1.12);
          transform: translateY(-1px);
        }
        .hls-coins-link {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
          text-decoration: none;
          white-space: nowrap;
        }
        .hls-coins-link:hover {
          color: rgba(255, 255, 255, 0.65);
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .hls-wrap {
            border-radius: 24px;
            padding: 1rem;
          }
          .hls-header {
            align-items: stretch;
            flex-direction: column;
          }
          .hls-counter-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            text-align: left;
          }
          .hls-tabs {
            border-radius: 20px;
            grid-template-columns: 1fr;
          }
          .hls-tab {
            justify-content: space-between;
          }
          .hls-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.7rem;
          }
          .hls-photo-wrap {
            height: 148px;
          }
          .hls-card {
            min-height: 224px;
            border-radius: 20px;
          }
          .hls-card-body {
            padding: 0.72rem;
            margin-top: -3rem;
          }
          .hls-cta-buttons {
            width: 100%;
            flex-direction: column;
          }
          .hls-unlock-btn {
            width: 100%;
            justify-content: center;
          }
        }

        @media (max-width: 380px) {
          .hls-grid {
            grid-template-columns: 1fr;
          }
          .hls-photo-wrap {
            height: 190px;
          }
        }
      `}</style>
    </div>
  );
}
