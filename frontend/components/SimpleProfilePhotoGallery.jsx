"use client";

import { useEffect, useRef, useState } from "react";
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
const PHOTO_SIGNATURE_SEPARATOR = "\u0000";
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

/**
 * Renders an image only after it loads; broken or pending images show the
 * provided placeholder, and action children only receive a valid loaded state.
 */
function PhotoWithFallback({ src, alt, className, placeholder, onBroken, children, showSrcDebug = false }) {
  const [status, setStatus] = useState(src ? "loading" : "empty");

  useEffect(() => {
    setStatus(src ? "loading" : "empty");
  }, [src]);

  const isLoaded = status === "loaded";
  const isBroken = status === "broken";

  return (
    <>
      {src && !isBroken && (
        <img
          src={src}
          alt={alt}
          className={className}
          style={isLoaded ? undefined : { display: "none" }}
          onLoad={() => setStatus("loaded")}
          onError={() => {
            setStatus("broken");
            onBroken?.(src);
          }}
        />
      )}
      {(!src || !isLoaded || isBroken) && placeholder}
      {showSrcDebug && src && <code className="profile-photo-src-debug">{src}</code>}
      {typeof children === "function" ? children(isLoaded && !isBroken) : null}
    </>
  );
}

const buildUploadEndpoint = (setAsMain) => {
  if (!API_BASE_URL) return "";
  const base = `${API_BASE_URL}/api/user/me/avatar-upload`;
  return setAsMain ? base : `${base}?setAsMain=0`;
};

export default function SimpleProfilePhotoGallery({ user, initial, t, onUserChange, showSrcDebug = false }) {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const fileInputRef = useRef(null);
  const userPhotos = normalizePhotos(user);
  const [images, setImages] = useState(userPhotos);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [brokenImages, setBrokenImages] = useState(() => new Set());
  const userPhotoSignature = userPhotos.join(PHOTO_SIGNATURE_SEPARATOR);

  useEffect(() => {
    setImages(userPhotoSignature ? userPhotoSignature.split(PHOTO_SIGNATURE_SEPARATOR) : []);
    setBrokenImages(new Set());
  }, [userPhotoSignature]);

  const primaryImage = images[0] || "";
  const secondaryImages = images.slice(1, MAX_PROFILE_PHOTOS);
  const visibleImageCount = images.filter((image) => !brokenImages.has(image)).length;
  const brokenSecondaryCount = secondaryImages.filter((image) => brokenImages.has(image)).length;
  const emptySlots = Array.from({ length: Math.max(0, MAX_SECONDARY_PHOTOS - secondaryImages.length + brokenSecondaryCount) });
  const canAddPhotos = !working && visibleImageCount < MAX_PROFILE_PHOTOS;

  const handleBrokenImage = (photoUrl) => {
    if (!photoUrl) return;
    setBrokenImages((current) => {
      if (current.has(photoUrl)) return current;
      const next = new Set(current);
      next.add(photoUrl);
      return next;
    });
  };

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
            image: nextImages[0] || "",
            avatar: nextImages[0] || "",
            profilePhotos: nextImages,
            images: toImageObjects(nextImages),
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
    const selectedFiles = Array.from(filesList || []).slice(0, MAX_PROFILE_PHOTOS - visibleImageCount);
    if (!selectedFiles.length) return;

    setWorking(true);
    setError("");
    setSuccess("");
    let currentImages = images.filter((image) => !brokenImages.has(image));
    let uploadedCount = 0;
    let firstUploadError = "";

    try {
      for (const file of selectedFiles) {
        // currentImages tracks this batch, so only the first upload into an empty gallery becomes primary.
        const result = await uploadPhoto(file, currentImages.length === 0);
        if (!result.ok) {
          if (!firstUploadError) firstUploadError = result.error || t("profile.photoUploadOneError");
          continue;
        }

        uploadedCount += 1;
        const nextUser = await updateProfileState(result.data, currentImages, "");
        currentImages = normalizePhotos(nextUser);
      }

      if (uploadedCount > 0) {
        setSuccess(uploadedCount === 1 ? t("profile.photoAdded") : t("profile.photosAdded"));
      }
      if (firstUploadError) setError(firstUploadError);
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
      <div className="profile-photo-manager-head">
        <div>
          <span className="profile-photo-kicker">{t("profile.primaryPhotoLabel")}</span>
          <h3>{t("profile.galleryTitle")}</h3>
        </div>
        <span className="profile-photo-counter">{visibleImageCount}/{MAX_PROFILE_PHOTOS}</span>
      </div>
      {error && <div className="profile-gallery-error">{error}</div>}
      {success && <div className="profile-gallery-success">{success}</div>}

      <div className="profile-main-photo-card">
        {primaryImage ? (
          <PhotoWithFallback
            src={primaryImage}
            alt={t("profile.primaryPhotoAlt")}
            className="profile-main-photo-image"
            onBroken={handleBrokenImage}
            showSrcDebug={showSrcDebug}
            placeholder={<div className="profile-main-photo-placeholder">{initial}</div>}
          >
            {(isValidPhoto) =>
              isValidPhoto && (
                <button type="button" className="btn btn-secondary btn-xs profile-main-photo-action" onClick={() => handleDelete(primaryImage)} disabled={working}>
                  {t("profile.deletePhoto")}
                </button>
              )
            }
          </PhotoWithFallback>
        ) : (
          <div className="profile-main-photo-placeholder">{initial}</div>
        )}
        <div className="profile-main-photo-label">{t("profile.primaryPhotoLabel")}</div>
      </div>

      <div className="profile-photo-grid" role="region" aria-label={t("profile.secondaryPhotosAria")}>
        {secondaryImages.map((photo) => (
          <div key={photo} className="profile-photo-thumb">
            <PhotoWithFallback
              src={photo}
              alt={t("profile.secondaryPhotoAlt")}
              className="profile-photo-thumb-img"
              onBroken={handleBrokenImage}
              showSrcDebug={showSrcDebug}
              placeholder={<div className="profile-photo-thumb-placeholder">+</div>}
            >
              {(isValidPhoto) =>
                isValidPhoto && (
                  <div className="profile-photo-thumb-actions">
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleMakePrimary(photo)} disabled={working}>
                      {t("profile.makePrimary")}
                    </button>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => handleDelete(photo)} disabled={working}>
                      {t("profile.deletePhoto")}
                    </button>
                  </div>
                )
              }
            </PhotoWithFallback>
          </div>
        ))}
        {emptySlots.map((_, index) => (
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
          gap: 0.85rem;
          padding: 0.9rem;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.08);
          background:
            radial-gradient(circle at 8% 0%, rgba(255,79,163,0.11), transparent 34%),
            radial-gradient(circle at 100% 12%, rgba(34,211,238,0.1), transparent 30%),
            rgba(255,255,255,0.025);
        }

        .profile-photo-manager-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 0.95rem;
          border-radius: 20px;
          border: 1px solid rgba(236,124,255,0.24);
          background:
            linear-gradient(135deg, rgba(224,64,251,0.16), rgba(34,211,238,0.08)),
            rgba(255,255,255,0.04);
          box-shadow: 0 14px 30px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .profile-photo-manager-head h3 {
          margin: 0.1rem 0 0;
          color: var(--text);
          font-size: 1rem;
          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .profile-photo-kicker {
          color: #f0abfc;
          font-size: 0.66rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .profile-photo-counter {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 3rem;
          min-height: 2rem;
          padding: 0.25rem 0.7rem;
          border-radius: 999px;
          color: var(--text);
          font-size: 0.78rem;
          font-weight: 900;
          border: 1px solid rgba(224,64,251,0.34);
          background: rgba(224,64,251,0.12);
          box-shadow: 0 0 20px rgba(224,64,251,0.16);
        }

        .profile-gallery-error,
        .profile-gallery-success {
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          box-shadow: var(--shadow-sm);
          backdrop-filter: blur(14px);
        }

        .profile-gallery-error {
          background: linear-gradient(135deg, rgba(248,113,113,0.14), rgba(15,8,32,0.76));
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
        }

        .profile-gallery-success {
          background: linear-gradient(135deg, rgba(52,211,153,0.14), rgba(15,8,32,0.76));
          border: 1px solid rgba(52,211,153,0.35);
          color: var(--success);
        }

        .profile-main-photo-card {
          position: relative;
          overflow: hidden;
          width: 100%;
          padding: 0.85rem;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.08), transparent 30%),
            radial-gradient(circle at 16% 0%, rgba(224,64,251,0.18), transparent 34%),
            radial-gradient(circle at 88% 16%, rgba(251,191,36,0.1), transparent 30%),
            rgba(255,255,255,0.045);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.65rem;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .profile-main-photo-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 24% 8%, rgba(255,79,163,0.18), transparent 36%),
            radial-gradient(circle at 100% 0%, rgba(34,211,238,0.12), transparent 34%);
          pointer-events: none;
        }

        .profile-main-photo-image,
        .profile-main-photo-placeholder {
          position: relative;
          width: min(100%, 360px);
          aspect-ratio: 1 / 1;
          border-radius: 999px;
          box-shadow: 0 18px 38px rgba(0,0,0,0.34), 0 0 0 8px rgba(255,255,255,0.045);
        }

        .profile-main-photo-image {
          object-fit: cover;
          border: 3px solid rgba(255,255,255,0.16);
        }

        .profile-main-photo-placeholder {
          background:
            radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 30%),
            var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 3rem;
          font-weight: 800;
        }

        .profile-main-photo-label {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          color: var(--accent);
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 0.3rem 0.8rem;
          border-radius: 999px;
          border: 1px solid rgba(224,64,251,0.28);
          background: rgba(224,64,251,0.1);
        }

        .profile-main-photo-action {
          position: absolute;
          right: 1.3rem;
          bottom: 1.3rem;
          z-index: 2;
          backdrop-filter: blur(14px);
        }

        .profile-photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
          gap: 0.7rem;
        }

        .profile-photo-thumb {
          background:
            linear-gradient(145deg, rgba(255,255,255,0.06), transparent 42%),
            rgba(255,255,255,0.035);
          border: 1px solid rgba(236,124,255,0.16);
          border-radius: 20px;
          padding: 0.45rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          box-shadow: 0 10px 22px rgba(0,0,0,0.18);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .profile-photo-thumb:hover {
          transform: translateY(-2px);
          border-color: rgba(224,64,251,0.32);
          box-shadow: 0 14px 28px rgba(0,0,0,0.24), 0 0 18px rgba(224,64,251,0.12);
        }

        .profile-photo-thumb-img,
        .profile-photo-thumb-placeholder {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 16px;
        }

        .profile-photo-thumb-img {
          object-fit: cover;
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .profile-photo-thumb-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px dashed rgba(236,124,255,0.28);
          background:
            linear-gradient(135deg, rgba(224,64,251,0.08), rgba(34,211,238,0.05)),
            rgba(255,255,255,0.025);
          color: var(--text-muted);
          font-size: 1.5rem;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        }

        .profile-photo-src-debug {
          width: 100%;
          display: block;
          overflow-wrap: anywhere;
          color: var(--text-muted);
          font-size: 0.65rem;
          line-height: 1.35;
        }

        .profile-photo-thumb-actions {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .profile-photo-thumb-actions :global(.btn) {
          width: 100%;
          border-radius: 999px;
          padding-inline: 0.55rem;
        }

        .profile-photo-empty-slot {
          min-height: 136px;
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
          padding-top: 0.15rem;
        }

        .profile-upload-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 44px;
          padding: 0.68rem 1.15rem;
          border-radius: 999px;
          border: 1px solid rgba(224,64,251,0.48);
          background: linear-gradient(135deg, rgba(255,45,120,0.22), rgba(224,64,251,0.18), rgba(34,211,238,0.08));
          color: var(--text);
          font-size: 0.86rem;
          font-weight: 850;
          cursor: pointer;
          transition: all 0.18s;
          box-shadow: 0 12px 26px rgba(0,0,0,0.22);
        }

        .profile-upload-btn:hover:not(:disabled) {
          border-color: rgba(224,64,251,0.7);
          color: var(--text);
          background: linear-gradient(135deg, rgba(224,64,251,0.26), rgba(34,211,238,0.12));
          transform: translateY(-1px);
          box-shadow: var(--glow-pink), 0 16px 30px rgba(0,0,0,0.26);
        }

        .profile-upload-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .profile-photo-hint {
          font-size: 0.72rem;
          color: var(--text-dim);
          line-height: 1.45;
        }

        @media (max-width: 640px) {
          .profile-main-photo-image,
          .profile-main-photo-placeholder {
            width: min(100%, 300px);
            aspect-ratio: 1 / 1;
            max-height: 300px;
          }

          .profile-photo-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .profile-upload-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
