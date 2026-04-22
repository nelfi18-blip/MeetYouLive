"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12v10H4V12" />
      <path d="M2 7h20v5H2z" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 3.9M15.4 6.6 8.6 10.5" />
    </svg>
  );
}

/**
 * ReferralCard — compact referral promo widget for dashboard / profile pages.
 * Shows the user's referral link with a copy button and a link to the full referral page.
 */
export default function ReferralCard() {
  const [referralCode, setReferralCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/referral/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.referralCode) setReferralCode(data.referralCode);
      })
      .catch((err) => {
        console.error("[ReferralCard] failed to load referral data:", err);
      });
  }, []);

  const referralLink =
    typeof window !== "undefined" && referralCode
      ? `${window.location.origin}/register?ref=${referralCode}`
      : "";

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleShare = async () => {
    if (!referralLink) return;
    try {
      await navigator.share({
        title: "Únete a MeetYouLive",
        text: "🎁 Regístrate con mi enlace y consigue monedas gratis en MeetYouLive",
        url: referralLink,
      });
    } catch (err) {
      // AbortError means the user dismissed the share sheet — ignore it.
      if (err?.name !== "AbortError") {
        console.error("[ReferralCard] share failed:", err);
      }
    }
  };

  return (
    <div className="rc-wrap">
      <div className="rc-orb" />
      <div className="rc-left">
        <span className="rc-gift-icon"><GiftIcon /></span>
        <div className="rc-text">
          <span className="rc-title">Invita amigos y gana monedas</span>
          <span className="rc-sub">+50 monedas por cada amigo que se registre con tu enlace</span>
        </div>
      </div>

      <div className="rc-actions">
        {referralLink ? (
          <button className="rc-btn-copy" onClick={handleCopy} title="Copiar enlace">
            {copied ? "✓ Copiado" : "Copiar enlace"}
          </button>
        ) : null}
        {canShare && referralLink ? (
          <button className="rc-btn-share" onClick={handleShare} title="Compartir">
            <ShareIcon />
            Compartir
          </button>
        ) : null}
        <Link href="/referral" className="rc-btn-full">
          Ver más
        </Link>
      </div>

      <style jsx>{`
        .rc-wrap {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(224,64,251,0.08) 100%);
          border: 1px solid rgba(139,92,246,0.25);
          border-radius: 14px;
          padding: 0.9rem 1rem;
          flex-wrap: wrap;
        }

        .rc-orb {
          position: absolute;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(224,64,251,0.18), transparent 70%);
          top: -60px;
          right: -40px;
          pointer-events: none;
        }

        .rc-left {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex: 1;
          min-width: 0;
        }

        .rc-gift-icon {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          animation: rc-bounce 2.5s ease-in-out infinite;
          color: #f0abfc;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .rc-gift-icon :global(svg) {
          width: 24px;
          height: 24px;
        }

        @keyframes rc-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        .rc-text {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 0;
        }

        .rc-title {
          font-size: 0.875rem;
          font-weight: 700;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rc-sub {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.5);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rc-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .rc-btn-copy {
          background: rgba(139,92,246,0.15);
          border: 1px solid rgba(139,92,246,0.3);
          color: #c4b5fd;
          border-radius: 8px;
          padding: 0.38rem 0.75rem;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          white-space: nowrap;
        }

        .rc-btn-copy:hover {
          background: rgba(139,92,246,0.25);
          color: #e9d5ff;
        }

        .rc-btn-share {
          background: rgba(224,64,251,0.12);
          border: 1px solid rgba(224,64,251,0.3);
          color: #e879f9;
          border-radius: 8px;
          padding: 0.38rem 0.75rem;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .rc-btn-share :global(svg) {
          width: 13px;
          height: 13px;
        }

        .rc-btn-share:hover {
          background: rgba(224,64,251,0.22);
          color: #f0abfc;
        }

        .rc-btn-full {
          background: linear-gradient(135deg, #8b5cf6, #e040fb);
          color: #fff;
          border-radius: 8px;
          padding: 0.38rem 0.85rem;
          font-size: 0.78rem;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
          transition: opacity 0.15s;
        }

        .rc-btn-full:hover {
          opacity: 0.88;
        }

        @media (max-width: 480px) {
          .rc-wrap { flex-direction: column; align-items: flex-start; }
          .rc-actions { width: 100%; }
          .rc-btn-copy, .rc-btn-share, .rc-btn-full { flex: 1; text-align: center; }
        }
      `}</style>
    </div>
  );
}
