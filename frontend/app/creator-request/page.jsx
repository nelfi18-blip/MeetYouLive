"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const CATEGORIES = [
  "Entretenimiento",
  "Música",
  "Gaming",
  "Deportes",
  "Arte y Diseño",
  "Educación",
  "Tecnología",
  "Cocina",
  "Viajes",
  "Moda y Belleza",
  "Fitness y Salud",
  "Humor y Comedia",
  "Noticias y Política",
  "Otro",
];

const LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ru", label: "Русский" },
];

function CreatorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/>
      <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/>
    </svg>
  );
}

export default function CreatorRequestPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    category: "",
    country: "",
    languages: [],
    socialLinks: { twitter: "", instagram: "", tiktok: "", youtube: "" },
  });

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
        if (data.role === "creator" || data.creatorStatus === "approved") {
          router.replace("/creator");
          return;
        }
        if (data.role === "admin") {
          router.replace("/admin");
          return;
        }
        setUser(data);
        // Pre-fill from previous application if any
        if (data.creatorApplication) {
          const app = data.creatorApplication;
          setForm({
            displayName: app.displayName || "",
            bio: app.bio || "",
            category: app.category || "",
            country: app.country || "",
            languages: app.languages || [],
            socialLinks: {
              twitter: app.socialLinks?.twitter || "",
              instagram: app.socialLinks?.instagram || "",
              tiktok: app.socialLinks?.tiktok || "",
              youtube: app.socialLinks?.youtube || "",
            },
          });
        }
      })
      .catch(() => setError("No se pudo cargar tu perfil"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSocialLink = (network, value) => {
    setForm((prev) => ({
      ...prev,
      socialLinks: { ...prev.socialLinks, [network]: value },
    }));
  };

  const toggleLanguage = (code) => {
    setForm((prev) => {
      const langs = prev.languages.includes(code)
        ? prev.languages.filter((l) => l !== code)
        : [...prev.languages, code];
      return { ...prev, languages: langs };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.displayName.trim()) return setError("El nombre de creador es requerido");
    if (!form.bio.trim()) return setError("La biografía es requerida");
    if (form.bio.trim().length < 20) return setError("La biografía debe tener al menos 20 caracteres");
    if (!form.category) return setError("Selecciona una categoría");
    if (!form.country.trim()) return setError("El país es requerido");
    if (form.languages.length === 0) return setError("Selecciona al menos un idioma");

    setSubmitting(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/user/me/creator-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al enviar solicitud");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius)" }} />
        <style jsx>{`.page { max-width: 640px; margin: 0 auto; }`}</style>
      </div>
    );
  }

  const isPending = user?.creatorStatus === "pending";
  const isApproved = user?.creatorStatus === "approved";

  return (
    <div className="page">
      <div className="card">
        <div className="card-icon">
          <CreatorIcon />
        </div>

        <h1 className="title">Conviértete en Creador</h1>
        <p className="sub">
          Como creador tendrás acceso a transmisiones en vivo, regalos, sesiones
          privadas de pago, contenido exclusivo y un panel de ganancias.
        </p>

        {isPending || success ? (
          <div className="status-box status-pending">
            <span className="status-icon">⏳</span>
            <div>
              <div className="status-title">Solicitud enviada</div>
              <div className="status-desc">
                Un administrador revisará tu solicitud pronto. Te notificaremos cuando haya una respuesta.
              </div>
            </div>
          </div>
        ) : isApproved ? (
          <div className="status-box status-approved">
            <span className="status-icon">✅</span>
            <div>
              <div className="status-title">¡Ya eres creador!</div>
              <div className="status-desc">Tu solicitud fue aprobada. Accede a tus herramientas de creador desde el panel.</div>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            {user?.creatorStatus === "rejected" && (
              <div className="status-box status-rejected">
                <span className="status-icon">❌</span>
                <div>
                  <div className="status-title">Solicitud rechazada</div>
                  <div className="status-desc">Puedes corregir tu solicitud y volver a enviarla.</div>
                </div>
              </div>
            )}

            <div className="field">
              <label className="label">Nombre de creador <span className="req">*</span></label>
              <input
                className="input"
                type="text"
                placeholder="Tu nombre público como creador"
                value={form.displayName}
                onChange={(e) => handleChange("displayName", e.target.value)}
                maxLength={60}
              />
            </div>

            <div className="field">
              <label className="label">Biografía <span className="req">*</span></label>
              <textarea
                className="input textarea"
                placeholder="Cuéntanos sobre ti y tu contenido (mín. 20 caracteres)"
                value={form.bio}
                onChange={(e) => handleChange("bio", e.target.value)}
                maxLength={400}
                rows={4}
              />
              <div className="char-count">{form.bio.length}/400</div>
            </div>

            <div className="field">
              <label className="label">Categoría <span className="req">*</span></label>
              <select
                className="input select"
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
              >
                <option value="">Selecciona una categoría…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">País <span className="req">*</span></label>
              <input
                className="input"
                type="text"
                placeholder="Tu país de residencia"
                value={form.country}
                onChange={(e) => handleChange("country", e.target.value)}
                maxLength={80}
              />
            </div>

            <div className="field">
              <label className="label">Idiomas en los que transmites <span className="req">*</span></label>
              <div className="lang-grid">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    className={`lang-chip${form.languages.includes(l.code) ? " lang-chip-active" : ""}`}
                    onClick={() => toggleLanguage(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="label">Redes sociales <span className="opt">(opcional)</span></label>
              <div className="social-grid">
                <div className="social-row">
                  <span className="social-label">🐦 Twitter/X</span>
                  <input
                    className="input social-input"
                    type="text"
                    placeholder="@usuario"
                    value={form.socialLinks.twitter}
                    onChange={(e) => handleSocialLink("twitter", e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="social-row">
                  <span className="social-label">📸 Instagram</span>
                  <input
                    className="input social-input"
                    type="text"
                    placeholder="@usuario"
                    value={form.socialLinks.instagram}
                    onChange={(e) => handleSocialLink("instagram", e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="social-row">
                  <span className="social-label">🎵 TikTok</span>
                  <input
                    className="input social-input"
                    type="text"
                    placeholder="@usuario"
                    value={form.socialLinks.tiktok}
                    onChange={(e) => handleSocialLink("tiktok", e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="social-row">
                  <span className="social-label">▶️ YouTube</span>
                  <input
                    className="input social-input"
                    type="text"
                    placeholder="Canal o URL"
                    value={form.socialLinks.youtube}
                    onChange={(e) => handleSocialLink("youtube", e.target.value)}
                    maxLength={120}
                  />
                </div>
              </div>
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
              className="btn-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Enviando…" : "Solicitar ser creador"}
            </button>
          </form>
        )}
      </div>

      <style jsx>{`
        .page {
          max-width: 640px;
          margin: 0 auto;
        }

        .card {
          background: rgba(15,8,32,0.8);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: var(--radius);
          padding: 2.5rem 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          text-align: center;
        }

        .card-icon {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-2);
        }

        .card-icon :global(svg) { width: 32px; height: 32px; }

        .title {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .sub {
          color: var(--text-muted);
          font-size: 0.9rem;
          line-height: 1.6;
          max-width: 480px;
        }

        .form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          text-align: left;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }

        .req { color: var(--error, #f87171); }
        .opt { color: var(--text-muted); font-weight: 400; font-size: 0.8rem; }

        .input {
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          font-size: 0.9rem;
          padding: 0.6rem 0.875rem;
          outline: none;
          transition: border-color 0.15s;
          width: 100%;
          box-sizing: border-box;
        }

        .input:focus {
          border-color: rgba(139,92,246,0.5);
        }

        .textarea {
          resize: vertical;
          min-height: 90px;
          font-family: inherit;
        }

        .select {
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
        }

        .char-count {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-align: right;
        }

        .lang-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .lang-chip {
          padding: 0.35rem 0.85rem;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }

        .lang-chip-active {
          border-color: rgba(139,92,246,0.6);
          background: rgba(139,92,246,0.12);
          color: var(--text);
        }

        .social-grid {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .social-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .social-label {
          font-size: 0.82rem;
          color: var(--text-muted);
          white-space: nowrap;
          width: 110px;
          flex-shrink: 0;
        }

        .social-input {
          flex: 1;
        }

        .error-box {
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.3);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          color: var(--error, #f87171);
          font-size: 0.875rem;
          width: 100%;
          text-align: left;
        }

        .btn-submit {
          width: 100%;
          padding: 0.875rem 1.5rem;
          background: var(--grad-primary);
          border: none;
          border-radius: var(--radius-pill);
          color: #fff;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: opacity var(--transition), box-shadow var(--transition);
          box-shadow: 0 4px 20px rgba(224,64,251,0.35);
        }

        .btn-submit:hover:not(:disabled) {
          opacity: 0.9;
          box-shadow: 0 6px 28px rgba(224,64,251,0.5);
        }

        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .status-box {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-sm);
          text-align: left;
          width: 100%;
        }

        .status-pending {
          background: rgba(251,146,60,0.08);
          border: 1px solid rgba(251,146,60,0.25);
        }

        .status-approved {
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.25);
        }

        .status-rejected {
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.25);
        }

        .status-icon { font-size: 1.4rem; flex-shrink: 0; }

        .status-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text);
        }

        .status-desc {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          line-height: 1.5;
        }

        @media (max-width: 480px) {
          .card { padding: 1.75rem 1.25rem; }
          .title { font-size: 1.35rem; }
          .social-row { flex-direction: column; align-items: flex-start; }
          .social-label { width: auto; }
        }
      `}</style>
    </div>
  );
}
