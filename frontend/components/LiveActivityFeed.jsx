"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDisplayName } from "@/lib/imageHelpers";

// Do not invent recency, a pending end, or a crowd from a random template.
const LIVE_TEMPLATE = { icon: "🎤", key: "liveNow" };
const MAX_FEED = 6;

function liveToEvent(live, t) {
  const username = getDisplayName(live.user).toLowerCase() === "usuario" ? t("liveActivityFeed.someone") : getDisplayName(live.user);
  return {
    icon: LIVE_TEMPLATE.icon,
    message: t("liveActivityFeed.liveNow").replace("{username}", `@${username}`),
    href: `/live/${live._id}`,
    liveId: String(live._id),
    id: `live_${live._id}`,
  };
}

/**
 * LiveActivityFeed — real-time activity ticker for the live page.
 *
 * Only ever renders events for lives currently present in the `lives` prop.
 * There is no simulated/fake activity: when there are no real lives, or a
 * live ends and disappears from `lives`, the ticker (and its events) hide.
 *
 * Props:
 *   lives      — current live sessions (array)
 *   newLiveIds — IDs of lives detected since last poll (triggers "just started" events)
 */
export default function LiveActivityFeed({ lives = [], newLiveIds = [] }) {
  const { t } = useLanguage();
  const [events, setEvents] = useState([]);

  // Keep events in sync with the real set of active lives: drop events whose
  // live is no longer active, and seed from real lives when there are none yet.
  useEffect(() => {
    setEvents((prev) => {
      const liveIds = new Set(lives.map((live) => String(live._id)));
      const kept = prev.filter((ev) => liveIds.has(ev.liveId));
      if (kept.length > 0) return kept.slice(0, MAX_FEED);
      if (lives.length === 0) return [];
      return lives.slice(0, Math.min(lives.length, 4)).map((live) => liveToEvent(live, t));
    });
  }, [lives, t]);

  // Newly discovered live IDs are not necessarily newly started streams.
  const prevNewIdsRef = useRef([]);
  useEffect(() => {
    const added = newLiveIds.filter((id) => !prevNewIdsRef.current.includes(id));
    prevNewIdsRef.current = newLiveIds;
    if (added.length === 0) return;
    const newEvents = lives
      .filter((live) => added.includes(String(live._id)))
      .map((live) => liveToEvent(live, t));
    if (newEvents.length > 0) {
      const newLiveIdSet = new Set(newEvents.map((ev) => ev.liveId));
      setEvents((prev) => [...newEvents, ...prev.filter((ev) => !newLiveIdSet.has(ev.liveId))].slice(0, MAX_FEED));
    }
  }, [newLiveIds, lives, t]);

  if (lives.length === 0 || events.length === 0) return null;

  return (
    <div className="laf-wrap">
      <div className="laf-label">
        <span className="laf-dot" />
        {t("liveActivityFeed.liveActivity")}
      </div>

      <div className="laf-list">
        {events.map((ev) => {
          const inner = (
            <span className="laf-item">
              <span className="laf-icon">{ev.icon}</span>
              <span className="laf-msg">{ev.message}</span>
              <span className="laf-cta">{t("liveActivityFeed.enter")} →</span>
            </span>
          );
          return (
            <Link
              key={ev.id}
              href={ev.href || "/live"}
              className={`laf-row laf-row-link${ev.exiting ? " laf-row-exiting" : ""}`}
            >
              {inner}
            </Link>
          );
        })}
      </div>

      <style jsx>{`
        .laf-wrap {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .laf-label {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.4);
        }

        .laf-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #ef4444;
          flex-shrink: 0;
          animation: lafDotPulse 1.4s infinite;
        }

        @keyframes lafDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.3; transform: scale(0.75); }
        }

        .laf-list {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .laf-row {
          border-radius: 10px;
          background: rgba(15, 8, 32, 0.7);
          border: 1px solid rgba(139, 92, 246, 0.14);
          animation: lafItemIn 0.35s ease both;
          overflow: hidden;
        }

        @keyframes lafItemIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes lafItemOut {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(6px); }
        }

        .laf-row-exiting {
          animation: lafItemOut 280ms ease forwards;
          pointer-events: none;
        }

        .laf-row-link {
          display: block;
          text-decoration: none;
          cursor: pointer;
          transition: border-color 0.18s, background 0.18s;
        }

        .laf-row-link:hover {
          border-color: rgba(224, 64, 251, 0.38);
          background: rgba(224, 64, 251, 0.06);
        }

        .laf-item {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.5rem 0.8rem;
        }

        .laf-icon {
          font-size: 0.88rem;
          flex-shrink: 0;
          line-height: 1;
        }

        .laf-msg {
          font-size: 0.8rem;
          color: var(--text-muted);
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .laf-cta {
          font-size: 0.72rem;
          font-weight: 700;
          color: #e040fb;
          flex-shrink: 0;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
