"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { computeRemoteVideoActions } from "@/lib/remoteVideoMount";
import { isHostParticipant } from "@/lib/multiGuestPresentation";

/**
 * MultiVideoGrid - Responsive, video-first stage for multi-guest live streaming.
 *
 * Renders a tile ONLY for streams that are actually publishing — never for
 * available slots, approved-but-not-publishing guests, or any placeholder.
 * The participant list passed in is the single source of truth for what is
 * renderable (see lib/multiGuestPresentation.js#buildRenderableVideoParticipants).
 *
 * Dynamic layouts:
 * - 1 stream  -> dominant tile filling the whole stage.
 * - 2 streams -> balanced, full-height side-by-side duo (no thin horizontal
 *   strips), preserved on mobile portrait/landscape, tablet and desktop.
 * - 3 streams -> hierarchical composition: one main tile + two secondary
 *   tiles, no empty slot.
 * - 4 streams -> even 2x2 grid with consistent tile sizes.
 *
 * Features:
 * - Smooth transitions when guests join/leave; the layout reflows
 *   automatically as the renderable set changes.
 * - Fade in/out animations.
 * - Mobile-first responsive layout.
 * - Host video highlighted as primary; identity (host vs guest) is resolved
 *   per-tile and never defaults an unknown remote to "host".
 * - Auto-cleanup of video tracks.
 */

export default function MultiVideoGrid({
  participants = [],
  isHost = false,
  localVideoRef = null,
  onRemoteVideoMount = null,
  hostUserId = null,
  highlightedRecipientId = null,
}) {
  const { t } = useLanguage();
  const [mountedParticipants, setMountedParticipants] = useState([]);
  // Stable per-uid DOM containers for remote video tiles (the dedicated
  // ".remote-video" placeholder, not the outer tile wrapper — keeping it
  // separate from the badge/overlay markup avoids fighting Agora's own
  // DOM insertions when it mounts/replaces the <video> element).
  const containerRefs = useRef({});
  // Outer tile wrapper refs (host/guest badge + video together), used only
  // for the leave fade-out animation — kept separate from `containerRefs` so
  // video playback never targets the overlay-laden tile wrapper.
  const tileRefs = useRef({});
  // Tracks which videoTrack reference was last played into each uid's
  // container, so we only call play() again when the track actually
  // changes (new publish, reconnection, track replacement) — never on
  // every unrelated re-render.
  const lastPlayedTracksRef = useRef({});

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
        const elem = tileRefs.current[p.uid];
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

  // Play (or re-play) remote video tracks once their dedicated container is
  // mounted. Runs on every render where `mountedParticipants` changes — which
  // can include unrelated updates (e.g. a new chat message causing a parent
  // re-render) — but `computeRemoteVideoActions` only returns an entry when
  // the container exists and the track reference actually changed, so this
  // never triggers duplicate play() calls or effect loops.
  useEffect(() => {
    const { toPlay, toClear } = computeRemoteVideoActions(
      mountedParticipants,
      containerRefs.current,
      lastPlayedTracksRef.current
    );

    toPlay.forEach(({ uid, videoTrack, container }) => {
      try {
        videoTrack.play(container);
        lastPlayedTracksRef.current[String(uid)] = videoTrack;
      } catch (err) {
        console.warn("[MultiVideoGrid] Error playing remote video:", err);
      }
    });

    toClear.forEach((uidKey) => {
      delete lastPlayedTracksRef.current[uidKey];
    });
  }, [mountedParticipants]);

  // Notify parent when remote video elements mount
  useEffect(() => {
    if (onRemoteVideoMount) {
      mountedParticipants.forEach((participant) => {
        if (participant.isRemote && containerRefs.current[participant.uid]) {
          onRemoteVideoMount(participant.uid, containerRefs.current[participant.uid]);
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

  return (
    <div className={`multi-video-grid ${getGridClass()}`}>
      {mountedParticipants.map((participant, index) => {
        const isHostTile = isHostParticipant(participant, hostUserId);
        // Render the local camera preview for whoever is broadcasting locally
        // (the host, or an approved guest) — not only when the viewer is the host.
        const isLocalTile = participant.isLocal === true;
        // Purely presentational: does a Gift's receiverId (#986, resolved via
        // resolveGiftTargetParticipant) currently target this tile? Never
        // touches tracks/subscriptions/play()/remote-video refs/Agora state.
        const isGiftTarget =
          !!highlightedRecipientId &&
          !!participant.userId &&
          String(participant.userId) === String(highlightedRecipientId);

        return (
          <div
            key={participant.uid}
            className={`video-tile ${isHostTile ? "host-tile" : "guest-tile"} tile-${index + 1}${isGiftTarget ? " gift-target-tile" : ""}`}
            ref={(el) => {
              if (el) {
                tileRefs.current[participant.uid] = el;
              } else {
                delete tileRefs.current[participant.uid];
              }
            }}
          >
            {/* Gift-target halo/pulse — auto-clears with highlightedRecipientId,
                never blocks the video itself (pointer-events: none). */}
            {isGiftTarget && <div className="gift-target-ring" aria-hidden="true" />}
            {/* Local video (host) */}
            {isLocalTile && localVideoRef && (
              <div ref={localVideoRef} className="video-player local-video" />
            )}

            {/* Remote video (guests or host for viewers) — a stable, dedicated
                container keyed by uid so Agora's videoTrack.play() always
                mounts into the same real DOM node, independent of any other
                tile's state (badge/overlay live in sibling elements). */}
            {participant.isRemote && !isLocalTile && (
              <div
                className="video-player remote-video"
                ref={(el) => {
                  if (el) {
                    containerRefs.current[participant.uid] = el;
                  } else {
                    delete containerRefs.current[participant.uid];
                    delete lastPlayedTracksRef.current[String(participant.uid)];
                  }
                }}
              />
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
                <p>{t("multiVideoGrid.connectingCamera")}</p>
              </div>
            )}
          </div>
        );
      })}

      <style jsx>{`
        .multi-video-grid {
          width: 100%;
          height: 100%;
          min-height: 0;
          min-width: 0;
          display: grid;
          gap: 0.4rem;
          padding: 0.4rem;
          box-sizing: border-box;
          transition: all 0.3s ease;
          overflow: hidden;
        }

        /* 1 stream — the single camera is the undisputed protagonist: it
           fills the whole stage, no reserved space for anyone else. */
        .grid-1 {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr);
        }

        /* 2 streams — a balanced, full-height side-by-side duo on every
           breakpoint (mobile portrait included). Each tile keeps the whole
           stage height, which preserves vertical/portrait framing of faces
           far better than stacking the cameras into two short horizontal
           strips. */
        .grid-2 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: minmax(0, 1fr);
        }

        /* 3 streams — hierarchical composition: one dominant tile plus two
           secondary tiles, no empty slot. Mobile-first: the main tile sits
           on top (taller) with the two secondary tiles side-by-side below. */
        .grid-3 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: minmax(0, 1.4fr) minmax(0, 1fr);
        }

        .grid-3 .tile-1 {
          grid-column: 1 / 3;
          grid-row: 1 / 2;
        }

        .grid-3 .tile-2 {
          grid-column: 1 / 2;
          grid-row: 2 / 3;
        }

        .grid-3 .tile-3 {
          grid-column: 2 / 3;
          grid-row: 2 / 3;
        }

        /* Tablet/desktop: enough width for a hero-left composition — main
           tile on the left spanning the full height, two secondary tiles
           stacked on the right. */
        @media (min-width: 769px) {
          .grid-3 {
            grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
            grid-template-rows: repeat(2, minmax(0, 1fr));
          }

          .grid-3 .tile-1 {
            grid-column: 1 / 2;
            grid-row: 1 / 3;
          }

          .grid-3 .tile-2 {
            grid-column: 2 / 3;
            grid-row: 1 / 2;
          }

          .grid-3 .tile-3 {
            grid-column: 2 / 3;
            grid-row: 2 / 3;
          }
        }

        /* 4 streams — even 2x2 grid, every tile the same useful size. */
        .grid-4 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
        }

        .video-tile {
          position: relative;
          background: #000;
          border-radius: 14px;
          overflow: hidden;
          min-height: 0;
          min-width: 0;
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

        /* Gift targeting (#986 receiverId -> participant.userId, resolved
           via resolveGiftTargetParticipant) — a brief halo/pulse on the
           recipient's tile so it's unambiguous which camera received the
           Gift. Presentational only; auto-clears with the parent timeout
           and never touches tracks/subscriptions/Agora lifecycle. */
        .gift-target-tile {
          border-color: #d946ef;
          box-shadow: 0 0 0 2px rgba(217, 70, 239, 0.55), 0 0 28px rgba(139, 92, 246, 0.5);
        }

        .gift-target-ring {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          border-radius: inherit;
          box-shadow: 0 0 0 3px rgba(217, 70, 239, 0.65);
          animation: gift-target-pulse 1.1s ease-out 2;
        }

        @keyframes gift-target-pulse {
          0% { box-shadow: 0 0 0 3px rgba(217, 70, 239, 0.7); opacity: 1; }
          70% { box-shadow: 0 0 0 10px rgba(217, 70, 239, 0); opacity: 0.6; }
          100% { box-shadow: 0 0 0 3px rgba(217, 70, 239, 0.7); opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .gift-target-ring {
            animation: none;
            box-shadow: 0 0 0 3px rgba(217, 70, 239, 0.7);
          }
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

        /* Compact identity overlay: only a thin bottom gradient + a small
           pill, so it never covers faces or eats into the video surface. */
        .participant-info {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0.5rem;
          padding-top: 1.75rem;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.65) 0%, transparent 100%);
          z-index: 2;
          pointer-events: none;
        }

        .participant-badge {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(0, 0, 0, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          padding: 0.25rem 0.6rem;
          font-size: 0.78rem;
          font-weight: 600;
          color: #fff;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          /* Never wider than its own tile — keeps the badge from invading
             a neighboring tile when two cameras sit side by side. */
          max-width: 100%;
          box-sizing: border-box;
          min-width: 0;
        }

        .host-icon {
          font-size: 0.85rem;
          flex-shrink: 0;
        }

        .participant-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex: 1 1 auto;
        }

        /* Narrow tiles (2/3/4-up on small phones) get a tighter cap so long
           usernames always truncate well before reaching the tile edge. */
        @media (max-width: 480px) {
          .participant-info {
            padding: 0.4rem;
            padding-top: 1.5rem;
          }

          .participant-badge {
            padding: 0.2rem 0.5rem;
            font-size: 0.72rem;
            max-width: calc(100% - 0.2rem);
          }
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
      `}</style>
    </div>
  );
}
