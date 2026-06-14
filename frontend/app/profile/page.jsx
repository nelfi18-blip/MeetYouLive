"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearToken, getToken, setToken } from "@/lib/token";
import { useLanguage, SUPPORTED_LANGS } from "@/contexts/LanguageContext";
import ReferralCard from "@/components/ReferralCard";
import StatusBadges from "@/components/StatusBadges";
import { computeStatusBadges, getBoostNudge } from "@/lib/statusBadges";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { normalizeImageUrl } from "@/lib/imageHelpers";
import { publishProfileUpdated } from "@/lib/profileSync";
import {
  AVATAR_TOO_LARGE_MESSAGE,
  AVATAR_UPLOAD_MAX_BYTES,
  AVATAR_UPLOAD_MAX_LABEL,
  compressAvatarImage,
} from "@/lib/avatarUpload";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_PROFILE_PHOTOS = 6;
const MAX_EXTRA_PROFILE_PHOTOS = 5;
const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_AVATAR_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const DISCOVERY_GOAL_OPTIONS = ["serious_relationship", "friendship", "dating", "networking"];
const DISTANCE_OPTIONS = [5, 10, 25, 50, 100];

const hasAllowedAvatarExtension = (filename = "") => {
  const normalized = filename.trim().toLowerCase();
  return ALLOWED_AVATAR_EXTENSIONS.some((ext) => normalized.endsWith(ext));
};

const getUploadMessageFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  if (payload.error && typeof payload.error.message === "string" && payload.error.message.trim()) {
    return payload.error.message;
  }
  return "";
};

const getUploadErrorMessage = (status, payload, fallback = "Error al subir la imagen") => {
  const payloadMessage = getUploadMessageFromPayload(payload);
  if (payloadMessage) return payloadMessage;
  if (status === 401) return "Tu sesión expiró. Inicia sesión de nuevo.";
  if (status === 413) return AVATAR_TOO_LARGE_MESSAGE;
  if (status === 415) return "Formato de imagen no válido. Usa JPG, PNG, WebP o GIF.";
  if (status === 500) return "Error interno al subir la imagen. Inténtalo de nuevo.";
  return fallback;
};

const getUploadDiagnostic = (status, payload, fallback = "Error al subir la imagen") => {
  const message = getUploadErrorMessage(status, payload, fallback);
  const code = payload?.code || (status === 0 ? "NETWORK_ERROR" : `HTTP_${status || "UNKNOWN"}`);
  const error = typeof payload?.error === "string" && payload.error.trim()
    ? payload.error
    : (payload?.raw ? "Non-JSON response" : code);
  return { status, error, message, code };
};

const formatUploadDiagnostic = ({ status, error, message, code }) => {
  const details = [
    `status: ${status || "sin respuesta"}`,
    `error: ${error || "desconocido"}`,
    `message: ${message || "sin mensaje"}`,
    `code: ${code || "UNKNOWN"}`,
  ].join(" · ");
  return `${message || "No se pudo subir/procesar la foto"} (${details})`;
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
  } catch (err) {
    console.error("[profile] backend-token recovery failed:", err);
    return null;
  }
};

const buildUploadEndpoint = ({ setAsMain = true } = {}) => {
  if (typeof API_URL !== "string" || !API_URL.trim()) {
    console.error("[avatar-upload] NEXT_PUBLIC_API_URL no está configurado");
    return "";
  }
  const base = `${API_URL.replace(/\/+$/, "")}/api/user/me/avatar-upload`;
  return setAsMain ? base : `${base}?setAsMain=0`;
};

const normalizeAvatarUrl = (avatarValue) => normalizeImageUrl(avatarValue) || "";

const normalizePhotoList = (avatarValue, profilePhotosValue) => {
  const normalizedAvatar = normalizeAvatarUrl(avatarValue);
  const normalizedPhotos = Array.isArray(profilePhotosValue) ? profilePhotosValue : [];
  const unique = [];
  for (const value of normalizedPhotos) {
    const normalized = normalizeAvatarUrl(value);
    if (!normalized || unique.includes(normalized)) continue;
    unique.push(normalized);
    if (unique.length >= MAX_PROFILE_PHOTOS) break;
  }

  if (normalizedAvatar) {
    return [normalizedAvatar, ...unique.filter((url) => url !== normalizedAvatar)].slice(0, MAX_PROFILE_PHOTOS);
  }
  return unique.slice(0, MAX_PROFILE_PHOTOS);
};

const reorderWithMain = (photos, mainPhoto) => {
  const normalizedMain = normalizeAvatarUrl(mainPhoto);
  const normalized = normalizePhotoList(normalizedMain, photos);
  if (!normalizedMain) return normalized;
  return [normalizedMain, ...normalized.filter((url) => url !== normalizedMain)].slice(0, MAX_PROFILE_PHOTOS);
};

const normalizeDiscoveryForm = (user = {}) => {
  const preferences = user.discoveryPreferences || {};
  const ageRange = preferences.ageRange || {};
  const languages = Array.isArray(preferences.languages) ? preferences.languages : [];
  const goals = Array.isArray(preferences.goals) ? preferences.goals : [];
  const location = user.location && typeof user.location === "object" ? user.location : {};
  const legacyLocation = typeof user.location === "string" ? user.location : user.locationLabel || "";
  const [legacyCity = "", legacyCountry = ""] = legacyLocation.split(",").map((part) => part.trim());
  const coordinates = location.coordinates || {};
  const [coordinateLng, coordinateLat] = Array.isArray(coordinates) ? coordinates : [];
  return {
    gender: typeof user.gender === "string" ? user.gender : "",
    interestedIn:
      user.interestedIn === "" || user.interestedIn === null || user.interestedIn === undefined
        ? "both"
        : user.interestedIn,
    discoveryAgeMin: ageRange.min ?? "",
    discoveryAgeMax: ageRange.max ?? "",
    discoveryScope: user.discoveryScope || preferences.discoveryScope || "global",
    discoveryMaxDistanceKm: user.maxDistanceKm ?? preferences.maxDistanceKm ?? "",
    locationCountry: location.country || legacyCountry || "",
    locationCity: location.city || legacyCity || "",
    locationRegion: location.region || "",
    locationLat: coordinateLat ?? coordinates.lat ?? "",
    locationLng: coordinateLng ?? coordinates.lng ?? "",
    discoveryLanguages: languages.filter((lang) => ["es", "en", "pt"].includes(lang)),
    discoveryGoals: goals.filter((goal) => DISCOVERY_GOAL_OPTIONS.includes(goal)),
  };
};

const buildDiscoveryPayloadFromForm = (form) => {
  const minRaw = form.discoveryAgeMin === "" ? null : Number(form.discoveryAgeMin);
  const maxRaw = form.discoveryAgeMax === "" ? null : Number(form.discoveryAgeMax);
  const min =
    minRaw === null || Number.isNaN(minRaw) ? null : Math.max(18, Math.min(100, Math.floor(minRaw)));
  const max =
    maxRaw === null || Number.isNaN(maxRaw) ? null : Math.max(18, Math.min(100, Math.floor(maxRaw)));
  const distanceRaw = form.discoveryMaxDistanceKm === "" ? null : Number(form.discoveryMaxDistanceKm);
  const maxDistanceKm =
    distanceRaw === null || Number.isNaN(distanceRaw)
      ? null
      : Math.max(1, Math.min(10000, Math.floor(distanceRaw)));

  const sortedMin = min !== null && max !== null ? Math.min(min, max) : min;
  const sortedMax = min !== null && max !== null ? Math.max(min, max) : max;

  return {
    gender: form.gender === "" ? null : form.gender,
    interestedIn: form.interestedIn || "both",
    location: {
      country: (form.locationCountry || "").trim(),
      city: (form.locationCity || "").trim(),
      region: (form.locationRegion || "").trim(),
      coordinates: {
        lat: form.locationLat === "" ? null : Number(form.locationLat),
        lng: form.locationLng === "" ? null : Number(form.locationLng),
      },
    },
    locationLabel: [form.locationCity, form.locationRegion, form.locationCountry].filter(Boolean).join(", "),
    maxDistanceKm,
    discoveryScope: form.discoveryScope || "global",
    discoveryPreferences: {
      ageRange: { min: sortedMin, max: sortedMax },
      maxDistanceKm,
      discoveryScope: form.discoveryScope || "global",
      languages: Array.isArray(form.discoveryLanguages) ? form.discoveryLanguages : [],
      goals: Array.isArray(form.discoveryGoals) ? form.discoveryGoals : [],
    },
  };
};

function StarIcon()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function EditIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function KeyIcon()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>; }
function LogoutIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function CoinIcon()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/></svg>; }
function TrophyIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 21 12 17 16 21"/><path d="M19 3H5v10a7 7 0 0014 0V3z"/><line x1="9" y1="3" x2="9" y2="13"/><line x1="15" y1="3" x2="15" y2="13"/></svg>; }
function CalIcon()     { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function ArrowRightIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>; }
function BroadcastIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49"/></svg>; }
function ExploreIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ChatIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>; }
function ShopIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/></svg>; }

function useBoostCountdown(boostUntil) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!boostUntil) { setLabel(""); return; }
    const update = () => {
      const ms = new Date(boostUntil) - Date.now();
      if (ms <= 0) { setLabel(""); return; }
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      setLabel(`${min}:${String(sec).padStart(2, "0")}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [boostUntil]);
  return label;
}

function BoostCard({ isBoosted, boostUntil, boostPrice, coins, loading, error, success, onBoost }) {
  const countdown = useBoostCountdown(isBoosted ? boostUntil : null);
  const canAfford = coins >= boostPrice;
  return (
    <div className={`boost-profile-card${isBoosted ? " boost-profile-card--active" : ""}`}>
      <div className="boost-profile-icon">🚀</div>
      <div className="boost-profile-body">
        <div className="boost-profile-title">
          {isBoosted ? "🚀 Boost activo" : "🚀 Aumenta tus matches"}
        </div>
        <div className="boost-profile-sub">
          {isBoosted && countdown
            ? `Tu perfil aparece primero en Crush — queda ${countdown}`
            : `Aparece primero en Crush durante 30 minutos · 🪙 ${boostPrice} monedas`}
        </div>
        {error && <div className="boost-profile-error">{error}</div>}
        {success && <div className="boost-profile-success">{success}</div>}
      </div>
      {!isBoosted && (
        <button
          className="boost-profile-btn"
          onClick={onBoost}
          disabled={loading || !canAfford}
          title={!canAfford ? `Necesitas ${boostPrice} monedas` : "Activar Boost"}
        >
          {loading ? "Activando…" : !canAfford ? "Sin monedas" : `Boost · 🪙${boostPrice}`}
        </button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const { t, lang, setLang, syncFromUser } = useLanguage();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: "",
    name: "",
    bio: "",
    avatar: "",
    profilePhotos: [],
    gender: "",
    interestedIn: "",
    discoveryAgeMin: "",
    discoveryAgeMax: "",
    discoveryScope: "global",
    discoveryMaxDistanceKm: "",
    locationCountry: "",
    locationCity: "",
    locationRegion: "",
    locationLat: "",
    locationLng: "",
    discoveryLanguages: [],
    discoveryGoals: [],
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  const [langSaving, setLangSaving] = useState(false);
  const [langSuccess, setLangSuccess] = useState("");

  const [requestingCreator, setRequestingCreator] = useState(false);
  const [creatorReqError, setCreatorReqError] = useState("");
  const [creatorReqSuccess, setCreatorReqSuccess] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState("");

  const [isBoosted, setIsBoosted] = useState(false);
  const [boostUntil, setBoostUntil] = useState(null);
  const [boostPrice, setBoostPrice] = useState(100);
  const [boostLoading, setBoostLoading] = useState(false);
  const [boostError, setBoostError] = useState("");
  const [boostSuccess, setBoostSuccess] = useState("");
  const goalLabelByValue = {
    serious_relationship: t("profile.goalSeriousRelationship"),
    friendship: t("profile.goalFriendship"),
    dating: t("profile.goalDating"),
    networking: t("profile.goalNetworking"),
  };
  const getScopeLabel = (scope = "global") => {
    const normalizedScope = ["nearby", "country", "global"].includes(scope) ? scope : "global";
    return {
      nearby: t("profile.scopeNearby"),
      country: t("profile.scopeCountry"),
      global: t("profile.scopeGlobal"),
    }[normalizedScope];
  };
  const isDistanceButtonActive = (distance) =>
    Number(editForm.discoveryMaxDistanceKm) === distance && editForm.discoveryScope === "nearby";

  const refreshProfileSession = useCallback(async () => {
    try {
      if (typeof updateSession === "function") {
        await updateSession();
      }
    } catch (err) {
      console.error("[profile] failed to refresh session:", err);
    }
  }, [updateSession]);

  const updateAndPublishUser = useCallback((updates) => {
    if (!user) return null;
    const nextUser = typeof updates === "function" ? updates(user) : { ...user, ...updates };
    setUser(nextUser);
    publishProfileUpdated(nextUser);
    return nextUser;
  }, [publishProfileUpdated, user]);

  const applyLoadedProfile = useCallback((profile) => {
    const normalizedPhotos = normalizePhotoList(profile.avatar, profile.profilePhotos);
    const normalizedAvatar = normalizedPhotos[0] || "";
    const normalizedUser = { ...profile, avatar: normalizedAvatar, profilePhotos: normalizedPhotos };
    const discoveryDefaults = normalizeDiscoveryForm(normalizedUser);
    setUser(normalizedUser);
    setEditForm({
      username: normalizedUser.username || "",
      name: normalizedUser.name || "",
      bio: normalizedUser.bio || "",
      avatar: normalizedUser.avatar || "",
      profilePhotos: normalizedUser.profilePhotos || [],
      ...discoveryDefaults,
    });
    if (profile.preferredLanguage) syncFromUser(profile.preferredLanguage);
    return normalizedUser;
  }, [syncFromUser]);

  const resolveToken = useCallback(async () => {
    let token = getToken();
    if (token) return token;

    if (session?.backendToken) {
      setToken(session.backendToken);
      return session.backendToken;
    }

    if (status === "authenticated" && session?.googleEmail) {
      try {
        const response = await fetch("/api/auth/backend-token", { method: "POST", cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (data?.token) {
            setToken(data.token);
            return data.token;
          }
        }
      } catch {
        return null;
      }
    }

    return null;
  }, [session?.backendToken, session?.googleEmail, status]);

  const loadProfile = useCallback(async ({ signal, silent = false } = {}) => {
    if (status === "loading") return;

    const token = await resolveToken();
    if (signal?.aborted) return;

    if (!token) {
      clearToken();
      router.replace("/login?callbackUrl=/profile");
      return;
    }

    if (!silent) setLoading(true);
    setError("");

    try {
      const headers = { Authorization: "Bearer " + token };
      const [profileRes, boostRes] = await Promise.all([
        fetch(`${API_URL}/api/user/me`, { headers, cache: "no-store", signal }),
        fetch(`${API_URL}/api/matches/boost-status`, { headers, cache: "no-store", signal }).catch(() => null),
      ]);

      if (signal?.aborted) return;

      if (profileRes.status === 401) {
        clearToken();
        router.replace("/login?callbackUrl=/profile");
        return;
      }
      if (!profileRes.ok) throw new Error("Error al cargar perfil");

      const d = await profileRes.json();
      applyLoadedProfile(d);

      if (boostRes?.ok) {
        const boostData = await boostRes.json();
        setIsBoosted(boostData.isBoosted ?? false);
        setBoostUntil(boostData.boostUntil ?? null);
        setBoostPrice(boostData.boostPrice ?? 100);
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error("[profile] failed to load profile:", err);
      setError("No se pudo cargar el perfil");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [applyLoadedProfile, resolveToken, router, status]);

  useEffect(() => {
    const controller = new AbortController();
    loadProfile({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [loadProfile]);

  const handleBoost = async () => {
    setBoostError(""); setBoostSuccess(""); setBoostLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/matches/boost`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setIsBoosted(true);
        setBoostUntil(data.boostUntil);
        updateAndPublishUser((u) => u ? { ...u, coins: (u.coins ?? 0) - boostPrice } : u);
        await refreshProfileSession();
        setBoostSuccess("🚀 ¡Boost activado! Tu perfil aparece primero en Crush.");
        setTimeout(() => setBoostSuccess(""), 4000);
      } else {
        setBoostError(data.message || "No se pudo activar el Boost");
      }
    } catch {
      setBoostError("Error de red. Intenta de nuevo.");
    } finally {
      setBoostLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    signOut({ callbackUrl: "/login" });
  };

  const handleLanguageSave = async (newLang) => {
    setLang(newLang);
    setLangSuccess("");
    setLangSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (token) {
        await fetch(`${API_URL}/api/user/me`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferredLanguage: newLang }),
          cache: "no-store",
        });
      }
      updateAndPublishUser({ preferredLanguage: newLang });
      await refreshProfileSession();
      setLangSuccess(t("profile.languageSaved"));
      setTimeout(() => setLangSuccess(""), 3000);
    } catch {
      // Language is already changed locally; backend save is best-effort
    } finally {
      setLangSaving(false);
    }
  };

  const handleEdit = () => {
    setSaveError(""); setSaveSuccess(""); setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    const normalizedPhotos = normalizePhotoList(user.avatar, user.profilePhotos);
    const normalizedAvatar = normalizedPhotos[0] || "";
    setEditForm({
      username: user.username || "",
      name: user.name || "",
      bio: user.bio || "",
      avatar: normalizedAvatar,
      profilePhotos: normalizedPhotos,
      ...normalizeDiscoveryForm(user),
    });
    setPhotoUrlInput("");
    setSaveError(""); setSaveSuccess("");
  };

  const handleUseCurrentLocation = () => {
    setSaveError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setSaveError(t("profile.locationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setEditForm((f) => ({
          ...f,
          discoveryScope: "nearby",
          locationLat: String(position.coords.latitude),
          locationLng: String(position.coords.longitude),
          locationCity: f.locationCity || t("profile.automaticLocationLabel"),
        }));
      },
      () => setSaveError(t("profile.locationPermissionDenied")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError(""); setSaveSuccess(""); setSaving(true);

    // Validate avatar URL to prevent XSS via javascript: URIs
    if (editForm.avatar && !/^https?:\/\//i.test(editForm.avatar.trim())) {
      setSaveError("La URL de la foto debe comenzar con http:// o https://");
      setSaving(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const discoveryPayload = buildDiscoveryPayloadFromForm(editForm);
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username: editForm.username,
          name: editForm.name,
          bio: editForm.bio,
          avatar: editForm.avatar,
          profilePhotos: normalizePhotoList(editForm.avatar, editForm.profilePhotos),
          ...discoveryPayload,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.message || "Error al guardar los cambios"); return; }
      const normalizedPhotos = normalizePhotoList(data.avatar, data.profilePhotos);
      const normalizedAvatar = normalizedPhotos[0] || "";
      const normalizedUser = { ...data, avatar: normalizedAvatar, profilePhotos: normalizedPhotos };
      setUser(normalizedUser);
      setEditForm({
        username: normalizedUser.username || "",
        name: normalizedUser.name || "",
        bio: normalizedUser.bio || "",
        avatar: normalizedUser.avatar || "",
        profilePhotos: normalizedUser.profilePhotos || [],
        ...normalizeDiscoveryForm(normalizedUser),
      });
      setPhotoUrlInput("");
      setSaveSuccess(t("profile.saveSuccess"));
      setEditing(false);
      publishProfileUpdated(normalizedUser);
      await refreshProfileSession();
    } catch { setSaveError("No se pudo conectar con el servidor"); }
    finally { setSaving(false); }
  };

  const handleChangePwd = async (e) => {
    e.preventDefault();
    setPwdError(""); setPwdSuccess("");
    if (pwdForm.newPassword !== pwdForm.confirmPassword) { setPwdError("Las contraseñas nuevas no coinciden"); return; }
    if (pwdForm.newPassword.length < 6) { setPwdError("La nueva contraseña debe tener al menos 6 caracteres"); return; }
    setPwdSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/user/me/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pwdForm.currentPassword, newPassword: pwdForm.newPassword }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.message || "Error al cambiar la contraseña"); return; }
      setPwdSuccess(data.message || "Contraseña actualizada correctamente");
      setChangingPwd(false);
      setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch { setPwdError("No se pudo conectar con el servidor"); }
    finally { setPwdSaving(false); }
  };

  const handleCreatorRequest = async () => {
    setCreatorReqError(""); setCreatorReqSuccess(""); setRequestingCreator(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/user/me/creator-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) { setCreatorReqError(data.message || "Error al enviar la solicitud"); return; }
      setCreatorReqSuccess(data.message || "Solicitud enviada correctamente");
      updateAndPublishUser({ creatorStatus: "pending" });
      await refreshProfileSession();
    } catch { setCreatorReqError("No se pudo conectar con el servidor"); }
    finally { setRequestingCreator(false); }
  };

  const applyPhotoPayload = (payload, successMessage = "") => {
    const normalizedPhotos = normalizePhotoList(payload?.avatar, payload?.profilePhotos);
    const normalizedAvatar = normalizedPhotos[0] || "";
    updateAndPublishUser({ avatar: normalizedAvatar, profilePhotos: normalizedPhotos });
    setEditForm((prev) => (
      prev
        ? { ...prev, avatar: normalizedAvatar, profilePhotos: normalizedPhotos }
        : prev
    ));
    if (successMessage) setSaveSuccess(successMessage);
  };

  const validateAvatarFile = (file) => {
    if (!file) return "Selecciona una imagen válida.";
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) return "Formato de imagen no válido. Usa JPG, PNG, WebP o GIF.";
    if (!hasAllowedAvatarExtension(file.name)) return "Nombre de archivo no válido. Usa JPG, PNG, WebP o GIF.";
    return "";
  };

  const uploadProfilePhotoFile = async (file, { setAsMain = false } = {}) => {
    const fileError = validateAvatarFile(file);
    if (fileError) return { ok: false, error: fileError };

    // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
    console.log("[avatar-upload] selected file metadata", {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    });

    const token = localStorage.getItem("token");
    if (!token) return { ok: false, error: "Tu sesión expiró. Inicia sesión de nuevo.", unauthorized: true };
    const uploadEndpoint = buildUploadEndpoint({ setAsMain });
    if (!uploadEndpoint) return { ok: false, error: "No se pudo iniciar la subida. Falta la configuración del servidor." };
    const uploadFile = await compressAvatarImage(file);
    if (uploadFile.size > AVATAR_UPLOAD_MAX_BYTES) {
      const diagnostic = getUploadDiagnostic(413, {
        error: "File too large",
        message: AVATAR_TOO_LARGE_MESSAGE,
        code: "FILE_TOO_LARGE",
      });
      return { ok: false, error: formatUploadDiagnostic(diagnostic), diagnostic };
    }

    const formData = new FormData();
    formData.append("avatar", uploadFile);

    // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
    console.log("[avatar-upload] request start", { url: uploadEndpoint });
    let res;
    try {
      res = await fetch(uploadEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      cache: "no-store",
      });
    } catch (err) {
      const diagnostic = getUploadDiagnostic(0, { error: err?.message, code: "NETWORK_ERROR" }, "No se pudo conectar con el backend. Revisa CORS o la URL del API.");
      return { ok: false, error: formatUploadDiagnostic(diagnostic), diagnostic };
    }
    // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
    console.log("[avatar-upload] response status", res.status);
    const data = await parseUploadResponseBody(res);
    // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
    console.log("[avatar-upload] response body", data);

    if (!res.ok) {
      const diagnostic = getUploadDiagnostic(res.status, data, "Error al subir la imagen");
      return {
        ok: false,
        unauthorized: res.status === 401,
        error: formatUploadDiagnostic(diagnostic),
        diagnostic,
      };
    }
    return { ok: true, data };
  };

  const persistProfilePhotos = async (photos, mainPhoto, successMessage) => {
    setSaveError(""); setSaveSuccess("");
    const token = localStorage.getItem("token");
    if (!token) {
      setSaveError("Tu sesión expiró. Inicia sesión de nuevo.");
      return false;
    }
    try {
      const normalized = reorderWithMain(photos, mainPhoto);
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          avatar: normalized[0] || "",
          profilePhotos: normalized,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
        }
        setSaveError(data?.message || "No se pudieron guardar las fotos.");
        return false;
      }
      applyPhotoPayload(data, successMessage);
      await refreshProfileSession();
      return true;
    } catch {
      setSaveError("No se pudo conectar con el servidor.");
      return false;
    }
  };

  const handleReplaceMainPhoto = async (file) => {
    setAvatarUploading(true);
    setSaveError(""); setSaveSuccess("");
    try {
      const uploadResult = await uploadProfilePhotoFile(file, { setAsMain: true });
      if (!uploadResult.ok) {
        if (uploadResult.unauthorized) {
          clearToken();
          router.replace("/login");
        }
        setSaveError(uploadResult.error || "No se pudo subir la foto principal.");
        return;
      }
      applyPhotoPayload(uploadResult.data, "Foto principal actualizada correctamente");
      await refreshProfileSession();
    } catch (err) {
      // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
      console.error("[avatar-upload] caught frontend error", err);
      setSaveError("No se pudo subir la imagen");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAddExtraPhotos = async (filesList) => {
    const files = Array.from(filesList || []);
    if (!files.length) return;
    const currentPhotos = normalizePhotoList(editForm.avatar, editForm.profilePhotos);
    const availableSlots = Math.max(0, MAX_PROFILE_PHOTOS - currentPhotos.length);
    if (!availableSlots) {
      setSaveError(`Ya alcanzaste el máximo de ${MAX_PROFILE_PHOTOS} fotos.`);
      return;
    }

    setAvatarUploading(true);
    setSaveError(""); setSaveSuccess("");
    let uploadedCount = 0;
    const maxFiles = files.slice(0, availableSlots);

    try {
      for (const file of maxFiles) {
        const uploadResult = await uploadProfilePhotoFile(file, { setAsMain: false });
        if (!uploadResult.ok) {
          if (uploadResult.unauthorized) {
            clearToken();
            router.replace("/login");
            return;
          }
          setSaveError(uploadResult.error || "Una foto no se pudo subir.");
          continue;
        }
        uploadedCount += 1;
        applyPhotoPayload(uploadResult.data);
        await refreshProfileSession();
      }
      if (uploadedCount > 0) {
        setSaveSuccess(uploadedCount === 1 ? "Foto agregada correctamente" : `${uploadedCount} fotos agregadas correctamente`);
      }
    } catch (err) {
      // TODO(2026-05-31): Remove temporary upload debug logs after monitoring confirms fix stability.
      console.error("[avatar-upload] caught frontend error", err);
      setSaveError("No se pudo subir una o más imágenes.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleMakeMainPhoto = async (photoUrl) => {
    const currentPhotos = normalizePhotoList(editForm.avatar, editForm.profilePhotos);
    if (!currentPhotos.includes(photoUrl)) return;
    await persistProfilePhotos(currentPhotos, photoUrl, "Foto principal actualizada correctamente");
  };

  const handleDeletePhoto = async (photoUrl) => {
    const currentPhotos = normalizePhotoList(editForm.avatar, editForm.profilePhotos);
    const nextPhotos = currentPhotos.filter((photo) => photo !== photoUrl);
    const nextMain = nextPhotos[0] || "";
    await persistProfilePhotos(nextPhotos, nextMain, "Foto eliminada correctamente");
  };

  const handleAddPhotoFromUrl = async () => {
    const normalizedUrl = normalizeAvatarUrl(photoUrlInput);
    if (!normalizedUrl) {
      setSaveError("Ingresa una URL válida (http o https).");
      return;
    }
    const currentPhotos = normalizePhotoList(editForm.avatar, editForm.profilePhotos);
    if (currentPhotos.length >= MAX_PROFILE_PHOTOS) {
      setSaveError(`Ya alcanzaste el máximo de ${MAX_PROFILE_PHOTOS} fotos.`);
      return;
    }
    const nextPhotos = [...currentPhotos, normalizedUrl];
    const nextMain = currentPhotos[0] || normalizedUrl;
    const saved = await persistProfilePhotos(nextPhotos, nextMain, "Foto agregada correctamente");
    if (saved) setPhotoUrlInput("");
  };

  const displayName = user?.username || user?.name || session?.user?.name || "Usuario";
  const initial = displayName[0].toUpperCase();
  const profilePhotoList = normalizePhotoList(editForm.avatar, editForm.profilePhotos);
  const mainProfilePhoto = profilePhotoList[0] || "";
  const extraProfilePhotos = profilePhotoList.slice(1);
  const userPhotoList = normalizePhotoList(user?.avatar, user?.profilePhotos);
  const userExtraPhotos = userPhotoList.slice(1);
  
  // Check if user should see standard user/creator features (i.e., not an admin)
  const isNotAdmin = user?.role !== "admin";

  const ACTIONS = [
    { href: "/coins",      label: t("profile.buyCoins"), Icon: ShopIcon },
    ...(isApprovedCreator(user) ? [{ href: "/live/start", label: t("profile.startLive"), Icon: BroadcastIcon }] : []),
    { href: "/explore",    label: t("profile.exploreLive"), Icon: ExploreIcon },
    { href: "/chats",      label: t("profile.myChats"), Icon: ChatIcon },
  ];

  return (
    <div className="profile-page">
      {loading && (
        <div className="skeleton-wrap">
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: "50%" }} />
          <div className="skeleton" style={{ width: 160, height: 20 }} />
          <div className="skeleton" style={{ width: 120, height: 16 }} />
        </div>
      )}

      {error && <div className="banner-error">{error}</div>}

      {!loading && user && (
        <>
          {saveSuccess && <div className="banner-success">{saveSuccess}</div>}
          {pwdSuccess && <div className="banner-success">{pwdSuccess}</div>}

          {/* Profile card */}
          <div className="profile-card">
            <div className="profile-card-bg" />
            <div className="profile-card-content">
              <div className="profile-avatar-wrap">
                  {user.avatar ? (
                    <img src={user.avatar} alt={displayName} className="profile-avatar-img" onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <div className="profile-avatar">{initial}</div>
                  )}
                </div>
              <div className="profile-info">
                <h1 className="profile-name">{displayName}</h1>
                {user.username && <p className="profile-handle">@{user.username}</p>}
                <p className="profile-email">{user.email}</p>
                {user.bio && <p className="profile-bio">{user.bio}</p>}
                <div className="profile-badges">
                    <span className={`role-badge${isApprovedCreator(user) ? " creator" : user.role === "admin" ? " admin" : user.creatorStatus === "pending" ? " pending" : ""}`}>
                      {isApprovedCreator(user) ? "Creador" : user.role === "admin" ? "Admin" : user.creatorStatus === "pending" ? "Pendiente de aprobación" : "Usuario"}
                    </span>
                    {user.isVerified && (
                      <span className="role-badge verified" title="Identidad verificada">✓ Verificado</span>
                    )}
                    {user.isVIP && (
                      <span className="role-badge vip" title="Usuario VIP">💎 VIP</span>
                    )}
                  </div>
                  {(() => {
                    const badges = computeStatusBadges(user, { isBoosted });
                    const nudge = getBoostNudge(badges);
                    return (
                      <>
                        {badges.length > 0 && (
                          <StatusBadges badges={badges} style={{ marginTop: "0.45rem", justifyContent: "flex-start" }} />
                        )}
                        {nudge && (
                          <Link href={nudge.href} className="profile-boost-nudge">
                            🚀 {nudge.text}
                          </Link>
                        )}
                      </>
                    );
                  })()}
              </div>
              <div className="profile-actions-top">
                <button className="btn btn-secondary btn-sm" onClick={handleEdit}>
                  <EditIcon /> Editar
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setChangingPwd(true); setSaveSuccess(""); setPwdSuccess(""); setPwdError(""); }}
                >
                  <KeyIcon /> Contraseña
                </button>
              </div>
            </div>
            {userExtraPhotos.length > 0 && (
              <div className="profile-extra-strip">
                {userExtraPhotos.map((photo) => (
                  <img key={photo} src={photo} alt="Foto adicional" className="profile-extra-strip-img" onError={(e) => { e.target.style.display = "none"; }} />
                ))}
              </div>
            )}
          </div>

          {/* Edit form */}
          {editing && (
            <div className="form-card">
              <h2 className="form-card-title">Editar perfil</h2>
              {saveError && <div className="banner-error">{saveError}</div>}
              <form onSubmit={handleSave} className="form-fields">
                <div className="form-group">
                  <label className="form-label">Nombre de usuario</label>
                  <input className="input" type="text" value={editForm.username}
                    onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="tunombredeusuario" maxLength={30} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input className="input" type="text" value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Tu nombre" maxLength={60} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bio</label>
                  <textarea className="input bio-textarea" value={editForm.bio}
                    onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                    placeholder="Cuéntanos algo sobre ti…" maxLength={200} rows={3} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.genderLabel")}</label>
                  <select
                    className="input"
                    value={editForm.gender}
                    onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))}
                  >
                    <option value="">{t("profile.genderNone")}</option>
                    <option value="woman">{t("profile.genderWoman")}</option>
                    <option value="man">{t("profile.genderMan")}</option>
                    <option value="nonbinary">{t("profile.genderNonbinary")}</option>
                    <option value="other">{t("profile.genderOther")}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.interestedInLabel")}</label>
                  <select
                    className="input"
                    value={editForm.interestedIn}
                    onChange={(e) => setEditForm((f) => ({ ...f, interestedIn: e.target.value }))}
                  >
                    <option value="women">{t("profile.interestedInWomen")}</option>
                    <option value="men">{t("profile.interestedInMen")}</option>
                    <option value="both">{t("profile.interestedInBoth")}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.ageRangeLabel")}</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                    <input
                      className="input"
                      type="number"
                      min={18}
                      max={100}
                      value={editForm.discoveryAgeMin}
                      onChange={(e) => setEditForm((f) => ({ ...f, discoveryAgeMin: e.target.value }))}
                      placeholder={t("profile.ageMinPlaceholder")}
                    />
                    <input
                      className="input"
                      type="number"
                      min={18}
                      max={100}
                      value={editForm.discoveryAgeMax}
                      onChange={(e) => setEditForm((f) => ({ ...f, discoveryAgeMax: e.target.value }))}
                      placeholder={t("profile.ageMaxPlaceholder")}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.maxDistanceLabel")}</label>
                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                    {DISTANCE_OPTIONS.map((distance) => (
                      <button
                        key={distance}
                        type="button"
                        className={`btn${isDistanceButtonActive(distance) ? " btn-primary" : " btn-secondary"}`}
                        onClick={() => setEditForm((f) => ({ ...f, discoveryScope: "nearby", discoveryMaxDistanceKm: String(distance) }))}
                      >
                        {distance} km
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`btn${editForm.discoveryScope === "global" ? " btn-primary" : " btn-secondary"}`}
                      onClick={() => setEditForm((f) => ({ ...f, discoveryScope: "global", discoveryMaxDistanceKm: "" }))}
                    >
                      {t("profile.globalDistance")}
                    </button>
                  </div>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={10000}
                    value={editForm.discoveryMaxDistanceKm}
                    onChange={(e) => setEditForm((f) => ({ ...f, discoveryScope: "nearby", discoveryMaxDistanceKm: e.target.value }))}
                    placeholder={t("profile.maxDistancePlaceholder")}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.locationControlsTitle")}</label>
                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                    <button
                      type="button"
                      className={`btn${editForm.discoveryScope === "nearby" ? " btn-primary" : " btn-secondary"}`}
                      onClick={handleUseCurrentLocation}
                    >
                      {t("profile.useCurrentLocation")}
                    </button>
                    <button
                      type="button"
                      className={`btn${editForm.discoveryScope === "country" ? " btn-primary" : " btn-secondary"}`}
                      onClick={() => setEditForm((f) => ({ ...f, discoveryScope: "country" }))}
                    >
                      {t("profile.manualLocation")}
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
                    <input
                      className="input"
                      value={editForm.locationCountry}
                      onChange={(e) => setEditForm((f) => ({ ...f, discoveryScope: "country", locationCountry: e.target.value }))}
                      placeholder={t("profile.countryPlaceholder")}
                    />
                    <input
                      className="input"
                      value={editForm.locationCity}
                      onChange={(e) => setEditForm((f) => ({ ...f, discoveryScope: "country", locationCity: e.target.value }))}
                      placeholder={t("profile.cityPlaceholder")}
                    />
                    <input
                      className="input"
                      value={editForm.locationRegion}
                      onChange={(e) => setEditForm((f) => ({ ...f, discoveryScope: "country", locationRegion: e.target.value }))}
                      placeholder={t("profile.regionPlaceholder")}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.languagesLabel")}</label>
                  <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                    {SUPPORTED_LANGS.map((code) => {
                      const checked = editForm.discoveryLanguages.includes(code);
                      return (
                        <label key={code} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setEditForm((f) => ({
                                ...f,
                                discoveryLanguages: checked
                                  ? f.discoveryLanguages.filter((langCode) => langCode !== code)
                                  : [...f.discoveryLanguages, code],
                              }))
                            }
                          />
                          <span>{t(`lang.${code}`)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.goalsLabel")}</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.45rem 0.7rem" }}>
                    {DISCOVERY_GOAL_OPTIONS.map((option) => {
                      const checked = editForm.discoveryGoals.includes(option);
                      return (
                        <label key={option} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setEditForm((f) => ({
                                ...f,
                                discoveryGoals: checked
                                  ? f.discoveryGoals.filter((goal) => goal !== option)
                                  : [...f.discoveryGoals, option],
                              }))
                            }
                          />
                          <span>{goalLabelByValue[option] || option}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Foto de perfil</label>
                  <div className="profile-photo-manager">
                    <div className="profile-main-photo-card">
                      {mainProfilePhoto ? (
                        <img src={mainProfilePhoto} alt="Foto principal" className="profile-main-photo-image" onError={(e) => { e.target.style.display = "none"; }} />
                      ) : (
                        <div className="profile-main-photo-placeholder">{initial}</div>
                      )}
                      <div className="profile-main-photo-label">Foto principal</div>
                    </div>

                    {extraProfilePhotos.length > 0 && (
                      <div className="profile-photo-grid">
                        {extraProfilePhotos.map((photo) => (
                          <div key={photo} className="profile-photo-thumb">
                            <img src={photo} alt="Foto adicional" className="profile-photo-thumb-img" onError={(e) => { e.target.style.display = "none"; }} />
                            <div className="profile-photo-thumb-actions">
                              <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleMakeMainPhoto(photo)} disabled={avatarUploading}>
                                Hacer principal
                              </button>
                              <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleDeletePhoto(photo)} disabled={avatarUploading}>
                                Eliminar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {mainProfilePhoto && (
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleDeletePhoto(mainProfilePhoto)} disabled={avatarUploading}>
                          Eliminar principal
                        </button>
                      </div>
                    )}

                    <div className="profile-photo-actions">
                      <label className="profile-upload-btn">
                        {avatarUploading ? "Subiendo…" : "📷 Reemplazar principal"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          style={{ display: "none" }}
                          disabled={avatarUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleReplaceMainPhoto(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <label className="profile-upload-btn">
                        {avatarUploading ? "Subiendo…" : "➕ Agregar fotos"}
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          style={{ display: "none" }}
                          disabled={avatarUploading || profilePhotoList.length >= MAX_PROFILE_PHOTOS}
                          onChange={(e) => {
                            handleAddExtraPhotos(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>

                    <div className="profile-photo-url-row">
                      <input
                        className="input"
                        type="url"
                        value={photoUrlInput}
                        onChange={(e) => setPhotoUrlInput(e.target.value)}
                        placeholder="https://ejemplo.com/tu-foto.jpg"
                        disabled={avatarUploading}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={handleAddPhotoFromUrl}
                        disabled={avatarUploading || !photoUrlInput.trim() || profilePhotoList.length >= MAX_PROFILE_PHOTOS}
                      >
                        Agregar URL
                      </button>
                    </div>
                    <span className="profile-photo-hint">1 foto principal + hasta {MAX_EXTRA_PROFILE_PHOTOS} fotos extra. Límite seguro: {AVATAR_UPLOAD_MAX_LABEL} por foto.</span>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Password change form */}
          {changingPwd && (
            <div className="form-card">
              <h2 className="form-card-title">Cambiar contraseña</h2>
              {pwdError && <div className="banner-error">{pwdError}</div>}
              <form onSubmit={handleChangePwd} className="form-fields">
                <div className="form-group">
                  <label className="form-label">Contraseña actual</label>
                  <input className="input" type="password" value={pwdForm.currentPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, currentPassword: e.target.value }))}
                    placeholder="Tu contraseña actual" autoComplete="current-password" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nueva contraseña</label>
                  <input className="input" type="password" value={pwdForm.newPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, newPassword: e.target.value }))}
                    placeholder="Mínimo 6 caracteres" autoComplete="new-password" minLength={6} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmar nueva contraseña</label>
                  <input className="input" type="password" value={pwdForm.confirmPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Repite la nueva contraseña" autoComplete="new-password" />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
                    {pwdSaving ? "Guardando…" : "Cambiar contraseña"}
                  </button>
                  <button type="button" className="btn btn-secondary"
                    onClick={() => { setChangingPwd(false); setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setPwdError(""); }}
                    disabled={pwdSaving}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Language preference */}
          <div className="form-card">
            <h2 className="form-card-title">🌐 {t("profile.languageSection")}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.5, marginBottom: "1rem" }}>
              {t("profile.languageHint")}
            </p>
            {langSuccess && <div className="banner-success" style={{ marginBottom: "0.75rem" }}>{langSuccess}</div>}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {SUPPORTED_LANGS.map((code) => (
                <button
                  key={code}
                  className={`btn${lang === code ? " btn-primary" : " btn-secondary"}`}
                  onClick={() => handleLanguageSave(code)}
                  disabled={langSaving}
                  style={{ minWidth: "7rem" }}
                >
                  {t(`lang.${code}`)}
                </button>
              ))}
            </div>
          </div>

          {(user.interestedIn ||
            user.discoveryPreferences?.ageRange?.min != null ||
            user.discoveryPreferences?.ageRange?.max != null ||
            user.discoveryPreferences?.maxDistanceKm != null ||
            user.discoveryScope ||
            user.discoveryPreferences?.discoveryScope ||
            (user.discoveryPreferences?.languages || []).length > 0 ||
            (user.discoveryPreferences?.goals || []).length > 0) && (
            <div className="form-card">
              <h2 className="form-card-title">🎯 {t("profile.discoverySummaryTitle")}</h2>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {user.interestedIn && (
                  <div>
                    <strong>{t("profile.interestedInLabel")}:</strong>{" "}
                    {user.interestedIn === "women" && t("profile.interestedInWomen")}
                    {user.interestedIn === "men" && t("profile.interestedInMen")}
                    {user.interestedIn === "both" && t("profile.interestedInBoth")}
                  </div>
                )}
                {(user.discoveryPreferences?.ageRange?.min != null || user.discoveryPreferences?.ageRange?.max != null) && (
                  <div>
                    <strong>{t("profile.ageSummaryLabel")}:</strong>{" "}
                    {user.discoveryPreferences?.ageRange?.min ?? "18"} - {user.discoveryPreferences?.ageRange?.max ?? "100"}
                  </div>
                )}
                {user.discoveryPreferences?.maxDistanceKm != null && (
                  <div>
                    <strong>{t("profile.distanceSummaryLabel")}:</strong> {user.discoveryPreferences.maxDistanceKm} km
                  </div>
                )}
                {(user.discoveryScope || user.discoveryPreferences?.discoveryScope) && (
                  <div>
                    <strong>{t("profile.scopeSummaryLabel")}:</strong>{" "}
                    {getScopeLabel(user.discoveryScope || user.discoveryPreferences?.discoveryScope)}
                  </div>
                )}
                {(user.discoveryPreferences?.languages || []).length > 0 && (
                  <div>
                    <strong>{t("profile.languagesSummaryLabel")}:</strong>{" "}
                    {(user.discoveryPreferences.languages || []).map((code) => t(`lang.${code}`)).join(", ")}
                  </div>
                )}
                {(user.discoveryPreferences?.goals || []).length > 0 && (
                  <div>
                    <strong>{t("profile.goalsSummaryLabel")}:</strong>{" "}
                    {(user.discoveryPreferences.goals || [])
                      .map((goal) => goalLabelByValue[goal] || goal)
                      .join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interests & Intent */}
          {isNotAdmin && (user.interests?.length > 0 || user.intent) && (
            <div className="form-card">
              <h2 className="form-card-title">✨ Intereses e intención</h2>
              {user.intent && (
                <div style={{ marginBottom: "0.85rem" }}>
                  <span className="profile-intent-badge">
                    {user.intent === "dating" && "💖 Conocer personas"}
                    {user.intent === "casual" && "😊 Amistades"}
                    {user.intent === "live" && "🎥 Ver directos"}
                    {user.intent === "creator" && "🌟 Creador"}
                    {!["dating","casual","live","creator"].includes(user.intent) && user.intent}
                  </span>
                </div>
              )}
              {user.interests?.length > 0 && (
                <div className="profile-interests-wrap">
                  {user.interests.map((interest) => (
                    <span key={interest} className="profile-interest-chip">{interest}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon-wrap" style={{ color: "var(--accent-orange)" }}>
                <CoinIcon />
              </div>
              <div className="stat-value">{user.coins ?? 0}</div>
              <div className="stat-label">Monedas</div>
            </div>
            {isApprovedCreator(user) && (
              <div className="stat-card">
                <div className="stat-icon-wrap" style={{ color: "#fbbf24" }}>
                  <TrophyIcon />
                </div>
                <div className="stat-value">{user.earningsCoins ?? 0}</div>
                <div className="stat-label">Ganancias</div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-icon-wrap" style={{ color: "var(--accent-cyan)" }}>
                <CalIcon />
              </div>
              <div className="stat-value">
                {new Date(user.createdAt).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}
              </div>
              <div className="stat-label">Miembro desde</div>
            </div>
          </div>

          {/* Boost card */}
          {isNotAdmin && (
            <BoostCard
              isBoosted={isBoosted}
              boostUntil={boostUntil}
              boostPrice={boostPrice}
              coins={user.coins ?? 0}
              loading={boostLoading}
              error={boostError}
              success={boostSuccess}
              onBoost={handleBoost}
            />
          )}

          {/* Become a Creator / Creator status */}
          {user.role === "user" && user.creatorStatus !== "pending" && (
            <div className="creator-cta-card">
              <div className="creator-cta-icon"><StarIcon /></div>
              <div className="creator-cta-body">
                <div className="creator-cta-title">¿Quieres ser Creador?</div>
                <div className="creator-cta-sub">Solicita acceso para transmitir en vivo y ganar monedas con tu comunidad.</div>
              </div>
              {creatorReqError && <div className="banner-error">{creatorReqError}</div>}
              {creatorReqSuccess && <div className="banner-success">{creatorReqSuccess}</div>}
              {!creatorReqSuccess && (
                <button className="btn btn-primary creator-cta-btn" onClick={handleCreatorRequest} disabled={requestingCreator}>
                  {requestingCreator ? "Enviando…" : "Solicitar ser Creador"}
                </button>
              )}
            </div>
          )}

          {user.creatorStatus === "pending" && (
            <div className="creator-pending-card">
              <div className="creator-cta-icon" style={{ color: "#fbbf24" }}>⏳</div>
              <div className="creator-cta-body">
                <div className="creator-cta-title">Solicitud en revisión</div>
                <div className="creator-cta-sub">Tu solicitud para ser creador está siendo revisada por un administrador. Te notificaremos pronto.</div>
              </div>
            </div>
          )}

          {isApprovedCreator(user) && (
            <div className="creator-active-card">
              <div className="creator-cta-icon" style={{ color: "var(--accent)" }}>🎙</div>
              <div className="creator-cta-body">
                <div className="creator-cta-title">Eres Creador</div>
                <div className="creator-cta-sub">Accede a tu estudio, gestiona tus directos y consulta tus ganancias.</div>
              </div>
              <Link href="/creator" className="btn btn-primary creator-cta-btn">Ir al Estudio</Link>
            </div>
          )}

          {/* Referral promo */}
          {isNotAdmin && <ReferralCard />}

          {/* VIP upsell / status card */}
          {isNotAdmin && (
            user.isVIP ? (
              <div className="premium-upsell-card premium-upsell-card-vip">
                <div className="premium-upsell-header">
                  <span className="premium-upsell-gem">💎</span>
                  <div>
                    <h2 className="premium-upsell-title">Eres VIP 💎</h2>
                    <p className="premium-upsell-sub">Disfrutas de badge exclusivo, mensajes destacados y acceso a directos VIP</p>
                  </div>
                </div>
                <div className="premium-upsell-actions">
                  <Link href="/subscription" className="premium-upsell-btn premium-upsell-btn-primary">
                    ⚙️ Gestionar suscripción
                  </Link>
                </div>
              </div>
            ) : (
              <div className="premium-upsell-card">
                <div className="premium-upsell-header">
                  <span className="premium-upsell-gem">💎</span>
                  <div>
                    <h2 className="premium-upsell-title">Hazte VIP y destaca</h2>
                    <p className="premium-upsell-sub">Usuarios VIP ganan más atención · Destaca en el live · Acceso exclusivo</p>
                  </div>
                </div>
                <div className="premium-upsell-actions">
                  <Link href="/subscription" className="premium-upsell-btn premium-upsell-btn-primary">
                    💎 Hazte VIP
                  </Link>
                  <Link href="/coins" className="premium-upsell-btn premium-upsell-btn-ghost">
                    🪙 Comprar monedas
                  </Link>
                </div>
              </div>
            )
          )}

          {/* Quick actions */}
          <div className="actions-card">
            <h2 className="actions-title">Acciones rápidas</h2>
            <div className="actions-list">
              {ACTIONS.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className="action-item">
                  <span className="action-icon"><Icon /></span>
                  <span>{label}</span>
                  <span className="action-arrow"><ArrowRightIcon /></span>
                </Link>
              ))}
              <button className="action-item action-logout" onClick={handleLogout}>
                <span className="action-icon"><LogoutIcon /></span>
                <span>{t("profile.logout")}</span>
                <span className="action-arrow"><ArrowRightIcon /></span>
              </button>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .profile-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 580px;
          width: 100%;
          min-height: calc(100dvh - 140px);
          margin: 0 auto;
        }

        /* Skeleton */
        .skeleton-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 3rem;
          min-height: calc(100dvh - 180px);
          box-sizing: border-box;
          text-align: center;
        }

        /* Banners */
        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          text-align: center;
        }

        .banner-success {
          background: var(--success-bg);
          border: 1px solid rgba(52,211,153,0.35);
          color: var(--success);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        /* Profile card */
        .profile-card {
          position: relative;
          overflow: hidden;
          border-radius: var(--radius);
          border: 1px solid rgba(139,92,246,0.2);
          background: rgba(15,8,32,0.9);
          box-shadow: var(--shadow);
        }

        .profile-card-bg {
          position: absolute;
          top: 0; right: 0;
          width: 260px; height: 160px;
          background: radial-gradient(circle at 100% 0%, rgba(224,64,251,0.12), transparent 70%);
          pointer-events: none;
        }

        .profile-card-content {
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: 1.5rem;
          padding: 2rem;
          flex-wrap: wrap;
        }

        .profile-avatar-wrap { flex-shrink: 0; }

        .profile-avatar-img {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          object-fit: cover;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.25), 0 0 20px rgba(224,64,251,0.25);
        }

        .profile-avatar {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 1.9rem;
          flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.25), 0 0 20px rgba(224,64,251,0.25);
        }

        .profile-info { flex: 1; min-width: 180px; }

        .profile-name {
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text);
        }

        .profile-handle {
          color: var(--text-muted);
          font-size: 0.875rem;
          font-weight: 600;
          margin-top: 0.1rem;
        }

        .profile-email {
          color: var(--text-dim);
          font-size: 0.82rem;
          margin-top: 0.1rem;
        }

        .profile-bio {
          color: var(--text-muted);
          font-size: 0.875rem;
          line-height: 1.55;
          max-width: 340px;
          margin-top: 0.5rem;
        }

        .profile-badges { margin-top: 0.65rem; }

        .role-badge {
          display: inline-block;
          padding: 0.22rem 0.75rem;
          border-radius: var(--radius-pill);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .role-badge.creator {
          background: var(--accent-dim);
          color: var(--accent);
          border-color: rgba(224,64,251,0.3);
        }

        .role-badge.admin {
          background: var(--accent-dim-2);
          color: var(--accent-3);
          border-color: rgba(129,140,248,0.3);
        }

        .profile-boost-nudge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          margin-top: 0.5rem;
          font-size: 0.7rem;
          font-weight: 700;
          color: #fb923c;
          background: rgba(255,100,0,0.1);
          border: 1px solid rgba(255,100,0,0.28);
          border-radius: 999px;
          padding: 0.22rem 0.75rem;
          text-decoration: none;
          transition: all 0.18s;
        }
        .profile-boost-nudge:hover {
          background: rgba(255,100,0,0.18);
          box-shadow: 0 0 12px rgba(255,100,0,0.2);
        }

        .profile-actions-top {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .profile-extra-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          padding: 0 2rem 1.1rem;
        }

        .profile-extra-strip-img {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          object-fit: cover;
          border: 1px solid rgba(255,255,255,0.15);
        }

        /* Form card */
        .form-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.75rem;
        }

        .form-card-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 1.25rem;
          letter-spacing: -0.02em;
        }

        .form-fields { display: flex; flex-direction: column; gap: 1rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.45rem; }

        .form-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .btn-xs {
          padding: 0.4rem 0.68rem;
          font-size: 0.74rem;
          font-weight: 700;
        }

        .profile-photo-manager {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .profile-main-photo-card {
          width: 100%;
          padding: 0.8rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(224,64,251,0.28);
          background: rgba(224,64,251,0.06);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .profile-main-photo-image,
        .profile-main-photo-placeholder {
          width: min(100%, 250px);
          aspect-ratio: 1 / 1;
          border-radius: 14px;
        }

        .profile-main-photo-image {
          object-fit: cover;
          border: 2px solid rgba(224,64,251,0.34);
        }

        .profile-main-photo-placeholder {
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 3rem;
          font-weight: 800;
        }

        .profile-main-photo-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .profile-photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 0.65rem;
        }

        .profile-photo-thumb {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 0.4rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .profile-photo-thumb-img {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 10px;
          object-fit: cover;
        }

        .profile-photo-thumb-actions {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .profile-photo-actions {
          display: flex;
          gap: 0.55rem;
          flex-wrap: wrap;
        }

        .profile-upload-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.5rem 0.95rem;
          border-radius: var(--radius-sm);
          border: 1px dashed rgba(224,64,251,0.4);
          background: rgba(224,64,251,0.06);
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s;
        }

        .profile-upload-btn:hover {
          border-color: rgba(224,64,251,0.7);
          color: var(--text);
          background: rgba(224,64,251,0.1);
        }

        .profile-photo-url-row {
          display: grid;
          gap: 0.55rem;
          grid-template-columns: 1fr auto;
          align-items: center;
        }

        .profile-photo-hint {
          font-size: 0.72rem;
          color: var(--text-dim);
        }

        .bio-textarea { resize: vertical; min-height: 76px; }

        .form-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem; }

        /* Stats */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 1rem;
        }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1.5rem 1rem;
          text-align: center;
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          transition: border-color var(--transition), transform var(--transition-slow);
        }

        .stat-card:hover {
          border-color: rgba(139,92,246,0.3);
          transform: translateY(-2px);
        }

        .stat-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-sm);
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-value { font-size: 1.2rem; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; }

        /* Premium upsell */
        .premium-upsell-card {
          background: linear-gradient(135deg, rgba(251,191,36,0.06) 0%, rgba(224,64,251,0.06) 100%);
          border: 1px solid rgba(251,191,36,0.28);
          border-radius: var(--radius);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .premium-upsell-header {
          display: flex;
          align-items: center;
          gap: 0.9rem;
        }
        .premium-upsell-gem { font-size: 1.8rem; flex-shrink: 0; }
        .premium-upsell-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 0.15rem;
        }
        .premium-upsell-sub {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin: 0;
        }
        .premium-upsell-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .premium-upsell-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          border: 1px solid transparent;
        }
        .premium-upsell-btn-primary {
          background: linear-gradient(135deg, rgba(251,191,36,0.22), rgba(224,64,251,0.14));
          border-color: rgba(251,191,36,0.45);
          color: #fbbf24;
        }
        .premium-upsell-btn-primary:hover {
          background: linear-gradient(135deg, rgba(251,191,36,0.32), rgba(224,64,251,0.22));
          box-shadow: 0 0 14px rgba(251,191,36,0.22);
        }
        .premium-upsell-btn-ghost {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.12);
          color: var(--text-muted);
        }
        .premium-upsell-btn-ghost:hover {
          background: rgba(255,255,255,0.08);
          color: var(--text);
        }

        .premium-upsell-card-vip {
          background: linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(224,64,251,0.08) 100%);
          border-color: rgba(251,191,36,0.5);
        }

        /* Actions */
        .actions-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
        }

        .actions-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 0.75rem;
          letter-spacing: -0.02em;
        }

        .actions-list { display: flex; flex-direction: column; gap: 0.25rem; }

        .action-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 0.875rem;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.875rem;
          font-weight: 600;
          transition: all var(--transition);
          background: none;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
          text-decoration: none;
        }

        .action-icon { display: flex; color: var(--text-dim); }

        .action-arrow {
          margin-left: auto;
          color: var(--text-dim);
          opacity: 0;
          transition: opacity var(--transition), transform var(--transition);
          display: flex;
        }

        .action-item:hover {
          background: rgba(139,92,246,0.08);
          color: var(--text);
        }

        .action-item:hover .action-icon { color: var(--accent-3); }
        .action-item:hover .action-arrow { opacity: 1; transform: translateX(2px); }

        .action-logout { color: var(--error) !important; }
        .action-logout:hover { background: rgba(248,113,113,0.08) !important; }
        .action-logout:hover .action-icon { color: var(--error) !important; }

        /* Creator CTA / Pending / Active */
        .creator-cta-card, .creator-pending-card, .creator-active-card {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1.5rem;
          border-radius: var(--radius);
          border: 1px solid rgba(224,64,251,0.25);
          background: rgba(224,64,251,0.05);
        }

        .creator-pending-card {
          border-color: rgba(251,191,36,0.3);
          background: rgba(251,191,36,0.05);
        }

        .creator-active-card {
          border-color: rgba(224,64,251,0.3);
          background: rgba(224,64,251,0.07);
        }

        .creator-cta-icon {
          font-size: 1.6rem;
          line-height: 1;
          color: var(--accent-2);
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }

        .creator-cta-body { flex: 1; min-width: 180px; }

        .creator-cta-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.01em;
        }

        .creator-cta-sub {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          line-height: 1.5;
        }

        .creator-cta-btn { white-space: nowrap; flex-shrink: 0; }

        .role-badge.pending {
          background: rgba(251,191,36,0.1);
          color: #fbbf24;
          border-color: rgba(251,191,36,0.3);
        }

        .role-badge.verified {
          background: rgba(52,211,153,0.1);
          color: var(--success);
          border-color: rgba(52,211,153,0.3);
          margin-left: 0.35rem;
        }

        .role-badge.vip {
          background: rgba(251,191,36,0.12);
          color: #fbbf24;
          border-color: rgba(251,191,36,0.35);
          margin-left: 0.35rem;
          text-shadow: 0 0 8px rgba(251,191,36,0.4);
        }

        /* Interests & Intent */
        .profile-interests-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }
        .profile-interest-chip {
          font-size: 0.73rem;
          font-weight: 700;
          padding: 0.28rem 0.75rem;
          border-radius: 999px;
          background: rgba(224,64,251,0.09);
          border: 1px solid rgba(224,64,251,0.25);
          color: #e040fb;
          letter-spacing: 0.01em;
          transition: background 0.18s, border-color 0.18s;
        }
        .profile-interest-chip:hover {
          background: rgba(224,64,251,0.18);
          border-color: rgba(224,64,251,0.45);
        }
        .profile-intent-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.76rem;
          font-weight: 800;
          padding: 0.3rem 0.85rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(255,45,120,0.12), rgba(251,191,36,0.1));
          border: 1px solid rgba(255,45,120,0.35);
          color: #fbbf24;
          letter-spacing: 0.02em;
        }

        /* Boost card */
        .boost-profile-card {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          border-radius: var(--radius);
          border: 1px solid rgba(139,92,246,0.3);
          background: linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(224,64,251,0.06) 100%);
          transition: border-color 0.2s;
        }
        .boost-profile-card--active {
          border-color: rgba(139,92,246,0.6);
          background: linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(224,64,251,0.1) 100%);
        }
        .boost-profile-icon {
          font-size: 1.8rem;
          line-height: 1;
          flex-shrink: 0;
        }
        .boost-profile-body {
          flex: 1;
          min-width: 160px;
        }
        .boost-profile-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.01em;
        }
        .boost-profile-sub {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-top: 0.2rem;
          line-height: 1.5;
        }
        .boost-profile-error {
          font-size: 0.78rem;
          color: var(--error);
          margin-top: 0.35rem;
        }
        .boost-profile-success {
          font-size: 0.78rem;
          color: var(--success);
          margin-top: 0.35rem;
        }
        .boost-profile-btn {
          flex-shrink: 0;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 700;
          background: var(--grad-primary);
          color: #fff;
          border: none;
          cursor: pointer;
          transition: opacity 0.18s, transform 0.18s;
          white-space: nowrap;
        }
        .boost-profile-btn:hover:not(:disabled) {
          opacity: 0.88;
          transform: translateY(-1px);
        }
        .boost-profile-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 540px) {
          .profile-page {
            max-width: none;
            width: 100%;
            min-width: 0;
            margin: 0;
            gap: 1rem;
          }

          .profile-card,
          .form-card,
          .stats-grid,
          .premium-upsell-card,
          .actions-card,
          .creator-cta-card,
          .creator-pending-card,
          .creator-active-card,
          .boost-profile-card {
            width: 100%;
            min-width: 0;
          }

          .profile-card-content {
            padding: 1.25rem;
            gap: 1rem;
            flex-direction: column;
          }

          .profile-avatar-wrap {
            align-self: center;
          }

          .profile-info {
            min-width: 0;
            width: 100%;
            text-align: center;
          }

          .profile-bio {
            max-width: none;
          }

          .profile-actions-top {
            width: 100%;
            flex-direction: row;
          }

          .profile-actions-top .btn {
            flex: 1;
          }

          .profile-extra-strip { padding: 0 1.25rem 1rem; }
          .profile-photo-url-row { grid-template-columns: 1fr; }
          .profile-photo-thumb-actions { flex-direction: row; flex-wrap: wrap; }
          .profile-main-photo-image,
          .profile-main-photo-placeholder { width: 100%; }
        }
      `}</style>
    </div>
  );
}
