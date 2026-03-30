"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function VideoUploadPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) { clearToken(); router.replace("/login"); return null; }
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.role !== "creator" && data.role !== "admin") {
          router.replace("/profile");
          return;
        }
        setUser(data);
      })
      .catch(() => setError("No se pudo verificar tu cuenta"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim() || !url.trim()) {
      setError("El título y la URL son obligatorios");
      return;
    }

    const parsedPrice = Number(price);
    if (isPrivate && price !== "" && (isNaN(parsedPrice) || parsedPrice < 1)) {
      setError("El precio debe ser un número mayor o igual a 1");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/videos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          url: url.trim(),
          isPrivate,
          price: isPrivate ? (parsedPrice || 0) : 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al publicar el vídeo");

      setSuccess("¡Vídeo publicado con éxito!");
      // Navigate to the video detail after a short delay
      setTimeout(() => router.push(`/videos/${data._id}`), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="upload-page">
        <div className="skeleton" style={{ height: 400, borderRadius: "var(--radius)" }} />
        <style jsx>{`.upload-page { max-width: 600px; margin: 0 auto; }`}</style>
      </div>
    );
  }

  return (
    <div className="upload-page">
      {/* Header */}
      <div className="upload-header">
        <Link href="/creator" className="back-link">← Estudio del creador</Link>
        <h1 className="upload-title">🎬 Subir nuevo vídeo</h1>
        <p className="upload-sub">Publica contenido para tus fans. Elige si quieres que sea público o privado de pago.</p>
      </div>

      <form className="upload-form card" onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="form-group">
          <label className="form-label">Título <span className="required">*</span></label>
          <input
            type="text"
            className="form-input"
            placeholder="Dale un título a tu vídeo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Descripción</label>
          <textarea
            className="form-input form-textarea"
            placeholder="Cuéntales a tus fans de qué trata este vídeo…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>

        <div className="form-group">
          <label className="form-label">URL del vídeo <span className="required">*</span></label>
          <input
            type="url"
            className="form-input"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <span className="form-hint">Enlace directo al archivo de vídeo (MP4, WebM…) o a un servicio de alojamiento.</span>
        </div>

        <div className="form-group">
          <div className="toggle-row">
            <div>
              <div className="form-label">Vídeo privado (de pago)</div>
              <div className="form-hint">Los usuarios necesitarán pagar para verlo</div>
            </div>
            <button
              type="button"
              className={`toggle-btn${isPrivate ? " on" : ""}`}
              onClick={() => setIsPrivate(!isPrivate)}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>

        {isPrivate && (
          <div className="form-group">
            <label className="form-label">Precio en monedas <span className="required">*</span></label>
            <input
              type="number"
              className="form-input"
              placeholder="p.ej. 50"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min={1}
              required={isPrivate}
            />
            <span className="form-hint">Número de monedas que el usuario deberá pagar para acceder.</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-lg submit-btn" disabled={submitting}>
          {submitting ? "Publicando…" : "🚀 Publicar vídeo"}
        </button>
      </form>

      <style jsx>{`
        .upload-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 600px;
          margin: 0 auto;
        }

        .back-link {
          font-size: 0.875rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition);
          display: inline-flex;
        }
        .back-link:hover { color: var(--text); }

        .upload-header {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .upload-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .upload-sub {
          color: var(--text-muted);
          font-size: 0.875rem;
        }

        .upload-form {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .alert {
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          font-weight: 600;
        }
        .alert-error {
          background: rgba(244,67,54,0.08);
          border: 1px solid var(--error);
          color: var(--error);
        }
        .alert-success {
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.3);
          color: #4ade80;
        }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text);
        }

        .required { color: var(--accent); }

        .form-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          font-size: 0.9rem;
          padding: 0.7rem 1rem;
          transition: border-color var(--transition), box-shadow var(--transition);
          outline: none;
          width: 100%;
          box-sizing: border-box;
        }

        .form-input:focus {
          border-color: rgba(139,92,246,0.5);
          box-shadow: 0 0 0 3px rgba(139,92,246,0.1);
        }

        .form-input::placeholder { color: var(--text-dim); }

        .form-textarea { resize: vertical; min-height: 80px; font-family: inherit; }

        .form-hint {
          font-size: 0.75rem;
          color: var(--text-dim);
          line-height: 1.4;
        }

        /* Toggle */
        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .toggle-btn {
          position: relative;
          width: 44px;
          height: 24px;
          border-radius: var(--radius-pill);
          background: rgba(255,255,255,0.1);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: all var(--transition);
          flex-shrink: 0;
          padding: 0;
        }

        .toggle-btn.on {
          background: var(--accent);
          border-color: var(--accent);
          box-shadow: 0 0 12px rgba(255,15,138,0.4);
        }

        .toggle-knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          transition: transform var(--transition);
          display: block;
        }

        .toggle-btn.on .toggle-knob { transform: translateX(20px); }

        .submit-btn { align-self: flex-start; }
      `}</style>
    </div>
  );
}
