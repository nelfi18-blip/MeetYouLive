"use client";

import { motion } from "framer-motion";
import { getUserImage, getDisplayName } from "@/lib/imageHelpers";
import Link from "next/link";

export default function TrendingFeed({ posts = [] }) {
  if (!posts || posts.length === 0) {
    return (
      <div className="trending-empty">
        <p>No trending content yet</p>
      </div>
    );
  }

  return (
    <div className="trending-feed">
      <div className="trending-header">
        <h2 className="trending-title">🔥 Trendy</h2>
        <div className="trending-fire-animation">
          {[...Array(3)].map((_, i) => (
            <span key={i} className="fire-particle" style={{ animationDelay: `${i * 0.2}s` }}>
              🔥
            </span>
          ))}
        </div>
      </div>

      <div className="trending-posts">
        {posts.map((post, index) => {
          const creator = post.creator || post.user;
          const creatorImage = getUserImage(creator);
          const creatorName = getDisplayName(creator);

          return (
            <motion.div
              key={post._id}
              className="trending-post-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Link href={`/post/${post._id}`} className="trending-post-link">
                {/* Post Image/Video */}
                <div className="trending-post-media">
                  {post.type === "video" ? (
                    <>
                      <img src={post.thumbnail} alt="" className="trending-media-img" />
                      <div className="trending-video-indicator">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </>
                  ) : (
                    <img src={post.image} alt="" className="trending-media-img" />
                  )}
                  
                  {/* Trending Badge */}
                  {post.isTrending && (
                    <div className="trending-badge-overlay">
                      <span className="trending-badge-text">🔥 TRENDING</span>
                    </div>
                  )}
                </div>

                {/* Post Info */}
                <div className="trending-post-info">
                  {/* Creator Row */}
                  <div className="trending-creator-row">
                    <div className="trending-creator-avatar">
                      {creatorImage ? (
                        <img src={creatorImage} alt={creatorName} />
                      ) : (
                        <div className="trending-creator-placeholder">
                          {creatorName[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="trending-creator-info">
                      <div className="trending-creator-name">
                        {creatorName}
                        {creator.isVerified && (
                          <span className="trending-verify-badge">✓</span>
                        )}
                      </div>
                      <div className="trending-post-time">
                        {getTimeAgo(post.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {post.description && (
                    <p className="trending-post-description">{post.description}</p>
                  )}

                  {/* Engagement Stats */}
                  <div className="trending-stats">
                    <div className="trending-stat-item">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span>{formatCount(post.likesCount || 0)}</span>
                    </div>
                    <div className="trending-stat-item">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{formatCount(post.commentsCount || 0)}</span>
                    </div>
                    {post.viewsCount && (
                      <div className="trending-stat-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                        </svg>
                        <span>{formatCount(post.viewsCount)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
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

function getTimeAgo(date) {
  if (!date) return "";
  
  const now = new Date();
  const postDate = new Date(date);
  const diffMs = now - postDate;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return postDate.toLocaleDateString();
}
