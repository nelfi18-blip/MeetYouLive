"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LiveCard from "@/components/LiveCard";
import MatchCard from "@/components/MatchCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          throw new Error("Error al cargar el feed");
        }
        return res.json();
      })
      .then((feedData) => {
        setData(feedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Feed error:", err);
        setError(err.message || "Error al cargar el feed");
        setLoading(false);
      });
  }, [session]);

  // Handle join live
  const handleJoinLive = (liveId) => {
    router.push(`/live/${liveId}`);
  };

  if (status === "loading" || loading) {
    return (
      <div className="feed-page">
        <div className="feed-loading">
          <div className="spinner"></div>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="feed-page">
        <div className="feed-container">
          {/* Header */}
          <div className="feed-header">
            <h1 className="feed-title">Feed</h1>
            <p className="feed-subtitle">Descubre personas increíbles y streams en vivo</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="feed-error">
              <p>{error}</p>
            </div>
          )}

          {/* Lives Section */}
          {data.activeLives && data.activeLives.length > 0 && (
            <div className="feed-section">
              <h2 className="section-title">🔴 En Vivo Ahora</h2>
              <div className="lives-grid">
                {data.activeLives.map((live) => (
                  <LiveCard key={live._id} live={live} />
                ))}
              </div>
            </div>
          )}

          {/* Recommended Profiles Section */}
          {data.recommendedProfiles && data.recommendedProfiles.length > 0 && (
            <div className="feed-section">
              <h2 className="section-title">❤️ Usuarios Recomendados</h2>
              <div className="profiles-grid">
                {data.recommendedProfiles.map((user) => (
                  <div key={user._id} className="profile-card">
                    <div className="profile-avatar">
                      <img 
                        src={user.avatar || "/default-avatar.png"} 
                        alt={user.name}
                      />
                    </div>
                    <h3 className="profile-name">{user.name}</h3>
                    {user.age && <p className="profile-age">{user.age} años</p>}
                    {user.location && <p className="profile-location">📍 {user.location}</p>}
                    <button 
                      className="profile-btn"
                      onClick={() => router.push(`/profile/${user._id}`)}
                    >
                      Ver Perfil
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Featured Creators Section */}
          {data.featuredCreators && data.featuredCreators.length > 0 && (
            <div className="feed-section">
              <h2 className="section-title">⭐ Creadores Destacados</h2>
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
                      Ver Perfil
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .feed-page {
          min-height: 100vh;
          background: linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%);
          padding: 2rem 1rem;
        }

        .feed-container {
          max-width: 1400px;
          margin: 0 auto;
        }

        .feed-header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .feed-title {
          font-size: 3rem;
          font-weight: 900;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 0.5rem 0;
        }

        .feed-subtitle {
          font-size: 1.1rem;
          color: var(--text-muted);
          margin: 0;
        }

        .feed-error {
          text-align: center;
          padding: 2rem;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius);
          margin-bottom: 2rem;
          color: #fca5a5;
        }

        .feed-loading {
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

        .feed-loading p {
          color: var(--text-muted);
          font-size: 1rem;
        }

        .feed-section {
          margin-bottom: 4rem;
        }

        .section-title {
          font-size: 1.8rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 1.5rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .lives-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        .profiles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .creators-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .profile-card, .creator-card {
          background: rgba(30,12,60,0.6);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: var(--radius);
          padding: 1.5rem;
          text-align: center;
          transition: all 0.3s;
        }

        .profile-card:hover, .creator-card:hover {
          border-color: rgba(139,92,246,0.6);
          background: rgba(30,12,60,0.8);
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }

        .profile-avatar, .creator-avatar {
          width: 100px;
          height: 100px;
          margin: 0 auto 1rem;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid rgba(139,92,246,0.5);
          position: relative;
        }

        .profile-avatar img, .creator-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .creator-badge {
          position: absolute;
          bottom: -5px;
          right: -5px;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          border: 2px solid var(--bg);
        }

        .profile-name, .creator-name {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 0.5rem 0;
        }

        .profile-age, .profile-location, .creator-earnings {
          font-size: 0.9rem;
          color: var(--text-muted);
          margin: 0.25rem 0;
        }

        .profile-btn, .creator-btn {
          margin-top: 1rem;
          padding: 0.6rem 1.5rem;
          background: linear-gradient(135deg, rgba(224,64,251,0.2), rgba(139,92,246,0.2));
          border: 2px solid rgba(224,64,251,0.5);
          color: #e040fb;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
        }

        .profile-btn:hover, .creator-btn:hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3));
          border-color: #e040fb;
          box-shadow: 0 0 20px rgba(224,64,251,0.3);
        }

        @media (max-width: 768px) {
          .feed-page {
            padding: 1rem 0.5rem;
          }

          .feed-title {
            font-size: 2rem;
          }

          .section-title {
            font-size: 1.4rem;
          }

          .lives-grid, .profiles-grid, .creators-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
