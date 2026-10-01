"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { clearToken } from "@/lib/token";
import socket, { configureSocketAuth } from "@/lib/socket";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDisplayName } from "@/lib/imageHelpers";
import { useAndroidScreenCaptureProtection } from "@/lib/screenCaptureProtection";
import ModerationActions from "@/components/ModerationActions";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// GET /api/random/status is the authoritative fallback (per #964); poll it
// while waiting/matched in case a Socket.io event is missed (reconnects,
// background tab, etc).
const STATUS_POLL_MS = 3000;
// Short Agora reconnect grace before we treat the peer as gone, mirrors the
// existing /call/[id] pattern.
const RECONNECT_GRACE_MS = 15000;

// Same helper as frontend/app/call/[id]/page.jsx: finds the device id behind
// the currently active camera track, falling back to the first camera.
const getActiveCameraDeviceId = (videoTrack, cameras) => {
  const trackLabel = typeof videoTrack?.getTrackLabel === "function" ? videoTrack.getTrackLabel() : "";
  const activeCamera = cameras.find((camera) => camera.label && camera.label === trackLabel);
  return activeCamera?.deviceId || cameras[0]?.deviceId || "";
};

export default function RandomPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { t } = useLanguage();
  useAndroidScreenCaptureProtection();

  // idle | searching | connecting | connected | reconnecting | ended
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [peer, setPeer] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [cameraCount, setCameraCount] = useState(0);
  const [switchingCamera, setSwitchingCamera] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const agoraClientRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const currentCameraDeviceIdRef = useRef("");
  const sessionIdRef = useRef(null);
  const statusPollRef = useRef(null);
  const reconnectRef = useRef(null);
  const tokenRef = useRef(
    typeof window !== "undefined" ? localStorage.getItem("token") : null
  );
  const mountedRef = useRef(true);
  const agoraStartingRef = useRef(false);
  const callRandomRef = useRef(null);
  const startAgoraRef = useRef(null);

  const apiHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: "Bearer " + (tokenRef.current || ""),
    }),
    []
  );

  // ── Agora cleanup ────────────────────────────────────────────────────────
  const cleanupAgora = useCallback(async () => {
    clearTimeout(reconnectRef.current);
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.close();
      localAudioTrackRef.current = null;
    }
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.close();
      localVideoTrackRef.current = null;
    }
    if (agoraClientRef.current) {
      try {
        await agoraClientRef.current.leave();
      } catch {
        /* ignore */
      }
      agoraClientRef.current = null;
    }
    currentCameraDeviceIdRef.current = "";
    setCameraCount(0);
    setHasRemoteVideo(false);
  }, []);

  // ── Join the Agora channel for the matched Random session ──────────────
  const startAgora = useCallback(
    async (sessionId) => {
      if (agoraStartingRef.current || agoraClientRef.current) return;
      agoraStartingRef.current = true;
      setPhase("connecting");

      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

        const tokenRes = await fetch(
          API_URL + "/api/agora/token?channelName=" + encodeURIComponent(sessionId) + "&role=publisher",
          { headers: { Authorization: "Bearer " + (tokenRef.current || "") } }
        );
        if (!tokenRes.ok) throw new Error("agora_token_failed");
        const { token: agoraToken, uid, appId } = await tokenRes.json();
        if (!appId) throw new Error("agora_token_failed");

        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        agoraClientRef.current = client;

        client.on("user-published", async (user, mediaType) => {
          clearTimeout(reconnectRef.current);
          await client.subscribe(user, mediaType);
          if (mediaType === "video" && remoteVideoRef.current) {
            user.videoTrack?.play(remoteVideoRef.current);
            setHasRemoteVideo(true);
          }
          if (mediaType === "audio") {
            user.audioTrack?.play();
          }
          setPhase("connected");
        });

        client.on("user-unpublished", (user, mediaType) => {
          if (mediaType === "video") {
            user.videoTrack?.stop();
            setHasRemoteVideo(false);
          }
        });

        client.on("user-left", () => {
          clearTimeout(reconnectRef.current);
          setPhase("reconnecting");
          reconnectRef.current = setTimeout(async () => {
            // Grace period expired without the peer coming back. Do NOT
            // auto re-queue (POST /join) — reconcile with the authoritative
            // GET /status instead: if the backend still reports this same
            // session as matched, just retry the Agora connection; otherwise
            // land on a terminal "ended" state with an explicit CTA and let
            // the user decide whether to search again.
            await cleanupAgora();
            try {
              const result = await callRandomRef.current?.("status");
              if (result?.status === "matched" && result.sessionId === sessionIdRef.current) {
                startAgoraRef.current?.(result.sessionId);
                return;
              }
            } catch {
              /* fall through to ended state */
            }
            sessionIdRef.current = null;
            setPeer(null);
            setPhase("ended");
          }, RECONNECT_GRACE_MS);
        });

        let audioTrack;
        let videoTrack;
        try {
          [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        } catch (permissionError) {
          const denied =
            permissionError?.name === "NotAllowedError" ||
            permissionError?.code === "PERMISSION_DENIED" ||
            /permission|denied|not allowed/i.test(permissionError?.message || "");
          setError(denied ? t("random.permissionDenied") : t("random.mediaError"));
          await cleanupAgora();
          setPhase("ended");
          return;
        }

        localAudioTrackRef.current = audioTrack;
        localVideoTrackRef.current = videoTrack;

        await client.join(appId, String(sessionId), agoraToken, uid);
        await client.publish([audioTrack, videoTrack]);

        if (localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }

        const cameras = await AgoraRTC.getCameras().catch(() => []);
        setCameraCount(cameras.length);
        currentCameraDeviceIdRef.current = getActiveCameraDeviceId(videoTrack, cameras);
      } catch (err) {
        setError(
          err?.message === "agora_token_failed"
            ? t("random.connectError")
            : t("random.connectError")
        );
        await cleanupAgora();
        setPhase("ended");
      } finally {
        agoraStartingRef.current = false;
      }
    },
    [cleanupAgora, t]
  );

  useEffect(() => {
    startAgoraRef.current = startAgora;
  }, [startAgora]);

  // ── Backend Random actions ──────────────────────────────────────────────
  const applyResult = useCallback(
    (result) => {
      if (!mountedRef.current) return;
      if (result?.status === "matched") {
        if (sessionIdRef.current === result.sessionId && agoraClientRef.current) return;
        sessionIdRef.current = result.sessionId;
        setPeer(result.peer || null);
        setError("");
        startAgora(result.sessionId);
      } else if (result?.status === "waiting") {
        sessionIdRef.current = null;
        setPeer(null);
        setPhase("searching");
      } else {
        sessionIdRef.current = null;
        setPeer(null);
        setPhase("idle");
      }
    },
    [startAgora]
  );

  const callRandom = useCallback(
    async (action) => {
      const res = await fetch(API_URL + "/api/random/" + action, {
        method: action === "status" ? "GET" : "POST",
        headers: apiHeaders(),
      });
      if (res.status === 401) {
        clearToken();
        router.replace("/login");
        return null;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "random_action_failed");
      return data;
    },
    [apiHeaders, router]
  );

  useEffect(() => {
    callRandomRef.current = callRandom;
  }, [callRandom]);

  const joinRandom = useCallback(async () => {
    setError("");
    setPhase("searching");
    try {
      const result = await callRandom("join");
      if (result) applyResult(result);
    } catch {
      setError(t("random.searchError"));
      setPhase("ended");
    }
  }, [applyResult, callRandom, t]);

  // Explicit, user-initiated re-entry into the search (bound to the
  // "Buscar otra persona" CTA). Never called automatically.
  const searchAgain = useCallback(async () => {
    await cleanupAgora();
    setPeer(null);
    sessionIdRef.current = null;
    await joinRandom();
  }, [cleanupAgora, joinRandom]);

  // ── Initial mount: auth + connect socket + recover prior state only ─────
  // IMPORTANT: opening /random must NEVER call POST /join automatically.
  // We only call GET /status to recover a legitimate pre-existing
  // waiting/matched session (e.g. the user refreshed mid-search); a brand
  // new visit in the idle state stays IDLE until the user taps the
  // explicit "Entrar a Random" CTA.
  useEffect(() => {
    mountedRef.current = true;
    if (sessionStatus === "loading" && !session?.backendToken && !tokenRef.current) return undefined;

    tokenRef.current = session?.backendToken || tokenRef.current;
    if (!tokenRef.current) {
      clearToken();
      router.replace("/login");
      return undefined;
    }

    configureSocketAuth(tokenRef.current);
    if (!socket.connected) socket.connect();

    callRandom("status").then((result) => result && applyResult(result)).catch(() => {});

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.backendToken, sessionStatus]);

  // ── Socket events (push) ────────────────────────────────────────────────
  useEffect(() => {
    const handleMatched = () => {
      callRandom("status").then((result) => result && applyResult(result)).catch(() => {});
    };
    const handleEnded = (payload) => {
      if (payload?.sessionId && payload.sessionId !== sessionIdRef.current) return;
      if (exiting) return;
      // The peer left/next'd (or our own leave/next already reassigned
      // sessionIdRef, in which case this is filtered out by the check
      // above). Clean up Agora and land on a terminal state with an
      // explicit CTA — NEVER auto re-queue (POST /join) on the peer's
      // behalf. The user decides if/when to search again.
      cleanupAgora();
      sessionIdRef.current = null;
      setPeer(null);
      setPhase("ended");
    };

    socket.on("random_matched", handleMatched);
    socket.on("random_ended", handleEnded);
    return () => {
      socket.off("random_matched", handleMatched);
      socket.off("random_ended", handleEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  // ── GET /status polling fallback (authoritative source per #964) ───────
  useEffect(() => {
    if (exiting) return undefined;
    statusPollRef.current = setInterval(() => {
      if (phase !== "searching" && phase !== "connecting" && phase !== "connected" && phase !== "reconnecting") return;
      callRandom("status")
        .then((result) => {
          if (!result) return;
          if (result.status === "idle" && sessionIdRef.current) {
            // We had a session and the server no longer reports it — the
            // session ended without a socket event reaching us. Same rule
            // as handleEnded: terminal state + explicit CTA, no auto /join.
            cleanupAgora();
            sessionIdRef.current = null;
            setPeer(null);
            setPhase("ended");
            return;
          }
          if (result.status === "matched" && result.sessionId !== sessionIdRef.current) {
            applyResult(result);
          }
        })
        .catch(() => {});
    }, STATUS_POLL_MS);
    return () => clearInterval(statusPollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, exiting]);

  // ── Unmount cleanup ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(statusPollRef.current);
      clearTimeout(reconnectRef.current);
      if (localAudioTrackRef.current) localAudioTrackRef.current.close();
      if (localVideoTrackRef.current) localVideoTrackRef.current.close();
      if (agoraClientRef.current) agoraClientRef.current.leave().catch(() => {});
    };
  }, []);

  // ── Controls ─────────────────────────────────────────────────────────────
  const handleNext = async () => {
    try {
      await cleanupAgora();
      const result = await callRandom("next");
      if (result) applyResult(result);
    } catch {
      setError(t("random.searchError"));
    }
  };

  const handleExit = async () => {
    setExiting(true);
    clearInterval(statusPollRef.current);
    await cleanupAgora();
    try {
      await callRandom("leave");
    } catch {
      /* ignore — leaving regardless */
    }
    router.replace("/dashboard");
  };

  // Reuses the existing ModerationActions/onBlocked contract (same pattern
  // as frontend/app/call/[id]/page.jsx): once the existing block action
  // reports success, end the current Random session — cleanup Agora, leave
  // the session if still active, and land on the terminal "ended" state with
  // the explicit "search again" CTA. Never auto re-queue (no POST /join).
  const handleBlockedPeer = async () => {
    const hadActiveSession = Boolean(sessionIdRef.current);
    await cleanupAgora();
    sessionIdRef.current = null;
    setPeer(null);
    if (hadActiveSession) {
      try {
        await callRandom("leave");
      } catch {
        /* ignore — the session is ending regardless of backend ack */
      }
    }
    setPhase("ended");
  };

  const toggleMute = () => {
    if (localAudioTrackRef.current) {
      const newMuted = !muted;
      localAudioTrackRef.current.setEnabled(!newMuted);
      setMuted(newMuted);
    }
  };

  const toggleCamera = () => {
    if (localVideoTrackRef.current) {
      const newCameraOff = !cameraOff;
      localVideoTrackRef.current.setEnabled(!newCameraOff);
      setCameraOff(newCameraOff);
    }
  };

  // Same front/back camera switch pattern as frontend/app/call/[id]/page.jsx
  // (AgoraRTC.getCameras() + track.setDevice()), only shown when the device
  // actually exposes more than one camera.
  const switchCamera = async () => {
    if (!localVideoTrackRef.current || switchingCamera) return;
    setSwitchingCamera(true);
    try {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const cameras = await AgoraRTC.getCameras();
      setCameraCount(cameras.length);
      if (cameras.length < 2) return;
      const currentIndex = cameras.findIndex((camera) => camera.deviceId === currentCameraDeviceIdRef.current);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % cameras.length;
      const nextCamera = cameras[nextIndex];
      if (typeof localVideoTrackRef.current.setDevice !== "function") {
        setError(t("random.cameraSwitchUnavailable"));
        return;
      }
      if (nextCamera?.deviceId) {
        await localVideoTrackRef.current.setDevice(nextCamera.deviceId);
        currentCameraDeviceIdRef.current = nextCamera.deviceId;
        setCameraOff(false);
      }
    } catch {
      /* ignore — camera switching is a best-effort convenience control */
    } finally {
      setSwitchingCamera(false);
    }
  };

  const peerName = peer ? getDisplayName(peer) : "";
  const isInSession = phase === "connecting" || phase === "connected" || phase === "reconnecting";

  return (
    <div className="random-page">
      <div className="random-page__header">
        <span className="random-page__title">{t("random.title")}</span>
        <button type="button" className="random-page__exit" onClick={handleExit} disabled={exiting}>
          {t("random.exit")}
        </button>
      </div>

      {error && <div className="random-page__error">{error}</div>}

      {phase === "idle" && (
        <div className="random-page__searching">
          <p>{t("random.idleIntro")}</p>
          <button type="button" className="random-page__next" onClick={joinRandom}>
            {t("random.enterCta")}
          </button>
        </div>
      )}

      {phase === "searching" && (
        <div className="random-page__searching">
          <div className="random-page__spinner" aria-hidden="true" />
          <p>{t("random.searching")}</p>
        </div>
      )}

      {phase === "ended" && (
        <div className="random-page__searching">
          <p>{error || t("random.sessionEndedMessage")}</p>
          <button type="button" className="random-page__next" onClick={searchAgain}>
            {t("random.searchAgain")}
          </button>
        </div>
      )}

      {isInSession && (
        <div className="random-page__stage">
          <div ref={remoteVideoRef} className="random-page__remote-video" />
          {!hasRemoteVideo && (
            <div className="random-page__remote-placeholder">
              <p>{peerName || t("random.connecting")}</p>
              <p className="random-page__status-label">
                {phase === "reconnecting" ? t("random.reconnecting") : t("random.connecting")}
              </p>
            </div>
          )}
          <div ref={localVideoRef} className="random-page__local-video" />
        </div>
      )}

      {isInSession && (
        <div className="random-page__controls">
          <button type="button" onClick={toggleMute} className={muted ? "active" : ""}>
            {muted ? t("random.unmute") : t("random.mute")}
          </button>
          <button type="button" onClick={toggleCamera} className={cameraOff ? "active" : ""}>
            {cameraOff ? t("random.cameraOn") : t("random.cameraOff")}
          </button>
          {cameraCount > 1 && (
            <button type="button" onClick={switchCamera} disabled={switchingCamera}>
              {switchingCamera ? t("random.switchingCamera") : t("random.switchCamera")}
            </button>
          )}
          {peer?.id && (
            <div className="random-page__moderation">
              <ModerationActions
                targetUserId={peer.id}
                targetName={peerName}
                onBlocked={handleBlockedPeer}
                compact
                reportLabel={t("common.report")}
              />
            </div>
          )}
          <button type="button" className="random-page__next" onClick={handleNext}>
            {t("random.next")}
          </button>
        </div>
      )}

      <style jsx>{`
        .random-page {
          position: fixed;
          inset: 0;
          background: linear-gradient(145deg, #06020f 0%, #12062a 48%, #05020b 100%);
          z-index: 300;
          display: flex;
          flex-direction: column;
          color: #fff;
          overflow: hidden;
        }
        .random-page__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
        }
        .random-page__title {
          font-weight: 700;
          font-size: 1.1rem;
        }
        .random-page__exit {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #fff;
          padding: 8px 16px;
          border-radius: 999px;
        }
        .random-page__error {
          margin: 0 16px;
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.2);
          border-radius: 10px;
        }
        .random-page__searching {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }
        .random-page__spinner {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 4px solid rgba(255, 255, 255, 0.2);
          border-top-color: #e040fb;
          animation: random-spin 0.9s linear infinite;
        }
        @keyframes random-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .random-page__stage {
          flex: 1;
          position: relative;
        }
        .random-page__remote-video,
        .random-page__remote-placeholder {
          position: absolute;
          inset: 0;
        }
        .random-page__remote-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .random-page__status-label {
          opacity: 0.7;
          font-size: 0.9rem;
        }
        .random-page__local-video {
          position: absolute;
          right: 16px;
          bottom: 16px;
          width: 110px;
          height: 150px;
          border-radius: 14px;
          overflow: hidden;
          background: #000;
          border: 2px solid rgba(255, 255, 255, 0.2);
        }
        .random-page__controls {
          display: flex;
          justify-content: center;
          gap: 12px;
          padding: 16px;
        }
        .random-page__controls button {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #fff;
          padding: 12px 18px;
          border-radius: 999px;
        }
        .random-page__controls button.active {
          background: rgba(239, 68, 68, 0.4);
        }
        .random-page__moderation {
          flex: 0 0 auto;
          min-width: 150px;
        }
        .random-page__next {
          background: linear-gradient(135deg, #e040fb, #7c3aed) !important;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
