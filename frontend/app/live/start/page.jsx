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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    // Validate token with the backend on mount so an expired token is caught
    // early and the user is redirected to login rather than seeing an error
    // only after they try to start a stream.
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => {
      if (r.status === 401) {
        clearToken();
        router.replace("/login");
      }
    }).catch(() => {});
  }, [router]);

  const startLive = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("El título es obligatorio");
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
        body: JSON.stringify({ title: title.trim(), description: description.trim(), category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al iniciar el directo");
        return;
      }
      setLive(data);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const endLive = async () => {
    if (!live?._id) return;
    setEnding(true);
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_URL}/api/lives/${live._id}/end`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setLive(null);
      setTitle("");
      setDescription("");
      setCategory("");
    } catch {
      setError("Error al finalizar el directo");
    } finally {
      setEnding(false);
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

      {!live ? (
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

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={loading}
          >
            {loading ? "Iniciando…" : "🔴 Empezar directo"}
          </button>
        </form>
      ) : (
        <div className="live-active card">
          <div className="live-active-header">
            <span className="badge badge-live">EN VIVO</span>
            <h2 className="live-active-title">{live.title}</h2>
          </div>

          <div className="stream-info">
            <div className="info-row">
              <span className="info-label">Stream Key</span>
              <code className="stream-key">{live.streamKey}</code>
            </div>
            <p className="stream-hint">
              Usa esta stream key en tu software de emisión (OBS, Streamlabs, etc.) para comenzar a transmitir.
            </p>
          </div>

          <div className="live-actions">
            <Link href={`/live/${live._id}`} className="btn btn-secondary" target="_blank">
              👁 Ver directo
            </Link>
            <button
              className="btn btn-danger"
              onClick={endLive}
              disabled={ending}
            >
              {ending ? "Finalizando…" : "⏹ Finalizar directo"}
            </button>
          </div>
        </div>
      )}

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

        /* Active live */
        .live-active { padding: 2rem; display: flex; flex-direction: column; gap: 1.5rem; }

        .live-active-header { display: flex; align-items: center; gap: 0.75rem; }

        .live-active-title { font-size: 1.2rem; font-weight: 700; color: var(--text); }

        .stream-info { display: flex; flex-direction: column; gap: 0.75rem; }

        .info-row { display: flex; flex-direction: column; gap: 0.3rem; }

        .info-label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; }

        .stream-key {
          background: rgba(0,0,0,0.3);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 0.5rem 0.75rem;
          font-family: monospace;
          font-size: 0.85rem;
          color: var(--accent);
          word-break: break-all;
        }

        .stream-hint { font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; }

        .live-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }

        .btn-danger {
          background: var(--error);
          color: #fff;
          border: none;
          cursor: pointer;
        }

        .btn-danger:hover:not(:disabled) { filter: brightness(1.1); }

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
