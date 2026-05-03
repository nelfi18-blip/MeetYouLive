"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import LiveCard from "@/components/LiveCard";
import MatchCard from "@/components/MatchCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch feed data
  useEffect(() => {
    if (!session?.backendToken) return;

    setLoading(true);
    setError("");

    fetch(`${API_URL}/api/feed`, {
      headers: {
        Authorization: `Bearer ${session.backendToken}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(t("common.error"));
        }
        return res.json();
      })
      .then((feedData) => {
        setData(feedData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || t("common.error"));
        setLoading(false);
      });
  }, [session]);

  // Handle advancing to next profile
  const handleNextProfile = () => {
    if (data?.recommendedProfiles && currentMatchIndex < data.recommendedProfiles.length - 1) {
      setCurrentMatchIndex(currentMatchIndex + 1);
    }
  };

  // Handle match actions
  const handleLike = () => {
    // TODO: Send like to backend API
    handleNextProfile();
  };

  const handleSkip = () => {
    // TODO: Track skip event if needed
    handleNextProfile();
  };

  const handleChat = (userId) => {
    router.push(`/chats/${userId}`);
  };

  // Handle creator request
  const handleCreatorRequest = () => {
    router.push("/profile?tab=creator");
  };

  if (status === "loading" || loading) {
    return (
      <div className="home-page">
        <div className="home-loading">
          <div className="spinner"></div>
          <p>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currentMatch = data.recommendedProfiles?.[currentMatchIndex];

  return (
    <>
      <div className="home-page">
        <div className="home-container">
          {/* Error message */}
          {error && (
            <div className="home-error">
              <p>{error}</p>
            </div>
          )}

          {/* Section 1: MATCH - Encuentra tu match */}
          <div className="home-section match-section">
            <div className="section-header">
              <h2 className="section-title">{t("home.findYourMatch")}</h2>
              <p className="section-subtitle">{t("home.matchSubtitle")}</p>
            </div>
            
            {currentMatch ? (
              <div className="match-card-container">
                <MatchCard
                  user={currentMatch}
                  onLike={handleLike}
                  onSkip={handleSkip}
                  onChat={handleChat}
                  isMatch={false}
                />
              </div>
            ) : (
              <div className="empty-state">
                <p>{t("home.noMoreProfiles")}</p>
              </div>
            )}
          </div>

          {/* Section 2: LIVE - En Vivo ahora */}
          {data.activeLives && data.activeLives.length > 0 ? (
            <div className="home-section lives-section">
              <div className="section-header">
                <h2 className="section-title">🔴 {t("home.liveNow")}</h2>
              </div>
              <div className="lives-scroll">
                {data.activeLives.map((live) => (
                  <div key={live._id} className="live-card-wrapper">
                    <LiveCard live={live} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="home-section lives-section">
              <div className="section-header">
                <h2 className="section-title">🔴 {t("home.liveNow")}</h2>
              </div>
              <div className="empty-state-small">
                <p>{t("home.noLiveStreams")}</p>
              </div>
            </div>
          )}

          {/* Section 3: FEATURED CREATORS - Creadores destacados */}
          {data.featuredCreators && data.featuredCreators.length > 0 && (
            <div className="home-section creators-section">
              <div className="section-header">
                <h2 className="section-title">⭐ {t("home.topCreators")}</h2>
              </div>
              <div className="creators-grid">
                {data.featuredCreators.map((creator) => (
                  <div key={creator._id} className="creator-card">
                    <div className="creator-avatar">
                      <img 
                        src={creator.avatar || "/default-avatar.png"} 
                        alt={creator.name}
                      />
                      <div className="creator-badge">⭐</div>
                    </div>
                    <h3 className="creator-name">{creator.name}</h3>
                    <p className="creator-earnings">
                      💰 {creator.earningsCoins || 0} coins
                    </p>
                    <button 
                      className="creator-btn"
                      onClick={() => router.push(`/profile/${creator._id}`)}
                    >
                      {t("home.seeAll")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: CREATOR CTA - Lower on page */}
          <div className="home-section cta-section">
            <div className="creator-cta-card">
              <div className="cta-icon">🎥</div>
              <h3 className="cta-title">{t("home.becomeCreator")}</h3>
              <p className="cta-desc">{t("home.becomeCreatorDesc")}</p>
              <button className="cta-btn" onClick={handleCreatorRequest}>
                {t("home.becomeCreator")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .home-page {
          min-height: 100vh;
          background: linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%);
          padding: 1rem 0.5rem 5rem;
        }

        .home-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .home-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem;
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

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .home-loading p {
          color: var(--text-muted);
          font-size: 1rem;
        }

        .home-error {
          text-align: center;
          padding: 1rem;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius);
          margin-bottom: 1.5rem;
          color: #fca5a5;
        }

        .home-section {
          margin-bottom: 2.5rem;
        }

        .section-header {
          margin-bottom: 1.5rem;
        }

        .section-title {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 0.5rem 0;
        }

        .section-subtitle {
          font-size: 1rem;
          color: var(--text-muted);
          margin: 0;
        }

        /* Match Section */
        .match-section {
          margin-bottom: 2rem;
        }

        .match-card-container {
          max-width: 500px;
          margin: 0 auto;
        }

        /* Lives Section */
        .lives-section {
          margin-bottom: 2rem;
        }

        .lives-scroll {
          display: flex;
          gap: 1rem;
          overflow-x: auto;
          padding-bottom: 1rem;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: rgba(139,92,246,0.5) rgba(30,12,60,0.3);
        }

        .lives-scroll::-webkit-scrollbar {
          height: 6px;
        }

        .lives-scroll::-webkit-scrollbar-track {
          background: rgba(30,12,60,0.3);
          border-radius: 3px;
        }

        .lives-scroll::-webkit-scrollbar-thumb {
          background: rgba(139,92,246,0.5);
          border-radius: 3px;
        }

        .live-card-wrapper {
          flex: 0 0 300px;
          max-width: 300px;
        }

        /* Creators Section */
        .creators-section {
          margin-bottom: 2rem;
        }

        .creators-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 1rem;
        }

        .creator-card {
          background: rgba(30,12,60,0.6);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: var(--radius);
          padding: 1rem;
          text-align: center;
          transition: all 0.3s;
        }

        .creator-card:hover {
          border-color: rgba(139,92,246,0.6);
          background: rgba(30,12,60,0.8);
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }

        .creator-avatar {
          width: 80px;
          height: 80px;
          margin: 0 auto 0.75rem;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid rgba(139,92,246,0.5);
          position: relative;
        }

        .creator-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .creator-badge {
          position: absolute;
          bottom: -3px;
          right: -3px;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          border: 2px solid var(--bg);
        }

        .creator-name {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 0.5rem 0;
        }

        .creator-earnings {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: 0.25rem 0 0.75rem;
        }

        .creator-btn {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, rgba(224,64,251,0.2), rgba(139,92,246,0.2));
          border: 2px solid rgba(224,64,251,0.5);
          color: #e040fb;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
          font-size: 0.85rem;
        }

        .creator-btn:hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3));
          border-color: #e040fb;
          box-shadow: 0 0 20px rgba(224,64,251,0.3);
        }

        /* Creator CTA Section */
        .cta-section {
          margin-top: 3rem;
        }

        .creator-cta-card {
          background: linear-gradient(135deg, rgba(30,12,60,0.8) 0%, rgba(12,5,25,0.9) 100%);
          border: 1px solid rgba(139,92,246,0.4);
          border-radius: var(--radius);
          padding: 2rem;
          text-align: center;
          max-width: 500px;
          margin: 0 auto;
        }

        .cta-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .cta-title {
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 0.75rem 0;
        }

        .cta-desc {
          font-size: 1rem;
          color: var(--text-muted);
          margin: 0 0 1.5rem 0;
          line-height: 1.5;
        }

        .cta-btn {
          padding: 0.75rem 2rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          border: none;
          color: white;
          border-radius: 999px;
          font-weight: 800;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 15px rgba(224,64,251,0.3);
        }

        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 25px rgba(224,64,251,0.5);
        }

        /* Empty States */
        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
          background: rgba(30,12,60,0.5);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: var(--radius);
          color: var(--text-muted);
        }

        .empty-state-small {
          text-align: center;
          padding: 1.5rem 1rem;
          background: rgba(30,12,60,0.5);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: var(--radius);
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        /* Mobile Optimizations */
        @media (max-width: 768px) {
          .home-page {
            padding: 0.5rem 0.25rem 5rem;
          }

          .section-title {
            font-size: 1.3rem;
          }

          .section-subtitle {
            font-size: 0.9rem;
          }

          .home-section {
            margin-bottom: 2rem;
          }

          .creators-grid {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 0.75rem;
          }

          .creator-avatar {
            width: 70px;
            height: 70px;
          }

          .creator-name {
            font-size: 0.9rem;
          }

          .creator-earnings {
            font-size: 0.8rem;
          }

          .live-card-wrapper {
            flex: 0 0 280px;
            max-width: 280px;
          }

          .creator-cta-card {
            padding: 1.5rem;
          }

          .cta-icon {
            font-size: 2.5rem;
          }

          .cta-title {
            font-size: 1.2rem;
          }

          .cta-desc {
            font-size: 0.9rem;
          }
        }
      `}</style>
    </>
  );
}
