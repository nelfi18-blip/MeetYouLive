"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LiveCard from "@/components/LiveCard";
import { filterActiveLives } from "@/lib/liveFilters";
import { fetchUserRole } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Constants for swipe behavior
const SWIPE_THRESHOLD_PX = 100; // px to trigger swipe action
const SWIPE_INDICATOR_THRESHOLD_PX = 50; // px to show swipe indicator (half of action threshold)
const SWIPE_ANIMATION_DURATION_MS = 300; // animation duration for card transitions
const SWIPE_OUT_DISTANCE_PX = 1000; // distance to animate card off-screen

export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeLives, setActiveLives] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [swiping, setSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [livesLoading, setLivesLoading] = useState(true);
  const [likeError, setLikeError] = useState("");
  
  const cardRef = useRef(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/feed");
    }
  }, [status, router]);
  
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
    // Wait for authentication to complete
    if (status !== "authenticated" || !session?.backendToken) return;

    let isCancelled = false;
    let loadingTimeout = null;
    const controller = new AbortController();

    const fetchFeed = async () => {
      // Safety timeout to prevent infinite loading - fires after 10 seconds as last resort
      loadingTimeout = setTimeout(() => {
        if (!isCancelled) {
          console.warn("Feed loading timeout reached - forcing loading state to false");
          setLivesLoading(false);
          setLoading(false);
          setError("No pudimos cargar tu feed ahora. Por favor, intenta de nuevo.");
        }
      }, 10000);

      try {
        const res = await fetch(`${API_URL}/api/feed`, {
          headers: {
            Authorization: `Bearer ${session.backendToken}`,
          },
          signal: controller.signal,
          cache: "no-store",
        });

        if (isCancelled) return;

        clearTimeout(loadingTimeout);

        if (!res.ok) throw new Error("Error al cargar el feed");

        const data = await res.json();
        
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
        setProfiles(uniqueProfiles);
        setFeaturedCreators(uniqueCreators);
        setError("");
        setLivesLoading(false);
        setLoading(false);
      } catch (err) {
        if (isCancelled) return;
        
        clearTimeout(loadingTimeout);
        console.error("Feed error:", err);
        
        // Set user-friendly error message - don't show error for cancelled requests
        if (err.name === 'AbortError') {
          console.log("Feed request cancelled on unmount");
        } else {
          setError(err.message || 'Error al cargar el feed');
        }
        
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

  // Touch/Mouse handlers for swipe
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
      // Reset position
      setSwipeOffset(0);
    }
  };

  const handleLike = async () => {
    const currentProfile = profiles[currentIndex];
    if (!currentProfile) return;

    // Animate out
    setSwipeOffset(SWIPE_OUT_DISTANCE_PX);
    setLikeError("");
    
    // Send like to backend
    try {
      const res = await fetch(`${API_URL}/api/match/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify({ userId: currentProfile._id }),
      });

      if (!res.ok) {
        throw new Error("Error al enviar like");
      }
    } catch (err) {
      console.error("Like error:", err);
      setLikeError("No se pudo enviar el like. Inténtalo de nuevo.");
      // Still move to next card even if like fails
    }

    // Move to next card after animation
    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeOffset(0);
    }, SWIPE_ANIMATION_DURATION_MS);
  };

  const handlePass = () => {
    // Animate out
    setSwipeOffset(-SWIPE_OUT_DISTANCE_PX);

    // Move to next card after animation
    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeOffset(0);
    }, SWIPE_ANIMATION_DURATION_MS);
  };

  const handleChat = (userId) => {
    router.push(`/chats?userId=${userId}`);
  };

  const handleGift = (userId) => {
    router.push(`/gifts?recipientId=${userId}`);
  };

  const handleViewProfile = (userId) => {
    router.push(`/profile/${userId}`);
  };

  if (status === "loading" || loading) {
    return (
      <div className="feed-page">
        <div className="feed-loading">
          <div className="spinner"></div>
          <p>Cargando tu feed...</p>
        </div>
      </div>
    );
  }

  const currentProfile = profiles[currentIndex];
  const hasMoreProfiles = currentIndex < profiles.length;

  return (
    <>
      <div className="feed-page">
        {/* First Section: Match Cards */}
        <div className="match-section">
          <h2 className="section-title">❤️ Encuentra tu match</h2>
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

          {likeError && (
            <div className="like-error-toast">
              <p>{likeError}</p>
              <button onClick={() => setLikeError("")}>×</button>
            </div>
          )}

          <div className="cards-container">
            {!hasMoreProfiles ? (
              <div className="no-more-cards">
                <div className="no-more-icon">😊</div>
                <h3>¡Has visto todos los perfiles!</h3>
                <p>Vuelve más tarde para ver nuevos usuarios</p>
                <button 
                  className="btn-explore"
                  onClick={() => router.push("/explore")}
                >
                  Explorar Más
                </button>
              </div>
            ) : currentProfile ? (
              <div 
                ref={cardRef}
                className="swipe-card"
                style={{
                  transform: `translateX(${swipeOffset}px) rotate(${swipeOffset / 20}deg)`,
                  transition: swiping ? "none" : `transform ${SWIPE_ANIMATION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${SWIPE_ANIMATION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                  opacity: Math.abs(swipeOffset) > SWIPE_THRESHOLD_PX ? 0.5 : 1,
                }}
                onMouseDown={(e) => handleStart(e.clientX)}
                onMouseMove={(e) => handleMove(e.clientX)}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                onTouchStart={(e) => handleStart(e.touches[0].clientX)}
                onTouchMove={(e) => handleMove(e.touches[0].clientX)}
                onTouchEnd={handleEnd}
              >
                {/* Swipe Indicators */}
                {swipeOffset > SWIPE_INDICATOR_THRESHOLD_PX && (
                  <div className="swipe-indicator like">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                    </svg>
                    <span>LIKE</span>
                  </div>
                )}
                {swipeOffset < -SWIPE_INDICATOR_THRESHOLD_PX && (
                  <div className="swipe-indicator pass">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span>PASS</span>
                  </div>
                )}

                {/* Card Image */}
                <div className="card-image-container">
                  {currentProfile.avatar ? (
                    <img 
                      src={currentProfile.avatar} 
                      alt={`Foto de perfil de ${currentProfile.name}`}
                      className="card-image"
                      loading="lazy"
                    />
                  ) : (
                    <div className="card-placeholder">
                      <div className="placeholder-initial">
                        {currentProfile.name?.[0]?.toUpperCase() || "?"}
                      </div>
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="card-gradient"></div>

                  {/* Card Info */}
                  <div className="card-info">
                    <h3 className="card-name">
                      {currentProfile.name}
                      {currentProfile.age && <span className="card-age">, {currentProfile.age}</span>}
                    </h3>
                    {currentProfile.location && (
                      <p className="card-location">
                        📍 {currentProfile.location}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Stack preview - next card slightly visible behind */}
            {profiles[currentIndex + 1] && (
              <div className="card-stack-preview">
                <div className="preview-card"></div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {hasMoreProfiles && currentProfile && (
            <div className="actions-row">
              <button 
                className="action-btn btn-pass"
                onClick={handlePass}
                disabled={swiping}
                aria-label="Pasar"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Pasar</span>
              </button>

              <button 
                className="action-btn btn-like"
                onClick={handleLike}
                disabled={swiping}
                aria-label="Me gusta"
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                </svg>
                <span>Me gusta</span>
              </button>

              <button 
                className="action-btn btn-chat"
                onClick={() => handleChat(currentProfile._id)}
                disabled={swiping}
                aria-label="Mensaje"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <span>Mensaje</span>
              </button>
            </div>
          )}
        </div>

        {/* Second Section: Live Streams */}
        <div className="live-section">
          <h2 className="section-title">🔴 En vivo ahora</h2>
          <div className="live-scroll">
            {livesLoading ? (
              <>
                <div className="live-skeleton" />
                <div className="live-skeleton" />
                <div className="live-skeleton" />
              </>
            ) : activeLives.length > 0 ? (
              activeLives.map((live) => (
                <div key={live._id} className="live-item">
                  <LiveCard live={live} />
                </div>
              ))
            ) : (
              <div className="no-lives">
                <p>No hay streams en vivo ahora</p>
              </div>
            )}
          </div>
        </div>

        {/* Third Section: Featured Creators */}
        {featuredCreators.length > 0 && (
          <div className="creators-section">
            <h2 className="section-title">⭐ Creadores destacados</h2>
            <div className="creators-grid">
              {featuredCreators.map((creator) => (
                <Link 
                  key={creator._id} 
                  href={`/profile/${creator._id}`}
                  className="creator-card"
                >
                  <div className="creator-avatar">
                    {creator.avatar ? (
                      <img src={creator.avatar} alt={creator.name} />
                    ) : (
                      <div className="creator-initial">
                        {creator.name?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <h3 className="creator-name">{creator.name}</h3>
                  <div className="creator-stats">
                    <span className="creator-coins">💎 {creator.earningsCoins || 0}</span>
                  </div>
                  <button className="creator-follow-btn">Seguir</button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .feed-page {
          min-height: 100vh;
          background: linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%);
          display: flex;
          flex-direction: column;
          padding-bottom: 80px;
        }

        .feed-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          gap: 1rem;
        }

        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(139,92,246,0.2);
          border-top-color: #8b5cf6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .spinner-small {
          width: 30px;
          height: 30px;
          border: 3px solid rgba(139,92,246,0.2);
          border-top-color: #8b5cf6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .feed-loading p {
          color: var(--text-muted);
          font-size: 1rem;
        }

        /* Section titles */
        .section-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 1.2rem 0;
          padding: 0 1rem;
        }

        /* Match Section */
        .match-section {
          padding: 1.5rem 0;
          border-bottom: 1px solid rgba(139,92,246,0.15);
        }

        .cards-container {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          position: relative;
          min-height: 500px;
        }

        .error-message {
          text-align: center;
          padding: 1rem;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 12px;
          color: #fca5a5;
          margin: 0 1rem 1rem 1rem;
        }

        .like-error-toast {
          position: fixed;
          top: 6rem;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(239,68,68,0.95);
          color: white;
          padding: 1rem 1.5rem;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          z-index: 1000;
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }

        .like-error-toast p {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .like-error-toast button {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background 0.2s;
        }

        .like-error-toast button:hover {
          background: rgba(255,255,255,0.2);
        }

        .swipe-card {
          position: relative;
          width: 100%;
          max-width: 400px;
          aspect-ratio: 3 / 4;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
          cursor: grab;
          user-select: none;
          z-index: 2;
        }

        .swipe-card:active {
          cursor: grabbing;
        }

        .card-stack-preview {
          position: absolute;
          width: 100%;
          max-width: 400px;
          aspect-ratio: 3 / 4;
          z-index: 1;
        }

        .preview-card {
          width: 95%;
          height: 100%;
          margin: 0 auto;
          background: rgba(30,12,60,0.8);
          border-radius: 20px;
          transform: scale(0.95) translateY(10px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }

        .card-image-container {
          width: 100%;
          height: 100%;
          position: relative;
        }

        .card-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .card-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, rgba(139,92,246,0.4), rgba(224,64,251,0.4));
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .placeholder-initial {
          font-size: 8rem;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.6);
        }

        .card-gradient {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 50%;
          background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
          pointer-events: none;
        }

        .card-info {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 2rem 1.5rem;
          color: white;
          pointer-events: none;
        }

        .card-name {
          font-size: 2rem;
          font-weight: 900;
          margin: 0 0 0.5rem 0;
          text-shadow: 0 2px 8px rgba(0,0,0,0.6);
        }

        .card-age {
          font-size: 1.8rem;
          font-weight: 600;
        }

        .card-location {
          font-size: 1rem;
          color: rgba(255, 255, 255, 0.9);
          margin: 0;
        }

        /* Swipe Indicators */
        .swipe-indicator {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.5rem;
          font-weight: 900;
          padding: 1rem 2rem;
          border-radius: 12px;
          border: 4px solid;
          z-index: 10;
        }

        .swipe-indicator.like {
          left: 2rem;
          color: #22c55e;
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.2);
          animation: pulseLike 0.5s ease-in-out;
        }

        .swipe-indicator.pass {
          right: 2rem;
          color: #ef4444;
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.2);
          animation: pulsePass 0.5s ease-in-out;
        }

        @keyframes pulseLike {
          0%, 100% { transform: translateY(-50%) scale(1); }
          50% { transform: translateY(-50%) scale(1.1); }
        }

        @keyframes pulsePass {
          0%, 100% { transform: translateY(-50%) scale(1); }
          50% { transform: translateY(-50%) scale(1.1); }
        }

        /* No More Cards */
        .no-more-cards {
          text-align: center;
          padding: 3rem 2rem;
          max-width: 400px;
        }

        .no-more-icon {
          font-size: 5rem;
          margin-bottom: 1.5rem;
        }

        .no-more-cards h3 {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 0.5rem 0;
        }

        .no-more-cards p {
          color: var(--text-muted);
          margin: 0 0 2rem 0;
        }

        .btn-explore {
          padding: 0.8rem 2rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          border: none;
          border-radius: 999px;
          color: white;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-explore:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 24px rgba(224,64,251,0.4);
        }

        /* Actions Row */
        .actions-row {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          margin-top: 1rem;
        }

        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          padding: 0.8rem 1.2rem;
          border-radius: 16px;
          border: 2px solid;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-btn:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.4);
        }

        .action-btn:not(:disabled):active {
          transform: scale(0.95);
        }

        .action-btn span {
          display: block;
        }

        .btn-pass {
          background: linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.25));
          border-color: rgba(239,68,68,0.6);
          color: #fca5a5;
        }

        .btn-pass svg {
          stroke: #fca5a5;
        }

        .btn-pass:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(239,68,68,0.4), rgba(220,38,38,0.4));
        }

        .btn-like {
          background: linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3));
          border-color: rgba(224,64,251,0.7);
          color: #e040fb;
          padding: 1rem 1.5rem;
        }

        .btn-like svg {
          fill: #e040fb;
        }

        .btn-like:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.5), rgba(139,92,246,0.5));
        }

        .btn-chat {
          background: linear-gradient(135deg, rgba(59,130,246,0.25), rgba(37,99,235,0.25));
          border-color: rgba(59,130,246,0.6);
          color: #93c5fd;
        }

        .btn-chat svg {
          stroke: #93c5fd;
        }

        .btn-chat:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(59,130,246,0.4), rgba(37,99,235,0.4));
        }

        /* Live Section */
        .live-section {
          padding: 1.5rem 0;
          border-bottom: 1px solid rgba(139,92,246,0.15);
        }

        .live-scroll {
          display: flex;
          gap: 1rem;
          overflow-x: auto;
          padding: 0 1rem 0.5rem 1rem;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: rgba(139,92,246,0.5) transparent;
        }

        .live-scroll::-webkit-scrollbar {
          height: 6px;
        }

        .live-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .live-scroll::-webkit-scrollbar-thumb {
          background: rgba(139,92,246,0.5);
          border-radius: 3px;
        }

        .live-item {
          flex-shrink: 0;
          width: 280px;
        }

        .live-skeleton {
          flex-shrink: 0;
          width: 280px;
          height: 320px;
          background: linear-gradient(135deg, rgba(30,12,60,0.5), rgba(35,16,70,0.5));
          border-radius: var(--radius);
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.8; }
        }

        .no-lives {
          width: 100%;
          text-align: center;
          padding: 2rem;
          color: var(--text-muted);
        }

        /* Creators Section */
        .creators-section {
          padding: 1.5rem 1rem;
        }

        .creators-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 1rem;
        }

        .creator-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.2rem;
          background: linear-gradient(135deg, rgba(30,12,60,0.8), rgba(12,5,25,0.9));
          border: 1px solid rgba(224, 64, 251, 0.16);
          border-radius: var(--radius);
          text-decoration: none;
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        }

        .creator-card:hover {
          border-color: rgba(139, 92, 246, 0.55);
          box-shadow: 0 8px 32px rgba(139, 92, 246, 0.25);
          transform: translateY(-4px);
        }

        .creator-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          overflow: hidden;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.8rem;
          border: 2px solid rgba(224,64,251,0.4);
        }

        .creator-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .creator-initial {
          font-size: 2rem;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.8);
        }

        .creator-name {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 0.5rem 0;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
        }

        .creator-stats {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.8rem;
        }

        .creator-coins {
          font-size: 0.75rem;
          font-weight: 700;
          color: #a78bfa;
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.28);
          border-radius: 999px;
          padding: 0.25rem 0.6rem;
        }

        .creator-follow-btn {
          padding: 0.5rem 1.2rem;
          background: linear-gradient(135deg, rgba(224,64,251,0.18), rgba(139,92,246,0.18));
          border: 1px solid rgba(224,64,251,0.35);
          color: #e040fb;
          font-size: 0.75rem;
          font-weight: 700;
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .creator-follow-btn:hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3));
          border-color: rgba(224,64,251,0.6);
        }

        @media (max-width: 768px) {
          .section-title {
            font-size: 1.2rem;
            margin-bottom: 1rem;
          }

          .match-section {
            padding: 1rem 0;
          }

          .live-section {
            padding: 1rem 0;
          }

          .live-item {
            width: 240px;
          }

          .live-skeleton {
            width: 240px;
            height: 280px;
          }

          .cards-container {
            padding: 0.5rem;
            min-height: 420px;
          }

          .swipe-card {
            max-width: 100%;
            border-radius: 16px;
          }

          .card-name {
            font-size: 1.6rem;
          }

          .card-age {
            font-size: 1.4rem;
          }

          .swipe-indicator {
            padding: 0.75rem 1.5rem;
            font-size: 1.2rem;
          }

          .swipe-indicator.like {
            left: 1rem;
          }

          .swipe-indicator.pass {
            right: 1rem;
          }

          .swipe-indicator svg {
            width: 60px;
            height: 60px;
          }

          .actions-row {
            gap: 0.75rem;
            padding: 0.75rem;
          }

          .action-btn {
            padding: 0.6rem 1rem;
            font-size: 0.65rem;
          }

          .btn-like {
            padding: 0.8rem 1.2rem;
          }

          .creators-grid {
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 0.75rem;
          }
        }

        @media (max-width: 480px) {
          .action-btn {
            padding: 0.5rem 0.8rem;
            font-size: 0.6rem;
          }

          .action-btn svg {
            width: 24px;
            height: 24px;
          }

          .btn-like {
            padding: 0.7rem 1rem;
          }

          .btn-like svg {
            width: 30px;
            height: 30px;
          }
        }
      `}</style>
    </>
  );
}
