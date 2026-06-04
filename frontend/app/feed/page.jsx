"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchUserRole, getToken, setToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SwipeCard = dynamic(() => import("@/components/SwipeCard"), { ssr: false });

// Hard ceiling on how long we wait for the NextAuth session / backend token
// to hydrate before surfacing a friendly fallback. Prevents the page from
// sitting on a spinner indefinitely on slow connections or Render cold starts.
// This is longer than the backend-token request timeout so recovery can settle.
const INIT_TIMEOUT_MS = 30000;
const BACKEND_TOKEN_FETCH_TIMEOUT_MS = 22000;
const SWIPE_LOCK_TIMEOUT_MS = 1400;

// Hard ceiling for the feed API request itself.
const FETCH_TIMEOUT_MS = 15000;

const FEED_CACHE_KEY = "meetyoulive:feed:v1";
const FEED_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const FEED_DEBUG_PREFIX = "[feed-refresh-debug]";

function getProfileId(profile) {
  const profileId = profile?._id || profile?.id;
  return profileId ? String(profileId) : "";
}

function summarizeProfiles(profiles) {
  return {
    count: profiles.length,
    ids: profiles.map(getProfileId).filter(Boolean),
  };
}

function getCurrentProfileId(profiles, currentIndex) {
  return getProfileId(profiles[currentIndex]);
}

function debugFeed(message, details = {}) {
  console.info(`${FEED_DEBUG_PREFIX} ${message}`, details);
}

function readCachedFeed() {
  if (typeof window === "undefined") return { profiles: [], currentIndex: 0, hasCache: false };

  try {
    const raw = window.sessionStorage.getItem(FEED_CACHE_KEY);
    debugFeed("sessionStorage read", { key: FEED_CACHE_KEY, hasValue: Boolean(raw) });
    if (!raw) return { profiles: [], currentIndex: 0, hasCache: false };

    const parsed = JSON.parse(raw);
    const cachedProfiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
    const cachedIndex = Number.isInteger(parsed?.currentIndex) ? parsed.currentIndex : 0;
    const timestamp = Number(parsed?.timestamp) || 0;

    if (!cachedProfiles.length || Date.now() - timestamp > FEED_CACHE_MAX_AGE_MS) {
      window.sessionStorage.removeItem(FEED_CACHE_KEY);
      debugFeed("sessionStorage removed", {
        key: FEED_CACHE_KEY,
        reason: cachedProfiles.length ? "expired" : "empty",
        currentIndex: cachedIndex,
        ...summarizeProfiles(cachedProfiles),
      });
      return { profiles: [], currentIndex: 0, hasCache: false };
    }

    const currentIndex = Math.min(Math.max(cachedIndex, 0), cachedProfiles.length);
    debugFeed("sessionStorage cache accepted", {
      key: FEED_CACHE_KEY,
      currentIndex,
      currentProfileId: getCurrentProfileId(cachedProfiles, currentIndex),
      ...summarizeProfiles(cachedProfiles),
    });
    return {
      profiles: cachedProfiles,
      currentIndex,
      hasCache: true,
    };
  } catch (err) {
    debugFeed("sessionStorage read failed", { key: FEED_CACHE_KEY, error: err.message });
    return { profiles: [], currentIndex: 0, hasCache: false };
  }
}

function writeCachedFeed(profiles, currentIndex) {
  if (typeof window === "undefined") return;

  try {
    if (!profiles.length) {
      window.sessionStorage.removeItem(FEED_CACHE_KEY);
      debugFeed("sessionStorage removed", { key: FEED_CACHE_KEY, reason: "empty-write" });
      return;
    }

    window.sessionStorage.setItem(
      FEED_CACHE_KEY,
      JSON.stringify({ profiles, currentIndex, timestamp: Date.now() })
    );
    debugFeed("sessionStorage written", {
      key: FEED_CACHE_KEY,
      currentIndex,
      currentProfileId: getCurrentProfileId(profiles, currentIndex),
      ...summarizeProfiles(profiles),
    });
  } catch (err) {
    debugFeed("sessionStorage write failed", { key: FEED_CACHE_KEY, error: err.message });
  }
}

async function requestBackendToken(signal) {
  try {
    const response = await fetch("/api/auth/backend-token", {
      method: "POST",
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return { token: null, status: response.status };
    }

    try {
      const data = await response.json();
      return {
        token: data?.token || null,
        userId: data?.user?.id ? String(data.user.id) : "",
        status: response.status,
      };
    } catch {
      return { token: null, userId: "", status: response.status };
    }
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return { token: null, userId: "", status: 0 };
  }
}

/* ------------------------ Inline SVG icon set ------------------------ */
const IconAlert = (props) => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconX = (props) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const IconHeart = (props) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
  </svg>
);

const IconStar = (props) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="m12 2.7 2.86 5.8 6.4.93-4.63 4.52 1.1 6.38L12 17.32l-5.73 3.01 1.1-6.38-4.63-4.52 6.4-.93L12 2.7Z" />
  </svg>
);

/* --------------------------- Feed page --------------------------- */
export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [profiles, setProfiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasVisualCache, setHasVisualCache] = useState(false);
  const [error, setError] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [actionSignal, setActionSignal] = useState({ id: 0, direction: null, profileId: null });
  const [swipeLocked, setSwipeLocked] = useState(false);
  const tokenRecoveryAttemptedRef = useRef(false);
  const swipeUnlockTimeoutRef = useRef(null);
  const profilesRef = useRef([]);
  const currentIndexRef = useRef(0);
  const hasVisualCacheRef = useRef(false);
  const likeInFlightRef = useRef(false);
  const requestedActionRef = useRef(false);
  const activeActionRef = useRef(false);
  const pendingActionProfileIdRef = useRef(null);
  const swipeLockedRef = useRef(false);
  const feedMutationVersionRef = useRef(0);
  const deckRef = useRef(null);
  const currentUserIdRef = useRef("");

  // Redirect unauthenticated users to login (preserving callbackUrl=/feed so
  // they come back here after sign-in; authenticated refresh always stays on
  // /feed and never bounces to an alternate layout).
  useEffect(() => {
    if (status === "unauthenticated" && !getToken()) {
      router.replace("/login?callbackUrl=/feed");
    }
  }, [status, router]);

  useEffect(() => {
    return () => {
      if (swipeUnlockTimeoutRef.current) {
        clearTimeout(swipeUnlockTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const cachedFeed = readCachedFeed();
    if (!cachedFeed.hasCache) return;

    debugFeed("applying cached feed before network refresh", {
      currentIndex: cachedFeed.currentIndex,
      currentProfileId: getCurrentProfileId(cachedFeed.profiles, cachedFeed.currentIndex),
      ...summarizeProfiles(cachedFeed.profiles),
    });
    profilesRef.current = cachedFeed.profiles;
    currentIndexRef.current = cachedFeed.currentIndex;
    hasVisualCacheRef.current = true;
    setProfiles(cachedFeed.profiles);
    setCurrentIndex(cachedFeed.currentIndex);
    setLoading(false);
    setHasVisualCache(true);
  }, []);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    const currentUserId = session?.backendUserId || session?.user?.id || "";
    currentUserIdRef.current = currentUserId ? String(currentUserId) : "";
  }, [session?.backendUserId, session?.user?.id]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    hasVisualCacheRef.current = hasVisualCache;
  }, [hasVisualCache]);

  // Admins shouldn't see the consumer feed.
  useEffect(() => {
    if (!authToken) return;
    let mounted = true;
    fetchUserRole(authToken)
      .then((u) => {
        if (mounted && u?.role === "admin") router.replace("/admin");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [authToken, router]);

  // Resolve a usable backend JWT for refresh and SPA navigation paths. On hard
  // refresh, NextAuth can be authenticated before session.backendToken is
  // available, so recover it through the server-side proxy or fall back to the
  // locally persisted backend token.
  useEffect(() => {
    let cancelled = false;
    let timeoutId;
    let controller;

    const localToken = getToken();
    const sessionCurrentUserId = session?.backendUserId || session?.user?.id || "";
    if (sessionCurrentUserId) {
      currentUserIdRef.current = String(sessionCurrentUserId);
    }

    if (session?.backendToken) {
      setToken(session.backendToken);
      setAuthToken(session.backendToken);
      setError(null);
      return undefined;
    }

    if (status === "loading") return undefined;

    if (
      localToken &&
      (status !== "authenticated" || currentUserIdRef.current || !session?.googleEmail)
    ) {
      setAuthToken(localToken);
      return undefined;
    }

    if (status === "unauthenticated") {
      setLoading(false);
      return undefined;
    }

    if (status !== "authenticated") return undefined;

    if (!session?.googleEmail) {
      setError(t("feed.genericError"));
      setLoading(false);
      return undefined;
    }

    if (tokenRecoveryAttemptedRef.current) return undefined;
    tokenRecoveryAttemptedRef.current = true;
    setLoading(true);
    setError(null);

    controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), BACKEND_TOKEN_FETCH_TIMEOUT_MS);

    (async () => {
      try {
        const {
          token: recoveredToken,
          userId: recoveredUserId,
          status: recoveryStatus,
        } = await requestBackendToken(controller.signal);

        if (cancelled) return;

        if (recoveredToken) {
          setToken(recoveredToken);
          currentUserIdRef.current = recoveredUserId || currentUserIdRef.current;
          setAuthToken(recoveredToken);
          setError(null);
          return;
        }

        if (localToken) {
          currentUserIdRef.current = recoveredUserId || currentUserIdRef.current;
          setAuthToken(localToken);
          setError(null);
          return;
        }

        let message = t("feed.genericError");
        if (recoveryStatus === 401 || recoveryStatus === 403) {
          message = t("feed.sessionExpired");
        } else if (recoveryStatus === 0) {
          message = t("feed.networkError");
        } else if (recoveryStatus >= 500) {
          message = t("feed.serverStarting");
        }
        setError(message);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err.name === "AbortError") {
          setError(t("feed.serverStarting"));
        } else {
          setError(t("feed.genericError"));
        }
        setLoading(false);
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [status, session?.backendToken, session?.backendUserId, session?.googleEmail, session?.user?.id, t]);

  // Safety net: never sit on the loading spinner forever waiting for the
  // session/token to hydrate.
  useEffect(() => {
    if (authToken) return;
    if (status === "unauthenticated") return;
    const timer = setTimeout(() => {
      setLoading(false);
      setError(
        (t && t("feed.serverStarting")) ||
          "El servidor está tardando en responder. Por favor, intenta de nuevo."
      );
    }, INIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, authToken, t]);

  const loadFeed = useCallback(async ({ signal, silent = false } = {}) => {
    const mutationVersionAtStart = feedMutationVersionRef.current;
    const profilesBeforeRefresh = profilesRef.current;
    const indexBeforeRefresh = currentIndexRef.current;
    const profileIdBeforeRefresh = getCurrentProfileId(profilesBeforeRefresh, indexBeforeRefresh);

    debugFeed("loadFeed() start", {
      silent,
      currentIndex: indexBeforeRefresh,
      currentProfileIdBefore: profileIdBeforeRefresh,
      profileCountBefore: profilesBeforeRefresh.length,
      hasVisualCache: hasVisualCacheRef.current,
    });

    if (!authToken) {
      debugFeed("loadFeed() skipped", { reason: "missing-auth-token" });
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError(null);

    if (!API_URL) {
      debugFeed("loadFeed() failed before request", { reason: "missing-api-url" });
      setError(t("feed.genericError"));
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestSignal = controller.signal;
    const abortFromParent = () => controller.abort();
    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener("abort", abortFromParent, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const feedRes = await fetch(`${API_URL}/api/feed`, {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: requestSignal,
        cache: "no-store",
      });

      if (!feedRes.ok) {
        if (
          (feedRes.status === 401 || feedRes.status === 403) &&
          status === "authenticated" &&
          session?.googleEmail
        ) {
          let recoveredToken = null;
          try {
            const recoveredSession = await requestBackendToken(requestSignal);
            recoveredToken = recoveredSession.token;
            currentUserIdRef.current = recoveredSession.userId || currentUserIdRef.current;
          } catch (err) {
            if (err.name === "AbortError") throw err;
          }
          // Only restart the feed request when the proxy gives us a different token;
          // if it matches, the 401/403 is not caused by a stale localStorage token.
          if (recoveredToken && recoveredToken !== authToken) {
            setToken(recoveredToken);
            setAuthToken(recoveredToken);
            return;
          }
        }

        let msg = t("feed.genericError");
        if (feedRes.status === 401 || feedRes.status === 403) {
          msg = t("feed.sessionExpired");
        } else if (feedRes.status >= 500) {
          msg = t("feed.serverError");
        }
        throw new Error(msg);
      }

      const data = await feedRes.json();
      const currentUserId = currentUserIdRef.current;
      const profileEntries = (data?.recommendedProfiles || []).reduce((entries, profile) => {
        const profileId = getProfileId(profile);
        if (profileId && currentUserId && profileId !== currentUserId) {
          entries.push([profileId, profile]);
        }
        return entries;
      }, []);
      const uniqueProfiles = Array.from(
        new Map(profileEntries).values()
      );

      debugFeed("profiles received", {
        currentIndexBefore: indexBeforeRefresh,
        currentProfileIdBefore: profileIdBeforeRefresh,
        ...summarizeProfiles(uniqueProfiles),
      });

      let nextProfiles = uniqueProfiles;
      let nextIndex = 0;
      if (silent && profileIdBeforeRefresh) {
        const matchingIndex = uniqueProfiles.findIndex(
          (profile) => getProfileId(profile) === profileIdBeforeRefresh
        );
        if (matchingIndex >= 0) {
          nextIndex = matchingIndex;
        } else {
          const currentProfile = profilesBeforeRefresh[indexBeforeRefresh];
          nextProfiles = currentProfile && currentUserId && getProfileId(currentProfile) !== currentUserId
            ? [
                currentProfile,
                ...uniqueProfiles.filter((profile) => getProfileId(profile) !== profileIdBeforeRefresh),
              ]
            : uniqueProfiles;
          nextIndex = 0;
        }
      }

      debugFeed("loadFeed() applying profiles", {
        silent,
        currentIndexBefore: indexBeforeRefresh,
        currentProfileIdBefore: profileIdBeforeRefresh,
        currentIndexAfter: nextIndex,
        currentProfileIdAfter: getCurrentProfileId(nextProfiles, nextIndex),
        preservedCurrentProfile: Boolean(
          profileIdBeforeRefresh &&
            getCurrentProfileId(nextProfiles, nextIndex) === profileIdBeforeRefresh
        ),
      });

      if (mutationVersionAtStart !== feedMutationVersionRef.current) {
        debugFeed("loadFeed() skipped stale response", {
          silent,
          mutationVersionAtStart,
          mutationVersionNow: feedMutationVersionRef.current,
          currentProfileIdBefore: profileIdBeforeRefresh,
        });
        return;
      }

      currentIndexRef.current = nextIndex;
      profilesRef.current = nextProfiles;
      setCurrentIndex(nextIndex);
      setProfiles(nextProfiles);
      hasVisualCacheRef.current = false;
      setHasVisualCache(false);
      writeCachedFeed(nextProfiles, nextIndex);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      if (err.name === "AbortError") {
        setError(t("feed.serverStarting"));
      } else {
        setError(err.message || t("feed.genericError"));
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromParent);
      if (!signal?.aborted) setLoading(false);
    }
  }, [authToken, session?.googleEmail, status, t]);

  // Fetch feed data once a backend token is ready. Do not depend on
  // hasVisualCache: loadFeed clears that flag after a silent refresh, and
  // re-running here would reset the visible profile on mobile refresh.
  useEffect(() => {
    if (!authToken) return undefined;
    const controller = new AbortController();
    loadFeed({ signal: controller.signal, silent: hasVisualCacheRef.current });
    return () => {
      controller.abort();
    };
  }, [authToken, loadFeed]);

  const visibleProfileStack = [];
  for (let i = Math.min(currentIndex + 2, profiles.length - 1); i >= currentIndex; i -= 1) {
    visibleProfileStack.push({ profile: profiles[i], stackIndex: i - currentIndex });
  }

  /* --------------------------- Actions --------------------------- */
  const unlockSwipe = () => {
    if (swipeUnlockTimeoutRef.current) {
      clearTimeout(swipeUnlockTimeoutRef.current);
      swipeUnlockTimeoutRef.current = null;
    }
    swipeLockedRef.current = false;
    requestedActionRef.current = false;
    activeActionRef.current = false;
    pendingActionProfileIdRef.current = null;
    setSwipeLocked(false);
  };

  const unlockTimedOutSwipe = () => {
    swipeUnlockTimeoutRef.current = null;
    // Keep the lock while the deck is mutating or the action API is still pending;
    // only release request-time locks where SwipeCard never reports an onSwipe.
    if (activeActionRef.current || likeInFlightRef.current) return;
    unlockSwipe();
  };

  const advance = (profileId) => {
    const activeProfiles = profilesRef.current;
    const activeIndex = currentIndexRef.current;
    const activeProfileId = getCurrentProfileId(activeProfiles, activeIndex);
    if (profileId && activeProfileId !== profileId) {
      debugFeed("nextProfile() ignored", {
        reason: "stale-profile",
        requestedProfileId: profileId,
        currentIndex: activeIndex,
        currentProfileId: activeProfileId,
      });
      unlockSwipe();
      return false;
    }

    const nextIndex = activeIndex + 1;
    debugFeed("nextProfile() called", {
      currentIndexBefore: activeIndex,
      currentProfileIdBefore: activeProfileId,
      currentIndexAfter: nextIndex,
      currentProfileIdAfter: getCurrentProfileId(activeProfiles, nextIndex),
    });
    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);
    writeCachedFeed(activeProfiles, nextIndex);
    unlockSwipe();
    return true;
  };

  const handleSwipe = async (profileId, direction) => {
    const isLike = direction === "right" || direction === "up";
    const activeProfiles = profilesRef.current;
    const activeIndex = currentIndexRef.current;
    const activeProfileId = getCurrentProfileId(activeProfiles, activeIndex);
    debugFeed(`${isLike ? "handleLike" : "handleDislike"} called`, {
      profileId,
      direction,
      currentIndex: activeIndex,
      currentProfileId: activeProfileId,
    });

    if (activeActionRef.current || likeInFlightRef.current) {
      debugFeed("swipe ignored", {
        reason: activeActionRef.current ? "active-action" : "action-in-flight",
        profileId,
        direction,
        currentIndex: activeIndex,
        currentProfileId: activeProfileId,
      });
      return false;
    }

    if (!profileId || activeProfileId !== profileId) {
      debugFeed("swipe ignored", {
        reason: profileId ? "stale-profile" : "missing-profile-id",
        requestedProfileId: profileId,
        direction,
        currentIndex: activeIndex,
        currentProfileId: activeProfileId,
      });
      unlockSwipe();
      return false;
    }

    if (
      requestedActionRef.current &&
      pendingActionProfileIdRef.current &&
      pendingActionProfileIdRef.current !== profileId
    ) {
      debugFeed("swipe ignored", {
        reason: "different-requested-action",
        profileId,
        direction,
        currentIndex: activeIndex,
        currentProfileId: activeProfileId,
      });
      unlockSwipe();
      return false;
    }
    const isPendingActionForSameProfile =
      requestedActionRef.current && pendingActionProfileIdRef.current === profileId;
    if (!isPendingActionForSameProfile) {
      requestedActionRef.current = true;
      pendingActionProfileIdRef.current = profileId;
    }
    activeActionRef.current = true;
    swipeLockedRef.current = true;
    setSwipeLocked(true);
    feedMutationVersionRef.current += 1;

    if (currentUserIdRef.current && profileId === currentUserIdRef.current) {
      return true;
    }

    if (likeInFlightRef.current) {
      debugFeed("handleAction ignored", {
        reason: "action-in-flight",
        profileId,
        direction,
        currentIndex,
        currentProfileId: getCurrentProfileId(profiles, currentIndex),
      });
      return false;
    }

    likeInFlightRef.current = true;
    setError(null);

    try {
      if (!API_URL || !authToken) {
        throw new Error(t("feed.sessionExpired"));
      }

      const res = await fetch(`${API_URL}/api/matches/like/${encodeURIComponent(profileId)}`, {
        method: isLike ? "POST" : "DELETE",
        headers: { Authorization: "Bearer " + authToken },
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(isLike ? t("feed.likeError") : t("feed.passError"));
      }

      likeInFlightRef.current = false;
      return true;
    } catch (err) {
      console.error("Swipe action error:", err);
      likeInFlightRef.current = false;
      unlockSwipe();
      setError(err.message || (isLike ? t("feed.likeError") : t("feed.passError")));
      return false;
    }
  };

  const handleSwipeExitComplete = async (profileId) => {
    const advanced = advance(profileId);
    if (!advanced) return;
    if (currentIndexRef.current >= profilesRef.current.length) {
      await loadFeed({ silent: true });
    }
  };

  const requestSwipe = (direction) => {
    const activeProfiles = profilesRef.current;
    const activeIndex = currentIndexRef.current;
    const currentProfileId = getCurrentProfileId(activeProfiles, activeIndex);
    const isBusy =
      swipeLockedRef.current ||
      requestedActionRef.current ||
      activeActionRef.current ||
      likeInFlightRef.current;
    debugFeed("swipe action requested", {
      direction,
      ignored: !currentProfileId || isBusy,
      swipeLocked: swipeLockedRef.current,
      requestedAction: requestedActionRef.current,
      activeAction: activeActionRef.current,
      likeInFlight: likeInFlightRef.current,
      currentIndex: activeIndex,
      currentProfileId,
    });
    if (!currentProfileId || isBusy) return;
    swipeLockedRef.current = true;
    requestedActionRef.current = true;
    pendingActionProfileIdRef.current = currentProfileId;
    setSwipeLocked(true);
    if (swipeUnlockTimeoutRef.current) {
      clearTimeout(swipeUnlockTimeoutRef.current);
    }
    swipeUnlockTimeoutRef.current = setTimeout(unlockTimedOutSwipe, SWIPE_LOCK_TIMEOUT_MS);
    setActionSignal((signal) => ({ id: signal.id + 1, direction, profileId: currentProfileId }));
  };

  /* --------------------------- Render --------------------------- */
  const currentProfile = profiles[currentIndex];
  const hasMoreProfiles = currentIndex < profiles.length && !!currentProfile;
  const showLoadingState = !error && loading && !hasMoreProfiles;
  const showErrorState = error && !hasMoreProfiles;
  const showEmptyState = !hasMoreProfiles && !showLoadingState && !showErrorState;
  const activeCardError = hasMoreProfiles ? error : null;

  useEffect(() => {
    if (!hasMoreProfiles) return;
    const deck = deckRef.current;
    const card = deck?.querySelector(".swipe-card-modern");
    if (!deck || !card) return;

    const deckRect = deck.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    debugFeed("card size/class", {
      currentIndex,
      currentProfileId: getProfileId(currentProfile),
      deckClassName: deck.className,
      deckWidth: Math.round(deckRect.width),
      deckHeight: Math.round(deckRect.height),
      cardClassName: card.className,
      cardWidth: Math.round(cardRect.width),
      cardHeight: Math.round(cardRect.height),
    });
  }, [currentIndex, currentProfile, hasMoreProfiles, loading]);

  return (
    <div className="feed-page">
      {/* 1. APPROVED BRAND HEADER */}
      <FeedHeader />

      {/* 2. MODERN SWIPE DECK */}
      <section
        className={`feed-section feed-match-section${showEmptyState ? " feed-match-section--empty" : ""}`}
        aria-label={t("feed.recommendedProfilesAria")}
      >
        {showLoadingState ? (
          <div className="feed-swipe-deck feed-swipe-deck--state" role="status" aria-live="polite">
            <div className="feed-loading">
              <div className="spinner" />
              <p>{t("feed.loadingLabel")}</p>
            </div>
          </div>
        ) : showErrorState ? (
          <div className="feed-swipe-deck feed-swipe-deck--state" aria-live="assertive">
            <div className="feed-error">
              <IconAlert />
              <h3>No pudimos cargar tu feed</h3>
              <p>{error}</p>
              <button
                type="button"
                className="feed-retry-btn"
                onClick={() => loadFeed()}
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        ) : hasMoreProfiles ? (
          <div ref={deckRef} className="feed-swipe-deck" aria-live="polite" suppressHydrationWarning>
            {visibleProfileStack.map(({ profile, stackIndex }) => {
              const isTopCard = stackIndex === 0;
              return (
                <SwipeCard
                  key={profile._id}
                  profile={profile}
                  isActive={isTopCard}
                  onSwipe={isTopCard ? handleSwipe : undefined}
                  onExitComplete={isTopCard ? handleSwipeExitComplete : undefined}
                  actionSignal={isTopCard ? actionSignal : undefined}
                  disabled={isTopCard ? swipeLocked : true}
                  pending={isTopCard && swipeLocked && !activeCardError}
                  error={isTopCard ? activeCardError : null}
                  pendingLabel={t("feed.pendingAction")}
                  zIndex={30 - stackIndex}
                  style={{
                    y: stackIndex * 10,
                    scale: 1 - stackIndex * 0.035,
                    opacity: 1 - stackIndex * 0.12,
                    pointerEvents: isTopCard ? "auto" : "none",
                  }}
                />
              );
            })}

            <div className="feed-action-dock" aria-label={t("feed.actionDockAria")}>
              <button
                type="button"
                className="feed-action-btn feed-action-btn--pass"
                aria-label={t("feed.dislikeLabel")}
                disabled={swipeLocked}
                onClick={() => requestSwipe("left")}
              >
                <IconX />
                <span>{t("feed.dislikeLabel")}</span>
              </button>
              <button
                type="button"
                className="feed-action-btn feed-action-btn--super"
                aria-label={t("feed.superLikeLabel")}
                disabled={swipeLocked}
                onClick={() => requestSwipe("up")}
              >
                <IconStar />
                <span>{t("feed.superLikeShortLabel")}</span>
              </button>
              <button
                type="button"
                className="feed-action-btn feed-action-btn--like"
                aria-label={t("feed.likeLabel")}
                disabled={swipeLocked}
                onClick={() => requestSwipe("right")}
              >
                <IconHeart />
                <span>{t("feed.likeLabel")}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="feed-empty">
            <h3>That's everyone for now</h3>
            <p>Check back later for new people.</p>
            <Link href="/explore" className="feed-empty-btn">
              Explorar creadores
            </Link>
          </div>
        )}
      </section>

      {/* 3. Bottom nav is rendered by the root layout's BottomNavWrapper. */}

      <style jsx>{`
        .feed-page {
          --feed-safe-top: env(safe-area-inset-top);
          --feed-safe-bottom: env(safe-area-inset-bottom);
          --feed-header-logo-size: clamp(52px, 15vw, 76px);
          --feed-header-content-height: calc(var(--feed-header-logo-size) + 1rem);
          --feed-bottom-nav-content-height: 68px;
          --feed-section-top-padding: 6px;
          --feed-header-height: calc(var(--feed-header-content-height) + var(--feed-safe-top));
          --feed-bottom-nav-height: calc(var(--feed-bottom-nav-content-height) + var(--feed-safe-bottom));
          --feed-viewport-height: 100vh;
          --feed-available-height: calc(var(--feed-viewport-height) - var(--feed-header-height) - var(--feed-bottom-nav-height));
          /* Use a direct viewport-based deck height so refresh/address-bar changes cannot collapse the card to the global fallback size. */
          --feed-deck-width: min(96vw, 440px);
          --feed-deck-height: clamp(600px, 72vh, 720px);
          --feed-info-panel-height: clamp(190px, 32%, 236px);
          /* Keep the feed slot stable during mobile browser refresh/address-bar changes. */
          min-height: var(--feed-viewport-height);
          padding-bottom: var(--feed-bottom-nav-height);
          background: var(--bg, #0f0821);
          color: var(--text, #fff);
          overflow-x: hidden;
          width: 100%;
          min-width: 0;
        }

        .feed-loading,
        .feed-error {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 2rem 1.5rem;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          margin: 0 auto;
          text-align: center;
          color: var(--text-muted, #a39ec0);
        }
        .feed-error :global(svg) {
          color: #e040fb;
          margin-bottom: 0.5rem;
        }
        .feed-error h3 {
          margin: 0;
          color: var(--text, #fff);
          font-size: 1.1rem;
        }
        .feed-error p {
          margin: 0;
          max-width: 420px;
        }
        .feed-retry-btn {
          margin-top: 0.5rem;
          padding: 0.75rem 1.75rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          font-weight: 700;
          border: none;
          border-radius: 999px;
          cursor: pointer;
          font-size: 0.95rem;
          box-shadow: 0 4px 16px rgba(224, 64, 251, 0.35);
        }

        .feed-section {
          padding: 0;
        }
        .feed-match-section {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: max(var(--feed-available-height), calc(var(--feed-deck-height) + var(--feed-section-top-padding)));
          height: max(var(--feed-available-height), calc(var(--feed-deck-height) + var(--feed-section-top-padding)));
          padding: var(--feed-section-top-padding) 0 0;
          box-sizing: border-box;
        }
        .feed-match-section--empty {
          align-items: center;
          padding: 0.75rem 1rem 1rem;
        }

        .feed-swipe-deck {
          position: relative;
          flex: 0 0 auto;
          width: var(--feed-deck-width);
          min-width: var(--feed-deck-width);
          max-width: var(--feed-deck-width);
          height: var(--feed-deck-height);
          min-height: var(--feed-deck-height);
          max-height: var(--feed-deck-height);
          display: flex;
          justify-content: center;
          touch-action: pan-y;
          contain: layout paint;
          border-radius: 22px;
          transition: opacity 0.16s ease;
        }

        .feed-swipe-deck--state {
          width: var(--feed-deck-width);
          min-width: var(--feed-deck-width);
          max-width: var(--feed-deck-width);
          height: var(--feed-deck-height);
          min-height: var(--feed-deck-height);
          max-height: var(--feed-deck-height);
          margin: 0;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(20, 12, 46, 0.92), rgba(15, 8, 33, 0.96));
          border: 1px solid rgba(224, 64, 251, 0.14);
          box-shadow: 0 22px 54px rgba(0, 0, 0, 0.26);
        }

        :global(.feed-swipe-deck .swipe-card-modern) {
          width: 100%;
          max-width: none;
          height: 100%;
          left: 0;
          right: 0;
          margin: 0 auto;
          background: linear-gradient(180deg, rgba(20, 12, 46, 0.98), rgba(15, 8, 33, 0.98));
          border: 1px solid rgba(224, 64, 251, 0.18);
          border-radius: inherit;
          transform-origin: center center;
          will-change: transform, opacity;
        }

        :global(.feed-swipe-deck .swipe-card-image-wrapper) {
          height: calc(100% - var(--feed-info-panel-height));
          border-radius: inherit;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          overflow: hidden;
        }

        :global(.feed-swipe-deck .swipe-card-info) {
          box-sizing: border-box;
          min-height: 0;
          height: var(--feed-info-panel-height);
          padding: clamp(1rem, 3.5vw, 1.25rem) clamp(1rem, 4vw, 1.35rem) clamp(5rem, 12dvh, 6.5rem);
          background:
            radial-gradient(circle at 80% 15%, rgba(224, 64, 251, 0.16), transparent 34%),
            linear-gradient(180deg, rgba(20, 12, 46, 0.96), rgba(15, 8, 33, 0.99));
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        :global(.feed-swipe-deck .swipe-card-name) {
          font-size: clamp(1.55rem, 7vw, 2rem);
          line-height: 1.05;
        }

        :global(.feed-swipe-deck .swipe-card-age) {
          font-size: clamp(1.25rem, 5.5vw, 1.65rem);
        }

        :global(.feed-swipe-deck .swipe-card-location),
        :global(.feed-swipe-deck .interest-tag) {
          font-size: clamp(0.72rem, 3vw, 0.86rem);
        }

        .feed-action-dock {
          position: absolute;
          left: 50%;
          bottom: clamp(14px, 3dvh, 26px);
          z-index: 70;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: clamp(0.65rem, 2.5vw, 1rem);
          width: min(92%, 374px);
          transform: translateX(-50%);
          pointer-events: none;
        }

        .feed-action-btn {
          pointer-events: auto;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          min-width: 0;
          min-height: 64px;
          padding: 0.55rem 0.7rem;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          color: #fff;
          font-weight: 800;
          font-size: clamp(0.65rem, 2.6vw, 0.76rem);
          letter-spacing: -0.01em;
          text-align: center;
          cursor: pointer;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease;
        }

        .feed-action-btn:disabled {
          cursor: default;
          opacity: 0.58;
        }

        .feed-action-btn:not(:disabled):active {
          transform: scale(0.93);
        }

        .feed-action-btn--pass {
          background: linear-gradient(135deg, rgba(20, 12, 46, 0.92), rgba(30, 30, 40, 0.88));
          color: #d9d7e8;
        }

        .feed-action-btn--super {
          width: clamp(62px, 17vw, 74px);
          height: clamp(62px, 17vw, 74px);
          min-height: 0;
          padding: 0;
          background: linear-gradient(135deg, #22d3ee, #8b5cf6);
          box-shadow: 0 0 26px rgba(34, 211, 238, 0.38), 0 16px 36px rgba(0, 0, 0, 0.42);
        }

        .feed-action-btn--like {
          background: linear-gradient(135deg, #ff4fa3, #e040fb);
          box-shadow: 0 0 28px rgba(224, 64, 251, 0.36), 0 16px 36px rgba(0, 0, 0, 0.42);
        }

        :global(.feed-swipe-deck .swipe-card-initial) {
          font-size: clamp(2.5rem, 14vw, 4.5rem);
        }

        @media (min-width: 641px) {
          .feed-page {
            --feed-bottom-nav-content-height: 72px;
          }
        }

        @supports (height: 100dvh) {
          .feed-page {
            --feed-deck-height: clamp(600px, 72dvh, 720px);
            /* Use dvh as a floor, while lvh below becomes the stable non-shrinking viewport basis when available. */
            min-height: max(100dvh, var(--feed-viewport-height));
          }
        }

        @supports (height: 100lvh) {
          .feed-page {
            --feed-viewport-height: 100lvh;
            --feed-deck-height: clamp(600px, 72lvh, 720px);
          }
        }

        @media (min-width: 769px) {
          .feed-page {
            --feed-deck-width: min(calc(100vw - 32px), 440px);
            --feed-deck-height: clamp(520px, calc(var(--feed-available-height) - var(--feed-section-top-padding)), 720px);
          }

          .feed-swipe-deck {
            width: var(--feed-deck-width);
          }
        }

        .feed-empty {
          padding: 3rem 1rem;
          text-align: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
        }
        .feed-empty h3 {
          margin: 0 0 0.5rem;
          font-size: 1.05rem;
        }
        .feed-empty p {
          margin: 0 0 1.25rem;
          color: var(--text-muted, #a39ec0);
          font-size: 0.9rem;
        }
        .feed-empty-btn {
          display: inline-block;
          padding: 0.7rem 1.4rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          font-weight: 700;
          border-radius: 999px;
          font-size: 0.85rem;
          text-decoration: none;
          box-shadow: 0 4px 12px rgba(224, 64, 251, 0.3);
        }
      `}</style>
    </div>
  );
}

/* --------------------------- Sub-components --------------------------- */

function FeedHeader() {
  return (
    <header className="feed-header">
      <Link href="/feed" className="feed-header-brand" aria-label="MeetYouLive">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="feed-header-logo" />
      </Link>

      <style jsx>{`
        .feed-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1rem;
          padding-top: calc(0.5rem + env(safe-area-inset-top));
          background: rgba(15, 8, 33, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .feed-header-brand {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
        }
        .feed-header-logo {
          width: var(--feed-header-logo-size, clamp(52px, 15vw, 76px));
          height: var(--feed-header-logo-size, clamp(52px, 15vw, 76px));
          display: block;
          object-fit: contain;
        }
      `}</style>
    </header>
  );
}
