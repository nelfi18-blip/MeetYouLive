"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function StartLivePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [entryCost, setEntryCost] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }
    // Validate token and ensure only approved creators can access this page.
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (!data) return;
        if (data.role !== "creator" || data.creatorStatus !== "approved") {
          router.replace("/dashboard");
        }
      })
      .catch(() => {});
  }, [router]);

  const startLive = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("El título es obligatorio");
      return;
    }
    if (isPrivate && (!entryCost || entryCost < 1)) {
      setError("El coste de entrada debe ser al menos 1 moneda");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/lives/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          language,
          isPrivate,
          entryCost: isPrivate ? Number(entryCost) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al iniciar el directo");
        return;
      }
      router.push(`/live/${data._id}`);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="start-page">
      <div className="start-header">
        <div>
          <h1 className="start-title">🎥 Iniciar directo</h1>
          <p className="start-sub">Transmite en vivo a tu comunidad</p>
        </div>
        <Link href="/live" className="btn btn-secondary">← Directos</Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form className="start-form card" onSubmit={startLive}>
          <div className="form-group">
            <label className="form-label">Título *</label>
            <input
              className="input"
              type="text"
              placeholder="¿De qué trata tu directo?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea
              className="input textarea"
              placeholder="Cuéntale a tu audiencia qué van a ver…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Categoría</label>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Sin categoría</option>
              <option value="Gaming">Gaming</option>
              <option value="Música">Música</option>
              <option value="Charla">Charla</option>
              <option value="Arte">Arte</option>
              <option value="Educación">Educación</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Idioma</label>
            <select
              className="input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="">Sin especificar</option>
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="pt">Português</option>
            </select>
          </div>

          {/* Cover image placeholder (UI only) */}
          <div className="form-group">
            <label className="form-label">Imagen de portada</label>
            <div className="cover-placeholder">
              <div className="cover-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
              <span className="cover-label">Arrastra o selecciona una imagen</span>
              <span className="cover-soon">Próximamente</span>
            </div>
          </div>

          {/* Privacy toggle */}
          <div className="form-group">
            <label className="form-label">Privacidad</label>
            <div className="privacy-toggle">
              <button
                type="button"
                className={`privacy-btn${!isPrivate ? " active" : ""}`}
                onClick={() => setIsPrivate(false)}
              >
                🌐 Público
              </button>
              <button
                type="button"
                className={`privacy-btn${isPrivate ? " active" : ""}`}
                onClick={() => setIsPrivate(true)}
              >
                🔒 Privado (monedas)
              </button>
            </div>
            {isPrivate && (
              <p className="privacy-hint">
                Solo los usuarios que paguen la entrada podrán ver este directo.
              </p>
            )}
          </div>

          {isPrivate && (
            <div className="form-group">
              <label className="form-label">Coste de entrada (monedas) *</label>
              <input
                className="input"
                type="number"
                min={1}
                max={10000}
                value={entryCost}
                onChange={(e) => setEntryCost(Number(e.target.value))}
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={loading}
          >
            {loading ? "Iniciando…" : "🔴 Iniciar transmisión"}
          </button>
        </form>

      <style jsx>{`
        .start-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px; margin: 0 auto; }

        .start-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .start-title { font-size: 1.75rem; font-weight: 800; color: var(--text); }
        .start-sub { color: var(--text-muted); margin-top: 0.25rem; }

        .start-form { padding: 2rem; display: flex; flex-direction: column; gap: 1.25rem; }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .textarea { resize: vertical; min-height: 80px; }

        /* Cover image placeholder */
        .cover-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 2rem 1rem;
          border: 1.5px dashed rgba(139,92,246,0.3);
          border-radius: var(--radius-sm);
          background: rgba(15,8,32,0.5);
          cursor: not-allowed;
          opacity: 0.7;
          user-select: none;
        }

        .cover-icon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: rgba(139,92,246,0.1);
          border: 1px solid rgba(139,92,246,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-3);
        }

        .cover-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .cover-soon {
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--accent-3);
          background: rgba(129,140,248,0.1);
          border: 1px solid rgba(129,140,248,0.2);
          border-radius: var(--radius-pill);
          padding: 0.15rem 0.6rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        /* Privacy toggle */
        .privacy-toggle {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .privacy-btn {
          flex: 1;
          padding: 0.6rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .privacy-btn.active {
          border-color: var(--accent);
          background: rgba(255, 15, 138, 0.1);
          color: var(--accent);
        }

        .privacy-hint {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          line-height: 1.5;
        }

        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
