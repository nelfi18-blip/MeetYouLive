"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function HeartPulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m19.5 13.57-7 7a.69.69 0 0 1-1 0l-7-7a5 5 0 1 1 7-7l.5.5.5-.5a5 5 0 1 1 7 7Z" />
      <path d="M3.5 12h3l2 3 3-6 2 3h4" />
    </svg>
  );
}

function LiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="15" height="12" rx="2" />
      <path d="m22 8-5 4 5 4V8Z" />
      <circle cx="7" cy="12" r="1.5" />
    </svg>
  );
}

function BoostIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3 4 14h6l-1 7 10-11h-6l1-7Z" />
    </svg>
  );
}

// Minimum plausible floor values shown while real data loads or as fallback
const FLOOR = { onlineCount: 12, activeLivesCount: 2, likesToday: 47, boostActiveCount: 3 };

// How long to cache the stats response (ms)
const CACHE_TTL_MS = 60_000;
let _cache = null;
let _cacheTs = 0;

async function fetchActivity() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;
  try {
    const res = await fetch(`${API_URL}/api/stats/activity`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    _cache = data;
    _cacheTs = now;
    return data;
  } catch {
    return null;
  }
}

/**
 * ActivityBar — horizontal strip of 4 real-time social proof signals.
 * Props:
 *   variant: "strip" (default) | "pills"  — layout style
 */
export default function ActivityBar({ variant = "strip" }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchActivity().then((data) => {
      if (data) setStats(data);
    });
  }, []);

  const online = Math.max(stats?.onlineCount ?? 0, FLOOR.onlineCount);
  const lives  = Math.max(stats?.activeLivesCount ?? 0, FLOOR.activeLivesCount);
  const likes  = Math.max(stats?.likesToday ?? 0, FLOOR.likesToday);
  const boosts = Math.max(stats?.boostActiveCount ?? 0, FLOOR.boostActiveCount);

  const items = [
    { icon: <UsersIcon />, value: online, label: "conectadas ahora" },
    { icon: <HeartPulseIcon />, value: likes,  label: "likes hoy" },
    { icon: <LiveIcon />, value: lives,  label: "directos activos" },
    { icon: <BoostIcon />, value: boosts, label: "usando Boost" },
  ];

  return (
    <div className={`ab-wrap ab-${variant}`} role="status" aria-label="Actividad en tiempo real">
      {items.map((item) => (
        <div key={item.label} className="ab-item">
          <span className="ab-icon">{item.icon}</span>
          <span className="ab-value">{item.value.toLocaleString()}</span>
          <span className="ab-label">{item.label}</span>
        </div>
      ))}

      <style jsx>{`
        .ab-wrap {
          display: flex;
          align-items: center;
          gap: 0;
          overflow: hidden;
        }

        /* ── strip variant (default) ── */
        .ab-strip {
          background: linear-gradient(135deg, rgba(15,8,32,0.92) 0%, rgba(25,12,48,0.92) 100%);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: 12px;
          padding: 0.55rem 0.5rem;
          gap: 0;
        }

        .ab-strip .ab-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.1rem;
          padding: 0.3rem 0.5rem;
          border-right: 1px solid rgba(139,92,246,0.12);
        }

        .ab-strip .ab-item:last-child {
          border-right: none;
        }

        /* ── pills variant ── */
        .ab-pills {
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .ab-pills .ab-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: 999px;
          padding: 0.3rem 0.75rem;
        }

        .ab-icon {
          width: 18px;
          height: 18px;
          line-height: 1;
          color: #c4b5fd;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ab-icon :global(svg) {
          width: 18px;
          height: 18px;
        }

        .ab-value {
          font-size: 0.82rem;
          font-weight: 800;
          color: #e0aaff;
          letter-spacing: -0.01em;
        }

        .ab-label {
          font-size: 0.68rem;
          color: rgba(255,255,255,0.45);
          white-space: nowrap;
        }

        /* strip: label below value */
        .ab-strip .ab-label {
          display: block;
        }

        /* pills: label inline */
        .ab-pills .ab-label {
          display: inline;
        }

        @media (max-width: 380px) {
          .ab-strip .ab-label { display: none; }
          .ab-strip .ab-value { font-size: 0.75rem; }
        }
      `}</style>
    </div>
  );
}
