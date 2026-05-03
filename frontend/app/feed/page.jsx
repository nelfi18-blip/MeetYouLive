"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LiveCard from "@/components/LiveCard";
import MatchCard from "@/components/MatchCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const TABS = [
  { id: "for-you", label: "Para Ti", icon: "⭐" },
  { id: "match", label: "Match", icon: "❤️" },
  { id: "live", label: "Live", icon: "🔴" },
  { id: "top", label: "Top", icon: "🔥" },
];

export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("for-you");
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch feed data based on active tab
  const fetchFeed = useCallback(async (reset = false) => {
    if (!session?.backendToken) return;
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const currentPage = reset ? 1 : page;
      let endpoint = "";

      switch (activeTab) {
        case "for-you":
          endpoint = `/api/feed/hybrid?limit=20`;
          break;
        case "match":
          endpoint = `/api/feed/match-only?limit=20`;
          break;
        case "live":
          endpoint = `/api/feed/live-only?limit=20`;
          break;
        case "top":
          endpoint = `/api/feed/top?limit=20`;
          break;
        default:
          endpoint = `/api/feed/hybrid?limit=20`;
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${session.backendToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Error al cargar el feed");
      }

      const data = await response.json();
      const newFeed = data.feed || [];

      if (reset) {
        setFeed(newFeed);
        setPage(2);
      } else {
        setFeed((prev) => [...prev, ...newFeed]);
        setPage((p) => p + 1);
      }

      setHasMore(newFeed.length > 0);
    } catch (err) {
      console.error("Feed error:", err);
      setError(err.message || "Error al cargar el feed");
    } finally {
      setLoading(false);
    }
  }, [session, activeTab, page, loading]);

  // Load feed when tab changes
  useEffect(() => {
    if (session?.backendToken) {
      setFeed([]);
      setPage(1);
      setHasMore(true);
      fetchFeed(true);
    }
  }, [activeTab, session]);

  // Handle like action
  const handleLike = async (userId) => {
    if (!session?.backendToken) return;

    try {
      const response = await fetch(`${API_URL}/api/matches/like/${userId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.backendToken}`,
        },
      });

      if (response.ok) {
        // Remove card from feed
        setFeed((prev) => prev.filter((item) => item._id !== userId));
      }
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  // Handle skip action
  const handleSkip = (userId) => {
    // Simply remove from feed (client-side only for now)
    setFeed((prev) => prev.filter((item) => item._id !== userId));
  };

  // Handle chat action
  const handleChat = (userId) => {
    router.push(`/chats?user=${userId}`);
  };

  // Handle join live
  const handleJoinLive = (liveId) => {
    router.push(`/live/${liveId}`);
  };

  if (status === "loading") {
    return (
      <div className="feed-page">
        <div className="feed-loading">
          <div className="spinner"></div>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="feed-page">
        <div className="feed-container">
          {/* Header */}
          <div className="feed-header">
            <h1 className="feed-title">Descubre</h1>
            <p className="feed-subtitle">Encuentra personas increíbles y streams en vivo</p>
          </div>

          {/* Tabs */}
          <div className="feed-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`feed-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="feed-error">
              <p>{error}</p>
              <button onClick={() => fetchFeed(true)}>Reintentar</button>
            </div>
          )}

          {/* Feed content */}
          <div className="feed-content">
            {feed.length === 0 && !loading && (
              <div className="feed-empty">
                <div className="empty-icon">
                  {activeTab === "live" ? "🎥" : activeTab === "match" ? "💕" : "⭐"}
                </div>
                <h3>No hay contenido disponible</h3>
                <p>
                  {activeTab === "live"
                    ? "No hay streams en vivo ahora. ¡Vuelve pronto!"
                    : activeTab === "match"
                    ? "No hay más perfiles para mostrar. ¡Vuelve más tarde!"
                    : "No hay contenido disponible ahora."}
                </p>
              </div>
            )}

            {feed.map((item, idx) => {
              if (item.type === "live") {
                return (
                  <div key={`live-${item._id}-${idx}`} className="feed-item">
                    <LiveCard live={item} />
                  </div>
                );
              } else if (item.type === "match") {
                return (
                  <div key={`match-${item._id}-${idx}`} className="feed-item">
                    <MatchCard
                      user={item}
                      onLike={handleLike}
                      onSkip={handleSkip}
                      onChat={handleChat}
                      isMatch={false}
                      hooks={{
                        visitCount: 0,
                        hasGreeting: false,
                        isLiveNow: false,
                      }}
                    />
                  </div>
                );
              }
              return null;
            })}

            {/* Loading indicator */}
            {loading && (
              <div className="feed-loading">
                <div className="spinner"></div>
              </div>
            )}

            {/* Load more button */}
            {!loading && hasMore && feed.length > 0 && (
              <div className="feed-load-more">
                <button onClick={() => fetchFeed(false)} className="load-more-btn">
                  Cargar más
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .feed-page {
          min-height: 100vh;
          background: linear-gradient(135deg, rgba(15,8,32,1) 0%, rgba(30,12,60,1) 100%);
          padding: 2rem 1rem;
        }

        .feed-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .feed-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .feed-title {
          font-size: 2.5rem;
          font-weight: 900;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 0.5rem 0;
        }

        .feed-subtitle {
          font-size: 1rem;
          color: var(--text-muted);
          margin: 0;
        }

        .feed-tabs {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }

        .feed-tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border-radius: 999px;
          border: 2px solid rgba(139,92,246,0.3);
          background: rgba(30,12,60,0.5);
          color: var(--text-muted);
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .feed-tab:hover {
          border-color: rgba(139,92,246,0.6);
          background: rgba(30,12,60,0.8);
          color: var(--text);
        }

        .feed-tab.active {
          border-color: #e040fb;
          background: linear-gradient(135deg, rgba(224,64,251,0.2), rgba(139,92,246,0.2));
          color: #e040fb;
          box-shadow: 0 0 20px rgba(224,64,251,0.3);
        }

        .tab-icon {
          font-size: 1.2rem;
          line-height: 1;
        }

        .tab-label {
          line-height: 1;
        }

        .feed-error {
          text-align: center;
          padding: 2rem;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius);
          margin-bottom: 2rem;
        }

        .feed-error p {
          color: #fca5a5;
          margin-bottom: 1rem;
        }

        .feed-error button {
          padding: 0.5rem 1rem;
          background: rgba(239,68,68,0.2);
          border: 1px solid rgba(239,68,68,0.5);
          color: #fca5a5;
          border-radius: var(--radius);
          cursor: pointer;
          font-weight: 600;
        }

        .feed-content {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 2rem;
          margin-bottom: 2rem;
        }

        .feed-item {
          display: flex;
          justify-content: center;
        }

        .feed-empty {
          grid-column: 1 / -1;
          text-align: center;
          padding: 4rem 2rem;
        }

        .empty-icon {
          font-size: 5rem;
          margin-bottom: 1rem;
        }

        .feed-empty h3 {
          font-size: 1.5rem;
          color: var(--text);
          margin-bottom: 0.5rem;
        }

        .feed-empty p {
          font-size: 1rem;
          color: var(--text-muted);
        }

        .feed-loading {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          gap: 1rem;
        }

        .spinner {
          width: 40px;
          height: 40px;
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
          font-size: 0.9rem;
        }

        .feed-load-more {
          grid-column: 1 / -1;
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
        }

        .load-more-btn:hover {
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

          .feed-content {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }

          .feed-tabs {
            gap: 0.3rem;
          }

          .feed-tab {
            padding: 0.6rem 1rem;
            font-size: 0.85rem;
          }

          .tab-icon {
            font-size: 1rem;
          }
        }
      `}</style>
    </>
  );
}
