"use client";

import { useEffect, useRef, useState } from "react";

/**
 * MultiVideoGrid - Responsive video grid component for multi-guest live streaming (Tango-style)
 * 
 * Supports:
 * - 1 participant (host only) - full screen
 * - 2 participants (host + 1 guest) - split view
 * - 3 participants (host + 2 guests) - grid 2x2 with 1 empty
 * - 4 participants (host + 3 guests) - full 2x2 grid
 * 
 * Features:
 * - Smooth transitions when guests join/leave
 * - Fade in/out animations
 * - Mobile-first responsive layout
 * - Host video highlighted as primary
 * - Auto-cleanup of video tracks
 */

export default function MultiVideoGrid({
  participants = [],
  isHost = false,
  localVideoRef = null,
  onRemoteVideoMount = null,
  hostUserId = null,
}) {
  const [mountedParticipants, setMountedParticipants] = useState([]);
  const videoRefs = useRef({});

  // Track which participants are currently displayed with fade-in effect
  useEffect(() => {
    // Add new participants with a slight delay for fade-in animation
    const newIds = participants.map((p) => p.uid);
    const existingIds = mountedParticipants.map((p) => p.uid);

    // Remove participants that left
    const toRemove = mountedParticipants.filter((p) => !newIds.includes(p.uid));
    if (toRemove.length > 0) {
      // Fade out before removing
      toRemove.forEach((p) => {
        const elem = videoRefs.current[p.uid];
        if (elem) {
          elem.style.opacity = "0";
        }
      });

      setTimeout(() => {
        setMountedParticipants(participants);
      }, 300);
    } else {
      setMountedParticipants(participants);
    }
  }, [participants, mountedParticipants]);

  // Play remote video tracks when mounted
  useEffect(() => {
    mountedParticipants.forEach((participant) => {
      if (participant.isRemote && participant.videoTrack && videoRefs.current[participant.uid]) {
        try {
          participant.videoTrack.play(videoRefs.current[participant.uid]);
        } catch (err) {
          console.warn("[MultiVideoGrid] Error playing remote video:", err);
        }
      }
    });
  }, [mountedParticipants]);

  // Notify parent when remote video elements mount
  useEffect(() => {
    if (onRemoteVideoMount) {
      mountedParticipants.forEach((participant) => {
        if (participant.isRemote && videoRefs.current[participant.uid]) {
          onRemoteVideoMount(participant.uid, videoRefs.current[participant.uid]);
        }
      });
    }
  }, [mountedParticipants, onRemoteVideoMount]);

  const getGridClass = () => {
    const count = mountedParticipants.length;
    if (count === 1) return "grid-1";
    if (count === 2) return "grid-2";
    if (count === 3) return "grid-3";
    return "grid-4";
  };

  const isHostParticipant = (p) => {
    return p.userId === hostUserId || p.isHost === true;
  };

  return (
    <div className={`multi-video-grid ${getGridClass()}`}>
      {mountedParticipants.map((participant, index) => {
        const isHostTile = isHostParticipant(participant);
        const isLocalTile = participant.isLocal && isHost;

        return (
          <div
            key={participant.uid}
            className={`video-tile ${isHostTile ? "host-tile" : "guest-tile"} tile-${index + 1}`}
            ref={(el) => {
              if (el && !participant.isLocal) {
                videoRefs.current[participant.uid] = el;
              }
            }}
          >
            {/* Local video (host) */}
            {isLocalTile && localVideoRef && (
              <div ref={localVideoRef} className="video-player local-video" />
            )}

            {/* Remote video (guests or host for viewers) */}
            {participant.isRemote && !isLocalTile && (
              <div className="video-player remote-video" />
            )}

            {/* Participant info overlay */}
            <div className="participant-info">
              <div className="participant-badge">
                {isHostTile && <span className="host-icon">⭐</span>}
                <span className="participant-name">
                  {participant.username || participant.name || (isHostTile ? "Host" : "Invitado")}
                </span>
              </div>
            </div>

            {/* Loading state */}
            {participant.loading && (
              <div className="video-loading">
                <div className="spinner" />
                <p>Conectando cámara...</p>
              </div>
            )}
          </div>
        );
      })}

      <style jsx>{`
        .multi-video-grid {
          width: 100%;
          height: 100%;
          display: grid;
          gap: 0.5rem;
          padding: 0.5rem;
          transition: all 0.3s ease;
        }

        /* 1 participant - full screen */
        .grid-1 {
          grid-template-columns: 1fr;
          grid-template-rows: 1fr;
        }

        /* 2 participants - side by side on desktop, stacked on mobile */
        .grid-2 {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr;
        }

        @media (max-width: 768px) {
          .grid-2 {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
          }
        }

        /* 3 participants - 2x2 grid with one empty slot */
        .grid-3 {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
        }

        .grid-3 .tile-1 {
          grid-column: 1 / 2;
          grid-row: 1 / 2;
        }

        .grid-3 .tile-2 {
          grid-column: 2 / 3;
          grid-row: 1 / 2;
        }

        .grid-3 .tile-3 {
          grid-column: 1 / 3;
          grid-row: 2 / 3;
        }

        @media (max-width: 768px) {
          .grid-3 {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto auto;
          }

          .grid-3 .tile-1,
          .grid-3 .tile-2,
          .grid-3 .tile-3 {
            grid-column: 1;
            grid-row: auto;
          }
        }

        /* 4 participants - full 2x2 grid */
        .grid-4 {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
        }

        @media (max-width: 768px) {
          .grid-4 {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto auto auto;
          }
        }

        .video-tile {
          position: relative;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          min-height: 200px;
          opacity: 0;
          animation: fadeIn 0.3s ease forwards;
          transition: all 0.3s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .host-tile {
          border: 2px solid var(--accent, #ff0f8a);
          box-shadow: 0 0 20px rgba(255, 15, 138, 0.3);
        }

        .guest-tile {
          border: 2px solid rgba(255, 255, 255, 0.1);
        }

        .video-player {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .local-video,
        .remote-video {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .participant-info {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0.75rem;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 100%);
          z-index: 2;
        }

        .participant-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          padding: 0.3rem 0.7rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: #fff;
          backdrop-filter: blur(8px);
          max-width: fit-content;
        }

        .host-icon {
          font-size: 0.9rem;
        }

        .participant-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 150px;
        }

        .video-loading {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          background: rgba(0, 0, 0, 0.8);
          color: #fff;
          z-index: 3;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 15, 138, 0.2);
          border-top-color: var(--accent, #ff0f8a);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .video-loading p {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.8);
        }

        /* Ensure all tiles have consistent minimum heights */
        @media (max-width: 768px) {
          .video-tile {
            min-height: 180px;
            max-height: 300px;
          }
        }

        @media (min-width: 769px) {
          .video-tile {
            min-height: 250px;
          }

          .grid-1 .video-tile {
            min-height: 400px;
          }
        }
      `}</style>
    </div>
  );
}
