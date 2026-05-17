"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import InteractionBar from "@/components/InteractionBar";
import { filterActiveLives } from "@/lib/liveFilters";
import { useLanguage } from "@/contexts/LanguageContext";
import { getUserImage, getLiveThumbnail, getDisplayName, getInitial, getGradientForUser } from "@/lib/imageHelpers";
import { fetchUserRole } from "@/lib/token";
import { isApprovedCreator } from "@/lib/creatorUtils";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Swipe behavior constants
const SWIPE_THRESHOLD_PX = 100;
const SWIPE_ANIMATION_DURATION_MS = 300;
const SWIPE_OUT_DISTANCE_PX = 1000;

// Hard ceiling on how long we sit on the loading spinner. After this we
// drop out of the loading state and render the page (with fallback content if
// the API never returned). The feed must never sit on a spinner forever.
const LOADING_TIMEOUT_MS = 8000;

// Static fallback profile cards rendered when the API fails or times out, so
// /feed always shows usable content instead of an empty/error screen.
const FALLBACK_PROFILES = [
  {
    _id: "fallback-1",
    username: "Sofía",
    name: "Sofía",
    age: 24,
    bio: "Bienvenido a MeetYouLive ✨ Conecta, descubre y vive en vivo.",
    avatar: "",
    isFallback: true,
  },
  {
    _id: "fallback-2",
    username: "Valentina",
    name: "Valentina",
    age: 27,
    bio: "Música, viajes y buenas charlas. ¿Hacemos match?",
    avatar: "",
    isFallback: true,
  },
  {
    _id: "fallback-3",
    username: "Camila",
    name: "Camila",
    age: 22,
    bio: "Creadora en vivo. Pásate a saludar 💖",
    avatar: "",
    isFallback: true,
  },
];

export default function ModernFeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  
  // State
  const [activeLives, setActiveLives] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [swiping, setSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [livesLoading, setLivesLoading] = useState(true);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [heartPosition, setHeartPosition] = useState({ x: 0, y: 0 });
  const [userCoins, setUserCoins] = useState(0);
  const [boostPrice] = useState(100);
  const [magnetPrice] = useState(50);
  const [matchCardImgError, setMatchCardImgError] = useState(false);
  
  // Refs
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  // Auth redirect
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/feed");
    }
  }, [status, router]);

  // Safety net: never sit on the loading spinner forever.
  // Regardless of session/backend-token state, after LOADING_TIMEOUT_MS we
  // drop out of loading. If the fetch effect hasn't populated data by then,
  // the render path below falls back to FALLBACK_PROFILES so the user always
  // sees feed cards instead of an infinite spinner.
  useEffect(() => {
    const hardTimeout = setTimeout(() => {
      console.warn(
        `[Feed] Hard loading timeout (${LOADING_TIMEOUT_MS}ms) — exiting spinner`
      );
      setLivesLoading(false);
      setLoading(false);
    }, LOADING_TIMEOUT_MS);

    return () => clearTimeout(hardTimeout);
  }, []);
  
  // Admin redirect - admins should not access the feed page
  useEffect(() => {
    if (!session?.backendToken) return;
    
    let isMounted = true;
    
    const checkAdminRole = async () => {
      try {
        const userData = await fetchUserRole(session.backendToken);
        if (isMounted && userData?.role === "admin") {
          router.replace("/admin");
        }
      } catch (err) {
        console.error("Error checking user role:", err);
      }
    };
    
    checkAdminRole();
    
    return () => {
      isMounted = false;
    };
  }, [session?.backendToken, router]);

  // Fetch feed data
  useEffect(() => {
    // Do NOT block fetching on session?.backendToken — historically that
    // dependency caused /feed to wait forever when the backend token never
    // arrived (Render cold start, slow session hydration, etc.). We always
    // attempt the fetch; if there's no token yet we just skip the Authorization
    // header and the backend's optionalVerifyToken middleware will serve a
    // public response. On any failure we fall back to FALLBACK_PROFILES so
    // the page never shows an infinite spinner.
    if (status === "unauthenticated") return; // redirect effect handles this

    let isCancelled = false;
    let loadingTimeout = null;
    const controller = new AbortController();

    const fetchFeed = async () => {
      // Per emergency hotfix: 8s hard ceiling on the request itself.
      loadingTimeout = setTimeout(() => {
        if (!isCancelled) {
          console.warn("[Feed] Timeout reached (8s) - aborting request");
          controller.abort();
        }
      }, LOADING_TIMEOUT_MS);

      try {
        console.log("[Feed] Fetching feed from:", `${API_URL}/api/feed`);
        const token = session?.backendToken;
        // NOTE: Only log presence of token, never log the actual token value for security
        console.log("[Feed] Auth token present:", !!token);

        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

        const feedReq = fetch(`${API_URL}/api/feed`, {
          headers: { ...authHeaders },
          signal: controller.signal,
          cache: "no-store",
        });
        const userReq = token
          ? fetch(`${API_URL}/api/user/me`, {
              headers: { ...authHeaders },
              signal: controller.signal,
              cache: "no-store",
            })
          : Promise.resolve(null);

        const [feedRes, userRes] = await Promise.all([feedReq, userReq]);

        if (isCancelled) return;

        clearTimeout(loadingTimeout);

        console.log("[Feed] Feed response status:", feedRes.status);
        console.log(
          "[Feed] User response status:",
          userRes && userRes.ok ? "OK" : "Skipped/Error"
        );

        // Enhanced error handling with specific status codes
        if (!feedRes.ok) {
          console.error("[Feed] API error - Status:", feedRes.status);

          let errorMessage = "No pudimos cargar tu feed";
          if (feedRes.status === 401 || feedRes.status === 403) {
            errorMessage = "Sesión expirada. Por favor, inicia sesión de nuevo.";
          } else if (feedRes.status === 404) {
            errorMessage = "El servicio de feed no está disponible.";
          } else if (feedRes.status >= 500) {
            errorMessage = "Error del servidor. Por favor, intenta de nuevo.";
          }

          throw new Error(errorMessage);
        }

        const data = await feedRes.json();
        console.log("[Feed] Data received:", {
          lives: data.activeLives?.length || 0,
          profiles: data.recommendedProfiles?.length || 0,
          creators: data.featuredCreators?.length || 0,
        });

        // Apply frontend safety filter to activeLives
        const safeLives = filterActiveLives(data.activeLives || []);

        // Deduplicate profiles and creators by _id
        const uniqueProfiles = Array.from(
          new Map((data.recommendedProfiles || []).map(item => [item._id, item])).values()
        );
        const uniqueCreators = Array.from(
          new Map((data.featuredCreators || []).map(item => [item._id, item])).values()
        );

        setActiveLives(safeLives);
        // If the API returned no profiles, still show fallback cards so the
        // user is never stuck on an empty feed.
        setProfiles(uniqueProfiles.length > 0 ? uniqueProfiles : FALLBACK_PROFILES);
        setFeaturedCreators(uniqueCreators);

        // Get user coins balance (only when we had a token)
        if (userRes && userRes.ok) {
          const userData = await userRes.json();
          setUserCoins(userData.coinsBalance || 0);
        }

        setError(null);
        setLivesLoading(false);
        setLoading(false);
        console.log("[Feed] Load complete");
      } catch (err) {
        if (isCancelled) return;

        clearTimeout(loadingTimeout);

        // Enhanced error logging with more context
        if (err.name === 'AbortError') {
          console.log("[Feed] Request aborted (timeout or unmount)");
        } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
          console.error("[Feed] Network error - server might be down:", err.message);
        } else {
          console.error("[Feed] Error:", err.message);
        }

        // Fallback content so the feed always renders something usable.
        // We deliberately do NOT set `error` here — the page should keep
        // working and show fallback feed cards (per emergency hotfix spec).
        setActiveLives([]);
        setProfiles((prev) => (prev && prev.length > 0 ? prev : FALLBACK_PROFILES));
        setFeaturedCreators([]);
        setLivesLoading(false);
        setLoading(false);
      }
    };

    fetchFeed();

    // Cleanup function to cancel request if component unmounts
    return () => {
      isCancelled = true;
      if (loadingTimeout) clearTimeout(loadingTimeout);
      controller.abort();
    };
  }, [status, session?.backendToken, session?.user?.id]);

  // Reset image error when card changes
  useEffect(() => {
    setMatchCardImgError(false);
  }, [currentIndex]);

  // Swipe handlers
  const handleStart = (clientX) => {
    setSwiping(true);
    startXRef.current = clientX;
    currentXRef.current = clientX;
  };

  const handleMove = (clientX) => {
    if (!swiping) return;
    currentXRef.current = clientX;
    const offset = clientX - startXRef.current;
    setSwipeOffset(offset);
  };

  const handleEnd = () => {
    if (!swiping) return;
    setSwiping(false);

    const offset = currentXRef.current - startXRef.current;

    if (Math.abs(offset) > SWIPE_THRESHOLD_PX) {
      if (offset > 0) {
        handleLike();
      } else {
        handlePass();
      }
    } else {
      setSwipeOffset(0);
    }
  };

  const handleLike = async () => {
    const currentProfile = profiles[currentIndex];
    if (!currentProfile) return;

    // Show heart animation
    setHeartPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setShowHeartAnimation(true);
    setTimeout(() => setShowHeartAnimation(false), 1500);

    setSwipeOffset(SWIPE_OUT_DISTANCE_PX);
    
    try {
      await fetch(`${API_URL}/api/match/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify({ userId: currentProfile._id }),
      });
    } catch (err) {
      console.error("Like error:", err);
    }

    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeOffset(0);
    }, SWIPE_ANIMATION_DURATION_MS);
  };

  const handlePass = () => {
    setSwipeOffset(-SWIPE_OUT_DISTANCE_PX);

    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeOffset(0);
    }, SWIPE_ANIMATION_DURATION_MS);
  };

  const handleBoost = async () => {
    if (userCoins < boostPrice) {
      alert(t("noCoins") || "No tienes suficientes monedas. Recarga tu saldo.");
      router.push("/coins");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/matches/boost`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.backendToken}`,
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUserCoins((prev) => prev - boostPrice);
        alert("¡Tu perfil está siendo impulsado durante 30 minutos!");
      } else {
        const error = await res.json();
        alert(error.message || "Error al activar boost");
      }
    } catch (err) {
      console.error("Boost error:", err);
      alert("Error al activar boost");
    }
  };

  const handleSuperCrush = async () => {
    const currentProfile = profiles[currentIndex];
    if (!currentProfile) return;

    if (userCoins < magnetPrice) {
      alert(t("noCoins") || "No tienes suficientes monedas. Recarga tu saldo.");
      router.push("/coins");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/matches/super-crush/${currentProfile._id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.backendToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUserCoins((prev) => prev - magnetPrice);
        
        // Show special animation
        setHeartPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        setShowHeartAnimation(true);
        setTimeout(() => setShowHeartAnimation(false), 2000);

        // Move to next profile
        setSwipeOffset(SWIPE_OUT_DISTANCE_PX);
        setTimeout(() => {
          setCurrentIndex((prev) => prev + 1);
          setSwipeOffset(0);
        }, SWIPE_ANIMATION_DURATION_MS);

        if (data.match) {
          alert("¡Match instantáneo! 🔥");
        } else {
          alert("Super Crush enviado ⚡");
        }
      } else {
        const error = await res.json();
        alert(error.message || "Error al enviar Super Crush");
      }
    } catch (err) {
      console.error("Super Crush error:", err);
      alert("Error al enviar Super Crush");
    }
  };

  const handleFlashLive = () => {
    const currentProfile = profiles[currentIndex];
    if (!currentProfile) return;
    
    // Navigate to video call or private call initiation
    router.push(`/call/${currentProfile._id}`);
  };

  // Show loading spinner only while our local `loading` flag is true. The
  // hard timeout above guarantees we flip this to false after
  // LOADING_TIMEOUT_MS no matter what NextAuth's status is, so the spinner
  // can NEVER stick forever (emergency hotfix requirement).
  if (loading) {
    return (
      <div className="modern-page">
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '70vh',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--text-muted)' }}>Cargando tu feed...</p>
        </div>
      </div>
    );
  }
  
  // Defensive: if `error` is ever set by some future code path, still render
  // an error screen with a retry button. The main fetch path no longer sets
  // `error` — failures fall through to FALLBACK_PROFILES rendered below.
  if (error) {
    return (
      <div className="modern-page">
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '70vh',
          flexDirection: 'column',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '4rem' }}>😔</div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            No pudimos cargar tu feed
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 2rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  const currentProfile = profiles[currentIndex];
  const hasMoreProfiles = currentIndex < profiles.length;

  return (
    <div className="modern-page">
      {/* Heart Animation */}
      {showHeartAnimation && (
        <div 
          className="heart-animation"
          style={{
            left: `${heartPosition.x}px`,
            top: `${heartPosition.y}px`,
          }}
        >
          ❤️
        </div>
      )}

      {/* Section 1: MATCH (First - Priority) */}
      <div className="modern-section" style={{ marginTop: '1rem' }}>
        <div style={{ padding: '0 1rem 0.75rem' }}>
          {!hasMoreProfiles ? (
            <div className="no-content" style={{ padding: '2rem 1rem' }}>
              <div className="no-content-icon">😊</div>
              <h3>That's everyone for now!</h3>
              <p>Check back later for new people</p>
            </div>
          ) : currentProfile ? (
            <>
              <div 
                className="match-card-modern"
                style={{
                  transform: `translateX(${swipeOffset}px) rotate(${swipeOffset / 15}deg)`,
                  transition: swiping ? "none" : `all ${SWIPE_ANIMATION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                  opacity: Math.abs(swipeOffset) > SWIPE_THRESHOLD_PX ? 0.7 : 1,
                }}
                onMouseDown={(e) => handleStart(e.clientX)}
                onMouseMove={(e) => handleMove(e.clientX)}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                onTouchStart={(e) => handleStart(e.touches[0].clientX)}
                onTouchMove={(e) => handleMove(e.touches[0].clientX)}
                onTouchEnd={handleEnd}
              >
                {/* Premium Swipe indicators - SPARK & FADE */}
                {swipeOffset > 50 && (
                  <div className="swipe-indicator spark" style={{ opacity: Math.min(swipeOffset / 100, 1) }}>
                    <div className="swipe-indicator-content">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                      <span className="swipe-indicator-text">SPARK</span>
                    </div>
                  </div>
                )}
                {swipeOffset < -50 && (
                  <div className="swipe-indicator fade" style={{ opacity: Math.min(Math.abs(swipeOffset) / 100, 1) }}>
                    <div className="swipe-indicator-content">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" opacity="0.3" />
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      <span className="swipe-indicator-text">FADE</span>
                    </div>
                  </div>
                )}

                {(() => {
                  const userImage = getUserImage(currentProfile);
                  const displayName = getDisplayName(currentProfile);
                  const initial = getInitial(displayName);
                  const gradient = getGradientForUser(currentProfile._id);

                  return userImage && !matchCardImgError ? (
                    <img 
                      src={userImage} 
                      alt={displayName}
                      className="match-card-image"
                      onError={() => setMatchCardImgError(true)}
                    />
                  ) : (
                    <div className="match-card-image" style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: gradient,
                      fontSize: '8rem',
                      fontWeight: 900,
                      color: 'white',
                      textShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                      position: 'relative',
                    }}>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15), transparent 60%)',
                        pointerEvents: 'none',
                      }}></div>
                      <span style={{ position: 'relative', zIndex: 1 }}>{initial}</span>
                    </div>
                  );
                })()}

                <div className="match-card-gradient"></div>

                <div className="match-card-info">
                  <div className="match-card-header">
                    <h2 className="match-card-name">
                      {getDisplayName(currentProfile)}
                      {currentProfile.age && `, ${currentProfile.age}`}
                    </h2>
                    {currentProfile.isOnline && <div className="online-indicator"></div>}
                  </div>
                  
                  {isApprovedCreator(currentProfile) && (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.3rem 0.75rem',
                      borderRadius: '999px',
                      background: 'linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3))',
                      border: '1px solid rgba(224,64,251,0.5)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#e040fb',
                      marginBottom: '0.5rem',
                      boxShadow: '0 0 12px rgba(224,64,251,0.3)',
                    }}>
                      ⭐ Creator
                    </div>
                  )}
                  
                  <div className="match-card-details">
                    {currentProfile.location && (
                      <span>📍 {currentProfile.location}</span>
                    )}
                  </div>
                  {currentProfile.bio && (
                    <p className="match-card-bio">{currentProfile.bio}</p>
                  )}
                  {currentProfile.tags && Array.isArray(currentProfile.tags) && currentProfile.tags.length > 0 && (
                    <div className="match-card-tags" style={{
                      display: 'flex',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      marginTop: '0.75rem'
                    }}>
                      {currentProfile.tags.filter(tag => tag && typeof tag === 'string' && tag.trim()).slice(0, 3).map((tag, idx) => (
                        <span key={idx} style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.3rem 0.7rem',
                          borderRadius: '999px',
                          background: 'rgba(139,92,246,0.25)',
                          border: '1px solid rgba(139,92,246,0.4)',
                          color: '#c4b5fd',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Premium Interaction Bar */}
              <InteractionBar
                profile={currentProfile}
                onFade={handlePass}
                onSpark={handleLike}
                onPulse={handleBoost}
                onMagnet={handleSuperCrush}
                onFlashLive={handleFlashLive}
                disabled={swiping}
                boostPrice={boostPrice}
                magnetPrice={magnetPrice}
              />
            </>
          ) : null}
        </div>
      </div>

      {/* Section 2: LIVE NOW */}
      <div className="live-scroll-section" style={{ padding: '1rem 0' }}>
        <div className="live-scroll-header" style={{ padding: '0 1rem 0.75rem' }}>
          <div className="live-icon">🔴</div>
          <span>LIVE NOW</span>
        </div>
        {activeLives.length > 0 ? (
          <div className="live-scroll-container">
            {activeLives.map((live) => {
              const liveThumb = getLiveThumbnail(live);
              const creatorName = getDisplayName(live.user);
              const creatorInitial = getInitial(creatorName);
              const gradient = getGradientForUser(live.user?._id || live._id);
              
              return (
                <Link 
                  key={live._id} 
                  href={`/live/${live._id}`}
                  className="live-card-compact"
                >
                  <div className="live-thumb">
                    {liveThumb ? (
                      <img 
                        src={liveThumb} 
                        alt={live.title} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          const fallback = e.target.nextElementSibling;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div style={{ 
                      width: '100%', 
                      height: '100%', 
                      background: gradient,
                      display: liveThumb ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      position: liveThumb ? 'absolute' : 'relative',
                      top: 0,
                      left: 0,
                    }}>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15), transparent 60%)',
                        pointerEvents: 'none',
                      }}></div>
                      <div style={{
                        fontSize: '2.5rem',
                        fontWeight: 900,
                        color: 'white',
                        textShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
                        zIndex: 1
                      }}>
                        {creatorInitial}
                      </div>
                      <div style={{
                        fontSize: '2rem',
                        opacity: 0.8,
                        zIndex: 1
                      }}>
                        📹
                      </div>
                    </div>
                    <div className="live-badge-pulse">🔴 LIVE</div>
                    {live.viewerCount > 0 && (
                      <div className="live-viewers">
                        👁️ {live.viewerCount}
                      </div>
                    )}
                  </div>
                  <div className="live-info">
                    <div className="live-title">{live.title || "Live Stream"}</div>
                    <div className="live-creator">{creatorName}</div>
                    <button className="live-enter-btn">Enter</button>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="no-content" style={{ padding: '2rem 1rem' }}>
            <div className="no-content-icon" style={{ fontSize: '3rem' }}>📡</div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No hay directos ahora</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Vuelve pronto para ver nuevos directos</p>
            <Link href="/explore" className="btn btn-primary" style={{ 
              marginTop: '0.5rem',
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
              color: 'white',
              borderRadius: '999px',
              fontWeight: 700,
              fontSize: '0.9rem',
              textDecoration: 'none',
              transition: 'all 0.3s',
              border: 'none',
              boxShadow: '0 4px 12px rgba(224, 64, 251, 0.3)'
            }}>
              Explorar creadores
            </Link>
          </div>
        )}
      </div>

      {/* Section 3: TOP CREATORS */}
      {featuredCreators.length > 0 && (
        <div className="creators-section" style={{ padding: '1rem 0' }}>
          <div className="creators-header" style={{ padding: '0 1rem 0.75rem' }}>
            <span>⭐</span>
            <span>TOP CREATORS</span>
          </div>
          <div className="creators-scroll">
            {featuredCreators.map((creator) => {
              const creatorImage = getUserImage(creator);
              const creatorName = getDisplayName(creator);
              const creatorInitial = getInitial(creatorName);
              const gradient = getGradientForUser(creator._id);
              
              return (
                <Link
                  key={creator._id}
                  href={`/profile/${creator._id}`}
                  className="creator-story"
                >
                  <div className="creator-story-avatar">
                    {creatorImage ? (
                      <>
                        <img 
                          src={creatorImage} 
                          alt={creatorName}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            const fallback = e.target.nextElementSibling;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'none',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: gradient,
                          fontSize: '2rem',
                          fontWeight: 900,
                          color: 'white',
                          textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                        }}>
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1), transparent 70%)',
                            pointerEvents: 'none',
                          }}></div>
                          <span style={{ position: 'relative', zIndex: 1 }}>{creatorInitial}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: gradient,
                        fontSize: '2rem',
                        fontWeight: 900,
                        color: 'white',
                        textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        position: 'relative'
                      }}>
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1), transparent 70%)',
                          pointerEvents: 'none',
                        }}></div>
                        <span style={{ position: 'relative', zIndex: 1 }}>{creatorInitial}</span>
                      </div>
                    )}
                  </div>
                  <div className="creator-story-name">{creatorName}</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
