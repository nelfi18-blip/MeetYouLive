"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LiveCard from "@/components/LiveCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeLives, setActiveLives] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [swiping, setSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [livesLoading, setLivesLoading] = useState(true);
  
  const cardRef = useRef(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch feed data
  useEffect(() => {
    if (!session?.backendToken) return;

    const fetchFeed = async () => {
      try {
        const res = await fetch(`${API_URL}/api/feed`, {
          headers: {
            Authorization: `Bearer ${session.backendToken}`,
          },
        });

        if (!res.ok) throw new Error("Error al cargar el feed");

        const data = await res.json();
        setActiveLives(data.activeLives || []);
        setProfiles(data.recommendedProfiles || []);
        setLivesLoading(false);
        setLoading(false);
      } catch (err) {
        console.error("Feed error:", err);
        setError(err.message || "Error al cargar el feed");
        setLivesLoading(false);
        setLoading(false);
      }
    };

    fetchFeed();
  }, [session]);

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

    const threshold = 100; // px to trigger swipe
    const offset = currentXRef.current - startXRef.current;

    if (Math.abs(offset) > threshold) {
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
    setSwipeOffset(1000);
    
    // Send like to backend
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

    // Move to next card after animation
    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeOffset(0);
    }, 300);
  };

  const handlePass = () => {
    // Animate out
    setSwipeOffset(-1000);

    // Move to next card after animation
    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeOffset(0);
    }, 300);
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
        {/* Top Section: Live Streams */}
        <div className="live-section">
          <h2 className="live-title">🔴 En vivo ahora</h2>
          <div className="live-scroll">
            {livesLoading ? (
              <div className="live-placeholder">
                <div className="spinner-small"></div>
              </div>
            ) : activeLives.length > 0 ? (
              activeLives.map((live) => (
                <div key={live._id} className="live-item">
                  <LiveCard live={live} />
                </div>
              ))
            ) : (
              <div className="no-lives">
                <p>No hay directos en este momento</p>
              </div>
            )}
          </div>
        </div>

        {/* Middle Section: Swipeable Cards */}
        <div className="cards-section">
          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

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
                transition: swiping ? "none" : "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                opacity: Math.abs(swipeOffset) > 100 ? 0.5 : 1,
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
              {swipeOffset > 50 && (
                <div className="swipe-indicator like">
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                  </svg>
                  <span>LIKE</span>
                </div>
              )}
              {swipeOffset < -50 && (
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
                    alt={currentProfile.name}
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

        {/* Bottom Section: Quick Actions */}
        {hasMoreProfiles && currentProfile && (
          <div className="actions-section">
            <button 
              className="action-btn btn-pass"
              onClick={handlePass}
              disabled={swiping}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <button 
              className="action-btn btn-chat"
              onClick={() => handleChat(currentProfile._id)}
              disabled={swiping}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </button>

            <button 
              className="action-btn btn-like"
              onClick={handleLike}
              disabled={swiping}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
            </button>

            <button 
              className="action-btn btn-gift"
              onClick={() => handleGift(currentProfile._id)}
              disabled={swiping}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="8" width="18" height="4" rx="1" />
                <path d="M12 8v13" />
                <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
              </svg>
            </button>

            <button 
              className="action-btn btn-profile"
              onClick={() => handleViewProfile(currentProfile._id)}
              disabled={swiping}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .feed-page {
          min-height: 100vh;
          background: linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%);
          display: flex;
          flex-direction: column;
          padding-bottom: 100px;
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

        /* Live Section */
        .live-section {
          padding: 1rem;
          border-bottom: 1px solid rgba(139,92,246,0.2);
        }

        .live-title {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 1rem 0;
        }

        .live-scroll {
          display: flex;
          gap: 1rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
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

        .live-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 280px;
          height: 200px;
        }

        .no-lives {
          width: 100%;
          text-align: center;
          padding: 2rem;
          color: var(--text-muted);
        }

        /* Cards Section */
        .cards-section {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
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
          margin-bottom: 1rem;
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

        /* Actions Section */
        .actions-section {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          padding: 1.5rem;
          background: linear-gradient(to top, rgba(15,8,32,0.98), rgba(15,8,32,0.95));
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(139,92,246,0.2);
          z-index: 100;
        }

        .action-btn {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-btn:not(:disabled):hover {
          transform: scale(1.1);
        }

        .action-btn:not(:disabled):active {
          transform: scale(0.95);
        }

        .btn-pass {
          background: linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.25));
          border: 2px solid rgba(239,68,68,0.6);
        }

        .btn-pass svg {
          stroke: #fca5a5;
        }

        .btn-pass:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(239,68,68,0.4), rgba(220,38,38,0.4));
          box-shadow: 0 6px 20px rgba(239,68,68,0.4);
        }

        .btn-like {
          width: 68px;
          height: 68px;
          background: linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3));
          border: 3px solid rgba(224,64,251,0.7);
        }

        .btn-like svg {
          fill: #e040fb;
        }

        .btn-like:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.5), rgba(139,92,246,0.5));
          box-shadow: 0 8px 28px rgba(224,64,251,0.5);
        }

        .btn-chat {
          background: linear-gradient(135deg, rgba(59,130,246,0.25), rgba(37,99,235,0.25));
          border: 2px solid rgba(59,130,246,0.6);
        }

        .btn-chat svg {
          stroke: #93c5fd;
        }

        .btn-chat:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(59,130,246,0.4), rgba(37,99,235,0.4));
          box-shadow: 0 6px 20px rgba(59,130,246,0.4);
        }

        .btn-gift {
          background: linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.25));
          border: 2px solid rgba(251,191,36,0.6);
        }

        .btn-gift svg {
          stroke: #fde68a;
        }

        .btn-gift:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(251,191,36,0.4), rgba(245,158,11,0.4));
          box-shadow: 0 6px 20px rgba(251,191,36,0.4);
        }

        .btn-profile {
          background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(124,58,237,0.25));
          border: 2px solid rgba(139,92,246,0.6);
        }

        .btn-profile svg {
          stroke: #c4b5fd;
        }

        .btn-profile:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(139,92,246,0.4), rgba(124,58,237,0.4));
          box-shadow: 0 6px 20px rgba(139,92,246,0.4);
        }

        @media (max-width: 768px) {
          .live-section {
            padding: 0.75rem;
          }

          .live-title {
            font-size: 1.1rem;
            margin-bottom: 0.75rem;
          }

          .live-item {
            width: 240px;
          }

          .cards-section {
            padding: 1rem 0.5rem;
            min-height: 400px;
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

          .actions-section {
            gap: 0.75rem;
            padding: 1rem;
          }

          .action-btn {
            width: 52px;
            height: 52px;
          }

          .btn-like {
            width: 64px;
            height: 64px;
          }
        }

        @media (max-width: 480px) {
          .action-btn {
            width: 48px;
            height: 48px;
          }

          .btn-like {
            width: 60px;
            height: 60px;
          }

          .action-btn svg {
            width: 24px;
            height: 24px;
          }

          .btn-like svg {
            width: 32px;
            height: 32px;
          }
        }
      `}</style>
    </>
  );
}
