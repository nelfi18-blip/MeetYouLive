"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProfileCard from "@/components/ProfileCard";
import LiveCard from "@/components/LiveCard";
import UrgencyBanner from "@/components/UrgencyBanner";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const USERS_PER_PAGE = 20;

const CATEGORIES = ["Todos", "Gaming", "Música", "Charla", "Arte", "Educación", "Otro"];
const CAT_ICONS = {
  Todos: "🌐", Gaming: "🎮", Música: "🎵", Charla: "💬",
  Arte: "🎨", Educación: "📚", Otro: "✨",
};

function LiveTabIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  );
}
function MatchTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}

export default function ExplorePage() {
  const router = useRouter();
  const [tab, setTab] = useState("live");

  // ── Live tab state ──────────────────────────────────────────
  const [lives, setLives] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [liveError, setLiveError] = useState("");

  // ── Discover tab state ─────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [matchIds, setMatchIds] = useState(new Set());
  const [discoverPage, setDiscoverPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState("");
  const [callError, setCallError] = useState("");
  const [superCrushPrice, setSuperCrushPrice] = useState(50);

  // ── Load lives ─────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setLives(Array.isArray(d) ? d : []))
      .catch(() => setLiveError("No se pudo cargar los directos"));

    // Fetch crush config for super crush price
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      fetch(`${API_URL}/api/matches/config`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.superCrushPrice) setSuperCrushPrice(d.superCrushPrice); })
        .catch(() => {});
    }
  }, []);

  // ── Filter lives ───────────────────────────────────────────
  useEffect(() => {
    let result = lives;
    if (category !== "Todos") {
      result = result.filter((l) =>
        (l.category || "").toLowerCase() === category.toLowerCase()
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title?.toLowerCase().includes(q) ||
          l.user?.username?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [lives, category, search]);

  // ── Load discover users ────────────────────────────────────
  const loadUsers = useCallback(async (page) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setDiscoverLoading(true);
    setDiscoverError("");
    try {
      const res = await fetch(
        `${API_URL}/api/user/discover?page=${page}&limit=${USERS_PER_PAGE}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newUsers = data.users || [];
      setUsers((prev) => (page === 1 ? newUsers : [...prev, ...newUsers]));
      setHasMore(newUsers.length === USERS_PER_PAGE);
    } catch {
      setDiscoverError("No se pudo cargar los perfiles");
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "discover" && users.length === 0) {
      loadUsers(1);
    }
  }, [tab, loadUsers, users.length]);

  // ── Like / unlike ──────────────────────────────────────────
  const handleLike = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    const alreadyLiked = likedIds.has(userId);
    try {
      if (alreadyLiked) {
        await fetch(`${API_URL}/api/matches/like/${userId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setLikedIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
        setMatchIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
      } else {
        const res = await fetch(`${API_URL}/api/matches/like/${userId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setLikedIds((prev) => new Set([...prev, userId]));
          if (data.match) {
            setMatchIds((prev) => new Set([...prev, userId]));
          }
        }
      }
    } catch { /* ignore */ }
  };

  const handleMessage = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: userId }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/chats/${data._id}`);
      } else {
        router.push("/chats");
      }
    } catch {
      router.push("/chats");
    }
  };

  const handleVideoCall = (userId) => {
    router.push(`/call/${userId}`);
  };

  const handlePrivateCall = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    setCallError("");
    try {
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: userId, type: "paid_creator" }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/call/${data._id}`);
      } else {
        setCallError(data.message || "No se pudo iniciar la llamada privada");
      }
    } catch {
      setCallError("Error de conexión");
    }
  };

  const loadMore = () => {
    const next = discoverPage + 1;
    setDiscoverPage(next);
    loadUsers(next);
  };

  const handleSuperCrush = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    setCallError("");
    try {
      const res = await fetch(`${API_URL}/api/matches/super-crush/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLikedIds((prev) => new Set([...prev, userId]));
        if (data.match) {
          setMatchIds((prev) => new Set([...prev, userId]));
        }
      } else {
        setCallError(data.message || "No se pudo enviar el Super Crush");
      }
    } catch {
      setCallError("Error de conexión");
    }
  };

  return (
    <div className="explore">
      {/* ── Urgency banner ── */}
      <UrgencyBanner />

      {/* ── Header ── */}
      <div className="explore-header">
        <div className="explore-header-left">
          <h1 className="page-title">Explorar</h1>
          <p className="page-subtitle">Descubre directos y conoce personas</p>
        </div>
        {tab === "live" && (
          <div className="search-wrap">
            <span className="search-icon-inner">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              className="input search-input"
              type="text"
              placeholder="Buscar por título o streamer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="explore-tabs">
        <button
          className={`explore-tab${tab === "live" ? " active" : ""}`}
          onClick={() => setTab("live")}
        >
          <LiveTabIcon /> Directos en vivo
        </button>
        <button
          className={`explore-tab${tab === "discover" ? " active" : ""}`}
          onClick={() => setTab("discover")}
        >
          <PeopleIcon /> Descubrir personas
        </button>
        <Link href="/crush" className="explore-tab crush-link">
          ⚡ Crush
        </Link>
        <Link href="/matches" className="explore-tab matches-link">
          <MatchTabIcon /> Mis Matches
        </Link>
      </div>

      {/* ── Live tab ── */}
      {tab === "live" && (
        <>
          <div className="category-bar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`cat-pill${category === cat ? " active" : ""}`}
                onClick={() => setCategory(cat)}
              >
                <span className="cat-icon">{CAT_ICONS[cat]}</span>
                <span>{cat}</span>
              </button>
            ))}
          </div>

          {liveError && <div className="banner-error">{liveError}</div>}

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📡</div>
              <h3>Sin resultados</h3>
              <p>
                {search || category !== "Todos"
                  ? "No hay directos que coincidan con tu búsqueda."
                  : "No hay directos activos en este momento. ¡Vuelve más tarde!"}
              </p>
            </div>
          ) : (
            <div className="streams-grid">
              {filtered.map((live) => (
                <LiveCard key={live._id} live={live} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Discover tab ── */}
      {tab === "discover" && (
        <>
          {callError && <div className="banner-error">{callError}</div>}
          {discoverError && <div className="banner-error">{discoverError}</div>}

          {discoverLoading && users.length === 0 && (
            <div className="discover-grid">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 280, borderRadius: "var(--radius)" }} />
              ))}
            </div>
          )}

          {!discoverLoading && users.length === 0 && !discoverError && (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <h3>Sin perfiles disponibles</h3>
              <p>Aún no hay usuarios con perfil completo. ¡Sé el primero en completar el tuyo!</p>
              <Link href="/profile" className="btn btn-primary">Completar perfil</Link>
            </div>
          )}

          {users.length > 0 && (
            <>
              <div className="discover-grid">
                {users.map((user) => (
                  <ProfileCard
                    key={user._id}
                    user={user}
                    liked={likedIds.has(user._id)}
                    matched={matchIds.has(user._id)}
                    onLike={handleLike}
                    onSuperCrush={handleSuperCrush}
                    superCrushPrice={superCrushPrice}
                    onMessage={handleMessage}
                    onVideoCall={handleVideoCall}
                    onPrivateCall={handlePrivateCall}
                    loading={discoverLoading}
                  />
                ))}
              </div>

              {hasMore && (
                <div style={{ textAlign: "center", marginTop: "1rem" }}>
                  <button
                    className="btn"
                    onClick={loadMore}
                    disabled={discoverLoading}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "var(--text-muted)",
                      padding: "0.7rem 2rem",
                      borderRadius: "var(--radius-pill)",
                    }}
                  >
                    {discoverLoading ? "Cargando…" : "Ver más"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <style jsx>{`
        .explore { display: flex; flex-direction: column; gap: 1.5rem; }

        .explore-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .explore-header-left { flex: 1; }

        .explore-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .explore-tab {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.55rem 1.2rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          color: var(--text-muted);
          font-size: 0.84rem; font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
        }
        .explore-tab:hover { color: var(--text); background: rgba(255,255,255,0.06); }
        .explore-tab.active { background: var(--grad-primary); border-color: transparent; color: #fff; box-shadow: 0 2px 14px rgba(224,64,251,0.4); }
        .matches-link { background: rgba(255,45,120,0.08); border-color: rgba(255,45,120,0.2); color: var(--accent) !important; }
        .matches-link:hover { background: rgba(255,45,120,0.15); }
        .crush-link { background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.2); color: #fbbf24 !important; }
        .crush-link:hover { background: rgba(251,191,36,0.15); }

        .search-wrap { position: relative; width: 280px; max-width: 100%; }
        .search-icon-inner { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); color: var(--text-dim); display: flex; pointer-events: none; }
        .search-input { padding-left: 2.4rem !important; }

        .category-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .cat-pill { display: flex; align-items: center; gap: 0.35rem; padding: 0.42rem 1rem; border-radius: var(--radius-pill); border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: var(--text-muted); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all var(--transition); }
        .cat-pill:hover { color: var(--text); }
        .cat-pill.active { background: rgba(224,64,251,0.12); border-color: rgba(224,64,251,0.3); color: var(--accent-2); box-shadow: 0 0 10px rgba(224,64,251,0.15); }
        .cat-icon { font-size: 0.9rem; }

        .streams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 1.25rem; }

        .discover-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 1.1rem; }

        .banner-error { background: var(--error-bg); border: 1px solid rgba(248,113,113,0.35); color: var(--error); border-radius: var(--radius-sm); padding: 0.75rem 1rem; font-size: 0.875rem; font-weight: 500; }

        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem 2rem; text-align: center; border: 1px dashed rgba(139,92,246,0.2); border-radius: var(--radius); background: rgba(15,8,32,0.4); }
        .empty-icon { font-size: 2.5rem; }
        .empty-state h3 { color: var(--text); font-size: 1.15rem; margin: 0; }
        .empty-state p  { color: var(--text-muted); font-size: 0.875rem; margin: 0; }

        @media (max-width: 600px) {
          .explore-header { flex-direction: column; align-items: flex-start; }
          .search-wrap { width: 100%; }
        }
      `}</style>
    </div>
  );
}
