"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function FloatingGoLiveButton() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [user, setUser] = useState(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setUser(d);
      })
      .catch(() => {});
  }, [session]);

  // Hide button on certain pages
  useEffect(() => {
    // Hide on live-related pages and the start live page itself
    const hiddenPages = ["/live/start", "/live/create"];
    const isLivePage = pathname?.startsWith("/live/") && pathname !== "/live";
    setIsVisible(!hiddenPages.includes(pathname) && !isLivePage);
  }, [pathname]);

  // Only show for approved creators
  if (!user || !isApprovedCreator(user) || !isVisible) {
    return null;
  }

  return (
    <Link href="/live/start" className="floating-go-live-btn">
      <span className="floating-go-live-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
        </svg>
      </span>
      <span className="floating-go-live-text">{t("nav.goLive")}</span>

      <style jsx>{`
        .floating-go-live-btn {
          position: fixed;
          bottom: 100px;
          right: 24px;
          z-index: 150;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1.5rem;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          color: white;
          border-radius: 50px;
          box-shadow: 0 8px 24px rgba(224, 64, 251, 0.4),
            0 0 0 0 rgba(224, 64, 251, 0.7);
          font-weight: 700;
          font-size: 0.95rem;
          text-decoration: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          animation: pulse 2s ease-in-out infinite;
          cursor: pointer;
          border: 2px solid rgba(255, 255, 255, 0.3);
        }

        .floating-go-live-btn:hover {
          transform: translateY(-4px) scale(1.05);
          box-shadow: 0 12px 32px rgba(224, 64, 251, 0.5),
            0 0 40px rgba(255, 45, 120, 0.3);
          border-color: rgba(255, 255, 255, 0.5);
        }

        .floating-go-live-btn:active {
          transform: translateY(-2px) scale(1.02);
        }

        .floating-go-live-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
        }

        .floating-go-live-icon svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }

        .floating-go-live-text {
          white-space: nowrap;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        @keyframes pulse {
          0%,
          100% {
            box-shadow: 0 8px 24px rgba(224, 64, 251, 0.4),
              0 0 0 0 rgba(224, 64, 251, 0.7);
          }
          50% {
            box-shadow: 0 8px 24px rgba(224, 64, 251, 0.4),
              0 0 0 12px rgba(224, 64, 251, 0);
          }
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .floating-go-live-btn {
            bottom: 80px;
            right: 16px;
            padding: 0.75rem 1.25rem;
            font-size: 0.875rem;
          }

          .floating-go-live-icon {
            width: 20px;
            height: 20px;
          }
        }

        /* Hide text on very small screens, show only icon */
        @media (max-width: 480px) {
          .floating-go-live-btn {
            padding: 1rem;
            border-radius: 50%;
          }

          .floating-go-live-text {
            display: none;
          }

          .floating-go-live-icon {
            width: 24px;
            height: 24px;
          }
        }
      `}</style>
    </Link>
  );
}
