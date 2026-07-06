"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { getUserPhotoSelection, getDisplayName, getBioText, normalizeImageUrl } from "@/lib/imageHelpers";
import Link from "next/link";

const SWIPE_EXIT_DISTANCE_X = 360;
const SUPER_LIKE_EXIT_DISTANCE_Y = 420;
const SWIPE_EXIT_DELAY_MS = 210;
const SUPER_LIKE_VIBRATION_MS = 70;
const STANDARD_VIBRATION_MS = 45;
const BIO_COLLAPSED_CHAR_LIMIT = 120;
const PHOTO_TAP_CANCEL_THRESHOLD_PX = 10;

function getProfileId(profile) {
  const profileId = profile?._id || profile?.id;
  return profileId ? String(profileId) : "";
}

function getSwipeExitX(direction) {
  if (direction === "left") return -SWIPE_EXIT_DISTANCE_X;
  if (direction === "right") return SWIPE_EXIT_DISTANCE_X;
  return 0;
}

function getActivityLabel(profile, hasActivitySignal) {
  if (profile?.isOnline) return "Online";
  if (hasActivitySignal) return "Active recently";
  return "";
}

const PHOTO_TRANSITION_DURATION = 0.22;
const INTERESTS_VISIBLE_LIMIT = 3;
const INTEREST_ANIMATION_DURATION = 0.2;
const INTEREST_STAGGER_DELAY = 0.025;
const PHOTO_INDICATOR_ACTIVE = { scaleX: 1 };
const PHOTO_INDICATOR_INACTIVE = { scaleX: 0 };
const PHOTO_EASE = [0.22, 1, 0.36, 1];
const CARD_TRANSITION = { type: "spring", stiffness: 260, damping: 29, mass: 0.82 };
// Keep optional face/focal metadata inside a safe vertical range so images still fill the card.
const MIN_PHOTO_FOCUS_Y_PERCENT = 18;
const MAX_PHOTO_FOCUS_Y_PERCENT = 72;
const NORMALIZED_PHOTO_FOCUS_THRESHOLD = 1;
const PHOTO_FOCUS_PERCENT_SCALE = 100;
const photoTransitionVariants = {
  enter: (direction) => ({ opacity: 0, x: direction * 14, scale: 1.012 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (direction) => ({ opacity: 0, x: direction * -10, scale: 1.006 }),
};

function getPhotoFocusY(profile, currentPhoto) {
  if (!currentPhoto) return null;
  const normalizedCurrentPhoto = normalizeImageUrl(currentPhoto) || currentPhoto;

  const candidates = [
    ...(Array.isArray(profile?.images) ? profile.images : []),
    ...(Array.isArray(profile?.profilePhotos) ? profile.profilePhotos : []),
    ...(Array.isArray(profile?.photos) ? profile.photos : []),
    profile?.primaryPhoto,
    profile?.avatar,
  ];

  const matchingPhoto = candidates.find((candidate) => normalizeImageUrl(candidate) === normalizedCurrentPhoto);
  const rawFocusY =
    matchingPhoto?.focusY ??
    matchingPhoto?.focalY ??
    matchingPhoto?.faceY ??
    matchingPhoto?.focalPoint?.y ??
    matchingPhoto?.crop?.focusY ??
    profile?.photoFocusY ??
    profile?.focalPoint?.y;
  const numericFocusY = Number(rawFocusY);

  if (!Number.isFinite(numericFocusY)) return null;
  // Values up to 1.0 are normalized focal coordinates (0.35); larger values are percentages (35).
  const focusPercent = numericFocusY <= NORMALIZED_PHOTO_FOCUS_THRESHOLD
    ? numericFocusY * PHOTO_FOCUS_PERCENT_SCALE
    : numericFocusY;
  return Math.min(MAX_PHOTO_FOCUS_Y_PERCENT, Math.max(MIN_PHOTO_FOCUS_Y_PERCENT, focusPercent));
}

const SwipeCard = memo(function({
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
  stackIndex = 0,
  isImagePriority = false,
}) {
  const profileId = getProfileId(profile);
  const [exitX, setExitX] = useState(0);
  const [exitY, setExitY] = useState(0);
  const [hasSwiped, setHasSwiped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [brokenPhotoUrls, setBrokenPhotoUrls] = useState(() => new Set());
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoDirection, setPhotoDirection] = useState(1);
  const swipeTimeoutRef = useRef(null);
  const photoTouchStartRef = useRef(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-18, 18]);
  const opacity = useTransform(x, [-220, -150, 0, 150, 220], [0.62, 1, 1, 1, 0.62]);
  
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
    setPhotoDirection(1);
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
  const photoFocusY = useMemo(() => getPhotoFocusY(profile, currentPhoto), [currentPhoto, profile]);

  useEffect(() => {
    if (photos.length > 0 && activePhotoIndex >= photos.length) {
      setActivePhotoIndex(0);
    }
  }, [activePhotoIndex, photos.length]);

  // Online status
  const isOnline = Boolean(profile?.isOnline || profile?.lastSeen);
  const lastSeenTime = profile?.lastSeen ? new Date(profile.lastSeen).getTime() : NaN;
  const recentlyActive = Number.isFinite(lastSeenTime) &&
    (Date.now() - lastSeenTime) < 5 * 60 * 1000; // 5 mins
  const activityLabel = getActivityLabel(profile, isOnline || recentlyActive);
  const isVerified = Boolean(profile?.isVerified || profile?.verified);
  
  // Interests/hobbies
  const interests = useMemo(
    () => {
      const seenInterests = new Set();
      return (Array.isArray(profile?.interests) ? profile.interests : Array.isArray(profile?.tags) ? profile.tags : [])
        .filter((interest) => typeof interest === "string" && interest.trim())
        .map((interest) => interest.trim())
        .filter((interest) => {
          const key = interest.toLowerCase();
          if (seenInterests.has(key)) return false;
          seenInterests.add(key);
          return true;
        });
    },
    [profile?.interests, profile?.tags]
  );
  const visibleInterests = interests.slice(0, INTERESTS_VISIBLE_LIMIT);
  const hiddenInterestsCount = Math.max(0, interests.length - INTERESTS_VISIBLE_LIMIT);
  
  const goToPhoto = useCallback((direction) => {
    if (!hasPhotoCarousel) return;
    setActivePhotoIndex((index) => {
      const nextIndex = index + direction;
      const boundedIndex = Math.min(Math.max(nextIndex, 0), photos.length - 1);
      if (boundedIndex !== index) {
        setPhotoDirection(direction);
      }
      return boundedIndex;
    });
  }, [hasPhotoCarousel, photos.length]);

  const isCarouselInteractionEnabled = () =>
    isActive && hasPhotoCarousel && !hasSwiped && !disabled && !isSubmitting;

  const handlePhotoTap = (event, containerRect = event.currentTarget.getBoundingClientRect()) => {
    if (!isCarouselInteractionEnabled()) return;

    if (!containerRect.width) return;

    event.preventDefault();
    event.stopPropagation();
    const tapX = event.clientX - containerRect.left;
    goToPhoto(tapX < containerRect.width / 2 ? -1 : 1);
  };

  const handlePhotoPointerDownCapture = (event) => {
    if (!isCarouselInteractionEnabled()) return;
    photoTouchStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePhotoPointerUpCapture = (event) => {
    const touchStart = photoTouchStartRef.current;
    if (!touchStart) return;
    if (!isCarouselInteractionEnabled()) {
      photoTouchStartRef.current = null;
      return;
    }
    if (touchStart.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - touchStart.x;
    const deltaY = event.clientY - touchStart.y;
    photoTouchStartRef.current = null;
    // Let real drags bubble to the card swipe handler; only consume taps for photo navigation.
    if (Math.hypot(deltaX, deltaY) <= PHOTO_TAP_CANCEL_THRESHOLD_PX) {
      handlePhotoTap(event, event.currentTarget.getBoundingClientRect());
    }
  };

  const handlePhotoPointerCancelCapture = () => {
    photoTouchStartRef.current = null;
  };

  const handlePhotoKeyDown = (event) => {
    if (!isCarouselInteractionEnabled()) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let direction = 1;
    if (event.key === "ArrowLeft") {
      direction = -1;
    }
    goToPhoto(direction);
  };

  const cardClassName = isActive
    ? "swipe-card-modern"
    : "swipe-card-modern swipe-card-modern--background";
  const stackDepth = Math.max(0, Number(stackIndex) || 0);
  const stackScale = 1 - stackDepth * 0.035;
  const stackOffsetY = stackDepth * 12;
  const stackOpacity = 1 - stackDepth * 0.13;
  const cardAnimate = hasSwiped
    ? { x: exitX, y: exitY, opacity: 0, scale: 0.955 }
    : isActive
      ? { y: 0, scale: 1 }
      : { y: stackOffsetY, scale: stackScale, opacity: stackOpacity };

  return (
    <motion.div
      style={{
        x,
        rotate,
        opacity: isActive ? opacity : undefined,
        zIndex,
        ...style,
      }}
      drag={isActive && !hasSwiped && !disabled && !isSubmitting ? "x" : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.22}
      dragMomentum={false}
      onDragEnd={isActive && !hasSwiped && !disabled && !isSubmitting ? handleDragEnd : undefined}
      initial={isActive ? false : { y: stackOffsetY + 18, scale: stackScale * 0.985, opacity: 0 }}
      animate={cardAnimate}
      transition={CARD_TRANSITION}
      className={cardClassName}
      aria-hidden={!isActive}
    >
      {/* Main Image */}
      <div 
        className="swipe-card-image-wrapper"
        onKeyDown={isActive ? handlePhotoKeyDown : undefined}
        onPointerDownCapture={handlePhotoPointerDownCapture}
        onPointerUpCapture={handlePhotoPointerUpCapture}
        onPointerCancelCapture={handlePhotoPointerCancelCapture}
        role={isActive && hasPhotoCarousel ? "button" : undefined}
        tabIndex={isActive && hasPhotoCarousel ? 0 : undefined}
        aria-label={isActive && hasPhotoCarousel ? "Change profile photo. Use arrow keys, Enter, or Space." : undefined}
      >
        {hasPhotoCarousel && (
          <div className="swipe-card-photo-indicators" aria-hidden="true">
            {photos.map((photo, index) => (
              <span
                key={`${photo}-${index}`}
                className={`photo-indicator${index === activePhotoIndex ? " active" : ""}`}
              >
                <motion.span
                  className="photo-indicator-fill"
                  initial={false}
                  animate={index === activePhotoIndex ? PHOTO_INDICATOR_ACTIVE : PHOTO_INDICATOR_INACTIVE}
                  transition={{ duration: PHOTO_TRANSITION_DURATION, ease: PHOTO_EASE }}
                />
              </span>
            ))}
          </div>
        )}
        <AnimatePresence initial={false} custom={photoDirection}>
          <motion.div
            key={currentPhoto || "placeholder"}
            custom={photoDirection}
            variants={photoTransitionVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: PHOTO_TRANSITION_DURATION, ease: PHOTO_EASE }}
            className="swipe-card-image-container"
          >
            {currentPhoto ? (
              <img
                src={currentPhoto}
                alt={displayName}
                className="swipe-card-image"
                loading={isImagePriority ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={isActive ? "high" : "auto"}
                style={photoFocusY == null ? undefined : { objectPosition: `center ${photoFocusY}%` }}
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
              {isVerified && (
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
            {isVerified && <span className="swipe-card-meta-pill">Verified</span>}
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
              <AnimatePresence initial={false}>
              {visibleInterests.map((interest, idx) => (
                <motion.span
                  key={interest}
                  className="interest-tag"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: INTEREST_ANIMATION_DURATION, ease: "easeOut", delay: idx * INTEREST_STAGGER_DELAY }}
                >
                  {interest}
                </motion.span>
              ))}
              {hiddenInterestsCount > 0 && (
                <motion.span
                  key={`more-${hiddenInterestsCount}`}
                  className="interest-tag interest-more"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: INTEREST_ANIMATION_DURATION, ease: "easeOut", delay: visibleInterests.length * INTEREST_STAGGER_DELAY }}
                >
                  +{hiddenInterestsCount}
                </motion.span>
              )}
              </AnimatePresence>
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
});

SwipeCard.displayName = "SwipeCard";

export default SwipeCard;
