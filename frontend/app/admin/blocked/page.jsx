"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { clearAllAuth, buildSwitchAccountUrl } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";

function BlockedContent() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [attemptedPath, setAttemptedPath] = useState("");

  useEffect(() => {
    const from = searchParams.get("from");
    if (from) {
      setAttemptedPath(from);
    }
  }, [searchParams]);

  const handleSwitchAccount = async () => {
    try {
      await signOut({ redirect: false });
      clearAllAuth();
      window.location.replace(buildSwitchAccountUrl());
    } catch (error) {
      console.error("[handleSwitchAccount] Error during account switch:", error);
      clearAllAuth();
      window.location.replace(buildSwitchAccountUrl());
    }
  };

  const getPathLabel = (path) => {
    if (path.startsWith("/dashboard")) return t("adminBlocked.paths.dashboard");
    if (path.startsWith("/creator")) return t("adminBlocked.paths.creator");
    if (path.startsWith("/live")) return t("adminBlocked.paths.live");
    if (path.startsWith("/profile")) return t("adminBlocked.paths.profile");
    if (path.startsWith("/chats")) return t("adminBlocked.paths.chats");
    if (path.startsWith("/matches")) return t("adminBlocked.paths.matches");
    if (path.startsWith("/explore")) return t("adminBlocked.paths.explore");
    if (path.startsWith("/login")) return t("adminBlocked.paths.login");
    return t("adminBlocked.paths.default");
  };

  return (
    <>
      {/* Logo */}
      <div className="blocked-logo">
        <Image src="/logo.svg" alt="MeetYouLive logo" width={56} height={56} priority />
      </div>

      {/* Icon */}
      <div className="blocked-icon">🔒</div>

      {/* Title */}
      <h1 className="blocked-title">{t("adminBlocked.title")}</h1>

      {/* Message */}
      <div className="blocked-message">
        <p className="blocked-main-text">
          {t("adminBlocked.loggedInAs")} <strong>{t("adminBlocked.admin")}</strong>.
        </p>
        <p className="blocked-sub-text">
          {attemptedPath 
            ? t("adminBlocked.needToSwitch").replace("{path}", getPathLabel(attemptedPath))
            : t("adminBlocked.needToSwitchGeneric")}
        </p>
      </div>

      {/* Actions */}
      <div className="blocked-actions">
        <button className="btn btn-switch" onClick={handleSwitchAccount}>
          🔄 {t("adminBlocked.switchButton")}
        </button>
        <Link href="/admin" className="btn btn-back">
          ← {t("adminBlocked.backButton")}
        </Link>
      </div>

      {/* Help text */}
      <p className="blocked-help">
        {t("adminBlocked.helpText")}
      </p>
    </>
  );
}

export default function AdminBlockedPage() {
  return (
    <div className="blocked-page">
      {/* Aurora orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      
      {/* Grid overlay */}
      <div className="grid-overlay" aria-hidden="true" />

      <div className="blocked-card">
        <Suspense fallback={
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div className="blocked-logo">
              <Image src="/logo.svg" alt="MeetYouLive logo" width={56} height={56} priority />
            </div>
            <p style={{ color: "#94a3b8", marginTop: "1rem" }}>Cargando...</p>
          </div>
        }>
          <BlockedContent />
        </Suspense>
      </div>

      <style jsx>{`
        /* ── Background ── */
        .blocked-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.24) 0%, transparent 55%),
            radial-gradient(ellipse at 20% 100%, rgba(224,64,251,0.14) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 60%, rgba(59,130,246,0.10) 0%, transparent 40%),
            #060411;
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        /* ── Aurora orbs ── */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: orb-float 10s ease-in-out infinite alternate;
        }
        .orb-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(139,92,246,0.20), transparent 70%);
          top: -200px; left: 50%;
          transform: translateX(-50%);
        }
        .orb-2 {
          width: 360px; height: 360px;
          background: radial-gradient(circle, rgba(224,64,251,0.12), transparent 70%);
          bottom: -140px; right: -80px;
        }

        @keyframes orb-float {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(20px, 18px) scale(1.05); }
        }

        /* ── Grid overlay ── */
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at 50% 50%, black 0%, transparent 72%);
          pointer-events: none;
        }

        /* ── Card ── */
        .blocked-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 520px;
          background: rgba(8,4,20,0.94);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: 28px;
          padding: 3rem 2.5rem;
          box-shadow:
            0 24px 80px rgba(0,0,0,0.7),
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 60px rgba(139,92,246,0.12);
          backdrop-filter: blur(24px) saturate(1.5);
          text-align: center;
        }

        /* ── Logo ── */
        .blocked-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 1.5rem;
          filter: drop-shadow(0 0 16px rgba(139,92,246,0.5));
        }

        /* ── Icon ── */
        .blocked-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.9;
        }

        /* ── Title ── */
        .blocked-title {
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #f1f5f9;
          margin-bottom: 1.5rem;
        }

        /* ── Message ── */
        .blocked-message {
          margin-bottom: 2rem;
        }

        .blocked-main-text {
          font-size: 1.05rem;
          color: #e2e8f0;
          margin-bottom: 0.75rem;
          line-height: 1.6;
        }

        .blocked-main-text strong {
          color: #a78bfa;
          font-weight: 700;
        }

        .blocked-sub-text {
          font-size: 0.95rem;
          color: #94a3b8;
          line-height: 1.6;
        }

        /* ── Actions ── */
        .blocked-actions {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          margin-bottom: 1.5rem;
        }

        .btn {
          padding: 0.85rem 1.5rem;
          font-size: 1rem;
          font-weight: 700;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .btn-switch {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: #fff;
          box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);
        }

        .btn-switch:hover {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          box-shadow: 0 6px 28px rgba(59, 130, 246, 0.45);
          transform: translateY(-1px);
        }

        .btn-back {
          background: rgba(100, 116, 139, 0.12);
          color: #cbd5e1;
          border: 1px solid rgba(100, 116, 139, 0.2);
        }

        .btn-back:hover {
          background: rgba(100, 116, 139, 0.2);
          color: #e2e8f0;
          border-color: rgba(100, 116, 139, 0.3);
        }

        /* ── Help ── */
        .blocked-help {
          font-size: 0.8rem;
          color: #64748b;
          line-height: 1.5;
        }

        /* ── Responsive ── */
        @media (max-width: 560px) {
          .blocked-card {
            padding: 2.5rem 1.75rem;
          }
          .blocked-title {
            font-size: 1.65rem;
          }
          .blocked-icon {
            font-size: 3.5rem;
          }
        }
      `}</style>
    </div>
  );
}
