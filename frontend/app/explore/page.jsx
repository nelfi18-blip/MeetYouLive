"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const USERS_PER_PAGE = 20;

const CATEGORIES = ["Todos", "Gaming", "Música", "Charla", "Arte", "Educación", "Otro"];
const CAT_ICONS = {
  Todos: "🌐", Gaming: "🎮", Música: "🎵", Charla: "💬",
  Arte: "🎨", Educación: "��", Otro: "✨",
};

function HeartIcon({ filled }) {
  return filled
    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
}
function LiveTabIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
}
function PeopleIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
}
function MatchTabIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
}

export default function ExplorePage() {
  const router = useRouter();
  const [tab, setTab] = useState("live");

  const [lives, setLives] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [liveError, setLiveError] = useState("");

  const [users, setUsers] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [matchIds, setMatchIds] = useState(new Set());
  const [discoverPage, setDiscoverPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setLives(Array.isArray(d) ? d : []))
      .catch(() => setLiveError("No se pudo cargar los directos"));
  }, []);

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

  const loadUsers = useCallback(async (page) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setDiscoverLoading(true);
    setDiscoverError("");
    try {
      const res = await fetch(`${API_URL}/api/user/discover?page=${page}&limit=${USERS_PER_PAGE}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newUsers = data.users || [];
      setUsers((prev) => page === 1 ? newUsers : [...prev, ...newUsers]);
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

  const loadMore = () => {
    const next = discoverPage + 1;
    setDiscoverPage(next);
    loadUsers(next);
  };

  return (
    <div className="explore">
      <div className="explore-header">
        <div className="explore-header-left">
          <h1 className="page-title">Explorar</h1>
          <p className="page-subtitle">Descubre directos y conoce personas</p>
        </div>
        {tab === "live" && (
          <div className="search-wrap">
            <span className="search-icon-inner">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
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
        <Link href="/matches" className="explore-tab matches-link">
          <MatchTabIcon /> Mis Matches
        </Link>
      </div>

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
                <Link key={live._id} href={`/live/${live._id}`} className="stream-card">
                  <div className="stream-thumb">
                    <span className="badge badge-live">
                      <span className="live-dot" />
                      LIVE
                    </span>
                    {live.viewerCount != null && (
                      <span className="viewer-count">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        {live.viewerCount}
                      </span>
                    )}
                    <div className="stream-thumb-icon">▶</div>
                  </div>
                  <div className="stream-body">
                    <div className="stream-user-row">
                      <div className="stream-avatar">
                        {(live.user?.username || "?")[0].toUpperCase()}
                      </div>
                      <span className="stream-username">@{live.user?.username || "anónimo"}</span>
                    </div>
                    <div className="stream-title">{live.title}</div>
                    {live.description && (
                      <div className="stream-desc">{live.description}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "discover" && (
        <>
          {discoverError && <div className="banner-error">{discoverError}</div>}

          {discoverLoading && users.length === 0 && (
            <div className="discover-grid">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 240, borderRadius: "var(--radius)" }} />
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
                {users.map((user) => {
                  const displayName = user.username || user.name || "Usuario";
                  const initial = displayName[0].toUpperCase();
                  const liked = likedIds.has(user._id);
                  const matched = matchIds.has(user._id);
                  const isCreatorLive = user.isLive && user.liveId;
                  return (
                    <div key={user._id} className={`discover-card${matched ? " matched" : ""}${isCreatorLive ? " creator-live" : ""}`}>
                      {matched && (
                        <div className="match-ribbon">
                          <MatchTabIcon /> Match!
                        </div>
                      )}
                      {isCreatorLive && !matched && (
                        <div className="live-ribbon">
                          <span className="live-dot" /> EN VIVO
                        </div>
                      )}
                      <div className="discover-avatar-wrap">
                        {user.avatar ? (
                          <img src={user.avatar} alt={displayName} className="discover-avatar-img" />
                        ) : (
                          <div className="discover-avatar-placeholder">{initial}</div>
                        )}
                        {isCreatorLive && (
                          <span className="avatar-live-badge">
                            <span className="live-dot-sm" />
                            LIVE
                          </span>
                        )}
                      </div>
                      <div className="discover-body">
                        <div className="discover-name">{displayName}</div>
                        {user.role === "creator" && (
                          <span className="discover-creator-badge">Creador</span>
                        )}
                        {user.location && (
                          <div className="discover-location">📍 {user.location}</div>
                        )}
                        {user.bio && <p className="discover-bio">{user.bio}</p>}
                        {user.interests?.length > 0 && (
                          <div className="discover-interests">
                            {user.interests.slice(0, 3).map((i) => (
                              <span key={i} className="discover-interest-tag">{i}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {isCreatorLive && (
                        <Link href={`/live/${user.liveId}`} className="watch-live-btn">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                          Ver en vivo
                        </Link>
                      )}
                      <button
                        className={`discover-like-btn${liked ? " liked" : ""}`}
                        onClick={() => handleLike(user._id)}
                        aria-label={liked ? "Quitar like" : "Dar like"}
                      >
                        <HeartIcon filled={liked} />
                        {liked ? (matched ? "¡Match!" : "Gustado") : "Me gusta"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <div style={{ textAlign: "center", marginTop: "1rem" }}>
                  <button
                    className="btn"
                    onClick={loadMore}
                    disabled={discoverLoading}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", padding: "0.7rem 2rem", borderRadius: "var(--radius-pill)" }}
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

        .search-wrap { position: relative; width: 280px; max-width: 100%; }
        .search-icon-inner { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); color: var(--text-dim); display: flex; pointer-events: none; }
        .search-input { padding-left: 2.4rem !important; }

        .category-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .cat-pill { display: flex; align-items: center; gap: 0.35rem; padding: 0.42rem 1rem; border-radius: var(--radius-pill); border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: var(--text-muted); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all var(--transition); }
        .cat-pill:hover { color: var(--text); }
        .cat-pill.active { background: rgba(224,64,251,0.12); border-color: rgba(224,64,251,0.3); color: var(--accent-2); box-shadow: 0 0 10px rgba(224,64,251,0.15); }
        .cat-icon { font-size: 0.9rem; }

        .streams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 1.25rem; }
        .stream-card { overflow: hidden; cursor: pointer; border: 1px solid var(--border); border-radius: var(--radius); background: var(--grad-card-2); transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition); display: block; }
        .stream-card:hover { border-color: rgba(139,92,246,0.4); box-shadow: var(--shadow), 0 0 28px rgba(139,92,246,0.2); transform: translateY(-4px); }
        .stream-thumb { background: linear-gradient(135deg, rgba(22,12,45,0.9), rgba(35,16,70,0.95), rgba(15,8,32,1)); height: 160px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
        .stream-thumb::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, rgba(139,92,246,0.08), transparent 65%); }
        .stream-thumb .badge-live { position: absolute; top: 0.65rem; left: 0.65rem; z-index: 2; display: flex; align-items: center; gap: 0.3rem; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.06em; padding: 0.25rem 0.65rem; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; animation: dot-blink 1.2s ease-in-out infinite; }
        @keyframes dot-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .viewer-count { position: absolute; bottom: 0.65rem; right: 0.65rem; display: flex; align-items: center; gap: 0.3rem; background: rgba(6,4,17,0.8); color: var(--text); font-size: 0.72rem; font-weight: 600; padding: 0.22rem 0.6rem; border-radius: var(--radius-pill); z-index: 2; backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.08); }
        .stream-thumb-icon { font-size: 2.5rem; opacity: 0.12; position: relative; z-index: 1; color: var(--text); }
        .stream-body { padding: 1rem 1.1rem; }
        .stream-user-row { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.5rem; }
        .stream-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--grad-primary); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 0.75rem; flex-shrink: 0; }
        .stream-username { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }
        .stream-title { font-weight: 700; color: var(--text); font-size: 0.95rem; line-height: 1.35; }
        .stream-desc { color: var(--text-muted); font-size: 0.8rem; margin-top: 0.3rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; }

        .discover-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.1rem; }
        .discover-card { background: rgba(15,8,32,0.7); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem 1.1rem 1.1rem; display: flex; flex-direction: column; align-items: center; gap: 0.8rem; position: relative; transition: all var(--transition-slow); }
        .discover-card:hover { border-color: rgba(255,45,120,0.25); box-shadow: var(--shadow), 0 0 20px rgba(255,45,120,0.08); transform: translateY(-3px); }
        .discover-card.matched { border-color: rgba(255,45,120,0.4); box-shadow: var(--shadow), 0 0 24px rgba(255,45,120,0.15); }
        .discover-card.creator-live { border-color: rgba(255,15,138,0.5); box-shadow: var(--shadow), 0 0 28px rgba(255,15,138,0.2); }
        .match-ribbon { position: absolute; top: 0.5rem; right: 0.5rem; background: var(--grad-warm); color: #fff; font-size: 0.6rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: var(--radius-pill); display: flex; align-items: center; gap: 0.25rem; box-shadow: 0 2px 8px rgba(255,45,120,0.4); }
        .match-ribbon :global(svg) { width: 10px; height: 10px; }
        .live-ribbon { position: absolute; top: 0.5rem; right: 0.5rem; background: linear-gradient(135deg, #ff0f8a, #e040fb); color: #fff; font-size: 0.6rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: var(--radius-pill); display: flex; align-items: center; gap: 0.3rem; box-shadow: 0 2px 8px rgba(255,15,138,0.5); letter-spacing: 0.04em; animation: live-pulse 2s ease-in-out infinite; }
        @keyframes live-pulse { 0%, 100% { box-shadow: 0 2px 8px rgba(255,15,138,0.5); } 50% { box-shadow: 0 2px 16px rgba(255,15,138,0.8); } }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; display: inline-block; animation: dot-blink 1s ease-in-out infinite; }
        @keyframes dot-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .discover-avatar-wrap { flex-shrink: 0; position: relative; }
        .discover-avatar-img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,45,120,0.2); }
        .discover-avatar-placeholder { width: 80px; height: 80px; border-radius: 50%; background: var(--grad-primary); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 800; color: #fff; }
        .avatar-live-badge { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #ff0f8a, #e040fb); color: #fff; font-size: 0.55rem; font-weight: 800; padding: 0.12rem 0.45rem; border-radius: var(--radius-pill); display: flex; align-items: center; gap: 0.25rem; white-space: nowrap; letter-spacing: 0.06em; }
        .live-dot-sm { width: 5px; height: 5px; border-radius: 50%; background: #fff; display: inline-block; animation: dot-blink 1s ease-in-out infinite; }
        .discover-body { text-align: center; width: 100%; }
        .discover-name { font-weight: 700; font-size: 0.92rem; color: var(--text); margin-bottom: 0.3rem; }
        .discover-creator-badge { display: inline-block; font-size: 0.62rem; padding: 0.15rem 0.5rem; border-radius: var(--radius-pill); background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2); color: var(--accent-green); font-weight: 700; margin-bottom: 0.3rem; }
        .discover-location { font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.35rem; }
        .discover-bio { font-size: 0.77rem; color: var(--text-muted); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 0 0 0.35rem; }
        .discover-interests { display: flex; flex-wrap: wrap; gap: 0.3rem; justify-content: center; }
        .discover-interest-tag { font-size: 0.62rem; padding: 0.18rem 0.5rem; border-radius: var(--radius-pill); background: rgba(224,64,251,0.08); border: 1px solid rgba(224,64,251,0.15); color: var(--accent-2); font-weight: 600; }
        .watch-live-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.55rem; border-radius: var(--radius-sm); background: linear-gradient(135deg, rgba(255,15,138,0.15), rgba(224,64,251,0.15)); border: 1px solid rgba(255,15,138,0.35); color: var(--accent); font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all var(--transition); text-decoration: none; }
        .watch-live-btn:hover { background: linear-gradient(135deg, rgba(255,15,138,0.25), rgba(224,64,251,0.25)); box-shadow: 0 0 16px rgba(255,15,138,0.3); }
        .discover-like-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.45rem; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid rgba(255,45,120,0.25); background: rgba(255,45,120,0.06); color: var(--text-muted); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all var(--transition); }
        .discover-like-btn:hover { background: rgba(255,45,120,0.12); color: var(--accent); border-color: rgba(255,45,120,0.4); }
        .discover-like-btn.liked { background: rgba(255,45,120,0.12); border-color: var(--accent); color: var(--accent); }

        .banner-error { background: var(--error-bg); border: 1px solid rgba(248,113,113,0.35); color: var(--error); border-radius: var(--radius-sm); padding: 0.75rem 1rem; font-size: 0.875rem; font-weight: 500; }
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem 2rem; text-align: center; border: 1px dashed rgba(139,92,246,0.2); border-radius: var(--radius); background: rgba(15,8,32,0.4); }
        .empty-icon { font-size: 2.5rem; }
        .empty-state h3 { color: var(--text); font-size: 1.15rem; margin: 0; }
        .empty-state p  { color: var(--text-muted); font-size: 0.875rem; margin: 0; }

        .badge-live { background: var(--grad-warm); color: #fff; border-radius: var(--radius-pill); }

        @media (max-width: 600px) {
          .explore-header { flex-direction: column; align-items: flex-start; }
          .search-wrap { width: 100%; }
        }
      `}</style>
    </div>
  );
}
