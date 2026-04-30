"use client";

/**
 * TopSupporterBadge - Displays the current top supporter in a live room
 * Shows a crown icon with the username and total coins spent, with a glow effect
 */
export default function TopSupporterBadge({ topSupporter }) {
  if (!topSupporter?.username || topSupporter?.totalCoins == null) {
    return null;
  }

  return (
    <div className="top-supporter-badge">
      <div className="top-supporter-content">
        <span className="crown-icon">👑</span>
        <div className="supporter-info">
          <span className="supporter-label">Top Supporter</span>
          <span className="supporter-username">{topSupporter.username}</span>
          <span className="supporter-coins">{topSupporter.totalCoins.toLocaleString()} coins</span>
        </div>
      </div>

      <style jsx>{`
        .top-supporter-badge {
          position: relative;
          background: linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #ffd700 100%);
          border-radius: 12px;
          padding: 12px 16px;
          margin: 8px 0;
          box-shadow: 0 4px 20px rgba(255, 215, 0, 0.4);
          animation: glow 2s ease-in-out infinite;
        }

        @keyframes glow {
          0%, 100% {
            box-shadow: 0 4px 20px rgba(255, 215, 0, 0.4);
          }
          50% {
            box-shadow: 0 4px 30px rgba(255, 215, 0, 0.7),
                        0 0 40px rgba(255, 215, 0, 0.3);
          }
        }

        .top-supporter-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .crown-icon {
          font-size: 32px;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
          animation: bounce 2s ease-in-out infinite;
        }

        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        .supporter-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .supporter-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          color: #8b4513;
          letter-spacing: 0.5px;
        }

        .supporter-username {
          font-size: 16px;
          font-weight: 700;
          color: #000;
          text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
        }

        .supporter-coins {
          font-size: 12px;
          font-weight: 600;
          color: #8b4513;
        }

        /* Responsive adjustments */
        @media (max-width: 640px) {
          .top-supporter-badge {
            padding: 10px 12px;
          }

          .crown-icon {
            font-size: 28px;
          }

          .supporter-username {
            font-size: 14px;
          }

          .supporter-coins {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}
