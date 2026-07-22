"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearToken, getToken, setToken } from "@/lib/token";
import { useLanguage, SUPPORTED_LANGS } from "@/contexts/LanguageContext";
import ReferralCard from "@/components/ReferralCard";
import StatusBadges from "@/components/StatusBadges";
import SimpleProfilePhotoGallery from "@/components/SimpleProfilePhotoGallery";
import socket from "@/lib/socket";
import { computeStatusBadges, getBoostNudge } from "@/lib/statusBadges";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { normalizeUserImages } from "@/lib/imageHelpers";
import { publishProfileUpdated } from "@/lib/profileSync";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_PROFILE_PHOTOS = 6;
const CREATOR_REQUEST_CATEGORIES = [
  { value: "Entretenimiento", labelKey: "profile.creatorCategoryEntertainment" },
  { value: "Música", labelKey: "profile.creatorCategoryMusic" },
  { value: "Lifestyle", labelKey: "profile.creatorCategoryLifestyle" },
  { value: "Fitness", labelKey: "profile.creatorCategoryFitness" },
  { value: "Gaming", labelKey: "profile.creatorCategoryGaming" },
  { value: "Arte", labelKey: "profile.creatorCategoryArt" },
  { value: "Educación", labelKey: "profile.creatorCategoryEducation" },
  { value: "Belleza", labelKey: "profile.creatorCategoryBeauty" },
  { value: "Cocina", labelKey: "profile.creatorCategoryCooking" },
  { value: "Otros", labelKey: "profile.creatorCategoryOther" },
];
const DISCOVERY_GOAL_OPTIONS = ["serious_relationship", "friendship", "dating", "networking"];
const DISTANCE_OPTIONS = [5, 10, 25, 50, 100];
const INTERESTED_IN_LABEL_KEYS = {
  women: "profile.interestedInWomen",
  men: "profile.interestedInMen",
  both: "profile.interestedInBoth",
};
const PROFILE_STATUS_FIELDS = [
  "onboardingComplete",
  "canAppearInFeed",
  "missingFields",
  "imagesCount",
  "hasPrimaryPhoto",
  "hasLocationPoint",
  "hasGender",
  "hasInterestedIn",
  "hasBirthdate",
  "hasIntent",
  "hasInterests",
];

const shouldShowProfileDiagnostics = () => process.env.NODE_ENV !== "production";

const formatProfileStatusValue = (value) => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "[]";
  return String(value);
};

/**
 * Builds the language list required by the creator-request endpoint from the
 * most specific profile source available, falling back to Spanish.
 */
const normalizeCreatorRequestLanguages = (languages) =>
  Array.isArray(languages)
    ? languages.map((lang) => String(lang || "").trim()).filter(Boolean)
    : [];

const getCreatorRequestLanguages = (user = {}) => {
  const applicationLanguages = normalizeCreatorRequestLanguages(user.creatorApplication?.languages);
  if (applicationLanguages.length > 0) return applicationLanguages;

  const discoveryLanguages = normalizeCreatorRequestLanguages(user.discoveryPreferences?.languages);
  if (discoveryLanguages.length > 0) return discoveryLanguages;

  const preferredLanguage = String(user.preferredLanguage || "").slice(0, 2).toLowerCase();
  if (preferredLanguage) return [preferredLanguage];

  if (typeof navigator !== "undefined") {
    const browserLanguage = String(navigator.language || "").slice(0, 2).toLowerCase();
    if (browserLanguage) return [browserLanguage];
  }

  return ["es"];
};

const formatCreatorRequestText = (template, values) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    template
  );

const normalizeImages = (userOrImages = {}) => {
  return normalizeUserImages(userOrImages).map((image) => image.url);
};

const getPrimaryImage = (userOrImages = {}) => normalizeImages(userOrImages)[0] || "";

const normalizePhotoList = (avatarValue, profilePhotosValue, imagesValue, userFields = {}) => {
  return normalizeImages({
    ...userFields,
    images: imagesValue,
    avatar: avatarValue,
    profilePhotos: profilePhotosValue,
  });
};

const toProfileImageObjects = (photos) =>
  photos.slice(0, MAX_PROFILE_PHOTOS).map((url, index) => ({
    url,
    isPrimary: index === 0,
  }));

const normalizeUserPhotoState = (userLike = {}) => {
  const normalizedPhotos = normalizePhotoList(userLike.avatar, userLike.profilePhotos, userLike.images, userLike);
  const normalizedImages = toProfileImageObjects(normalizedPhotos);
  return {
    normalizedPhotos,
    normalizedAvatar: normalizedImages[0]?.url || "",
    normalizedImages,
  };
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

const formatProfilePreferenceItems = (user, { t, getScopeLabel, goalLabelMap }) => {
  if (!user) return [];
  const preferences = user.discoveryPreferences || {};
  const languages = Array.isArray(preferences.languages) ? preferences.languages : [];
  const goals = Array.isArray(preferences.goals) ? preferences.goals : [];
  const items = [];

  if (user.interestedIn) {
    items.push({
      label: t("profile.interestedInLabel"),
      value: INTERESTED_IN_LABEL_KEYS[user.interestedIn] ? t(INTERESTED_IN_LABEL_KEYS[user.interestedIn]) : "—",
    });
  }
  if (preferences.ageRange?.min != null || preferences.ageRange?.max != null) {
    items.push({
      label: t("profile.ageSummaryLabel"),
      value: `${preferences.ageRange?.min ?? "18"} - ${preferences.ageRange?.max ?? "100"}`,
    });
  }
  if (preferences.maxDistanceKm != null) {
    items.push({ label: t("profile.distanceSummaryLabel"), value: `${preferences.maxDistanceKm} km` });
  }
  if (user.discoveryScope || preferences.discoveryScope) {
    items.push({ label: t("profile.scopeSummaryLabel"), value: getScopeLabel(user.discoveryScope || preferences.discoveryScope) });
  }
  if (languages.length > 0) {
    items.push({ label: t("profile.languagesSummaryLabel"), value: languages.map((code) => t(`lang.${code}`)).join(", ") });
  }
  if (goals.length > 0) {
    items.push({ label: t("profile.goalsSummaryLabel"), value: goals.map((goal) => goalLabelMap[goal] || goal).join(", ") });
  }

  return items;
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

function ProfileDiagnosticsCard({ status, error }) {
  return (
    <div className="profile-diagnostics-card">
      <div className="profile-diagnostics-header">
        <strong>Estado del Perfil</strong>
        <span>GET /api/user/me/profile-status</span>
      </div>
      {error && <p className="profile-diagnostics-error">{error}</p>}
      {status ? (
        <dl className="profile-diagnostics-list">
          {PROFILE_STATUS_FIELDS.map((field) => (
            <div key={field} className="profile-diagnostics-row">
              <dt>{field}</dt>
              <dd>{formatProfileStatusValue(status[field])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="profile-diagnostics-muted">Cargando diagnóstico…</p>
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
    images: [],
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
  const [creatorReqForm, setCreatorReqForm] = useState({
    displayName: "",
    category: "",
    country: "",
    bio: "",
  });

  const [isBoosted, setIsBoosted] = useState(false);
  const [boostUntil, setBoostUntil] = useState(null);
  const [boostPrice, setBoostPrice] = useState(100);
  const [boostLoading, setBoostLoading] = useState(false);
  const [boostError, setBoostError] = useState("");
  const [boostSuccess, setBoostSuccess] = useState("");
  const [profileStatus, setProfileStatus] = useState(null);
  const [profileStatusError, setProfileStatusError] = useState("");
  const [showPhotoDebugParam, setShowPhotoDebugParam] = useState(false);
  const [hiddenPrimaryImageUrl, setHiddenPrimaryImageUrl] = useState("");
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

  const refreshProfileSession = useCallback(async (profile = null) => {
    try {
      if (typeof updateSession === "function") {
        await updateSession(
          profile
            ? {
                user: {
                  name: profile.name || profile.username || session?.user?.name || "",
                  image: getPrimaryImage(profile) || session?.user?.image || "",
                },
                onboardingComplete: profile.onboardingComplete === true,
                canAppearInFeed: profile.canAppearInFeed === true,
                profileStatus: profile.profileStatus || null,
              }
            : undefined
        );
      }
      router.refresh();
    } catch (err) {
      console.error("[profile] failed to refresh session:", err);
    }
  }, [router, session?.user?.image, session?.user?.name, updateSession]);

  const updateAndPublishUser = useCallback((updates) => {
    if (!user) return null;
    const nextUser = typeof updates === "function" ? updates(user) : { ...user, ...updates };
    setUser(nextUser);
    publishProfileUpdated(nextUser);
    return nextUser;
  }, [publishProfileUpdated, user]);

  const handlePhotoGalleryUserChange = useCallback((nextUser) => {
    setUser(nextUser);
    publishProfileUpdated(nextUser);
    setEditForm((prev) => (
      prev
        ? {
            ...prev,
            avatar: nextUser.avatar || "",
            profilePhotos: nextUser.profilePhotos || [],
            images: nextUser.images || [],
          }
        : prev
    ));
  }, [publishProfileUpdated]);

  const applyLoadedProfile = useCallback((profile) => {
    const { normalizedPhotos, normalizedAvatar, normalizedImages } = normalizeUserPhotoState(profile);
    const normalizedUser = { ...profile, avatar: normalizedAvatar, profilePhotos: normalizedPhotos, images: normalizedImages };
    const discoveryDefaults = normalizeDiscoveryForm(normalizedUser);
    setUser(normalizedUser);
    setEditForm({
      username: normalizedUser.username || "",
      name: normalizedUser.name || "",
      bio: normalizedUser.bio || "",
      avatar: normalizedUser.avatar || "",
      profilePhotos: normalizedUser.profilePhotos || [],
      images: normalizedImages,
      ...discoveryDefaults,
    });
    setCreatorReqForm({
      displayName: normalizedUser.creatorApplication?.displayName || normalizedUser.username || normalizedUser.name || "",
      category: normalizedUser.creatorApplication?.category || "",
      country: normalizedUser.creatorApplication?.country || normalizedUser.location?.country || normalizedUser.country || "",
      bio: normalizedUser.creatorApplication?.bio || "",
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

      if (shouldShowProfileDiagnostics(d)) {
        setProfileStatusError("");
        setProfileStatus(null);
        try {
          const statusRes = await fetch(`${API_URL}/api/user/me/profile-status`, { headers, cache: "no-store", signal });
          if (!statusRes.ok) throw new Error(`No se pudo cargar diagnóstico (${statusRes.status})`);
          setProfileStatus(await statusRes.json());
        } catch (statusErr) {
          if (!signal?.aborted) {
            console.error("[profile] failed to load profile status:", statusErr);
            setProfileStatusError(statusErr.message || "No se pudo cargar diagnóstico");
          }
        }
      } else {
        setProfileStatus(null);
        setProfileStatusError("");
      }

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
    setShowPhotoDebugParam(new URLSearchParams(window.location.search).get("photoDebug") === "1");
  }, []);

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
        const updatedUser = user ? { ...user, coins: (user.coins ?? 0) - boostPrice, boostUntil: data.boostUntil } : user;
        updateAndPublishUser(updatedUser);
        await refreshProfileSession(updatedUser);
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
    socket.disconnect();
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
      const updatedUser = user ? { ...user, preferredLanguage: newLang } : { preferredLanguage: newLang };
      updateAndPublishUser(updatedUser);
      await refreshProfileSession(updatedUser);
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
    const normalizedPhotos = normalizePhotoList(user.avatar, user.profilePhotos, user.images);
    const normalizedAvatar = normalizedPhotos[0] || "";
    setEditForm({
      username: user.username || "",
      name: user.name || "",
      bio: user.bio || "",
      avatar: normalizedAvatar,
      profilePhotos: normalizedPhotos,
      images: toProfileImageObjects(normalizedPhotos),
      ...normalizeDiscoveryForm(user),
    });
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
          profilePhotos: normalizePhotoList(editForm.avatar, editForm.profilePhotos, editForm.images),
          images: toProfileImageObjects(normalizePhotoList(editForm.avatar, editForm.profilePhotos, editForm.images)),
          ...discoveryPayload,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.message || "Error al guardar los cambios"); return; }
      const { normalizedPhotos, normalizedAvatar, normalizedImages } = normalizeUserPhotoState(data);
      const normalizedUser = { ...data, avatar: normalizedAvatar, profilePhotos: normalizedPhotos, images: normalizedImages };
      setUser(normalizedUser);
      setEditForm({
        username: normalizedUser.username || "",
        name: normalizedUser.name || "",
        bio: normalizedUser.bio || "",
        avatar: normalizedUser.avatar || "",
        profilePhotos: normalizedUser.profilePhotos || [],
        images: normalizedImages,
        ...normalizeDiscoveryForm(normalizedUser),
      });
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

  const handleCreatorRequest = async (event) => {
    event.preventDefault();
    if (requestingCreator) return;

    setCreatorReqError("");
    setCreatorReqSuccess("");

    const displayName = creatorReqForm.displayName.trim();
    const category = creatorReqForm.category.trim();
    const country = creatorReqForm.country.trim();
    const bio = creatorReqForm.bio.trim();
    const fallbackBio = formatCreatorRequestText(t("creatorRequest.fallbackBio"), { category, country });
    const languages = getCreatorRequestLanguages(user);

    if (!displayName) {
      setCreatorReqError(t("creatorRequest.displayNameRequired"));
      return;
    }
    if (!category) {
      setCreatorReqError(t("creatorRequest.categoryRequired"));
      return;
    }
    if (!country) {
      setCreatorReqError(t("creatorRequest.countryRequired"));
      return;
    }

    setRequestingCreator(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/user/me/creator-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName,
          category,
          country,
          bio: bio || fallbackBio,
          languages,
          socialLinks: {},
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) { setCreatorReqError(data.message || t("creatorRequest.submitError")); return; }
      const nextUser = updateAndPublishUser({
        creatorStatus: "pending",
        creatorApplication: {
          ...(user?.creatorApplication || {}),
          displayName,
          category,
          country,
          bio: bio || fallbackBio,
          languages,
          submittedAt: new Date().toISOString(),
        },
      });
      setCreatorReqSuccess(t("creatorRequest.submittedPending"));
      await refreshProfileSession(nextUser);
    } catch { setCreatorReqError(t("creatorRequest.connectionError")); }
    finally { setRequestingCreator(false); }
  };

  const displayName = user?.username || user?.name || session?.user?.name || "Usuario";
  const initial = displayName[0].toUpperCase();
  // Check if user should see standard user/creator features (i.e., not an admin)
  const isNotAdmin = user?.role !== "admin";
  const showProfileDiagnostics = user ? shouldShowProfileDiagnostics(user) : false;
  const showPhotoSrcDebug = showProfileDiagnostics || showPhotoDebugParam;
  const normalizedImages = user ? normalizeUserImages(user) : [];
  const primaryImage = normalizedImages[0] ?? null;
  const primaryImageUrl = primaryImage?.url || "";
  const showPrimaryImage = primaryImageUrl && hiddenPrimaryImageUrl !== primaryImageUrl;
  const secondaryImages = normalizedImages.slice(1, MAX_PROFILE_PHOTOS);
  const updateCreatorReqField = (field, value) => {
    setCreatorReqForm((prev) => ({ ...prev, [field]: value }));
    if (creatorReqError) setCreatorReqError("");
  };
  const intentLabelByValue = {
    dating: t("profile.intentDating"),
    casual: t("profile.intentCasual"),
    live: t("profile.intentLive"),
    creator: t("profile.intentCreator"),
  };
  const intentLabel = user?.intent ? intentLabelByValue[user.intent] || user.intent : "";
  const profileInterests = Array.isArray(user?.interests) ? user.interests.filter(Boolean) : [];
  const preferenceItems = formatProfilePreferenceItems(user, { t, getScopeLabel, goalLabelMap: goalLabelByValue });

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
          {showProfileDiagnostics && <ProfileDiagnosticsCard status={profileStatus} error={profileStatusError} />}

          {/* Profile card */}
          <div className="profile-card">
            <div className="profile-card-bg" />
            <div className="profile-card-sheen" />
            <div className="profile-card-content">
              <div className="profile-premium-topline">
                <span className="profile-eyebrow">{t("profile.profileEyebrow")}</span>
                <span className="profile-photo-state">
                  {primaryImageUrl ? t("profile.primaryPhotoActive") : t("profile.primaryPhotoMissing")}
                </span>
              </div>
              <div className="profile-avatar-wrap">
                {showPrimaryImage ? (
                  <img src={primaryImageUrl} alt={displayName} className="profile-avatar-img" onError={(event) => setHiddenPrimaryImageUrl(event.currentTarget.src || primaryImageUrl)} />
                ) : (
                  <div className="profile-avatar">{initial}</div>
                )}
              </div>
              <div className="profile-info">
                <div className="profile-info-kicker">{t("profile.visualIdentityKicker")}</div>
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
                  {isNotAdmin && (intentLabel || profileInterests.length > 0) && (
                    <div className="profile-hero-personality">
                      {intentLabel && <span className="profile-intent-badge profile-intent-badge--hero">{intentLabel}</span>}
                      {profileInterests.slice(0, 5).map((interest) => (
                        <span key={interest} className="profile-interest-chip profile-interest-chip--hero">{interest}</span>
                      ))}
                    </div>
                  )}
              </div>
              <div className="profile-actions-top">
                <button className="btn btn-primary btn-sm profile-action-button profile-action-button-primary" onClick={handleEdit}>
                  <EditIcon /> <span>{t("profile.editProfileShort")}</span>
                </button>
                <button
                  className="btn btn-secondary btn-sm profile-password-btn profile-action-button"
                  onClick={() => { setChangingPwd(true); setSaveSuccess(""); setPwdSuccess(""); setPwdError(""); }}
                >
                  <KeyIcon /> <span>{t("profile.passwordShort")}</span>
                </button>
              </div>
            </div>
            {secondaryImages.length > 0 && (
              <div className="profile-extra-strip">
                <span className="profile-extra-strip-label">{t("profile.galleryTitle")}</span>
                {secondaryImages.map((photo) => (
                  <img key={photo.url} src={photo.url} alt="Foto adicional" className="profile-extra-strip-img" onError={(e) => { e.target.style.display = "none"; }} />
                ))}
              </div>
            )}
          </div>

          {/* Edit form */}
          {editing && (
            <div className="form-card profile-editor-card">
              <div className="form-card-heading">
                <span className="form-card-kicker">{t("profile.editorKicker")}</span>
                <h2 className="form-card-title">{t("profile.editProfile")}</h2>
                <p className="form-card-subtitle">{t("profile.editorSubtitle")}</p>
              </div>
              {saveError && <div className="banner-error">{saveError}</div>}
              <form onSubmit={handleSave} className="form-fields">
                <div className="form-group profile-photo-form-group">
                  <label className="form-label">{t("profile.profilePhotoLabel")}</label>
                  <SimpleProfilePhotoGallery
                    user={user}
                    initial={initial}
                    t={t}
                    onUserChange={handlePhotoGalleryUserChange}
                    showSrcDebug={showPhotoSrcDebug}
                  />
                </div>
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
                  <div className="profile-inline-grid profile-inline-grid--two">
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
                  <div className="profile-choice-row">
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
                  <div className="profile-choice-row">
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
                  <div className="profile-inline-grid">
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
                  <div className="profile-check-grid profile-check-grid--languages">
                    {SUPPORTED_LANGS.map((code) => {
                      const checked = editForm.discoveryLanguages.includes(code);
                      return (
                        <label key={code} className="profile-check-card">
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
                  <div className="profile-check-grid">
                    {DISCOVERY_GOAL_OPTIONS.map((option) => {
                      const checked = editForm.discoveryGoals.includes(option);
                      return (
                        <label key={option} className="profile-check-card">
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
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? t("profile.saving") : t("profile.saveChanges")}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                    {t("profile.cancelEdit")}
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
          <div className="form-card profile-language-card">
            <div className="form-card-heading">
              <span className="form-card-kicker">{t("profile.preferencesKicker")}</span>
              <h2 className="form-card-title">🌐 {t("profile.languageSection")}</h2>
            </div>
            <p className="profile-section-copy">
              {t("profile.languageHint")}
            </p>
            {langSuccess && <div className="banner-success" style={{ marginBottom: "0.75rem" }}>{langSuccess}</div>}
            <div className="profile-language-actions">
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

          {preferenceItems.length > 0 && (
            <div className="form-card profile-discovery-card">
              <div className="form-card-heading">
                <span className="form-card-kicker">{t("profile.discoveryKicker")}</span>
                <h2 className="form-card-title">🎯 {t("profile.discoverySummaryTitle")}</h2>
              </div>
              <div className="profile-summary-grid">
                {preferenceItems.map((item) => (
                  <div key={item.label} className="profile-summary-row">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interests & Intent */}
          {isNotAdmin && (profileInterests.length > 0 || intentLabel) && (
            <div className="form-card profile-personality-card">
              <div className="form-card-heading">
                <span className="form-card-kicker">{t("profile.socialProfileKicker")}</span>
                <h2 className="form-card-title">✨ {t("profile.interestsIntentTitle")}</h2>
              </div>
              {intentLabel && (
                <div className="profile-intent-row">
                  <span className="profile-intent-badge">{intentLabel}</span>
                </div>
              )}
              {profileInterests.length > 0 && (
                <div className="profile-interests-wrap">
                  {profileInterests.map((interest) => (
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
                <div className="creator-cta-title">{t("profile.creatorCtaTitle")}</div>
                <div className="creator-cta-sub">{t("profile.creatorCtaSub")}</div>
              </div>
              {user.creatorStatus === "rejected" && (
                <div className="creator-request-status creator-request-status-rejected">
                  {t("profile.creatorRejectedStatus")}
                </div>
              )}
              <form className="creator-request-form" onSubmit={handleCreatorRequest}>
                <div className="form-group">
                  <label className="form-label" htmlFor="creator-display-name">{t("profile.creatorDisplayNameLabel")} <span className="req">*</span></label>
                  <input
                    id="creator-display-name"
                    className="input"
                    type="text"
                    value={creatorReqForm.displayName}
                    onChange={(e) => updateCreatorReqField("displayName", e.target.value)}
                    placeholder={t("profile.creatorDisplayNamePlaceholder")}
                    maxLength={60}
                    disabled={requestingCreator}
                  />
                </div>
                <div className="profile-inline-grid creator-request-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="creator-category">{t("profile.creatorCategoryLabel")} <span className="req">*</span></label>
                    <select
                      id="creator-category"
                      className="input"
                      value={creatorReqForm.category}
                      onChange={(e) => updateCreatorReqField("category", e.target.value)}
                      disabled={requestingCreator}
                    >
                      <option value="">{t("profile.creatorCategoryPlaceholder")}</option>
                      {CREATOR_REQUEST_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>{t(category.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="creator-country">{t("profile.creatorCountryLabel")} <span className="req">*</span></label>
                    <input
                      id="creator-country"
                      className="input"
                      type="text"
                      value={creatorReqForm.country}
                      onChange={(e) => updateCreatorReqField("country", e.target.value)}
                      placeholder={t("profile.creatorCountryPlaceholder")}
                      maxLength={80}
                      disabled={requestingCreator}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="creator-bio">{t("profile.creatorBioLabel")} <span className="req">({t("creatorRequest.optional")})</span></label>
                  <textarea
                    id="creator-bio"
                    className="input bio-textarea"
                    value={creatorReqForm.bio}
                    onChange={(e) => updateCreatorReqField("bio", e.target.value)}
                    placeholder={t("profile.creatorBioPlaceholder")}
                    maxLength={240}
                    disabled={requestingCreator}
                  />
                </div>
                {creatorReqError && <div className="banner-error">{creatorReqError}</div>}
                {creatorReqSuccess && <div className="banner-success">{creatorReqSuccess}</div>}
                <button className="btn btn-primary creator-cta-btn" type="submit" disabled={requestingCreator}>
                  {requestingCreator ? t("creatorRequest.submitting") : t("profile.creatorBtn")}
                </button>
              </form>
            </div>
          )}

          {user.creatorStatus === "pending" && (
            <div className="creator-pending-card">
              <div className="creator-cta-icon" style={{ color: "#fbbf24" }}>⏳</div>
              <div className="creator-cta-body">
                <div className="creator-cta-title">{t("profile.creatorPendingTitle")}</div>
                <div className="creator-cta-sub">{creatorReqSuccess || t("creatorRequest.pendingReviewNotice")}</div>
              </div>
            </div>
          )}

          {isApprovedCreator(user) && (
            <div className="creator-active-card">
              <div className="creator-cta-icon" style={{ color: "var(--accent)" }}>🎙</div>
              <div className="creator-cta-body">
                <div className="creator-cta-title">{t("profile.creatorApprovedTitle")}</div>
                <div className="creator-cta-sub">{t("profile.creatorApprovedSub")}</div>
              </div>
              <Link href="/creator" className="btn btn-primary creator-cta-btn">{t("profile.creatorCenterLink")}</Link>
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
          gap: 1.15rem;
          max-width: 640px;
          width: 100%;
          min-height: calc(100dvh - 140px);
          margin: 0 auto;
          padding-bottom: 1rem;
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
          background: linear-gradient(135deg, rgba(248,113,113,0.14), rgba(15,8,32,0.76));
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          text-align: center;
          box-shadow: var(--shadow-sm);
          backdrop-filter: blur(14px);
        }

        .banner-success {
          background: linear-gradient(135deg, rgba(52,211,153,0.14), rgba(15,8,32,0.76));
          border: 1px solid rgba(52,211,153,0.35);
          color: var(--success);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          box-shadow: var(--shadow-sm);
          backdrop-filter: blur(14px);
        }

        .profile-diagnostics-card {
          border: 1px solid rgba(251,191,36,0.45);
          border-radius: var(--radius-sm);
          background: rgba(251,191,36,0.08);
          color: var(--text);
          padding: 1rem;
          text-align: left;
        }

        .profile-diagnostics-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .profile-diagnostics-header span,
        .profile-diagnostics-muted {
          color: var(--text-muted);
          font-size: 0.82rem;
        }

        .profile-diagnostics-error {
          color: var(--error);
          font-size: 0.875rem;
          margin: 0 0 0.75rem;
        }

        .profile-diagnostics-list {
          display: grid;
          gap: 0.4rem;
          margin: 0;
        }

        .profile-diagnostics-row {
          display: grid;
          grid-template-columns: minmax(150px, 1fr) 2fr;
          gap: 0.75rem;
          font-size: 0.875rem;
        }

        .profile-diagnostics-row dt {
          color: var(--text-muted);
        }

        .profile-diagnostics-row dd {
          margin: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          overflow-wrap: anywhere;
        }

        /* Profile card */
        .profile-card {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.1), transparent 28%),
            radial-gradient(circle at 18% 0%, rgba(224,64,251,0.3), transparent 35%),
            radial-gradient(circle at 100% 18%, rgba(34,211,238,0.18), transparent 38%),
            rgba(15,8,32,0.82);
          box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.1);
          backdrop-filter: blur(18px);
        }

        .profile-card-sheen {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.08) 24%, transparent 42%),
            radial-gradient(circle at 50% -20%, rgba(255,79,163,0.18), transparent 46%);
          opacity: 0.78;
          pointer-events: none;
        }

        .profile-card::before {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 27px;
          border: 1px solid rgba(236,124,255,0.12);
          pointer-events: none;
        }

        .profile-card-bg {
          position: absolute;
          inset: auto -58px -76px auto;
          width: 220px;
          height: 220px;
          border-radius: 999px;
          background:
            radial-gradient(circle at 50% 50%, rgba(224,64,251,0.28), transparent 62%),
            radial-gradient(circle at 35% 20%, rgba(34,211,238,0.2), transparent 52%);
          filter: blur(2px);
          pointer-events: none;
        }

        .profile-card-content {
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: 1.25rem;
          padding: 1.6rem;
          flex-wrap: wrap;
        }

        .profile-premium-topline {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .profile-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: rgba(255,255,255,0.76);
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .profile-photo-state {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.28rem 0.7rem;
          border-radius: 999px;
          border: 1px solid rgba(34,211,238,0.24);
          background: rgba(34,211,238,0.08);
          color: rgba(194,245,255,0.88);
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .profile-eyebrow::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--grad-primary);
          box-shadow: var(--glow-pink);
        }

        .profile-avatar-wrap {
          flex-shrink: 0;
          position: relative;
          padding: 0.35rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(224,64,251,0.8), rgba(34,211,238,0.72));
          box-shadow: var(--glow-pink), 0 18px 40px rgba(0,0,0,0.36);
        }

        .profile-avatar-wrap::after {
          content: "";
          position: absolute;
          inset: -7px;
          border-radius: 999px;
          border: 1px solid rgba(255,79,163,0.35);
          box-shadow: 0 0 32px rgba(224,64,251,0.24);
          pointer-events: none;
        }

        .profile-avatar-img {
          width: 104px;
          height: 104px;
          border-radius: 50%;
          object-fit: cover;
          display: block;
          border: 3px solid rgba(15,8,32,0.88);
        }

        .profile-avatar {
          width: 104px;
          height: 104px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 2.25rem;
          flex-shrink: 0;
          border: 3px solid rgba(15,8,32,0.88);
        }

        .profile-info {
          flex: 1;
          min-width: 180px;
          padding-top: 0.15rem;
        }

        .profile-info-kicker {
          color: #f0abfc;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          margin-bottom: 0.2rem;
          text-transform: uppercase;
        }

        .profile-name {
          font-size: clamp(1.7rem, 5vw, 2.2rem);
          font-weight: 900;
          letter-spacing: -0.05em;
          color: var(--text);
          margin: 0;
          text-wrap: balance;
        }

        .profile-handle {
          display: inline-flex;
          width: fit-content;
          color: rgba(255,255,255,0.74);
          font-size: 0.9rem;
          font-weight: 800;
          margin: 0.25rem 0 0;
          padding: 0.22rem 0.68rem;
          border-radius: 999px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .profile-email {
          color: var(--text-dim);
          font-size: 0.82rem;
          margin: 0.45rem 0 0;
          overflow-wrap: anywhere;
        }

        .profile-bio {
          color: rgba(255,255,255,0.82);
          font-size: 0.94rem;
          line-height: 1.6;
          max-width: 390px;
          margin: 0.75rem 0 0;
        }

        .profile-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-top: 0.8rem;
        }

        .profile-hero-personality {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 0.75rem;
          max-width: 430px;
        }

        .role-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.3rem 0.78rem;
          border-radius: var(--radius-pill);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .role-badge.creator {
          background: linear-gradient(135deg, rgba(224,64,251,0.2), rgba(34,211,238,0.1));
          color: var(--accent);
          border-color: rgba(224,64,251,0.48);
          box-shadow: 0 0 18px rgba(224,64,251,0.14);
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
          margin-left: auto;
          align-self: center;
        }

        .profile-actions-top .btn {
          border-radius: 999px;
          min-height: 38px;
          box-shadow: var(--shadow-sm);
          justify-content: center;
          padding-inline: 1rem;
        }

        .profile-action-button {
          border: 1px solid rgba(255,255,255,0.16);
          backdrop-filter: blur(14px);
        }

        .profile-action-button-primary {
          background: linear-gradient(135deg, rgba(255,45,120,0.95), rgba(224,64,251,0.88), rgba(139,92,246,0.88));
          box-shadow: var(--glow-pink), 0 12px 26px rgba(0,0,0,0.24);
        }

        .profile-password-btn {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.16);
        }

        .profile-extra-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
          padding: 0 1.6rem 1.25rem;
        }

        .profile-extra-strip-label {
          color: var(--text-muted);
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          padding-right: 0.2rem;
          text-transform: uppercase;
        }

        .profile-extra-strip-img {
          width: 48px;
          height: 48px;
          border-radius: 15px;
          object-fit: cover;
          border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 8px 18px rgba(0,0,0,0.22);
        }

        /* Form card */
        .form-card {
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(145deg, rgba(255,255,255,0.07), transparent 28%),
            rgba(15,8,32,0.76);
          border: 1px solid rgba(236,124,255,0.26);
          border-radius: 24px;
          padding: 1.4rem;
          box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.08);
          backdrop-filter: blur(16px);
        }

        .form-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 0% 0%, rgba(224,64,251,0.12), transparent 32%),
            radial-gradient(circle at 100% 10%, rgba(34,211,238,0.08), transparent 34%);
          pointer-events: none;
        }

        .form-card-title {
          position: relative;
          font-size: 1.08rem;
          font-weight: 900;
          color: var(--text);
          margin: 0 0 1.25rem;
          letter-spacing: -0.035em;
        }

        .form-card-heading {
          position: relative;
          margin-bottom: 1.15rem;
        }

        .form-card-heading .form-card-title {
          margin-bottom: 0.25rem;
        }

        .form-card-kicker {
          display: inline-flex;
          width: fit-content;
          margin-bottom: 0.45rem;
          padding: 0.25rem 0.7rem;
          border-radius: 999px;
          background: rgba(224,64,251,0.12);
          border: 1px solid rgba(224,64,251,0.28);
          color: #f0abfc;
          font-size: 0.66rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .form-card-subtitle {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.84rem;
          line-height: 1.5;
        }

        .form-fields {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0.78rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.78rem;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          background: rgba(255,255,255,0.035);
        }

        .profile-editor-card,
        .profile-language-card,
        .profile-discovery-card {
          border-color: rgba(255,79,163,0.28);
        }

        .profile-photo-form-group {
          padding: 0;
          border: none;
          background: transparent;
          gap: 0.75rem;
        }

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

        .bio-textarea { resize: vertical; min-height: 76px; }

        .form-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-top: 0.25rem;
          padding-top: 0.25rem;
        }

        .form-actions .btn {
          flex: 1 1 150px;
          border-radius: 999px;
          min-height: 44px;
        }

        .profile-inline-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.6rem;
        }

        .profile-inline-grid--two {
          grid-template-columns: 1fr 1fr;
        }

        .profile-choice-row,
        .profile-language-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 0.6rem;
        }

        .profile-choice-row .btn,
        .profile-language-actions .btn {
          border-radius: 999px;
          padding-inline: 1rem;
          min-height: 42px;
        }

        .profile-check-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 0.55rem;
        }

        .profile-check-grid--languages {
          grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
        }

        .profile-check-card {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          min-height: 40px;
          padding: 0.55rem 0.7rem;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
          font-size: 0.84rem;
          font-weight: 700;
        }

        .profile-check-card input {
          accent-color: var(--accent);
        }

        .profile-section-copy {
          color: var(--text-muted);
          font-size: 0.875rem;
          line-height: 1.55;
          margin: -0.45rem 0 1rem;
        }

        .profile-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(var(--profile-compact-grid-min), 1fr));
          gap: 0.65rem;
        }

        .profile-summary-row {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.75rem;
          min-height: 86px;
          padding: 0.9rem 1rem;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.07), transparent 46%),
            rgba(255,255,255,0.04);
          color: var(--text-muted);
          line-height: 1.45;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        }

        .profile-summary-row strong {
          color: #f0abfc;
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .profile-summary-row span {
          color: rgba(255,255,255,0.78);
          font-size: 0.92rem;
          font-weight: 800;
          text-align: left;
        }

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
          background:
            linear-gradient(145deg, rgba(255,255,255,0.06), transparent 36%),
            rgba(15,8,32,0.72);
          border: 1px solid rgba(236,124,255,0.22);
          border-radius: 22px;
          box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.07);
          backdrop-filter: blur(14px);
          transition: border-color var(--transition), transform var(--transition-slow);
        }

        .stat-card:hover {
          border-color: rgba(139,92,246,0.3);
          transform: translateY(-2px);
        }

        .stat-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 16px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
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
          background:
            linear-gradient(145deg, rgba(255,255,255,0.06), transparent 34%),
            rgba(15,8,32,0.76);
          border: 1px solid rgba(236,124,255,0.24);
          border-radius: 24px;
          padding: 1.5rem;
          box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.07);
          backdrop-filter: blur(16px);
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
          border-radius: 24px;
          border: 1px solid rgba(224,64,251,0.25);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.06), transparent 38%),
            rgba(224,64,251,0.05);
          box-shadow: var(--shadow-sm);
          backdrop-filter: blur(14px);
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

        .creator-request-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }

        .creator-request-grid {
          width: 100%;
        }

        .creator-request-form .banner-error,
        .creator-request-form .banner-success {
          margin: 0;
        }

        .creator-request-status {
          width: 100%;
          padding: 0.78rem;
          border-radius: 16px;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .creator-request-status-rejected {
          color: #fecaca;
          border: 1px solid rgba(248,113,113,0.32);
          background: rgba(248,113,113,0.08);
        }

        .req {
          color: var(--accent-2);
          text-transform: none;
          letter-spacing: normal;
        }

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
        .creator-request-form .creator-cta-btn { align-self: flex-start; }

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
        .profile-personality-card {
          border-color: rgba(34,211,238,0.22);
        }

        .profile-intent-row {
          margin-bottom: 0.85rem;
        }

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
        .profile-interest-chip--hero {
          background: rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.86);
          border-color: rgba(255,255,255,0.14);
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

        .profile-intent-badge--hero {
          background: linear-gradient(135deg, rgba(251,191,36,0.16), rgba(255,45,120,0.13));
          box-shadow: 0 0 16px rgba(251,191,36,0.12);
        }

        /* Boost card */
        .boost-profile-card {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          border-radius: 24px;
          border: 1px solid rgba(139,92,246,0.3);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.06), transparent 38%),
            linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(224,64,251,0.07) 100%);
          box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.07);
          backdrop-filter: blur(14px);
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

          .profile-handle {
            margin-left: auto;
            margin-right: auto;
          }

          .profile-badges {
            justify-content: center;
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
          .form-card { padding: 1.05rem; border-radius: 22px; }
          .form-group { padding: 0.72rem; }
          .profile-inline-grid,
          .profile-inline-grid--two {
            grid-template-columns: 1fr;
          }
          .profile-check-grid,
          .profile-check-grid--languages {
            grid-template-columns: 1fr;
          }
          .profile-language-actions .btn,
          .profile-choice-row .btn {
            flex: 1 1 auto;
          }
          .creator-request-form .creator-cta-btn {
            width: 100%;
            white-space: normal;
          }
          .profile-summary-grid {
            grid-template-columns: 1fr;
          }
          .profile-summary-row {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.25rem;
          }
          .profile-photo-thumb-actions { flex-direction: row; flex-wrap: wrap; }
          .profile-main-photo-image,
          .profile-main-photo-placeholder { width: 100%; }
        }
      `}</style>
    </div>
  );
}
