"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const POLL_MS = 1000; // polling interval for call acceptance

export default function CallPage() {
  const { id } = useParams();
  const router = useRouter();

  const [call, setCall] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading"); // loading | waiting | connecting | connected | ended | rejected | missed
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [remoteAvatar, setRemoteAvatar] = useState("");
  const [callDuration, setCallDuration] = useState(0); // seconds elapsed while connected
  const [totalCharged, setTotalCharged] = useState(0); // coins charged so far this call
  const [coinsWarning, setCoinsWarning] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const agoraClientRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
  const pollRef = useRef(null);
  const tickRef = useRef(null); // per-minute billing interval
  const durationRef = useRef(null); // 1-second timer
  const callRef = useRef(null); // kept in sync with call state for use inside intervals

  const token = useRef(
    typeof window !== "undefined" ? localStorage.getItem("token") : null
  );

  const apiHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.current}`,
    }),
    []
  );

  // ── Clean up on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearInterval(tickRef.current);
      clearInterval(durationRef.current);
      const { audio, video } = localTracksRef.current;
      if (audio) audio.close();
      if (video) video.close();
      localTracksRef.current = { audio: null, video: null };
      if (agoraClientRef.current) {
        agoraClientRef.current.leave().catch(() => {});
        agoraClientRef.current = null;
      }
    };
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token.current) {
      clearToken();
      router.replace("/login");
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/calls/${id}`, {
          headers: { Authorization: `Bearer ${token.current}` },
        });
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setError("No se pudo cargar la llamada");
          setStatus("ended");
          return;
        }
        const data = await res.json();
        setCall(data);
        callRef.current = data;

        const me = localStorage.getItem("userId") || "";
        const callerIsMe = String(data.caller._id) === me;
        setIsCaller(callerIsMe);

        // Seed totalCharged from already-recorded billing totals on the call
        if (callerIsMe && data.type === "paid_creator") {
          setTotalCharged(data.totalCoinsCharged || 0);
        }

        const remote = callerIsMe ? data.recipient : data.caller;
        setRemoteName(remote?.username || remote?.name || "Usuario");
        setRemoteAvatar(remote?.avatar || "");

        if (data.status === "rejected") { setStatus("rejected"); return; }
        if (data.status === "ended" || data.status === "missed") { setStatus("ended"); return; }
        if (data.status === "accepted") {
          startAgora(data);
        } else {
          // status is pending — caller waits for recipient to accept
          setStatus(callerIsMe ? "waiting" : "connecting");
          if (!callerIsMe) {
            startAgora(data);
          } else {
            pollForAcceptance(data);
          }
        }
      } catch {
        setError("Error de conexión");
        setStatus("ended");
      }
    };

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Per-minute billing & duration timer for connected paid calls ──────────
  useEffect(() => {
    if (status !== "connected") return;
    const currentCall = callRef.current;
    const isPaidCall = currentCall?.type === "paid_creator" && currentCall?.callCoins > 0;
    const isCallerUser = String(currentCall?.caller?._id || currentCall?.caller) ===
      (typeof window !== "undefined" ? localStorage.getItem("userId") : "");

    // Duration counter (every second)
    durationRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);

    // Coin tick every 60 seconds — only the caller triggers billing
    if (isPaidCall && isCallerUser) {
      tickRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/calls/${currentCall._id}/tick`, {
            method: "POST",
            headers: apiHeaders(),
          });
          const data = await res.json();
          if (res.status === 402 && data.ended) {
            // Out of coins — call ended by backend
            clearInterval(tickRef.current);
            clearInterval(durationRef.current);
            const { audio, video } = localTracksRef.current;
            if (audio) audio.close();
            if (video) video.close();
            localTracksRef.current = { audio: null, video: null };
            if (agoraClientRef.current) {
              await agoraClientRef.current.leave().catch(() => {});
              agoraClientRef.current = null;
            }
            setCoinsWarning("Sin monedas suficientes. La llamada ha terminado.");
            setStatus("ended");
          } else if (res.ok && data.coinsDeducted) {
            setTotalCharged((prev) => prev + data.coinsDeducted);
            setCoinsWarning("");
          } else if (!res.ok) {
            setCoinsWarning(data.message || "Error en facturación por minuto.");
          }
        } catch {
          // ignore tick errors silently
        }
      }, 60000);
    }

    return () => {
      clearInterval(tickRef.current);
      clearInterval(durationRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ── Poll until recipient accepts, then start Agora ─────────────────────
  const pollForAcceptance = useCallback(
    (callData) => {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/calls/${callData._id}`, {
            headers: { Authorization: `Bearer ${token.current}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === "accepted") {
            clearInterval(pollRef.current);
            setCall(data);
            callRef.current = data;
            startAgora(data);
          } else if (["rejected", "ended", "missed"].includes(data.status)) {
            clearInterval(pollRef.current);
            setStatus(data.status === "rejected" ? "rejected" : "ended");
          }
        } catch {
          // ignore
        }
      }, POLL_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Agora RTC setup for private calls ────────────────────────────────────
  const startAgora = useCallback(
    async (callData) => {
      setStatus("connecting");

      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

        // Fetch Agora token from backend — both call participants are publishers
        const tokenRes = await fetch(
          `${API_URL}/api/agora/token?channelName=${callData._id}&role=publisher`,
          { headers: { Authorization: `Bearer ${token.current}` } }
        );
        if (!tokenRes.ok) {
          const err = await tokenRes.json();
          setError(err.message || "No se pudo obtener token de Agora");
          setStatus("ended");
          return;
        }
        const { token: agoraToken, uid, appId } = await tokenRes.json();

        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        agoraClientRef.current = client;

        // Subscribe to remote user streams
        client.on("user-published", async (remoteUser, mediaType) => {
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === "video" && remoteVideoRef.current) {
            remoteUser.videoTrack.play(remoteVideoRef.current);
            setStatus("connected");
          }
          if (mediaType === "audio") {
            remoteUser.audioTrack.play();
          }
        });

        client.on("user-left", () => {
          setStatus("ended");
        });

        await client.join(appId, callData._id, agoraToken, uid);

        // Publish local tracks
        const [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current = { audio: micTrack, video: camTrack };

        if (localVideoRef.current) {
          camTrack.play(localVideoRef.current);
        }

        await client.publish([micTrack, camTrack]);
        setStatus("connecting"); // wait for remote user to appear
      } catch (err) {
        setError(err.message || "Error al conectar con Agora");
        setStatus("ended");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleEnd = async () => {
    clearInterval(pollRef.current);
    const { audio, video } = localTracksRef.current;
    if (audio) audio.close();
    if (video) video.close();
    localTracksRef.current = { audio: null, video: null };
    if (agoraClientRef.current) {
      await agoraClientRef.current.leave().catch(() => {});
      agoraClientRef.current = null;
    }

    try {
      await fetch(`${API_URL}/api/calls/${id}/end`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token.current}` },
      });
    } catch {
      // ignore
    }
    router.replace("/chats");
  };

  const toggleMute = () => {
    const { audio } = localTracksRef.current;
    if (!audio) return;
    audio.setEnabled(muted);
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    const { video } = localTracksRef.current;
    if (!video) return;
    video.setEnabled(cameraOff);
    setCameraOff((c) => !c);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const remoteInitial = remoteName[0]?.toUpperCase() || "?";

  if (status === "loading") {
    return (
      <div className="call-page call-center">
        <div className="call-spinner" />
        <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>Conectando…</p>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="call-page call-center">
        <span style={{ fontSize: "3rem" }}>📵</span>
        <h2 style={{ color: "var(--text)", margin: "0.5rem 0" }}>Llamada rechazada</h2>
        <p style={{ color: "var(--text-muted)" }}>{remoteName} no pudo atender en este momento.</p>
        <Link href="/chats" className="btn btn-primary" style={{ marginTop: "1rem" }}>
          Volver a chats
        </Link>
      </div>
    );
  }

  if (status === "ended" || error) {
    return (
      <div className="call-page call-center">
        <span style={{ fontSize: "3rem" }}>📞</span>
        <h2 style={{ color: "var(--text)", margin: "0.5rem 0" }}>
          {error ? "Error" : "Llamada finalizada"}
        </h2>
        {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        {coinsWarning && <p style={{ color: "var(--error)" }}>{coinsWarning}</p>}
        <Link href="/chats" className="btn btn-primary" style={{ marginTop: "1rem" }}>
          Volver a chats
        </Link>
      </div>
    );
  }

  const isPaidCall = call?.type === "paid_creator" && call?.callCoins > 0;
  const mins = Math.floor(callDuration / 60);
  const secs = callDuration % 60;
  const durationLabel = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className="call-page">
      {/* Paid call info banner */}
      {isPaidCall && isCaller && (
        <div className="call-paid-banner">
          🪙 {call.callCoins} monedas/min
          {status === "connected" && (
            <>
              <span className="call-duration"> · {durationLabel}</span>
              {totalCharged > 0 && (
                <span className="call-charged"> · Total: {totalCharged} 🪙</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Inline low-balance warning during active call */}
      {coinsWarning && status === "connected" && (
        <div className="call-balance-warning">⚠️ {coinsWarning}</div>
      )}

      {/* Remote video */}
      <div className="call-remote-area">
        <div ref={remoteVideoRef} className="call-remote-video" />
        {status !== "connected" && (
          <div className="call-remote-placeholder">
            <div className="call-remote-avatar">
              {remoteAvatar ? (
                <img src={remoteAvatar} alt={remoteName} className="call-avatar-img" />
              ) : (
                remoteInitial
              )}
            </div>
            <p className="call-status-text">
              {status === "waiting" && "⏳ Esperando que acepte…"}
              {status === "connecting" && "🔄 Conectando…"}
            </p>
            {status === "waiting" && (
              <p className="call-sub-text">{remoteName}</p>
            )}
            {status === "waiting" && isPaidCall && (
              <p className="call-paid-info">🪙 {call.callCoins} monedas/min</p>
            )}
          </div>
        )}
        {status === "connected" && (
          <div className="call-remote-name">{remoteName}</div>
        )}
      </div>

      {/* Local video (picture-in-picture) */}
      <div className={`call-local-pip${cameraOff ? " camera-off" : ""}`}>
        <div ref={localVideoRef} className="call-local-video" />
        {cameraOff && (
          <div className="call-local-placeholder">
            <span>📵</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="call-controls">
        <button
          className={`call-control-btn${muted ? " active-mute" : ""}`}
          onClick={toggleMute}
          aria-label={muted ? "Activar micrófono" : "Silenciar"}
          title={muted ? "Activar micrófono" : "Silenciar"}
        >
          {muted ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          )}
          <span>{muted ? "Activar mic" : "Silenciar"}</span>
        </button>

        <button
          className={`call-control-btn${cameraOff ? " active-mute" : ""}`}
          onClick={toggleCamera}
          aria-label={cameraOff ? "Activar cámara" : "Apagar cámara"}
          title={cameraOff ? "Activar cámara" : "Apagar cámara"}
        >
          {cameraOff ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34m-7.72-2.06A3 3 0 019.88 9.88"/></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          )}
          <span>{cameraOff ? "Activar cam" : "Apagar cam"}</span>
        </button>

        <button
          className="call-control-btn call-end-btn"
          onClick={handleEnd}
          aria-label="Colgar"
          title="Colgar"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C9.6 21 3 14.4 3 6c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          <span>Colgar</span>
        </button>
      </div>

      <style jsx>{`
        .call-page {
          position: fixed;
          inset: 0;
          background: #06020f;
          z-index: 300;
          display: flex;
          flex-direction: column;
        }

        .call-center {
          align-items: center;
          justify-content: center;
          gap: 1rem;
          text-align: center;
        }

        /* Remote video area */
        .call-remote-area {
          flex: 1;
          position: relative;
          background: rgba(10, 4, 22, 0.98);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .call-remote-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .call-remote-video video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .call-remote-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          background: radial-gradient(ellipse at center, rgba(30, 12, 60, 0.9) 0%, rgba(6, 2, 15, 0.98) 70%);
        }

        .call-remote-avatar {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 2rem;
          font-weight: 800;
          overflow: hidden;
          box-shadow: 0 0 0 4px rgba(255, 45, 120, 0.3), 0 0 40px rgba(255, 45, 120, 0.4);
          animation: avatar-pulse 2s ease-in-out infinite;
        }

        @keyframes avatar-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(255, 45, 120, 0.3), 0 0 40px rgba(255, 45, 120, 0.4); }
          50%       { box-shadow: 0 0 0 8px rgba(255, 45, 120, 0.15), 0 0 60px rgba(255, 45, 120, 0.6); }
        }

        .call-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }

        .call-status-text {
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 600;
          margin: 0;
          animation: fade-pulse 1.5s ease-in-out infinite;
        }

        @keyframes fade-pulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }

        .call-sub-text {
          color: var(--text);
          font-size: 1.1rem;
          font-weight: 800;
          margin: 0;
        }

        .call-remote-name {
          position: absolute;
          bottom: 1.25rem;
          left: 1.25rem;
          background: rgba(0, 0, 0, 0.55);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          padding: 0.3rem 0.8rem;
          border-radius: var(--radius-pill);
          backdrop-filter: blur(8px);
        }

        /* Local PiP */
        .call-local-pip {
          position: absolute;
          top: 1.25rem;
          right: 1.25rem;
          width: 120px;
          height: 90px;
          border-radius: var(--radius-sm);
          overflow: hidden;
          border: 2px solid rgba(255, 45, 120, 0.5);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          background: rgba(20, 8, 40, 0.9);
          z-index: 310;
        }

        .call-local-pip.camera-off { border-color: rgba(248, 113, 113, 0.5); }

        .call-local-video {
          width: 100%;
          height: 100%;
        }

        .call-local-video video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .call-local-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          background: rgba(10, 4, 22, 0.9);
        }

        /* Controls */
        .call-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.25rem;
          padding: 1rem 1.5rem 1.5rem;
          background: rgba(6, 2, 15, 0.95);
          border-top: 1px solid rgba(255, 45, 120, 0.15);
          backdrop-filter: blur(16px);
        }

        .call-control-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          padding: 0.75rem 1.5rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
          color: var(--text);
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
          min-width: 80px;
        }

        .call-control-btn:hover { background: rgba(255, 255, 255, 0.1); }

        .call-control-btn.active-mute {
          background: rgba(248, 113, 113, 0.12);
          border-color: rgba(248, 113, 113, 0.3);
          color: var(--error);
        }

        .call-end-btn {
          background: #e53935 !important;
          border-color: #e53935 !important;
          color: #fff !important;
          box-shadow: 0 4px 20px rgba(229, 57, 53, 0.5);
          padding: 0.75rem 2rem;
        }

        .call-end-btn:hover {
          background: #c62828 !important;
          box-shadow: 0 4px 28px rgba(229, 57, 53, 0.7);
        }

        .call-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 45, 120, 0.2);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .call-paid-banner {
          width: 100%;
          flex-shrink: 0;
          z-index: 10;
          background: rgba(99,102,241,0.85);
          color: #fff;
          font-size: 0.78rem;
          font-weight: 700;
          text-align: center;
          padding: 0.35rem 1rem;
          backdrop-filter: blur(8px);
          letter-spacing: 0.02em;
        }

        .call-duration {
          opacity: 0.85;
          font-weight: 600;
        }

        .call-charged {
          opacity: 0.9;
          font-weight: 700;
          color: #fbbf24;
        }

        .call-balance-warning {
          width: 100%;
          flex-shrink: 0;
          z-index: 10;
          background: rgba(220, 38, 38, 0.85);
          color: #fff;
          font-size: 0.78rem;
          font-weight: 700;
          text-align: center;
          padding: 0.35rem 1rem;
          backdrop-filter: blur(8px);
          letter-spacing: 0.02em;
          animation: fade-pulse 1.5s ease-in-out infinite;
        }

        .call-paid-info {
          color: #a5b4fc;
          font-size: 0.82rem;
          font-weight: 600;
          margin: 0;
        }

        @media (max-width: 480px) {
          .call-local-pip {
            width: 90px;
            height: 68px;
          }
          .call-control-btn {
            padding: 0.65rem 1rem;
            min-width: 64px;
          }
        }
      `}</style>
    </div>
  );
}
