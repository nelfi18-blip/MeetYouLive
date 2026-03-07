"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const GIFT_CATALOG = [
  { id: "rose", name: "Rosa", emoji: "🌹", coinCost: 10 },
  { id: "heart", name: "Corazón", emoji: "❤️", coinCost: 20 },
  { id: "star", name: "Estrella", emoji: "⭐", coinCost: 50 },
  { id: "crown", name: "Corona", emoji: "👑", coinCost: 100 },
  { id: "diamond", name: "Diamante", emoji: "💎", coinCost: 200 },
  { id: "rocket", name: "Cohete", emoji: "🚀", coinCost: 500 },
];

export default function GiftsPage() {
  const router = useRouter();
  const [coins, setCoins] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCoins(d.coins ?? 0))
      .catch(() => setError("No se pudo cargar tu saldo"))
      .finally(() => setLoading(false));
  }, [router]);

  const sendGift = async (gift) => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }

    setSending(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/api/gifts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ giftId: gift.id, coinCost: gift.coinCost }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al enviar el regalo");
        return;
      }
      setCoins((prev) => (prev !== null ? prev - gift.coinCost : prev));
      setMessage(`¡${gift.emoji} ${gift.name} enviado con éxito!`);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="gifts-page">
      <div className="gifts-header">
        <h1 className="gifts-title">🎁 Regalos</h1>
        <p className="gifts-sub">Envía regalos virtuales a tus streamers favoritos</p>
        {coins !== null && (
          <div className="coins-balance">
            💰 Saldo: <strong>{coins} monedas</strong>
          </div>
        )}
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="gifts-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      ) : (
        <div className="gifts-grid">
          {GIFT_CATALOG.map((gift) => (
            <div key={gift.id} className="gift-card card">
              <div className="gift-emoji">{gift.emoji}</div>
              <div className="gift-name">{gift.name}</div>
              <div className="gift-cost">💰 {gift.coinCost} monedas</div>
              <button
                className="btn btn-primary btn-block"
                onClick={() => sendGift(gift)}
                disabled={sending || coins === null || coins < gift.coinCost}
              >
                {sending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="back-link">
        <Link href="/coins">💰 Comprar más monedas</Link>
        {" · "}
        <Link href="/dashboard">← Dashboard</Link>
      </p>

      <style jsx>{`
        .gifts-page {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .gifts-header { text-align: center; }

        .gifts-title {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
        }

        .gifts-sub {
          color: var(--text-muted);
          margin-top: 0.5rem;
        }

        .coins-balance {
          margin-top: 0.75rem;
          font-size: 1rem;
          color: var(--text-muted);
        }

        .success-banner {
          background: rgba(76, 175, 80, 0.1);
          border: 1px solid #4caf50;
          color: #4caf50;
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          text-align: center;
        }

        .error-banner {
          background: rgba(244, 67, 54, 0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        .gifts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 1rem;
        }

        .gift-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          padding: 1.5rem 1rem;
          text-align: center;
          transition: transform var(--transition), box-shadow var(--transition);
        }

        .gift-card:hover { transform: translateY(-3px); }

        .gift-emoji { font-size: 2.5rem; }

        .gift-name {
          font-weight: 700;
          color: var(--text);
          font-size: 0.95rem;
        }

        .gift-cost {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-bottom: 0.25rem;
        }

        .skeleton-card {
          height: 200px;
          border-radius: var(--radius);
          background: linear-gradient(
            90deg,
            var(--card) 25%,
            var(--card-hover) 50%,
            var(--card) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .back-link {
          text-align: center;
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        @media (max-width: 480px) {
          .gifts-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}
