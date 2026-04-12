"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ROOM_CATEGORY_META, ROOM_CATEGORY_ORDER } from "@/lib/roomCategories";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/rooms`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => setRooms(Array.isArray(data) ? data : []))
      .catch(() => setError("No se pudieron cargar las salas"))
      .finally(() => setLoading(false));
  }, []);

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
        <div className="rooms-hero-inner">
          <div className="rooms-hero-badge">💬 SALAS SOCIALES</div>
          <h1 className="rooms-hero-title">Salas de Confianza</h1>
          <p className="rooms-hero-sub">
            Un espacio seguro para mejorar tu confianza, practicar conversaciones y conectar.
          </p>
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
              <span className="cat-emoji">{meta.emoji}</span>
              <div>
                <h2 className="cat-title">{meta.label}</h2>
                <p className="cat-desc">{meta.desc}</p>
              </div>
            </div>

            <div className="rooms-grid">
              {loading
                ? [1, 2].map((i) => <div key={i} className="skeleton room-card-skeleton" />)
                : catRooms.length === 0
                  ? <p className="no-rooms">No hay salas en esta categoría aún.</p>
                  : catRooms.map((room) => (
                      <Link key={room._id} href={`/rooms/${room._id}`} className="room-card" style={{ "--cat-color": meta.color, "--cat-glow": meta.glow }}>
                        <div className="room-card-top">
                          <span className="room-emoji">{meta.emoji}</span>
                          <div className="room-active-badge">
                            <span className="room-dot" />
                            Activa
                          </div>
                        </div>
                        <h3 className="room-title">{room.title}</h3>
                        <p className="room-desc">{room.description}</p>
                        <div className="room-footer">
                          {room.host && (
                            <span className="room-host">
                              👑 {room.host.username || room.host.name}
                            </span>
                          )}
                          <span className="room-msgs">
                            💬 {room.messageCount || 0} mensajes
                          </span>
                          <span className="room-enter">Entrar →</span>
                        </div>
                      </Link>
                    ))}
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
        .rooms-hero-inner { position: relative; z-index: 1; }
        .rooms-hero-badge {
          display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 0.65rem; font-weight: 900; letter-spacing: 0.1em;
          color: #f472b6;
          background: rgba(244,114,182,0.12); border: 1px solid rgba(244,114,182,0.3);
          border-radius: 999px; padding: 0.2rem 0.7rem; margin-bottom: 0.6rem;
        }
        .rooms-hero-title {
          font-size: 1.7rem; font-weight: 900; margin: 0 0 0.4rem;
          background: linear-gradient(135deg, #fff 30%, #f472b6 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .rooms-hero-sub { font-size: 0.9rem; color: var(--text-muted); margin: 0; }

        /* Category sections */
        .cat-section { display: flex; flex-direction: column; gap: 1rem; }
        .cat-header { display: flex; align-items: flex-start; gap: 0.85rem; }
        .cat-emoji { font-size: 2rem; line-height: 1; }
        .cat-title { font-size: 1.1rem; font-weight: 800; color: var(--text); margin: 0 0 0.1rem; }
        .cat-desc  { font-size: 0.8rem; color: var(--text-muted); margin: 0; }

        /* Grid */
        .rooms-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        @media (min-width: 600px) { .rooms-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 960px) { .rooms-grid { grid-template-columns: repeat(3, 1fr); } }

        /* Room card */
        .room-card {
          display: flex; flex-direction: column; gap: 0.6rem;
          padding: 1.25rem; border-radius: var(--radius-sm);
          border: 1px solid rgba(255,255,255,0.07);
          background: var(--card);
          text-decoration: none; color: inherit;
          transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
          cursor: pointer;
        }
        .room-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 0 24px var(--cat-glow, rgba(244,114,182,0.2));
          border-color: var(--cat-color, #f472b6);
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
        .room-enter { font-size: 0.75rem; font-weight: 700; color: var(--cat-color, #f472b6); margin-left: auto; }

        /* Skeleton */
        .room-card-skeleton { height: 160px; border-radius: var(--radius-sm); }

        /* Error / no rooms */
        .banner-error {
          background: var(--error-bg); border: 1px solid rgba(248,113,113,0.35);
          color: var(--error); border-radius: var(--radius-sm); padding: 0.75rem 1rem;
          font-size: 0.875rem; font-weight: 500;
        }
        .no-rooms { font-size: 0.85rem; color: var(--text-dim); margin: 0; }
      `}</style>
    </div>
  );
}
