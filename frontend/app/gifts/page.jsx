"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const RARITY_STYLES = {
  common:    { color: "#94a3b8", glow: "rgba(148,163,184,0.35)",  label: "Común"      },
  uncommon:  { color: "#4ade80", glow: "rgba(74,222,128,0.35)",   label: "Poco común" },
  rare:      { color: "#60a5fa", glow: "rgba(96,165,250,0.4)",    label: "Raro"       },
  epic:      { color: "#c084fc", glow: "rgba(192,132,252,0.45)",  label: "Épico"      },
  legendary: { color: "#fbbf24", glow: "rgba(251,191,36,0.45)",   label: "Legendario" },
  mythic:    { color: "#f43f5e", glow: "rgba(244,63,94,0.5)",     label: "Mítico"     },
};

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function GiftsPage() {
  const router = useRouter();
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalEarned, setTotalEarned] = useState(0);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/gifts/received`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!r.ok) throw new Error("Error al cargar los regalos");
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setGifts(data);
        const total = data.reduce((sum, g) => sum + (g.creatorShare || 0), 0);
        setTotalEarned(total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  const rarityStyle = (rarity) => RARITY_STYLES[rarity] || RARITY_STYLES.common;

  return (
    <div className="gifts-page">
      <div className="gifts-header">
        <Link href="/creator" className="back-link">← Panel creator</Link>
        <h1 className="gifts-title">🎁 Mis regalos</h1>
        <p className="gifts-sub">Regalos recibidos de tus fans</p>
      </div>

      {totalEarned > 0 && (
        <div className="earnings-banner">
          <span className="earnings-icon">🪙</span>
          <div>
            <div className="earnings-label">Monedas ganadas</div>
            <div className="earnings-amount">{totalEarned} 🪙</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="gifts-loading">
          <div className="spinner" />
          <span>Cargando regalos…</span>
        </div>
      )}

      {error && (
        <div className="gifts-error">{error}</div>
      )}

      {!loading && !error && gifts.length === 0 && (
        <div className="gifts-empty">
          <span className="gifts-empty-icon">🎁</span>
          <p>Aún no has recibido regalos.</p>
          <p className="gifts-empty-hint">¡Comparte tu perfil para que tus fans te regalen!</p>
          <Link href="/explore" className="btn btn-primary">Explorar</Link>
        </div>
      )}

      {!loading && gifts.length > 0 && (
        <div className="gifts-list">
          {gifts.map((g) => {
            const item = g.giftCatalogItem;
            const rarity = item?.rarity || "common";
            const rs = rarityStyle(rarity);
            const senderName = g.sender?.username || g.sender?.name || "Anónimo";

            return (
              <div
                key={g._id}
                className="gift-row"
                style={{ "--rarity-color": rs.color, "--rarity-glow": rs.glow }}
              >
                <div className="gift-row-icon">{item?.icon || "🎁"}</div>
                <div className="gift-row-info">
                  <div className="gift-row-name">
                    {item?.name || "Regalo"}
                    <span className="gift-row-rarity" style={{ color: rs.color }}>
                      {rs.label}
                    </span>
                  </div>
                  <div className="gift-row-meta">
                    <span>de @{senderName}</span>
                    {g.context && g.context !== "profile" && (
                      <span className="gift-row-context">
                        · {g.context === "live" ? "🔴 En vivo" : "📞 Llamada"}
                      </span>
                    )}
                    <span className="gift-row-date">· {formatDate(g.createdAt)}</span>
                  </div>
                  {g.message && <div className="gift-row-msg">"{g.message}"</div>}
                </div>
                <div className="gift-row-coins">
                  <span className="gift-row-cost">🪙 {g.coinCost}</span>
                  <span className="gift-row-earned">+{g.creatorShare} tuyo</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .gifts-page {
          max-width: 640px;
          margin: 0 auto;
          padding: 2rem 1rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .gifts-header {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .back-link {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color 0.2s;
          align-self: flex-start;
          margin-bottom: 0.25rem;
        }
        .back-link:hover { color: var(--text); }

        .gifts-title {
          font-size: 1.7rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
          background: var(--grad-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .gifts-sub {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: 0;
        }

        .earnings-banner {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: var(--radius);
          padding: 1rem 1.25rem;
          box-shadow: 0 0 20px rgba(251,191,36,0.08);
        }

        .earnings-icon {
          font-size: 2rem;
          line-height: 1;
        }

        .earnings-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .earnings-amount {
          font-size: 1.4rem;
          font-weight: 800;
          color: #fbbf24;
        }

        .gifts-loading {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-muted);
          font-size: 0.9rem;
          padding: 2rem 0;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.1);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .gifts-error {
          padding: 0.9rem 1rem;
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.2);
          border-radius: var(--radius-sm);
          color: #f87171;
          font-size: 0.875rem;
        }

        .gifts-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          padding: 3rem 1rem;
          text-align: center;
        }

        .gifts-empty-icon {
          font-size: 3.5rem;
          line-height: 1;
          opacity: 0.7;
        }

        .gifts-empty p {
          color: var(--text);
          margin: 0;
          font-weight: 600;
        }

        .gifts-empty-hint {
          color: var(--text-muted) !important;
          font-weight: 400 !important;
          font-size: 0.85rem;
        }

        .gifts-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .gift-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: rgba(15, 8, 32, 0.6);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: var(--radius);
          padding: 0.9rem 1rem;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .gift-row:hover {
          border-color: var(--rarity-color);
          box-shadow: 0 0 14px var(--rarity-glow);
        }

        .gift-row-icon {
          font-size: 2rem;
          line-height: 1;
          flex-shrink: 0;
          width: 2.5rem;
          text-align: center;
        }

        .gift-row-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .gift-row-name {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .gift-row-rarity {
          font-size: 0.68rem;
          font-weight: 600;
          opacity: 0.85;
        }

        .gift-row-meta {
          font-size: 0.75rem;
          color: var(--text-muted);
          display: flex;
          gap: 0.35rem;
          flex-wrap: wrap;
        }

        .gift-row-context {
          color: var(--text-dim);
        }

        .gift-row-date {
          color: var(--text-dim);
        }

        .gift-row-msg {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-style: italic;
          margin-top: 0.1rem;
        }

        .gift-row-coins {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.15rem;
          flex-shrink: 0;
        }

        .gift-row-cost {
          font-size: 0.85rem;
          font-weight: 700;
          color: #fbbf24;
        }

        .gift-row-earned {
          font-size: 0.68rem;
          color: #4ade80;
          font-weight: 600;
        }

        @media (max-width: 480px) {
          .gifts-page { padding: 1.5rem 0.75rem 5rem; }
          .gift-row { padding: 0.75rem; }
          .gift-row-icon { font-size: 1.6rem; width: 2rem; }
        }
      `}</style>
    </div>
  );
}
