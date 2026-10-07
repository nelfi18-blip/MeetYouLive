"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { clearAllAuth } from "@/lib/token";
import { getDisplayName, normalizeUserImages } from "@/lib/imageHelpers";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getSettingsGroups(t) {
  return [
    {
      title: t("settingsPage.accountSection"),
      items: [
        { label: t("settingsPage.profileInfo"), description: t("settingsPage.profileInfoDescription"), href: "/profile", icon: "👤" },
        { label: t("settingsPage.security"), description: t("settingsPage.securityDescription"), href: "/reset-password", icon: "🔐" },
        { label: t("settingsPage.privacy"), description: t("settingsPage.privacyDescription"), href: "/privacy", icon: "🛡️" },
        { label: t("settingsPage.discovery"), description: t("settingsPage.discoveryDescription"), href: "/profile", icon: "🧭" },
      ],
    },
    {
      title: t("settingsPage.communicationSection"),
      items: [
        { label: t("settingsPage.notifications"), description: t("settingsPage.notificationsDescription"), href: "/settings/notifications", icon: "🔔" },
        { label: t("settingsPage.chats"), description: t("settingsPage.chatsDescription"), href: "/chats", icon: "💬" },
        { label: t("settingsPage.live"), description: t("settingsPage.liveDescription"), href: "/live", icon: "🎬" },
        { label: t("settingsPage.coins"), description: t("settingsPage.coinsDescription"), href: "/coins", icon: "🪙" },
      ],
    },
    {
      title: t("settingsPage.contentSection"),
      items: [
        { label: t("settingsPage.premium"), description: t("settingsPage.premiumDescription"), href: "/subscription", icon: "💎" },
        { label: t("settingsPage.exclusiveContent"), description: t("settingsPage.exclusiveContentDescription"), href: "/exclusive", icon: "🔓" },
      ],
    },
    {
      title: t("settingsPage.creatorSection"),
      items: [
        { label: t("settingsPage.creatorCenter"), description: t("settingsPage.creatorCenterDescription"), href: "/creator", icon: "🎥" },
        { label: t("settingsPage.agency"), description: t("settingsPage.agencyDescription"), href: "/agency", icon: "🤝" },
      ],
    },
    {
      title: t("settingsPage.supportSection"),
      items: [
        { label: t("settingsPage.help"), description: t("settingsPage.helpDescription"), href: "/help-center", icon: "❔" },
        { label: t("settingsPage.contact"), description: t("settingsPage.contactDescription"), href: "/contact", icon: "✉️" },
      ],
    },
    {
      title: t("settingsPage.infoSection"),
      items: [
        { label: t("settingsPage.terms"), description: t("settingsPage.termsDescription"), href: "/terms", icon: "📜" },
        { label: t("settingsPage.privacyPolicy"), description: t("settingsPage.privacyPolicyDescription"), href: "/privacy", icon: "📄" },
        { label: t("settingsPage.contentPolicy"), description: t("settingsPage.contentPolicyDescription"), href: "/content-policy", icon: "🧾" },
        { label: t("settingsPage.about"), description: t("settingsPage.aboutDescription"), href: "/about", icon: "ℹ️" },
        { label: t("settingsPage.refund"), description: t("settingsPage.refundDescription"), href: "/refund", icon: "↩️" },
      ],
    },
  ];
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [displayName, setDisplayName] = useState("");
  const settingsGroups = getSettingsGroups(t);

  const applyProfile = useCallback((profile) => {
    if (!profile || typeof profile !== "object") return;
    const images = normalizeUserImages(profile);
    setAvatar(images[0]?.url || "");
    setDisplayName(getDisplayName(profile));
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) applyProfile(d); })
      .catch(() => {});
  }, [session, applyProfile]);

  const handleLogout = async () => {
    socket.disconnect();
    clearAllAuth({ switching: false });
    await signOut({ redirect: false });
    router.replace("/login");
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    if (!window.confirm(t("settingsPage.deleteConfirm"))) return;
    const token = localStorage.getItem("token");
    if (!token) {
      setDeleteError(t("settingsPage.sessionExpired"));
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.message || t("settingsPage.deleteError"));
        return;
      }
      socket.disconnect();
      clearAllAuth();
      await signOut({ callbackUrl: "/login?accountDeleted=1" });
    } catch {
      setDeleteError(t("settingsPage.connectionError"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="settings-page">
      <header className="settings-hero">
        <div className="settings-hero-top">
          <p className="eyebrow">MeetYouLive</p>
          <h1>{t("settingsPage.title")}</h1>
          <p className="settings-subtitle">{t("settingsPage.subtitle")}</p>
        </div>

        <div className="settings-profile-summary">
          <span className="settings-avatar" aria-hidden="true">
            {avatar
              ? <img src={avatar} alt="" className="settings-avatar-img" onError={(e) => { e.target.style.display = "none"; }} />
              : <span className="settings-avatar-fallback">👤</span>}
          </span>
          <span className="settings-profile-name">{displayName || t("settingsPage.title")}</span>
          <Link href="/profile" className="settings-edit-profile-btn">
            {t("settingsPage.editProfile")}
          </Link>
        </div>
      </header>

      <div className="settings-groups">
        {settingsGroups.map((group) => (
          <section key={group.title} className="settings-section" aria-labelledby={`settings-${group.title}`}>
            <h2 id={`settings-${group.title}`}>{group.title}</h2>
            <div className="settings-items-grid">
              {group.items.map((item) => (
                <Link key={item.label} href={item.href} className="settings-tile">
                  <span className="settings-tile-icon" aria-hidden="true">{item.icon}</span>
                  <span className="settings-tile-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="settings-tile-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="settings-section logout-section" aria-labelledby="settings-session">
          <h2 id="settings-session">{t("settingsPage.sessionSection")}</h2>
          <button type="button" className="logout-button" onClick={handleLogout}>
            <span aria-hidden="true">🚪</span>
            <span>
              <strong>{t("settingsPage.logout")}</strong>
              <small>{t("settingsPage.logoutDescription")}</small>
            </span>
          </button>
        </section>

        <section className="settings-section danger-section" aria-labelledby="settings-danger">
          <h2 id="settings-danger">{t("settingsPage.accountActions")}</h2>
          {deleteError && <p className="delete-error">{deleteError}</p>}
          <button type="button" className="delete-button" onClick={handleDeleteAccount} disabled={deleting}>
            <span aria-hidden="true">🗑️</span>
            <span>
              <strong>{deleting ? t("settingsPage.deletingAccount") : t("settingsPage.deleteAccount")}</strong>
              <small>{t("settingsPage.deleteAccountDescription")}</small>
            </span>
          </button>
        </section>
      </div>

      <footer className="settings-footer">
        <span>© {new Date().getFullYear()} MeetYouLive</span>
        <Link href="/legal" className="settings-footer-link">{t("legal.footerCompactLink")}</Link>
      </footer>

      <style jsx>{`
        .settings-page {
          min-height: 100vh;
          max-width: 1040px;
          margin: 0 auto;
          /* Bottom clearance above BottomNavEnhanced is reserved globally by
             .main-content-bottom-nav (see app/globals.css, --bottom-spacing-mobile).
             Keep this page's own padding-bottom small so it never duplicates
             or falls short of that shared, safe-area-aware reservation. */
          padding: 1rem 0.9rem;
          color: #fff;
        }
        .settings-hero {
          border: 1px solid rgba(224, 64, 251, 0.22);
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(15, 23, 42, 0.85) 55%, rgba(219, 39, 119, 0.18));
          padding: 1.1rem;
          margin-bottom: 0.85rem;
          box-shadow: 0 20px 60px rgba(2, 6, 23, 0.38);
        }
        .eyebrow {
          margin: 0 0 0.3rem;
          color: #f0abfc;
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        h1, h2, p { margin: 0; }
        h1 {
          font-size: clamp(1.6rem, 6vw, 2.4rem);
          line-height: 1.05;
        }
        .settings-subtitle {
          margin-top: 0.45rem;
          color: #cbd5e1;
          font-size: 0.85rem;
          line-height: 1.5;
          max-width: 640px;
        }
        .settings-profile-summary {
          margin-top: 0.9rem;
          padding-top: 0.85rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .settings-avatar {
          width: 2.6rem;
          height: 2.6rem;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(224, 64, 251, 0.35);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .settings-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .settings-profile-name {
          flex: 1;
          min-width: 0;
          font-weight: 800;
          font-size: 0.95rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .settings-edit-profile-btn {
          flex-shrink: 0;
          border: 1px solid rgba(224, 64, 251, 0.4);
          border-radius: 999px;
          padding: 0.4rem 0.85rem;
          font-size: 0.78rem;
          font-weight: 800;
          color: #f8fafc;
          text-decoration: none;
          background: rgba(224, 64, 251, 0.12);
        }
        .settings-edit-profile-btn:hover {
          background: rgba(224, 64, 251, 0.22);
        }
        .settings-groups {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .settings-section {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.74);
          padding: 0.85rem;
        }
        .settings-section h2 {
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: #a78bfa;
          margin-bottom: 0.6rem;
        }
        .settings-items-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.5rem;
        }
        .settings-tile {
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.045);
          color: #f8fafc;
          text-decoration: none;
          padding: 0.6rem 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.55rem;
          min-width: 0;
        }
        .settings-tile:hover {
          border-color: rgba(224, 64, 251, 0.42);
          background: rgba(224, 64, 251, 0.1);
        }
        .settings-tile-icon {
          width: 1.9rem;
          height: 1.9rem;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 0.95rem;
        }
        .settings-tile-copy {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .settings-tile-copy strong {
          font-size: 0.82rem;
          line-height: 1.2;
        }
        .settings-tile-copy small {
          color: #94a3b8;
          font-size: 0.7rem;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .settings-tile-arrow {
          color: #c084fc;
          font-weight: 900;
          flex-shrink: 0;
          font-size: 0.8rem;
        }
        .logout-button,
        .delete-button {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.045);
          color: #f8fafc;
          padding: 0.72rem;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          text-align: left;
          cursor: pointer;
          font: inherit;
        }
        .logout-button:hover {
          border-color: rgba(224, 64, 251, 0.42);
          background: rgba(224, 64, 251, 0.1);
        }
        .logout-button strong,
        .delete-button strong {
          font-size: 0.88rem;
        }
        .logout-button small,
        .delete-button small {
          color: #94a3b8;
          font-size: 0.75rem;
          line-height: 1.4;
        }
        .delete-button {
          border-color: rgba(248, 113, 113, 0.35);
          background: rgba(127, 29, 29, 0.24);
        }
        .delete-button:hover {
          border-color: rgba(248, 113, 113, 0.65);
          background: rgba(248, 113, 113, 0.14);
        }
        .delete-button:disabled {
          cursor: wait;
          opacity: 0.7;
        }
        .delete-error {
          margin: 0 0 0.65rem;
          color: #fecaca;
          font-size: 0.82rem;
        }
        .settings-footer {
          margin-top: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          color: #94a3b8;
          font-size: 0.72rem;
          padding: 0.6rem;
        }
        .settings-footer-link {
          color: #c084fc;
          font-weight: 800;
          text-decoration: none;
        }
        .settings-footer-link:hover {
          text-decoration: underline;
        }
        @media (max-width: 420px) {
          .settings-items-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
