"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_INTERESTS = 10;
const MIN_AGE_YEARS = 13;
const MIN_AGE_DATE = new Date(Date.now() - MIN_AGE_YEARS * 365.25 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

const INTERESTS = [
  "Música", "Gaming", "Arte", "Viajes", "Fitness",
  "Cocina", "Tecnología", "Cine", "Moda", "Fotografía",
  "Naturaleza", "Libros", "Yoga", "Deportes", "Danza",
  "Meditación", "Humor", "Idiomas", "Ciencia", "Historia",
];

const STEPS = ["Sobre ti", "Intereses", "Tu foto"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 0 fields
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [location, setLocation] = useState("");

  // Step 1 fields
  const [interests, setInterests] = useState([]);

  // Step 2 fields
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.replace("/login");
    }
  }, [router]);

  const toggleInterest = (interest) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : prev.length < MAX_INTERESTS
        ? [...prev, interest]
        : prev
    );
  };

  const handleNext = () => {
    setError("");
    if (step === 0) {
      if (!name.trim()) {
        setError("El nombre es obligatorio");
        return;
      }
    }
    setStep((s) => s + 1);
  };

  const handleSkipFinish = async () => {
    await finish();
  };

  const finish = async () => {
    setLoading(true);
    setError("");

    // Basic avatar URL validation to prevent XSS via javascript: URIs
    const trimmedAvatar = avatarUrl.trim();
    if (trimmedAvatar && !/^https?:\/\//i.test(trimmedAvatar)) {
      setError("La URL de la foto debe comenzar con http:// o https://");
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/user/me/onboarding`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim() || undefined,
          bio: bio.trim() || undefined,
          gender: gender || undefined,
          birthdate: birthdate || undefined,
          interests,
          location: location.trim() || undefined,
          avatar: trimmedAvatar || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Error al guardar el perfil");
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-root">
      <div className="onboarding-card">
        {/* Logo */}
        <div className="ob-logo">
          <Image src="/logo.svg" alt="MeetYouLive" width={44} height={44} priority />
          <span className="ob-logo-text">Meet You<span className="ob-logo-accent">Live</span></span>
        </div>

        {/* Progress */}
        <div className="ob-progress">
          {STEPS.map((label, i) => (
            <div key={label} className={`ob-step${i === step ? " active" : i < step ? " done" : ""}`}>
              <div className="ob-step-dot">{i < step ? "✓" : i + 1}</div>
              <span className="ob-step-label">{label}</span>
            </div>
          ))}
          <div className="ob-progress-bar">
            <div className="ob-progress-fill" style={{ width: `${((step) / (STEPS.length - 1)) * 100}%` }} />
          </div>
        </div>

        {/* Error */}
        {error && <div className="banner-error" style={{ marginBottom: "1rem" }}>{error}</div>}

        {/* Step 0 – About you */}
        {step === 0 && (
          <div className="ob-section">
            <h2 className="ob-title">Cuéntanos sobre ti</h2>
            <p className="ob-subtitle">Esta información ayuda a otros usuarios a conocerte</p>

            <div className="ob-field">
              <label className="ob-label">Tu nombre *</label>
              <input
                className="input"
                placeholder="¿Cómo quieres que te llamen?"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </div>

            <div className="ob-field">
              <label className="ob-label">Sobre ti</label>
              <textarea
                className="input ob-textarea"
                placeholder="Cuéntanos algo interesante sobre ti…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={300}
                rows={3}
              />
              <span className="ob-char-count">{bio.length}/300</span>
            </div>

            <div className="ob-row">
              <div className="ob-field ob-field-half">
                <label className="ob-label">Género</label>
                <select
                  className="input"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Prefiero no decirlo</option>
                  <option value="man">Hombre</option>
                  <option value="woman">Mujer</option>
                  <option value="nonbinary">No binario</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div className="ob-field ob-field-half">
                <label className="ob-label">Fecha de nacimiento</label>
                <input
                  className="input"
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  max={MIN_AGE_DATE}
                />
              </div>
            </div>

            <div className="ob-field">
              <label className="ob-label">Ciudad / País</label>
              <input
                className="input"
                placeholder="Ej: Madrid, España"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className="ob-actions">
              <button className="btn btn-primary ob-btn-next" onClick={handleNext}>
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* Step 1 – Interests */}
        {step === 1 && (
          <div className="ob-section">
            <h2 className="ob-title">¿Qué te gusta?</h2>
            <p className="ob-subtitle">Selecciona hasta 10 intereses para conectar mejor</p>

            <div className="ob-interests-grid">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  className={`ob-interest-pill${interests.includes(interest) ? " selected" : ""}`}
                  onClick={() => toggleInterest(interest)}
                >
                  {interest}
                </button>
              ))}
            </div>

            <div className="ob-selected-count">
              {interests.length}/{MAX_INTERESTS} seleccionados
            </div>

            <div className="ob-actions ob-actions-row">
              <button className="btn ob-btn-back" onClick={() => setStep(0)}>
                ← Atrás
              </button>
              <button className="btn btn-primary ob-btn-next" onClick={handleNext}>
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 – Avatar */}
        {step === 2 && (
          <div className="ob-section">
            <h2 className="ob-title">Añade una foto</h2>
            <p className="ob-subtitle">Una foto de perfil ayuda a que otros te reconozcan</p>

            <div className="ob-avatar-preview">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="ob-avatar-img" onError={() => setAvatarUrl("")} />
              ) : (
                <div className="ob-avatar-placeholder">
                  {name ? name[0].toUpperCase() : "?"}
                </div>
              )}
            </div>

            <div className="ob-field">
              <label className="ob-label">URL de tu foto de perfil</label>
              <input
                className="input"
                placeholder="https://ejemplo.com/tu-foto.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
              <span className="ob-hint">Pega la URL de una imagen pública (Gravatar, LinkedIn, etc.)</span>
            </div>

            <div className="ob-actions ob-actions-row">
              <button className="btn ob-btn-back" onClick={() => setStep(1)}>
                ← Atrás
              </button>
              <button
                className="btn btn-primary ob-btn-next"
                onClick={finish}
                disabled={loading}
              >
                {loading ? "Guardando…" : "¡Listo! Entrar →"}
              </button>
            </div>

            <button className="ob-skip" onClick={handleSkipFinish} disabled={loading}>
              Omitir por ahora
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .onboarding-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
        }

        .onboarding-card {
          width: 100%;
          max-width: 520px;
          background: linear-gradient(160deg, rgba(22,8,45,0.97) 0%, rgba(12,5,25,0.99) 100%);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: var(--radius);
          padding: 2.5rem 2rem;
          box-shadow: var(--shadow), 0 0 80px rgba(139,92,246,0.1);
        }

        /* Logo */
        .ob-logo {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin-bottom: 2rem;
          justify-content: center;
        }
        .ob-logo-text {
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--text);
        }
        .ob-logo-accent {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Progress */
        .ob-progress {
          display: flex;
          align-items: center;
          gap: 0;
          margin-bottom: 2rem;
          position: relative;
        }
        .ob-progress-bar {
          position: absolute;
          bottom: -12px;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255,255,255,0.07);
          border-radius: 2px;
        }
        .ob-progress-fill {
          height: 100%;
          background: var(--grad-primary);
          border-radius: 2px;
          transition: width 0.4s ease;
        }
        .ob-step {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex: 1;
        }
        .ob-step-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
          border: 2px solid rgba(255,255,255,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--text-muted);
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .ob-step.active .ob-step-dot {
          background: var(--grad-primary);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 0 12px rgba(224,64,251,0.5);
        }
        .ob-step.done .ob-step-dot {
          background: rgba(52,211,153,0.15);
          border-color: var(--success);
          color: var(--success);
        }
        .ob-step-label {
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-dim);
        }
        .ob-step.active .ob-step-label { color: var(--text); }
        .ob-step.done .ob-step-label { color: var(--success); }

        /* Section */
        .ob-section { display: flex; flex-direction: column; gap: 0; }
        .ob-title {
          font-size: 1.45rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text);
          margin-bottom: 0.35rem;
        }
        .ob-subtitle {
          color: var(--text-muted);
          font-size: 0.88rem;
          margin-bottom: 1.75rem;
        }

        /* Fields */
        .ob-field {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin-bottom: 1.1rem;
        }
        .ob-label {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .ob-textarea {
          resize: vertical;
          min-height: 80px;
        }
        .ob-char-count {
          font-size: 0.7rem;
          color: var(--text-dim);
          text-align: right;
        }
        .ob-hint {
          font-size: 0.72rem;
          color: var(--text-dim);
        }
        .ob-row {
          display: flex;
          gap: 0.85rem;
        }
        .ob-field-half { flex: 1; }

        /* Interests */
        .ob-interests-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          margin-bottom: 1rem;
        }
        .ob-interest-pill {
          padding: 0.45rem 1rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s;
        }
        .ob-interest-pill:hover {
          border-color: rgba(224,64,251,0.4);
          color: var(--text);
        }
        .ob-interest-pill.selected {
          background: rgba(224,64,251,0.12);
          border-color: var(--accent-2);
          color: var(--accent-2);
          box-shadow: 0 0 10px rgba(224,64,251,0.2);
        }
        .ob-selected-count {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-bottom: 1.25rem;
        }

        /* Avatar */
        .ob-avatar-preview {
          display: flex;
          justify-content: center;
          margin-bottom: 1.5rem;
        }
        .ob-avatar-img {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid rgba(224,64,251,0.3);
          box-shadow: 0 0 24px rgba(224,64,251,0.25);
        }
        .ob-avatar-placeholder {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.2rem;
          font-weight: 800;
          color: #fff;
          box-shadow: 0 0 24px rgba(224,64,251,0.3);
        }

        /* Actions */
        .ob-actions {
          margin-top: 0.5rem;
        }
        .ob-actions-row {
          display: flex;
          gap: 0.75rem;
        }
        .ob-btn-next {
          flex: 1;
          width: 100%;
          padding: 0.85rem;
          font-size: 0.95rem;
          font-weight: 700;
        }
        .ob-btn-back {
          padding: 0.85rem 1.25rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s;
          flex-shrink: 0;
        }
        .ob-btn-back:hover {
          background: rgba(255,255,255,0.08);
          color: var(--text);
        }
        .ob-skip {
          margin-top: 1rem;
          display: block;
          width: 100%;
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 0.8rem;
          cursor: pointer;
          text-align: center;
          padding: 0.5rem;
          transition: color 0.18s;
        }
        .ob-skip:hover { color: var(--text-muted); }

        @media (max-width: 480px) {
          .onboarding-card { padding: 2rem 1.25rem; }
          .ob-row { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
