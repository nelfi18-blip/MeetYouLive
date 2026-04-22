"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_INTERESTS = 10;
const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;
const MAX_PROFILE_PHOTOS = 6;
const MAX_EXTRA_PROFILE_PHOTOS = 5;
const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_AVATAR_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const MIN_AGE_YEARS = 13;
const MIN_AGE_DATE = new Date(Date.now() - MIN_AGE_YEARS * 365.25 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

const getUploadMessageFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  if (payload.error && typeof payload.error.message === "string" && payload.error.message.trim()) {
    return payload.error.message;
  }
  return "";
};

const getUploadErrorMessage = (status, payload, fallback = "Error al subir la foto") => {
  const payloadMessage = getUploadMessageFromPayload(payload);
  if (payloadMessage) return payloadMessage;
  if (status === 401) return "Tu sesión expiró. Inicia sesión de nuevo.";
  if (status === 413) return "La imagen es demasiado grande. El máximo permitido es 5 MB.";
  if (status === 415) return "Formato de imagen no válido. Usa JPG, PNG, WebP o GIF.";
  return fallback;
};

const parseUploadResponseBody = async (res) => {
  try {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } catch {
    return null;
  }
};

const hasAllowedAvatarExtension = (filename = "") => {
  const normalized = filename.trim().toLowerCase();
  return ALLOWED_AVATAR_EXTENSIONS.some((ext) => normalized.endsWith(ext));
};

const buildUploadEndpoint = ({ setAsMain = true } = {}) => {
  if (typeof API_URL !== "string" || !API_URL.trim()) {
    console.error("[avatar-upload] NEXT_PUBLIC_API_URL no está configurado");
    return "";
  }
  const base = `${API_URL.replace(/\/+$/, "")}/api/user/me/avatar-upload`;
  return setAsMain ? base : `${base}?setAsMain=0`;
};

const normalizeAvatarUrl = (avatarValue) => {
  if (typeof avatarValue !== "string") return "";
  const trimmed = avatarValue.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(trimmed) && typeof API_URL === "string" && API_URL.trim()) {
    return `${API_URL.replace(/\/+$/, "")}${trimmed}`;
  }
  return "";
};

const INTERESTS = [
  "Música", "Gaming", "Arte", "Viajes", "Fitness",
  "Cocina", "Tecnología", "Cine", "Moda", "Fotografía",
  "Naturaleza", "Libros", "Yoga", "Deportes", "Danza",
  "Meditación", "Humor", "Idiomas", "Ciencia", "Historia",
];

// Step indices: 0=Welcome, 1=Path, 2=Profile, 3=Interests, 4=Photo
const STEPS = ["Bienvenida", "Tu camino", "Sobre ti", "Intereses", "Tu foto"];

const VALUE_PROPS = [
  { emoji: "💖", title: "Haz match", desc: "Conecta con personas que comparten tus intereses" },
  { emoji: "🎥", title: "Conecta en vivo", desc: "Videollamadas y streams en tiempo real" },
  { emoji: "🎁", title: "Envía y recibe regalos", desc: "Sorprende a tus conexiones con regalos virtuales" },
  { emoji: "💰", title: "Gana como creador", desc: "Monetiza tu audiencia haciendo lo que amas" },
];

const PATHS = [
  {
    id: "crush",
    emoji: "💖",
    title: "Conocer personas",
    desc: "Encuentra tu match ideal y conecta con gente real cerca de ti.",
    hook: "🪙 Los coins te dan acceso a interacciones exclusivas",
    route: "/crush",
    color: "#ff2d78",
    glow: "rgba(255,45,120,0.35)",
  },
  {
    id: "live",
    emoji: "🎥",
    title: "Ver directos",
    desc: "Únete a streams en vivo, envía regalos y conéctate en tiempo real.",
    hook: "🎁 Con coins puedes enviar regalos y entrar a salas VIP",
    route: "/live",
    color: "#818cf8",
    glow: "rgba(129,140,248,0.35)",
  },
  {
    id: "creator",
    emoji: "🌟",
    title: "Ganar como creador",
    desc: "Crea tu perfil de creador, transmite en vivo y cobra por tu contenido.",
    hook: "💵 Los creadores aprobados reciben pagos reales",
    route: "/creator-request",
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.35)",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const animTimerRef = useRef(null);

  // Step 1: chosen path
  const [selectedPath, setSelectedPath] = useState(null);

  // Step 2 fields (profile)
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [location, setLocation] = useState("");

  // Step 3 fields (interests)
  const [interests, setInterests] = useState([]);

  // Step 4 fields (photos)
  const [mainPhotoFile, setMainPhotoFile] = useState(null);
  const [mainPhotoPreview, setMainPhotoPreview] = useState("");
  const [extraPhotoFiles, setExtraPhotoFiles] = useState([]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.replace("/login");
    }
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [router]);

  const goToStep = (next) => {
    setAnimating(true);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 220);
  };

  const toggleInterest = (interest) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : prev.length < MAX_INTERESTS
        ? [...prev, interest]
        : prev
    );
  };

  const validateAvatarFile = (file) => {
    if (!file) return "Selecciona una imagen válida.";
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) return "Formato de imagen no válido. Usa JPG, PNG, WebP o GIF.";
    if (!hasAllowedAvatarExtension(file.name)) return "Nombre de archivo no válido. Usa JPG, PNG, WebP o GIF.";
    if (file.size > MAX_AVATAR_FILE_SIZE) return "La imagen es demasiado grande. El máximo permitido es 5 MB.";
    return "";
  };

  const readPreview = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(file);
    });

  const handleAddPhotoFiles = async (filesList) => {
    const files = Array.from(filesList || []);
    if (!files.length) return;
    setError("");

    let totalPhotos = (mainPhotoFile ? 1 : 0) + extraPhotoFiles.length;
    let nextMainFile = mainPhotoFile;
    let nextMainPreview = mainPhotoPreview;
    const nextExtras = [...extraPhotoFiles];

    for (const file of files) {
      if (totalPhotos >= MAX_PROFILE_PHOTOS) break;
      const validationError = validateAvatarFile(file);
      if (validationError) {
        setError(validationError);
        continue;
      }
      // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
      console.log("[onboarding-avatar-upload] selected file metadata", {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
      });
      try {
        const preview = await readPreview(file);
        if (!nextMainFile) {
          nextMainFile = file;
          nextMainPreview = preview;
        } else {
          nextExtras.push({ id: `${Date.now()}-${Math.random()}`, file, preview });
        }
        totalPhotos += 1;
      } catch {
        setError("No se pudo leer uno de los archivos seleccionados.");
      }
    }

    setMainPhotoFile(nextMainFile);
    setMainPhotoPreview(nextMainPreview);
    setExtraPhotoFiles(nextExtras.slice(0, MAX_EXTRA_PROFILE_PHOTOS));
  };

  const handleRemoveMainPhoto = () => {
    if (extraPhotoFiles.length > 0) {
      const [nextMain, ...rest] = extraPhotoFiles;
      setMainPhotoFile(nextMain.file);
      setMainPhotoPreview(nextMain.preview);
      setExtraPhotoFiles(rest);
      return;
    }
    setMainPhotoFile(null);
    setMainPhotoPreview("");
  };

  const handleRemoveExtraPhoto = (photoId) => {
    setExtraPhotoFiles((prev) => prev.filter((photo) => photo.id !== photoId));
  };

  const handleMakeMainPhoto = (photoId) => {
    setExtraPhotoFiles((prev) => {
      const index = prev.findIndex((photo) => photo.id === photoId);
      if (index < 0) return prev;
      const selected = prev[index];
      const nextExtras = prev.filter((photo) => photo.id !== photoId);
      if (mainPhotoFile && mainPhotoPreview) {
        nextExtras.unshift({ id: `${Date.now()}-${Math.random()}`, file: mainPhotoFile, preview: mainPhotoPreview });
      }
      setMainPhotoFile(selected.file);
      setMainPhotoPreview(selected.preview);
      return nextExtras.slice(0, MAX_EXTRA_PROFILE_PHOTOS);
    });
  };

  const handleNext = () => {
    setError("");
    if (step === 1 && !selectedPath) {
      setError("Elige tu camino para continuar");
      return;
    }
    if (step === 2) {
      if (!name.trim()) {
        setError("El nombre es obligatorio");
        return;
      }
    }
    goToStep(step + 1);
  };

  const handleSkipFinish = async () => {
    await finish();
  };

  const finish = async () => {
    setLoading(true);
    setError("");

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Tu sesión expiró. Inicia sesión de nuevo.");
      setLoading(false);
      router.replace("/login");
      return;
    }

    const uploadPhotoFile = async (file, { setAsMain = false } = {}) => {
      const uploadEndpoint = buildUploadEndpoint({ setAsMain });
      if (!uploadEndpoint) return { ok: false, message: "No se pudo iniciar la subida. Falta la configuración del servidor." };

      const formData = new FormData();
      formData.append("avatar", file);
      // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
      console.log("[onboarding-avatar-upload] request start", { url: uploadEndpoint });
      const uploadRes = await fetch(uploadEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
      console.log("[onboarding-avatar-upload] response status", uploadRes.status);
      const uploadData = await parseUploadResponseBody(uploadRes);
      // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
      console.log("[onboarding-avatar-upload] response body", uploadData);
      if (!uploadRes.ok) {
        return {
          ok: false,
          unauthorized: uploadRes.status === 401,
          message: getUploadErrorMessage(uploadRes.status, uploadData, "Error al subir la foto"),
        };
      }
      const normalizedAvatar = normalizeAvatarUrl(uploadData?.avatar || uploadData?.mainPhoto);
      if (!normalizedAvatar) {
        return { ok: false, message: "No se pudo obtener la URL de la imagen subida." };
      }
      const normalizedPhotos = Array.isArray(uploadData?.profilePhotos)
        ? uploadData.profilePhotos.map((photo) => normalizeAvatarUrl(photo)).filter(Boolean).slice(0, MAX_PROFILE_PHOTOS)
        : [];
      return { ok: true, avatar: normalizedAvatar, profilePhotos: normalizedPhotos };
    };

    let workingMainFile = mainPhotoFile;
    let workingExtraFiles = [...extraPhotoFiles];
    if (!workingMainFile && workingExtraFiles.length > 0) {
      const promoted = workingExtraFiles.shift();
      workingMainFile = promoted.file;
    }

    let finalAvatarUrl = "";
    const finalProfilePhotos = [];

    try {
      if (workingMainFile) {
        const mainUpload = await uploadPhotoFile(workingMainFile, { setAsMain: true });
        if (!mainUpload.ok) {
          if (mainUpload.unauthorized) router.replace("/login");
          setError(mainUpload.message || "No se pudo subir la foto principal.");
          setLoading(false);
          return;
        }
        finalAvatarUrl = mainUpload.avatar;
        if (finalAvatarUrl) finalProfilePhotos.push(finalAvatarUrl);
      }

      for (const extra of workingExtraFiles) {
        const extraUpload = await uploadPhotoFile(extra.file, { setAsMain: false });
        if (!extraUpload.ok) {
          if (extraUpload.unauthorized) {
            router.replace("/login");
            setLoading(false);
            return;
          }
          setError(extraUpload.message || "Una foto no se pudo subir. Inténtalo de nuevo.");
          setLoading(false);
          return;
        }
        if (extraUpload.avatar && !finalProfilePhotos.includes(extraUpload.avatar)) {
          finalProfilePhotos.push(extraUpload.avatar);
        }
      }
    } catch (err) {
      // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
      console.error("[onboarding-avatar-upload] caught frontend error", err);
      setError("No se pudo subir la foto");
      setLoading(false);
      return;
    }

    // Map selected path to intent
    const intentMap = { crush: "dating", live: "live", creator: "creator" };
    const intent = intentMap[selectedPath] || "";

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
          avatar: finalAvatarUrl || undefined,
          profilePhotos: finalProfilePhotos.length ? finalProfilePhotos.slice(0, MAX_PROFILE_PHOTOS) : undefined,
          intent: intent || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Error al guardar el perfil");
        return;
      }
      const destination = PATHS.find((p) => p.id === selectedPath)?.route || "/dashboard";
      router.replace(destination);
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

        {/* Progress — hide on welcome step */}
        {step > 0 && (
          <div className="ob-progress">
            {STEPS.slice(1).map((label, i) => {
              const idx = i + 1;
              return (
                <div key={label} className={`ob-step${idx === step ? " active" : idx < step ? " done" : ""}`}>
                  <div className="ob-step-dot">{idx < step ? "✓" : idx}</div>
                  <span className="ob-step-label">{label}</span>
                </div>
              );
            })}
            <div className="ob-progress-bar">
              <div className="ob-progress-fill" style={{ width: `${((step - 1) / (STEPS.length - 2)) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div className="banner-error" style={{ marginBottom: "1rem" }}>{error}</div>}

        <div className={`ob-step-content${animating ? " ob-fade-out" : " ob-fade-in"}`}>

          {/* ──────────────────────────────────────────
              Step 0 – Welcome / Value Proposition
          ────────────────────────────────────────── */}
          {step === 0 && (
            <div className="ob-section">
              <div className="ob-hero">
                <h1 className="ob-hero-title">Bienvenido a <span className="ob-hero-accent">MeetYouLive</span></h1>
                <p className="ob-hero-sub">La plataforma donde conexiones reales se convierten en momentos únicos</p>
              </div>

              <div className="ob-value-grid">
                {VALUE_PROPS.map((vp) => (
                  <div key={vp.title} className="ob-value-card">
                    <span className="ob-value-emoji">{vp.emoji}</span>
                    <div>
                      <div className="ob-value-title">{vp.title}</div>
                      <div className="ob-value-desc">{vp.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ob-actions">
                <button className="btn btn-primary ob-btn-next ob-btn-hero" onClick={() => goToStep(1)}>
                  Empezar ahora ✨
                </button>
              </div>
              <p className="ob-legal-hint">Gratis para siempre · Sin tarjeta de crédito</p>
            </div>
          )}

          {/* ──────────────────────────────────────────
              Step 1 – Choose Your Path
          ────────────────────────────────────────── */}
          {step === 1 && (
            <div className="ob-section">
              <h2 className="ob-title">¿Qué quieres hacer?</h2>
              <p className="ob-subtitle">Elige tu camino — podrás cambiar después</p>

              <div className="ob-paths">
                {PATHS.map((path) => (
                  <button
                    key={path.id}
                    className={`ob-path-card${selectedPath === path.id ? " selected" : ""}`}
                    style={selectedPath === path.id ? { "--path-color": path.color, "--path-glow": path.glow } : {}}
                    onClick={() => { setSelectedPath(path.id); setError(""); }}
                  >
                    <span className="ob-path-emoji">{path.emoji}</span>
                    <div className="ob-path-body">
                      <div className="ob-path-title">{path.title}</div>
                      <div className="ob-path-desc">{path.desc}</div>
                      <div className="ob-path-hook">{path.hook}</div>
                    </div>
                    {selectedPath === path.id && <span className="ob-path-check">✓</span>}
                  </button>
                ))}
              </div>

              <div className="ob-actions ob-actions-row" style={{ marginTop: "1.5rem" }}>
                <button className="btn ob-btn-back" onClick={() => goToStep(0)}>
                  ← Atrás
                </button>
                <button className="btn btn-primary ob-btn-next" onClick={handleNext}>
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              Step 2 – About You (profile)
          ────────────────────────────────────────── */}
          {step === 2 && (
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

              <div className="ob-actions ob-actions-row">
                <button className="btn ob-btn-back" onClick={() => goToStep(1)}>
                  ← Atrás
                </button>
                <button className="btn btn-primary ob-btn-next" onClick={handleNext}>
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              Step 3 – Interests
          ────────────────────────────────────────── */}
          {step === 3 && (
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
                <button className="btn ob-btn-back" onClick={() => goToStep(2)}>
                  ← Atrás
                </button>
                <button className="btn btn-primary ob-btn-next" onClick={handleNext}>
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              Step 4 – Avatar
          ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="ob-section">
              <h2 className="ob-title">Arma tu perfil de fotos</h2>
              <p className="ob-subtitle">Elige 1 foto principal y hasta {MAX_EXTRA_PROFILE_PHOTOS} fotos extra</p>

              <div className="ob-avatar-preview">
                {mainPhotoPreview ? (
                  <img
                    src={mainPhotoPreview}
                    alt="Foto principal"
                    className="ob-avatar-img"
                    onError={() => { setMainPhotoFile(null); setMainPhotoPreview(""); }}
                  />
                ) : (
                  <div className="ob-avatar-placeholder">
                    {name ? name[0].toUpperCase() : "?"}
                  </div>
                )}
              </div>
              <div className="ob-main-label">Foto principal</div>

              {mainPhotoFile && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem" }}>
                  <button type="button" className="btn ob-btn-back" onClick={handleRemoveMainPhoto} disabled={loading}>
                    Eliminar principal
                  </button>
                </div>
              )}

              {extraPhotoFiles.length > 0 && (
                <div className="ob-photo-grid">
                  {extraPhotoFiles.map((photo) => (
                    <div key={photo.id} className="ob-photo-item">
                      <img src={photo.preview} alt="Foto adicional" className="ob-photo-item-img" />
                      <div className="ob-photo-item-actions">
                        <button type="button" className="btn ob-btn-back ob-btn-photo" onClick={() => handleMakeMainPhoto(photo.id)} disabled={loading}>
                          Hacer principal
                        </button>
                        <button type="button" className="btn ob-btn-back ob-btn-photo" onClick={() => handleRemoveExtraPhoto(photo.id)} disabled={loading}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="ob-field">
                <label className="ob-label">Agregar fotos</label>
                <label className="ob-upload-btn">
                  ➕ Agregar fotos
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    style={{ display: "none" }}
                    disabled={loading}
                    onChange={(e) => {
                      handleAddPhotoFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <span className="ob-hint">Máximo {MAX_PROFILE_PHOTOS} fotos en total.</span>
              </div>

              {/* Coin / Creator destination hook */}
              {selectedPath && (
                <div className="ob-destination-hint">
                  {selectedPath === "creator" ? (
                    <>🌟 Al terminar irás a <strong>solicitar ser creador</strong> — aprobación rápida</>
                  ) : selectedPath === "live" ? (
                    <>🎥 Al terminar explorarás los <strong>directos en vivo</strong></>
                  ) : (
                    <>💖 Al terminar encontrarás tu <strong>Crush</strong></>
                  )}
                </div>
              )}

              {/* Confidence room hint */}
              <div className="ob-confidence-hint">
                💬 ¿Te cuesta romper el hielo? Practica en nuestra <strong>Sala de Confianza</strong> antes de conectar con alguien real.
              </div>

              <div className="ob-actions ob-actions-row">
                <button className="btn ob-btn-back" onClick={() => goToStep(3)}>
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
                Omitir foto por ahora
              </button>
            </div>
          )}

        </div>{/* end ob-step-content */}
      </div>

      <style>{`
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

        /* ── Transitions ── */
        .ob-step-content {
          transition: opacity 0.22s ease, transform 0.22s ease;
        }
        .ob-fade-out {
          opacity: 0;
          transform: translateY(8px);
        }
        .ob-fade-in {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Logo ── */
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

        /* ── Progress ── */
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

        /* ── Section ── */
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

        /* ── Welcome / Hero (Step 0) ── */
        .ob-hero {
          text-align: center;
          margin-bottom: 2rem;
        }
        .ob-hero-title {
          font-size: 1.9rem;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--text);
          line-height: 1.15;
          margin-bottom: 0.65rem;
        }
        .ob-hero-accent {
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 60%, #818cf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ob-hero-sub {
          color: var(--text-muted);
          font-size: 0.95rem;
          line-height: 1.5;
        }
        .ob-value-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 2rem;
        }
        .ob-value-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 0.95rem 1.1rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: var(--radius-sm);
          transition: border-color 0.2s, background 0.2s;
        }
        .ob-value-card:hover {
          border-color: rgba(224,64,251,0.25);
          background: rgba(224,64,251,0.05);
        }
        .ob-value-emoji {
          font-size: 1.6rem;
          flex-shrink: 0;
          line-height: 1;
          margin-top: 2px;
        }
        .ob-value-title {
          font-size: 0.92rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.15rem;
        }
        .ob-value-desc {
          font-size: 0.8rem;
          color: var(--text-muted);
          line-height: 1.4;
        }
        .ob-btn-hero {
          font-size: 1.05rem !important;
          padding: 1rem !important;
          letter-spacing: 0.01em;
          box-shadow: 0 0 32px rgba(255,45,120,0.35);
        }
        .ob-legal-hint {
          text-align: center;
          font-size: 0.74rem;
          color: var(--text-dim);
          margin-top: 0.85rem;
        }

        /* ── Path Selection (Step 1) ── */
        .ob-paths {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .ob-path-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.1rem 1.2rem;
          background: rgba(255,255,255,0.03);
          border: 1.5px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-sm);
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
          position: relative;
          width: 100%;
        }
        .ob-path-card:hover {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.05);
        }
        .ob-path-card.selected {
          border-color: var(--path-color, #ff2d78);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 20px var(--path-glow, rgba(255,45,120,0.3));
        }
        .ob-path-emoji {
          font-size: 2rem;
          flex-shrink: 0;
          line-height: 1;
          margin-top: 2px;
        }
        .ob-path-body { flex: 1; min-width: 0; }
        .ob-path-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.25rem;
        }
        .ob-path-desc {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
          line-height: 1.4;
        }
        .ob-path-hook {
          font-size: 0.76rem;
          color: var(--accent-green);
          font-weight: 600;
        }
        .ob-path-check {
          position: absolute;
          top: 0.9rem;
          right: 1rem;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--path-color, #ff2d78);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 800;
          flex-shrink: 0;
        }

        /* ── Destination hint (Step 4) ── */
        .ob-destination-hint {
          margin-bottom: 1rem;
          padding: 0.75rem 1rem;
          background: rgba(52,211,153,0.07);
          border: 1px solid rgba(52,211,153,0.2);
          border-radius: var(--radius-sm);
          font-size: 0.82rem;
          color: var(--accent-green);
          line-height: 1.4;
        }
        .ob-destination-hint strong { color: #fff; }

        .ob-confidence-hint {
          margin-bottom: 1rem;
          padding: 0.65rem 1rem;
          background: rgba(244,114,182,0.07);
          border: 1px solid rgba(244,114,182,0.2);
          border-radius: var(--radius-sm);
          font-size: 0.78rem;
          color: #fce7f3;
          line-height: 1.4;
        }
        .ob-confidence-hint strong { color: #f472b6; }

        /* ── Fields ── */
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

        /* ── Interests ── */
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

        /* ── Avatar ── */
        .ob-avatar-preview {
          display: flex;
          justify-content: center;
          margin-bottom: 0.75rem;
        }
        .ob-avatar-img {
          width: min(100%, 240px);
          aspect-ratio: 1 / 1;
          border-radius: 14px;
          object-fit: cover;
          border: 3px solid rgba(224,64,251,0.3);
          box-shadow: 0 0 24px rgba(224,64,251,0.25);
        }
        .ob-avatar-placeholder {
          width: min(100%, 240px);
          aspect-ratio: 1 / 1;
          border-radius: 14px;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.2rem;
          font-weight: 800;
          color: #fff;
          box-shadow: 0 0 24px rgba(224,64,251,0.3);
        }
        .ob-main-label {
          text-align: center;
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          margin-bottom: 1rem;
          font-weight: 700;
        }
        .ob-photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 0.6rem;
          margin-bottom: 1rem;
        }
        .ob-photo-item {
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
          padding: 0.4rem;
        }
        .ob-photo-item-img {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 10px;
          object-fit: cover;
          margin-bottom: 0.35rem;
        }
        .ob-photo-item-actions {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .ob-btn-photo {
          padding: 0.45rem 0.5rem !important;
          font-size: 0.72rem !important;
        }

        /* ── Actions ── */
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

        /* ── File upload button ── */
        .ob-upload-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 1.1rem;
          border-radius: var(--radius-sm);
          border: 1px dashed rgba(224,64,251,0.4);
          background: rgba(224,64,251,0.06);
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ob-upload-btn:hover {
          border-color: rgba(224,64,251,0.7);
          color: var(--text);
          background: rgba(224,64,251,0.1);
        }

        .divider-text {
          text-align: center;
          font-size: 0.75rem;
          color: var(--text-dim);
          margin: 0.5rem 0;
          position: relative;
        }
        .divider-text::before, .divider-text::after {
          content: "";
          position: absolute;
          top: 50%;
          width: 38%;
          height: 1px;
          background: rgba(255,255,255,0.08);
        }
        .divider-text::before { left: 0; }
        .divider-text::after { right: 0; }

        @media (max-width: 480px) {
          .onboarding-card { padding: 2rem 1.25rem; }
          .ob-row { flex-direction: column; }
          .ob-hero-title { font-size: 1.55rem; }
          .ob-photo-item-actions { flex-direction: row; flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
