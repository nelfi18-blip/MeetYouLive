"use client";

import { useState, useEffect } from "react";

// Count animation interval in milliseconds
const COUNT_ANIMATION_INTERVAL_MS = 50;

/**
 * ViewerCountAnimation - Animated viewer counter for live streams
 * Shows real-time viewer count with smooth animations
 */
export default function ViewerCountAnimation({ count = 0, trend = "up" }) {
  const [displayCount, setDisplayCount] = useState(count);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (count !== displayCount) {
      setAnimating(true);
      
      // Animate count change
      const step = count > displayCount ? 1 : -1;
      const interval = setInterval(() => {
        setDisplayCount((prev) => {
          const next = prev + step;
          if ((step > 0 && next >= count) || (step < 0 && next <= count)) {
            clearInterval(interval);
            setAnimating(false);
            return count;
          }
          return next;
        });
      }, COUNT_ANIMATION_INTERVAL_MS);

      return () => clearInterval(interval);
    }
  }, [count, displayCount]);

  return (
    <>
      <div className={`viewer-count ${animating ? "animating" : ""} ${trend}`}>
        <div className="viewer-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
        <span className="viewer-number">{displayCount.toLocaleString()}</span>
        {trend === "up" && animating && (
          <div className="trend-indicator up">▲</div>
        )}
        {trend === "down" && animating && (
          <div className="trend-indicator down">▼</div>
        )}
        <div className="live-pulse" />
      </div>

      <style jsx>{`
        .viewer-count {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(220, 38, 38, 0.25));
          border: 1.5px solid rgba(239, 68, 68, 0.5);
          border-radius: 999px;
          padding: 0.4rem 0.8rem;
          font-size: 0.85rem;
          font-weight: 800;
          color: #fff;
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.3);
          backdrop-filter: blur(10px);
        }

        .viewer-count.animating {
          animation: pulse 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
        }

        .viewer-icon {
          display: flex;
          align-items: center;
          color: #fff;
        }

        .viewer-number {
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
        }

        .trend-indicator {
          font-size: 0.7rem;
          animation: trendBounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .trend-indicator.up {
          color: #34d399;
        }

        .trend-indicator.down {
          color: #f87171;
        }

        @keyframes trendBounce {
          0% {
            opacity: 0;
            transform: scale(0) translateY(0);
          }
          50% {
            opacity: 1;
            transform: scale(1.2) translateY(-2px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .live-pulse {
          position: absolute;
          inset: -2px;
          border-radius: 999px;
          border: 2px solid rgba(239, 68, 68, 0.5);
          animation: livePulseAnim 2s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes livePulseAnim {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.15);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
