"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import InteractionButton from "@/components/InteractionButton";
import LiveCard from "@/components/LiveCard";
import { filterActiveLives } from "@/lib/liveFilters";
import { getUserImage, getDisplayName, getInitial, getGradientForUser } from "@/lib/imageHelpers";
import { fetchUserRole } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function CleanFeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // State
  const [activeLives, setActiveLives] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userCoins, setUserCoins] = useState(0);
  const [userAvatar, setUserAvatar] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [livesLoaded, setLivesLoaded] = useState(false);
  const [creatorsLoaded, setCreatorsLoaded] = useState(false);

  // Auth redirect
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/feed");
    }
  }, [status, router]);
  
  // Admin redirect
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

  // Fetch feed data with 10 second timeout
  useEffect(() => {
    if (status !== "authenticated" || !session?.backendToken) return;

    let isCancelled = false;
    const controller = new AbortController();
    let timeoutId = null;

    const fetchFeed = async () => {
      // 10 second timeout - no infinite spinner
      timeoutId = setTimeout(() => {
        if (!isCancelled) {
          console.warn("[Feed] 10s timeout reached - aborting");
          controller.abort();
        }
      }, 10000);

      try {
        const [feedRes, userRes] = await Promise.all([
          fetch(`${API_URL}/api/feed`, {
            headers: { Authorization: `Bearer ${session.backendToken}` },
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`${API_URL}/api/user/me`, {
            headers: { Authorization: `Bearer ${session.backendToken}` },
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (isCancelled) return;
        clearTimeout(timeoutId);

        if (!feedRes.ok) {
          throw new Error("No pudimos cargar tu feed. Por favor, intenta de nuevo.");
        }

        const data = await feedRes.json();
        
        // Apply safety filter
        const safeLives = filterActiveLives(data.activeLives || []);
        
        // Deduplicate by _id
        const uniqueProfiles = Array.from(
          new Map((data.recommendedProfiles || []).map(item => [item._id, item])).values()
        );
        const uniqueCreators = Array.from(
          new Map((data.featuredCreators || []).map(item => [item._id, item])).values()
        );

        setActiveLives(safeLives);
        setProfiles(uniqueProfiles);
        setFeaturedCreators(uniqueCreators);

        // Get user data
        if (userRes.ok) {
          const userData = await userRes.json();
          setUserCoins(userData.coinsBalance || 0);
          setUserAvatar(userData.avatar);
        }

        setError(null);
        setLoading(false);
      } catch (err) {
        if (isCancelled) return;
        
        clearTimeout(timeoutId);
        
        if (err.name === 'AbortError') {
          setError("El servidor está tardando demasiado. Por favor, intenta de nuevo.");
        } else {
          setError(err.message || "Error al cargar el feed");
        }
        
        setLoading(false);
      }
    };

    fetchFeed();

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort();
    };
  }, [status, session?.backendToken, session?.user?.id]);

  // Lazy load lives after initial render
  useEffect(() => {
    if (!loading && activeLives.length > 0 && !livesLoaded) {
      setTimeout(() => setLivesLoaded(true), 100);
    }
  }, [loading, activeLives, livesLoaded]);

  // Lazy load creators after lives
  useEffect(() => {
    if (livesLoaded && featuredCreators.length > 0 && !creatorsLoaded) {
      setTimeout(() => setCreatorsLoaded(true), 200);
    }
  }, [livesLoaded, featuredCreators, creatorsLoaded]);

  // Action handlers
  const handleFade = () => {
    // Skip/pass action
    setCurrentIndex((prev) => prev + 1);
  };

  const handleSpark = async () => {
    const currentProfile = profiles[currentIndex];
    if (!currentProfile) return;

    try {
      await fetch(`${API_URL}/api/match/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify({ userId: currentProfile._id }),
      });
      
      setCurrentIndex((prev) => prev + 1);
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  const handlePulse = async () => {
    // Boost profile
    const boostPrice = 100;
    if (userCoins < boostPrice) {
      alert("No tienes suficientes monedas. Recarga tu saldo.");
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

  const handleMagnet = async () => {
    // Super Crush
    const currentProfile = profiles[currentIndex];
    if (!currentProfile) return;

    const magnetPrice = 50;
    if (userCoins < magnetPrice) {
      alert("No tienes suficientes monedas. Recarga tu saldo.");
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
        setCurrentIndex((prev) => prev + 1);

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
    
    router.push(`/call/${currentProfile._id}`);
  };

  // Loading state
  if (status === "loading" || (status === "authenticated" && loading && !error)) {
    return (
      <div className="feed-clean-page">
        <div className="feed-clean-loading">
          <div className="spinner"></div>
          <p>Cargando tu feed...</p>
        </div>
      </div>
    );
  }
  
  // Error state - always render fallback UI
  if (error) {
    return (
      <div className="feed-clean-page">
        <div className="feed-clean-error">
          <div className="error-icon">😔</div>
          <h3>No pudimos cargar tu feed</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="retry-button">
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  const currentProfile = profiles[currentIndex];
  const hasMoreProfiles = currentIndex < profiles.length;

  return (
    <div className="feed-clean-page">
      {/* 1. HEADER - Premium top bar */}
      <header className="feed-clean-header">
        <Link href="/feed" className="feed-header-logo">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <path d="M20 4L22 18L36 20L22 22L20 36L18 22L4 20L18 18L20 4Z" fill="url(#logo-gradient)" />
            <defs>
              <linearGradient id="logo-gradient" x1="4" y1="4" x2="36" y2="36">
                <stop offset="0%" stopColor="#ff4fa3" />
                <stop offset="100%" stopColor="#e040fb" />
              </linearGradient>
            </defs>
          </svg>
        </Link>

        <div className="feed-header-actions">
          <Link href="/coins" className="feed-header-coins">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" fill="url(#coin-gradient)" />
              <text x="12" y="16" fontSize="12" fill="white" textAnchor="middle" fontWeight="bold">$</text>
              <defs>
                <linearGradient id="coin-gradient" x1="2" y1="2" x2="22" y2="22">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
            <span>{userCoins}</span>
          </Link>

          <Link href="/notifications" className="feed-header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {notifications.length > 0 && <span className="feed-header-badge">{notifications.length}</span>}
          </Link>

          <Link href="/profile" className="feed-header-avatar">
            {userAvatar ? (
              <img src={userAvatar} alt="Profile" />
            ) : (
              <div className="feed-header-avatar-fallback">
                {session?.user?.name?.[0] || "U"}
              </div>
            )}
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="feed-clean-main">
        {/* 2. MATCH HERO - Big immersive card (first screen) */}
        <section className="feed-match-hero">
          {hasMoreProfiles && currentProfile ? (
            <div className="match-hero-card">
              {/* Photo */}
              <div className="match-hero-photo">
                {getUserImage(currentProfile) ? (
                  <img 
                    src={getUserImage(currentProfile)} 
                    alt={getDisplayName(currentProfile)} 
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div 
                  className="match-hero-photo-fallback"
                  style={{ 
                    background: getGradientForUser(currentProfile._id),
                    display: getUserImage(currentProfile) ? 'none' : 'flex'
                  }}
                >
                  <div className="match-hero-fallback-initial">
                    {getInitial(getDisplayName(currentProfile))}
                  </div>
                </div>

                {/* Online badge */}
                {currentProfile.isOnline && (
                  <div className="match-hero-online-badge">
                    <span className="online-dot"></span>
                    En línea
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="match-hero-info">
                <div className="match-hero-name-section">
                  <h2 className="match-hero-name">{getDisplayName(currentProfile)}</h2>
                  {currentProfile.birthdate && (
                    <span className="match-hero-age">{calculateAge(currentProfile.birthdate)}</span>
                  )}
                </div>

                {currentProfile.location && (
                  <div className="match-hero-location">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    {currentProfile.location}
                  </div>
                )}

                {/* Tags */}
                {currentProfile.tags && currentProfile.tags.length > 0 && (
                  <div className="match-hero-tags">
                    {currentProfile.tags.slice(0, 4).map((tag, idx) => (
                      <span key={idx} className="match-hero-tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="match-hero-empty">
              <div className="match-hero-empty-icon">✨</div>
              <h3>No hay más perfiles por ahora</h3>
              <p>Vuelve pronto para descubrir nuevas conexiones</p>
            </div>
          )}
        </section>

        {/* 3. ACTION DOCK - Floating premium buttons */}
        {hasMoreProfiles && currentProfile && (
          <div className="feed-action-dock">
            <InteractionButton 
              variant="fade" 
              label="FADE" 
              onClick={handleFade}
            />
            <InteractionButton 
              variant="spark" 
              label="SPARK" 
              onClick={handleSpark}
            />
            <InteractionButton 
              variant="pulse" 
              label="PULSE" 
              onClick={handlePulse}
              coinCost={100}
            />
            <InteractionButton 
              variant="magnet" 
              label="MAGNET" 
              onClick={handleMagnet}
              coinCost={50}
            />
            <InteractionButton 
              variant="flash-live" 
              label="FLASH LIVE" 
              onClick={handleFlashLive}
            />
          </div>
        )}

        {/* 4. LIVE NOW - Lazy load, horizontal cards */}
        {livesLoaded && activeLives.length > 0 && (
          <section className="feed-live-section">
            <h3 className="feed-section-title">En Vivo Ahora 🔴</h3>
            <div className="feed-live-horizontal">
              {activeLives.slice(0, 10).map((live, idx) => (
                <LiveCard key={live._id} live={live} index={idx} />
              ))}
            </div>
          </section>
        )}

        {livesLoaded && activeLives.length === 0 && (
          <section className="feed-live-section">
            <h3 className="feed-section-title">En Vivo Ahora 🔴</h3>
            <div className="feed-live-empty">
              <p>No hay transmisiones en vivo en este momento</p>
            </div>
          </section>
        )}

        {/* 5. TOP CREATORS - Lazy load, horizontal cards */}
        {creatorsLoaded && featuredCreators.length > 0 && (
          <section className="feed-creators-section">
            <h3 className="feed-section-title">Creadores Destacados ⭐</h3>
            <div className="feed-creators-horizontal">
              {featuredCreators.map((creator) => (
                <Link 
                  key={creator._id} 
                  href={`/profile/${creator._id}`}
                  className="feed-creator-card"
                >
                  {getUserImage(creator) ? (
                    <img src={getUserImage(creator)} alt={getDisplayName(creator)} />
                  ) : (
                    <div 
                      className="feed-creator-fallback"
                      style={{ background: getGradientForUser(creator._id) }}
                    >
                      {getInitial(getDisplayName(creator))}
                    </div>
                  )}
                  <div className="feed-creator-name">{getDisplayName(creator)}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// Helper function
function calculateAge(birthdate) {
  if (!birthdate) return null;
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
