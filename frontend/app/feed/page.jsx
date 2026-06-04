"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken, setToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const FEED_TIMEOUT_MS = 15000;
const TOKEN_TIMEOUT_MS = 12000;
const PASS_LOCK_MS = 260;

const findFirstNonEmptyString = (...values) =>
  values.find((value) => typeof value === "string" && value.trim());

function normalizeImageUrl(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return "";
  return trimmed;
}

function getProfileImage(profile) {
  const photos = [
    ...(Array.isArray(profile?.photos) ? profile.photos : []),
    ...(Array.isArray(profile?.profilePhotos) ? profile.profilePhotos : []),
    profile?.profileImage,
    profile?.photo,
    profile?.avatar,
    profile?.image,
  ];
  return photos.map(normalizeImageUrl).find(Boolean) || "";
}

function getProfileName(profile) {
  return findFirstNonEmptyString(profile?.displayName, profile?.name, profile?.username, profile?.email) || "MeetYouLive";
}

function getProfileId(profile) {
  return profile?._id ? String(profile._id) : "";
}

function getProfileAge(profile) {
  if (profile?.age) return profile.age;
  if (!profile?.birthdate && !profile?.dateOfBirth) return "";
  const date = new Date(profile.birthdate || profile.dateOfBirth);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  return age > 0 ? age : "";
}

function getProfileInterests(profile) {
  const values = Array.isArray(profile?.interests)
    ? profile.interests
    : Array.isArray(profile?.tags)
      ? profile.tags
      : [];
  return values.filter(Boolean).slice(0, 4);
}

async function fetchBackendToken(signal) {
  const response = await fetch("/api/auth/backend-token", {
    method: "POST",
    cache: "no-store",
    signal,
  });

  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return {
    token: data?.token || "",
    userId: data?.user?.id ? String(data.user.id) : "",
  };
}

export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [profiles, setProfiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionPending, setIsActionPending] = useState(false);
  const [error, setError] = useState(null);

  const authTokenRef = useRef(null);
  const currentUserIdRef = useRef("");
  const bootStartedRef = useRef(false);
  const actionPendingRef = useRef(false);
  const passUnlockTimeoutRef = useRef(null);
  const feedControllerRef = useRef(null);
  const tokenControllerRef = useRef(null);

  const translateWithFallback = useCallback(
    (key, fallback) => {
      const translated = t?.(key);
      return translated && translated !== key ? translated : fallback;
    },
    [t]
  );

  const setDeck = useCallback((nextProfiles, nextIndex = 0) => {
    const safeProfiles = Array.isArray(nextProfiles) ? nextProfiles : [];
    const safeIndex = Math.min(Math.max(nextIndex, 0), safeProfiles.length);
    setProfiles(safeProfiles);
    setCurrentIndex(safeIndex);
    setCurrentProfile(safeProfiles[safeIndex] || null);
  }, []);

  const setActionLock = useCallback((locked) => {
    actionPendingRef.current = locked;
    setIsActionPending(locked);
  }, []);

  const loadFeed = useCallback(
    async (token) => {
      if (!API_URL) {
        setDeck([], 0);
        setError(translateWithFallback("feed.genericError", "No pudimos cargar tu feed. Por favor, intenta de nuevo."));
        setIsLoading(false);
        return;
      }

      feedControllerRef.current?.abort();
      const controller = new AbortController();
      feedControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/api/feed`, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error(translateWithFallback("feed.sessionExpired", "Sesión expirada. Por favor, inicia sesión de nuevo."));
          }
          if (response.status >= 500) {
            throw new Error(translateWithFallback("feed.serverError", "Error del servidor. Por favor, intenta de nuevo."));
          }
          throw new Error(translateWithFallback("feed.genericError", "No pudimos cargar tu feed. Por favor, intenta de nuevo."));
        }

        const data = await response.json();
        const currentUserId = currentUserIdRef.current;
        const uniqueProfiles = Array.from(
          new Map(
            (data?.recommendedProfiles || [])
              .filter((profile) => {
                const profileId = getProfileId(profile);
                return profileId && (!currentUserId || profileId !== currentUserId);
              })
              .map((profile) => [getProfileId(profile), profile])
          ).values()
        );

        setDeck(uniqueProfiles, 0);
      } catch (err) {
        if (err.name === "AbortError") {
          setError(translateWithFallback("feed.serverStarting", "El servidor está iniciando. Esto puede tomar unos segundos."));
        } else {
          setError(err.message || translateWithFallback("feed.genericError", "No pudimos cargar tu feed. Por favor, intenta de nuevo."));
        }
        setDeck([], 0);
      } finally {
        clearTimeout(timeoutId);
        if (feedControllerRef.current === controller) {
          feedControllerRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [setDeck, translateWithFallback]
  );

  useEffect(() => {
    return () => {
      feedControllerRef.current?.abort();
      tokenControllerRef.current?.abort();
      if (passUnlockTimeoutRef.current) clearTimeout(passUnlockTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (bootStartedRef.current || status === "loading") return;

    if (status === "unauthenticated" && !getToken()) {
      setIsLoading(false);
      router.replace("/login?callbackUrl=/feed");
      return;
    }

    bootStartedRef.current = true;

    const start = async () => {
      let token = session?.backendToken || getToken();
      let currentUserId = session?.backendUserId || session?.user?.id || "";

      if (status === "authenticated" && (!token || !currentUserId)) {
        const hadToken = Boolean(token);
        const controller = new AbortController();
        tokenControllerRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
        try {
          const backendSession = await fetchBackendToken(controller.signal);
          token = backendSession?.token || token;
          currentUserId = backendSession?.userId || currentUserId;
        } catch (err) {
          if (!hadToken && err.name !== "AbortError") token = null;
        } finally {
          clearTimeout(timeoutId);
          if (tokenControllerRef.current === controller) {
            tokenControllerRef.current = null;
          }
        }
      }

      if (!token) {
        setDeck([], 0);
        setError(translateWithFallback("feed.sessionExpired", "Sesión expirada. Por favor, inicia sesión de nuevo."));
        setIsLoading(false);
        return;
      }

      authTokenRef.current = token;
      currentUserIdRef.current = currentUserId ? String(currentUserId) : "";
      setToken(token);
      await loadFeed(token);
    };

    start();
  }, [loadFeed, router, session?.backendToken, session?.backendUserId, session?.user?.id, setDeck, status, translateWithFallback]);

  const advanceOneProfile = useCallback(() => {
    setDeck(profiles, currentIndex + 1);
  }, [currentIndex, profiles, setDeck]);

  const unlockActionsAfterDelay = useCallback(() => {
    if (passUnlockTimeoutRef.current) clearTimeout(passUnlockTimeoutRef.current);
    passUnlockTimeoutRef.current = setTimeout(() => {
      setActionLock(false);
      passUnlockTimeoutRef.current = null;
    }, PASS_LOCK_MS);
  }, [setActionLock]);

  const handlePass = useCallback(() => {
    if (!currentProfile || actionPendingRef.current) return;
    setActionLock(true);
    advanceOneProfile();
    unlockActionsAfterDelay();
  }, [advanceOneProfile, currentProfile, setActionLock, unlockActionsAfterDelay]);

  const handleLike = useCallback(async () => {
    if (!currentProfile || actionPendingRef.current) return;

    const currentUserId = currentUserIdRef.current;
    if (currentUserId && getProfileId(currentProfile) === currentUserId) {
      advanceOneProfile();
      return;
    }

    const token = authTokenRef.current;
    if (!API_URL || !token) {
      setError(translateWithFallback("feed.sessionExpired", "Sesión expirada. Por favor, inicia sesión de nuevo."));
      return;
    }

    setActionLock(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/matches/like/${currentProfile._id}`, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(translateWithFallback("feed.likeError", "No pudimos registrar tu me gusta. Intenta de nuevo."));
      }

      advanceOneProfile();
    } catch (err) {
      setError(err.message || translateWithFallback("feed.likeError", "No pudimos registrar tu me gusta. Intenta de nuevo."));
    } finally {
      setActionLock(false);
    }
  }, [advanceOneProfile, currentProfile, setActionLock, translateWithFallback]);

  const retryFeed = useCallback(() => {
    if (!authTokenRef.current || isLoading) return;
    loadFeed(authTokenRef.current);
  }, [isLoading, loadFeed]);

  const hasProfile = !!currentProfile;
  const cardClassName = `feed-card${hasProfile ? "" : " feed-card--state"}`;

  return (
    <main className="feed-page">
      <header className="feed-header">
        <Link href="/feed" className="feed-brand" aria-label="MeetYouLive">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="feed-logo" />
        </Link>
      </header>

      <section className="feed-stage" aria-label={translateWithFallback("feed.recommendedProfilesAria", "Perfiles recomendados")}>
        <article className={cardClassName} aria-busy={isLoading || isActionPending}>
          {isLoading ? (
            <FeedState title="Cargando tu feed" message="Buscando perfiles para ti..." />
          ) : error && !hasProfile ? (
            <FeedState title="No pudimos cargar tu feed" message={error} onRetry={retryFeed} />
          ) : hasProfile ? (
            <ProfileCard
              profile={currentProfile}
              disabled={isActionPending}
              error={error}
              onPass={handlePass}
              onLike={handleLike}
              labels={{
                pass: translateWithFallback("feed.dislikeLabel", "No me gusta"),
                like: translateWithFallback("feed.likeLabel", "Me gusta"),
              }}
            />
          ) : (
            <FeedState title="No hay más perfiles" message="Vuelve más tarde para descubrir nuevas personas." onRetry={retryFeed} />
          )}
        </article>
      </section>

      <style jsx>{`
        .feed-page {
          --feed-bg: #0f0821;
          --feed-card-width: min(94vw, 430px);
          --feed-card-height: clamp(540px, 78svh, 720px);
          min-height: 100svh;
          padding-bottom: calc(76px + env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at 50% 0%, rgba(224, 64, 251, 0.16), transparent 34%),
            var(--feed-bg);
          color: #fff;
          overflow-x: hidden;
        }

        .feed-header {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          justify-content: center;
          padding: calc(0.45rem + env(safe-area-inset-top)) 1rem 0.45rem;
          background: rgba(15, 8, 33, 0.9);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .feed-brand,
        .feed-logo {
          display: block;
        }

        .feed-logo {
          width: clamp(52px, 14vw, 72px);
          height: clamp(52px, 14vw, 72px);
          object-fit: contain;
        }

        .feed-stage {
          display: grid;
          place-items: start center;
          min-height: calc(100svh - 84px - 76px - env(safe-area-inset-bottom));
          padding: 0.75rem 0 0;
          box-sizing: border-box;
        }

        .feed-card {
          position: relative;
          width: var(--feed-card-width);
          height: var(--feed-card-height);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(31, 20, 66, 0.98), rgba(15, 8, 33, 0.99));
          box-shadow: 0 24px 58px rgba(0, 0, 0, 0.36);
          contain: layout paint;
        }

        .feed-card--state {
          display: grid;
          place-items: center;
        }

        @media (max-width: 380px) {
          .feed-page {
            --feed-card-width: min(96vw, 430px);
            --feed-card-height: clamp(520px, 76svh, 680px);
          }
        }

        @media (min-width: 700px) {
          .feed-page {
            --feed-card-height: clamp(600px, 74svh, 740px);
          }
        }
      `}</style>
    </main>
  );
}

function FeedState({ title, message, onRetry }) {
  return (
    <div className="feed-state" role="status" aria-live="polite">
      <div className="feed-state-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
        </svg>
      </div>
      <h1>{title}</h1>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="feed-state-button" onClick={onRetry}>
          Intentar de nuevo
        </button>
      )}

      <style jsx>{`
        .feed-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.85rem;
          width: 100%;
          height: 100%;
          padding: 2rem;
          box-sizing: border-box;
          text-align: center;
          color: #d8d2ef;
        }

        .feed-state-mark {
          display: grid;
          place-items: center;
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff4fa3, #8b5cf6);
          color: #fff;
          box-shadow: 0 18px 44px rgba(224, 64, 251, 0.32);
        }

        .feed-state-mark svg {
          width: 34px;
          height: 34px;
          fill: currentColor;
        }

        .feed-state h1 {
          margin: 0;
          color: #fff;
          font-size: clamp(1.35rem, 6vw, 1.85rem);
          line-height: 1.1;
        }

        .feed-state p {
          max-width: 320px;
          margin: 0;
          font-size: 0.98rem;
          line-height: 1.45;
        }

        .feed-state-button {
          margin-top: 0.4rem;
          border: 0;
          border-radius: 999px;
          padding: 0.85rem 1.35rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

function ProfileCard({ profile, disabled, error, labels, onPass, onLike }) {
  const image = getProfileImage(profile);
  const name = getProfileName(profile);
  const age = getProfileAge(profile);
  const location = findFirstNonEmptyString(profile?.location, profile?.city, profile?.country);
  const interests = getProfileInterests(profile);
  const fallbackInitial = name.trim()[0]?.toUpperCase() || "M";

  return (
    <>
      <div className="profile-photo">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name} draggable="false" />
        ) : (
          <div className="profile-photo-fallback" aria-hidden="true">{fallbackInitial}</div>
        )}
      </div>

      <div className="profile-scrim" />

      <div className="profile-info">
        <div>
          <h1>
            {name}
            {age ? <span>{age}</span> : null}
          </h1>
          {location ? <p className="profile-location">{location}</p> : null}
        </div>

        {interests.length > 0 ? (
          <div className="profile-tags">
            {interests.map((interest) => (
              <span key={interest}>{interest}</span>
            ))}
          </div>
        ) : null}

        {error ? <p className="profile-error" role="alert">{error}</p> : null}
      </div>

      <div className="profile-actions" aria-label="Acciones del perfil">
        <button type="button" className="profile-action profile-action--pass" disabled={disabled} onClick={onPass}>
          <strong>✕</strong>
          <span>{labels.pass}</span>
        </button>
        <button type="button" className="profile-action profile-action--like" disabled={disabled} onClick={onLike}>
          <strong>♥</strong>
          <span>{labels.like}</span>
        </button>
      </div>

      <style jsx>{`
        .profile-photo,
        .profile-photo img,
        .profile-photo-fallback,
        .profile-scrim {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .profile-photo img {
          object-fit: cover;
          user-select: none;
        }

        .profile-photo-fallback {
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at 30% 20%, rgba(34, 211, 238, 0.32), transparent 34%),
            linear-gradient(135deg, #8b5cf6, #e040fb 52%, #ff4fa3);
          color: rgba(255, 255, 255, 0.9);
          font-size: clamp(5rem, 28vw, 9rem);
          font-weight: 900;
        }

        .profile-scrim {
          background:
            linear-gradient(180deg, transparent 38%, rgba(15, 8, 33, 0.38) 58%, rgba(15, 8, 33, 0.96) 100%),
            linear-gradient(0deg, rgba(0, 0, 0, 0.2), transparent 55%);
        }

        .profile-info {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 116px;
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          padding: 0 1.25rem;
        }

        .profile-info h1 {
          display: flex;
          align-items: baseline;
          gap: 0.55rem;
          margin: 0;
          font-size: clamp(2rem, 10vw, 3rem);
          line-height: 0.95;
          letter-spacing: -0.05em;
          text-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
        }

        .profile-info h1 span {
          font-size: 0.7em;
          font-weight: 700;
          letter-spacing: -0.03em;
        }

        .profile-location {
          margin: 0.35rem 0 0;
          color: #ebe7ff;
          font-size: 1rem;
          font-weight: 700;
          text-shadow: 0 3px 14px rgba(0, 0, 0, 0.45);
        }

        .profile-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        .profile-tags span {
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 999px;
          padding: 0.42rem 0.68rem;
          background: rgba(15, 8, 33, 0.5);
          color: #fff;
          font-size: 0.78rem;
          font-weight: 800;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .profile-error {
          margin: 0;
          border-radius: 16px;
          padding: 0.7rem 0.85rem;
          background: rgba(255, 79, 163, 0.16);
          color: #ffd7ea;
          font-size: 0.88rem;
          font-weight: 700;
        }

        .profile-actions {
          position: absolute;
          left: 50%;
          bottom: calc(18px + env(safe-area-inset-bottom));
          z-index: 3;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.85rem;
          width: min(88%, 340px);
          transform: translateX(-50%);
        }

        .profile-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 64px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 999px;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 18px 38px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          transition: transform 0.16s ease, opacity 0.16s ease;
        }

        .profile-action strong {
          font-size: 1.45rem;
          line-height: 1;
        }

        .profile-action span {
          font-size: 0.86rem;
        }

        .profile-action:disabled {
          cursor: default;
          opacity: 0.52;
        }

        .profile-action:not(:disabled):active {
          transform: scale(0.95);
        }

        .profile-action--pass {
          background: rgba(21, 17, 33, 0.84);
        }

        .profile-action--like {
          background: linear-gradient(135deg, rgba(255, 79, 163, 0.96), rgba(224, 64, 251, 0.94));
        }
      `}</style>
    </>
  );
}
