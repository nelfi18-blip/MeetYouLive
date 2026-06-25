"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchUserRole, getToken, setToken } from "@/lib/token";
import { PROFILE_UPDATED_EVENT, consumeProfileUpdatedMarker } from "@/lib/profileSync";
import { getMissingProfileLabels } from "@/lib/profileCompletionLabels";
import { getPrimaryProfileImage, normalizeUserImages } from "@/lib/imageHelpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SwipeCard = dynamic(() => import("@/components/SwipeCard"), { ssr: false });

// Hard ceiling on how long we wait for the NextAuth session / backend token
// to hydrate before surfacing a friendly fallback. Prevents the page from
// sitting on a spinner indefinitely on slow connections or Render cold starts.
// This is longer than the backend-token request timeout so recovery can settle.
const INIT_TIMEOUT_MS = 30000;
const BACKEND_TOKEN_FETCH_TIMEOUT_MS = 22000;
const SWIPE_LOCK_TIMEOUT_MS = 1400;
const TOUCH_ACTION_SUPPRESSION_MS = 1000;
const ACTION_TIMEOUT_MS = 12000;

// Hard ceiling for the feed API request itself.
const FETCH_TIMEOUT_MS = 15000;

const FEED_CACHE_KEY = "meetyoulive:feed:v1";
const FEED_CURRENT_PROFILE_KEY = "meetyoulive:feed:currentProfileId:v1";
const FEED_SEEN_PROFILE_IDS_KEY = "meetyoulive:feed:seenProfileIds:v1";
const FEED_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const FEED_SEEN_PROFILE_IDS_LIMIT = 500;
const FEED_LAYOUT_DIAGNOSTIC_LABEL = "[feed-layout-diagnostic]";
const POST_REFRESH_LAYOUT_DIAGNOSTIC_DELAY_MS = 650;
const FEED_LAYOUT_DIAGNOSTIC_EVENT_DEBOUNCE_MS = 150;
const DEFAULT_FEED_PROFILE_NAME = "Usuario";

function getProfileId(profile) {
  const profileId = profile?._id || profile?.id;
  return profileId ? String(profileId) : "";
}

function getNullableIdString(id) {
  return id == null ? "" : String(id);
}

function limitSeenProfileIds(profileIds) {
  return profileIds.map(getNullableIdString).filter(Boolean).slice(-FEED_SEEN_PROFILE_IDS_LIMIT);
}

function normalizeSeenProfileIds(profileIds) {
  return Array.from(new Set(limitSeenProfileIds(profileIds)));
}

function isRecommendedProfile(profile, currentUserId) {
  const profileId = getProfileId(profile);
  return profileId && (!currentUserId || profileId !== currentUserId);
}

function getSafeProfileText(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function normalizeTextList(value) {
  return (Array.isArray(value) ? value : [])
    .map(getSafeProfileText)
    .filter(Boolean);
}

function getSafeLocation(profile) {
  if (typeof profile?.location === "string") return profile.location.trim();
  return [
    profile?.locationLabel,
    profile?.location?.label,
    profile?.location?.city,
    profile?.location?.country,
  ].map(getSafeProfileText).find(Boolean) || "";
}

function sanitizeFeedProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const profileId = getProfileId(profile);
  if (!profileId) return null;

  const images = normalizeUserImages(profile);
  const photos = images.map((image) => image.url).filter(Boolean);
  const primaryPhoto = getPrimaryProfileImage(profile) || photos[0] || "";
  const fullName = [profile.firstName, profile.lastName].map(getSafeProfileText).filter(Boolean).join(" ");
  const name = [
    profile.displayName,
    profile.name,
    fullName,
    profile.username,
  ].map(getSafeProfileText).find(Boolean) || DEFAULT_FEED_PROFILE_NAME;
  const username = getSafeProfileText(profile.username) || name;
  const interests = normalizeTextList(Array.isArray(profile.interests) ? profile.interests : profile.tags);
  const numericAge = Number(profile.age);
  const age = Number.isInteger(numericAge) && numericAge > 0 ? numericAge : null;

  return {
    ...profile,
    _id: profileId,
    id: profileId,
    name,
    username,
    avatar: getSafeProfileText(profile.avatar) || primaryPhoto,
    images,
    profilePhotos: photos,
    primaryPhoto,
    age,
    location: getSafeLocation(profile),
    interests,
    bio: getSafeProfileText(profile.bio),
  };
}

function sanitizeFeedProfiles(profiles, currentUserId = "") {
  const entries = (Array.isArray(profiles) ? profiles : [])
    .map(sanitizeFeedProfile)
    .filter((profile) => profile && isRecommendedProfile(profile, currentUserId))
    .map((profile) => [getProfileId(profile), profile]);
  return Array.from(new Map(entries).values());
}

function shouldLogProfileCompletionDiagnostics() {
  if (process.env.NODE_ENV !== "production") return true;
  try {
    return localStorage.getItem("meetyoulive:debug:profileCompletion") === "true";
  } catch {
    return false;
  }
}

function getCurrentProfileId(profiles, currentIndex) {
  return getProfileId(profiles[currentIndex]);
}

function mergeProfilesPreservingDeck(cachedProfiles, refreshedProfiles) {
  if (!cachedProfiles.length) return refreshedProfiles;

  const refreshedById = new Map();
  refreshedProfiles.forEach((profile) => {
    const profileId = getProfileId(profile);
    if (profileId) refreshedById.set(profileId, profile);
  });
  const seenProfileIds = new Set();
  const mergedProfiles = cachedProfiles.map((profile) => {
    const profileId = getProfileId(profile);
    if (!profileId) return profile;
    seenProfileIds.add(profileId);
    return refreshedById.get(profileId) || profile;
  });

  refreshedProfiles.forEach((profile) => {
    const profileId = getProfileId(profile);
    if (!profileId || seenProfileIds.has(profileId)) return;
    seenProfileIds.add(profileId);
    mergedProfiles.push(profile);
  });

  return mergedProfiles;
}

function getEmptyCachedFeed() {
  return { profiles: [], currentIndex: 0, currentProfileId: "", hasCache: false };
}

function readCachedFeed() {
  if (typeof window === "undefined") return getEmptyCachedFeed();

  try {
    const raw = window.sessionStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return getEmptyCachedFeed();

    const parsed = JSON.parse(raw);
    const cachedProfiles = sanitizeFeedProfiles(parsed?.profiles);
    const cachedIndex = Number.isInteger(parsed?.currentIndex) ? parsed.currentIndex : 0;
    const cachedCurrentProfileId = getNullableIdString(parsed?.currentProfileId);
    const timestamp = Number(parsed?.timestamp) || 0;

    if (!cachedProfiles.length || Date.now() - timestamp > FEED_CACHE_MAX_AGE_MS) {
      window.sessionStorage.removeItem(FEED_CACHE_KEY);
      return getEmptyCachedFeed();
    }

    const currentProfileIndex = cachedCurrentProfileId
      ? cachedProfiles.findIndex((profile) => getProfileId(profile) === cachedCurrentProfileId)
      : -1;
    // Allow currentIndex === cachedProfiles.length as the exhausted-feed sentinel
    // so refreshes do not resurrect the last already-swiped profile.
    const currentIndex = currentProfileIndex >= 0
      ? currentProfileIndex
      : Math.min(Math.max(cachedIndex, 0), cachedProfiles.length);
    const currentProfileId = cachedCurrentProfileId || getCurrentProfileId(cachedProfiles, currentIndex);
    return {
      profiles: cachedProfiles,
      currentIndex,
      currentProfileId,
      hasCache: true,
    };
  } catch (err) {
    return getEmptyCachedFeed();
  }
}

function readStoredCurrentProfileId() {
  if (typeof window === "undefined") return "";

  try {
    return getNullableIdString(window.sessionStorage.getItem(FEED_CURRENT_PROFILE_KEY));
  } catch (err) {
    return "";
  }
}

function writeStoredCurrentProfileId(profileId) {
  if (typeof window === "undefined") return;

  try {
    if (profileId) {
      window.sessionStorage.setItem(FEED_CURRENT_PROFILE_KEY, profileId);
    } else {
      window.sessionStorage.removeItem(FEED_CURRENT_PROFILE_KEY);
    }
  } catch (err) {
  }
}

function writeCachedFeed(profiles, currentIndex) {
  if (typeof window === "undefined") return;

  try {
    const cachedProfiles = sanitizeFeedProfiles(profiles);
    // Preserve currentIndex === length as the exhausted-feed sentinel.
    const safeCurrentIndex = Math.min(Math.max(currentIndex, 0), cachedProfiles.length);
    const currentProfileId = getCurrentProfileId(cachedProfiles, safeCurrentIndex);
    writeStoredCurrentProfileId(currentProfileId);

    if (!cachedProfiles.length) {
      window.sessionStorage.removeItem(FEED_CACHE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      FEED_CACHE_KEY,
      JSON.stringify({ profiles: cachedProfiles, currentIndex: safeCurrentIndex, currentProfileId, timestamp: Date.now() })
    );
  } catch (err) {
  }
}

function clearCachedFeed() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(FEED_CACHE_KEY);
    window.sessionStorage.removeItem(FEED_CURRENT_PROFILE_KEY);
  } catch {
  }
}

function clearFeedExcludedStorage() {
  clearCachedFeed();
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(FEED_SEEN_PROFILE_IDS_KEY);
  } catch {
  }
}

function readSeenProfileIds() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(FEED_SEEN_PROFILE_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? normalizeSeenProfileIds(parsed) : [];
  } catch {
    return [];
  }
}

function writeSeenProfileIds(profileIds) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      FEED_SEEN_PROFILE_IDS_KEY,
      JSON.stringify(limitSeenProfileIds(profileIds))
    );
  } catch {
  }
}

function addSeenProfileId(profileId) {
  const normalizedProfileId = getNullableIdString(profileId);
  if (!normalizedProfileId) return;
  const seenProfileIds = readSeenProfileIds();
  if (seenProfileIds.includes(normalizedProfileId)) return;
  writeSeenProfileIds([...seenProfileIds, normalizedProfileId]);
}

function removeSeenProfileId(profileId) {
  if (!profileId) return;
  writeSeenProfileIds(readSeenProfileIds().filter((storedProfileId) => storedProfileId !== profileId));
}

function buildFeedUrl({ excludeSeen = false, ignoreExclude = false } = {}) {
  const url = new URL(`${API_URL}/api/feed`);
  if (ignoreExclude) {
    url.searchParams.set("ignoreExclude", "true");
    url.searchParams.set("cacheBust", String(Date.now()));
  } else if (excludeSeen) {
    const seenProfileIds = readSeenProfileIds();
    if (seenProfileIds.length) {
      url.searchParams.set("exclude", seenProfileIds.join(","));
    }
    url.searchParams.set("cacheBust", String(Date.now()));
  }
  return url.toString();
}

function roundLayoutNumber(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function getElementLayoutSnapshot(element) {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  return {
    className: typeof element.className === "string" ? element.className : "",
    width: roundLayoutNumber(rect.width),
    height: roundLayoutNumber(rect.height),
    top: roundLayoutNumber(rect.top),
    left: roundLayoutNumber(rect.left),
    bottom: roundLayoutNumber(rect.bottom),
    right: roundLayoutNumber(rect.right),
  };
}

function readCssCustomProperty(styles, propertyName) {
  return styles.getPropertyValue(propertyName).trim();
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
        userId: getNullableIdString(data?.user?.id),
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

const IconUndo = (props) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
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
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [profileSyncVersion, setProfileSyncVersion] = useState(0);
  const [viewerProfileStatus, setViewerProfileStatus] = useState(null);
  const [feedDebug, setFeedDebug] = useState(null);
  const [actionSignal, setActionSignal] = useState({ id: 0, direction: null, profileId: null });
  const [swipeLocked, setSwipeLocked] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  // Most recent completed swipe action available for undo: { profileId, actionType: "like" | "dislike" }.
  const [lastAction, setLastAction] = useState(null);
  const tokenRecoveryAttemptedRef = useRef(false);
  const swipeUnlockTimeoutRef = useRef(null);
  const profilesRef = useRef([]);
  const currentIndexRef = useRef(0);
  const hasVisualCacheRef = useRef(false);
  const likeInFlightRef = useRef(false);
  const requestedActionRef = useRef(false);
  const activeActionRef = useRef(false);
  const pendingActionProfileIdRef = useRef(null);
  const lastTouchActionAtRef = useRef(0);
  const swipeLockedRef = useRef(false);
  const feedMutationVersionRef = useRef(0);
  const pageRef = useRef(null);
  const deckRef = useRef(null);
  const currentUserIdRef = useRef("");
  const currentProfileIdRef = useRef("");
  const lastActionRef = useRef(null);

  const logFeedLayoutDiagnostic = useCallback((reason) => {
    if (typeof window === "undefined") return;

    const visualViewport = window.visualViewport;
    const pageElement = pageRef.current;
    const deckElement = deckRef.current;
    const cardElement = deckElement?.querySelector(".swipe-card-modern") || null;
    const pageStyles = pageElement ? window.getComputedStyle(pageElement) : null;

    console.info(FEED_LAYOUT_DIAGNOSTIC_LABEL, {
      reason,
      timestamp: new Date().toISOString(),
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        documentClientWidth: document.documentElement.clientWidth,
        documentClientHeight: document.documentElement.clientHeight,
        visualViewportWidth: roundLayoutNumber(visualViewport?.width),
        visualViewportHeight: roundLayoutNumber(visualViewport?.height),
        visualViewportScale: roundLayoutNumber(visualViewport?.scale),
        visualViewportOffsetTop: roundLayoutNumber(visualViewport?.offsetTop),
        visualViewportOffsetLeft: roundLayoutNumber(visualViewport?.offsetLeft),
        devicePixelRatio: window.devicePixelRatio,
        orientationType: screen.orientation?.type || null,
        orientationAngle: screen.orientation?.angle ?? window.orientation ?? null,
      },
      cssSupport: {
        svh: CSS.supports("height", "100svh"),
        dvh: CSS.supports("height", "100dvh"),
        lvh: CSS.supports("height", "100lvh"),
      },
      feedCssVars: pageStyles
        ? {
            feedViewportHeight: readCssCustomProperty(pageStyles, "--feed-viewport-height"),
            feedStableViewportHeight: readCssCustomProperty(pageStyles, "--feed-stable-viewport-height"),
            feedAvailableHeight: readCssCustomProperty(pageStyles, "--feed-available-height"),
            feedDeckWidth: readCssCustomProperty(pageStyles, "--feed-deck-width"),
            feedDeckHeight: readCssCustomProperty(pageStyles, "--feed-deck-height"),
            feedInfoPanelHeight: readCssCustomProperty(pageStyles, "--feed-info-panel-height"),
            feedSafeTop: readCssCustomProperty(pageStyles, "--feed-safe-top"),
            feedSafeBottom: readCssCustomProperty(pageStyles, "--feed-safe-bottom"),
          }
        : null,
      elements: {
        main: getElementLayoutSnapshot(pageElement),
        deck: getElementLayoutSnapshot(deckElement),
        card: getElementLayoutSnapshot(cardElement),
      },
    });
  }, []);

  const resetFeedAfterProfileUpdate = useCallback(() => {
    feedMutationVersionRef.current += 1;
    clearCachedFeed();
    currentProfileIdRef.current = "";
    hasVisualCacheRef.current = false;
    profilesRef.current = [];
    currentIndexRef.current = 0;
    setHasVisualCache(false);
    setProfiles([]);
    setCurrentIndex(0);
    setLastAction(null);
    setViewerProfileStatus(null);
    setLoading(true);
    setProfileSyncVersion((version) => version + 1);
  }, []);

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
    let animationFrameId = null;
    let delayedLogId = null;
    let eventDebounceId = null;

    const scheduleDiagnostic = (reason, delayMs = 0) => {
      if (delayMs > 0) {
        if (eventDebounceId) {
          clearTimeout(eventDebounceId);
        }
        eventDebounceId = setTimeout(() => {
          eventDebounceId = null;
          scheduleDiagnostic(reason);
        }, delayMs);
        return;
      }

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        logFeedLayoutDiagnostic(reason);
      });
    };

    scheduleDiagnostic("mount");
    delayedLogId = setTimeout(
      () => scheduleDiagnostic("post-refresh-recalculation"),
      POST_REFRESH_LAYOUT_DIAGNOSTIC_DELAY_MS
    );

    const handleWindowResize = () => scheduleDiagnostic("window-resize", FEED_LAYOUT_DIAGNOSTIC_EVENT_DEBOUNCE_MS);
    const handleOrientationChange = () => scheduleDiagnostic("orientation-change", FEED_LAYOUT_DIAGNOSTIC_EVENT_DEBOUNCE_MS);
    const handleVisualViewportResize = () => scheduleDiagnostic("visual-viewport-resize", FEED_LAYOUT_DIAGNOSTIC_EVENT_DEBOUNCE_MS);
    const handleVisualViewportScroll = () => scheduleDiagnostic("visual-viewport-scroll", FEED_LAYOUT_DIAGNOSTIC_EVENT_DEBOUNCE_MS);

    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.visualViewport?.addEventListener("resize", handleVisualViewportResize);
    window.visualViewport?.addEventListener("scroll", handleVisualViewportScroll);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (delayedLogId) {
        clearTimeout(delayedLogId);
      }
      if (eventDebounceId) {
        clearTimeout(eventDebounceId);
      }
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.visualViewport?.removeEventListener("resize", handleVisualViewportResize);
      window.visualViewport?.removeEventListener("scroll", handleVisualViewportScroll);
    };
  }, [logFeedLayoutDiagnostic]);

  useEffect(() => {
    if (consumeProfileUpdatedMarker()) {
      resetFeedAfterProfileUpdate();
      return;
    }

    const cachedFeed = readCachedFeed();
    const storedCurrentProfileId = cachedFeed.currentProfileId || readStoredCurrentProfileId();
    currentProfileIdRef.current = storedCurrentProfileId;
    if (storedCurrentProfileId && !cachedFeed.currentProfileId) {
      writeStoredCurrentProfileId(storedCurrentProfileId);
    }
    if (!cachedFeed.hasCache) return;

    profilesRef.current = cachedFeed.profiles;
    currentIndexRef.current = cachedFeed.currentIndex;
    currentProfileIdRef.current = cachedFeed.currentProfileId;
    hasVisualCacheRef.current = true;
    setProfiles(cachedFeed.profiles);
    setCurrentIndex(cachedFeed.currentIndex);
    setLoading(false);
    setHasVisualCache(true);
  }, [resetFeedAfterProfileUpdate]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    const currentUserId = session?.backendUserId || session?.user?.id || "";
    currentUserIdRef.current = currentUserId ? String(currentUserId) : "";
  }, [session?.backendUserId, session?.user?.id]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    const currentProfileId = getCurrentProfileId(profiles, currentIndex);
    // Clear the visible profile ref when a non-empty deck has been exhausted.
    if (currentProfileId || profiles.length) {
      currentProfileIdRef.current = currentProfileId;
    }
  }, [currentIndex, profiles]);

  useEffect(() => {
    hasVisualCacheRef.current = hasVisualCache;
  }, [hasVisualCache]);

  useEffect(() => {
    lastActionRef.current = lastAction;
  }, [lastAction]);

  // Temporarily keep admins on /feed so they can inspect backend feed diagnostics.
  useEffect(() => {
    if (!authToken) return;
    let mounted = true;
    fetchUserRole(authToken)
      .then((u) => {
        if (mounted) setCurrentUserRole(u?.role || null);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [authToken]);

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

  const loadFeed = useCallback(async ({ signal, silent = false, fresh = false, ignoreExclude = false } = {}) => {
    let mutationVersionAtStart = feedMutationVersionRef.current;
    const profilesBeforeRefresh = fresh ? [] : profilesRef.current;
    const indexBeforeRefresh = fresh ? 0 : currentIndexRef.current;
    const profileIdBeforeRefresh =
      fresh
        ? ""
        : getCurrentProfileId(profilesBeforeRefresh, indexBeforeRefresh) ||
          currentProfileIdRef.current ||
          readStoredCurrentProfileId();

    if (!authToken) {
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError(null);
    if (fresh) {
      feedMutationVersionRef.current += 1;
      mutationVersionAtStart = feedMutationVersionRef.current;
      if (ignoreExclude) {
        clearFeedExcludedStorage();
      } else {
        clearCachedFeed();
      }
      currentProfileIdRef.current = "";
      currentIndexRef.current = 0;
      profilesRef.current = [];
      hasVisualCacheRef.current = false;
      setHasVisualCache(false);
      setLastAction(null);
      setViewerProfileStatus(null);
    }

    if (!API_URL) {
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
      const feedRes = await fetch(buildFeedUrl({ excludeSeen: fresh, ignoreExclude }), {
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
      setFeedDebug(data?.debug || null);
      setViewerProfileStatus(data?.viewerProfileStatus || null);
      if (data?.viewerProfileStatus?.canAppearInFeed === false && shouldLogProfileCompletionDiagnostics()) {
        console.log("[feed-profile-completion]", {
          missingFields: data.viewerProfileStatus.missingFields || data.missingFields || [],
          currentValues: data.viewerProfileStatus.currentValues || null,
          profileCompletionStatus: data.profileCompletionStatus || null,
        });
      }
      const currentUserId = currentUserIdRef.current;
      const feedProfiles = Array.isArray(data?.recommendedProfiles)
        ? data.recommendedProfiles
        : Array.isArray(data?.profiles)
          ? data.profiles
          : [];
      const uniqueProfiles = sanitizeFeedProfiles(feedProfiles, currentUserId);
      const profileIds = new Set(uniqueProfiles.map(getProfileId).filter(Boolean));
      const previousCurrentProfile = profileIdBeforeRefresh
        ? profilesBeforeRefresh.find((profile) => getProfileId(profile) === profileIdBeforeRefresh)
        : null;
      const visibleProfiles = previousCurrentProfile && !profileIds.has(profileIdBeforeRefresh)
        ? [previousCurrentProfile, ...uniqueProfiles]
        : uniqueProfiles;
      const nextProfileIds = new Set(visibleProfiles.map(getProfileId).filter(Boolean));

      let nextIndex = 0;
      // Refreshes and retries restore by visible profile id; only real user actions advance.
      if (profileIdBeforeRefresh) {
        const matchingIndex = visibleProfiles.findIndex(
          (profile) => getProfileId(profile) === profileIdBeforeRefresh
        );
        if (matchingIndex >= 0) {
          nextIndex = matchingIndex;
        }
      }

      if (mutationVersionAtStart !== feedMutationVersionRef.current) {
        return;
      }

      if (silent && hasVisualCacheRef.current && profilesBeforeRefresh.length) {
        const syncedProfiles = mergeProfilesPreservingDeck(profilesBeforeRefresh, visibleProfiles);
        const normalizedIndex = Math.max(indexBeforeRefresh, 0);
        const hasProfileAtIndex = normalizedIndex < syncedProfiles.length;
        if (!hasProfileAtIndex) {
          setError(null);
          return;
        }
        const preservedIndex = normalizedIndex;
        const preservedProfileId = getCurrentProfileId(syncedProfiles, preservedIndex);
        currentIndexRef.current = preservedIndex;
        currentProfileIdRef.current = preservedProfileId;
        profilesRef.current = syncedProfiles;
        setProfiles(syncedProfiles);
        setLastAction((action) => {
          if (!action?.profileId) return null;
          return nextProfileIds.has(action.profileId) ? action : null;
        });
        writeCachedFeed(syncedProfiles, preservedIndex);
        setError(null);
        return;
      }

      currentIndexRef.current = nextIndex;
      currentProfileIdRef.current = getCurrentProfileId(visibleProfiles, nextIndex);
      profilesRef.current = visibleProfiles;
      setCurrentIndex(nextIndex);
      setProfiles(visibleProfiles);
      // Refresh can remove the profile that was available to undo, so clear it
      // instead of restoring an action for a profile no longer in this deck.
      setLastAction((action) => {
        if (!action?.profileId) return null;
        return nextProfileIds.has(action.profileId) ? action : null;
      });
      hasVisualCacheRef.current = false;
      setHasVisualCache(false);
      writeCachedFeed(visibleProfiles, nextIndex);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      if (err.name === "AbortError") {
        setError(t("feed.serverStarting"));
      } else {
        setError(err.message || t("feed.genericError"));
      }
      setFeedDebug(null);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromParent);
      if (!signal?.aborted) setLoading(false);
    }
  }, [authToken, session?.googleEmail, status, t]);

  const handleProfileUpdated = useCallback(() => {
    resetFeedAfterProfileUpdate();
  }, [resetFeedAfterProfileUpdate]);

  useEffect(() => {
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    };
  }, [handleProfileUpdated]);

  // Fetch feed data once a backend token is ready. Do not depend on
  // hasVisualCache: re-running here would reset the visible profile on mobile refresh.
  useEffect(() => {
    if (!authToken) return undefined;
    const controller = new AbortController();
    loadFeed({ signal: controller.signal, silent: false, fresh: true });
    return () => {
      controller.abort();
    };
  }, [authToken, loadFeed, profileSyncVersion]);

  const visibleProfileStack = [];
  for (let i = Math.min(currentIndex + 2, profiles.length - 1); i >= currentIndex; i -= 1) {
    visibleProfileStack.push({ profile: profiles[i], stackIndex: i - currentIndex });
  }

  useEffect(() => {
    const animationFrameId = requestAnimationFrame(() => {
      logFeedLayoutDiagnostic("feed-render");
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentIndex, error, loading, logFeedLayoutDiagnostic, profiles.length]);

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
      unlockSwipe();
      return false;
    }

    const nextIndex = activeIndex + 1;
    currentIndexRef.current = nextIndex;
    currentProfileIdRef.current = getCurrentProfileId(activeProfiles, nextIndex);
    setCurrentIndex(nextIndex);
    writeCachedFeed(activeProfiles, nextIndex);
    unlockSwipe();
    return true;
  };

  const handleSwipe = async (profileId, direction) => {
    const isLike = direction === "right" || direction === "up";
    const activeProfiles = profilesRef.current;
    const activeIndex = currentIndexRef.current;
    const activeProfile = activeProfiles[activeIndex];
    const activeProfileId = getProfileId(activeProfile);
    const targetProfileId = activeProfile?._id || activeProfile?.id || profileId;
    const targetProfileIdString = targetProfileId ? String(targetProfileId) : "";

    if (activeActionRef.current || likeInFlightRef.current) {
      return false;
    }

    if (!targetProfileIdString || activeProfileId !== profileId) {
      unlockSwipe();
      return false;
    }

    if (
      requestedActionRef.current &&
      pendingActionProfileIdRef.current &&
      pendingActionProfileIdRef.current !== profileId
    ) {
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

    if (currentUserIdRef.current && targetProfileIdString === currentUserIdRef.current) {
      return true;
    }

    if (likeInFlightRef.current) {
      return false;
    }

    likeInFlightRef.current = true;
    setActionLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);

    try {
      if (!API_URL || !authToken) {
        throw new Error(t("feed.sessionExpired"));
      }

      const res = await fetch(`${API_URL}/api/matches/like/${encodeURIComponent(targetProfileIdString)}`, {
        method: isLike ? "POST" : "DELETE",
        headers: { Authorization: "Bearer " + authToken },
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await res.json().catch((parseError) => {
        console.error("Swipe action response parse error:", parseError);
        return {};
      });

      // The match API contract requires explicit success:true before the deck advances.
      if (!res.ok || data?.success !== true) {
        throw new Error(data?.message || (isLike ? t("feed.likeError") : t("feed.passError")));
      }

      addSeenProfileId(targetProfileIdString);
      setLastAction({ profileId: targetProfileIdString, actionType: isLike ? "like" : "dislike" });
      return true;
    } catch (err) {
      console.error("Swipe action error:", err);
      unlockSwipe();
      const message = err.name === "AbortError"
        ? t("feed.serverStarting")
        : err.message || (isLike ? t("feed.likeError") : t("feed.passError"));
      setError(message);
      return false;
    } finally {
      clearTimeout(timeoutId);
      likeInFlightRef.current = false;
      setActionLoading(false);
    }
  };

  const handleSwipeExitComplete = async (profileId) => {
    const advanced = advance(profileId);
    if (!advanced) return;
  };

  const handleUndoLastAction = async () => {
    const action = lastActionRef.current;
    const activeProfiles = profilesRef.current;
    const targetIndex = action?.profileId
      ? activeProfiles.findIndex((profile) => getProfileId(profile) === action.profileId)
      : -1;
    const isBusy =
      swipeLockedRef.current ||
      requestedActionRef.current ||
      activeActionRef.current ||
      likeInFlightRef.current;

    if (!action || isBusy) return;
    if (targetIndex < 0) {
      setLastAction(null);
      return;
    }

    swipeLockedRef.current = true;
    likeInFlightRef.current = true;
    feedMutationVersionRef.current += 1;
    setSwipeLocked(true);
    setError(null);

    try {
      if (action.actionType === "like") {
        if (!API_URL || !authToken) {
          throw new Error(t("feed.sessionExpired"));
        }

        const res = await fetch(`${API_URL}/api/matches/like/${encodeURIComponent(action.profileId)}`, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + authToken },
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(t("feed.undoError"));
        }
      }

      currentIndexRef.current = targetIndex;
      currentProfileIdRef.current = action.profileId;
      removeSeenProfileId(action.profileId);
      setCurrentIndex(targetIndex);
      writeCachedFeed(activeProfiles, targetIndex);
      setLastAction(null);
    } catch (err) {
      console.error("Undo action error:", err);
      setError(err.message || t("feed.undoError"));
    } finally {
      likeInFlightRef.current = false;
      unlockSwipe();
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

  const handleActionButtonPointerUp = (event, direction) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (swipeLockedRef.current || requestedActionRef.current || activeActionRef.current || likeInFlightRef.current) return;
    // Suppress the synthetic click after touch/pen pointer-up so one tap sends one action.
    event.preventDefault();
    lastTouchActionAtRef.current = Date.now();
    requestSwipe(direction);
  };

  const isClickRecentlySuppressed = () =>
    Date.now() - lastTouchActionAtRef.current < TOUCH_ACTION_SUPPRESSION_MS;

  const handleActionButtonClick = (direction) => {
    if (isClickRecentlySuppressed()) {
      return;
    }
    requestSwipe(direction);
  };

  /* --------------------------- Render --------------------------- */
  const currentProfile = profiles[currentIndex];
  const hasMoreProfiles = currentIndex < profiles.length && !!currentProfile;
  const showLoadingState = !error && loading && !hasMoreProfiles;
  const showErrorState = error && !hasMoreProfiles;
  const showEmptyState = !hasMoreProfiles && !showLoadingState && !showErrorState;
  const activeCardError = hasMoreProfiles ? error : null;
  const isUndoDisabled = swipeLocked || !lastAction;
  const currentProfileId = getProfileId(currentProfile);
  const shouldShowProfileIncompleteState = showEmptyState && viewerProfileStatus?.canAppearInFeed === false;
  const profileCompletionHref = viewerProfileStatus?.onboardingComplete ? "/profile" : "/onboarding";
  const shouldShowPreferenceBanner = viewerProfileStatus?.preferenceCompletionNeeded === true;
  const shouldShowFeedDebugPanel =
    feedDebug && (currentUserRole === "admin" || process.env.NODE_ENV !== "production");
  const missingProfileLabels = getMissingProfileLabels(viewerProfileStatus?.missingFields);
  const profileIncompleteDescription = missingProfileLabels.length
    ? `Te falta: ${missingProfileLabels.join(" / ")}`
    : t("feed.profileIncompleteDescription");

  return (
    <div ref={pageRef} className="feed-page">
      {/* 1. APPROVED BRAND HEADER */}
      <FeedHeader />

      {/* 2. MODERN SWIPE DECK */}
      <section
        className={`feed-section feed-match-section${showEmptyState ? " feed-match-section--empty" : ""}`}
        aria-label={t("feed.recommendedProfilesAria")}
      >
        {shouldShowPreferenceBanner && !showLoadingState && !showErrorState && (
          <div className="feed-preferences-banner">
            <span>{t("feed.preferencesBannerText")}</span>
            <Link href="/profile" className="feed-preferences-banner-link">
              {t("feed.preferencesBannerAction")}
            </Link>
          </div>
        )}
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
                onClick={() => loadFeed({ fresh: true })}
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
                  key={getProfileId(profile)}
                  profile={profile}
                  isActive={isTopCard}
                  onSwipe={isTopCard ? handleSwipe : undefined}
                  onExitComplete={isTopCard ? handleSwipeExitComplete : undefined}
                  actionSignal={isTopCard ? actionSignal : undefined}
                  disabled={isTopCard ? swipeLocked : true}
                  pending={isTopCard && actionLoading && !activeCardError}
                  error={isTopCard ? activeCardError : null}
                  pendingLabel={t("feed.pendingAction")}
                  bioMoreLabel={t("feed.bioMoreLabel")}
                  bioLessLabel={t("feed.bioLessLabel")}
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
                onPointerUp={(event) => handleActionButtonPointerUp(event, "left")}
                onClick={() => handleActionButtonClick("left")}
              >
                <IconX />
                <span>{t("feed.dislikeLabel")}</span>
              </button>
              <button
                type="button"
                className="feed-action-btn feed-action-btn--undo"
                aria-label={t("feed.undoLabel")}
                disabled={isUndoDisabled}
                onClick={handleUndoLastAction}
              >
                <IconUndo />
                <span>{t("feed.undoShortLabel")}</span>
              </button>
              <button
                type="button"
                className="feed-action-btn feed-action-btn--like"
                aria-label={t("feed.likeLabel")}
                disabled={swipeLocked}
                onPointerUp={(event) => handleActionButtonPointerUp(event, "right")}
                onClick={() => handleActionButtonClick("right")}
              >
                <IconHeart />
                <span>{t("feed.likeLabel")}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="feed-empty">
            <h3>{shouldShowProfileIncompleteState ? t("feed.profileIncompleteTitle") : t("feed.emptyTitle")}</h3>
            <p>{shouldShowProfileIncompleteState ? profileIncompleteDescription : t("feed.emptyDescription")}</p>
            <div className="feed-empty-actions">
              {shouldShowProfileIncompleteState ? (
                <Link href={profileCompletionHref} className="feed-empty-btn feed-empty-btn--secondary">
                  {t("feed.profileIncompleteAction")}
                </Link>
              ) : (
                <button
                  type="button"
                  className="feed-empty-btn feed-empty-btn--secondary"
                  onClick={handleUndoLastAction}
                  disabled={isUndoDisabled}
                >
                  {t("feed.undoLabel")}
                </button>
              )}
              <button type="button" className="feed-empty-btn" onClick={() => loadFeed({ fresh: true, ignoreExclude: true })}>
                {t("feed.reloadProfiles")}
              </button>
            </div>
          </div>
        )}
      </section>

      {shouldShowFeedDebugPanel && (
        <section className="feed-debug-panel" aria-label="Diagnóstico del feed">
          <div className="feed-debug-panel-header">
            <strong>Diagnóstico /api/feed</strong>
            <span>Visible solo admin/dev</span>
          </div>
          <pre>{JSON.stringify(feedDebug, null, 2)}</pre>
        </section>
      )}

      {/* 3. Bottom nav is rendered by the root layout's BottomNavWrapper. */}

      <style jsx>{`
        .feed-page {
          --feed-safe-top: env(safe-area-inset-top);
          --feed-safe-bottom: env(safe-area-inset-bottom);
          --feed-header-logo-size: clamp(52px, 15vw, 76px);
          --feed-header-content-height: calc(var(--feed-header-logo-size) + 1rem);
          --feed-bottom-nav-content-height: 68px;
          --feed-section-top-padding: 6px;
          --feed-accent-purple-rgb: 224, 64, 251;
          --feed-header-height: calc(var(--feed-header-content-height) + var(--feed-safe-top));
          --feed-bottom-nav-height: calc(var(--feed-bottom-nav-content-height) + var(--feed-safe-bottom));
          --feed-viewport-height: 100vh;
          --feed-stable-viewport-height: var(--feed-viewport-height);
          --feed-available-height: calc(var(--feed-viewport-height) - var(--feed-header-height) - var(--feed-bottom-nav-height));
          /* Use a direct viewport-based deck height so refresh/address-bar changes cannot collapse the card to the global fallback size. */
          --feed-deck-width: min(96vw, 440px);
          --feed-deck-height: clamp(600px, calc(var(--feed-stable-viewport-height) * 0.72), 720px);
          --feed-image-panel-height: clamp(300px, calc(var(--feed-stable-viewport-height) * 0.44), 360px);
          --feed-info-panel-height: max(240px, calc(var(--feed-deck-height) - var(--feed-image-panel-height)));
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
        .feed-debug-panel {
          width: min(92vw, 720px);
          margin: 0 auto 1rem;
          padding: 0.85rem;
          border: 1px solid rgba(224, 64, 251, 0.24);
          border-radius: 16px;
          background: rgba(20, 12, 46, 0.92);
          color: #fff;
          box-sizing: border-box;
        }
        .feed-debug-panel-header {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.6rem;
          color: #fff;
          font-size: 0.86rem;
        }
        .feed-debug-panel-header span {
          color: var(--text-muted, #c9c2e6);
          font-size: 0.76rem;
        }
        .feed-debug-panel pre {
          margin: 0;
          max-height: 360px;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 0.72rem;
          line-height: 1.45;
          color: #e9ddff;
        }
        .feed-match-section {
          position: relative;
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

        .feed-preferences-banner {
          position: absolute;
          top: max(8px, var(--feed-section-top-padding));
          left: 50%;
          z-index: 95;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          width: min(92vw, 420px);
          padding: 0.72rem 0.85rem;
          border: 1px solid rgba(var(--feed-accent-purple-rgb), 0.28);
          border-radius: 16px;
          background: rgba(20, 12, 46, 0.86);
          color: #fff;
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.32);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          transform: translateX(-50%);
        }
        .feed-preferences-banner span {
          min-width: 0;
          font-size: 0.82rem;
          line-height: 1.25;
          color: var(--text-muted, #d9d4ef);
        }
        .feed-preferences-banner-link {
          flex: 0 0 auto;
          color: #fff;
          font-size: 0.78rem;
          font-weight: 800;
          text-decoration: none;
          padding: 0.42rem 0.72rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
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
          height: var(--feed-image-panel-height);
          border-radius: inherit;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          overflow: hidden;
        }

        :global(.feed-swipe-deck .swipe-card-image),
        :global(.feed-swipe-deck .swipe-card-placeholder) {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          /* Bias slightly upward so portrait photos keep faces/upper body visible. */
          object-position: center 35%;
        }

        :global(.feed-swipe-deck .swipe-card-info) {
          box-sizing: border-box;
          min-height: 0;
          height: var(--feed-info-panel-height);
          padding: clamp(0.78rem, 2.8vw, 1rem) clamp(0.9rem, 3.4vw, 1.15rem) clamp(3.8rem, calc(var(--feed-stable-viewport-height) * 0.076), 4.85rem);
          background:
            radial-gradient(circle at 80% 15%, rgba(224, 64, 251, 0.16), transparent 34%),
            linear-gradient(180deg, rgba(20, 12, 46, 0.96), rgba(15, 8, 33, 0.99));
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          gap: clamp(0.25rem, 1.2vw, 0.45rem);
        }

        :global(.feed-swipe-deck .swipe-card-name) {
          font-size: clamp(1.35rem, 6vw, 1.8rem);
          line-height: 1.05;
        }

        :global(.feed-swipe-deck .swipe-card-age) {
          font-size: clamp(1.1rem, 4.8vw, 1.45rem);
        }

        :global(.feed-swipe-deck .swipe-card-location),
        :global(.feed-swipe-deck .interest-tag) {
          font-size: clamp(0.72rem, 3vw, 0.86rem);
        }

        :global(.feed-swipe-deck .swipe-card-name-age) {
          margin-bottom: 0;
        }

        :global(.feed-swipe-deck .swipe-card-interests) {
          margin-top: 0.1rem;
          gap: 0.35rem;
        }

        :global(.feed-swipe-deck .interest-tag) {
          padding: 0.32rem 0.62rem;
          line-height: 1.1;
        }

        :global(.feed-swipe-deck .swipe-card-bio) {
          font-size: clamp(0.78rem, 3.1vw, 0.9rem);
          line-height: 1.32;
          -webkit-line-clamp: 3;
        }

        :global(.feed-swipe-deck .swipe-card-bio--expanded) {
          -webkit-line-clamp: 5;
        }

        .feed-action-dock {
          position: absolute;
          left: 50%;
          bottom: clamp(8px, calc(var(--feed-stable-viewport-height) * 0.02), 18px);
          z-index: 70;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: clamp(0.5rem, 2vw, 0.85rem);
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
          min-height: 52px;
          padding: 0.42rem 0.58rem;
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

        .feed-action-btn--undo {
          width: clamp(52px, 14vw, 62px);
          height: clamp(52px, 14vw, 62px);
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
            min-height: max(100dvh, var(--feed-viewport-height));
          }
        }

        @supports (height: 100lvh) {
          .feed-page {
            --feed-viewport-height: 100lvh;
            --feed-stable-viewport-height: 100lvh;
          }
        }

        @media (min-width: 769px) {
          .feed-page {
            --feed-deck-width: min(calc(100vw - 32px), 440px);
            --feed-deck-height: clamp(520px, calc(var(--feed-available-height) - var(--feed-section-top-padding)), 720px);
            --feed-info-panel-height: clamp(238px, 38%, 292px);
            --feed-image-panel-height: calc(var(--feed-deck-height) - var(--feed-info-panel-height));
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
        .feed-empty-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.75rem;
        }
        .feed-empty-btn {
          display: inline-block;
          padding: 0.7rem 1.4rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          font-weight: 700;
          border: 0;
          border-radius: 999px;
          font-size: 0.85rem;
          text-decoration: none;
          box-shadow: 0 4px 12px rgba(224, 64, 251, 0.3);
          cursor: pointer;
        }
        .feed-empty-btn--secondary {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: none;
        }
        .feed-empty-btn:disabled {
          cursor: default;
          opacity: 0.55;
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
