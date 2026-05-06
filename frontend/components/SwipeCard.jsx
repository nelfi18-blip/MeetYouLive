"use client";

import { useState, useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { getUserImage, getDisplayName } from "@/lib/imageHelpers";
import Link from "next/link";

export default function SwipeCard({ profile, onSwipe, style, zIndex }) {
  const [exitX, setExitX] = useState(0);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0.5, 1, 1, 1, 0.5]);
  
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (event, info) => {
    if (Math.abs(info.offset.x) > 100) {
      setExitX(info.offset.x > 0 ? 300 : -300);
      const direction = info.offset.x > 0 ? "right" : "left";
      onSwipe?.(profile._id, direction);
    }
  };

  const userImage = getUserImage(profile);
  const displayName = getDisplayName(profile);
  const age = profile.age || "";
  const location = profile.location || "";
  const distance = profile.distance ? `${Math.round(profile.distance)}km away` : "";

  return (
    <motion.div
      style={{
        x,
        rotate,
        opacity,
        zIndex,
        ...style,
      }}
      drag="x"
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      animate={exitX !== 0 ? { x: exitX } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="swipe-card-modern"
    >
      {/* Main Image */}
      <div className="swipe-card-image-wrapper">
        {userImage ? (
          <img src={userImage} alt={displayName} className="swipe-card-image" />
        ) : (
          <div className="swipe-card-placeholder">
            <div className="swipe-card-initial">{displayName[0]?.toUpperCase()}</div>
          </div>
        )}
        
        {/* Like Overlay */}
        <motion.div 
          className="swipe-overlay swipe-overlay-like"
          style={{ opacity: likeOpacity }}
        >
          <span className="swipe-overlay-text">LIKE</span>
        </motion.div>
        
        {/* Nope Overlay */}
        <motion.div 
          className="swipe-overlay swipe-overlay-nope"
          style={{ opacity: nopeOpacity }}
        >
          <span className="swipe-overlay-text">NOPE</span>
        </motion.div>
      </div>

      {/* Profile Info */}
      <div className="swipe-card-info">
        <div className="swipe-card-name-age">
          <h3 className="swipe-card-name">{displayName}</h3>
          {age && <span className="swipe-card-age">{age}</span>}
        </div>
        {(location || distance) && (
          <div className="swipe-card-location">
            {location && <span>{location}</span>}
            {location && distance && <span> • </span>}
            {distance && <span>{distance}</span>}
          </div>
        )}
      </div>

      {/* Quick Info Button */}
      <Link href={`/profile/${profile._id}`} className="swipe-card-info-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </Link>
    </motion.div>
  );
}
