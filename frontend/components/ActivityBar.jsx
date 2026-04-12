"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
    { icon: "🔥", value: online, label: "conectadas ahora" },
    { icon: "💖", value: likes,  label: "likes hoy" },
    { icon: "🎥", value: lives,  label: "directos activos" },
    { icon: "🚀", value: boosts, label: "usando Boost" },
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
          font-size: 0.95rem;
          line-height: 1;
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
