"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { clearToken, getToken, setToken } from "@/lib/token";
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
const MAX_PROFILE_PHOTOS = 6;
const MAX_SECONDARY_PHOTOS = 5;
const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_AVATAR_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

const hasAllowedAvatarExtension = (filename = "") => {
  const normalized = filename.trim().toLowerCase();
  return ALLOWED_AVATAR_EXTENSIONS.some((ext) => normalized.endsWith(ext));
};

const toProfileImageObjects = (photos) =>
  photos.slice(0, MAX_PROFILE_PHOTOS).map((url, index) => ({
    url,
    isPrimary: index === 0,
  }));

const normalizePhotoUrls = (userOrImages = {}) =>
  normalizeUserImages(userOrImages)
    .map((image) => normalizeImageUrl(image?.url || image))
    .filter(Boolean)
    .slice(0, MAX_PROFILE_PHOTOS);

const buildUploadEndpoint = ({ setAsMain = true } = {}) => {
  if (typeof API_URL !== "string" || !API_URL.trim()) return "";
  const base = `${API_URL.replace(/\/+$/, "")}/api/user/me/avatar-upload`;
  return setAsMain ? base : `${base}?setAsMain=0`;
};

const parseJsonBody = async (res) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

export default function ProfilePhotoGallery({ user, draft, initial, t, onUserChange }) {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const photos = useMemo(() => normalizePhotoUrls(draft || user), [draft, user]);
  const primaryPhoto = photos[0] || "";
  const secondaryPhotos = photos.slice(1, MAX_PROFILE_PHOTOS);
  const emptySlots = Math.max(0, MAX_SECONDARY_PHOTOS - secondaryPhotos.length);
  const canAddPhotos = !working && photos.length < MAX_PROFILE_PHOTOS;

  const getAuthToken = () => {
    const storedToken = getToken();
    if (storedToken) return storedToken;
    if (session?.backendToken) {
      setToken(session.backendToken);
      return session.backendToken;
    }
    return "";
  };

  const refreshProfileSession = async (nextUser) => {
    try {
      if (typeof updateSession === "function") {
        await updateSession({
          user: {
            name: nextUser.name || nextUser.username || session?.user?.name || "",
            image: nextUser.avatar || session?.user?.image || "",
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
  };

  const applyPhotoPayload = async (payload, message) => {
    const payloadUser = payload?.user || payload || {};
    const nextPhotos = normalizePhotoUrls(payloadUser).length
      ? normalizePhotoUrls(payloadUser)
      : normalizePhotoUrls(payload);
    const nextUser = {
      ...(user || {}),
      ...payloadUser,
      avatar: nextPhotos[0] || "",
      profilePhotos: nextPhotos,
      images: toProfileImageObjects(nextPhotos),
      onboardingComplete: payloadUser.onboardingComplete ?? payload?.onboardingComplete ?? user?.onboardingComplete,
      canAppearInFeed: payloadUser.canAppearInFeed ?? payload?.canAppearInFeed ?? user?.canAppearInFeed,
      profileStatus: payloadUser.profileStatus ?? payload?.profileStatus ?? user?.profileStatus,
    };
    onUserChange(nextUser);
    await refreshProfileSession(nextUser);
    setSuccess(message);
    return nextUser;
  };

  const handleUnauthorized = () => {
    clearToken();
    router.replace("/login?callbackUrl=/profile");
  };

  const validateAvatarFile = (file) => {
    if (!file) return t("profile.photoSelectValid");
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) return t("profile.photoInvalidType");
    if (!hasAllowedAvatarExtension(file.name)) return t("profile.photoInvalidName");
    return "";
  };

  const uploadPhotoFile = async (file, { setAsMain }) => {
    const fileError = validateAvatarFile(file);
    if (fileError) return { ok: false, error: fileError };

    const token = getAuthToken();
    if (!token) return { ok: false, unauthorized: true, error: t("profile.photoSessionExpired") };

    const uploadEndpoint = buildUploadEndpoint({ setAsMain });
    if (!uploadEndpoint) return { ok: false, error: t("profile.photoUploadConfigMissing") };

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

    const res = await fetch(uploadEndpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
      cache: "no-store",
    });
    const data = await parseJsonBody(res);

    if (!res.ok) {
      const diagnostic = getAvatarUploadDiagnostic(res.status, data, t("profile.photoUploadError"));
      return { ok: false, unauthorized: res.status === 401, error: formatAvatarUploadDiagnostic(diagnostic) };
    }

    return { ok: true, data };
  };

  const persistReorder = async (nextPhotos, message) => {
    const token = getAuthToken();
    if (!token) {
      setError(t("profile.photoSessionExpired"));
      return;
    }

    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/user/me/photos/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ images: nextPhotos }),
        cache: "no-store",
      });
      const data = await parseJsonBody(res);
      if (!res.ok) {
        if (res.status === 401) handleUnauthorized();
        setError(data?.message || t("profile.photoSaveError"));
        return;
      }
      await applyPhotoPayload(data, message);
    } catch {
      setError(t("profile.photoNetworkError"));
    } finally {
      setWorking(false);
    }
  };

  const handleAddPhotos = async (filesList) => {
    const selectedFiles = Array.from(filesList || []).slice(0, MAX_PROFILE_PHOTOS - photos.length);
    if (!selectedFiles.length) return;

    setWorking(true);
    setError("");
    setSuccess("");
    let uploadedCount = 0;
    let currentPhotos = photos;

    try {
      for (const file of selectedFiles) {
        const uploadResult = await uploadPhotoFile(file, { setAsMain: currentPhotos.length === 0 });
        if (!uploadResult.ok) {
          if (uploadResult.unauthorized) {
            handleUnauthorized();
            return;
          }
          setError(uploadResult.error || t("profile.photoUploadOneError"));
          continue;
        }
        uploadedCount += 1;
        const nextUser = await applyPhotoPayload(uploadResult.data, "");
        currentPhotos = normalizePhotoUrls(nextUser);
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

  const handleMakeMain = (photoUrl) => {
    if (!photos.includes(photoUrl) || photoUrl === primaryPhoto) return;
    persistReorder([photoUrl, ...photos.filter((photo) => photo !== photoUrl)], t("profile.mainPhotoUpdated"));
  };

  const handleDelete = async (photoUrl) => {
    const token = getAuthToken();
    if (!token) {
      setError(t("profile.photoSessionExpired"));
      return;
    }

    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/user/me/photos/${encodeURIComponent(photoUrl)}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const data = await parseJsonBody(res);
      if (!res.ok) {
        if (res.status === 401) handleUnauthorized();
        setError(data?.message || t("profile.photoDeleteError"));
        return;
      }
      await applyPhotoPayload(data, t("profile.photoDeleted"));
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
        {primaryPhoto ? (
          <Image
            src={primaryPhoto}
            alt={t("profile.primaryPhotoAlt")}
            width={360}
            height={360}
            className="profile-main-photo-image"
            unoptimized
          />
        ) : (
          <div className="profile-main-photo-placeholder">{initial}</div>
        )}
        <div className="profile-main-photo-label">{t("profile.primaryPhotoLabel")}</div>
        {primaryPhoto && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleDelete(primaryPhoto)} disabled={working}>
            {t("profile.deletePhoto")}
          </button>
        )}
      </div>

      <div className="profile-photo-grid" role="region" aria-label={t("profile.secondaryPhotosAria")}>
        {secondaryPhotos.map((photo) => (
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
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleMakeMain(photo)} disabled={working}>
                {t("profile.makePrimary")}
              </button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleDelete(photo)} disabled={working}>
                {t("profile.deletePhoto")}
              </button>
            </div>
          </div>
        ))}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <div key={`empty-slot-${index}`} className="profile-photo-thumb profile-photo-empty-slot">
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
          style={{ display: "none" }}
          disabled={!canAddPhotos}
          onChange={(e) => {
            handleAddPhotos(e.target.files);
            e.target.value = "";
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

        .profile-gallery-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          text-align: center;
        }

        .profile-gallery-success {
          background: var(--success-bg);
          border: 1px solid rgba(52,211,153,0.35);
          color: var(--success);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
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
          width: min(100%, 360px);
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

        .profile-upload-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .profile-upload-btn:hover:not(:disabled) {
          border-color: rgba(224,64,251,0.7);
          color: var(--text);
          background: rgba(224,64,251,0.1);
        }

        .profile-photo-hint {
          font-size: 0.72rem;
          color: var(--text-dim);
        }
      `}</style>
    </div>
  );
}
