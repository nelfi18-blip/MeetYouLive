"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearAllAuth, clearToken, getToken, setToken } from "@/lib/token";
import { useLanguage, SUPPORTED_LANGS } from "@/contexts/LanguageContext";
import ReferralCard from "@/components/ReferralCard";
import StatusBadges from "@/components/StatusBadges";
import SimpleProfilePhotoGallery from "@/components/SimpleProfilePhotoGallery";
import socket from "@/lib/socket";
import { computeStatusBadges, getBoostNudge } from "@/lib/statusBadges";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { getDisplayName, normalizeUserImages } from "@/lib/imageHelpers";
import { publishProfileUpdated } from "@/lib/profileSync";
import { detectCountryNonGPS } from "@/lib/countryDetection";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_PROFILE_PHOTOS = 6;
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

const PROFILE_COMPLETENESS_FIELDS = ["avatar", "bio", "gender", "interestedIn", "birthdate", "interests"];

const computeProfileCompleteness = (user = {}) => {
  const checks = {
    avatar: Boolean(getPrimaryImage(user)),
    bio: Boolean(user.bio && user.bio.trim()),
    gender: Boolean(user.gender),
    interestedIn: Boolean(user.interestedIn),
    birthdate: Boolean(user.birthdate),
    interests: Array.isArray(user.interests) && user.interests.length > 0,
  };
  const completed = PROFILE_COMPLETENESS_FIELDS.filter((field) => checks[field]).length;
  return { completed, total: PROFILE_COMPLETENESS_FIELDS.length };
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
function BroadcastIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49"/></svg>; }
function ExploreIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ChatIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>; }
function SettingsIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>; }
function PrivacyIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function HelpIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function ChevronIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>; }
function PinIcon()     { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function GiftStatIcon(){ return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7Z"/><path d="M12 7h4.5a2.5 2.5 0 100-5C13 2 12 7 12 7Z"/></svg>; }

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
  const { t } = useLanguage();
  const countdown = useBoostCountdown(isBoosted ? boostUntil : null);
  const canAfford = coins >= boostPrice;
  return (
    <div className={`boost-profile-card${isBoosted ? " boost-profile-card--active" : ""}`}>
      <div className="boost-profile-icon">🚀</div>
      <div className="boost-profile-body">
        <div className="boost-profile-title">
          {isBoosted ? t("profile.boostActiveTitle") : t("profile.boostInactiveTitle")}
        </div>
        <div className="boost-profile-sub">
          {isBoosted && countdown
            ? t("profile.boostActiveDescription").replace("{countdown}", countdown)
            : t("profile.boostInactiveDescription").replace("{price}", String(boostPrice))}
        </div>
        {error && <div className="boost-profile-error">{error}</div>}
        {success && <div className="boost-profile-success">{success}</div>}
      </div>
      {!isBoosted && (
        <button
          className="boost-profile-btn"
          onClick={onBoost}
          disabled={loading || !canAfford}
          title={!canAfford ? t("profile.boostNeedCoinsTitle").replace("{price}", String(boostPrice)) : t("profile.boostActivateTitle")}
        >
          {loading ? t("profile.boostActivating") : !canAfford ? t("profile.boostNoCoins") : t("profile.boostButton").replace("{price}", String(boostPrice))}
        </button>
      )}
    </div>
  );
}

function ProfileDiagnosticsCard({ status, error }) {
  const { t } = useLanguage();
  return (
    <div className="profile-diagnostics-card">
      <div className="profile-diagnostics-header">
        <strong>{t("profile.profileStatusTitle")}</strong>
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
        <p className="profile-diagnostics-muted">{t("profile.loadingDiagnostics")}</p>
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
  const [detectingCountry, setDetectingCountry] = useState(false);

  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  const [langSaving, setLangSaving] = useState(false);
  const [langSuccess, setLangSuccess] = useState("");

  const [giftStats, setGiftStats] = useState(null);
  const [showLangPanel, setShowLangPanel] = useState(false);
  const [showDiscoveryPanel, setShowDiscoveryPanel] = useState(false);
  const [showInterestsPanel, setShowInterestsPanel] = useState(false);

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
                  name: getDisplayName(profile) || session?.user?.name || "",
                  image: getPrimaryImage(profile) || session?.user?.image || "",
                },
                backendUser: profile,
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
  }, [router, session, updateSession]);

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
  }, [session, status]);

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
      if (!profileRes.ok) throw new Error(t("profile.loadError"));

      const d = await profileRes.json();
      applyLoadedProfile(d);

      if (shouldShowProfileDiagnostics(d)) {
        setProfileStatusError("");
        setProfileStatus(null);
        try {
          const statusRes = await fetch(`${API_URL}/api/user/me/profile-status`, { headers, cache: "no-store", signal });
          if (!statusRes.ok) throw new Error(t("profile.profileStatusLoadErrorWithCode").replace("{status}", String(statusRes.status)));
          setProfileStatus(await statusRes.json());
        } catch (statusErr) {
          if (!signal?.aborted) {
            console.error("[profile] failed to load profile status:", statusErr);
            setProfileStatusError(statusErr.message || t("profile.profileStatusLoadError"));
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
      setError(t("profile.loadError"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [applyLoadedProfile, resolveToken, router, status, t]);

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

  // Reuses the existing /api/gifts/profile-stats endpoint (already powering the
  // public creator profile's ProfileGiftStats widget) so the compact "Estadísticas"
  // section only ever shows real received-gifts data — no new API, no invented numbers.
  useEffect(() => {
    const userId = user?._id || user?.id;
    if (!userId) return;
    const controller = new AbortController();
    fetch(`${API_URL}/api/gifts/profile-stats/${userId}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setGiftStats(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [user?._id, user?.id]);

  // Auto-preselects the discovery country using the same non-GPS detection
  // already approved for creator-request (IP country_code, then device
  // locale) — never navigator.geolocation. Only runs once the saved profile
  // has loaded and applies solely when the user has no saved/selected
  // discovery country; it never overwrites an existing value or a manual
  // selection.
  useEffect(() => {
    if (loading) return;
    if (editForm.locationCountry) return;

    let cancelled = false;
    setDetectingCountry(true);

    detectCountryNonGPS()
      .then((detected) => {
        if (cancelled || !detected) return;
        setEditForm((f) => (f.locationCountry ? f : { ...f, locationCountry: detected }));
      })
      .finally(() => {
        if (!cancelled) setDetectingCountry(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, editForm.locationCountry]);

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
        setBoostSuccess(t("profile.boostActivatedSuccess"));
        setTimeout(() => setBoostSuccess(""), 4000);
      } else {
        setBoostError(data.message || t("profile.boostActivateError"));
      }
    } catch {
      setBoostError(t("profile.networkRetryError"));
    } finally {
      setBoostLoading(false);
    }
  };

  const handleLogout = async () => {
    socket.disconnect();
    clearAllAuth({ switching: false });
    await signOut({ redirect: false });
    router.replace("/login");
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
      setSaveError(t("profile.photoUrlProtocolError"));
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
      if (!res.ok) { setSaveError(data.message || t("profile.saveChangesError")); return; }
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
    } catch { setSaveError(t("profile.connectionError")); }
    finally { setSaving(false); }
  };

  const handleChangePwd = async (e) => {
    e.preventDefault();
    setPwdError(""); setPwdSuccess("");
    if (pwdForm.newPassword !== pwdForm.confirmPassword) { setPwdError(t("profile.newPasswordsMismatch")); return; }
    if (pwdForm.newPassword.length < 6) { setPwdError(t("profile.newPasswordMinError")); return; }
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
      if (!res.ok) { setPwdError(data.message || t("profile.passwordChangeError")); return; }
      setPwdSuccess(data.message || t("profile.passwordUpdatedSuccess"));
      setChangingPwd(false);
      setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch { setPwdError(t("profile.connectionError")); }
    finally { setPwdSaving(false); }
  };

  const displayName = user ? getDisplayName(user) : session?.user?.name || t("profile.roleUser");
  const initial = displayName[0].toUpperCase();
  // Check if user should see standard user/creator features (i.e., not an admin)
  const isNotAdmin = user?.role !== "admin";
  const showProfileDiagnostics = user ? shouldShowProfileDiagnostics(user) : false;
  const showPhotoSrcDebug = showProfileDiagnostics || showPhotoDebugParam;
  const normalizedImages = user ? normalizeUserImages(user) : [];
  const primaryImage = normalizedImages[0] ?? null;
  const primaryImageUrl = primaryImage?.url || "";
  const showPrimaryImage = primaryImageUrl && hiddenPrimaryImageUrl !== primaryImageUrl;
  const intentLabelByValue = {
    dating: t("profile.intentDating"),
    casual: t("profile.intentCasual"),
    live: t("profile.intentLive"),
    creator: t("profile.intentCreator"),
  };
  const intentLabel = user?.intent ? intentLabelByValue[user.intent] || user.intent : "";
  const profileInterests = Array.isArray(user?.interests) ? user.interests.filter(Boolean) : [];
  const preferenceItems = formatProfilePreferenceItems(user, { t, getScopeLabel, goalLabelMap: goalLabelByValue });
  const { locationCity: heroLocationCity } = user ? normalizeDiscoveryForm(user) : { locationCity: "" };
  const { completed: completenessCompleted, total: completenessTotal } = user
    ? computeProfileCompleteness(user)
    : { completed: 0, total: PROFILE_COMPLETENESS_FIELDS.length };
  const discoverySummaryText = preferenceItems.map((item) => item.value).slice(0, 2).join(" · ");
  const interestsSummaryText = profileInterests.slice(0, 3).join(", ");
  const interestsOverflowCount = Math.max(0, profileInterests.length - 3);
  const hasGiftStats = Boolean(giftStats && (giftStats.totalReceivedGifts > 0 || giftStats.totalReceivedCoins > 0));
  const hasCreatorEarnings = isApprovedCreator(user) && (user?.earningsCoins ?? 0) > 0;
  const showStatsSection = hasGiftStats || hasCreatorEarnings;

  const ACTIONS = [
    ...(isApprovedCreator(user) ? [{ href: "/live/start", label: t("profile.startLive"), Icon: BroadcastIcon }] : []),
    { href: "/explore",     label: t("profile.exploreLive"), Icon: ExploreIcon },
    { href: "/chats",       label: t("profile.myChats"), Icon: ChatIcon },
    { href: "/coins",       label: t("profile.coinsAction"), Icon: CoinIcon },
    { href: "/settings",    label: t("profile.settings"), Icon: SettingsIcon },
    { href: "/privacy",     label: t("profile.privacyAction"), Icon: PrivacyIcon },
    { href: "/help-center", label: t("profile.helpAction"), Icon: HelpIcon },
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

          {/* Profile Hero — photo-forward identity block: the photograph is the primary
              visual element, with identity overlaid/anchored on it instead of a centered
              avatar-first stack. */}
          <div className="profile-hero">
            <div className="profile-hero-media">
              {showPrimaryImage ? (
                <img
                  src={primaryImageUrl}
                  alt={displayName}
                  className="profile-hero-photo"
                  onError={(event) => setHiddenPrimaryImageUrl(event.currentTarget.src || primaryImageUrl)}
                />
              ) : (
                <div className="profile-hero-photo profile-hero-photo-placeholder" aria-hidden="true">{initial}</div>
              )}
              <span className="profile-photo-state profile-hero-state-chip">
                {primaryImageUrl ? t("profile.primaryPhotoActive") : t("profile.primaryPhotoMissing")}
              </span>
            </div>

            <div className="profile-card profile-hero-card">
              <div className="profile-card-bg" />
              <div className="profile-card-sheen" />
              <div className="profile-hero-id-row">
                <div className="profile-hero-avatar-wrap">
                  {showPrimaryImage ? (
                    <img src={primaryImageUrl} alt={displayName} className="profile-hero-avatar-img" />
                  ) : (
                    <div className="profile-avatar profile-hero-avatar-fallback">{initial}</div>
                  )}
                </div>
                <div className="profile-hero-id-text">
                  <div className="profile-hero-name-line">
                    <h1 className="profile-name profile-hero-name">{displayName}</h1>
                    {user.isVerified && (
                      <span className="profile-hero-verified-check" title={t("profile.verifiedIdentityTitle")}>✓</span>
                    )}
                  </div>
                  {user.username && <p className="profile-handle">@{user.username}</p>}
                  {heroLocationCity && (
                    <p className="profile-hero-location"><PinIcon /> {heroLocationCity}</p>
                  )}
                </div>
                <div className="profile-hero-id-actions">
                  <button className="btn btn-primary btn-sm profile-action-button profile-action-button-primary" onClick={handleEdit}>
                    <EditIcon /> <span>{t("profile.editProfileShort")}</span>
                  </button>
                  <button
                    className="profile-hero-icon-btn"
                    title={t("profile.passwordShort")}
                    onClick={() => { setChangingPwd(true); setSaveSuccess(""); setPwdSuccess(""); setPwdError(""); }}
                  >
                    <KeyIcon />
                  </button>
                </div>
              </div>

              <div className="profile-badges">
                <span className={`role-badge${isApprovedCreator(user) ? " creator" : user.role === "admin" ? " admin" : user.creatorStatus === "pending" ? " pending" : ""}`}>
                  {isApprovedCreator(user) ? t("profile.roleCreator") : user.role === "admin" ? t("profile.roleAdmin") : user.creatorStatus === "pending" ? t("profile.rolePendingApproval") : t("profile.roleUser")}
                </span>
                {user.isVIP && (
                  <span className="role-badge vip" title={t("profile.vipUserTitle")}>💎 VIP</span>
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
              {user.bio && <p className="profile-bio">{user.bio}</p>}
            </div>
          </div>

          {/* Galería — real photos, immediately associated with the hero */}
          {normalizedImages.length > 0 && (
            <div className="actions-card profile-gallery-card">
              <div className="profile-gallery-head">
                <h2 className="actions-title profile-gallery-title">📷 {t("profile.galleryTitle")}</h2>
                <button type="button" className="profile-gallery-viewall" onClick={handleEdit}>
                  {t("profile.galleryViewAll")} <ChevronIcon />
                </button>
              </div>
              <div className="profile-gallery-rail">
                <button type="button" className="profile-gallery-add" onClick={handleEdit} title={t("profile.editProfileShort")}>
                  <EditIcon />
                  <span>{t("profile.addPhotoShort")}</span>
                </button>
                {normalizedImages.map((photo) => (
                  <img
                    key={photo.url}
                    src={photo.url}
                    alt={t("profile.secondaryPhotoAlt")}
                    className="profile-gallery-thumb"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                ))}
              </div>
            </div>
          )}

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
                  <label className="form-label">{t("profile.username")}</label>
                  <input className="input" type="text" value={editForm.username}
                    onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder={t("profile.usernamePlaceholder")} maxLength={30} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.name")}</label>
                  <input className="input" type="text" value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("profile.namePlaceholder")} maxLength={60} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.bio")}</label>
                  <textarea className="input bio-textarea" value={editForm.bio}
                    onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                    placeholder={t("profile.bioPlaceholder")} maxLength={200} rows={3} />
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
                  {detectingCountry && <span className="profile-field-hint">{t("profile.detectingCountry")}</span>}
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
              <h2 className="form-card-title">{t("profile.changePassword")}</h2>
              {pwdError && <div className="banner-error">{pwdError}</div>}
              <form onSubmit={handleChangePwd} className="form-fields">
                <div className="form-group">
                  <label className="form-label">{t("profile.currentPassword")}</label>
                  <input className="input" type="password" value={pwdForm.currentPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, currentPassword: e.target.value }))}
                    placeholder={t("profile.currentPasswordPlaceholder")} autoComplete="current-password" />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.newPassword")}</label>
                  <input className="input" type="password" value={pwdForm.newPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, newPassword: e.target.value }))}
                    placeholder={t("profile.passwordMinPlaceholder")} autoComplete="new-password" minLength={6} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("profile.confirmPassword")}</label>
                  <input className="input" type="password" value={pwdForm.confirmPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder={t("profile.confirmNewPasswordPlaceholder")} autoComplete="new-password" />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
                    {pwdSaving ? t("profile.saving") : t("profile.updatePassword")}
                  </button>
                  <button type="button" className="btn btn-secondary"
                    onClick={() => { setChangingPwd(false); setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setPwdError(""); }}
                    disabled={pwdSaving}>
                    {t("profile.cancelEdit")}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Preferences — compact rows (Idioma / Descubrimiento / Intereses), each expandable
              on tap; same underlying data/handlers as before, just a compact surface. */}
          <div className="form-card profile-preferences-card">
            <div className="form-card-heading">
              <span className="form-card-kicker">{t("profile.preferencesKicker")}</span>
              <h2 className="form-card-title">⚙️ {t("profile.preferencesKicker")}</h2>
            </div>

            <button
              type="button"
              className="prefs-row"
              onClick={() => setShowLangPanel((v) => !v)}
              aria-expanded={showLangPanel}
            >
              <span className="prefs-row-icon">🌐</span>
              <span className="prefs-row-label">{t("profile.languageSection")}</span>
              <span className="prefs-row-value">{t(`lang.${lang}`)}</span>
              <span className={`prefs-row-chevron${showLangPanel ? " prefs-row-chevron--open" : ""}`}><ChevronIcon /></span>
            </button>
            {showLangPanel && (
              <div className="prefs-row-panel">
                {langSuccess && <span className="prefs-inline-success">{langSuccess}</span>}
                <div className="profile-language-actions">
                  {SUPPORTED_LANGS.map((code) => (
                    <button
                      key={code}
                      className={`btn btn-xs${lang === code ? " btn-primary" : " btn-secondary"}`}
                      onClick={() => handleLanguageSave(code)}
                      disabled={langSaving}
                    >
                      {t(`lang.${code}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {preferenceItems.length > 0 && (
              <>
                <button
                  type="button"
                  className="prefs-row"
                  onClick={() => setShowDiscoveryPanel((v) => !v)}
                  aria-expanded={showDiscoveryPanel}
                >
                  <span className="prefs-row-icon">🧭</span>
                  <span className="prefs-row-label">{t("profile.discoverySummaryTitle")}</span>
                  <span className="prefs-row-value prefs-row-value-truncate">{discoverySummaryText}</span>
                  <span className={`prefs-row-chevron${showDiscoveryPanel ? " prefs-row-chevron--open" : ""}`}><ChevronIcon /></span>
                </button>
                {showDiscoveryPanel && (
                  <div className="prefs-row-panel">
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
              </>
            )}

            {isNotAdmin && (profileInterests.length > 0 || intentLabel) && (
              <>
                <button
                  type="button"
                  className="prefs-row"
                  onClick={() => setShowInterestsPanel((v) => !v)}
                  aria-expanded={showInterestsPanel}
                >
                  <span className="prefs-row-icon">❤️</span>
                  <span className="prefs-row-label">{t("profile.interestsIntentTitle")}</span>
                  <span className="prefs-row-value prefs-row-value-truncate">
                    {interestsSummaryText}
                    {interestsOverflowCount > 0 ? ` +${interestsOverflowCount}` : ""}
                  </span>
                  <span className={`prefs-row-chevron${showInterestsPanel ? " prefs-row-chevron--open" : ""}`}><ChevronIcon /></span>
                </button>
                {showInterestsPanel && (
                  <div className="prefs-row-panel">
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
              </>
            )}
          </div>

          {/* Acerca de mí — compact, de-emphasized secondary info */}
          <div className="form-card profile-about-card">
            <div className="form-card-heading">
              <h2 className="form-card-title">👤 {t("profile.aboutMeTitle")}</h2>
            </div>
            <div className="prefs-row prefs-row--static">
              <span className="prefs-row-icon">🛡️</span>
              <span className="prefs-row-label">{t("profile.verificationLabel")}</span>
              <span className="prefs-row-value">
                {user.isVerified
                  ? t("profile.verifiedShort")
                  : `${t("profile.profileReadyShort")} (${completenessCompleted}/${completenessTotal})`}
              </span>
            </div>
            <div className="prefs-row prefs-row--static">
              <span className="prefs-row-icon">📅</span>
              <span className="prefs-row-label">{t("profile.memberSince")}</span>
              <span className="prefs-row-value">
                {new Date(user.createdAt).toLocaleDateString(t("common.locale"), { month: "short", year: "numeric" })}
              </span>
            </div>
          </div>

          {/* Estadísticas — only rendered when real data exists (received gifts / creator earnings) */}
          {showStatsSection && (
            <div className="actions-card profile-stats-card">
              <h2 className="actions-title">📊 {t("profile.statsTitle")}</h2>
              <div className="stats-grid">
                {hasGiftStats && (
                  <div className="stat-card">
                    <div className="stat-icon-wrap" style={{ color: "#e879f9" }}>
                      <GiftStatIcon />
                    </div>
                    <div className="stat-value">{giftStats.totalReceivedGifts ?? 0}</div>
                    <div className="stat-label">{t("profile.giftsReceivedStat")}</div>
                  </div>
                )}
                {hasGiftStats && (
                  <div className="stat-card">
                    <div className="stat-icon-wrap" style={{ color: "var(--accent-orange)" }}>
                      <CoinIcon />
                    </div>
                    <div className="stat-value">{giftStats.totalReceivedCoins ?? 0}</div>
                    <div className="stat-label">{t("profile.coinsReceivedStat")}</div>
                  </div>
                )}
                {hasCreatorEarnings && (
                  <div className="stat-card">
                    <div className="stat-icon-wrap" style={{ color: "#fbbf24" }}>
                      <TrophyIcon />
                    </div>
                    <div className="stat-value">{user.earningsCoins ?? 0}</div>
                    <div className="stat-label">{t("profile.earningsStat")}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Wallet — compact coins balance + CTA, premium status alongside */}
          <div className="profile-wallet-row">
            <div className="profile-wallet-compact">
              <div className="profile-wallet-compact-icon"><CoinIcon /></div>
              <div className="profile-wallet-compact-body">
                <div className="profile-wallet-compact-value">{user.coins ?? 0}</div>
                <div className="profile-wallet-compact-label">{t("profile.coinsStat")}</div>
              </div>
              <Link href="/coins" className="profile-wallet-compact-cta">{t("profile.walletGoToCoins")}</Link>
            </div>

            {isNotAdmin && (
              user.isVIP ? (
                <div className="premium-upsell-card premium-upsell-card-vip">
                  <div className="premium-upsell-header">
                    <span className="premium-upsell-gem">💎</span>
                    <div>
                      <h2 className="premium-upsell-title">{t("subscriptionSoftLaunch.profileActiveTitle")}</h2>
                      <p className="premium-upsell-sub">{t("subscriptionSoftLaunch.profileActiveDescription")}</p>
                    </div>
                  </div>
                  <div className="premium-upsell-actions">
                    <Link href="/subscription" className="premium-upsell-btn premium-upsell-btn-primary">
                      {t("profile.manageSubscription")}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="premium-upsell-card">
                  <div className="premium-upsell-header">
                    <span className="premium-upsell-gem">💎</span>
                    <div>
                      <h2 className="premium-upsell-title">{t("subscriptionSoftLaunch.profileCoinsTitle")}</h2>
                      <p className="premium-upsell-sub">{t("subscriptionSoftLaunch.profileCoinsDescription")}</p>
                    </div>
                  </div>
                  <div className="premium-upsell-actions">
                    <Link href="/coins" className="premium-upsell-btn premium-upsell-btn-primary">
                      {t("subscriptionSoftLaunch.buyCoins")}
                    </Link>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Growth — Boost + Creator status share one row; Boost keeps its special treatment */}
          {(isNotAdmin || user.role === "user" || user.creatorStatus === "pending" || isApprovedCreator(user)) && (
            <div className="profile-growth-row">
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
                  <Link href="/creator-request" className="btn btn-primary creator-cta-btn">
                    {t("profile.creatorBtn")}
                  </Link>
                </div>
              )}

              {user.creatorStatus === "pending" && (
                <div className="creator-pending-card">
                  <div className="creator-cta-icon" style={{ color: "#fbbf24" }}>⏳</div>
                  <div className="creator-cta-body">
                    <div className="creator-cta-title">{t("profile.creatorPendingTitle")}</div>
                    <div className="creator-cta-sub">{t("creatorRequest.pendingReviewNotice")}</div>
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
            </div>
          )}

          {/* Referral promo */}
          {isNotAdmin && <ReferralCard />}

          {/* Quick actions — compact launcher grid. Logout is intentionally kept out of the
              grid (own full-width row) so it reads as a distinct, destructive action and never
              competes for grid cells at narrow widths. */}
          <div className="actions-card">
            <h2 className="actions-title">{t("profile.quickActions")}</h2>
            <div className="actions-grid">
              {ACTIONS.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className="action-tile">
                  <span className="action-tile-icon"><Icon /></span>
                  <span className="action-tile-label">{label}</span>
                </Link>
              ))}
            </div>
            <button type="button" className="action-tile-logout-row" onClick={handleLogout}>
              <span className="action-tile-icon"><LogoutIcon /></span>
              <span>{t("profile.logout")}</span>
            </button>
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

        @media (min-width: 860px) {
          .profile-page { max-width: 880px; }
          .profile-wallet-row { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); align-items: stretch; }
          .profile-wallet-row .premium-upsell-card { height: 100%; }
          .profile-growth-row { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
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

        .profile-field-hint {
          display: block;
          color: var(--text-muted);
          font-size: 0.8rem;
          margin-top: 0.25rem;
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

        .profile-hero {
          display: flex;
          flex-direction: column;
        }

        .profile-hero-media {
          position: relative;
          width: 100%;
          aspect-ratio: 4 / 3;
          max-height: 380px;
          overflow: hidden;
          border-radius: 28px 28px 0 0;
          background: var(--grad-primary);
        }

        .profile-hero-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .profile-hero-photo-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4.5rem;
          font-weight: 900;
          color: rgba(255,255,255,0.9);
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

        .profile-hero-state-chip {
          position: absolute;
          top: 0.9rem;
          left: 0.9rem;
          background: rgba(15,8,32,0.55);
          backdrop-filter: blur(10px);
        }

        .profile-hero-card {
          border-radius: 0 0 28px 28px;
          padding: 1.4rem 1.6rem 1.6rem;
        }

        .profile-hero-id-row {
          position: relative;
          display: flex;
          align-items: flex-end;
          gap: 0.9rem;
          margin-top: -56px;
          flex-wrap: wrap;
        }

        .profile-hero-avatar-wrap {
          flex-shrink: 0;
          padding: 0.3rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(224,64,251,0.85), rgba(34,211,238,0.75));
          box-shadow: var(--glow-pink), 0 14px 32px rgba(0,0,0,0.4);
        }

        .profile-hero-avatar-img {
          width: 86px;
          height: 86px;
          border-radius: 50%;
          object-fit: cover;
          display: block;
          border: 3px solid rgba(15,8,32,0.9);
        }

        .profile-hero-avatar-fallback {
          width: 86px;
          height: 86px;
          font-size: 1.9rem;
        }

        .profile-hero-id-text {
          flex: 1;
          min-width: 140px;
          padding-bottom: 0.2rem;
        }

        .profile-hero-name-line {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .profile-hero-name {
          font-size: clamp(1.4rem, 5vw, 1.9rem);
        }

        .profile-hero-verified-check {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--success);
          color: #06241a;
          font-size: 0.8rem;
          font-weight: 900;
          flex-shrink: 0;
        }

        .profile-hero-location {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          margin: 0.3rem 0 0;
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 600;
        }

        .profile-hero-id-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
          padding-bottom: 0.2rem;
        }

        .profile-hero-id-actions .profile-action-button-primary {
          border-radius: 999px;
          min-height: 38px;
        }

        .profile-hero-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.16);
          color: var(--text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }
        .profile-hero-icon-btn:hover {
          background: rgba(255,255,255,0.12);
          color: var(--text);
        }

        /* Galería rail */
        .profile-gallery-card {
          padding: 1.1rem 1.25rem;
        }
        .profile-gallery-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .profile-gallery-title { margin-bottom: 0; }
        .profile-gallery-viewall {
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
          background: transparent;
          border: none;
          color: #67e8f9;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
          padding: 0;
        }
        .profile-gallery-viewall :global(svg) { width: 13px; height: 13px; }

        .profile-gallery-rail {
          display: flex;
          gap: 0.6rem;
          align-items: center;
          overflow-x: auto;
          scroll-snap-type: x proximity;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 0.2rem;
        }

        .profile-gallery-add {
          flex-shrink: 0;
          width: 76px;
          height: 96px;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          color: #f0abfc;
          background: rgba(224,64,251,0.08);
          border: 1px dashed rgba(224,64,251,0.4);
          font-size: 0.68rem;
          font-weight: 700;
          cursor: pointer;
          scroll-snap-align: start;
        }
        .profile-gallery-add:hover { background: rgba(224,64,251,0.16); }

        .profile-gallery-thumb {
          scroll-snap-align: start;
          flex-shrink: 0;
          width: 76px;
          height: 96px;
          border-radius: 16px;
          object-fit: cover;
          border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 8px 18px rgba(0,0,0,0.22);
        }

        /* Preferences / About — compact rows */
        .prefs-row {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          width: 100%;
          padding: 0.85rem 0.2rem;
          background: transparent;
          border: none;
          border-top: 1px solid rgba(255,255,255,0.08);
          color: var(--text);
          cursor: pointer;
          text-align: left;
          font-family: inherit;
        }
        .prefs-row:first-of-type { border-top: none; }
        .prefs-row--static { cursor: default; }
        .prefs-row-icon { font-size: 1.1rem; flex-shrink: 0; }
        .prefs-row-label {
          font-size: 0.86rem;
          font-weight: 700;
          color: var(--text);
          flex-shrink: 0;
        }
        .prefs-row-value {
          flex: 1;
          min-width: 0;
          text-align: right;
          font-size: 0.82rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .prefs-row-value-truncate {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .prefs-row-chevron {
          display: inline-flex;
          flex-shrink: 0;
          color: var(--text-dim);
          transition: transform 0.18s;
        }
        .prefs-row-chevron--open { transform: rotate(90deg); }
        .prefs-row-panel {
          padding: 0 0.2rem 0.9rem;
        }

        .profile-stats-card .stats-grid { margin-top: 0.1rem; }

        /* Wallet — compact strip */
        .profile-wallet-compact {
          display: flex;
          align-items: center;
          gap: 0.9rem;
          padding: 1.1rem 1.25rem;
          border-radius: var(--radius);
          border: 1px solid rgba(236,124,255,0.22);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.06), transparent 36%),
            rgba(15,8,32,0.72);
          box-shadow: var(--shadow-sm);
        }
        .profile-wallet-compact-icon {
          width: 44px;
          height: 44px;
          border-radius: 16px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-orange);
          flex-shrink: 0;
        }
        .profile-wallet-compact-body { flex: 1; min-width: 0; }
        .profile-wallet-compact-value { font-size: 1.15rem; font-weight: 800; color: var(--text); }
        .profile-wallet-compact-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; }
        .profile-wallet-compact-cta {
          flex-shrink: 0;
          padding: 0.5rem 1rem;
          border-radius: 999px;
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.8rem;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }
        .profile-wallet-compact-cta:hover { opacity: 0.88; }

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

        .profile-action-button {
          border: 1px solid rgba(255,255,255,0.16);
          backdrop-filter: blur(14px);
        }

        .profile-action-button-primary {
          background: linear-gradient(135deg, rgba(255,45,120,0.95), rgba(224,64,251,0.88), rgba(139,92,246,0.88));
          box-shadow: var(--glow-pink), 0 12px 26px rgba(0,0,0,0.24);
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
        .profile-preferences-card {
          border-color: rgba(255,79,163,0.28);
        }

        .prefs-section {
          padding-top: 1rem;
          margin-top: 1rem;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .prefs-section:first-of-type {
          padding-top: 0;
          margin-top: 0;
          border-top: none;
        }
        .prefs-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.65rem;
        }
        .prefs-section-label {
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--text);
        }
        .prefs-inline-success {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--success);
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

        /* Wallet row — stats + upsell share one composition on wider screens */
        .profile-wallet-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }

        /* Growth row — Boost + Creator status share one composition on wider screens */
        .profile-growth-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        .profile-growth-row > * { margin: 0; }

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

        .actions-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.6rem;
        }

        .action-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 0.4rem;
          min-width: 0;
          padding: 0.85rem 0.35rem;
          border-radius: 18px;
          color: var(--text-muted);
          font-size: 0.68rem;
          font-weight: 700;
          text-align: center;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer;
          text-decoration: none;
          transition: all var(--transition);
        }

        .action-tile-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: none;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          color: var(--text-dim);
          background: rgba(255,255,255,0.05);
        }

        .action-tile-label {
          width: 100%;
          min-width: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          overflow-wrap: break-word;
          line-height: 1.15;
        }

        .action-tile:hover {
          background: rgba(139,92,246,0.1);
          border-color: rgba(139,92,246,0.3);
          color: var(--text);
          transform: translateY(-2px);
        }
        .action-tile:hover .action-tile-icon { color: var(--accent-3); }

        /* Logout — deliberately outside the actions-grid: a full-width, clearly
           destructive row so it never fights the launcher tiles for space. */
        .action-tile-logout-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          width: 100%;
          margin-top: 0.75rem;
          padding: 0.85rem 1rem;
          border-radius: 16px;
          background: rgba(248,113,113,0.06);
          border: 1px solid rgba(248,113,113,0.2);
          color: var(--error);
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
        }
        .action-tile-logout-row .action-tile-icon { color: var(--error); background: rgba(248,113,113,0.1); }
        .action-tile-logout-row:hover {
          background: rgba(248,113,113,0.12);
          border-color: rgba(248,113,113,0.35);
        }

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
        .prefs-section--last {
          position: relative;
        }
        .prefs-section--last .prefs-section-label {
          color: #67e8f9;
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

          .creator-cta-card,
          .creator-pending-card,
          .creator-active-card,
          .boost-profile-card {
            padding: 1.05rem 1.1rem;
            gap: 0.75rem;
          }
          .creator-cta-body { min-width: 140px; }
          .boost-profile-body { min-width: 140px; }

          .profile-hero-card {
            padding: 1.1rem 1.1rem 1.25rem;
            border-radius: 0 0 22px 22px;
          }

          .profile-hero-media {
            aspect-ratio: 16 / 9;
            max-height: 230px;
            border-radius: 22px 22px 0 0;
          }

          .profile-hero-id-row {
            margin-top: -40px;
          }

          .profile-hero-avatar-img,
          .profile-hero-avatar-fallback {
            width: 64px;
            height: 64px;
          }

          .profile-hero-id-actions {
            flex-basis: 100%;
            margin-top: 0.6rem;
            justify-content: flex-start;
          }

          .profile-badges {
            justify-content: flex-start;
          }

          .profile-bio {
            max-width: none;
          }

          .profile-gallery-card { padding: 1rem; }
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
          .actions-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        /* Extra-narrow devices (e.g. 360px): 3 columns with full labels gets too tight,
           so drop to 2 columns to keep every tile legible with no overlap. */
        @media (max-width: 374px) {
          .actions-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .profile-hero-media {
            aspect-ratio: 4 / 3;
            max-height: 200px;
          }

          .profile-hero-id-row {
            margin-top: -36px;
          }

          .profile-hero-avatar-img,
          .profile-hero-avatar-fallback {
            width: 58px;
            height: 58px;
          }
        }
      `}</style>
    </div>
  );
}
