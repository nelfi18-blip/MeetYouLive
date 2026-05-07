"use client";

import { useState, useEffect, useRef } from "react";

// Activity display duration in milliseconds
const ACTIVITY_DISPLAY_DURATION = 8000;

/**
 * LiveActivityTicker - Scrolling activity feed for live streams
 * Shows recent activities like joins, gifts, follows in a ticker format
 */
export default function LiveActivityTicker({ activities = [] }) {
  const [visibleActivities, setVisibleActivities] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    if (activities.length > 0) {
      // Add new activities with unique IDs
      const newActivities = activities.map((activity, index) => ({
        ...activity,
        id: `${Date.now()}-${index}`,
        timestamp: Date.now(),
      }));

      setVisibleActivities((prev) => {
        const updated = [...prev, ...newActivities];
        // Keep only last 10 activities
        return updated.slice(-10);
      });

      // Auto-remove old activities
      newActivities.forEach((activity) => {
        setTimeout(() => {
          setVisibleActivities((prev) => prev.filter((a) => a.id !== activity.id));
        }, ACTIVITY_DISPLAY_DURATION);
      });
    }
  }, [activities]);

  if (visibleActivities.length === 0) return null;

  return (
    <>
      <div className="live-activity-ticker" ref={containerRef}>
        <div className="ticker-content">
          {visibleActivities.map((activity, index) => (
            <div
              key={activity.id}
              className={`activity-item ${activity.type}`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <span className="activity-icon">{getActivityIcon(activity.type)}</span>
              <span className="activity-text">{formatActivityText(activity)}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .live-activity-ticker {
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          max-width: 90%;
          width: fit-content;
          z-index: 40;
          pointer-events: none;
        }

        .ticker-content {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          align-items: center;
        }

        .activity-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 999px;
          backdrop-filter: blur(16px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          font-size: 0.85rem;
          font-weight: 600;
          animation: tickerSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          border: 1px solid;
        }

        @keyframes tickerSlideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .activity-item.join {
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.15), rgba(16, 185, 129, 0.15));
          border-color: rgba(52, 211, 153, 0.4);
          color: #6ee7b7;
        }

        .activity-item.gift {
          background: linear-gradient(135deg, rgba(224, 64, 251, 0.2), rgba(139, 92, 246, 0.2));
          border-color: rgba(224, 64, 251, 0.5);
          color: #e9d5ff;
        }

        .activity-item.follow {
          background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(59, 130, 246, 0.15));
          border-color: rgba(96, 165, 250, 0.4);
          color: #93c5fd;
        }

        .activity-item.milestone {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.2));
          border-color: rgba(251, 191, 36, 0.5);
          color: #fde68a;
          animation: tickerSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1), milestoneGlow 2s ease-in-out infinite;
        }

        @keyframes milestoneGlow {
          0%, 100% {
            box-shadow: 0 4px 16px rgba(251, 191, 36, 0.3);
          }
          50% {
            box-shadow: 0 4px 24px rgba(251, 191, 36, 0.6), 0 0 16px rgba(251, 191, 36, 0.4);
          }
        }

        .activity-icon {
          font-size: 1rem;
          line-height: 1;
        }

        .activity-text {
          line-height: 1;
        }

        @media (max-width: 768px) {
          .live-activity-ticker {
            top: 60px;
            max-width: 95%;
          }

          .activity-item {
            font-size: 0.75rem;
            padding: 0.4rem 0.8rem;
          }

          .activity-icon {
            font-size: 0.9rem;
          }
        }
      `}</style>
    </>
  );
}

function getActivityIcon(type) {
  const icons = {
    join: "👋",
    gift: "🎁",
    follow: "⭐",
    milestone: "🎉",
  };
  return icons[type] || "✨";
}

function formatActivityText(activity) {
  const username = activity.username || "Alguien";
  
  switch (activity.type) {
    case "join":
      return `${username} se unió`;
    case "gift":
      return `${username} envió ${activity.giftName || "un regalo"}`;
    case "follow":
      return `${username} te siguió`;
    case "milestone":
      return activity.text || `¡${activity.count} espectadores!`;
    default:
      return activity.text || "";
  }
}
