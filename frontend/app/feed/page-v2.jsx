"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ModernTopBar from "@/components/ModernTopBar";
import SwipeCard from "@/components/SwipeCard";
import SwipeActions from "@/components/SwipeActions";
import StoriesBar from "@/components/StoriesBar";
import { filterActiveLives } from "@/lib/liveFilters";
import { useLanguage } from "@/contexts/LanguageContext";
import { getUserImage, getLiveThumbnail, getDisplayName } from "@/lib/imageHelpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ModernFeedPageV2() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  
  // State
  const [activeLives, setActiveLives] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [stories, setStories] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swipeHistory, setSwipeHistory] = useState([]);

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
        
        // Create stories from active lives and creators
        const storyItems = [
          ...safeLives.slice(0, 10).map(live => ({
            _id: live._id,
            userId: live.hostId,
            user: live.host,
            isLive: true,
            hasUnseenStory: true,
          })),
          ...uniqueCreators.slice(0, 5).map(creator => ({
            _id: creator._id,
            userId: creator._id,
            user: creator,
            isLive: false,
            hasUnseenStory: Math.random() > 0.5,
          })),
        ];
        setStories(storyItems);
        
        setLoading(false);
      } catch (err) {
        console.error("Feed error:", err);
        setLoading(false);
      }
    };

    fetchFeed();
  }, [session]);

  const handleSwipe = async (profileId, direction) => {
    if (direction === "right") {
      await handleLike(profileId);
    } else {
      handlePass(profileId);
    }
  };

  const handleRewind = () => {
    if (swipeHistory.length === 0) return;
    
    const lastSwipe = swipeHistory[swipeHistory.length - 1];
    setSwipeHistory(prev => prev.slice(0, -1));
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handlePass = (profileId) => {
    setSwipeHistory(prev => [...prev, { profileId, action: 'pass' }]);
    setCurrentIndex(prev => prev + 1);
  };

  const handleStar = async () => {
    const currentProfile = profiles[currentIndex];
    if (!currentProfile) return;

    // Super like functionality
    try {
      await fetch(`${API_URL}/api/match/superlike`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify({ userId: currentProfile._id }),
      });
      
      setSwipeHistory(prev => [...prev, { profileId: currentProfile._id, action: 'star' }]);
      setCurrentIndex(prev => prev + 1);
    } catch (err) {
      console.error("Super like error:", err);
    }
  };

  const handleLike = async (profileId) => {
    try {
      await fetch(`${API_URL}/api/match/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify({ userId: profileId }),
      });
      
      setSwipeHistory(prev => [...prev, { profileId, action: 'like' }]);
      setCurrentIndex(prev => prev + 1);
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  const handleBoost = () => {
    // Boost profile visibility (premium feature)
    alert("Boost feature - Premium!");
  };

  if (status === "loading" || loading) {
    return (
      <div className="page-container">
        <ModernTopBar />
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '60vh' 
        }}>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  const currentProfile = profiles[currentIndex];
  const nextProfile = profiles[currentIndex + 1];
  const hasMoreProfiles = currentIndex < profiles.length;

  return (
    <div className="page-container">
      <ModernTopBar />
      
      <div className="feed-modern-container">
        {/* Stories Bar */}
        {stories.length > 0 && <StoriesBar stories={stories} />}

        {/* Live Streams Section */}
        {activeLives.length > 0 && (
          <section className="live-section-compact">
            <div className="section-header-inline">
              <h2 className="section-title">🔴 En Vivo</h2>
              <Link href="/explore" className="section-link">Ver todos</Link>
            </div>
            
            <div className="live-scroll-horizontal">
              {activeLives.slice(0, 8).map((live) => {
                const thumbnail = getLiveThumbnail(live);
                const hostName = getDisplayName(live.host);
                const viewers = live.viewerCount || 0;

                return (
                  <Link 
                    href={`/live/${live._id}`} 
                    key={live._id}
                    className="live-card-compact"
                  >
                    <div className="live-card-thumb">
                      {thumbnail ? (
                        <img src={thumbnail} alt={hostName} />
                      ) : (
                        <div className="live-card-placeholder">
                          <span>{hostName[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <div className="live-badge-top">LIVE</div>
                      <div className="live-viewers-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                        </svg>
                        {viewers}
                      </div>
                    </div>
                    <div className="live-card-info-compact">
                      <p className="live-card-name">{hostName}</p>
                      {live.title && (
                        <p className="live-card-title">{live.title}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Swipe Cards Section */}
        <section className="swipe-section">
          <div className="swipe-cards-stack">
            {!hasMoreProfiles ? (
              <div className="no-more-profiles">
                <div className="no-more-icon">😊</div>
                <h3>¡Has visto todos los perfiles!</h3>
                <p>Vuelve más tarde para ver nuevos perfiles</p>
                <Link href="/explore" className="btn btn-primary">
                  Ver Directos en Vivo
                </Link>
              </div>
            ) : (
              <>
                {/* Show next profile in background */}
                {nextProfile && (
                  <SwipeCard
                    profile={nextProfile}
                    style={{
                      opacity: 0.5,
                      transform: 'scale(0.95)',
                    }}
                    zIndex={1}
                  />
                )}
                
                {/* Current profile */}
                {currentProfile && (
                  <SwipeCard
                    profile={currentProfile}
                    onSwipe={handleSwipe}
                    style={{}}
                    zIndex={2}
                  />
                )}
              </>
            )}
          </div>

          {/* Swipe Actions */}
          {hasMoreProfiles && (
            <SwipeActions
              onRewind={handleRewind}
              onPass={() => handlePass(currentProfile?._id)}
              onStar={handleStar}
              onLike={() => handleLike(currentProfile?._id)}
              onBoost={handleBoost}
              canRewind={swipeHistory.length > 0}
              disabled={!currentProfile}
            />
          )}
        </section>

        {/* Featured Creators Section */}
        {featuredCreators.length > 0 && (
          <section className="creators-section-compact">
            <div className="section-header-inline">
              <h2 className="section-title">⭐ Top Creadores</h2>
              <Link href="/explore?tab=creators" className="section-link">Ver todos</Link>
            </div>
            
            <div className="creators-grid-compact">
              {featuredCreators.slice(0, 6).map((creator) => {
                const avatar = getUserImage(creator);
                const name = getDisplayName(creator);

                return (
                  <Link 
                    href={`/profile/${creator._id}`}
                    key={creator._id}
                    className="creator-card-mini"
                  >
                    {avatar ? (
                      <img src={avatar} alt={name} className="creator-avatar-mini" />
                    ) : (
                      <div className="creator-avatar-placeholder">
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                    <p className="creator-name-mini">{name}</p>
                    {creator.isVerified && (
                      <span className="verify-badge-mini">✓</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
