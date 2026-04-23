"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const GEOLOCATION_API_URL = process.env.NEXT_PUBLIC_GEOLOCATION_API_URL || "https://ipapi.co/json/";

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

const DEFAULT_LANGUAGE = "es";
const COUNTRY_DETECTION_TIMEOUT_MS = 2500;
const SOCIAL_PROOF_COUNT = 120;
const CTA_START_EARNING = "Empezar a ganar dinero";
const CTA_ACTIVATE_CREATOR = "Activar modo creador 💰";
const FALLBACK_BIO_CATEGORY = "contenido en vivo";
const FALLBACK_BIO_COUNTRY = "tu región";
const SEGMENT_THRESHOLDS = {
  newMaxLogins: 3,
  activeMinLogins: 8,
  spenderMinLogins: 20,
  spenderMaxCoins: 40,
};

const COUNTRIES = [
  "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Arabia Saudita", "Argelia", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaiyán", "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica", "Belice", "Benín", "Bielorrusia",
  "Birmania", "Bolivia", "Bosnia y Herzegovina", "Botsuana", "Brasil", "Brunéi", "Bulgaria", "Burkina Faso", "Burundi", "Bután",
  "Cabo Verde", "Camboya", "Camerún", "Canadá", "Catar", "Chad", "Chile", "China", "Chipre", "Colombia",
  "Comoras", "Corea del Norte", "Corea del Sur", "Costa de Marfil", "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Dominica", "Ecuador",
  "Egipto", "El Salvador", "Emiratos Árabes Unidos", "Eritrea", "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia", "Esuatini",
  "Etiopía", "Filipinas", "Finlandia", "Fiyi", "Francia", "Gabón", "Gambia", "Georgia", "Ghana", "Grecia",
  "Guatemala", "Guinea", "Guinea-Bisáu", "Guinea Ecuatorial", "Guyana", "Haití", "Honduras", "Hungría", "India", "Indonesia",
  "Irak", "Irán", "Irlanda", "Islandia", "Islas Marshall", "Islas Salomón", "Israel", "Italia", "Jamaica", "Japón",
  "Jordania", "Kazajistán", "Kenia", "Kirguistán", "Kiribati", "Kuwait", "Laos", "Lesoto", "Letonia", "Líbano",
  "Liberia", "Libia", "Liechtenstein", "Lituania", "Luxemburgo", "Macedonia del Norte", "Madagascar", "Malasia", "Malaui", "Maldivas",
  "Malí", "Malta", "Marruecos", "Mauricio", "Mauritania", "México", "Micronesia", "Moldavia", "Mónaco", "Mongolia",
  "Montenegro", "Mozambique", "Namibia", "Nauru", "Nepal", "Nicaragua", "Níger", "Nigeria", "Noruega", "Nueva Zelanda",
  "Omán", "Países Bajos", "Pakistán", "Palaos", "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú", "Polonia", "Portugal",
  "Reino Unido", "República Centroafricana", "República Checa", "República del Congo", "República Democrática del Congo", "República Dominicana", "Ruanda", "Rumanía", "Rusia", "Samoa",
  "San Cristóbal y Nieves", "San Marino", "San Vicente y las Granadinas", "Santa Lucía", "Santo Tomé y Príncipe", "Senegal", "Serbia", "Seychelles", "Sierra Leona", "Singapur",
  "Siria", "Somalia", "Sri Lanka", "Sudáfrica", "Sudán", "Sudán del Sur", "Suecia", "Suiza", "Surinam", "Tailandia",
  "Tanzania", "Tayikistán", "Timor Oriental", "Togo", "Tonga", "Trinidad y Tobago", "Túnez", "Turkmenistán", "Turquía", "Tuvalu",
  "Ucrania", "Uganda", "Uruguay", "Uzbekistán", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Yibuti", "Zambia", "Zimbabue",
];

const COUNTRY_ALIASES = {
  "united states": "Estados Unidos",
  "united kingdom": "Reino Unido",
  "czechia": "República Checa",
  "south korea": "Corea del Sur",
  "north korea": "Corea del Norte",
  "ivory coast": "Costa de Marfil",
  "russian federation": "Rusia",
  "uae": "Emiratos Árabes Unidos",
  "turkiye": "Turquía",
};

const normalizeText = (value) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function CreatorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
    </svg>
  );
}

export default function CreatorRequestPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [detectingCountry, setDetectingCountry] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    category: "",
    country: "",
    languages: [],
    socialLinks: { twitter: "", instagram: "", tiktok: "", youtube: "" },
  });

  const resolveCountryOption = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return "";

    const aliased = COUNTRY_ALIASES[normalized];
    if (aliased) return aliased;

    const exact = COUNTRIES.find((country) => normalizeText(country) === normalized);
    if (exact) return exact;

    return value.trim();
  };

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

        const previous = data.creatorApplication;
        if (previous) {
          const previousHasOptionalData =
            !!previous.bio?.trim() ||
            (Array.isArray(previous.languages) && previous.languages.length > 0) ||
            Object.values(previous.socialLinks || {}).some((value) => !!value?.trim());

          setForm({
            displayName: previous.displayName || data.username || data.name || "",
            bio: previous.bio?.trim() || "",
            category: previous.category || "",
            country: resolveCountryOption(previous.country || data.country || ""),
            languages: Array.isArray(previous.languages) ? previous.languages : [],
            socialLinks: {
              twitter: previous.socialLinks?.twitter || "",
              instagram: previous.socialLinks?.instagram || "",
              tiktok: previous.socialLinks?.tiktok || "",
              youtube: previous.socialLinks?.youtube || "",
            },
          });

          if (previousHasOptionalData) setStep(2);
          return;
        }

        setForm((prev) => ({
          ...prev,
          displayName: data.username || data.name || "",
          country: resolveCountryOption(data.country || ""),
        }));
      })
      .catch(() => setError("No se pudo cargar tu perfil"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (loading || form.country) return;

    let cancelled = false;

    const resolveCountryFromCode = (countryCode) => {
      if (!countryCode) return "";
      try {
        const displayNames = new Intl.DisplayNames(["es"], { type: "region" });
        return resolveCountryOption(displayNames.of(countryCode.toUpperCase()) || "");
      } catch {
        return "";
      }
    };

    const fallbackLocaleCountry = () => {
      try {
        const locale = navigator.language || "";
        const countryCode = locale.includes("-") ? locale.split("-")[1] : "";
        return resolveCountryFromCode(countryCode);
      } catch {
        return "";
      }
    };

    const detect = async () => {
      setDetectingCountry(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), COUNTRY_DETECTION_TIMEOUT_MS);
        const safeGeoApiUrl = GEOLOCATION_API_URL.startsWith("https://")
          ? GEOLOCATION_API_URL
          : "https://ipapi.co/json/";
        const res = await fetch(safeGeoApiUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const ipCountry =
            resolveCountryFromCode(data?.country_code) ||
            resolveCountryOption(data?.country_name || "");

          if (!cancelled && ipCountry) {
            setForm((prev) => (prev.country ? prev : { ...prev, country: ipCountry }));
            setDetectingCountry(false);
            return;
          }
        }
      } catch (detectErr) {
        console.warn("Country auto-detection failed:", detectErr);
        // fallback below
      }

      const localeCountry = fallbackLocaleCountry();
      if (!cancelled && localeCountry) {
        setForm((prev) => (prev.country ? prev : { ...prev, country: localeCountry }));
      }
      if (!cancelled) setDetectingCountry(false);
    };

    detect();

    return () => {
      cancelled = true;
    };
  }, [loading, form.country]);

  const countryOptions = useMemo(() => {
    const options = [...COUNTRIES];
    const current = resolveCountryOption(form.country);
    if (current && !options.some((country) => normalizeText(country) === normalizeText(current))) {
      options.push(current);
    }
    return options.sort((a, b) => a.localeCompare(b, "es"));
  }, [form.country]);

  const behaviorSegment = useMemo(() => {
    const loginCount = Number(user?.loginCount || 0);
    if (loginCount <= SEGMENT_THRESHOLDS.newMaxLogins) return "new";
    if (
      loginCount >= SEGMENT_THRESHOLDS.spenderMinLogins &&
      (user?.coins ?? 0) <= SEGMENT_THRESHOLDS.spenderMaxCoins
    ) {
      return "spender";
    }
    if (loginCount >= SEGMENT_THRESHOLDS.activeMinLogins) return "active";
    return "default";
  }, [user]);

  const segmentHeadline =
    user?.creatorStatus === "pending"
      ? "Solicitud en revisión"
      : behaviorSegment === "new"
      ? "¿Quieres ganar dinero en vivo?"
      : behaviorSegment === "spender"
      ? "Recupera lo que gastas creando contenido"
      : behaviorSegment === "active"
      ? "Ya estás listo para monetizar"
      : "Activa tu modo creador";

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

  const validateStep1 = () => {
    if (!form.displayName.trim()) {
      setError("El nombre de creador es requerido");
      return false;
    }
    if (!form.category) {
      setError("Selecciona una categoría");
      return false;
    }
    if (!form.country.trim()) {
      setError("Selecciona un país");
      return false;
    }
    return true;
  };

  const getFallbackLanguage = () => {
    const browserLang = (navigator.language || DEFAULT_LANGUAGE).slice(0, 2).toLowerCase();
    return LANGUAGES.some((lang) => lang.code === browserLang) ? browserLang : DEFAULT_LANGUAGE;
  };

  const buildPayload = () => {
    const safeCategory = form.category.trim() || FALLBACK_BIO_CATEGORY;
    const safeCountry = form.country.trim() || FALLBACK_BIO_COUNTRY;
    const fallbackBio = `Creador de ${safeCategory} desde ${safeCountry}.`;
    return {
      displayName: form.displayName.trim(),
      bio: form.bio.trim() || fallbackBio,
      category: form.category.trim(),
      country: resolveCountryOption(form.country.trim()),
      languages: form.languages.length > 0 ? form.languages : [getFallbackLanguage()],
      socialLinks: {
        twitter: form.socialLinks.twitter.trim(),
        instagram: form.socialLinks.instagram.trim(),
        tiktok: form.socialLinks.tiktok.trim(),
        youtube: form.socialLinks.youtube.trim(),
      },
    };
  };

  const handleContinue = (e) => {
    e.preventDefault();
    setError("");
    if (!validateStep1()) return;
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateStep1()) return;

    setSubmitting(true);
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_URL}/api/creator/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildPayload()),
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
  const isSuspended = user?.creatorStatus === "suspended";

  return (
    <div className="page">
      <div className="card">
        <div className="card-icon">
          <CreatorIcon />
        </div>

        <h1 className="title">Empieza a ganar dinero hoy 💰</h1>
        <p className="sub">
          Convierte tu tiempo en ingresos reales y activa tu modo creador.
          Solicita acceso en minutos.
        </p>

        <div className="segment-pill">{segmentHeadline}</div>

        <div className="proof-grid">
          <div className="proof-item">+{SOCIAL_PROOF_COUNT} creadores ya están ganando dinero</div>
          <div className="proof-item">Pagos activos en la plataforma</div>
          <div className="proof-item">Únete hoy y empieza en minutos</div>
        </div>

        <div className="features-grid">
          <div className="feature-item">
            <span className="feature-icon">🎥</span>
            <span className="feature-label">Transmite en vivo</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💖</span>
            <span className="feature-label">Recibe regalos</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💬</span>
            <span className="feature-label">Chats privados pagados</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔥</span>
            <span className="feature-label">Llamadas 1 a 1</span>
          </div>
        </div>

        {isPending || success ? (
          <div className="status-box status-pending">
            <span className="status-icon">🚀</span>
            <div>
              <div className="status-title">Solicitud enviada 🚀</div>
              <div className="status-desc">Nuestro equipo la revisará pronto.</div>
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
        ) : isSuspended ? (
          <div className="status-box status-suspended">
            <span className="status-icon">🚫</span>
            <div>
              <div className="status-title">Cuenta suspendida</div>
              <div className="status-desc">Tu acceso como creador ha sido suspendido. Contacta al soporte para más información.</div>
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

            <div className="stepper">
              <div className={`step-chip${step === 1 ? " step-chip-active" : ""}`}>1. Requerido</div>
              <div className={`step-chip${step === 2 ? " step-chip-active" : ""}`}>2. Opcional</div>
            </div>

            {step === 1 ? (
              <>
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
                  <select
                    className="input select"
                    value={resolveCountryOption(form.country)}
                    onChange={(e) => handleChange("country", e.target.value)}
                    required
                  >
                    <option value="">Selecciona tu país…</option>
                    {countryOptions.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                  {detectingCountry && <div className="hint">Detectando país automáticamente…</div>}
                </div>

                <div className="cta-row">
                  <button className="btn-secondary" type="button" onClick={handleContinue} disabled={submitting}>
                    Continuar
                  </button>
                  <button className="btn-submit" type="submit" disabled={submitting}>
                    {submitting ? "Enviando…" : CTA_START_EARNING}
                  </button>
                </div>
                <div className="hint">Puedes enviar ahora mismo; los datos opcionales ayudan a revisar tu perfil más rápido.</div>
              </>
            ) : (
              <>
                <div className="field">
                  <label className="label">Biografía <span className="opt">(opcional)</span></label>
                  <textarea
                    className="input textarea"
                    placeholder="Cuéntanos sobre ti y tu contenido"
                    value={form.bio}
                    onChange={(e) => handleChange("bio", e.target.value)}
                    maxLength={400}
                    rows={4}
                  />
                  <div className="char-count">{form.bio.length}/400</div>
                </div>

                <div className="field">
                  <label className="label">Idiomas en los que transmites <span className="opt">(opcional)</span></label>
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

                <div className="cta-row">
                  <button className="btn-secondary" type="button" onClick={() => setStep(1)} disabled={submitting}>
                    Volver
                  </button>
                  <button className="btn-submit" type="submit" disabled={submitting}>
                    {submitting ? "Enviando…" : CTA_ACTIVATE_CREATOR}
                  </button>
                </div>
              </>
            )}

            {error && <div className="error-box">{error}</div>}
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

        .segment-pill {
          padding: 0.45rem 0.85rem;
          border-radius: var(--radius-pill);
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.35);
          color: var(--text);
          font-size: 0.82rem;
          font-weight: 700;
        }

        .proof-grid {
          width: 100%;
          display: grid;
          gap: 0.5rem;
        }

        .proof-item {
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.25);
          border-radius: var(--radius-sm);
          padding: 0.55rem 0.8rem;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          width: 100%;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(139,92,246,0.18);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }

        .feature-icon {
          font-size: 1.25rem;
          line-height: 1;
          flex-shrink: 0;
        }

        .feature-label { line-height: 1.3; }

        .form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          text-align: left;
        }

        .stepper {
          display: flex;
          gap: 0.6rem;
        }

        .step-chip {
          font-size: 0.75rem;
          padding: 0.3rem 0.65rem;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          color: var(--text-muted);
          background: rgba(255,255,255,0.02);
        }

        .step-chip-active {
          border-color: rgba(139,92,246,0.5);
          color: var(--text);
          background: rgba(139,92,246,0.12);
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

        .hint {
          font-size: 0.78rem;
          color: var(--text-muted);
        }

        .cta-row {
          display: grid;
          gap: 0.65rem;
          grid-template-columns: 1fr 1fr;
        }

        .btn-secondary,
        .btn-submit {
          width: 100%;
          padding: 0.875rem 1.5rem;
          border-radius: var(--radius-pill);
          font-size: 0.95rem;
          font-weight: 700;
          transition: opacity var(--transition), box-shadow var(--transition);
          cursor: pointer;
        }

        .btn-secondary {
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
          color: var(--text);
        }

        .btn-submit {
          background: var(--grad-primary);
          border: none;
          color: #fff;
          box-shadow: 0 4px 20px rgba(224,64,251,0.35);
        }

        .btn-submit:hover:not(:disabled) {
          opacity: 0.9;
          box-shadow: 0 6px 28px rgba(224,64,251,0.5);
        }

        .btn-secondary:hover:not(:disabled) {
          border-color: rgba(139,92,246,0.5);
        }

        .btn-secondary:disabled,
        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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

        .status-suspended {
          background: rgba(251,146,60,0.08);
          border: 1px solid rgba(251,146,60,0.4);
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
          .features-grid { grid-template-columns: 1fr; }
          .social-row { flex-direction: column; align-items: flex-start; }
          .social-label { width: auto; }
          .cta-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
