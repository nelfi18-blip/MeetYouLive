"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * FollowButton – follow/unfollow a user/creator.
 * Props:
 *  - targetId: string (user._id to follow)
 *  - token: string (JWT from localStorage)
 *  - initialFollowing: bool (optional)
 *  - onFollowChange: (following: bool) => void (optional)
 */
export default function FollowButton({ targetId, token, initialFollowing = false, onFollowChange }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  // Check initial follow state from API
  useEffect(() => {
    if (!targetId || !token) { setChecked(true); return; }
    fetch(`${API_URL}/api/user/${targetId}/follow`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setFollowing(data.following); })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [targetId, token]);

  const handleToggle = useCallback(async () => {
    if (!token || loading) return;
    setLoading(true);
    try {
      const method = following ? "DELETE" : "POST";
      const res = await fetch(`${API_URL}/api/user/${targetId}/follow`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFollowing(data.following);
        onFollowChange?.(data.following);
      }
    } catch {}
    setLoading(false);
  }, [following, loading, targetId, token, onFollowChange]);

  if (!token || !checked) return null;

  return (
    <>
      <button
        className={`follow-btn${following ? " follow-btn-active" : ""}`}
        onClick={handleToggle}
        disabled={loading}
        type="button"
        aria-label={following ? "Dejar de seguir" : "Seguir creador"}
      >
        {loading ? (
          <span className="follow-spinner" />
        ) : following ? (
          "✓ Siguiendo"
        ) : (
          "+ Seguir"
        )}
      </button>

      <style jsx>{`
        .follow-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 1rem;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.18s;
          border: 1px solid rgba(224,64,251,0.45);
          background: rgba(224,64,251,0.1);
          color: #e040fb;
          letter-spacing: 0.02em;
          -webkit-tap-highlight-color: transparent;
        }

        .follow-btn:hover:not(:disabled) {
          background: rgba(224,64,251,0.22);
          border-color: rgba(224,64,251,0.7);
          box-shadow: 0 0 12px rgba(224,64,251,0.25);
          transform: translateY(-1px);
        }

        .follow-btn:active:not(:disabled) {
          transform: scale(0.95);
        }

        .follow-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .follow-btn-active {
          background: rgba(34,211,238,0.1);
          border-color: rgba(34,211,238,0.4);
          color: #22d3ee;
        }

        .follow-btn-active:hover:not(:disabled) {
          background: rgba(239,68,68,0.12);
          border-color: rgba(239,68,68,0.45);
          color: #f87171;
          box-shadow: 0 0 10px rgba(239,68,68,0.2);
        }

        .follow-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
