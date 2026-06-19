"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getToken, setToken } from "@/lib/token";
import { normalizeImageUrl, normalizeUserImages } from "@/lib/imageHelpers";
import {
  AVATAR_TOO_LARGE_MESSAGE,
  AVATAR_UPLOAD_MAX_BYTES,
  AVATAR_UPLOAD_MAX_LABEL,
  compressAvatarImage,
  formatAvatarUploadDiagnostic,
  getAvatarUploadDiagnostic,
} from "@/lib/avatarUpload";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_BASE_URL = typeof API_URL === "string" ? API_URL.replace(/\/+$/, "") : "";
const MAX_PROFILE_PHOTOS = 6;
const MAX_SECONDARY_PHOTOS = 5;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

const hasAllowedImageExtension = (filename = "") => {
  const normalized = filename.trim().toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
};

const toImageObjects = (photos) =>
  photos.slice(0, MAX_PROFILE_PHOTOS).map((url, index) => ({
    url,
    isPrimary: index === 0,
  }));

const normalizePhotos = (userOrImages = {}) =>
  normalizeUserImages(userOrImages)
    .map((image) => normalizeImageUrl(image?.url || image))
    .filter(Boolean)
    .slice(0, MAX_PROFILE_PHOTOS);

const parseJsonBody = async (res) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const buildUploadEndpoint = (setAsMain) => {
  if (!API_BASE_URL) return "";
  const base = `${API_BASE_URL}/api/user/me/avatar-upload`;
  return setAsMain ? base : `${base}?setAsMain=0`;
};

export default function SimpleProfilePhotoGallery({ user, initial, t, onUserChange }) {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [images, setImages] = useState(() => normalizePhotos(user));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setImages(normalizePhotos(user));
  }, [user?.avatar, user?.profilePhotos, user?.images]);

  const primaryImage = images[0] || "";
  const secondaryImages = images.slice(1, MAX_PROFILE_PHOTOS);
  const emptySlots = useMemo(
    () => Array.from({ length: Math.max(0, MAX_SECONDARY_PHOTOS - secondaryImages.length) }),
    [secondaryImages.length]
  );
  const canAddPhotos = !working && images.length < MAX_PROFILE_PHOTOS;

  const getAndCacheAuthToken = () => {
    const storedToken = getToken();
    if (storedToken) return storedToken;
    if (session?.backendToken) {
      setToken(session.backendToken);
      return session.backendToken;
    }
    return "";
  };

  const updateProfileState = async (payload, fallbackPhotos, message) => {
    const payloadUser = payload?.user || payload || {};
    const payloadUserImages = normalizePhotos(payloadUser);
    const payloadImages = normalizePhotos(payload);
    const nextImages = payloadUserImages.length
      ? payloadUserImages
      : payloadImages.length
        ? payloadImages
        : fallbackPhotos.slice(0, MAX_PROFILE_PHOTOS);
    const nextUser = {
      ...(user || {}),
      ...payloadUser,
      avatar: nextImages[0] || "",
      profilePhotos: nextImages,
      images: toImageObjects(nextImages),
      onboardingComplete: payloadUser.onboardingComplete ?? payload?.onboardingComplete ?? user?.onboardingComplete,
      canAppearInFeed: payloadUser.canAppearInFeed ?? payload?.canAppearInFeed ?? user?.canAppearInFeed,
      profileStatus: payloadUser.profileStatus ?? payload?.profileStatus ?? user?.profileStatus,
    };

    setImages(nextImages);
    onUserChange?.(nextUser);

    try {
      if (typeof updateSession === "function") {
        await updateSession({
          user: {
            name: nextUser.name || nextUser.username || session?.user?.name || "",
            image: nextImages[0] || session?.user?.image || "",
          },
          onboardingComplete: nextUser.onboardingComplete === true,
          canAppearInFeed: nextUser.canAppearInFeed === true,
          profileStatus: nextUser.profileStatus || null,
        });
      }
      router.refresh();
    } catch (err) {
      console.error("[profile-gallery] failed to refresh session:", err);
    }

    if (message) setSuccess(message);
    return nextUser;
  };

  const validateFile = (file) => {
    if (!file) return t("profile.photoSelectValid");
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return t("profile.photoInvalidType");
    if (!hasAllowedImageExtension(file.name)) return t("profile.photoInvalidName");
    return "";
  };

  const uploadPhoto = async (file, setAsMain) => {
    const fileError = validateFile(file);
    if (fileError) return { ok: false, error: fileError };

    const token = getAndCacheAuthToken();
    if (!token) return { ok: false, error: t("profile.photoSessionExpired") };

    const endpoint = buildUploadEndpoint(setAsMain);
    if (!endpoint) return { ok: false, error: t("profile.photoUploadConfigMissing") };

    const uploadFile = await compressAvatarImage(file);
    if (uploadFile.size > AVATAR_UPLOAD_MAX_BYTES) {
      const diagnostic = getAvatarUploadDiagnostic(413, {
        error: "File too large",
        message: AVATAR_TOO_LARGE_MESSAGE,
        code: "FILE_TOO_LARGE",
      });
      return { ok: false, error: formatAvatarUploadDiagnostic(diagnostic) };
    }

    const formData = new FormData();
    formData.append("avatar", uploadFile);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
      cache: "no-store",
    });
    const data = await parseJsonBody(res);
    if (!res.ok) {
      const diagnostic = getAvatarUploadDiagnostic(res.status, data, t("profile.photoUploadError"));
      return { ok: false, error: formatAvatarUploadDiagnostic(diagnostic) };
    }
    return { ok: true, data };
  };

  const handleAddPhotos = async (filesList) => {
    const selectedFiles = Array.from(filesList || []).slice(0, MAX_PROFILE_PHOTOS - images.length);
    if (!selectedFiles.length) return;

    setWorking(true);
    setError("");
    setSuccess("");
    let currentImages = images;
    let uploadedCount = 0;

    try {
      for (const file of selectedFiles) {
        const result = await uploadPhoto(file, currentImages.length === 0);
        if (!result.ok) {
          setError(result.error || t("profile.photoUploadOneError"));
          break;
        }

        uploadedCount += 1;
        const nextUser = await updateProfileState(result.data, currentImages, "");
        currentImages = normalizePhotos(nextUser);
      }

      if (uploadedCount > 0) {
        setSuccess(uploadedCount === 1 ? t("profile.photoAdded") : t("profile.photosAdded"));
      }
    } catch {
      setError(t("profile.photoUploadMultipleError"));
    } finally {
      setWorking(false);
    }
  };

  const persistImages = async (nextImages, message) => {
    const token = getAndCacheAuthToken();
    if (!token) {
      setError(t("profile.photoSessionExpired"));
      return;
    }
    if (!API_BASE_URL) {
      setError(t("profile.photoUploadConfigMissing"));
      return;
    }

    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/user/me/photos/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ images: nextImages }),
        cache: "no-store",
      });
      const data = await parseJsonBody(res);
      if (!res.ok) {
        setError(data?.message || t("profile.photoSaveError"));
        return;
      }
      await updateProfileState(data, nextImages, message);
    } catch {
      setError(t("profile.photoNetworkError"));
    } finally {
      setWorking(false);
    }
  };

  const handleMakePrimary = (photoUrl) => {
    if (!photoUrl || photoUrl === primaryImage) return;
    persistImages([photoUrl, ...images.filter((image) => image !== photoUrl)], t("profile.mainPhotoUpdated"));
  };

  const handleDelete = async (photoUrl) => {
    const token = getAndCacheAuthToken();
    if (!token) {
      setError(t("profile.photoSessionExpired"));
      return;
    }
    if (!API_BASE_URL) {
      setError(t("profile.photoUploadConfigMissing"));
      return;
    }

    const fallbackImages = images.filter((image) => image !== photoUrl);
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/user/me/photos/${encodeURIComponent(photoUrl)}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const data = await parseJsonBody(res);
      if (!res.ok) {
        setError(data?.message || t("profile.photoDeleteError"));
        return;
      }
      await updateProfileState(data, fallbackImages, t("profile.photoDeleted"));
    } catch {
      setError(t("profile.photoNetworkError"));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="profile-photo-manager">
      {error && <div className="profile-gallery-error">{error}</div>}
      {success && <div className="profile-gallery-success">{success}</div>}

      <div className="profile-main-photo-card">
        {primaryImage ? (
          <Image
            src={primaryImage}
            alt={t("profile.primaryPhotoAlt")}
            width={420}
            height={420}
            className="profile-main-photo-image"
            unoptimized
          />
        ) : (
          <div className="profile-main-photo-placeholder">{initial}</div>
        )}
        <div className="profile-main-photo-label">{t("profile.primaryPhotoLabel")}</div>
        {primaryImage && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleDelete(primaryImage)} disabled={working}>
            {t("profile.deletePhoto")}
          </button>
        )}
      </div>

      <div className="profile-photo-grid" role="region" aria-label={t("profile.secondaryPhotosAria")}>
        {secondaryImages.map((photo) => (
          <div key={photo} className="profile-photo-thumb">
            <Image
              src={photo}
              alt={t("profile.secondaryPhotoAlt")}
              width={140}
              height={140}
              className="profile-photo-thumb-img"
              unoptimized
            />
            <div className="profile-photo-thumb-actions">
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleMakePrimary(photo)} disabled={working}>
                {t("profile.makePrimary")}
              </button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleDelete(photo)} disabled={working}>
                {t("profile.deletePhoto")}
              </button>
            </div>
          </div>
        ))}
        {emptySlots.map((_, index) => (
          <div key={`empty-slot-${index}`} className="profile-photo-thumb profile-photo-empty-slot" aria-label={t("profile.emptyPhotoSlot")}>
            <span>+</span>
          </div>
        ))}
      </div>

      <div className="profile-photo-actions">
        <button
          type="button"
          className="profile-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canAddPhotos}
        >
          {working ? t("profile.uploadingPhotos") : t("profile.addPhotos")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          disabled={!canAddPhotos}
          onChange={(event) => {
            handleAddPhotos(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <span className="profile-photo-hint">
        {t("profile.photoHint")} {AVATAR_UPLOAD_MAX_LABEL}
      </span>

      <style jsx>{`
        .profile-photo-manager {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .profile-gallery-error,
        .profile-gallery-success {
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .profile-gallery-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
        }

        .profile-gallery-success {
          background: var(--success-bg);
          border: 1px solid rgba(52,211,153,0.35);
          color: var(--success);
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
          width: min(100%, 420px);
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

        .profile-photo-empty-slot {
          min-height: 130px;
          align-items: center;
          justify-content: center;
          border-style: dashed;
          color: var(--text-muted);
          font-size: 1.5rem;
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

        .profile-upload-btn:hover:not(:disabled) {
          border-color: rgba(224,64,251,0.7);
          color: var(--text);
          background: rgba(224,64,251,0.1);
        }

        .profile-upload-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .profile-photo-hint {
          font-size: 0.72rem;
          color: var(--text-dim);
        }
      `}</style>
    </div>
  );
}
