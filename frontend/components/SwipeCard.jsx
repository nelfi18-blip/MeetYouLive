"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { getUserPhotoSelection, getDisplayName, getBioText } from "@/lib/imageHelpers";
import Link from "next/link";

const SWIPE_EXIT_DISTANCE_X = 360;
const SUPER_LIKE_EXIT_DISTANCE_Y = 420;
const SWIPE_EXIT_DELAY_MS = 210;
const SUPER_LIKE_VIBRATION_MS = 70;
const STANDARD_VIBRATION_MS = 45;
const BIO_COLLAPSED_CHAR_LIMIT = 120;
const ENABLE_FEED_PHOTO_DIAGNOSTICS = process.env.NEXT_PUBLIC_ENABLE_FEED_PHOTO_DIAGNOSTICS === "true";

function getProfileId(profile) {
  const profileId = profile?._id || profile?.id;
  return profileId ? String(profileId) : "";
}

function getSwipeExitX(direction) {
  if (direction === "left") return -SWIPE_EXIT_DISTANCE_X;
  if (direction === "right") return SWIPE_EXIT_DISTANCE_X;
  return 0;
}

export default function SwipeCard({
  profile,
  onSwipe,
  onExitComplete,
  style,
  zIndex,
  isActive,
  actionSignal,
  disabled = false,
  pending = false,
  error = null,
  pendingLabel = "",
  bioMoreLabel = "See more",
  bioLessLabel = "See less",
}) {
  const profileId = getProfileId(profile);
  const [exitX, setExitX] = useState(0);
  const [exitY, setExitY] = useState(0);
  const [hasSwiped, setHasSwiped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [brokenPhotoUrls, setBrokenPhotoUrls] = useState(() => new Set());
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const swipeTimeoutRef = useRef(null);
  const photoTouchStartRef = useRef(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0.5, 1, 1, 1, 0.5]);
  
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  useEffect(() => {
    setExitX(0);
    setExitY(0);
    setHasSwiped(false);
    setIsSubmitting(false);
    setBrokenPhotoUrls(new Set());
    setIsBioExpanded(false);
    setActivePhotoIndex(0);
  }, [profileId]);

  useEffect(() => {
    return () => {
      if (swipeTimeoutRef.current) {
        clearTimeout(swipeTimeoutRef.current);
      }
    };
  }, []);

  const completeSwipe = useCallback(async (direction, { force = false } = {}) => {
    if (!isActive || hasSwiped || (!force && disabled) || isSubmitting) return;

    if (!profileId) return;

    setIsSubmitting(true);
    let shouldExit = true;
    try {
      shouldExit = (await onSwipe?.(profileId, direction)) !== false;
    } catch {
      shouldExit = false;
    } finally {
      setIsSubmitting(false);
    }

    if (!shouldExit) return;

    setHasSwiped(true);
    setExitX(getSwipeExitX(direction));
    setExitY(direction === "up" ? -SUPER_LIKE_EXIT_DISTANCE_Y : 0);

    // Haptic feedback (vibration) on mobile
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(direction === "up" ? SUPER_LIKE_VIBRATION_MS : STANDARD_VIBRATION_MS);
    }

    swipeTimeoutRef.current = setTimeout(() => {
      onExitComplete?.(profileId, direction);
    }, SWIPE_EXIT_DELAY_MS);
  }, [disabled, hasSwiped, isActive, isSubmitting, onExitComplete, onSwipe, profileId]);

  useEffect(() => {
    const actionProfileId = actionSignal?.profileId ? String(actionSignal.profileId) : "";
    const currentProfileId = getProfileId(profile);
    if (
      !isActive ||
      !actionSignal?.id ||
      !actionSignal.direction ||
      !actionProfileId ||
      actionProfileId !== currentProfileId
    ) {
      return;
    }
    completeSwipe(actionSignal.direction, { force: true });
  }, [actionSignal, completeSwipe, isActive, profile]);

  const handleDragEnd = (event, info) => {
    if (!isActive || hasSwiped || disabled || isSubmitting) return;

    if (Math.abs(info.offset.x) > 100) {
      completeSwipe(info.offset.x > 0 ? "right" : "left");
    }
  };

  const photos = useMemo(
    () => getUserPhotoSelection(profile).photos.filter((photo) => !brokenPhotoUrls.has(photo)),
    [brokenPhotoUrls, profile]
  );
  const displayName = getDisplayName(profile);
  const numericAge = Number(profile?.age);
  const age = Number.isInteger(numericAge) && numericAge > 0 ? numericAge : "";
  const location = typeof profile?.location === "string" ? profile.location : "";
  const numericDistance = Number(profile?.distance);
  const distance = Number.isFinite(numericDistance) && numericDistance > 0 ? `${Math.round(numericDistance)}km away` : "";
  const bio = getBioText(profile);
  const canExpandBio = bio.length > BIO_COLLAPSED_CHAR_LIMIT;
  
  const currentPhoto = photos[activePhotoIndex] || photos[0] || null;
  const hasPhotoCarousel = photos.length > 1;

  useEffect(() => {
    if (activePhotoIndex >= photos.length) {
      setActivePhotoIndex(0);
    }
  }, [activePhotoIndex, photos.length]);

  useEffect(() => {
    if (!ENABLE_FEED_PHOTO_DIAGNOSTICS) return;
    // TODO: Remove this temporary diagnostic after feed photo storage is verified.
    console.debug("[feed-photo-diagnostic]", {
      userId: profileId,
      username: profile?.username || null,
      photoCount: photos.length,
      fieldUsed: currentPhoto ? "getUserPhotoSelection" : null,
    });
  }, [currentPhoto, photos.length, profile?.username, profileId]);
  
  // Online status
  const isOnline = Boolean(profile?.isOnline);
  const lastSeenTime = profile?.lastSeen ? new Date(profile.lastSeen).getTime() : NaN;
  const recentlyActive = Number.isFinite(lastSeenTime) &&
    (Date.now() - lastSeenTime) < 5 * 60 * 1000; // 5 mins
  const activityLabel = isOnline ? "Online" : recentlyActive ? "Active recently" : "";
  
  // Interests/hobbies
  const interests = (Array.isArray(profile?.interests) ? profile.interests : Array.isArray(profile?.tags) ? profile.tags : [])
    .filter((interest) => typeof interest === "string" && interest.trim())
    .map((interest) => interest.trim());
  
  const handlePhotoClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const goToPhoto = useCallback((direction) => {
    if (!hasPhotoCarousel) return;
    setActivePhotoIndex((index) => (index + direction + photos.length) % photos.length);
  }, [hasPhotoCarousel, photos.length]);

  const handlePhotoPointerDownCapture = (event) => {
    if (!isActive || !hasPhotoCarousel || hasSwiped || disabled || isSubmitting) return;
    event.stopPropagation();
    photoTouchStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePhotoPointerUpCapture = (event) => {
    if (!photoTouchStartRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - photoTouchStartRef.current.x;
    const deltaY = event.clientY - photoTouchStartRef.current.y;
    photoTouchStartRef.current = null;
    if (Math.abs(deltaX) > 36 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      goToPhoto(deltaX < 0 ? 1 : -1);
    }
  };

  const handlePhotoPointerCancelCapture = () => {
    photoTouchStartRef.current = null;
  };

  const cardClassName = isActive
    ? "swipe-card-modern"
    : "swipe-card-modern swipe-card-modern--background";

  return (
    <motion.div
      style={{
        x,
        rotate,
        opacity,
        zIndex,
        ...style,
      }}
      drag={isActive && !hasSwiped && !disabled && !isSubmitting ? "x" : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.18}
      dragMomentum={false}
      onDragEnd={isActive && !hasSwiped && !disabled && !isSubmitting ? handleDragEnd : undefined}
      animate={hasSwiped ? { x: exitX, y: exitY, opacity: 0, scale: 0.98 } : undefined}
      transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
      className={cardClassName}
      aria-hidden={!isActive}
    >
      {/* Main Image */}
      <div 
        className="swipe-card-image-wrapper"
        onClick={isActive ? handlePhotoClick : undefined}
        onPointerDownCapture={handlePhotoPointerDownCapture}
        onPointerUpCapture={handlePhotoPointerUpCapture}
        onPointerCancelCapture={handlePhotoPointerCancelCapture}
      >
        {hasPhotoCarousel && (
          <div className="swipe-card-photo-indicators" aria-hidden="true">
            {photos.map((photo, index) => (
              <span
                key={`${photo}-${index}`}
                className={`photo-indicator${index === activePhotoIndex ? " active" : ""}`}
              />
            ))}
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPhoto || "placeholder"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="swipe-card-image-container"
          >
            {currentPhoto ? (
              <img
                src={currentPhoto}
                alt={displayName}
                className="swipe-card-image"
                loading="lazy"
                decoding="async"
                onError={() => {
                  setBrokenPhotoUrls((prev) => {
                    const next = new Set(prev);
                    next.add(currentPhoto);
                    return next;
                  });
                }}
              />
            ) : (
              <div className="swipe-card-placeholder">
                <svg className="swipe-card-placeholder-icon" width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {hasPhotoCarousel && isActive && (
          <div className="swipe-card-photo-zones" aria-label="Photo navigation">
            <button
              type="button"
              className="swipe-card-photo-zone swipe-card-photo-zone--prev"
              aria-label="Previous photo"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                goToPhoto(-1);
              }}
            />
            <button
              type="button"
              className="swipe-card-photo-zone swipe-card-photo-zone--next"
              aria-label="Next photo"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                goToPhoto(1);
              }}
            />
          </div>
        )}
        
        {isActive && (
          <>
            {/* Online Status Badge */}
            {activityLabel && (
              <div className="swipe-card-online-badge">
                <span className="online-dot"></span>
                {activityLabel}
              </div>
            )}
            
            <motion.div 
              className="swipe-overlay swipe-overlay-spark"
              style={{ opacity: likeOpacity }}
            >
              <div className="swipe-overlay-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="swipe-overlay-icon">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
              </div>
              <div className="swipe-glow-ring" />
            </motion.div>
            
            <motion.div 
              className="swipe-overlay swipe-overlay-fade"
              style={{ opacity: nopeOpacity }}
            >
              <div className="swipe-overlay-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="swipe-overlay-icon">
                  <circle cx="12" cy="12" r="10" opacity="0.3" />
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div className="swipe-glow-ring" />
            </motion.div>
          </>
        )}
      </div>

      {/* Profile Info */}
      <div className="swipe-card-info">
          <div className="swipe-card-name-age">
            <h3 className="swipe-card-name">
              {displayName}
              {(profile?.isVerified || profile?.verified) && (
                <span className="swipe-card-verified" title="Verified">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#22d3ee">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </span>
              )}
            </h3>
            {age && <span className="swipe-card-age">{age}</span>}
          </div>
          <div className="swipe-card-meta-row">
            {(profile?.isVerified || profile?.verified) && <span className="swipe-card-meta-pill">Verified</span>}
            {activityLabel && <span className="swipe-card-meta-pill swipe-card-meta-pill--active">{activityLabel}</span>}
          </div>
          {(location || distance) && (
            <div className="swipe-card-location">
              {location && <span>{location}</span>}
              {location && distance && <span> • </span>}
              {distance && <span>{distance}</span>}
            </div>
          )}
          
          {/* Interests/Hobbies */}
          {interests.length > 0 && (
            <div className="swipe-card-interests">
              {interests.slice(0, 3).map((interest, idx) => (
                <span key={idx} className="interest-tag">
                  {interest}
                </span>
              ))}
              {interests.length > 3 && (
                <span className="interest-tag interest-more">
                  +{interests.length - 3}
                </span>
              )}
            </div>
          )}
          {bio && (
           <div className="swipe-card-bio-wrap">
             <p className={`swipe-card-bio${isBioExpanded ? " swipe-card-bio--expanded" : ""}`}>
               {bio}
             </p>
             {canExpandBio && (
               <button
                 type="button"
                 className="swipe-card-bio-toggle"
                 onClick={(event) => {
                   event.preventDefault();
                   event.stopPropagation();
                   setIsBioExpanded((expanded) => !expanded);
                 }}
               >
                 {isBioExpanded ? bioLessLabel : bioMoreLabel}
               </button>
             )}
           </div>
          )}
          {(pending || error) && (
            <div className={`swipe-card-action-status${error ? " swipe-card-action-status--error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
              {error || pendingLabel}
            </div>
          )}
      </div>

      {/* Quick Info Button */}
      {profileId && (
        <Link href={`/profile/${encodeURIComponent(profileId)}`} className="swipe-card-info-btn" aria-label="View full profile">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </Link>
      )}
    </motion.div>
  );
}
