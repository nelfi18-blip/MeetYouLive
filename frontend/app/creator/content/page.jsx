"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="skel-card">
      <div className="skel-thumb skeleton" />
      <div className="skel-body">
        <div className="skeleton" style={{ height: 13, borderRadius: 6, width: "70%" }} />
        <div className="skeleton" style={{ height: 11, borderRadius: 6, width: "45%", marginTop: 6 }} />
      </div>
      <style jsx>{`
        .skel-card { background: rgba(15,8,32,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; overflow: hidden; }
        .skel-thumb { width: 100%; padding-top: 56.25%; height: 0; }
        .skel-body { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; }
      `}</style>
    </div>
  );
}

export default function CreatorContentPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);

  // List state
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // Form state
  const [view, setView] = useState("list"); // "list" | "create"
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("video");
  const [mediaUrl, setMediaUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [coinPrice, setCoinPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { clearToken(); router.replace("/login"); return; }

    fetch(`${API_URL}/api/user/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) { clearToken(); router.replace("/login"); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (!d) return;
        if (d.role !== "creator" || d.creatorStatus !== "approved") {
          router.replace("/dashboard");
          return;
        }
        setAuthLoading(false);
        loadItems(token);
      })
      .catch(() => { setAuthLoading(false); });
  }, [router]);

  const loadItems = (token) => {
    setListLoading(true);
    fetch(`${API_URL}/api/exclusive/mine`, {
      headers: { Authorization: `Bearer ${token || localStorage.getItem("token")}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(data))
      .catch(() => {})
      .finally(() => setListLoading(false));
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setType("video");
    setMediaUrl(""); setThumbnailUrl(""); setCoinPrice("");
    setFormError(""); setFormSuccess("");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError(""); setFormSuccess("");

    if (!title.trim() || !mediaUrl.trim()) {
      setFormError("El título y la URL del contenido son obligatorios.");
      return;
    }
    const parsedPrice = Number(coinPrice);
    if (isNaN(parsedPrice) || parsedPrice < 1) {
      setFormError("El precio debe ser al menos 1 moneda.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/exclusive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          type,
          mediaUrl: mediaUrl.trim(),
          thumbnailUrl: thumbnailUrl.trim(),
          coinPrice: parsedPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al publicar");

      setFormSuccess("¡Contenido publicado con éxito!");
      resetForm();
      loadItems(token);
      setTimeout(() => { setView("list"); setFormSuccess(""); }, 1400);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="content-page">
        <div className="auth-spinner"><div className="spinner" /></div>
        <style jsx>{`
          .content-page { max-width: 760px; margin: 0 auto; }
          .auth-spinner { display: flex; justify-content: center; padding: 4rem; }
          .spinner { width: 40px; height: 40px; border: 3px solid rgba(162,28,175,0.15); border-top-color: #e040fb; border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="content-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-left">
          <Link href="/dashboard" className="back-link">← Dashboard</Link>
          <h1 className="page-title">💎 Mis contenidos exclusivos</h1>
          <p className="page-sub">Gestiona tu contenido premium y gana monedas con cada desbloqueo.</p>
        </div>
        <button
          className={`header-btn${view === "create" ? " header-btn-active" : ""}`}
          onClick={() => { setView(view === "create" ? "list" : "create"); resetForm(); }}
        >
          <PlusIcon />
          <span>{view === "create" ? "Ver listado" : "Nuevo contenido"}</span>
        </button>
      </div>

      {/* Create form */}
      {view === "create" && (
        <div className="form-card">
          <h2 className="form-heading">✨ Publicar nuevo contenido</h2>
          <p className="form-sub">Recibirás el <strong>60%</strong> de cada desbloqueo.</p>

          <form onSubmit={handleCreate} className="create-form">
            {formError && <div className="alert alert-error">{formError}</div>}
            {formSuccess && <div className="alert alert-success">{formSuccess}</div>}

            <div className="form-row two-col">
              <div className="form-group">
                <label className="form-label">Título <span className="req">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Título del contenido…"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo <span className="req">*</span></label>
                <select className="form-input" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="video">🎬 Vídeo</option>
                  <option value="photo">📷 Foto</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Descripción</label>
              <textarea
                className="form-input form-textarea"
                placeholder="Describe brevemente el contenido…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>

            <div className="form-row two-col">
              <div className="form-group">
                <label className="form-label">URL del contenido <span className="req">*</span></label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://… (vídeo o imagen real)"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  required
                />
                <span className="form-hint">Visible solo tras desbloqueo</span>
              </div>
              <div className="form-group">
                <label className="form-label">URL de miniatura</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://… (portada visible)"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                />
                <span className="form-hint">Vista previa antes del desbloqueo</span>
              </div>
            </div>

            <div className="form-group price-group">
              <label className="form-label">Precio en monedas <span className="req">*</span></label>
              <div className="price-input-wrap">
                <input
                  type="number"
                  className="form-input price-input"
                  placeholder="p.ej. 50"
                  value={coinPrice}
                  onChange={(e) => setCoinPrice(e.target.value)}
                  min={1}
                  required
                />
                <span className="price-suffix">🪙</span>
              </div>
              {coinPrice && Number(coinPrice) >= 1 && (
                <span className="form-hint">
                  Tú recibirás ≈ <strong>{Math.floor(Number(coinPrice) * 0.6)} monedas</strong> por desbloqueo
                </span>
              )}
            </div>

            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={() => { setView("list"); resetForm(); }}>
                Cancelar
              </button>
              <button type="submit" className="btn-publish" disabled={submitting}>
                {submitting ? "Publicando…" : "🚀 Publicar contenido"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content list */}
      {view === "list" && (
        <div className="list-section">
          {listLoading ? (
            <div className="items-grid">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">💎</span>
              <h2>Sin contenido publicado</h2>
              <p>Publica tu primer contenido exclusivo para empezar a ganar monedas.</p>
              <button className="btn-publish" onClick={() => setView("create")}>
                <PlusIcon /> Publicar ahora
              </button>
            </div>
          ) : (
            <>
              <div className="list-stats">
                <div className="stat-chip">
                  <span className="stat-val">{items.length}</span>
                  <span className="stat-lbl">publicaciones</span>
                </div>
                <div className="stat-chip">
                  <span className="stat-val">{items.reduce((s, i) => s + (i.totalUnlocks || 0), 0)}</span>
                  <span className="stat-lbl">desbloqueos</span>
                </div>
                <div className="stat-chip stat-earnings">
                  <span className="stat-val">{items.reduce((s, i) => s + (i.totalEarnings || 0), 0)}</span>
                  <span className="stat-lbl">🪙 ganadas</span>
                </div>
              </div>
              <div className="items-grid">
                {items.map((item) => (
                  <ContentItemCard key={item._id} item={item} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style jsx>{`
        .content-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 760px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .header-left {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .back-link {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition);
        }
        .back-link:hover { color: var(--text); }

        .page-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .page-sub {
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .header-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          background: linear-gradient(135deg, rgba(162,28,175,0.3), rgba(224,64,251,0.15));
          border: 1px solid rgba(224,64,251,0.4);
          color: #e040fb;
          border-radius: 10px;
          padding: 0.6rem 1.1rem;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
          flex-shrink: 0;
        }
        .header-btn:hover {
          background: linear-gradient(135deg, rgba(162,28,175,0.45), rgba(224,64,251,0.25));
          box-shadow: 0 0 18px rgba(224,64,251,0.3);
        }
        .header-btn-active {
          background: linear-gradient(135deg, rgba(162,28,175,0.15), rgba(224,64,251,0.08));
          border-color: rgba(224,64,251,0.25);
          color: var(--text-muted);
        }

        /* ── Form card ── */
        .form-card {
          background: rgba(12,6,28,0.85);
          border: 1px solid rgba(224,64,251,0.18);
          border-radius: 16px;
          padding: 1.75rem;
          box-shadow: 0 0 40px rgba(162,28,175,0.08);
        }

        .form-heading {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 0.2rem;
        }

        .form-sub {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin: 0 0 1.25rem;
        }
        .form-sub strong { color: #e040fb; }

        .create-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-row { display: flex; flex-direction: column; gap: 1rem; }
        @media (min-width: 540px) {
          .two-col { flex-direction: row; }
          .two-col .form-group { flex: 1; }
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .form-label {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text);
        }
        .req { color: #e040fb; }

        .form-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: var(--text);
          font-size: 0.9rem;
          padding: 0.65rem 0.9rem;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: border-color var(--transition), box-shadow var(--transition);
          font-family: inherit;
        }
        .form-input:focus {
          border-color: rgba(162,28,175,0.55);
          box-shadow: 0 0 0 3px rgba(162,28,175,0.12);
        }
        .form-input::placeholder { color: var(--text-dim); }

        .form-textarea {
          resize: vertical;
          min-height: 70px;
        }

        .form-hint {
          font-size: 0.73rem;
          color: var(--text-dim);
        }
        .form-hint strong { color: #e040fb; }

        .price-group { max-width: 260px; }
        .price-input-wrap { position: relative; }
        .price-input { padding-right: 2rem; }
        .price-suffix {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.9rem;
          pointer-events: none;
        }

        .alert {
          padding: 0.7rem 1rem;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .alert-error { background: rgba(244,67,54,0.08); border: 1px solid var(--error); color: var(--error); }
        .alert-success { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; }

        .form-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 0.25rem;
        }

        .btn-publish {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: linear-gradient(135deg, #a21caf, #e040fb);
          border: none;
          color: #fff;
          border-radius: 10px;
          padding: 0.7rem 1.4rem;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
          box-shadow: 0 0 20px rgba(224,64,251,0.35);
        }
        .btn-publish:hover:not(:disabled) {
          box-shadow: 0 0 30px rgba(224,64,251,0.55);
          transform: translateY(-1px);
        }
        .btn-publish:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .btn-cancel {
          background: none;
          border: 1px solid rgba(255,255,255,0.12);
          color: var(--text-muted);
          border-radius: 10px;
          padding: 0.7rem 1.1rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
        }
        .btn-cancel:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }

        /* ── List section ── */
        .list-section { display: flex; flex-direction: column; gap: 1rem; }

        .list-stats {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .stat-chip {
          display: flex;
          align-items: baseline;
          gap: 0.35rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
          padding: 0.35rem 0.9rem;
        }
        .stat-earnings { border-color: rgba(224,64,251,0.25); }

        .stat-val {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
        }
        .stat-earnings .stat-val { color: #e040fb; }

        .stat-lbl {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .items-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.85rem;
        }
        @media (min-width: 480px) {
          .items-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 680px) {
          .items-grid { grid-template-columns: repeat(3, 1fr); }
        }

        /* ── Empty state ── */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 4rem 2rem;
          text-align: center;
        }
        .empty-icon { font-size: 3rem; }
        .empty-state h2 { font-size: 1.2rem; font-weight: 800; color: var(--text); }
        .empty-state p { color: var(--text-muted); font-size: 0.875rem; }
      `}</style>
    </div>
  );
}

function ContentItemCard({ item }) {
  return (
    <Link href={`/exclusive/${item._id}`} className="item-card">
      <div className="item-thumb">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.title} className="thumb-img" />
        ) : (
          <div className="thumb-placeholder">💎</div>
        )}
        <div className="type-badge">
          {item.type === "video" ? <><VideoIcon /> <span>Vídeo</span></> : <><PhotoIcon /> <span>Foto</span></>}
        </div>
        <div className={`status-badge ${item.isActive ? "status-active" : "status-inactive"}`}>
          {item.isActive ? "● Activo" : "● Inactivo"}
        </div>
      </div>
      <div className="item-body">
        <h3 className="item-title">{item.title}</h3>
        <div className="item-meta">
          <span className="price-chip"><LockIcon /> {item.coinPrice} 🪙</span>
          <span className="unlocks-chip">🔓 {item.totalUnlocks || 0}</span>
          <span className="earnings-chip">+{item.totalEarnings || 0} 🪙</span>
        </div>
      </div>

      <style jsx>{`
        .item-card {
          background: rgba(12,6,28,0.8);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          text-decoration: none;
          transition: border-color var(--transition), box-shadow var(--transition-slow), transform var(--transition-slow);
        }
        .item-card:hover {
          border-color: rgba(224,64,251,0.4);
          box-shadow: 0 6px 28px rgba(162,28,175,0.2);
          transform: translateY(-2px);
        }

        .item-thumb {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: linear-gradient(135deg, rgba(20,10,42,0.9), rgba(8,4,20,0.9));
          overflow: hidden;
        }

        .thumb-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .thumb-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        }

        .type-badge {
          position: absolute;
          bottom: 0.4rem;
          left: 0.4rem;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
          font-size: 0.65rem;
          font-weight: 700;
          color: rgba(255,255,255,0.85);
        }

        .status-badge {
          position: absolute;
          top: 0.4rem;
          right: 0.4rem;
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          font-size: 0.65rem;
          font-weight: 700;
          backdrop-filter: blur(6px);
        }
        .status-active {
          background: rgba(34,197,94,0.15);
          border: 1px solid rgba(34,197,94,0.35);
          color: #4ade80;
        }
        .status-inactive {
          background: rgba(244,67,54,0.12);
          border: 1px solid rgba(244,67,54,0.3);
          color: #f87171;
        }

        .item-body {
          padding: 0.65rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .item-title {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text);
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          line-height: 1.35;
        }

        .item-meta {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .price-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
          background: rgba(162,28,175,0.12);
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: 999px;
          padding: 0.1rem 0.45rem;
          font-size: 0.67rem;
          font-weight: 700;
          color: #e040fb;
        }

        .unlocks-chip {
          font-size: 0.67rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .earnings-chip {
          font-size: 0.67rem;
          font-weight: 700;
          color: #34d399;
        }
      `}</style>
    </Link>
  );
}


