"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getUserImage, getDisplayName } from "@/lib/imageHelpers";
import Link from "next/link";

export default function VerticalVideoFeed({ videos = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const startY = useRef(0);

  const currentVideo = videos[currentIndex];

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [currentIndex, isPlaying]);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const endY = e.changedTouches[0].clientY;
    const diff = startY.current - endY;

    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < videos.length - 1) {
        // Swipe up - next video
        setCurrentIndex(prev => prev + 1);
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe down - previous video
        setCurrentIndex(prev => prev - 1);
      }
    }
  };

  const handleLike = async () => {
    // Handle like logic
    console.log("Liked video:", currentVideo._id);
  };

  const handleFollow = async () => {
    // Handle follow logic
    console.log("Follow creator:", currentVideo.creator._id);
  };

  const handleGift = () => {
    // Open gift panel
    console.log("Send gift to:", currentVideo.creator._id);
  };

  if (!currentVideo) {
    return (
      <div className="vertical-feed-empty">
        <p>No videos available</p>
      </div>
    );
  }

  const creator = currentVideo.creator || {};
  const creatorImage = getUserImage(creator);
  const creatorName = getDisplayName(creator);

  return (
    <div
      className="vertical-video-feed"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          className="video-slide"
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          transition={{ duration: 0.3 }}
        >
          {/* Video */}
          <video
            ref={videoRef}
            className="video-player"
            src={currentVideo.url}
            loop
            playsInline
            onClick={() => setIsPlaying(!isPlaying)}
          />

          {/* Play/Pause Overlay */}
          <AnimatePresence>
            {!isPlaying && (
              <motion.div
                className="video-pause-overlay"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <svg width="80" height="80" viewBox="0 0 24 24" fill="white" opacity="0.9">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Creator Info */}
          <div className="video-info-section">
            <div className="video-creator-row">
              <Link href={`/profile/${creator._id}`} className="video-creator-avatar">
                {creatorImage ? (
                  <img src={creatorImage} alt={creatorName} />
                ) : (
                  <div className="video-creator-placeholder">
                    {creatorName[0]?.toUpperCase()}
                  </div>
                )}
              </Link>
              <Link href={`/profile/${creator._id}`} className="video-creator-name">
                {creatorName}
                {creator.isVerified && <span className="verify-icon">✓</span>}
              </Link>
              {!creator.isFollowing && (
                <button className="video-follow-btn" onClick={handleFollow}>
                  Follow
                </button>
              )}
            </div>

            {currentVideo.description && (
              <p className="video-description">{currentVideo.description}</p>
            )}

            {currentVideo.hashtags && currentVideo.hashtags.length > 0 && (
              <div className="video-hashtags">
                {currentVideo.hashtags.map((tag, i) => (
                  <span key={i} className="video-hashtag">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons (Right Side) */}
          <div className="video-actions-sidebar">
            {/* Creator Avatar with Follow Button */}
            <div className="video-action-item video-action-avatar">
              <Link href={`/profile/${creator._id}`}>
                {creatorImage ? (
                  <img src={creatorImage} alt={creatorName} />
                ) : (
                  <div className="video-action-placeholder">
                    {creatorName[0]?.toUpperCase()}
                  </div>
                )}
              </Link>
              {!creator.isFollowing && (
                <button className="video-action-follow-plus" onClick={handleFollow}>
                  +
                </button>
              )}
            </div>

            {/* Like */}
            <button className="video-action-item" onClick={handleLike}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span className="video-action-count">
                {formatCount(currentVideo.likesCount || 0)}
              </span>
            </button>

            {/* Comment */}
            <button
              className="video-action-item"
              onClick={() => setShowComments(!showComments)}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="video-action-count">
                {formatCount(currentVideo.commentsCount || 0)}
              </span>
            </button>

            {/* Gift */}
            <button className="video-action-item" onClick={handleGift}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
              <span className="video-action-label">Gift</span>
            </button>

            {/* Share */}
            <button className="video-action-item">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span className="video-action-label">Share</span>
            </button>
          </div>

          {/* Progress Indicator */}
          <div className="video-progress-dots">
            {videos.map((_, i) => (
              <div
                key={i}
                className={`progress-dot ${i === currentIndex ? "active" : ""} ${
                  i < currentIndex ? "completed" : ""
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Comments Sheet */}
      <AnimatePresence>
        {showComments && (
          <>
            <motion.div
              className="comments-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowComments(false)}
            />
            <motion.div
              className="comments-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30 }}
            >
              <div className="comments-header">
                <h3>Comments ({currentVideo.commentsCount || 0})</h3>
                <button onClick={() => setShowComments(false)}>✕</button>
              </div>
              <div className="comments-list">
                <p className="comments-empty">No comments yet. Be the first!</p>
              </div>
              <div className="comments-input-wrapper">
                <input
                  type="text"
                  placeholder="Add a comment..."
                  className="comments-input"
                />
                <button className="comments-send-btn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatCount(count) {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + "M";
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + "K";
  }
  return count.toString();
}
