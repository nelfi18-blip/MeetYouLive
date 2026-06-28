"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";
import GiftButton from "@/components/GiftButton";
import UrgencyBanner from "@/components/UrgencyBanner";
import HiddenLikesSection from "@/components/HiddenLikesSection";
import ActivityBar from "@/components/ActivityBar";
import StatusBadges from "@/components/StatusBadges";
import { computeStatusBadges } from "@/lib/statusBadges";
import { getDisplayName, getPrimaryProfileImage } from "@/lib/imageHelpers";
import { PROFILE_UPDATED_EVENT } from "@/lib/profileSync";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  );
}

function VerifiedIcon({ label }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={label}>
      <path d="M12 2l2.13 2.08 2.96-.42.53 2.95 2.62 1.46-1.35 2.68 1.35 2.68-2.62 1.46-.53 2.95-2.96-.42L12 22l-2.13-2.08-2.96.42-.53-2.95-2.62-1.46 1.35-2.68-1.35-2.68 2.62-1.46.53-2.95 2.96.42L12 2zm-1.13 13.2l5.64-5.65-1.42-1.41-4.22 4.23-1.96-1.96L7.5 11.82l3.37 3.38z" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  );
}

function calcAge(birthdate) {
  if (!birthdate) return null;
  const date = new Date(birthdate);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age > 0 ? age : null;
}

function getLocationLabel(user) {
  return (
    user?.distanceLabel ||
    user?.distance ||
    user?.city ||
    user?.location?.city ||
    user?.country ||
    null
  );
}

function getActivityLabel(user, t) {
  if (user?.isLive) return t("matchesPage.liveNow");
  if (user?.isOnline) return t("matchesPage.activeNow");
  const rawLastActive = user?.lastActiveAt || user?.lastSeenAt || user?.updatedAt;
  if (!rawLastActive) return null;
  const lastActive = new Date(rawLastActive);
  if (Number.isNaN(lastActive.getTime())) return null;
  const daysSinceActiveFloat = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceActiveFloat <= 7 ? t("matchesPage.recentlyActive") : null;
}

export default function MatchesPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");
  const [callError, setCallError] = useState("");
  const [likesTotal, setLikesTotal] = useState(0);
  const [activeSection, setActiveSection] = useState("received-likes-panel");

  const fetchMatches = useCallback(({ silent = false } = {}) => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    if (!silent) setLoading(true);
    fetch(`${API_URL}/api/matches`, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    })
      .then((r) => {
        if (r.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d) {
          const safeMatches = (d.matches || [])
            .filter(u => u && u.role !== "admin" && u.role !== "moderator");
          setMatches(safeMatches);
        }
      })
      .catch(() => setError("No se pudieron cargar los matches"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const scrollToSection = useCallback((sectionId) => {
    if (typeof window === "undefined") return;
    setActiveSection(sectionId);
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  const likesCounterLabel =
    likesTotal === 1 ? t("matchesPage.counterSingular") : t("matchesPage.counterPlural");

  useEffect(() => {
    const handleProfileUpdated = () => fetchMatches({ silent: true });
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
  }, [fetchMatches]);

  const startChat = async (userId) => {
    const token = localStorage.getItem("token");
    setChatError("");
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipientId: userId }),
      });
      if (res.ok) {
        const chat = await res.json();
        router.push(`/chats/${chat._id}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setChatError(data.message || t("matchesPage.chatOpenError"));
        setTimeout(() => setChatError(""), 4000);
      }
    } catch {
      setChatError(t("matchesPage.connectionError"));
      setTimeout(() => setChatError(""), 4000);
    }
  };

  const startPrivateCall = async (userId) => {
    const token = localStorage.getItem("token");
    setCallError("");
    try {
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientId: userId, type: "paid_creator" }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/call/${data._id}`);
      } else {
        setCallError(data.message || "No se pudo iniciar la llamada");
        setTimeout(() => setCallError(""), 4000);
      }
    } catch {
      setCallError("Error de conexión");
      setTimeout(() => setCallError(""), 4000);
    }
  };

  return (
    <div className="matches-page">
      {/* Urgency banner */}
      <UrgencyBanner />

      {/* ── 📊 ACTIVITY SIGNALS — social proof ── */}
      <ActivityBar variant="strip" />

      <section className="likes-hero" aria-labelledby="likes-title">
        <div className="likes-hero-glow likes-hero-glow-pink" aria-hidden="true" />
        <div className="likes-hero-glow likes-hero-glow-purple" aria-hidden="true" />
        <div className="likes-hero-content">
          <span className="likes-eyebrow">💖 {t("matchesPage.likesEyebrow")}</span>
          <h1 id="likes-title" className="likes-title">{t("matchesPage.likesTitle")}</h1>
          <p className="likes-subtitle">{t("matchesPage.likesSubtitle")}</p>
          <div className="likes-tabs" role="tablist" aria-label={t("matchesPage.tabsAria")}>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "received-likes-panel"}
              aria-controls="received-likes-panel"
              className={`likes-tab${activeSection === "received-likes-panel" ? " likes-tab-active" : ""}`}
              onClick={() => scrollToSection("received-likes-panel")}
            >
              {t("matchesPage.receivedLikesTab")} <strong>{likesTotal}</strong>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "matches-section"}
              aria-controls="matches-section"
              className={`likes-tab${activeSection === "matches-section" ? " likes-tab-active" : ""}`}
              onClick={() => scrollToSection("matches-section")}
            >
              {t("matchesPage.matchesTab")} <strong>{matches.length}</strong>
            </button>
          </div>
        </div>
        <div className="likes-counter-panel" aria-label={`${likesTotal} ${likesCounterLabel}`}>
          <span className="likes-counter-value">{likesTotal}</span>
          <span className="likes-counter-label">{likesCounterLabel}</span>
          <span className="likes-counter-hint">{t("matchesPage.counterHint")}</span>
        </div>
      </section>

      {error && <div className="banner-error">{error}</div>}
      {chatError && <div className="banner-error">{chatError}</div>}
      {callError && <div className="banner-error">{callError}</div>}

      {loading && (
        <div className="matches-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 200, borderRadius: "var(--radius)" }} />
          ))}
        </div>
      )}

      {!loading && matches.length === 0 && (
        <>
          {/* Real hidden likes section */}
          <div id="received-likes-panel">
            <HiddenLikesSection onTotalChange={setLikesTotal} />
          </div>

          <div id="matches-section" className="empty-state">
            <div className="empty-icon" style={{ color: "var(--accent)" }}>
              <HeartIcon />
            </div>
            <h3>Sin matches aún</h3>
            <p>Explora perfiles y dale like a quienes te llamen la atención. ¡Cuando sea mutuo, aparecerán aquí!</p>
            <Link href="/crush" className="btn btn-primary">
              ⚡ Ir al Crush
            </Link>
            <div className="empty-upsell">
              <p className="empty-upsell-label">💎 Desbloquea más con monedas</p>
              <div className="empty-upsell-actions">
                <Link href="/coins" className="empty-upsell-btn">
                  💎 Desbloquear ahora
                </Link>
                <Link href="/explore" className="empty-upsell-btn empty-upsell-btn-ghost">
                  🔍 Explorar perfiles
                </Link>
              </div>
            </div>
          </div>

          {/* Confidence room suggestion for users with no matches */}
          <Link href="/rooms" className="confidence-matches-card">
            <div className="confidence-matches-glow" />
            <div className="confidence-matches-inner">
              <span className="confidence-matches-emoji">🎯</span>
              <div className="confidence-matches-text">
                <strong>Practica conversación antes de hablar con alguien</strong>
                <span>🔥 Mejora tu confianza en el amor · Sala segura y amigable</span>
              </div>
              <span className="confidence-matches-cta">Entrar ahora →</span>
            </div>
          </Link>
        </>
      )}

      {!loading && matches.length > 0 && (
        <>
          {/* Hidden likes section also shown when user has matches */}
          <div id="received-likes-panel">
            <HiddenLikesSection onTotalChange={setLikesTotal} />
          </div>
          <div className="fomo-matches-hint">
            💬 {t("matchesPage.fomoHint")}
          </div>
          <section id="matches-section" className="matches-section">
            <div className="matches-section-head">
              <div>
                <span className="matches-section-kicker">🔥 {t("matchesPage.mutualConnections")}</span>
                <h2>{t("matchesPage.matchesTab")}</h2>
              </div>
              <Link href="/crush" className="crush-link-btn">
                ⚡ Crush
              </Link>
            </div>
            <div className="matches-grid">
          {matches.map((user) => {
            const displayName = getDisplayName(user);
            const initial = displayName[0].toUpperCase();
            const isCreator = user.role === "creator";
            const roleLabel = isCreator ? "Creador" : user.role === "admin" ? "Admin" : "Usuario";
            const privateCallEnabled = isCreator && user.creatorProfile?.privateCallEnabled;
            const pricePerMinute = user.creatorProfile?.pricePerMinute ?? 0;
            const compatibilityScore = user.compatibilityScore ?? null;
            const sharedInterests = user.sharedInterests || [];
            const statusBadges = computeStatusBadges(user);
            const userImage = getPrimaryProfileImage(user);
            const age = calcAge(user.birthdate || user.dateOfBirth || user.birthday);
            const locationLabel = getLocationLabel(user);
            const activityLabel = getActivityLabel(user, t);
            const isVerified = Boolean(user.isVerified);
            return (
              <div key={user._id} className="match-card">
                <div className="match-photo-wrap">
                  {userImage ? (
                    <img src={userImage} alt={displayName} className="match-photo-img" loading="lazy" />
                  ) : (
                    <div className="match-photo-placeholder">{initial}</div>
                  )}
                  <div className="match-photo-top">
                    <span className="match-badge-heart">
                      <HeartIcon />
                    </span>
                    {activityLabel && <span className="match-active-pill">{activityLabel}</span>}
                  </div>
                  <div className="match-photo-gradient" />
                  <div className="match-photo-info">
                    <div className="match-name-row">
                      <span className="match-name">
                        {displayName}
                        {age ? `, ${age}` : ""}
                      </span>
                      {isVerified && (
                        <span
                          className="match-verified"
                          title={t("matchesPage.verified")}
                        >
                          <VerifiedIcon label={t("matchesPage.verified")} />
                        </span>
                      )}
                    </div>
                    {locationLabel && <div className="match-location">📍 {locationLabel}</div>}
                  </div>
                </div>
                <div className="match-body">
                  <div className="match-meta-row">
                    {isCreator && (
                      <span className="badge badge-creator">{roleLabel}</span>
                    )}
                    {compatibilityScore !== null && compatibilityScore > 0 && (
                      <span className="match-compat-badge">🔥 {compatibilityScore}%</span>
                    )}
                  </div>
                  {statusBadges.length > 0 && (
                    <StatusBadges badges={statusBadges} compact style={{ marginTop: "0.3rem" }} />
                  )}
                  {user.bio && <p className="match-bio">{user.bio}</p>}
                  {user.interests?.length > 0 && (
                    <div className="match-interests">
                      {user.interests.slice(0, 3).map((i) => (
                        <span key={i} className={`match-interest-tag${sharedInterests.includes(i) ? " match-interest-shared" : ""}`}>{i}</span>
                      ))}
                    </div>
                  )}
                  {sharedInterests.length > 0 && (
                    <p className="match-shared-label">✨ {sharedInterests.length} interés{sharedInterests.length !== 1 ? "es" : ""} en común</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="match-actions">
                  <Link href={`/profile/${user._id}`} className="match-action-btn match-action-link match-profile-btn">
                    {t("matchesPage.viewProfile")}
                  </Link>
                  <button
                    className="btn btn-primary match-action-btn"
                    onClick={() => startChat(user._id)}
                  >
                    <ChatIcon /> Chat
                  </button>

                  {privateCallEnabled ? (
                    <button
                      className="match-action-btn match-call-btn"
                      onClick={() => startPrivateCall(user._id)}
                      title={`Llamada privada · 🪙${pricePerMinute}/min`}
                    >
                      <CallIcon /> ⚡ Llamar ahora · 🪙{pricePerMinute}/min
                    </button>
                  ) : (
                    <button
                      className="match-action-btn match-call-btn match-call-instant"
                      onClick={() => startPrivateCall(user._id)}
                    >
                      <CallIcon /> ⚡ Llamar ahora
                    </button>
                  )}

                  {isCreator && (
                    <div className="match-gift-wrap">
                      <GiftButton receiverId={user._id} context="match" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
            </div>
          </section>
        </>
      )}

      <style jsx>{`
        .matches-page {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
          min-height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          touch-action: pan-y;
          pointer-events: auto;
        }

        .fomo-matches-hint {
          font-size: 0.8rem;
          font-weight: 600;
          color: rgba(255,45,120,0.85);
          background: rgba(255,45,120,0.07);
          border: 1px solid rgba(255,45,120,0.18);
          border-radius: 8px;
          padding: 0.5rem 0.9rem;
          text-align: center;
        }

        .likes-hero {
          position: relative;
          display: flex;
          justify-content: space-between;
          gap: 1.25rem;
          padding: clamp(1.15rem, 4vw, 1.75rem);
          border-radius: 30px;
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 0%, rgba(255,45,120,0.28), transparent 34%),
            linear-gradient(145deg, rgba(22,8,48,0.96), rgba(8,4,20,0.94));
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 22px 70px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.08);
          animation: likes-hero-in 0.35s ease-out both;
        }
        .likes-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.06), transparent);
          opacity: 0.48;
          pointer-events: none;
        }
        .likes-hero-glow {
          position: absolute;
          border-radius: 999px;
          filter: blur(4px);
          pointer-events: none;
        }
        .likes-hero-glow-pink {
          width: 220px;
          height: 220px;
          right: -70px;
          top: -80px;
          background: rgba(255,45,120,0.2);
        }
        .likes-hero-glow-purple {
          width: 160px;
          height: 160px;
          left: 30%;
          bottom: -95px;
          background: rgba(224,64,251,0.15);
        }
        .likes-hero-content,
        .likes-counter-panel {
          position: relative;
          z-index: 1;
        }
        .likes-eyebrow {
          display: inline-flex;
          color: #ff9ac8;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 900;
        }
        .likes-title {
          font-size: clamp(2.4rem, 9vw, 4.25rem);
          line-height: 0.9;
          letter-spacing: -0.07em;
          color: #fff;
          margin: 0.28rem 0 0.35rem;
        }
        .likes-subtitle {
          margin: 0;
          color: rgba(255,255,255,0.68);
          font-size: 0.95rem;
          font-weight: 650;
        }
        .likes-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          margin-top: 1.15rem;
        }
        .likes-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.56rem 0.85rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.72);
          text-decoration: none;
          font-family: inherit;
          font-size: 0.78rem;
          font-weight: 850;
          backdrop-filter: blur(12px);
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
        }
        .likes-tab:hover,
        .likes-tab-active {
          transform: translateY(-1px);
          color: #fff;
          background: linear-gradient(135deg, rgba(255,45,120,0.85), rgba(224,64,251,0.78));
          box-shadow: 0 10px 25px rgba(224,64,251,0.24);
        }
        .likes-tab strong {
          min-width: 1.3rem;
          height: 1.3rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255,255,255,0.14);
          font-size: 0.68rem;
        }
        .likes-counter-panel {
          min-width: 168px;
          align-self: stretch;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 1rem;
          border-radius: 24px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 16px 40px rgba(255,45,120,0.16);
        }
        .likes-counter-value {
          color: #fff;
          font-size: 2.45rem;
          font-weight: 950;
          line-height: 1;
        }
        .likes-counter-label,
        .likes-counter-hint {
          color: rgba(255,255,255,0.6);
          font-size: 0.72rem;
          font-weight: 800;
        }
        .likes-counter-hint {
          margin-top: 0.45rem;
          color: rgba(255,154,200,0.8);
        }
        @keyframes likes-hero-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .crush-link-btn {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 1.1rem;
          border-radius: 999px;
          border: 1px solid rgba(251,191,36,0.35);
          background: rgba(251,191,36,0.07);
          color: #fbbf24;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
        }
        .crush-link-btn:hover {
          background: rgba(251,191,36,0.14);
          box-shadow: 0 0 12px rgba(251,191,36,0.2);
        }

        .matches-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
          gap: 1rem;
        }
        .matches-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .matches-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .matches-section-kicker {
          color: rgba(255,154,200,0.78);
          font-size: 0.72rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 900;
        }
        .matches-section-head h2 {
          margin: 0.2rem 0 0;
          color: var(--text);
          font-size: clamp(1.35rem, 5vw, 1.8rem);
          letter-spacing: -0.04em;
        }

        .match-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.045)),
            rgba(15,8,32,0.74);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 26px;
          padding: 0.55rem;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          overflow: hidden;
          touch-action: pan-y;
          box-shadow: 0 18px 45px rgba(0,0,0,0.28);
          transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
        }
        .match-card:hover {
          border-color: rgba(255,45,120,0.34);
          box-shadow: 0 24px 58px rgba(255,45,120,0.15);
          transform: translateY(-4px);
        }

        .match-photo-wrap {
          position: relative;
          --gradient-start: 38%;
          min-height: 310px;
          border-radius: 22px;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(255,45,120,0.22), rgba(224,64,251,0.18));
        }
        .match-photo-img,
        .match-photo-placeholder {
          width: 100%;
          height: 100%;
          min-height: 310px;
        }
        .match-photo-img {
          object-fit: cover;
        }
        .match-photo-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .match-photo-placeholder {
          background:
            radial-gradient(circle at 35% 20%, rgba(255,255,255,0.26), transparent 18%),
            linear-gradient(135deg, rgba(255,45,120,0.48), rgba(224,64,251,0.42));
          color: #fff;
          font-size: 4.25rem;
          font-weight: 950;
        }
        .match-photo-top {
          position: absolute;
          top: 0.7rem;
          left: 0.7rem;
          right: 0.7rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.45rem;
          z-index: 2;
        }
        .match-badge-heart {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(255,45,120,0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          box-shadow: 0 8px 22px rgba(255,45,120,0.42);
          backdrop-filter: blur(10px);
          flex-shrink: 0;
        }
        .match-active-pill {
          padding: 0.28rem 0.56rem;
          border-radius: 999px;
          background: rgba(9, 7, 20, 0.66);
          border: 1px solid rgba(74,222,128,0.28);
          color: #bbf7d0;
          font-size: 0.62rem;
          font-weight: 850;
          backdrop-filter: blur(10px);
        }
        .match-photo-gradient {
          position: absolute;
          inset: var(--gradient-start) 0 0;
          background: linear-gradient(180deg, transparent, rgba(7,4,18,0.64) 42%, rgba(7,4,18,0.96));
          pointer-events: none;
        }
        .match-photo-info {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1;
          padding: 1rem;
        }
        .match-badge-heart :global(svg) { width: 12px; height: 12px; }

        .match-body {
          text-align: left;
          width: 100%;
          padding: 0 0.35rem;
        }
        .match-name-row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .match-name {
          font-weight: 950;
          font-size: 1.16rem;
          color: #fff;
          line-height: 1.1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .match-verified {
          display: inline-flex;
          color: #60a5fa;
          filter: drop-shadow(0 0 8px rgba(96,165,250,0.45));
          flex-shrink: 0;
        }
        .match-location {
          margin-top: 0.25rem;
          color: rgba(255,255,255,0.72);
          font-size: 0.76rem;
          font-weight: 750;
        }
        .match-bio {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0.35rem 0 0;
        }
        .match-interests {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          justify-content: flex-start;
          margin-top: 0.5rem;
        }
        .match-interest-tag {
          font-size: 0.65rem;
          padding: 0.2rem 0.55rem;
          border-radius: var(--radius-pill);
          background: rgba(224,64,251,0.08);
          border: 1px solid rgba(224,64,251,0.18);
          color: var(--accent-2);
          font-weight: 600;
        }
        .match-interest-shared {
          background: rgba(255,45,120,0.12);
          border-color: rgba(255,45,120,0.4);
          color: #ff2d78;
          box-shadow: 0 0 6px rgba(255,45,120,0.15);
        }
        .match-meta-row {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 0.45rem;
          flex-wrap: wrap;
          margin-bottom: 0.15rem;
        }
        .match-compat-badge {
          font-size: 0.68rem;
          font-weight: 800;
          padding: 0.18rem 0.55rem;
          border-radius: var(--radius-pill);
          background: linear-gradient(135deg, rgba(255,45,120,0.15), rgba(251,191,36,0.15));
          border: 1px solid rgba(255,45,120,0.4);
          color: #fbbf24;
          letter-spacing: 0.02em;
          box-shadow: 0 0 8px rgba(255,45,120,0.18);
          white-space: nowrap;
        }
        .match-shared-label {
          font-size: 0.67rem;
          color: rgba(255,45,120,0.75);
          font-weight: 600;
          margin: 0.3rem 0 0;
          text-align: left;
        }

        .match-actions {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          width: 100%;
          padding: 0 0.35rem 0.35rem;
          touch-action: pan-y;
        }

        .match-action-btn {
          width: 100%;
          padding: 0.6rem;
          font-size: 0.82rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          touch-action: manipulation;
          border-radius: 14px;
        }
        .match-action-link {
          text-decoration: none;
        }
        .match-profile-btn {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.11);
          color: rgba(255,255,255,0.78);
          font-weight: 800;
          transition: background 0.2s ease, color 0.2s ease;
        }
        .match-profile-btn:hover {
          background: rgba(255,255,255,0.12);
          color: #fff;
        }

        .match-call-btn {
          width: 100%;
          padding: 0.6rem;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          background: rgba(99,102,241,0.08);
          border: 1px solid rgba(99,102,241,0.3);
          border-radius: var(--radius-sm);
          color: #a5b4fc;
          cursor: pointer;
          transition: all 0.2s;
          font-weight: 600;
          animation: call-btn-glow 3s ease-in-out infinite;
        }
        @keyframes call-btn-glow {
          0%, 100% { box-shadow: 0 0 0 rgba(99,102,241,0); }
          50%       { box-shadow: 0 0 14px rgba(99,102,241,0.25); }
        }
        .match-call-btn:hover {
          background: rgba(99,102,241,0.18);
          box-shadow: 0 0 18px rgba(99,102,241,0.35);
        }

        .match-gift-wrap { width: 100%; }
        .match-gift-wrap :global(.gift-btn-wrap) { width: 100%; }
        .match-gift-wrap :global(.gift-trigger-btn) { width: 100%; justify-content: center; }

        .badge-creator {
          display: inline-block;
          font-size: 0.65rem;
          padding: 0.18rem 0.55rem;
          border-radius: var(--radius-pill);
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.25);
          color: var(--accent-green);
          font-weight: 700;
          margin-bottom: 0.25rem;
        }

        .match-call-instant {
          background: rgba(255,45,120,0.08);
          border-color: rgba(255,45,120,0.28);
          color: #ff6ba8;
        }
        .match-call-instant:hover {
          background: rgba(255,45,120,0.18);
          box-shadow: 0 0 12px rgba(255,45,120,0.2);
        }

        /* Empty state upsell */
        .empty-upsell {
          margin-top: 1.25rem;
          padding: 1.25rem 1.5rem;
          border: 1px solid rgba(251,191,36,0.25);
          background: rgba(251,191,36,0.04);
          border-radius: var(--radius);
          text-align: center;
          max-width: 380px;
          width: 100%;
        }
        .empty-upsell-label {
          font-size: 0.85rem;
          color: #fbbf24;
          font-weight: 700;
          margin: 0 0 0.85rem;
        }
        .empty-upsell-actions {
          display: flex;
          gap: 0.65rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        .empty-upsell-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(251,191,36,0.18), rgba(224,64,251,0.1));
          border: 1px solid rgba(251,191,36,0.35);
          color: #fbbf24;
          transition: all 0.2s;
        }
        .empty-upsell-btn:hover {
          background: linear-gradient(135deg, rgba(251,191,36,0.28), rgba(224,64,251,0.18));
          box-shadow: 0 0 14px rgba(251,191,36,0.2);
        }
        .empty-upsell-btn-ghost {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.12);
          color: var(--text-muted);
        }
        .empty-upsell-btn-ghost:hover {
          background: rgba(255,255,255,0.08);
          box-shadow: none;
        }

        /* Confidence room card in matches empty state */
        .confidence-matches-card {
          position: relative;
          display: block;
          text-decoration: none;
          border-radius: var(--radius);
          border: 1px solid rgba(244,114,182,0.28);
          background: linear-gradient(135deg, rgba(30,8,55,0.95) 0%, rgba(14,4,32,0.98) 100%);
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .confidence-matches-card:hover {
          border-color: rgba(244,114,182,0.55);
          box-shadow: 0 0 28px rgba(244,114,182,0.2);
        }
        .confidence-matches-glow {
          position: absolute; top: -50px; right: -30px;
          width: 200px; height: 200px; border-radius: 50%;
          background: radial-gradient(circle, rgba(244,114,182,0.18) 0%, transparent 65%);
          pointer-events: none;
        }
        .confidence-matches-inner {
          display: flex; align-items: center; gap: 0.85rem;
          padding: 1.1rem 1.25rem;
          position: relative; z-index: 1; flex-wrap: wrap;
        }
        .confidence-matches-emoji { font-size: 1.8rem; flex-shrink: 0; }
        .confidence-matches-text {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; gap: 0.15rem;
        }
        .confidence-matches-text strong {
          font-size: 0.92rem; font-weight: 800; color: var(--text);
        }
        .confidence-matches-text span {
          font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;
        }
        .confidence-matches-cta {
          font-size: 0.82rem; font-weight: 800; color: #f472b6;
          white-space: nowrap; padding: 0.35rem 0.9rem;
          border-radius: 999px;
          border: 1px solid rgba(244,114,182,0.4);
          background: rgba(244,114,182,0.1);
          transition: all 0.18s;
        }
        .confidence-matches-card:hover .confidence-matches-cta {
          background: rgba(244,114,182,0.2);
          box-shadow: 0 0 12px rgba(244,114,182,0.3);
        }

        @media (max-width: 720px) {
          .likes-hero {
            flex-direction: column;
            border-radius: 26px;
          }
          .likes-counter-panel {
            min-width: 0;
            align-self: stretch;
          }
          .likes-tabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .likes-tab {
            justify-content: center;
            padding-inline: 0.65rem;
          }
          .matches-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem;
          }
          .match-card {
            border-radius: 22px;
            padding: 0.45rem;
          }
          .match-photo-wrap,
          .match-photo-img,
          .match-photo-placeholder {
            min-height: 245px;
          }
          .match-photo-info {
            padding: 0.8rem;
          }
          .match-name {
            font-size: 1rem;
          }
          .match-actions {
            padding-inline: 0.2rem;
          }
          .match-action-btn,
          .match-call-btn {
            font-size: 0.74rem;
            padding: 0.56rem 0.45rem;
          }
        }

        @media (max-width: 420px) {
          .matches-grid {
            grid-template-columns: 1fr;
          }
          .match-photo-wrap,
          .match-photo-img,
          .match-photo-placeholder {
            min-height: 330px;
          }
          .likes-tabs {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .likes-hero,
          .match-card,
          .match-call-btn {
            animation: none;
            transition: none;
          }
          .match-card:hover,
          .likes-tab:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
