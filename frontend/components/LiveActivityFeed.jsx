"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const FAKE_NAMES = [
  "Luna", "Sofía", "Valeria", "Isabella", "Camila", "Daniela", "Alejandra",
  "Fernanda", "Carolina", "Natalia", "Andrés", "Carlos", "Miguel", "Javier",
  "Diego", "Luis", "Pablo", "Sebastián", "David", "Marcos",
];

const REAL_TEMPLATES = [
  { icon: "🎤", tpl: (u) => `${u} está en vivo ahora` },
  { icon: "👀", tpl: (u) => `${u} transmitiendo en directo` },
  { icon: "🚀", tpl: (u) => `${u} comenzó a transmitir` },
];

const NEW_TEMPLATE = { icon: "🔥", tpl: (u) => `${u} acaba de iniciar un live` };

const FAKE_TEMPLATES = [
  { icon: "🔥", tpl: (u) => `${u} acaba de iniciar un live` },
  { icon: "🎤", tpl: (u) => `${u} está en vivo ahora` },
  { icon: "👀", tpl: (u) => `${u} se unió a un directo` },
  { icon: "🚀", tpl: (u) => `${u} está transmitiendo` },
];

const MAX_FEED = 6;
const ROTATE_INTERVAL_MS = 10000;

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateFakeEvent() {
  const name = randomItem(FAKE_NAMES);
  const tmpl = randomItem(FAKE_TEMPLATES);
  return {
    icon: tmpl.icon,
    message: tmpl.tpl(`@${name}`),
    href: null,
    id: `fake_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  };
}

function liveToEvent(live, isNew = false) {
  const username = live.user?.username || live.user?.name || "alguien";
  const tmpl = isNew ? NEW_TEMPLATE : randomItem(REAL_TEMPLATES);
  return {
    icon: tmpl.icon,
    message: tmpl.tpl(`@${username}`),
    href: `/live/${live._id}`,
    id: `live_${live._id}_${isNew ? "new" : tmpl.icon}`,
  };
}

/**
 * LiveActivityFeed — real-time activity ticker for the live page.
 *
 * Props:
 *   lives      — current live sessions (array)
 *   newLiveIds — IDs of lives detected since last poll (triggers "just started" events)
 */
export default function LiveActivityFeed({ lives = [], newLiveIds = [] }) {
  const [events, setEvents] = useState([]);
  const livesRef = useRef(lives);

  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  // Seed initial events from real lives on mount
  useEffect(() => {
    if (lives.length > 0) {
      const initial = lives.slice(0, Math.min(lives.length, 4)).map((l) => liveToEvent(l, false));
      setEvents(initial);
    } else {
      // Growth mode: seed with simulated events
      setEvents([generateFakeEvent(), generateFakeEvent(), generateFakeEvent()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When new lives arrive via polling, prepend "just started" events
  const prevNewIdsRef = useRef([]);
  useEffect(() => {
    const added = newLiveIds.filter((id) => !prevNewIdsRef.current.includes(id));
    prevNewIdsRef.current = newLiveIds;
    if (added.length === 0) return;
    const newEvents = lives
      .filter((l) => added.includes(String(l._id)))
      .map((l) => liveToEvent(l, true));
    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, MAX_FEED));
    }
  }, [newLiveIds, lives]);

  // Periodically rotate in a new event to keep the feed feeling alive
  useEffect(() => {
    const timer = setInterval(() => {
      const currentLives = livesRef.current;
      setEvents((prev) => {
        let ev;
        if (currentLives.length > 0) {
          const live = randomItem(currentLives);
          ev = liveToEvent(live, false);
          // Avoid repeating the exact same event at the top
          if (prev[0]?.id === ev.id) {
            ev = currentLives.length > 1
              ? liveToEvent(currentLives.find((l) => l._id !== live._id) || live, false)
              : generateFakeEvent();
          }
        } else {
          ev = generateFakeEvent();
        }
        return [ev, ...prev.filter((e) => e.id !== ev.id)].slice(0, MAX_FEED);
      });
    }, ROTATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="laf-wrap">
      <div className="laf-label">
        <span className="laf-dot" />
        ACTIVIDAD EN TIEMPO REAL
      </div>

      <div className="laf-list">
        {events.map((ev) => {
          const inner = (
            <span className="laf-item">
              <span className="laf-icon">{ev.icon}</span>
              <span className="laf-msg">{ev.message}</span>
              {ev.href && <span className="laf-cta">Unirse →</span>}
            </span>
          );
          return ev.href ? (
            <Link key={ev.id} href={ev.href} className="laf-row laf-row-link">
              {inner}
            </Link>
          ) : (
            <div key={ev.id} className="laf-row">
              {inner}
            </div>
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
