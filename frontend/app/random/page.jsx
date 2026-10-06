"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { clearToken } from "@/lib/token";
import socket, { configureSocketAuth } from "@/lib/socket";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDisplayName, getUserImage, getInitial, getGradientForUser } from "@/lib/imageHelpers";
import { useAndroidScreenCaptureProtection } from "@/lib/screenCaptureProtection";
import ModerationActions from "@/components/ModerationActions";
import {
  MicIcon,
  MicOffIcon,
  CameraIcon,
  CameraOffIcon,
  SwitchCameraIcon,
  NextIcon,
  ExitIcon,
  SafetyIcon,
  PersonIcon,
  CloseIcon,
} from "./randomIcons";

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
  // Purely presentational — never sent to the backend, never affects
  // sessionId/Random state. Counts seconds spent in the current visual
  // session and resets whenever the session ends/changes.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSafetySheet, setShowSafetySheet] = useState(false);

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

  // ── Presentational session timer ────────────────────────────────────────
  // Purely visual (mm:ss pill shown over the stage). Resets to 0 whenever a
  // brand-new match starts (phase transitions to "connecting") and keeps
  // counting through "reconnecting" so it reflects total session time.
  // Clears/resets once the visual session ends. Never touches sessionId,
  // Random state, or the backend in any way.
  useEffect(() => {
    const inSession = phase === "connecting" || phase === "connected" || phase === "reconnecting";
    if (phase === "connecting") setElapsedSeconds(0);
    if (!inSession) {
      setElapsedSeconds(0);
      return undefined;
    }
    const intervalId = setInterval(() => {
      setElapsedSeconds((previous) => previous + 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [phase]);

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

  // Explicit "Cancelar" action while phase === "searching": stop looking for
  // a match, release the queue entry via POST /api/random/leave, and return
  // to the idle state WITHOUT leaving /random and WITHOUT auto re-queuing.
  const handleCancelSearch = async () => {
    clearInterval(statusPollRef.current);
    await cleanupAgora();
    sessionIdRef.current = null;
    setPeer(null);
    setError("");
    try {
      await callRandom("leave");
    } catch {
      /* ignore — we're returning to idle regardless of backend ack */
    }
    setPhase("idle");
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
  const peerAvatarUrl = peer ? getUserImage(peer) : null;
  const peerInitial = getInitial(peerName);
  const peerGradient = getGradientForUser(peer?.id || peer?._id || peerName);

  // mm:ss presentational formatting for the session timer pill.
  const formattedElapsed =
    String(Math.floor(elapsedSeconds / 60)).padStart(2, "0") +
    ":" +
    String(elapsedSeconds % 60).padStart(2, "0");

  // Thin wrappers so the safety/options bottom sheet can close itself
  // before delegating to the existing, untouched handleNext/handleExit —
  // no duplication of their logic.
  const handleSheetNext = () => {
    setShowSafetySheet(false);
    handleNext();
  };
  const handleSheetExit = () => {
    setShowSafetySheet(false);
    handleExit();
  };
  const handleSheetBlocked = async () => {
    setShowSafetySheet(false);
    await handleBlockedPeer();
  };

  return (
    <div className={`random-page${isInSession ? " random-page--stage" : ""}`}>
      <div className="random-page__ambient" aria-hidden="true">
        <span className="random-page__orb random-page__orb--violet" />
        <span className="random-page__orb random-page__orb--magenta" />
        <span className="random-page__orb random-page__orb--blue" />
      </div>

      <div className="random-page__header">
        <span className="random-page__title">{t("random.title")}</span>
        <button
          type="button"
          className="random-page__exit"
          onClick={handleExit}
          disabled={exiting}
          aria-label={t("random.exit")}
          title={t("random.exit")}
        >
          <ExitIcon width={18} height={18} />
          <span className="random-page__exit-label">{t("random.exit")}</span>
        </button>
      </div>

      {error && <div className="random-page__error">{error}</div>}

      {phase === "idle" && (
        <div className="random-page__panel">
          <div className="random-page__panel-card">
            <p>{t("random.idleIntro")}</p>
            <button type="button" className="random-page__cta" onClick={joinRandom}>
              {t("random.enterCta")}
            </button>
          </div>
        </div>
      )}

      {phase === "searching" && (
        <div className="random-page__panel">
          <div className="random-page__panel-card">
            <div className="random-page__radar" aria-hidden="true">
              <span className="random-page__radar-ring random-page__radar-ring--1" />
              <span className="random-page__radar-ring random-page__radar-ring--2" />
              <span className="random-page__radar-ring random-page__radar-ring--3" />
              <span className="random-page__radar-core">
                <PersonIcon width={26} height={26} />
              </span>
            </div>
            <p>{t("random.searching")}</p>
            <button type="button" className="random-page__ghost-btn" onClick={handleCancelSearch}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {phase === "ended" && (
        <div className="random-page__panel">
          <div className="random-page__panel-card">
            <p>{error || t("random.sessionEndedMessage")}</p>
            <button type="button" className="random-page__cta" onClick={searchAgain}>
              {t("random.searchAgain")}
            </button>
          </div>
        </div>
      )}

      {isInSession && (
        <div className="random-page__stage">
          <div ref={remoteVideoRef} className="random-page__remote-video" />
          <div className="random-page__stage-scrim" aria-hidden="true" />

          <div className="random-page__timer" aria-live="off">
            <span className="random-page__timer-dot" aria-hidden="true" />
            <span className="random-page__timer-value">{formattedElapsed}</span>
          </div>

          {phase === "reconnecting" && (
            <div className="random-page__reconnect-pill" role="status">
              {t("random.reconnecting")}
            </div>
          )}

          {!hasRemoteVideo && (
            <div className="random-page__remote-placeholder">
              <div className="random-page__avatar" aria-hidden="true">
                {peerAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={peerAvatarUrl} alt="" className="random-page__avatar-img" />
                ) : (
                  <div className="random-page__avatar-fallback" style={{ background: peerGradient }}>
                    {peerInitial}
                  </div>
                )}
              </div>
              <p className="random-page__peer-name">{peerName || t("random.connecting")}</p>
              <p className={`random-page__status-label${phase === "reconnecting" ? " is-reconnecting" : ""}`}>
                {phase === "reconnecting" ? t("random.reconnecting") : t("random.connecting")}
              </p>
            </div>
          )}
          <div className="random-page__local-video-wrap">
            <div ref={localVideoRef} className="random-page__local-video" />
          </div>
        </div>
      )}

      {isInSession && (
        <div className="random-page__controls">
          <div className="random-page__controls-bar">
            <button
              type="button"
              className={`random-page__icon-btn${muted ? " is-active" : ""}`}
              onClick={toggleMute}
              aria-label={muted ? t("random.unmute") : t("random.mute")}
              title={muted ? t("random.unmute") : t("random.mute")}
            >
              {muted ? <MicOffIcon /> : <MicIcon />}
            </button>
            <button
              type="button"
              className={`random-page__icon-btn${cameraOff ? " is-active" : ""}`}
              onClick={toggleCamera}
              aria-label={cameraOff ? t("random.cameraOn") : t("random.cameraOff")}
              title={cameraOff ? t("random.cameraOn") : t("random.cameraOff")}
            >
              {cameraOff ? <CameraOffIcon /> : <CameraIcon />}
            </button>
            {cameraCount > 1 && (
              <button
                type="button"
                className="random-page__icon-btn"
                onClick={switchCamera}
                disabled={switchingCamera}
                aria-label={switchingCamera ? t("random.switchingCamera") : t("random.switchCamera")}
                title={switchingCamera ? t("random.switchingCamera") : t("random.switchCamera")}
              >
                <SwitchCameraIcon />
              </button>
            )}
            <button
              type="button"
              className="random-page__icon-btn"
              onClick={() => setShowSafetySheet(true)}
              aria-label={t("random.safetyOptions")}
              title={t("random.safetyOptions")}
            >
              <SafetyIcon />
            </button>
            <button type="button" className="random-page__next" onClick={handleNext} aria-label={t("random.next")} title={t("random.next")}>
              <NextIcon width={18} height={18} />
              <span className="random-page__next-label">{t("random.next")}</span>
            </button>
          </div>
        </div>
      )}

      {isInSession && showSafetySheet && (
        <div className="random-page__sheet-backdrop" onClick={() => setShowSafetySheet(false)}>
          <div
            className="random-page__sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="random-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="random-page__sheet-handle" aria-hidden="true" />
            <div className="random-page__sheet-header">
              <h2 id="random-sheet-title">{t("random.safetyOptions")}</h2>
              <button
                type="button"
                className="random-page__sheet-close"
                onClick={() => setShowSafetySheet(false)}
                aria-label={t("common.cancel")}
              >
                <CloseIcon width={18} height={18} />
              </button>
            </div>

            {peer?.id && (
              <div className="random-page__sheet-moderation">
                <ModerationActions
                  targetUserId={peer.id}
                  targetName={peerName}
                  onBlocked={handleSheetBlocked}
                  compact
                  reportLabel={t("common.report")}
                />
              </div>
            )}

            <div className="random-page__sheet-actions">
              <button type="button" className="random-page__sheet-action" onClick={handleSheetNext}>
                <NextIcon width={18} height={18} />
                {t("random.next")}
              </button>
              <button type="button" className="random-page__sheet-action danger" onClick={handleSheetExit}>
                <ExitIcon width={18} height={18} />
                {t("random.exit")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .random-page {
          position: fixed;
          inset: 0;
          background: radial-gradient(120% 90% at 50% 0%, #1a0b38 0%, #0a0418 46%, #04020a 100%);
          z-index: 300;
          display: flex;
          flex-direction: column;
          color: #fff;
          overflow: hidden;
          font-family: inherit;
        }
        .random-page__ambient {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .random-page__orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          opacity: 0.45;
          animation: random-orb-float 12s ease-in-out infinite;
        }
        .random-page__orb--violet {
          width: 280px;
          height: 280px;
          top: -60px;
          left: -60px;
          background: #7c3aed;
        }
        .random-page__orb--magenta {
          width: 320px;
          height: 320px;
          bottom: -100px;
          right: -80px;
          background: #e040fb;
          animation-delay: -4s;
        }
        .random-page__orb--blue {
          width: 240px;
          height: 240px;
          top: 40%;
          left: 50%;
          transform: translateX(-50%);
          background: #2563eb;
          animation-delay: -8s;
        }
        @keyframes random-orb-float {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(12px, -18px) scale(1.08);
          }
        }
        .random-page--stage .random-page__ambient {
          opacity: 0.6;
        }
        .random-page__header {
          position: relative;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 14px;
        }
        .random-page--stage .random-page__header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          background: linear-gradient(180deg, rgba(4, 2, 10, 0.65) 0%, rgba(4, 2, 10, 0) 100%);
        }
        .random-page__title {
          font-weight: 700;
          font-size: 1.05rem;
          letter-spacing: 0.01em;
          text-shadow: 0 2px 12px rgba(124, 58, 237, 0.5);
        }
        .random-page__exit {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 44px;
          min-height: 44px;
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #fff;
          padding: 8px 16px;
          border-radius: 999px;
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .random-page__exit:active {
          transform: scale(0.95);
        }
        .random-page__exit-label {
          font-size: 0.85rem;
          font-weight: 600;
        }
        .random-page__error {
          position: relative;
          z-index: 20;
          margin: 0 16px;
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.22);
          border: 1px solid rgba(239, 68, 68, 0.35);
          backdrop-filter: blur(10px);
          border-radius: 12px;
        }
        .random-page__panel {
          position: relative;
          z-index: 10;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .random-page__panel-card {
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          padding: 32px 24px;
          text-align: center;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45), 0 0 40px rgba(124, 58, 237, 0.18);
          animation: random-fade-in 0.4s ease;
        }
        @keyframes random-fade-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .random-page__radar {
          position: relative;
          width: 110px;
          height: 110px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .random-page__radar-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1.5px solid rgba(224, 64, 251, 0.45);
          box-shadow: 0 0 24px rgba(37, 99, 235, 0.25);
          animation: random-radar-pulse 2.4s ease-out infinite;
        }
        .random-page__radar-ring--2 {
          animation-delay: 0.6s;
        }
        .random-page__radar-ring--3 {
          animation-delay: 1.2s;
        }
        @keyframes random-radar-pulse {
          0% {
            transform: scale(0.55);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.4);
            opacity: 0;
          }
        }
        .random-page__radar-core {
          position: relative;
          z-index: 1;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #e040fb, #7c3aed 60%, #2563eb);
          box-shadow: 0 0 30px rgba(124, 58, 237, 0.55);
          color: #fff;
        }
        .random-page__cta,
        .random-page__ghost-btn {
          border: none;
          border-radius: 999px;
          padding: 14px 28px;
          min-height: 48px;
          font-weight: 700;
          font-size: 0.95rem;
          transition: transform 0.15s ease, box-shadow 0.2s ease;
        }
        .random-page__cta {
          background: linear-gradient(135deg, #e040fb, #7c3aed 60%, #2563eb);
          color: #fff;
          box-shadow: 0 10px 30px rgba(124, 58, 237, 0.45);
        }
        .random-page__cta:active {
          transform: scale(0.96);
        }
        .random-page__ghost-btn {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .random-page__ghost-btn:active {
          transform: scale(0.96);
        }
        .random-page__stage {
          flex: 1;
          position: relative;
          z-index: 5;
        }
        .random-page__remote-video {
          position: absolute;
          inset: 0;
          background: #000;
        }
        .random-page__remote-video :global(video) {
          object-fit: cover;
          width: 100% !important;
          height: 100% !important;
        }
        .random-page__stage-scrim {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            180deg,
            rgba(4, 2, 10, 0.55) 0%,
            rgba(4, 2, 10, 0) 22%,
            rgba(4, 2, 10, 0) 68%,
            rgba(4, 2, 10, 0.75) 100%
          );
        }
        .random-page__timer {
          position: absolute;
          top: calc(16px + env(safe-area-inset-top, 0px));
          left: 16px;
          z-index: 16;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .random-page__timer-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 8px rgba(52, 211, 153, 0.8);
        }
        .random-page__timer-value {
          font-variant-numeric: tabular-nums;
          font-weight: 700;
          font-size: 0.85rem;
          letter-spacing: 0.02em;
        }
        .random-page__reconnect-pill {
          position: absolute;
          top: calc(16px + env(safe-area-inset-top, 0px));
          left: 50%;
          transform: translateX(-50%);
          z-index: 16;
          padding: 8px 18px;
          border-radius: 999px;
          background: rgba(251, 191, 36, 0.18);
          border: 1px solid rgba(251, 191, 36, 0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          color: #fde68a;
          font-weight: 700;
          font-size: 0.85rem;
        }
        .random-page__remote-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: radial-gradient(60% 60% at 50% 42%, #1a0b38 0%, #05020b 100%);
        }
        .random-page__avatar {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: 0 0 0 3px rgba(224, 64, 251, 0.35), 0 0 36px rgba(124, 58, 237, 0.45);
          animation: random-pulse 1.8s ease-in-out infinite;
        }
        .random-page__avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .random-page__avatar-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.1rem;
          font-weight: 700;
          color: #fff;
        }
        @keyframes random-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.06);
            opacity: 1;
          }
        }
        .random-page__peer-name {
          font-weight: 700;
          font-size: 1.05rem;
        }
        .random-page__status-label {
          opacity: 0.75;
          font-size: 0.9rem;
        }
        .random-page__status-label.is-reconnecting {
          color: #fbbf24;
        }
        .random-page__local-video-wrap {
          position: absolute;
          right: 14px;
          bottom: 110px;
          width: 100px;
          height: 140px;
          border-radius: 18px;
          padding: 2px;
          background: linear-gradient(135deg, rgba(224, 64, 251, 0.6), rgba(37, 99, 235, 0.5));
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          z-index: 15;
        }
        .random-page__local-video {
          width: 100%;
          height: 100%;
          border-radius: 16px;
          overflow: hidden;
          background: #000;
        }
        .random-page__local-video :global(video) {
          object-fit: cover;
          width: 100% !important;
          height: 100% !important;
        }
        .random-page__controls {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 20;
          display: flex;
          justify-content: center;
          padding: 16px 12px calc(16px + env(safe-area-inset-bottom, 0px));
          background: linear-gradient(0deg, rgba(4, 2, 10, 0.75) 0%, rgba(4, 2, 10, 0) 100%);
        }
        .random-page__controls-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
        }
        .random-page__icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 50px;
          height: 50px;
          min-width: 44px;
          min-height: 44px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          transition: background 0.2s ease, transform 0.15s ease;
        }
        .random-page__icon-btn:active {
          transform: scale(0.92);
        }
        .random-page__icon-btn.is-active {
          background: rgba(239, 68, 68, 0.45);
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.4);
        }
        .random-page__next {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 44px;
          min-height: 48px;
          background: linear-gradient(135deg, #e040fb, #7c3aed 70%, #2563eb);
          border: none;
          color: #fff;
          font-weight: 700;
          padding: 12px 22px;
          border-radius: 999px;
          box-shadow: 0 10px 26px rgba(124, 58, 237, 0.45);
          transition: transform 0.15s ease;
        }
        .random-page__next:active {
          transform: scale(0.96);
        }
        .random-page__next-label {
          font-size: 0.9rem;
        }
        .random-page__sheet-backdrop {
          position: fixed;
          inset: 0;
          z-index: 400;
          background: rgba(2, 1, 8, 0.6);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-end;
          animation: random-fade-in 0.2s ease;
        }
        .random-page__sheet {
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
          background: rgba(20, 10, 36, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-top-left-radius: 24px;
          border-top-right-radius: 24px;
          padding: 10px 20px calc(20px + env(safe-area-inset-bottom, 0px));
          backdrop-filter: blur(26px);
          -webkit-backdrop-filter: blur(26px);
          box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.55);
        }
        .random-page__sheet-handle {
          width: 40px;
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.3);
          margin: 8px auto 14px;
        }
        .random-page__sheet-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .random-page__sheet-header h2 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
        }
        .random-page__sheet-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          min-width: 44px;
          min-height: 44px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        .random-page__sheet-moderation {
          margin-bottom: 14px;
        }
        .random-page__sheet-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .random-page__sheet-action {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 50px;
          padding: 12px 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.07);
          color: #fff;
          font-weight: 700;
          font-size: 0.95rem;
        }
        .random-page__sheet-action.danger {
          border-color: rgba(248, 113, 113, 0.35);
          color: #fecaca;
          background: rgba(248, 113, 113, 0.12);
        }
        @media (max-width: 480px) {
          .random-page__local-video-wrap {
            width: 84px;
            height: 118px;
            bottom: 98px;
          }
          .random-page__controls-bar {
            gap: 8px;
            padding: 8px 10px;
          }
          .random-page__icon-btn {
            width: 48px;
            height: 48px;
          }
          .random-page__next {
            padding: 10px 18px;
            font-size: 0.85rem;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .random-page__orb,
          .random-page__radar-ring,
          .random-page__avatar,
          .random-page__panel-card {
            animation: none !important;
          }
          .random-page__exit,
          .random-page__cta,
          .random-page__ghost-btn,
          .random-page__icon-btn,
          .random-page__next,
          .random-page__sheet-backdrop {
            transition: opacity 0.15s ease !important;
          }
          .random-page__exit:active,
          .random-page__cta:active,
          .random-page__ghost-btn:active,
          .random-page__icon-btn:active,
          .random-page__next:active {
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
