"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Normalize avatar URL to ensure it's safe and properly formatted
 * Only allows avatars from our backend to prevent XSS
 */
const normalizeAvatarUrl = (avatarValue) => {
  if (typeof avatarValue !== "string") return "";
  const trimmed = avatarValue.trim();
  if (!trimmed) return "";
  // If it's already a full URL from our backend, allow it
  if (/^https?:\/\//i.test(trimmed)) {
    // Only allow URLs from our backend domain
    if (typeof API_URL === "string" && trimmed.startsWith(API_URL)) {
      return trimmed;
    }
    // Don't render untrusted external URLs
    return "";
  }
  // If it's a relative path (e.g., /uploads/avatar-123-456.jpg)
  // Pattern prevents directory traversal by requiring a proper filename with extension
  if (/^\/uploads\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(trimmed) && typeof API_URL === "string" && API_URL.trim()) {
    return `${API_URL.replace(/\/+$/, "")}${trimmed}`;
  }
  return "";
};

/**
 * ProfileGiftStats — displays gift stats and top supporters for a user profile
 * 
 * Props:
 *  - userId {string} - The user ID to fetch stats for
 */
export default function ProfileGiftStats({ userId }) {
  const [stats, setStats] = useState(null);
  const [supporters, setSupporters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    // Fetch gift stats and top supporters in parallel
    Promise.all([
      fetch(`${API_URL}/api/gifts/profile-stats/${userId}`)
        .then((r) => {
          if (!r.ok) {
            return r.text().then((msg) => {
              console.error(`[ProfileGiftStats] Failed to load stats (${r.status}):`, msg);
              return null;
            });
          }
          return r.json();
        }),
      fetch(`${API_URL}/api/gifts/top-supporters/${userId}?limit=5`)
        .then((r) => {
          if (!r.ok) {
            return r.text().then((msg) => {
              console.error(`[ProfileGiftStats] Failed to load supporters (${r.status}):`, msg);
              return null;
            });
          }
          return r.json();
        }),
    ])
      .then(([statsData, supportersData]) => {
        setStats(statsData || { totalReceivedGifts: 0, totalReceivedCoins: 0, topGifts: [] });
        setSupporters(supportersData || []);
      })
      .catch((err) => {
        console.error("[ProfileGiftStats] Error loading data:", err);
        setStats({ totalReceivedGifts: 0, totalReceivedCoins: 0, topGifts: [] });
        setSupporters([]);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="pgs-loading">
        <div className="pgs-spinner" />
      </div>
    );
  }

  const hasGifts = stats && (stats.totalReceivedGifts > 0 || stats.totalReceivedCoins > 0);
  const hasTopGifts = stats?.topGifts && stats.topGifts.length > 0;
  const hasSupporters = supporters && supporters.length > 0;

  if (!hasGifts && !hasSupporters) {
    return null; // Don't show the section if no gifts received
  }

  return (
    <div className="pgs-container">
      {/* Stats summary */}
      <div className="pgs-summary">
        <div className="pgs-stat">
          <span className="pgs-stat-value">🎁 {stats.totalReceivedGifts.toLocaleString()}</span>
          <span className="pgs-stat-label">Regalos recibidos</span>
        </div>
        <div className="pgs-stat">
          <span className="pgs-stat-value">🪙 {stats.totalReceivedCoins.toLocaleString()}</span>
          <span className="pgs-stat-label">Monedas recibidas</span>
        </div>
      </div>

      {/* Top gifts received */}
      {hasTopGifts && (
        <div className="pgs-section">
          <h3 className="pgs-section-title">🌟 Regalos destacados</h3>
          <div className="pgs-gifts-grid">
            {stats.topGifts.slice(0, 6).map((gift, idx) => (
              <div key={idx} className="pgs-gift-card">
                <span className="pgs-gift-icon">{gift.giftIcon}</span>
                <span className="pgs-gift-name">{gift.giftName}</span>
                <span className="pgs-gift-count">x{gift.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top supporters */}
      {hasSupporters && (
        <div className="pgs-section">
          <h3 className="pgs-section-title">👑 Top Supporters</h3>
          <div className="pgs-supporters-list">
            {supporters.map((supporter, idx) => (
              <div key={supporter.userId || idx} className="pgs-supporter-card">
                <div className="pgs-supporter-rank">#{idx + 1}</div>
                <div className="pgs-supporter-avatar">
                  {normalizeAvatarUrl(supporter.avatar) ? (
                    <img 
                      src={normalizeAvatarUrl(supporter.avatar)} 
                      alt={supporter.username || supporter.name || "Usuario"}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <div className="pgs-supporter-placeholder">
                      {(supporter.username || supporter.name || "?")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="pgs-supporter-info">
                  <span className="pgs-supporter-name">
                    {supporter.username || supporter.name || "Usuario"}
                  </span>
                  <span className="pgs-supporter-stats">
                    🎁 {supporter.totalGifts} · 🪙 {supporter.totalCoins.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .pgs-container {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          padding: 1.25rem;
          background: var(--grad-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius);
          margin-top: 1rem;
        }

        .pgs-loading {
          display: flex;
          justify-content: center;
          padding: 2rem;
        }

        .pgs-spinner {
          width: 28px;
          height: 28px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .pgs-summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .pgs-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: var(--radius-sm);
        }

        .pgs-stat-value {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: 0.02em;
        }

        .pgs-stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .pgs-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .pgs-section-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
          letter-spacing: 0.02em;
        }

        .pgs-gifts-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.65rem;
        }

        .pgs-gift-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          padding: 0.75rem 0.5rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: var(--radius-xs);
          transition: all 0.2s ease;
        }

        .pgs-gift-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--accent);
          box-shadow: 0 0 12px rgba(224, 64, 251, 0.2);
        }

        .pgs-gift-icon {
          font-size: 1.8rem;
          line-height: 1;
        }

        .pgs-gift-name {
          font-size: 0.65rem;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 700;
          text-align: center;
          line-height: 1.2;
        }

        .pgs-gift-count {
          font-size: 0.65rem;
          color: var(--accent-orange);
          font-weight: 700;
        }

        .pgs-supporters-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .pgs-supporter-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: var(--radius-xs);
          transition: all 0.2s ease;
        }

        .pgs-supporter-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(224, 64, 251, 0.3);
        }

        .pgs-supporter-rank {
          font-size: 0.9rem;
          font-weight: 800;
          color: var(--accent-orange);
          min-width: 28px;
          text-align: center;
        }

        .pgs-supporter-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
          border: 2px solid rgba(224, 64, 251, 0.3);
        }

        .pgs-supporter-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pgs-supporter-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--grad-primary);
          color: #fff;
          font-weight: 800;
          font-size: 1rem;
        }

        .pgs-supporter-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          flex: 1;
        }

        .pgs-supporter-name {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text);
        }

        .pgs-supporter-stats {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
