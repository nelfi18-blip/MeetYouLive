"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AVATAR_TOO_LARGE_MESSAGE,
  AVATAR_UPLOAD_MAX_BYTES,
  AVATAR_UPLOAD_MAX_LABEL,
  compressAvatarImage,
  getAvatarUploadDiagnostic,
} from "@/lib/avatarUpload";
import { normalizeImageUrl, normalizeUserImages as normalizeSharedUserImages } from "@/lib/imageHelpers";
import { getMissingProfileLabels } from "@/lib/profileCompletionLabels";
import { publishProfileUpdated } from "@/lib/profileSync";
import { WELCOME_FEED_NOTICE_KEY } from "@/lib/storageKeys";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_INTERESTS = 10;
const MIN_INTERESTS = 3;
const MAX_PROFILE_PHOTOS = 6;
const MAX_EXTRA_PROFILE_PHOTOS = 5;
const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_AVATAR_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const DISTANCE_OPTIONS = [5, 10, 25, 50, 100];
const MIN_AGE_YEARS = 18;
const INTERNAL_ERROR_PATTERN = /failed\s+to\s+fetch|network|cors|stack|error:|net::err|typeerror/i;
const getMinimumAgeDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - MIN_AGE_YEARS);
  return date.toISOString().split("T")[0];
};
const MIN_AGE_DATE = getMinimumAgeDate();

const calculateAge = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 ? age : null;
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

const hasValidLocation = (city, country, coordinates = {}) =>
  Boolean(city.trim() && country.trim()) ||
  (Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng));

const buildUploadEndpoint = ({ setAsMain = true } = {}) => {
  if (typeof API_URL !== "string" || !API_URL.trim()) {
    console.error("[avatar-upload] NEXT_PUBLIC_API_URL no está configurado");
    return "";
  }
  const base = `${API_URL.replace(/\/+$/, "")}/api/user/me/avatar-upload`;
  return setAsMain ? base : `${base}?setAsMain=0`;
};

const normalizeAvatarUrl = (avatarValue) => {
  return normalizeImageUrl(avatarValue) || "";
};

const getSafePreviewSrc = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(blob:|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(trimmed)) return trimmed;
  return normalizeAvatarUrl(trimmed);
};

const getUploadPhotoUrlValue = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.url || value.secure_url || value.src || value.path || "";
};

const getPhotoUrl = (photo) => normalizeAvatarUrl(getUploadPhotoUrlValue(photo));

const normalizeImages = (userOrImages = {}) => {
  return normalizeSharedUserImages(userOrImages).map((image) => image.url);
};

const getPrimaryImage = (userOrImages = {}) => normalizeImages(userOrImages)[0] || "";

// Accept the canonical avatar/profilePhotos payload plus legacy/provider URL objects
// so a successful backend upload cannot be discarded before the onboarding save.
const collectUploadPhotoUrls = (payload) => {
  const primaryPhoto = getPrimaryImage(payload?.user || payload);
  return normalizeImages([
    primaryPhoto,
    ...(Array.isArray(payload?.images) ? payload.images : []),
    ...(Array.isArray(payload?.user?.images) ? payload.user.images : []),
    payload?.avatar,
    payload?.profileImage,
    payload?.photo,
    payload?.mainPhoto,
    payload?.photoUrl,
    payload?.avatarPath,
    payload?.user?.avatar,
    payload?.user?.profileImage,
    payload?.user?.photo,
    payload?.user?.mainPhoto,
    payload?.user?.photoUrl,
    payload?.user?.avatarPath,
    ...(Array.isArray(payload?.profilePhotos) ? payload.profilePhotos : []),
    ...(Array.isArray(payload?.user?.profilePhotos) ? payload.user.profilePhotos : []),
  ]);
};

const getCommonRequestErrorMessage = (status, labels) => {
  if (status === 401 || status === 403) return labels.sessionExpired;
  if (status === 429) return labels.tooManyAttempts;
  if (status >= 500 || status === 0) return labels.serverConnecting;
  return "";
};

const getSafeSaveErrorMessage = (status, data = {}, labels) => {
  const commonMessage = getCommonRequestErrorMessage(status, labels);
  if (commonMessage) return commonMessage;
  if (status >= 400 && status < 500 && typeof data?.message === "string" && data.message.trim() && !INTERNAL_ERROR_PATTERN.test(data.message)) {
    return data.message.trim();
  }
  return labels.profileSaveError;
};

const getSafeUploadErrorMessage = (status, labels) => {
  if (status === 413) return AVATAR_TOO_LARGE_MESSAGE;
  const commonMessage = getCommonRequestErrorMessage(status, labels);
  if (commonMessage) return commonMessage;
  return labels.photoUploadError;
};

export default function OnboardingPage() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const { t } = useLanguage();
  const steps = useMemo(() => [
    t("onboarding.steps.welcome"),
    t("onboarding.steps.path"),
    t("onboarding.steps.profile"),
    t("onboarding.steps.interests"),
    t("onboarding.steps.photo"),
  ], [t]);
  const valueProps = useMemo(() => [
    { emoji: "💖", title: t("onboarding.valueProps.match.title"), desc: t("onboarding.valueProps.match.desc") },
    { emoji: "🎥", title: t("onboarding.valueProps.live.title"), desc: t("onboarding.valueProps.live.desc") },
    { emoji: "🎁", title: t("onboarding.valueProps.gifts.title"), desc: t("onboarding.valueProps.gifts.desc") },
    { emoji: "💰", title: t("onboarding.valueProps.creator.title"), desc: t("onboarding.valueProps.creator.desc") },
  ], [t]);
  const paths = useMemo(() => [
    {
      id: "crush",
      emoji: "💖",
      title: t("onboarding.paths.crush.title"),
      desc: t("onboarding.paths.crush.desc"),
      hook: t("onboarding.paths.crush.hook"),
      color: "#ff2d78",
      glow: "rgba(255,45,120,0.35)",
    },
    {
      id: "live",
      emoji: "🎥",
      title: t("onboarding.paths.live.title"),
      desc: t("onboarding.paths.live.desc"),
      hook: t("onboarding.paths.live.hook"),
      color: "#818cf8",
      glow: "rgba(129,140,248,0.35)",
    },
    {
      id: "creator",
      emoji: "🌟",
      title: t("onboarding.paths.creator.title"),
      desc: t("onboarding.paths.creator.desc"),
      hook: t("onboarding.paths.creator.hook"),
      color: "#fbbf24",
      glow: "rgba(251,191,36,0.35)",
    },
  ], [t]);
  const stepExplanations = useMemo(() => ({
    1: t("onboarding.explanations.path"),
    2: t("onboarding.explanations.profile"),
    3: t("onboarding.explanations.interests"),
    4: t("onboarding.explanations.photo"),
  }), [t]);
  const interestOptions = useMemo(() => {
    const options = t("onboarding.interestOptions");
    return Array.isArray(options) ? options : [];
  }, [t]);
  const errorLabels = {
    serverConnecting: t("onboarding.serverConnecting"),
    profileSaveError: t("onboarding.profileSaveError"),
    photoUploadError: t("onboarding.photoUploadError"),
    sessionExpired: t("onboarding.sessionExpired"),
    tooManyAttempts: t("onboarding.tooManyAttempts"),
  };
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const animTimerRef = useRef(null);
  const photoIdCounterRef = useRef(0);
  const addPhotosInputRef = useRef(null);

  // Step 1: chosen path
  const [selectedPath, setSelectedPath] = useState(null);

  // Step 2 fields (profile)
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [locationCountry, setLocationCountry] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationRegion, setLocationRegion] = useState("");
  const [locationCoordinates, setLocationCoordinates] = useState({ lat: null, lng: null });
  const [discoveryScope, setDiscoveryScope] = useState("global");
  const [maxDistanceKm, setMaxDistanceKm] = useState("");
  const [interestedIn, setInterestedIn] = useState("both");

  // Step 3 fields (interests)
  const [interests, setInterests] = useState([]);

  // Step 4 fields (photos)
  const [mainPhotoFile, setMainPhotoFile] = useState(null);
  const [mainPhotoPreview, setMainPhotoPreview] = useState("");
  const [extraPhotoFiles, setExtraPhotoFiles] = useState([]);
  const safeMainPhotoPreview = getSafePreviewSrc(mainPhotoPreview);
  const visibleExtraPhotoFiles = extraPhotoFiles
    .map((photo) => ({ ...photo, safePreview: getSafePreviewSrc(photo?.preview) }))
    .filter((photo) => photo.safePreview);
  const selectedPhotoCount = (safeMainPhotoPreview ? 1 : 0) + visibleExtraPhotoFiles.length;
  const emptyExtraPhotoSlots = Math.max(0, MAX_EXTRA_PROFILE_PHOTOS - visibleExtraPhotoFiles.length);

  // Completion percentage (computed from required fields filled so far)
  const completionPercent = (() => {
    const checks = [
      Boolean(mainPhotoPreview),
      Boolean(birthdate),
      hasValidLocation(locationCity, locationCountry, locationCoordinates),
      Boolean(gender),
      Boolean(interestedIn),
      interests.length >= MIN_INTERESTS,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();
  // A failed final save means the profile is not fully persisted yet, even if all required fields are filled.
  const displayedCompletionPercent = saveFailed ? Math.min(completionPercent, 99) : completionPercent;

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

  const handleUseCurrentLocation = () => {
    setError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(t("profile.locationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationCoordinates({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setDiscoveryScope("nearby");
        setMaxDistanceKm((current) => current || "25");
        setLocationCity((current) => current || t("profile.automaticLocationLabel"));
      },
      () => {
        setError(t("profile.locationPermissionDenied"));
        setDiscoveryScope("country");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  const createTempPhotoId = () => {
    photoIdCounterRef.current += 1;
    return `photo-${photoIdCounterRef.current}`;
  };

  const validateAvatarFile = (file) => {
    if (!file) return t("onboarding.invalidImage");
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) return t("onboarding.invalidImageFormat");
    if (!hasAllowedAvatarExtension(file.name)) return t("onboarding.invalidImageName");
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
      try {
        const preview = await readPreview(file);
        if (!nextMainFile) {
          nextMainFile = file;
          nextMainPreview = preview;
        } else {
          nextExtras.push({ id: createTempPhotoId(), file, preview });
        }
        totalPhotos += 1;
      } catch {
        setError(t("onboarding.photoReadError"));
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
        nextExtras.unshift({ id: createTempPhotoId(), file: mainPhotoFile, preview: mainPhotoPreview });
      }
      setMainPhotoFile(selected.file);
      setMainPhotoPreview(selected.preview);
      return nextExtras.slice(0, MAX_EXTRA_PROFILE_PHOTOS);
    });
  };

  const handleNext = () => {
    setError("");
    setSaveFailed(false);
    if (step === 1 && !selectedPath) {
      setError(t("onboarding.pathRequired"));
      return;
    }
    if (step === 2) {
      if (!name.trim()) {
        setError(t("onboarding.nameRequired"));
        return;
      }
      if (!gender) {
        setError(t("onboarding.genderRequired"));
        return;
      }
      if (!birthdate) {
        setError(t("onboarding.birthdateRequired"));
        return;
      }
      if (calculateAge(birthdate) < MIN_AGE_YEARS) {
        setError(t("onboarding.minimumAgeRequired"));
        return;
      }
      if (
        !hasValidLocation(locationCity, locationCountry, locationCoordinates)
      ) {
        setError(t("onboarding.locationRequired"));
        return;
      }
    }
    if (step === 3) {
      if (interests.length < MIN_INTERESTS) {
        setError(t("onboarding.interestsRequired").replace("{count}", String(MIN_INTERESTS)));
        return;
      }
    }
    goToStep(step + 1);
  };

  const finish = async () => {
    setError("");
    setSaveFailed(false);
    if (!safeMainPhotoPreview && visibleExtraPhotoFiles.length === 0) {
      setError(t("onboarding.photoRequired"));
      return;
    }
    setLoading(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setError(errorLabels.sessionExpired);
      setSaveFailed(true);
      setLoading(false);
      router.replace("/login");
      return;
    }

    const handleSaveFailure = (message) => {
      setSaveFailed(true);
      setError(message);
      setLoading(false);
    };

    const uploadPhotoFile = async (file, { setAsMain = false } = {}) => {
      const uploadEndpoint = buildUploadEndpoint({ setAsMain });
      if (!uploadEndpoint) return { ok: false, message: t("onboarding.uploadConfigError") };
      const uploadFile = await compressAvatarImage(file);
      if (uploadFile.size > AVATAR_UPLOAD_MAX_BYTES) {
        const diagnostic = getAvatarUploadDiagnostic(413, {
          error: "File too large",
          message: AVATAR_TOO_LARGE_MESSAGE,
          code: "FILE_TOO_LARGE",
        });
        console.warn("[onboarding-avatar-upload] file too large", diagnostic);
        return { ok: false, message: AVATAR_TOO_LARGE_MESSAGE, diagnostic };
      }

      const formData = new FormData();
      formData.append("avatar", uploadFile);
      let uploadRes;
      try {
        uploadRes = await fetch(uploadEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        });
      } catch (err) {
        const diagnostic = getAvatarUploadDiagnostic(0, { error: err?.message, code: "NETWORK_ERROR" }, errorLabels.serverConnecting);
        console.warn("[onboarding-avatar-upload] network error", diagnostic);
        return { ok: false, message: errorLabels.serverConnecting, diagnostic };
      }
      const uploadData = await parseUploadResponseBody(uploadRes);
      if (!uploadRes.ok) {
        const diagnostic = getAvatarUploadDiagnostic(uploadRes.status, uploadData, "Error al subir la foto");
        console.warn("[onboarding-avatar-upload] failed", diagnostic);
        return {
          ok: false,
          unauthorized: uploadRes.status === 401,
          message: getSafeUploadErrorMessage(uploadRes.status, errorLabels),
          diagnostic,
        };
      }
      const uploadPhotos = collectUploadPhotoUrls(uploadData);
      const normalizedAvatar = uploadPhotos[0] || "";
      if (!normalizedAvatar) {
        return { ok: false, message: t("onboarding.uploadUrlError") };
      }
      try {
        await updateSession?.();
      } catch (err) {
        console.error("[onboarding-avatar-upload] failed to refresh session", err);
      }
      return { ok: true, avatar: normalizedAvatar, profilePhotos: uploadPhotos };
    };

    const mergeProfilePhotos = (currentPhotos, nextPhotos) => {
      const merged = [];
      const seen = new Set();
      for (const photo of [...currentPhotos, ...nextPhotos]) {
        if (photo && !seen.has(photo)) {
          seen.add(photo);
          merged.push(photo);
        }
        if (merged.length >= MAX_PROFILE_PHOTOS) break;
      }
      return merged;
    };

    let workingMainFile = mainPhotoFile;
    let workingExtraFiles = [...extraPhotoFiles];
    if (!workingMainFile && workingExtraFiles.length > 0) {
      const promoted = workingExtraFiles.shift();
      if (promoted?.file) {
        workingMainFile = promoted.file;
      }
    }

    let finalAvatarUrl = "";
    let finalProfilePhotos = [];

    try {
      if (workingMainFile) {
        const mainUpload = await uploadPhotoFile(workingMainFile, { setAsMain: true });
        if (!mainUpload.ok) {
          if (mainUpload.unauthorized) router.replace("/login");
          handleSaveFailure(mainUpload.message || errorLabels.photoUploadError);
          return;
        }
        finalAvatarUrl = mainUpload.avatar;
        finalProfilePhotos = mergeProfilePhotos(
          finalProfilePhotos,
          mainUpload.profilePhotos.length ? mainUpload.profilePhotos : [finalAvatarUrl]
        );
      }

      for (const extra of workingExtraFiles) {
        const extraUpload = await uploadPhotoFile(extra.file, { setAsMain: false });
        if (!extraUpload.ok) {
          if (extraUpload.unauthorized) {
            router.replace("/login");
            handleSaveFailure(extraUpload.message || errorLabels.sessionExpired);
            return;
          }
          handleSaveFailure(extraUpload.message || errorLabels.photoUploadError);
          return;
        }
        finalProfilePhotos = mergeProfilePhotos(finalProfilePhotos, extraUpload.profilePhotos);
      }
    } catch {
      handleSaveFailure(errorLabels.photoUploadError);
      return;
    }

    // Map selected path to intent
    const intentMap = { crush: "dating", live: "live", creator: "creator" };
    const intent = intentMap[selectedPath] || "";
    const locationLabel = [locationCity, locationRegion, locationCountry].filter(Boolean).join(", ");
    const coordinates =
      Number.isFinite(locationCoordinates.lng) && Number.isFinite(locationCoordinates.lat)
        ? [locationCoordinates.lng, locationCoordinates.lat]
        : undefined;

    try {
      const res = await fetch(`${API_URL}/api/onboarding`, {
        method: "PUT",
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
          location: {
            type: "Point",
            coordinates,
            country: locationCountry.trim(),
            city: locationCity.trim(),
            region: locationRegion.trim(),
            label: locationLabel || undefined,
          },
          locationLabel: locationLabel || undefined,
          maxDistanceKm: maxDistanceKm || undefined,
          discoveryScope,
          discoveryPreferences: {
            maxDistanceKm: maxDistanceKm || null,
            discoveryScope,
          },
          images: finalProfilePhotos.length
            ? finalProfilePhotos.slice(0, MAX_PROFILE_PHOTOS).map((url, index) => ({
                url,
                isPrimary: url === finalAvatarUrl || (!finalAvatarUrl && index === 0),
              }))
            : undefined,
          avatar: finalAvatarUrl || undefined,
          profilePhotos: finalProfilePhotos.length ? finalProfilePhotos.slice(0, MAX_PROFILE_PHOTOS) : undefined,
          intent: intent || undefined,
          interestedIn: interestedIn || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        handleSaveFailure(getSafeSaveErrorMessage(res.status, data, errorLabels));
        return;
      }
      const updatedUser = data.user || data;
      const normalizedImages = normalizeImages(updatedUser).map((url, index) => ({ url, isPrimary: index === 0 }));
      const onboardingComplete = data.onboardingComplete === true || updatedUser.onboardingComplete === true;
      if (!onboardingComplete) {
        const missing = data.missingFields || updatedUser.missingFields || data.profileCompletion?.missing || [];
        const missingLabels = getMissingProfileLabels(missing);
        const missingMessage = missingLabels.length
          ? t("onboarding.missingFields").replace("{fields}", missingLabels.join(" / "))
          : t("onboarding.backendIncomplete");
        handleSaveFailure(missingMessage);
        return;
      }
      try {
        localStorage.setItem(
          "meetyoulive:user",
          JSON.stringify({
            id: updatedUser._id || updatedUser.id || "",
            name: updatedUser.name || "",
            avatar: updatedUser.avatar || "",
            onboardingComplete: updatedUser.onboardingComplete === true,
          })
        );
      } catch {
        // Ignore storage failures; the freshly updated session/profile remains canonical.
      }
      const profileRes = await fetch(`${API_URL}/api/user/me`, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (!profileRes.ok) {
        handleSaveFailure(getSafeSaveErrorMessage(profileRes.status, {}, errorLabels));
        return;
      }
      // Force the backend profile to refresh before leaving onboarding.
      const refreshedProfile = await profileRes.json().catch(() => null);
      const sessionProfile = refreshedProfile || updatedUser;
      await updateSession?.({
        user: {
          name: sessionProfile?.name || name.trim() || "",
          image: getPrimaryImage(sessionProfile) || finalAvatarUrl || "",
        },
        onboardingComplete: sessionProfile?.onboardingComplete === true,
        canAppearInFeed: sessionProfile?.canAppearInFeed === true,
        profileStatus: sessionProfile?.profileStatus || data.profileStatus || null,
      });
      publishProfileUpdated(sessionProfile);
      try {
        sessionStorage.setItem(WELCOME_FEED_NOTICE_KEY, t("feed.welcomeNotice"));
      } catch {
        // Ignore storage failures; the feed remains available without the one-time welcome notice.
      }
      router.refresh();
      router.replace("/feed");
    } catch (err) {
      console.warn("[onboarding-save] request failed", err);
      handleSaveFailure(errorLabels.serverConnecting);
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
            <div className="ob-progress-summary" aria-live="polite">
              {t("onboarding.progressSummary")
                .replace("{step}", String(step))
                .replace("{total}", String(steps.length - 1))
                .replace("{percent}", String(displayedCompletionPercent))}
            </div>
            {steps.slice(1).map((label, i) => {
              const idx = i + 1;
              return (
                <div key={label} className={`ob-step${idx === step ? " active" : idx < step ? " done" : ""}`}>
                  <div className="ob-step-dot">{idx < step ? "✓" : idx}</div>
                  <span className="ob-step-label">{label}</span>
                </div>
              );
            })}
            <div className="ob-progress-bar">
              <div className="ob-progress-fill" style={{ width: `${((step - 1) / (steps.length - 2)) * 100}%` }} />
            </div>
            <div className="ob-completion-percent">
              <span className="ob-completion-label">Perfil completado: </span>
              <span className="ob-completion-value">{displayedCompletionPercent}%</span>
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
                <h1 className="ob-hero-title">{t("onboarding.heroTitle")} <span className="ob-hero-accent">MeetYouLive</span></h1>
                <p className="ob-hero-sub">{t("onboarding.heroSubtitle")}</p>
              </div>

              <div className="ob-value-grid">
                {valueProps.map((vp) => (
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
                  {t("onboarding.startButton")}
                </button>
              </div>
              <p className="ob-legal-hint">
                {t("legal.onboardingNotice")}{" "}
                <Link href="/legal">{t("legal.backToLegal")}</Link>
              </p>
            </div>
          )}

          {/* ──────────────────────────────────────────
              Step 1 – Choose Your Path
          ────────────────────────────────────────── */}
          {step === 1 && (
            <div className="ob-section">
              <h2 className="ob-title">{t("onboarding.pathTitle")}</h2>
              <p className="ob-subtitle">{t("onboarding.pathSubtitle")}</p>
              <p className="ob-why">{stepExplanations[1]}</p>

              <div className="ob-paths">
                {paths.map((path) => (
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
                  {t("onboarding.backButton")}
                </button>
                <button className="btn btn-primary ob-btn-next" onClick={handleNext}>
                  {t("onboarding.continueButton")}
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              Step 2 – About You (profile)
          ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="ob-section">
              <h2 className="ob-title">{t("onboarding.profileTitle")}</h2>
              <p className="ob-subtitle">{t("onboarding.profileSubtitle")}</p>
              <p className="ob-why">{stepExplanations[2]}</p>

              <div className="ob-field">
                <label className="ob-label">{t("onboarding.nameLabel")}</label>
                <input
                  className="input"
                  placeholder={t("onboarding.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                />
              </div>

              <div className="ob-field">
                <label className="ob-label">{t("onboarding.bioLabel")}</label>
                <textarea
                  className="input ob-textarea"
                  placeholder={t("onboarding.bioPlaceholder")}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={300}
                  rows={3}
                />
                <span className="ob-char-count">{bio.length}/300</span>
              </div>

              <div className="ob-row">
                <div className="ob-field ob-field-half">
                  <label className="ob-label">{t("onboarding.genderLabel")}</label>
                  <select
                    className="input"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">{t("onboarding.selectPlaceholder")}</option>
                    <option value="male">{t("onboarding.genderMale")}</option>
                    <option value="female">{t("onboarding.genderFemale")}</option>
                    <option value="other">{t("onboarding.genderOther")}</option>
                    <option value="prefer_not_to_say">{t("onboarding.genderPreferNot")}</option>
                  </select>
                </div>

                <div className="ob-field ob-field-half">
                  <label className="ob-label">{t("onboarding.birthdateLabel")}</label>
                  <input
                    className="input"
                    type="date"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    max={MIN_AGE_DATE}
                  />
                </div>
              </div>

              <div className="ob-row">
                <div className="ob-field ob-field-half">
                  <label className="ob-label">{t("onboarding.countryLabel")}</label>
                  <input
                    className="input"
                    placeholder={t("profile.countryPlaceholder")}
                    value={locationCountry}
                    onChange={(e) => { setLocationCountry(e.target.value); setDiscoveryScope("country"); }}
                    maxLength={80}
                  />
                </div>

                <div className="ob-field ob-field-half">
                  <label className="ob-label">{t("onboarding.interestedInLabel")}</label>
                  <select
                    className="input"
                    value={interestedIn}
                    onChange={(e) => setInterestedIn(e.target.value)}
                  >
                    <option value="both">{t("onboarding.interestedInBoth")}</option>
                    <option value="female">{t("onboarding.interestedInWomen")}</option>
                    <option value="male">{t("onboarding.interestedInMen")}</option>
                  </select>
                </div>
              </div>

              <div className="ob-row">
                <div className="ob-field ob-field-half">
                  <label className="ob-label">{t("onboarding.cityLabel")}</label>
                  <input
                    className="input"
                    placeholder={t("profile.cityPlaceholder")}
                    value={locationCity}
                    onChange={(e) => { setLocationCity(e.target.value); setDiscoveryScope("country"); }}
                    maxLength={80}
                  />
                </div>
                <div className="ob-field ob-field-half">
                  <label className="ob-label">{t("onboarding.regionLabel")}</label>
                  <input
                    className="input"
                    placeholder={t("profile.regionPlaceholder")}
                    value={locationRegion}
                    onChange={(e) => { setLocationRegion(e.target.value); setDiscoveryScope("country"); }}
                    maxLength={80}
                  />
                </div>
              </div>

              <div className="ob-field">
                <label className="ob-label">{t("onboarding.discoveryLocationTitle")}</label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  <button type="button" className={`btn${discoveryScope === "nearby" ? " btn-primary" : ""}`} onClick={handleUseCurrentLocation}>
                    {t("profile.useCurrentLocation")}
                  </button>
                  <button type="button" className={`btn${discoveryScope === "country" ? " btn-primary" : ""}`} onClick={() => setDiscoveryScope("country")}>
                    {t("profile.manualLocation")}
                  </button>
                  <button type="button" className={`btn${discoveryScope === "global" ? " btn-primary" : ""}`} onClick={() => { setDiscoveryScope("global"); setMaxDistanceKm(""); }}>
                    {t("profile.globalDistance")}
                  </button>
                </div>
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  {DISTANCE_OPTIONS.map((distance) => (
                    <button
                      key={distance}
                      type="button"
                      className={`btn${String(maxDistanceKm) === String(distance) && discoveryScope === "nearby" ? " btn-primary" : ""}`}
                      onClick={() => { setDiscoveryScope("nearby"); setMaxDistanceKm(String(distance)); }}
                    >
                      {distance} km
                    </button>
                  ))}
                </div>
              </div>

              <div className="ob-actions ob-actions-row">
                <button className="btn ob-btn-back" onClick={() => goToStep(1)}>
                  {t("onboarding.backButton")}
                </button>
                <button className="btn btn-primary ob-btn-next" onClick={handleNext}>
                  {t("onboarding.continueButton")}
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              Step 3 – Interests
          ────────────────────────────────────────── */}
          {step === 3 && (
            <div className="ob-section">
              <h2 className="ob-title">{t("onboarding.interestsTitle")}</h2>
              <p className="ob-subtitle">
                {t("onboarding.interestsSubtitle")
                  .replace("{min}", String(MIN_INTERESTS))
                  .replace("{max}", String(MAX_INTERESTS))}
              </p>
              <p className="ob-why">{stepExplanations[3]}</p>

              <div className="ob-interests-grid">
                {interestOptions.map((interest) => (
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
                {interests.length < MIN_INTERESTS && (
                  <span className="ob-min-hint"> {t("onboarding.minimumHint").replace("{count}", String(MIN_INTERESTS))}</span>
                )}
              </div>

              <div className="ob-actions ob-actions-row">
                <button className="btn ob-btn-back" onClick={() => goToStep(2)}>
                  {t("onboarding.backButton")}
                </button>
                <button className="btn btn-primary ob-btn-next" onClick={handleNext}>
                  {t("onboarding.continueButton")}
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              Step 4 – Avatar
          ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="ob-section">
              <h2 className="ob-title">{t("onboarding.photoTitle")}</h2>
              <p className="ob-subtitle">
                {t("onboarding.photoSubtitle").replace("{count}", String(MAX_EXTRA_PROFILE_PHOTOS))}
              </p>
              <p className="ob-why">{stepExplanations[4]}</p>

              <div className="ob-avatar-preview">
                {safeMainPhotoPreview ? (
                  <img
                    src={safeMainPhotoPreview}
                    alt={t("onboarding.mainPhotoAlt")}
                    className="ob-avatar-img"
                    onError={() => { setMainPhotoFile(null); setMainPhotoPreview(""); }}
                  />
                ) : (
                  <div className="ob-avatar-placeholder">
                    {name ? name[0].toUpperCase() : "?"}
                  </div>
                )}
              </div>
              <div className="ob-main-label">{t("onboarding.mainPhotoLabel")}</div>

              {safeMainPhotoPreview && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem" }}>
                  <button type="button" className="btn ob-btn-back" onClick={handleRemoveMainPhoto} disabled={loading}>
                    {t("onboarding.removeMainPhoto")}
                  </button>
                </div>
              )}

              <div className="ob-photo-grid" role="region" aria-label={t("onboarding.extraPhotosAria")}>
                  {visibleExtraPhotoFiles.map((photo) => (
                    <div key={photo.id} className="ob-photo-item">
                      <img src={photo.safePreview} alt={t("onboarding.extraPhotoAlt")} className="ob-photo-item-img" />
                      <div className="ob-photo-item-actions">
                        <button type="button" className="btn ob-btn-back ob-btn-photo" onClick={() => handleMakeMainPhoto(photo.id)} disabled={loading}>
                          {t("onboarding.makeMainPhoto")}
                        </button>
                        <button type="button" className="btn ob-btn-back ob-btn-photo" onClick={() => handleRemoveExtraPhoto(photo.id)} disabled={loading}>
                          {t("onboarding.removePhoto")}
                        </button>
                      </div>
                    </div>
                  ))}
                  {Array.from({ length: emptyExtraPhotoSlots }).map((_, index) => (
                    <button
                      key={`empty-photo-slot-${index}`}
                      type="button"
                      className="ob-photo-item ob-photo-empty-slot"
                      onClick={() => addPhotosInputRef.current?.click()}
                      disabled={loading || selectedPhotoCount >= MAX_PROFILE_PHOTOS}
                      aria-label={t("onboarding.addPhotoAria")}
                    >
                      <span>+</span>
                    </button>
                  ))}
                </div>

              <div className="ob-field">
                <label className="ob-label">{t("onboarding.addPhotosLabel")}</label>
                <button
                  type="button"
                  className="ob-upload-btn"
                  onClick={() => addPhotosInputRef.current?.click()}
                  disabled={loading || selectedPhotoCount >= MAX_PROFILE_PHOTOS}
                >
                  {t("onboarding.addPhotos")}
                </button>
                <input
                  ref={addPhotosInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: "none" }}
                  disabled={loading || selectedPhotoCount >= MAX_PROFILE_PHOTOS}
                  onChange={(e) => {
                    handleAddPhotoFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <span className="ob-hint">
                  {t("onboarding.photoLimitHint")
                    .replace("{count}", String(MAX_PROFILE_PHOTOS))
                    .replace("{size}", AVATAR_UPLOAD_MAX_LABEL)}
                </span>
              </div>

              {/* Coin / Creator destination hook */}
              {selectedPath && (
                <div className="ob-destination-hint">
                  {t("onboarding.feedDestinationHint")}
                </div>
              )}

              {/* Confidence room hint */}
              <div className="ob-confidence-hint">
                {t("onboarding.confidenceHint")}
              </div>

              <div className="ob-actions ob-actions-row">
                <button className="btn ob-btn-back" onClick={() => goToStep(3)}>
                  {t("onboarding.backButton")}
                </button>
                <button
                  className="btn btn-primary ob-btn-next"
                  onClick={finish}
                  disabled={loading}
                >
                  {loading ? t("onboarding.savingButton") : t("onboarding.finishButton")}
                </button>
              </div>
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
          flex-wrap: wrap;
          padding-top: 1.5rem;
        }
        .ob-progress-summary {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          text-align: center;
          color: var(--text);
          font-size: 0.78rem;
          font-weight: 800;
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
        .ob-completion-percent {
          margin-top: 0.9rem;
          text-align: center;
          font-size: 0.78rem;
        }
        .ob-completion-label {
          color: var(--text-muted);
        }
        .ob-completion-value {
          font-weight: 700;
          color: var(--grad-primary, #e040fb);
          background: linear-gradient(90deg, #e040fb, #7c3aed);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ob-min-hint {
          color: var(--text-muted);
          font-size: 0.82em;
          margin-left: 0.25rem;
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
          margin-bottom: 0.75rem;
        }
        .ob-why {
          margin: 0 0 1.5rem;
          padding: 0.75rem 0.9rem;
          border: 1px solid rgba(34,211,238,0.18);
          border-radius: var(--radius-sm);
          background: rgba(34,211,238,0.07);
          color: #dff7ff;
          font-size: 0.82rem;
          line-height: 1.45;
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
        .ob-legal-hint :global(a) { color: var(--accent-3); text-decoration: none; font-weight: 800; }
        .ob-legal-hint :global(a):hover { text-decoration: underline; }

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
        .ob-photo-empty-slot {
          min-height: 126px;
          border-style: dashed;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }
        .ob-photo-empty-slot:disabled {
          opacity: 0.45;
          cursor: not-allowed;
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
        .ob-upload-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ob-upload-btn:disabled:hover {
          border-color: rgba(224,64,251,0.4);
          color: var(--text-muted);
          background: rgba(224,64,251,0.06);
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
          .onboarding-root { align-items: flex-start; padding: 0.75rem; }
          .onboarding-card { padding: 1.35rem 1rem; border-radius: 22px; }
          .ob-row { flex-direction: column; }
          .ob-hero-title { font-size: 1.55rem; }
          .ob-photo-item-actions { flex-direction: row; flex-wrap: wrap; }
          .ob-progress { gap: 0.35rem 0; margin-bottom: 1.6rem; }
          .ob-step { justify-content: center; }
          .ob-step-label { display: none; }
          .ob-btn-next,
          .ob-btn-back,
          .ob-upload-btn,
          .ob-interest-pill,
          .ob-path-card {
            min-height: 48px;
          }
          .ob-actions-row { flex-direction: column-reverse; }
        }
      `}</style>
    </div>
  );
}
