"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ModernTopBar from "@/components/ModernTopBar";
import { filterActiveLives } from "@/lib/liveFilters";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Swipe behavior constants
const SWIPE_THRESHOLD_PX = 100;
const SWIPE_ANIMATION_DURATION_MS = 300;
const SWIPE_OUT_DISTANCE_PX = 1000;

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
  const [swiping, setSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [heartPosition, setHeartPosition] = useState({ x: 0, y: 0 });
  
  // Refs
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  // Auth redirect
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

        if (!res.ok) throw new Error("Error loading feed");

        const data = await res.json();
        
        const safeLives = filterActiveLives(data.activeLives || []);
        const uniqueProfiles = Array.from(
          new Map((data.recommendedProfiles || []).map(item => [item._id, item])).values()
        );
        const uniqueCreators = Array.from(
          new Map((data.featuredCreators || []).map(item => [item._id, item])).values()
        );

        setActiveLives(safeLives);
        setProfiles(uniqueProfiles);
        setFeaturedCreators(uniqueCreators);
        setLoading(false);
      } catch (err) {
        console.error("Feed error:", err);
        setLoading(false);
      }
    };

    fetchFeed();
  }, [session]);

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

  if (status === "loading" || loading) {
    return (
      <div className="modern-page">
        <ModernTopBar />
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '70vh',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  const currentProfile = profiles[currentIndex];
  const hasMoreProfiles = currentIndex < profiles.length;

  return (
    <div className="modern-page">
      <ModernTopBar />

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
      <div className="modern-section">
        <div style={{ padding: '0 1.25rem 1rem' }}>
          {!hasMoreProfiles ? (
            <div className="no-content">
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
                {/* Swipe indicators */}
                {swipeOffset > 50 && (
                  <div className="swipe-indicator like" style={{ opacity: Math.min(swipeOffset / 100, 1) }}>
                    ❤️
                  </div>
                )}
                {swipeOffset < -50 && (
                  <div className="swipe-indicator pass" style={{ opacity: Math.min(Math.abs(swipeOffset) / 100, 1) }}>
                    ❌
                  </div>
                )}

                {currentProfile.avatar ? (
                  <img 
                    src={currentProfile.avatar} 
                    alt={currentProfile.name}
                    className="match-card-image"
                  />
                ) : (
                  <div className="match-card-image" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
                    fontSize: '6rem',
                    fontWeight: 800,
                    color: 'white'
                  }}>
                    {currentProfile.name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}

                <div className="match-card-gradient"></div>

                <div className="match-card-info">
                  <div className="match-card-header">
                    <h2 className="match-card-name">
                      {currentProfile.name}
                      {currentProfile.age && `, ${currentProfile.age}`}
                    </h2>
                    {currentProfile.isOnline && <div className="online-indicator"></div>}
                  </div>
                  <div className="match-card-details">
                    {currentProfile.location && (
                      <span>📍 {currentProfile.location}</span>
                    )}
                  </div>
                  {currentProfile.bio && (
                    <p className="match-card-bio">{currentProfile.bio}</p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="match-actions">
                <button 
                  className="match-btn pass"
                  onClick={handlePass}
                  disabled={swiping}
                >
                  ❌
                </button>

                <button 
                  className="match-btn like"
                  onClick={handleLike}
                  disabled={swiping}
                >
                  ❤️
                </button>

                <button 
                  className="match-btn message"
                  onClick={() => router.push(`/chats?userId=${currentProfile._id}`)}
                  disabled={swiping}
                >
                  💬
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Section 2: LIVE NOW */}
      <div className="live-scroll-section">
        <div className="live-scroll-header">
          <div className="live-icon">🔴</div>
          <span>LIVE NOW</span>
        </div>
        {activeLives.length > 0 ? (
          <div className="live-scroll-container">
            {activeLives.map((live) => (
              <Link 
                key={live._id} 
                href={`/live/${live._id}`}
                className="live-card-compact"
              >
                <div className="live-thumb">
                  {live.thumbnail ? (
                    <img src={live.thumbnail} alt={live.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ 
                      width: '100%', 
                      height: '100%', 
                      background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '3rem'
                    }}>
                      📹
                    </div>
                  )}
                  <div className="live-badge-pulse">🔴 LIVE</div>
                  {live.viewerCount > 0 && (
                    <div className="live-viewers">
                      👁️ {live.viewerCount}
                    </div>
                  )}
                </div>
                <div className="live-info">
                  <div className="live-title">{live.title || "Live Stream"}</div>
                  <div className="live-creator">{live.user?.name || "Creator"}</div>
                  <button className="live-enter-btn">Enter</button>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="no-content">
            <div className="no-content-icon">📡</div>
            <h3>{t("home.noLiveStreams")}</h3>
            <p>{t("home.noLiveMessage")}</p>
            <Link href="/explore" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              {t("home.exploreCreators")}
            </Link>
          </div>
        )}
      </div>

      {/* Section 3: TOP CREATORS */}
      {featuredCreators.length > 0 && (
        <div className="creators-section">
          <div className="creators-header">
            <span>⭐</span>
            <span>TOP CREATORS</span>
          </div>
          <div className="creators-scroll">
            {featuredCreators.map((creator) => (
              <Link
                key={creator._id}
                href={`/profile/${creator._id}`}
                className="creator-story"
              >
                <div className="creator-story-avatar">
                  {creator.avatar ? (
                    <img src={creator.avatar} alt={creator.name} />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: 'white'
                    }}>
                      {creator.name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                </div>
                <div className="creator-story-name">{creator.name}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
