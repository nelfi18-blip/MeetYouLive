"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function ProfilePhotoGrid({ photos = [], videos = [] }) {
  const allMedia = [
    ...photos.map((photo) => ({ type: "photo", url: photo, id: photo })),
    ...videos.map((video) => ({ type: "video", url: video.thumbnail, id: video._id, videoUrl: video.url })),
  ];

  if (allMedia.length === 0) {
    return (
      <div className="profile-empty-state">
        <div className="profile-empty-icon">📷</div>
        <p className="profile-empty-text">No posts yet</p>
      </div>
    );
  }

  return (
    <div className="profile-photo-grid">
      {allMedia.map((item, index) => (
        <motion.div
          key={item.id}
          className="profile-grid-item"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.05 }}
        >
          <Link
            href={item.type === "video" ? `/videos/${item.id}` : `#photo-${item.id}`}
            className="profile-grid-link"
          >
            <img src={item.url} alt="" className="profile-grid-image" />
            {item.type === "video" && (
              <div className="profile-grid-video-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            )}
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
