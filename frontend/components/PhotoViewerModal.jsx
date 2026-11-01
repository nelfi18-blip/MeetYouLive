"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * PhotoViewerModal
 *
 * Read-only, full-screen premium-dark lightbox for browsing a user's profile
 * photos. Opens at `initialIndex`, supports swipe (touch), arrow keys and
 * on-screen arrows, shows a "current/total" counter and closes via the X
 * button, Escape or a tap on the backdrop.
 *
 * It never mutates photos or calls the backend — Edit/Delete/Make primary
 * stay entirely in SimpleProfilePhotoGallery.
 */
export default function PhotoViewerModal({ photos, initialIndex = 0, onClose, t }) {
  const [index, setIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);
  const touchStartX = useRef(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const total = photos.length;

  const goTo = useCallback(
    (nextIndex) => {
      if (total === 0) return;
      setIndex(((nextIndex % total) + total) % total);
    },
    [total]
  );

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") goNext();
      else if (event.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goPrev]);

  if (!mounted || typeof document === "undefined" || total === 0) return null;

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0].clientX;
    touchDeltaX.current = 0;
  };

  const handleTouchMove = (event) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = event.touches[0].clientX - touchStartX.current;
  };

  const handleTouchEnd = () => {
    const delta = touchDeltaX.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    const SWIPE_THRESHOLD = 50;
    if (delta <= -SWIPE_THRESHOLD) goNext();
    else if (delta >= SWIPE_THRESHOLD) goPrev();
  };

  const currentUrl = photos[index];
  const counterText = t("profile.photoViewerCounter")
    .replace("{current}", String(index + 1))
    .replace("{total}", String(total));

  return createPortal(
    <div
      className="photo-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("profile.photoViewerLabel")}
      onClick={onClose}
    >
      <button
        type="button"
        className="photo-viewer-close"
        onClick={onClose}
        aria-label={t("profile.photoViewerClose")}
      >
        ×
      </button>

      {total > 1 && <span className="photo-viewer-counter">{counterText}</span>}

      <div
        className="photo-viewer-stage"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {total > 1 && (
          <button
            type="button"
            className="photo-viewer-nav photo-viewer-nav--prev"
            onClick={goPrev}
            aria-label={t("profile.photoViewerPrev")}
          >
            ‹
          </button>
        )}
        <img src={currentUrl} alt={t("profile.photoViewerImageAlt")} className="photo-viewer-image" draggable={false} />
        {total > 1 && (
          <button
            type="button"
            className="photo-viewer-nav photo-viewer-nav--next"
            onClick={goNext}
            aria-label={t("profile.photoViewerNext")}
          >
            ›
          </button>
        )}
      </div>

      <style jsx>{`
        .photo-viewer-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(6, 3, 16, 0.94);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: photoViewerFadeIn 0.18s ease-out;
        }
        @keyframes photoViewerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .photo-viewer-close {
          position: absolute;
          top: max(1rem, env(safe-area-inset-top));
          right: max(1rem, env(safe-area-inset-right));
          width: 40px;
          height: 40px;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border-subtle);
          background: rgba(255, 255, 255, 0.08);
          color: var(--text);
          font-size: 1.6rem;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 2;
        }
        .photo-viewer-close:hover { background: rgba(255, 255, 255, 0.16); }
        .photo-viewer-counter {
          position: absolute;
          top: max(1.1rem, env(safe-area-inset-top));
          left: 50%;
          transform: translateX(-50%);
          padding: 0.3rem 0.85rem;
          border-radius: var(--radius-pill);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid var(--border-subtle);
          color: var(--text);
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          z-index: 2;
        }
        .photo-viewer-stage {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          touch-action: pan-y;
        }
        .photo-viewer-image {
          max-width: 94vw;
          max-height: 88vh;
          object-fit: contain;
          border-radius: var(--radius-sm);
          box-shadow: var(--shadow-lg);
          user-select: none;
          -webkit-user-drag: none;
        }
        .photo-viewer-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border-subtle);
          background: rgba(255, 255, 255, 0.08);
          color: var(--text);
          font-size: 1.8rem;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 2;
        }
        .photo-viewer-nav:hover { background: rgba(255, 255, 255, 0.16); }
        .photo-viewer-nav--prev { left: max(0.6rem, env(safe-area-inset-left)); }
        .photo-viewer-nav--next { right: max(0.6rem, env(safe-area-inset-right)); }

        @media (max-width: 640px) {
          .photo-viewer-nav { width: 38px; height: 38px; font-size: 1.5rem; }
          .photo-viewer-image { max-width: 100vw; max-height: 82vh; }
        }
      `}</style>
    </div>,
    document.body
  );
}
