"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import { isApprovedCreator as hasApprovedCreatorAccess } from "@/lib/creatorUtils";
import { trackAnalyticsEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function StartLivePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [entryCost, setEntryCost] = useState(10);
  const [isVipOnly, setIsVipOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isApprovedCreator, setIsApprovedCreator] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

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
        const approved = hasApprovedCreatorAccess(data);
        setIsApprovedCreator(approved);
        if (!approved) {
          setError("Necesitas una cuenta de creador aprobada para iniciar un Live.");
        }
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
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
          isVipOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al iniciar el directo");
        return;
      }
      trackAnalyticsEvent("first_live_started");
      router.push(`/live/${data._id}`);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="start-page">
        <div className="checking-auth">
          <div className="spinner" />
        </div>
        <style jsx>{`
          .start-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px; margin: 0 auto; }
          .checking-auth { display: flex; justify-content: center; padding: 4rem; }
          .spinner { width: 36px; height: 36px; border: 3px solid rgba(255,15,138,0.2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!isApprovedCreator) {
    return (
      <div className="start-page">
        <div className="error-banner">
          {error || "Necesitas una cuenta de creador aprobada para iniciar un Live."}
        </div>
        <Link href="/live" className="btn btn-secondary">← Directos</Link>
        <style jsx>{`
          .start-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px; margin: 0 auto; }
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

  const previewTitle = title.trim() || "Tu próximo Live";
  const previewDescription = description.trim() || "Cuenta a tu audiencia qué podrán vivir contigo en directo.";
  const previewAudience = isVipOnly
    ? "Solo VIP"
    : isPrivate
      ? `Entrada privada · ${entryCost || 0} coins`
      : "Público";
  const readyChecks = [
    { label: "Título claro", done: Boolean(title.trim()) },
    { label: "Categoría elegida", done: Boolean(category) },
    { label: "Idioma definido", done: Boolean(language) },
    { label: "Acceso revisado", done: !isPrivate || entryCost >= 1 },
  ];

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

      <div className="start-layout">
        <form className="start-form card" onSubmit={startLive}>
          <div className="form-section-title">
            <span>1</span>
            <div>
              <strong>Prepara tu sala</strong>
              <small>Estos datos se muestran antes de que la audiencia entre.</small>
            </div>
          </div>
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

          <div className="form-section-title">
            <span>2</span>
            <div>
              <strong>Define acceso</strong>
              <small>Usa precios reales; no se simula actividad ni espectadores.</small>
            </div>
          </div>

          {/* Privacy toggle — all users reaching this page are approved creators */}
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

          {/* VIP-only toggle */}
          <div className="form-group">
            <label className="form-label">Acceso VIP 💎</label>
            <div className="privacy-toggle">
              <button
                type="button"
                className={`privacy-btn${!isVipOnly ? " active" : ""}`}
                onClick={() => setIsVipOnly(false)}
              >
                🌍 Todos
              </button>
              <button
                type="button"
                className={`privacy-btn${isVipOnly ? " privacy-btn-vip-active" : ""}`}
                onClick={() => setIsVipOnly(true)}
              >
                💎 Solo VIP
              </button>
            </div>
            {isVipOnly && (
              <p className="privacy-hint">
                Solo usuarios con suscripción VIP 💎 podrán ver este directo.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={loading}
          >
            {loading ? "Iniciando…" : "🔴 Iniciar transmisión"}
          </button>
        </form>

        <aside className="start-side-panel" aria-label="Vista previa y checklist del live">
          <div className="live-preview-card">
            <span className="preview-kicker">Vista previa</span>
            <h2>{previewTitle}</h2>
            <p>{previewDescription}</p>
            <div className="preview-tags">
              <span>🔴 Live</span>
              <span>{category || "Sin categoría"}</span>
              <span>{language || "Idioma libre"}</span>
              <span>{previewAudience}</span>
            </div>
          </div>

          <div className="creator-checklist">
            <span className="preview-kicker">Antes de salir en vivo</span>
            {readyChecks.map((item) => (
              <div className="check-row" data-done={item.done ? "true" : "false"} key={item.label}>
                <span>{item.done ? "✓" : "•"}</span>
                {item.label}
              </div>
            ))}
            <p>
              Consejo: comparte el enlace cuando estés en vivo para atraer audiencia real sin inflar métricas.
            </p>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .start-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 1080px; margin: 0 auto; }

        .start-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .start-title { font-size: 1.75rem; font-weight: 800; color: var(--text); }
        .start-sub { color: var(--text-muted); margin-top: 0.25rem; }

        .start-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr);
          gap: 1.25rem;
          align-items: start;
        }

        .start-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.1rem; }

        .form-section-title {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.85rem;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.035);
        }
        .form-section-title span {
          display: grid;
          place-items: center;
          width: 1.65rem;
          height: 1.65rem;
          border-radius: 50%;
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.78rem;
          font-weight: 900;
          flex-shrink: 0;
        }
        .form-section-title strong { display: block; color: var(--text); }
        .form-section-title small { display: block; margin-top: 0.15rem; color: var(--text-muted); line-height: 1.45; }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .textarea { resize: vertical; min-height: 80px; }

        .start-side-panel {
          position: sticky;
          top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .live-preview-card,
        .creator-checklist {
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: var(--radius);
          background:
            radial-gradient(circle at 20% 0%, rgba(224,64,251,0.18), transparent 32%),
            rgba(15,8,32,0.78);
          box-shadow: var(--shadow);
          padding: 1.25rem;
        }
        .preview-kicker {
          display: inline-flex;
          margin-bottom: 0.7rem;
          color: var(--accent-cyan);
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .live-preview-card h2 {
          margin: 0;
          color: var(--text);
          font-size: clamp(1.4rem, 3vw, 2rem);
          letter-spacing: -0.04em;
        }
        .live-preview-card p,
        .creator-checklist p {
          color: var(--text-muted);
          line-height: 1.55;
        }
        .preview-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 1rem;
        }
        .preview-tags span,
        .check-row {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px;
          background: rgba(255,255,255,0.045);
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 800;
          padding: 0.4rem 0.65rem;
        }
        .check-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-bottom: 0.45rem;
        }
        .check-row[data-done="true"] {
          border-color: rgba(52,211,153,0.24);
          background: rgba(52,211,153,0.08);
          color: #bbf7d0;
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

        .privacy-btn-vip-active {
          border-color: rgba(251,191,36,0.6);
          background: rgba(251,191,36,0.15);
          color: #fbbf24;
        }

        .privacy-btn-vip-active:hover {
          background: rgba(251,191,36,0.22);
          box-shadow: 0 0 10px rgba(251,191,36,0.25);
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

        @media (max-width: 760px) {
          .start-layout { grid-template-columns: 1fr; }
          .start-side-panel { position: static; }
          .start-form { padding: 1.25rem; }
        }
      `}</style>
    </div>
  );
}
