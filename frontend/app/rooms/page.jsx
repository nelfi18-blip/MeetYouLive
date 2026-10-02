"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ROOM_CATEGORY_META, ROOM_CATEGORY_ORDER, getRoomDisplayText } from "@/lib/roomCategories";
import { useLanguage } from "@/contexts/LanguageContext";
import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import NeonBadge from "@/components/ui/NeonBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const cardMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" },
};

// Fully static variant used when the user prefers reduced motion —
// cards render already in their final state, no fade/translate animation.
const cardMotionReduced = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0 },
};

export default function RoomsPage() {
  const { t } = useLanguage();
  const prefersReducedMotion = useReducedMotion();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/rooms`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => setRooms(Array.isArray(data) ? data : []))
      .catch(() => setError(t("rooms.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  // Group rooms by category, preserving category order
  const grouped = {};
  for (const cat of ROOM_CATEGORY_ORDER) grouped[cat] = [];
  for (const room of rooms) {
    if (grouped[room.category]) grouped[room.category].push(room);
  }

  return (
    <div className="rooms-page">
      {/* Hero */}
      <div className="rooms-hero">
        <div className="rooms-hero-glow" />
        <div className="rooms-hero-glow rooms-hero-glow-2" />
        <div className="rooms-hero-inner">
          <PremiumSectionHeader
            eyebrow={`💬 ${t("rooms.heroBadge")}`}
            title={t("rooms.title")}
            subtitle={t("rooms.subtitle")}
          />
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {/* Category sections */}
      {ROOM_CATEGORY_ORDER.map((cat) => {
        const meta = ROOM_CATEGORY_META[cat];
        const catRooms = grouped[cat];
        return (
          <section key={cat} className="cat-section">
            <div className="cat-header">
              <span className="cat-emoji" style={{ "--cat-glow": meta.glow }}>{meta.emoji}</span>
              <div className="cat-header-copy">
                <div className="cat-title-row">
                  <h2 className="cat-title">{t(meta.labelKey)}</h2>
                  <NeonBadge tone={meta.badgeTone}>{t("rooms.active")}</NeonBadge>
                </div>
                <p className="cat-desc">{t(meta.descKey)}</p>
              </div>
            </div>

            <div className="rooms-grid">
              {loading
                ? [1, 2].map((i) => <div key={i} className="skeleton room-card-skeleton" />)
                : catRooms.length === 0
                  ? <p className="no-rooms">{t("rooms.emptyCategory")}</p>
                  : catRooms.map((room, idx) => {
                      const { title, description } = getRoomDisplayText(room, t);
                      const motionVariant = prefersReducedMotion ? cardMotionReduced : cardMotion;
                      return (
                        <motion.div
                          key={room._id}
                          initial={motionVariant.initial}
                          animate={motionVariant.animate}
                          transition={
                            prefersReducedMotion
                              ? motionVariant.transition
                              : { ...motionVariant.transition, delay: Math.min(idx, 4) * 0.04 }
                          }
                        >
                          <Link href={`/rooms/${room._id}`} className="room-card-link">
                            <FuturisticCard accent={meta.accent} className="room-card">
                              <div className="room-card-top">
                                <span className="room-emoji">{meta.emoji}</span>
                                <div className="room-active-badge">
                                  <span className="room-dot" />
                                  {t("rooms.active")}
                                </div>
                              </div>
                              <h3 className="room-title">{title}</h3>
                              <p className="room-desc">{description}</p>
                              <div className="room-footer">
                                {room.host && (
                                  <span className="room-host">
                                    👑 {room.host.username || room.host.name}
                                  </span>
                                )}
                                <span className="room-msgs">
                                  💬 {t("rooms.messagesCount").replace("{count}", String(room.messageCount || 0))}
                                </span>
                                <span className="room-enter" style={{ color: meta.color }}>{t("rooms.enter")}</span>
                              </div>
                            </FuturisticCard>
                          </Link>
                        </motion.div>
                      );
                    })}
            </div>
          </section>
        );
      })}

      <style jsx>{`
        .rooms-page { display: flex; flex-direction: column; gap: 2.5rem; }

        /* Hero */
        .rooms-hero {
          position: relative;
          padding: 2rem 1.5rem;
          border-radius: var(--radius);
          border: 1px solid rgba(244,114,182,0.22);
          background: linear-gradient(135deg, rgba(30,8,55,0.95) 0%, rgba(14,4,32,0.98) 100%);
          overflow: hidden;
        }
        .rooms-hero-glow {
          position: absolute; top: -60px; right: -40px;
          width: 280px; height: 280px; border-radius: 50%;
          background: radial-gradient(circle, rgba(244,114,182,0.18) 0%, transparent 65%);
          pointer-events: none;
        }
        .rooms-hero-glow-2 {
          top: auto; right: auto; bottom: -70px; left: -50px;
          width: 220px; height: 220px;
          background: radial-gradient(circle, rgba(129,140,248,0.14) 0%, transparent 65%);
        }
        .rooms-hero-inner { position: relative; z-index: 1; }

        /* Category sections */
        .cat-section { display: flex; flex-direction: column; gap: 1rem; }
        .cat-header { display: flex; align-items: flex-start; gap: 0.85rem; }
        .cat-emoji {
          font-size: 2rem; line-height: 1; flex-shrink: 0;
          filter: drop-shadow(0 0 10px var(--cat-glow, transparent));
        }
        .cat-header-copy { min-width: 0; flex: 1; }
        .cat-title-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .cat-title { font-size: 1.1rem; font-weight: 800; color: var(--text); margin: 0; }
        .cat-desc  { font-size: 0.8rem; color: var(--text-muted); margin: 0.1rem 0 0; }

        /* Grid */
        .rooms-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        @media (min-width: 600px) { .rooms-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 960px) { .rooms-grid { grid-template-columns: repeat(3, 1fr); } }

        /* Room card */
        .room-card-link { text-decoration: none; color: inherit; display: block; }
        :global(.room-card) {
          display: flex; flex-direction: column; gap: 0.6rem;
          padding: 1.25rem;
          cursor: pointer;
        }
        .room-card-top { display: flex; align-items: center; justify-content: space-between; }
        .room-emoji { font-size: 1.6rem; }
        .room-active-badge {
          display: inline-flex; align-items: center; gap: 0.35rem;
          font-size: 0.62rem; font-weight: 800; letter-spacing: 0.06em;
          color: var(--accent-green);
          background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.25);
          border-radius: 999px; padding: 0.15rem 0.6rem;
        }
        .room-dot {
          display: inline-block; width: 5px; height: 5px; border-radius: 50%;
          background: var(--accent-green); animation: dotPulse 1.4s infinite;
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        .room-title { font-size: 0.95rem; font-weight: 800; color: var(--text); margin: 0; }
        .room-desc  { font-size: 0.8rem; color: var(--text-muted); margin: 0; flex: 1; }
        .room-footer { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem; }
        .room-host  { font-size: 0.75rem; color: #fbbf24; font-weight: 600; }
        .room-msgs  { font-size: 0.75rem; color: var(--text-dim); }
        .room-enter { font-size: 0.75rem; font-weight: 700; margin-left: auto; }

        /* Skeleton */
        .room-card-skeleton { height: 160px; border-radius: var(--radius-sm); }

        /* Error / no rooms */
        .banner-error {
          background: var(--error-bg); border: 1px solid rgba(248,113,113,0.35);
          color: var(--error); border-radius: var(--radius-sm); padding: 0.75rem 1rem;
          font-size: 0.875rem; font-weight: 500;
        }
        .no-rooms { font-size: 0.85rem; color: var(--text-dim); margin: 0; }

        @media (prefers-reduced-motion: reduce) {
          :global(.room-card) { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
