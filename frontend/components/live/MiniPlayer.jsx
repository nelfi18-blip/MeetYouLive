"use client";

/**
 * MiniPlayer — persistent, draggable floating video shown while a Live
 * session is minimized (the user navigated away from /live/[id] without
 * ending the stream / leaving). Mounted once in app/layout.jsx so it
 * survives internal navigation.
 *
 * It reads the real (still-connected) Agora client/tracks directly from
 * the liveSessionStore singleton — the live room page component that
 * created them is unmounted at this point, so this is the only place that
 * still has a handle on them. See frontend/lib/liveSession/liveSessionStore.js.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLiveSession } from "@/contexts/LiveSessionContext";
import * as liveSessionStore from "@/lib/liveSession/liveSessionStore";

// Surfaces where a floating video must never be shown: auth/onboarding and
// other sensitive flows (requirement: don't risk privacy/auth confusion).
const HIDDEN_PATH_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/onboarding",
  "/account-deletion",
  "/admin",
];

function isHiddenRoute(pathname) {
  if (!pathname) return false;
  return HIDDEN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const DEFAULT_POSITION = { x: 16, y: 88 };
const WIDTH = 150;
const HEIGHT = 230;

export default function MiniPlayer() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { session, restoreSession, closeSession, requestEndStream } = useLiveSession();
  const [muted, setMuted] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const videoContainerRef = useRef(null);
  const dragStateRef = useRef(null);

  const { liveId, isHost, minimized, creatorName, creatorAvatar } = session;
  const visible = !!liveId && minimized && !isHiddenRoute(pathname);

  // Play the backgrounded video track (host's own camera, or the remote
  // host/guest the viewer was watching) into this box whenever it becomes
  // visible or the session's tracks change.
  useEffect(() => {
    if (!visible || !videoContainerRef.current) return;
    const suspended = liveSessionStore.getSuspended(liveId);
    if (!suspended) return;

    let played = false;
    if (suspended.isPublisher && suspended.localVideoTrack) {
      try {
        suspended.localVideoTrack.play(videoContainerRef.current);
        played = true;
      } catch {
        // ignore — track may not be ready yet
      }
    }
    if (!played && suspended.client) {
      const remoteWithVideo = suspended.client.remoteUsers?.find((u) => u.hasVideo && u.videoTrack);
      if (remoteWithVideo) {
        try {
          remoteWithVideo.videoTrack.play(videoContainerRef.current);
        } catch {
          // ignore
        }
      }
    }
  }, [visible, liveId, minimized]);

  // Reflect the viewer's mute choice on the remote audio track. Hosts don't
  // get a mute control (they'd be muting their own mic monitor, not useful).
  useEffect(() => {
    if (!visible || isHost) return;
    const suspended = liveSessionStore.getSuspended(liveId);
    const remoteWithAudio = suspended?.client?.remoteUsers?.find((u) => u.hasAudio && u.audioTrack);
    remoteWithAudio?.audioTrack?.setVolume?.(muted ? 0 : 100);
  }, [visible, isHost, liveId, muted]);

  const handlePointerDown = (event) => {
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const maxX = (typeof window !== "undefined" ? window.innerWidth : WIDTH + 32) - WIDTH;
    const maxY = (typeof window !== "undefined" ? window.innerHeight : HEIGHT + 32) - HEIGHT;
    setPosition({
      x: Math.min(Math.max(0, drag.originX + dx), Math.max(0, maxX)),
      y: Math.min(Math.max(0, drag.originY + dy), Math.max(0, maxY)),
    });
  };

  const handlePointerUp = () => {
    dragStateRef.current = null;
  };

  if (!visible) return null;

  const handleEndStreamClick = async () => {
    setConfirmingEnd(false);
    await requestEndStream();
  };

  return (
    <div
      className="mini-player"
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label={t("miniPlayer.liveLabel")}
    >
      <div
        className="mini-player-drag"
        aria-label={t("miniPlayer.dragHandle")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="mini-player-live-badge">🔴 {t("miniPlayer.liveLabel")}</span>
        {!isHost && (
          <button
            type="button"
            className="mini-player-close"
            aria-label={t("miniPlayer.close")}
            onClick={closeSession}
          >
            ✕
          </button>
        )}
      </div>

      <button
        type="button"
        className="mini-player-video-btn"
        aria-label={t("miniPlayer.restore")}
        onClick={restoreSession}
      >
        <div ref={videoContainerRef} className="mini-player-video" />
        {!isHost && (
          <span className="mini-player-creator">
            {creatorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creatorAvatar} alt="" className="mini-player-avatar" />
            ) : null}
            {creatorName}
          </span>
        )}
      </button>

      <div className="mini-player-controls">
        {!isHost && (
          <button
            type="button"
            className="mini-player-btn"
            aria-label={muted ? t("miniPlayer.unmute") : t("miniPlayer.mute")}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        )}
        <button
          type="button"
          className="mini-player-btn mini-player-btn-primary"
          aria-label={t("miniPlayer.restore")}
          onClick={restoreSession}
        >
          ⤴
        </button>
        {isHost && (
          <button
            type="button"
            className="mini-player-btn mini-player-btn-danger"
            aria-label={t("miniPlayer.endStream")}
            onClick={() => setConfirmingEnd(true)}
          >
            ⏹
          </button>
        )}
      </div>

      {confirmingEnd && (
        <div className="mini-player-confirm">
          <p>{t("miniPlayer.endStreamConfirm")}</p>
          <div className="mini-player-confirm-actions">
            <button type="button" onClick={() => setConfirmingEnd(false)}>
              {t("miniPlayer.endStreamConfirmNo")}
            </button>
            <button type="button" className="mini-player-btn-danger" onClick={handleEndStreamClick}>
              {t("miniPlayer.endStreamConfirmYes")}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .mini-player {
          position: fixed;
          width: ${WIDTH}px;
          z-index: 2000;
          background: #0f0821;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          touch-action: none;
        }
        .mini-player-drag {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 6px;
          cursor: grab;
          background: rgba(0, 0, 0, 0.35);
        }
        .mini-player-live-badge {
          font-size: 0.65rem;
          font-weight: 700;
          color: #fff;
        }
        .mini-player-close {
          background: transparent;
          border: none;
          color: #fff;
          font-size: 0.8rem;
          cursor: pointer;
          line-height: 1;
          padding: 2px 4px;
        }
        .mini-player-video-btn {
          display: block;
          width: 100%;
          padding: 0;
          border: none;
          background: #000;
          cursor: pointer;
          position: relative;
        }
        .mini-player-video {
          width: 100%;
          height: ${HEIGHT - 70}px;
          background: #000;
        }
        .mini-player-creator {
          position: absolute;
          left: 6px;
          bottom: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.68rem;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
          max-width: calc(100% - 12px);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mini-player-avatar {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          object-fit: cover;
        }
        .mini-player-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 6px;
          background: rgba(0, 0, 0, 0.35);
        }
        .mini-player-btn {
          background: rgba(255, 255, 255, 0.12);
          border: none;
          color: #fff;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .mini-player-btn-primary {
          background: var(--accent, #ff0f8a);
        }
        .mini-player-btn-danger {
          background: #e11d48;
          color: #fff;
        }
        .mini-player-confirm {
          position: absolute;
          inset: 0;
          background: rgba(6, 4, 17, 0.95);
          padding: 10px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 8px;
          z-index: 1;
        }
        .mini-player-confirm p {
          color: #fff;
          font-size: 0.7rem;
          margin: 0;
        }
        .mini-player-confirm-actions {
          display: flex;
          gap: 6px;
        }
        .mini-player-confirm-actions button {
          flex: 1;
          border: none;
          border-radius: 8px;
          padding: 6px 4px;
          font-size: 0.68rem;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
