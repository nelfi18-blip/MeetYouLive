"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LiveCard from "@/components/LiveCard";
import MatchCard from "@/components/MatchCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Section 1: Live Now (horizontal scroll)
  const [liveNowStreams, setLiveNowStreams] = useState([]);
  const [loadingLiveNow, setLoadingLiveNow] = useState(false);
  
  // Section 2: Match Swipe (single card)
  const [currentMatchProfile, setCurrentMatchProfile] = useState(null);
  const [matchQueue, setMatchQueue] = useState([]);
  const [loadingMatch, setLoadingMatch] = useState(false);
  
  // Section 3: Top Creators
  const [topCreators, setTopCreators] = useState([]);
  const [loadingTopCreators, setLoadingTopCreators] = useState(false);
  
  // Section 4: Live Grid (infinite scroll)
  const [liveGridStreams, setLiveGridStreams] = useState([]);
  const [loadingLiveGrid, setLoadingLiveGrid] = useState(false);
  const [liveGridPage, setLiveGridPage] = useState(1);
  const [hasMoreLiveGrid, setHasMoreLiveGrid] = useState(true);
  
  const [error, setError] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch Section 1: Live Now (horizontal scroll)
  const fetchLiveNow = useCallback(async () => {
    if (!session?.backendToken || loadingLiveNow) return;
    
    setLoadingLiveNow(true);
    try {
      const response = await fetch(`${API_URL}/api/feed/live-only?limit=10`, {
        headers: { Authorization: `Bearer ${session.backendToken}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setLiveNowStreams(data.feed || []);
      }
    } catch (err) {
      console.error("Error fetching live now:", err);
    } finally {
      setLoadingLiveNow(false);
    }
  }, [session?.backendToken, loadingLiveNow]);

  // Fetch Section 2: Match profiles queue
  const fetchMatchProfiles = useCallback(async () => {
    if (!session?.backendToken || loadingMatch) return;
    
    setLoadingMatch(true);
    try {
      const response = await fetch(`${API_URL}/api/feed/match-only?limit=10`, {
        headers: { Authorization: `Bearer ${session.backendToken}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        const profiles = data.feed || [];
        if (profiles.length > 0) {
          setCurrentMatchProfile(profiles[0]);
          setMatchQueue(profiles.slice(1));
        }
      }
    } catch (err) {
      console.error("Error fetching match profiles:", err);
    } finally {
      setLoadingMatch(false);
    }
  }, [session?.backendToken, loadingMatch]);

  // Fetch Section 3: Top Creators
  const fetchTopCreators = useCallback(async () => {
    if (!session?.backendToken || loadingTopCreators) return;
    
    setLoadingTopCreators(true);
    try {
      const response = await fetch(`${API_URL}/api/rankings/top?limit=6`, {
        headers: { Authorization: `Bearer ${session.backendToken}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setTopCreators(data.creators || []);
      }
    } catch (err) {
      console.error("Error fetching top creators:", err);
    } finally {
      setLoadingTopCreators(false);
    }
  }, [session?.backendToken, loadingTopCreators]);

  // Fetch Section 4: Live Grid (infinite scroll)
  const fetchLiveGrid = useCallback(async (reset = false) => {
    if (!session?.backendToken || loadingLiveGrid) return;
    
    setLoadingLiveGrid(true);
    try {
      const currentPage = reset ? 1 : liveGridPage;
      const response = await fetch(`${API_URL}/api/feed/live-only?limit=12`, {
        headers: { Authorization: `Bearer ${session.backendToken}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        const newStreams = data.feed || [];
        
        if (reset) {
          setLiveGridStreams(newStreams);
          setLiveGridPage(2);
        } else {
          setLiveGridStreams(prev => [...prev, ...newStreams]);
          setLiveGridPage(p => p + 1);
        }
        
        setHasMoreLiveGrid(newStreams.length > 0);
      }
    } catch (err) {
      console.error("Error fetching live grid:", err);
    } finally {
      setLoadingLiveGrid(false);
    }
  }, [session?.backendToken, loadingLiveGrid, liveGridPage]);

  // Load all sections on mount
  useEffect(() => {
    if (session?.backendToken) {
      fetchLiveNow();
      fetchMatchProfiles();
      fetchTopCreators();
      fetchLiveGrid(true);
    }
  }, [session?.backendToken]);

  // Handle match actions
  const handleLike = async (userId) => {
    if (!session?.backendToken) return;

    try {
      const response = await fetch(`${API_URL}/api/matches/like/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.backendToken}` },
      });

      if (response.ok) {
        // Move to next profile
        moveToNextProfile();
      }
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  const handleSkip = (userId) => {
    // Move to next profile (client-side only)
    moveToNextProfile();
  };

  const moveToNextProfile = () => {
    if (matchQueue.length > 0) {
      setCurrentMatchProfile(matchQueue[0]);
      setMatchQueue(prev => prev.slice(1));
      
      // Fetch more profiles if running low
      if (matchQueue.length < 3) {
        fetchMatchProfiles();
      }
    } else {
      setCurrentMatchProfile(null);
      fetchMatchProfiles();
    }
  };

  const handleChat = (userId) => {
    router.push(`/chats?user=${userId}`);
  };

  const handleJoinLive = (liveId) => {
    router.push(`/live/${liveId}`);
  };

  const handleSendGift = async (userId, liveId) => {
    if (!session?.backendToken) return;
    if (liveId) {
      router.push(`/live/${liveId}?openGifts=true`);
    } else {
      alert("Los regalos solo están disponibles durante streams en vivo");
    }
  };

  const handleSendGreeting = async (userId) => {
    if (!session?.backendToken) return;

    try {
      const response = await fetch(`${API_URL}/api/feed/send-greeting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify({ userId, message: "👋" }),
      });

      if (response.ok) {
        alert("¡Saludo enviado!");
      } else {
        alert("Error al enviar el saludo");
      }
    } catch (err) {
      console.error("Send greeting error:", err);
      alert("Error al enviar el saludo");
    }
  };

  const handleUnlockChat = async (userId) => {
    if (!session?.backendToken) return;
    router.push(`/chats?user=${userId}`);
  };

  if (status === "loading") {
    return (
      <div className="home-page">
        <div className="home-loading">
          <div className="spinner"></div>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="home-page">
        <div className="home-container">
          
          {/* Hero Section */}
          <div className="home-hero">
            <h1 className="home-title">Descubre Personas Increíbles</h1>
            <p className="home-subtitle">Streams en vivo • Conexiones reales • Comunidad activa</p>
          </div>

          {/* Section 1: LIVE NOW (horizontal scroll) */}
          <section className="home-section live-now-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="live-pulse">🔴</span> En Vivo Ahora
              </h2>
              <button 
                className="section-link"
                onClick={() => router.push('/explore')}
              >
                Ver todos →
              </button>
            </div>
            
            {loadingLiveNow ? (
              <div className="section-loading">
                <div className="spinner-sm"></div>
              </div>
            ) : liveNowStreams.length === 0 ? (
              <div className="section-empty">
                <p>No hay streams en vivo ahora. ¡Vuelve pronto!</p>
              </div>
            ) : (
              <div className="live-now-scroll">
                {liveNowStreams.map((item) => (
                  <div key={item._id} className="live-now-card">
                    <LiveCard live={item} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: MATCH (Swipe) */}
          <section className="home-section match-section">
            <div className="section-header">
              <h2 className="section-title">
                <span>❤️</span> Encuentra Tu Match
              </h2>
              <button 
                className="section-link"
                onClick={() => router.push('/matches')}
              >
                Ver matches →
              </button>
            </div>
            
            {loadingMatch ? (
              <div className="section-loading">
                <div className="spinner-sm"></div>
              </div>
            ) : !currentMatchProfile ? (
              <div className="section-empty">
                <p>No hay más perfiles disponibles. ¡Vuelve más tarde!</p>
              </div>
            ) : (
              <div className="match-swipe-container">
                <MatchCard
                  user={currentMatchProfile}
                  onLike={handleLike}
                  onSkip={handleSkip}
                  onChat={handleChat}
                  isMatch={false}
                  hooks={{
                    visitCount: 0,
                    hasGreeting: false,
                    isLiveNow: false,
                  }}
                  onSendGift={handleSendGift}
                  onSendGreeting={handleSendGreeting}
                  onUnlockChat={handleUnlockChat}
                  onJoinLive={handleJoinLive}
                />
              </div>
            )}
          </section>

          {/* Section 3: TOP CREATORS */}
          <section className="home-section top-creators-section">
            <div className="section-header">
              <h2 className="section-title">
                <span>🔥</span> Top Creadores
              </h2>
              <button 
                className="section-link"
                onClick={() => router.push('/ranking')}
              >
                Ver ranking →
              </button>
            </div>
            
            {loadingTopCreators ? (
              <div className="section-loading">
                <div className="spinner-sm"></div>
              </div>
            ) : topCreators.length === 0 ? (
              <div className="section-empty">
                <p>No hay creadores disponibles</p>
              </div>
            ) : (
              <div className="top-creators-grid">
                {topCreators.map((creator, index) => (
                  <div 
                    key={creator._id} 
                    className="top-creator-card"
                    onClick={() => router.push(`/profile/${creator._id}`)}
                  >
                    <div className="creator-rank">#{index + 1}</div>
                    <div className="creator-avatar">
                      {creator.avatar ? (
                        <img src={creator.avatar} alt={creator.username} />
                      ) : (
                        <div className="creator-avatar-placeholder">
                          {(creator.username || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="creator-info">
                      <h3 className="creator-name">{creator.username}</h3>
                      <p className="creator-coins">
                        💰 {creator.totalCoinsEarned?.toLocaleString() || 0} coins
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 4: LIVE GRID (infinite scroll) */}
          <section className="home-section live-grid-section">
            <div className="section-header">
              <h2 className="section-title">
                <span>📺</span> Todos los Lives
              </h2>
            </div>
            
            {liveGridStreams.length === 0 && !loadingLiveGrid ? (
              <div className="section-empty">
                <p>No hay streams disponibles</p>
              </div>
            ) : (
              <>
                <div className="live-grid">
                  {liveGridStreams.map((item) => (
                    <div key={item._id} className="live-grid-card">
                      <LiveCard live={item} />
                    </div>
                  ))}
                </div>
                
                {loadingLiveGrid && (
                  <div className="section-loading">
                    <div className="spinner-sm"></div>
                  </div>
                )}
                
                {!loadingLiveGrid && hasMoreLiveGrid && liveGridStreams.length > 0 && (
                  <div className="load-more-container">
                    <button 
                      onClick={() => fetchLiveGrid(false)} 
                      className="load-more-btn"
                    >
                      Cargar más
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

        </div>
      </div>

      <style jsx>{`
        .home-page {
          min-height: 100vh;
          background: linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%);
          padding: 2rem 1rem;
        }

        .home-container {
          max-width: 1400px;
          margin: 0 auto;
        }

        .home-hero {
          text-align: center;
          margin-bottom: 3rem;
          padding: 2rem 0;
        }

        .home-title {
          font-size: 3rem;
          font-weight: 900;
          background: linear-gradient(135deg, #e040fb, #8b5cf6, #06b6d4);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 1rem 0;
          line-height: 1.2;
        }

        .home-subtitle {
          font-size: 1.2rem;
          color: var(--text-muted);
          margin: 0;
        }

        .home-section {
          margin-bottom: 4rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .section-title {
          font-size: 1.8rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .live-pulse {
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .section-link {
          background: transparent;
          border: none;
          color: #e040fb;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          padding: 0.5rem 1rem;
        }

        .section-link:hover {
          color: #f472b6;
          transform: translateX(4px);
        }

        /* Section 1: Live Now Horizontal Scroll */
        .live-now-scroll {
          display: flex;
          gap: 1.5rem;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 1rem 0.5rem;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }

        .live-now-scroll::-webkit-scrollbar {
          height: 8px;
        }

        .live-now-scroll::-webkit-scrollbar-track {
          background: rgba(30,12,60,0.5);
          border-radius: 4px;
        }

        .live-now-scroll::-webkit-scrollbar-thumb {
          background: rgba(139,92,246,0.5);
          border-radius: 4px;
        }

        .live-now-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(139,92,246,0.7);
        }

        .live-now-card {
          flex: 0 0 320px;
          max-width: 320px;
        }

        /* Section 2: Match Swipe */
        .match-swipe-container {
          display: flex;
          justify-content: center;
          padding: 2rem 0;
        }

        /* Section 3: Top Creators Grid */
        .top-creators-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 1.5rem;
        }

        .top-creator-card {
          background: rgba(30,12,60,0.6);
          border: 2px solid rgba(139,92,246,0.3);
          border-radius: var(--radius);
          padding: 1.5rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s;
          position: relative;
        }

        .top-creator-card:hover {
          border-color: #e040fb;
          background: rgba(30,12,60,0.8);
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(224,64,251,0.3);
        }

        .creator-rank {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: white;
          font-weight: 900;
          font-size: 0.9rem;
          padding: 0.3rem 0.6rem;
          border-radius: 999px;
        }

        .creator-avatar {
          width: 80px;
          height: 80px;
          margin: 0 auto 1rem;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid rgba(224,64,251,0.5);
        }

        .creator-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .creator-avatar-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 900;
          color: white;
        }

        .creator-info {
          margin-top: 0.5rem;
        }

        .creator-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 0.5rem 0;
        }

        .creator-coins {
          font-size: 0.95rem;
          color: var(--text-muted);
          margin: 0;
        }

        /* Section 4: Live Grid */
        .live-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 2rem;
        }

        .live-grid-card {
          display: flex;
          justify-content: center;
        }

        /* Loading States */
        .home-loading,
        .section-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          gap: 1rem;
        }

        .spinner,
        .spinner-sm {
          border: 4px solid rgba(139,92,246,0.2);
          border-top-color: #8b5cf6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .spinner {
          width: 50px;
          height: 50px;
        }

        .spinner-sm {
          width: 30px;
          height: 30px;
          border-width: 3px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .home-loading p,
        .section-loading p {
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        /* Empty States */
        .section-empty {
          text-align: center;
          padding: 3rem 1rem;
          color: var(--text-muted);
        }

        .section-empty p {
          margin: 0;
          font-size: 1rem;
        }

        /* Load More */
        .load-more-container {
          display: flex;
          justify-content: center;
          padding: 2rem;
        }

        .load-more-btn {
          padding: 0.75rem 2rem;
          background: linear-gradient(135deg, rgba(224,64,251,0.2), rgba(139,92,246,0.2));
          border: 2px solid rgba(224,64,251,0.5);
          color: #e040fb;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 1rem;
        }

        .load-more-btn:hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3));
          border-color: #e040fb;
          box-shadow: 0 0 20px rgba(224,64,251,0.3);
        }

        /* Responsive */
        @media (max-width: 768px) {
          .home-page {
            padding: 1rem 0.5rem;
          }

          .home-title {
            font-size: 2rem;
          }

          .home-subtitle {
            font-size: 1rem;
          }

          .section-title {
            font-size: 1.4rem;
          }

          .live-now-card {
            flex: 0 0 280px;
            max-width: 280px;
          }

          .live-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }

          .top-creators-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
          }

          .section-header {
            flex-wrap: wrap;
            gap: 0.5rem;
          }
        }
      `}</style>
    </>
  );
}
