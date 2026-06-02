"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getDisplayName, getUserImage, normalizeImageUrl } from "@/lib/imageHelpers";
import { getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getProfilePhotos(profile) {
  if (!profile) return [];
  const rawPhotos = [
    ...(Array.isArray(profile.profilePhotos) ? profile.profilePhotos : []),
    ...(Array.isArray(profile.photos) ? profile.photos : []),
    profile.avatar,
    profile.profileImage,
    profile.photo,
    getUserImage(profile),
  ];
  return Array.from(new Set(rawPhotos.map(normalizeImageUrl).filter(Boolean)));
}

export default function PublicProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const profileId = typeof id === "string" && id !== "undefined" && id !== "null" ? id : "";
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [likeStatus, setLikeStatus] = useState("");
  const [liking, setLiking] = useState(false);
  const [brokenPhotos, setBrokenPhotos] = useState(() => new Set());

  useEffect(() => {
    if (!profileId || !API_URL) {
      setLoading(false);
      setError("Perfil no válido.");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetch(`${API_URL}/api/user/${encodeURIComponent(profileId)}/public`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (response.status === 404) throw new Error("Perfil no encontrado.");
        if (response.status === 400) throw new Error("Perfil no válido.");
        if (!response.ok) throw new Error("No se pudo cargar el perfil.");
        return response.json();
      })
      .then((data) => {
        setProfile(data);
        setBrokenPhotos(new Set());
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "No se pudo cargar el perfil.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [profileId]);

  const photos = useMemo(
    () => getProfilePhotos(profile).filter((photo) => !brokenPhotos.has(photo)),
    [brokenPhotos, profile]
  );
  const mainPhoto = photos[0] || null;
  const displayName = getDisplayName(profile);
  const username = profile?.username ? `@${profile.username}` : "";
  const interests = Array.isArray(profile?.interests) ? profile.interests : [];
  const isLive = profile?.isLive && profile?.liveId;

  const handleLike = async () => {
    if (!profileId || liking) return;
    const token = getToken();
    if (!token) {
      router.push(`/login?callbackUrl=/profile/${encodeURIComponent(profileId)}`);
      return;
    }

    setLiking(true);
    setLikeStatus("");
    try {
      const response = await fetch(`${API_URL}/api/matches/like/${encodeURIComponent(profileId)}`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No se pudo enviar el like.");
      setLikeStatus("Like enviado.");
    } catch (err) {
      setLikeStatus(err.message || "No se pudo enviar el like.");
    } finally {
      setLiking(false);
    }
  };

  return (
    <main className="public-profile-page">
      {loading && (
        <section className="profile-state" role="status" aria-live="polite">
          <div className="profile-spinner" />
          <p>Cargando perfil…</p>
        </section>
      )}

      {!loading && error && (
        <section className="profile-state profile-state--error" aria-live="assertive">
          <h1>No pudimos abrir este perfil</h1>
          <p>{error}</p>
          <Link href="/feed" className="profile-secondary-link">Volver al feed</Link>
        </section>
      )}

      {!loading && profile && (
        <section className="profile-card">
          <div className="profile-hero">
            {mainPhoto ? (
              <img
                src={mainPhoto}
                alt={displayName}
                className="profile-main-photo"
                onError={() => {
                  setBrokenPhotos((current) => {
                    const next = new Set(current);
                    next.add(mainPhoto);
                    return next;
                  });
                }}
              />
            ) : (
              <div className="profile-photo-fallback" aria-label={displayName}>
                <svg width="74" height="74" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
            )}
            {isLive && <span className="profile-live-badge">EN VIVO</span>}
          </div>

          <div className="profile-body">
            <div className="profile-heading">
              <h1>{displayName}</h1>
              {username && <p>{username}</p>}
              {profile.location && <span>{profile.location}</span>}
            </div>

            {profile.bio && <p className="profile-bio">{profile.bio}</p>}

            {interests.length > 0 && (
              <div className="profile-tags">
                {interests.slice(0, 8).map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>
            )}

            {photos.length > 1 && (
              <div className="profile-gallery" aria-label="Fotos del perfil">
                {photos.slice(1).map((photo) => (
                  <img
                    key={photo}
                    src={photo}
                    alt={`${displayName} gallery`}
                    onError={() => {
                      setBrokenPhotos((current) => {
                        const next = new Set(current);
                        next.add(photo);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}

            <div className="profile-actions">
              <button type="button" className="profile-action profile-action--like" onClick={handleLike} disabled={liking}>
                {liking ? "Enviando…" : "Like"}
              </button>
              <Link href="/chats" className="profile-action">Chat</Link>
              {isLive ? (
                <Link href={`/live/${profile.liveId}`} className="profile-action profile-action--video">Video</Link>
              ) : (
                <Link href="/private-calls" className="profile-action profile-action--video">Video</Link>
              )}
            </div>
            {likeStatus && <p className="profile-like-status" aria-live="polite">{likeStatus}</p>}

            <Link href="/feed" className="profile-secondary-link">← Volver al feed</Link>
          </div>
        </section>
      )}

      <style jsx>{`
        .public-profile-page {
          min-height: 100vh;
          padding: 1.25rem 1rem 6rem;
          background: var(--bg, #0f0821);
          color: var(--text, #fff);
        }

        .profile-state {
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          text-align: center;
          color: var(--text-muted, #a39ec0);
        }

        .profile-state--error h1 {
          margin: 0;
          color: var(--text, #fff);
          font-size: 1.4rem;
        }

        .profile-spinner {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 3px solid rgba(224, 64, 251, 0.2);
          border-top-color: var(--accent-2, #e040fb);
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .profile-card {
          width: min(100%, 520px);
          margin: 0 auto;
          overflow: hidden;
          border: 1px solid var(--border, rgba(255,255,255,0.12));
          border-radius: 28px;
          background: var(--card, rgba(24, 16, 48, 0.88));
          box-shadow: var(--shadow, 0 18px 50px rgba(0,0,0,0.35));
        }

        .profile-hero {
          position: relative;
          aspect-ratio: 4 / 5;
          background: linear-gradient(135deg, #2a174f, #0f0821);
        }

        .profile-main-photo,
        .profile-photo-fallback {
          width: 100%;
          height: 100%;
        }

        .profile-main-photo {
          display: block;
          object-fit: cover;
        }

        .profile-photo-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.78);
          background: linear-gradient(135deg, #8b5cf6, #e040fb, #22d3ee);
        }

        .profile-live-badge {
          position: absolute;
          top: 1rem;
          right: 1rem;
          padding: 0.4rem 0.8rem;
          border-radius: 999px;
          background: rgba(255, 45, 120, 0.88);
          color: #fff;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .profile-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.35rem;
        }

        .profile-heading h1 {
          margin: 0;
          font-size: clamp(1.75rem, 7vw, 2.25rem);
          line-height: 1;
        }

        .profile-heading p,
        .profile-heading span,
        .profile-bio,
        .profile-like-status {
          margin: 0.35rem 0 0;
          color: var(--text-muted, #a39ec0);
        }

        .profile-bio {
          line-height: 1.55;
        }

        .profile-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .profile-tags span {
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          background: rgba(224, 64, 251, 0.14);
          border: 1px solid rgba(224, 64, 251, 0.3);
          color: #f4d4ff;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .profile-gallery {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.45rem;
        }

        .profile-gallery img {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          border-radius: 16px;
          background: rgba(255,255,255,0.06);
        }

        .profile-actions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.6rem;
        }

        .profile-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          color: #fff;
          text-decoration: none;
          font-weight: 800;
          cursor: pointer;
        }

        .profile-action--like {
          border: none;
          background: linear-gradient(135deg, #ff2d78, #e040fb);
        }

        .profile-action--video {
          border: none;
          background: linear-gradient(135deg, #8b5cf6, #22d3ee);
        }

        .profile-action:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .profile-secondary-link {
          align-self: center;
          color: var(--accent-cyan, #22d3ee);
          font-weight: 700;
          text-decoration: none;
        }
      `}</style>
    </main>
  );
}
