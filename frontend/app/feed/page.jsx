"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { filterActiveLives } from "@/lib/liveFilters";
import { useLanguage } from "@/contexts/LanguageContext";
import { getUserImage, getLiveThumbnail, getDisplayName, getInitial, getGradientForUser } from "@/lib/imageHelpers";
import { fetchUserRole } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Hard ceiling on how long we sit on the loading spinner waiting for the
// NextAuth session to hydrate or the backend token to arrive. After this we
// surface the error fallback (with a retry button) so the page never stays
// loading forever.
const TOKEN_WAIT_TIMEOUT_MS = 8000;

export default function ModernFeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  // State
  const [activeLives, setActiveLives] = useState([]);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [livesLoading, setLivesLoading] = useState(true);

  // Auth redirect
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/feed");
    }
  }, [status, router]);

  // Safety net: never sit on the loading spinner forever.
  useEffect(() => {
    if (status === "authenticated" && session?.backendToken) return;
    if (status === "unauthenticated") return; // redirect effect handles this

    const tokenWaitTimeout = setTimeout(() => {
      console.warn(
        `[Feed] Session/token not ready after ${TOKEN_WAIT_TIMEOUT_MS}ms — showing fallback`
      );
      setLivesLoading(false);
      setLoading(false);
      setError(
        (t && t("feed.serverStarting")) ||
          "El servidor está tardando en responder. Por favor, intenta de nuevo."
      );
    }, TOKEN_WAIT_TIMEOUT_MS);

    return () => clearTimeout(tokenWaitTimeout);
  }, [status, session?.backendToken, t]);

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
    if (status !== "authenticated" || !session?.backendToken) return;

    let isCancelled = false;
    let loadingTimeout = null;
    const controller = new AbortController();

    const fetchFeed = async () => {
      loadingTimeout = setTimeout(() => {
        if (!isCancelled) {
          console.warn("[Feed] Timeout reached (15s) - aborting request");
          controller.abort();
        }
      }, 15000);

      try {
        const feedRes = await fetch(`${API_URL}/api/feed`, {
          headers: {
            Authorization: `Bearer ${session.backendToken}`,
          },
          signal: controller.signal,
          cache: "no-store",
        });

        if (isCancelled) return;

        clearTimeout(loadingTimeout);

        if (!feedRes.ok) {
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

        const safeLives = filterActiveLives(data.activeLives || []);
        const uniqueCreators = Array.from(
          new Map((data.featuredCreators || []).map((item) => [item._id, item])).values()
        );

        setActiveLives(safeLives);
        setFeaturedCreators(uniqueCreators);

        setError(null);
        setLivesLoading(false);
        setLoading(false);
      } catch (err) {
        if (isCancelled) return;

        clearTimeout(loadingTimeout);

        if (err.name === "AbortError") {
          setError(t("feed.serverStarting"));
        } else if (err.name === "TypeError" && err.message.includes("fetch")) {
          setError(t("feed.networkError"));
        } else {
          setError(err.message || t("feed.genericError"));
        }

        setLivesLoading(false);
        setLoading(false);
      }
    };

    fetchFeed();

    return () => {
      isCancelled = true;
      if (loadingTimeout) clearTimeout(loadingTimeout);
      controller.abort();
    };
  }, [status, session?.backendToken, session?.user?.id, t]);

  // Loading state
  if (!error && (status === "loading" || (status === "authenticated" && loading))) {
    return (
      <div className="modern-page">
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "70vh",
          flexDirection: "column",
          gap: "1rem",
        }}>
          <div className="spinner"></div>
          <p style={{ color: "var(--text-muted)" }}>Cargando tu feed...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="modern-page">
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "70vh",
          flexDirection: "column",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "4rem" }}>😔</div>
          <h3 style={{ color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            No pudimos cargar tu feed
          </h3>
          <p style={{ color: "var(--text-muted)", maxWidth: "400px" }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1rem",
              padding: "0.75rem 2rem",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              border: "none",
              borderRadius: "12px",
              color: "white",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modern-page">
      {/* LIVE NOW */}
      <div className="live-scroll-section" style={{ padding: "1rem 0" }}>
        <div className="live-scroll-header" style={{ padding: "0 1rem 0.75rem" }}>
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
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => {
                          e.target.style.display = "none";
                          const fallback = e.target.nextElementSibling;
                          if (fallback) fallback.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div style={{
                      width: "100%",
                      height: "100%",
                      background: gradient,
                      display: liveThumb ? "none" : "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      gap: "0.5rem",
                      position: liveThumb ? "absolute" : "relative",
                      top: 0,
                      left: 0,
                    }}>
                      <div style={{
                        position: "absolute",
                        inset: 0,
                        background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15), transparent 60%)",
                        pointerEvents: "none",
                      }}></div>
                      <div style={{
                        fontSize: "2.5rem",
                        fontWeight: 900,
                        color: "white",
                        textShadow: "0 2px 10px rgba(0, 0, 0, 0.4)",
                        zIndex: 1,
                      }}>
                        {creatorInitial}
                      </div>
                    </div>
                    <div className="live-badge-pulse">🔴 LIVE</div>
                    {live.viewerCount > 0 && (
                      <div className="live-viewers">👁️ {live.viewerCount}</div>
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
          <div className="no-content" style={{ padding: "2rem 1rem" }}>
            <div className="no-content-icon" style={{ fontSize: "3rem" }}>📡</div>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>No hay directos ahora</h3>
            <p style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>Vuelve pronto para ver nuevos directos</p>
            <Link href="/explore" className="btn btn-primary" style={{
              marginTop: "0.5rem",
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              background: "linear-gradient(135deg, #e040fb, #8b5cf6)",
              color: "white",
              borderRadius: "999px",
              fontWeight: 700,
              fontSize: "0.9rem",
              textDecoration: "none",
              transition: "all 0.3s",
              border: "none",
              boxShadow: "0 4px 12px rgba(224, 64, 251, 0.3)",
            }}>
              Explorar creadores
            </Link>
          </div>
        )}
      </div>

      {/* TOP CREATORS */}
      {featuredCreators.length > 0 && (
        <div className="creators-section" style={{ padding: "1rem 0" }}>
          <div className="creators-header" style={{ padding: "0 1rem 0.75rem" }}>
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
                            e.target.style.display = "none";
                            const fallback = e.target.nextElementSibling;
                            if (fallback) fallback.style.display = "flex";
                          }}
                        />
                        <div style={{
                          width: "100%",
                          height: "100%",
                          display: "none",
                          alignItems: "center",
                          justifyContent: "center",
                          background: gradient,
                          fontSize: "2rem",
                          fontWeight: 900,
                          color: "white",
                          textShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
                          position: "absolute",
                          top: 0,
                          left: 0,
                        }}>
                          <span style={{ position: "relative", zIndex: 1 }}>{creatorInitial}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: gradient,
                        fontSize: "2rem",
                        fontWeight: 900,
                        color: "white",
                        textShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
                        position: "relative",
                      }}>
                        <span style={{ position: "relative", zIndex: 1 }}>{creatorInitial}</span>
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
