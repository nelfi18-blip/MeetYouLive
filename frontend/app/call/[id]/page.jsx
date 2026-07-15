"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import socket, { configureSocketAuth } from "@/lib/socket";
import GiftPanel from "@/components/GiftPanel";
import GiftOverlay from "@/components/GiftOverlay";
import { useLanguage } from "@/contexts/LanguageContext";
import ModerationActions from "@/components/ModerationActions";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const POLL_MS = 1000; // polling interval for call acceptance
// Short Agora reconnect grace; separate from backend pending-invite timeout.
const RECONNECT_GRACE_MS = 15000;
const CALL_CONNECT_TIMEOUT_MS = 20000;
const AUTO_RETURN_DELAY_MS = 3000;
const TERMINAL_CALL_STATES = ["ended", "rejected", "missed", "busy"];
const SPEAKER_VOLUME_FULL = 100;
const SPEAKER_VOLUME_REDUCED = 65;

const normalizeMediaType = (mediaType) => (mediaType === "audio" ? "audio" : "video");

const QUALITY_META = {
  0: { labelKey: "qualityEvaluating", bars: 2, className: "medium" },
  1: { labelKey: "qualityExcellent", bars: 4, className: "excellent" },
  2: { labelKey: "qualityGood", bars: 3, className: "good" },
  3: { labelKey: "qualityStable", bars: 3, className: "good" },
  4: { labelKey: "qualityMedium", bars: 2, className: "medium" },
  5: { labelKey: "qualityLow", bars: 1, className: "low" },
  6: { labelKey: "qualityReconnecting", bars: 1, className: "low" },
};

const getStatusLabel = (status, t) => {
  if (status === "calling") return t("chatPremium.callStatusCalling");
  if (status === "ringing") return t("chatPremium.callStatusRinging");
  if (status === "connecting") return t("chatPremium.callStatusConnecting");
  if (status === "connected") return t("chatPremium.callStatusConnected");
  if (status === "reconnecting") return t("chatPremium.callStatusReconnecting");
  return t("chatPremium.callStatusPreparing");
};

const getActiveCameraDeviceId = (videoTrack, cameras) => {
  const trackLabel = typeof videoTrack?.getTrackLabel === "function" ? videoTrack.getTrackLabel() : "";
  const activeCamera = cameras.find((camera) => camera.label && camera.label === trackLabel);
  return activeCamera?.deviceId || cameras[0]?.deviceId || "";
};

const getSafeChatReturnTo = () => {
  if (typeof window === "undefined") return "/chats";
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "";
  return returnTo.startsWith("/chats/") ? returnTo : "/chats";
};

export default function CallPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { t } = useLanguage();

  const [call, setCall] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading"); // loading | calling | ringing | connecting | connected | reconnecting | ended | rejected | missed | busy
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [audioBoostOn, setAudioBoostOn] = useState(true);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [networkQuality, setNetworkQuality] = useState(0);
  const [hasRemoteAudioTrack, setHasRemoteAudioTrack] = useState(false);
  const [cameraCount, setCameraCount] = useState(0);
  const [callNotice, setCallNotice] = useState("");
  const [isCaller, setIsCaller] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [remoteAvatar, setRemoteAvatar] = useState("");
  const [remoteUserId, setRemoteUserId] = useState("");
  const [callMediaType, setCallMediaType] = useState("video");
  const [returnTo, setReturnTo] = useState("/chats");
  const [callDuration, setCallDuration] = useState(0); // seconds elapsed while connected
  const [totalCharged, setTotalCharged] = useState(0); // coins charged so far this call
  const [coinsWarning, setCoinsWarning] = useState("");
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [callGiftNotif, setCallGiftNotif] = useState(null);
  const [giftQueue, setGiftQueue] = useState([]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const agoraClientRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const remoteAudioTrackRef = useRef(null);
  const currentCameraDeviceIdRef = useRef("");
  const pollRef = useRef(null);
  const tickRef = useRef(null); // per-minute billing interval
  const durationRef = useRef(null); // 1-second timer
  const reconnectRef = useRef(null);
  const callRef = useRef(null); // kept in sync with call state for use inside intervals
  const agoraStartingRef = useRef(false);

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

  const getCurrentUserId = useCallback(
    () =>
      session?.backendUserId ||
      (typeof window !== "undefined" ? localStorage.getItem("userId") : "") ||
      "",
    [session?.backendUserId]
  );

  // ── Agora cleanup helper ────────────────────────────────────────────────
  const cleanupAgora = useCallback(async () => {
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.close();
      localAudioTrackRef.current = null;
    }
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.close();
      localVideoTrackRef.current = null;
    }
    if (agoraClientRef.current) {
      try { await agoraClientRef.current.leave(); } catch { /* ignore */ }
      agoraClientRef.current = null;
    }
    remoteAudioTrackRef.current = null;
    setHasRemoteAudioTrack(false);
  }, []);

  // ── Clean up on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearInterval(tickRef.current);
      clearInterval(durationRef.current);
      // Prevent a pending Agora reconnect timeout from ending the call again after hangup.
      clearTimeout(reconnectRef.current);
      if (localAudioTrackRef.current) localAudioTrackRef.current.close();
      if (localVideoTrackRef.current) localVideoTrackRef.current.close();
      if (agoraClientRef.current) agoraClientRef.current.leave().catch(() => {});
    };
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    setReturnTo(getSafeChatReturnTo());
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (sessionStatus === "loading" && !session?.backendToken && !storedToken) return;

    token.current = session?.backendToken || storedToken;

    if (!token.current) {
      clearToken();
      router.replace("/login");
      return;
    }
    configureSocketAuth(token.current);
    if (!socket.connected) socket.connect();

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

        const me = getCurrentUserId();
        const callerIsMe = String(data.caller._id) === me;
        setIsCaller(callerIsMe);

        // Seed totalCharged from already-recorded billing totals on the call
        if (callerIsMe && data.type === "paid_creator") {
          setTotalCharged(data.totalCoinsCharged || 0);
        }

        const remote = callerIsMe ? data.recipient : data.caller;
        setRemoteName(remote?.username || remote?.name || "Usuario");
        setRemoteAvatar(remote?.avatar || "");
        setRemoteUserId(String(remote?._id || ""));
        const mediaType = normalizeMediaType(data.mediaType);
        setCallMediaType(mediaType);

        if (data.status === "rejected") { setStatus("rejected"); return; }
        if (data.status === "ended" || data.status === "missed") { setStatus("ended"); return; }
        if (data.status === "accepted") {
          startAgora(data._id, mediaType);
        } else {
          // status is pending
          setStatus(callerIsMe ? "calling" : "ringing");
          if (callerIsMe) {
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
  }, [getCurrentUserId, id, session?.backendToken, sessionStatus]);

  // ── Auto-return to chat after terminal call states ───────────────────────
  useEffect(() => {
    if (!TERMINAL_CALL_STATES.includes(status)) return undefined;
    const timer = setTimeout(() => router.replace(returnTo), AUTO_RETURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [returnTo, router, status]);

  // ── Per-minute billing & duration timer for connected paid calls ──────────
  useEffect(() => {
    if (status !== "connected") return;
    const currentCall = callRef.current;
    const isPaidCall = currentCall?.type === "paid_creator" && currentCall?.callCoins > 0;
    const currentUserId = getCurrentUserId();
    const isCallerUser = String(currentCall?.caller?._id || currentCall?.caller) === currentUserId;

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
            cleanupAgora();
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
  }, [getCurrentUserId, status]);

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
            const mediaType = normalizeMediaType(data.mediaType);
            setCallMediaType(mediaType);
            startAgora(callData._id, mediaType);
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

  const endCallOnServer = useCallback(async (reason = "hangup") => {
    try {
      await fetch(`${API_URL}/api/calls/${id}/end`, {
        method: "PATCH",
        headers: apiHeaders(),
        body: JSON.stringify({ reason }),
      });
    } catch {
      // ignore; socket/polling state will reconcile when available
    }
  }, [apiHeaders, id]);

  useEffect(() => {
    if (status !== "loading" && status !== "connecting") return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      if (!active) return;
      if (status === "connecting") {
        await endCallOnServer("connect_timeout");
        await cleanupAgora();
      }
      if (!active) return;
      setError("La conexión está tardando demasiado. Revisa cámara, micrófono y red.");
      setStatus("ended");
    }, CALL_CONNECT_TIMEOUT_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cleanupAgora, endCallOnServer, status]);

  const respondFromCall = useCallback(async (action) => {
    if (!callRef.current || status !== "ringing") return;
    try {
      const res = await fetch(`${API_URL}/api/calls/${id}/respond`, {
        method: "PATCH",
        headers: apiHeaders(),
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || t("chatPremium.callRespondError"));
        setStatus("ended");
        return;
      }
      if (action === "reject") {
        setStatus("rejected");
        return;
      }
      setCall(data);
      callRef.current = data;
      const mediaType = normalizeMediaType(data.mediaType);
      setCallMediaType(mediaType);
      startAgora(data._id, mediaType);
    } catch {
      setError(t("chatPremium.callRespondError"));
      setStatus("ended");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiHeaders, id, status, t]);

  useEffect(() => {
    const finish = (nextStatus, nextMessage = "") => {
      clearInterval(pollRef.current);
      clearInterval(tickRef.current);
      clearInterval(durationRef.current);
      clearTimeout(reconnectRef.current);
      cleanupAgora();
      if (nextMessage) setCoinsWarning(nextMessage);
      setStatus(nextStatus);
    };

    const handleRejected = (data) => {
      if (String(data?.callId) === String(id)) finish("rejected");
    };
    const handleEnded = (data) => {
      if (String(data?.callId) === String(id)) finish("ended", t("chatPremium.callEnded"));
    };
    const handleMissed = (data) => {
      if (String(data?.callId) === String(id)) finish("missed", t("chatPremium.callMissed"));
    };

    socket.on("CALL_REJECTED", handleRejected);
    socket.on("CALL_ENDED", handleEnded);
    socket.on("CALL_MISSED", handleMissed);
    return () => {
      socket.off("CALL_REJECTED", handleRejected);
      socket.off("CALL_ENDED", handleEnded);
      socket.off("CALL_MISSED", handleMissed);
    };
  }, [cleanupAgora, id, t]);

  useEffect(() => {
    const handlePremiumVisualGift = (data) => {
      if (data?.context !== "call" || String(data.contextId) !== String(id)) return;
      if (String(data.senderId) === String(getCurrentUserId())) return;
      const gift = data.gift || {};
      const notif = {
        eventId: data.eventId || `${Date.now()}-${Math.random()}`,
        senderName: data.senderName || "Alguien",
        giftName: gift.name || "Regalo Premium",
        giftIcon: gift.icon || "🎁",
        quantity: data.quantity || 1,
      };
      setCallGiftNotif(notif);
      setGiftQueue((prev) => [
        ...prev,
        {
          id: notif.eventId,
          senderName: notif.senderName,
          giftName: notif.giftName,
          icon: notif.giftIcon,
          coins: 0,
          quantity: notif.quantity,
          isSuper: !!gift.isSuper || gift.type === "super",
          soundUrl: gift.soundUrl || "",
        },
      ]);
      setTimeout(() => setCallGiftNotif(null), 5000);
    };

    socket.on("PREMIUM_GIFT_VISUAL", handlePremiumVisualGift);
    return () => socket.off("PREMIUM_GIFT_VISUAL", handlePremiumVisualGift);
  }, [getCurrentUserId, id]);

  // ── Join Agora channel ──────────────────────────────────────────────────
  const startAgora = useCallback(
    async (callId, mediaType = "video") => {
      if (agoraStartingRef.current || agoraClientRef.current) return;
      agoraStartingRef.current = true;
      setStatus("connecting");
      const isVideoCall = normalizeMediaType(mediaType) === "video";

      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

        const tokenRes = await fetch(
          `${API_URL}/api/agora/token?channelName=${encodeURIComponent(String(callId))}&role=publisher`,
          { headers: { Authorization: `Bearer ${token.current}` } }
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
          }
          if (mediaType === "audio") {
            remoteAudioTrackRef.current = user.audioTrack || null;
            setHasRemoteAudioTrack(!!user.audioTrack);
            user.audioTrack?.play();
          }
          setStatus("connected");
        });

        client.on("network-quality", (stats) => {
          const quality = Math.max(stats?.uplinkNetworkQuality || 0, stats?.downlinkNetworkQuality || 0);
          setNetworkQuality(quality);
        });

        client.on("user-unpublished", (user, mediaType) => {
          if (mediaType === "video") {
            user.videoTrack?.stop();
          }
          if (mediaType === "audio") {
            remoteAudioTrackRef.current = null;
            setHasRemoteAudioTrack(false);
          }
        });

        client.on("user-left", () => {
          clearTimeout(reconnectRef.current);
          setStatus("reconnecting");
          reconnectRef.current = setTimeout(async () => {
            await endCallOnServer("remote_left");
            await cleanupAgora();
            clearInterval(tickRef.current);
            clearInterval(durationRef.current);
            setCoinsWarning(t("chatPremium.callDisconnectedEnded"));
            setStatus("ended");
          }, RECONNECT_GRACE_MS);
        });

        // Get local mic, and camera only for video calls.
        let audioTrack, videoTrack;
        try {
          if (isVideoCall) {
            [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
          } else {
            audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          }
        } catch (permissionError) {
          const denied =
            permissionError?.name === "NotAllowedError" ||
            permissionError?.code === "PERMISSION_DENIED" ||
            /permission|denied|not allowed/i.test(permissionError?.message || "");
          setError(
            denied
              ? t("chatPremium.callPermissionDenied")
              : isVideoCall
              ? t("chatPremium.callCameraMicAccessError")
              : t("chatPremium.callMicAccessError")
          );
          await endCallOnServer("permission_denied");
          await cleanupAgora();
          setStatus("ended");
          return;
        }

        localAudioTrackRef.current = audioTrack;
        localVideoTrackRef.current = videoTrack || null;

        await client.join(appId, String(callId), agoraToken, uid);
        await client.publish(videoTrack ? [audioTrack, videoTrack] : [audioTrack]);

        // Play local preview
        if (videoTrack && localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }
        if (isVideoCall && videoTrack) {
          const cameras = await AgoraRTC.getCameras().catch(() => []);
          setCameraCount(cameras.length);
          currentCameraDeviceIdRef.current = getActiveCameraDeviceId(videoTrack, cameras);
        }
      } catch (err) {
        const msg = err?.message || "";
        if (msg === "agora_token_failed") {
          setError("No se pudo obtener autorización para la videollamada.");
        } else {
          setError("Error al conectar la videollamada.");
        }
        await endCallOnServer("connect_error");
        await cleanupAgora();
        setStatus("ended");
      } finally {
        agoraStartingRef.current = false;
      }
    },
    [cleanupAgora, endCallOnServer, t]
  );

  const leaveCallAndReturn = async (reason = "hangup") => {
    clearInterval(pollRef.current);
    clearInterval(tickRef.current);
    clearInterval(durationRef.current);
    clearTimeout(reconnectRef.current);
    await cleanupAgora();
    await endCallOnServer(reason);
    router.replace(returnTo);
  };

  const handleEnd = () => leaveCallAndReturn("hangup");

  const handleBlockedRemote = async () => {
    await leaveCallAndReturn("blocked");
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

  const switchCamera = async () => {
    if (!localVideoTrackRef.current || switchingCamera) return;
    setSwitchingCamera(true);
    try {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const cameras = await AgoraRTC.getCameras();
      setCameraCount(cameras.length);
      if (cameras.length < 2) {
        return;
      }
      const currentIndex = cameras.findIndex((camera) => camera.deviceId === currentCameraDeviceIdRef.current);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % cameras.length;
      const nextCamera = cameras[nextIndex];
      if (typeof localVideoTrackRef.current.setDevice !== "function") {
        console.warn("[CallPage] Camera switching is not supported by this video track");
        setCallNotice(t("chatPremium.cameraSwitchUnavailable"));
        setTimeout(() => setCallNotice(""), 3000);
        return;
      }
      if (nextCamera?.deviceId) {
        await localVideoTrackRef.current.setDevice(nextCamera.deviceId);
        currentCameraDeviceIdRef.current = nextCamera.deviceId;
        setCameraOff(false);
      }
    } catch (err) {
      console.warn("[CallPage] Camera switch failed", err);
    } finally {
      setSwitchingCamera(false);
    }
  };

  const toggleAudioBoost = () => {
    setAudioBoostOn((prev) => {
      const next = !prev;
      if (remoteAudioTrackRef.current?.setVolume) {
        remoteAudioTrackRef.current.setVolume(next ? SPEAKER_VOLUME_FULL : SPEAKER_VOLUME_REDUCED);
      }
      return next;
    });
  };

  const handleGiftProcessed = useCallback((processedGift) => {
    setGiftQueue((prev) => prev.filter((gift) => gift.id !== processedGift.id));
  }, []);

  const showLocalVisualGift = (giftData) => {
    const item = giftData.giftCatalogItem || {};
    const eventId = `call-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const notif = {
      eventId,
      senderName: "Tú",
      giftName: item.name || "Regalo Premium",
      giftIcon: item.icon || "🎁",
      quantity: giftData.quantity || 1,
    };
    setCallGiftNotif(notif);
    setGiftQueue((prev) => [
      ...prev,
      {
        id: eventId,
        senderName: "Tú",
        giftName: notif.giftName,
        icon: notif.giftIcon,
        coins: 0,
        quantity: notif.quantity,
        isSuper: !!item.isSuper || item.type === "super",
        soundUrl: item.soundUrl || "",
      },
    ]);
    setTimeout(() => setCallGiftNotif(null), 5000);

    if (socket.connected && remoteUserId) {
      socket.emit("premium_gift:visual_send", {
        eventId,
        receiverId: remoteUserId,
        context: "call",
        contextId: String(id),
        quantity: notif.quantity,
        gift: {
          name: notif.giftName,
          icon: notif.giftIcon,
          coinCost: item.coinCost || giftData.coinCost || 0,
          rarity: item.rarity,
          category: item.category,
          type: item.type,
          isSuper: item.isSuper,
          animationType: item.animationType,
          soundUrl: item.soundUrl,
        },
      });
    }
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

  if (status === "rejected" || status === "busy") {
    return (
      <div className="call-page call-center">
        <span style={{ fontSize: "3rem" }}>{status === "busy" ? "📞" : "📵"}</span>
        <h2 style={{ color: "var(--text)", margin: "0.5rem 0" }}>
          {status === "busy" ? t("chatPremium.callBusyTitle") : t("chatPremium.callRejectedTitle")}
        </h2>
        <p style={{ color: "var(--text-muted)" }}>
          {status === "busy" ? t("chatPremium.callBusy") : `${remoteName} ${t("chatPremium.callRejectedDescription")}`}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("chatPremium.returningToChat")}</p>
        <Link href={returnTo} className="btn btn-primary" style={{ marginTop: "1rem" }}>
          💬 {t("chatPremium.returnToChat")}
        </Link>
      </div>
    );
  }

  if (status === "ended" || status === "missed" || error) {
    return (
      <div className="call-page call-center">
        <span style={{ fontSize: "3rem" }}>📞</span>
        <h2 style={{ color: "var(--text)", margin: "0.5rem 0" }}>
          {error ? t("chatPremium.callErrorTitle") : status === "missed" ? t("chatPremium.callMissedTitle") : t("chatPremium.callEndedTitle")}
        </h2>
        {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        {coinsWarning && <p style={{ color: "var(--error)" }}>{coinsWarning}</p>}
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("chatPremium.returningToChat")}</p>
        <Link href={returnTo} className="btn btn-primary" style={{ marginTop: "1rem" }}>
          💬 {t("chatPremium.returnToChat")}
        </Link>
      </div>
    );
  }

  const isPaidCall = call?.type === "paid_creator" && call?.callCoins > 0;
  const isVideoCall = callMediaType !== "audio";
  const mins = Math.floor(callDuration / 60);
  const secs = callDuration % 60;
  const durationLabel = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const statusLabel = getStatusLabel(status, t);
  const qualityMeta = QUALITY_META[networkQuality] || QUALITY_META[0];
  const qualityLabel = t(`chatPremium.${qualityMeta.labelKey}`);
  const qualityBars = Array.from({ length: 4 }, (_, index) => index < qualityMeta.bars);

  return (
    <div className={`call-page call-page--${callMediaType} call-page--${status}`}>
      <div className="call-ambient call-ambient--one" />
      <div className="call-ambient call-ambient--two" />
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

      <div className="call-top-hud">
        <div className="call-identity">
          <div className="call-identity-avatar">
            {remoteAvatar ? (
              <img src={remoteAvatar} alt={remoteName} className="call-avatar-img" loading="eager" decoding="async" />
            ) : (
              remoteInitial
            )}
          </div>
          <header>
            <p className="call-eyebrow">{isVideoCall ? t("chatPremium.premiumVideoCall") : t("chatPremium.premiumVoiceCall")}</p>
            <h1>{remoteName}</h1>
          </header>
        </div>
        <div className="call-hud-metrics" aria-label={t("chatPremium.callStateAria")}>
          <span className={`call-status-pill call-status-pill--${status}`}>
            <span className="call-status-dot" />
            {statusLabel}
          </span>
          <span className="call-duration-pill">⏱ {durationLabel}</span>
          <span className={`call-quality-pill call-quality-pill--${qualityMeta.className}`}>
            <span className="call-quality-bars" aria-hidden="true">
              {qualityBars.map((active, index) => (
                <span key={index} className={active ? "active" : ""} />
              ))}
            </span>
            {qualityLabel}
          </span>
        </div>
      </div>

      {/* Inline low-balance warning during active call */}
      {coinsWarning && status === "connected" && (
        <div className="call-balance-warning">⚠️ {coinsWarning}</div>
      )}

      {/* Remote video */}
      <div className="call-remote-area">
        <div ref={remoteVideoRef} className="call-remote-video" />
        {(!isVideoCall || status !== "connected") && (
          <div className="call-remote-placeholder">
            <div className="call-avatar-ring" />
            <div className="call-remote-avatar">
              {remoteAvatar ? (
                <img src={remoteAvatar} alt={remoteName} className="call-avatar-img" loading="eager" decoding="async" />
              ) : (
                remoteInitial
              )}
            </div>
            <p className="call-status-text">
              {status === "calling" && `📲 ${t("chatPremium.calling")}`}
              {status === "ringing" && `🔔 ${t("chatPremium.ringing")}`}
              {status === "connecting" && `🔄 ${t("chatPremium.connecting")}`}
              {status === "reconnecting" && `🔄 ${t("chatPremium.reconnecting")}`}
              {!isVideoCall && status === "connected" && t("chatPremium.voiceCallConnected")}
            </p>
            <p className="call-premium-caption">
              {t("chatPremium.premiumCallCaption")}
            </p>
            {(status === "calling" || status === "ringing") && (
              <p className="call-sub-text">{remoteName}</p>
            )}
            {status === "calling" && isPaidCall && (
              <p className="call-paid-info">🪙 {call.callCoins} monedas/min</p>
            )}
            {status === "ringing" && (
              <div className="call-ringing-actions">
                <button className="call-answer-btn" onClick={() => respondFromCall("accept")}>
                  {t("chatPremium.acceptCall")}
                </button>
                <button className="call-decline-btn" onClick={() => respondFromCall("reject")}>
                  {t("chatPremium.rejectCall")}
                </button>
              </div>
            )}
            {callNotice && <div className="call-notice">{callNotice}</div>}
          </div>
        )}
        {status === "connected" && (
          <div className="call-remote-name">
            <span>{remoteName}</span>
            <small>{isVideoCall ? t("chatPremium.inVideo") : t("chatPremium.audioOnly")}</small>
          </div>
        )}
        {callGiftNotif && (
          <div className="call-gift-notif">
            <span className="call-gift-icon">{callGiftNotif.giftIcon}</span>
            <span>
              🎁 <strong>{callGiftNotif.senderName}</strong> envió{" "}
              {callGiftNotif.quantity > 1 ? `${callGiftNotif.quantity}x ` : ""}
              <strong>{callGiftNotif.giftName}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Local video (picture-in-picture) */}
      {isVideoCall && (
        <div className={`call-local-pip${cameraOff ? " camera-off" : ""}`}>
          <div ref={localVideoRef} className="call-local-video" />
          {cameraOff && (
            <div className="call-local-placeholder">
              <span>📵</span>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="call-controls">
        <div className="call-controls__rail" aria-label={t("chatPremium.premiumCallControlsAria")}>
        {status !== "ringing" && (
          <button
            className={`call-control-btn${muted ? " active-mute" : ""}`}
            onClick={toggleMute}
            disabled={!localAudioTrackRef.current}
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
        )}

        {isVideoCall && status !== "ringing" && (
          <button
            className={`call-control-btn${cameraOff ? " active-mute" : ""}`}
            onClick={toggleCamera}
            disabled={!localVideoTrackRef.current}
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
        )}

        {isVideoCall && status !== "ringing" && (
          <button
            className="call-control-btn"
            onClick={switchCamera}
            disabled={!localVideoTrackRef.current || switchingCamera || cameraCount < 2}
            aria-label={t("chatPremium.switchCamera")}
            title={t("chatPremium.switchCamera")}
          >
            <span className="call-control-icon">🔄</span>
            <span>{switchingCamera ? t("chatPremium.switchingCamera") : t("chatPremium.switchCameraShort")}</span>
          </button>
        )}

        {status !== "ringing" && (
          <button
            className={`call-control-btn${audioBoostOn ? " active-speaker" : ""}`}
            onClick={toggleAudioBoost}
            disabled={!hasRemoteAudioTrack}
            aria-label={audioBoostOn ? t("chatPremium.reduceAudioBoost") : t("chatPremium.enableAudioBoost")}
            title={audioBoostOn ? t("chatPremium.audioBoostActive") : t("chatPremium.enableAudioBoost")}
          >
            <span className="call-control-icon">{audioBoostOn ? "🔊" : "🔈"}</span>
            <span>{t("chatPremium.audioBoost")}</span>
          </button>
        )}

        {status !== "ringing" && (
          <button
            className="call-control-btn call-gift-btn"
            onClick={() => setShowGiftPanel(true)}
            disabled={!remoteUserId || TERMINAL_CALL_STATES.includes(status)}
            aria-label="Enviar regalo visual"
            title="Enviar regalo visual"
          >
            <span className="call-gift-emoji">🎁</span>
            <span>Regalo</span>
          </button>
        )}

        {remoteUserId && status !== "ringing" && (
          <div className="call-moderation-actions">
            <ModerationActions
              targetUserId={remoteUserId}
              targetName={remoteName}
              authToken={token.current}
              onBlocked={handleBlockedRemote}
              compact
            />
          </div>
        )}

        {status !== "ringing" && (
          <button
            className="call-control-btn call-end-btn"
            onClick={handleEnd}
            aria-label="Colgar"
            title="Colgar"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C9.6 21 3 14.4 3 6c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            <span>{status === "calling" ? t("chatPremium.cancelCall") : t("chatPremium.endCall")}</span>
          </button>
        )}
        </div>
      </div>

      {showGiftPanel && remoteUserId && (
        <GiftPanel
          receiverId={remoteUserId}
          context="private_call"
          visualOnly
          onClose={() => setShowGiftPanel(false)}
          onGiftSent={(gift) => {
            setShowGiftPanel(false);
            showLocalVisualGift(gift);
          }}
        />
      )}

      <GiftOverlay giftQueue={giftQueue} onGiftProcessed={handleGiftProcessed} />

      <style jsx>{`
        .call-page {
          position: fixed;
          inset: 0;
          background:
            radial-gradient(circle at 16% 12%, rgba(224,64,251,0.26), transparent 34%),
            radial-gradient(circle at 84% 16%, rgba(34,211,238,0.2), transparent 34%),
            linear-gradient(145deg, #06020f 0%, #12062a 48%, #05020b 100%);
          z-index: 300;
          display: flex;
          flex-direction: column;
          color: #fff;
          overflow: hidden;
          isolation: isolate;
          animation: call-shell-in 0.42s ease-out both;
        }

        .call-page--ended,
        .call-page--missed,
        .call-page--rejected {
          animation: call-shell-out 0.26s ease-in both;
        }

        .call-ambient {
          position: absolute;
          width: 42vw;
          height: 42vw;
          border-radius: 999px;
          filter: blur(48px);
          opacity: 0.34;
          pointer-events: none;
          z-index: -1;
        }

        .call-ambient--one {
          left: -12vw;
          top: 8vh;
          background: rgba(224,64,251,0.72);
          animation: premium-orbit 11s ease-in-out infinite alternate;
        }

        .call-ambient--two {
          right: -14vw;
          bottom: 10vh;
          background: rgba(34,211,238,0.58);
          animation: premium-orbit 13s ease-in-out infinite alternate-reverse;
        }

        @keyframes call-shell-in {
          from { opacity: 0; transform: scale(1.015); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes call-shell-out {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0.92; transform: scale(0.99); }
        }

        @keyframes premium-orbit {
          from { transform: translate3d(0, 0, 0) scale(1); }
          to { transform: translate3d(6vw, -3vh, 0) scale(1.12); }
        }

        .call-center {
          align-items: center;
          justify-content: center;
          gap: 1rem;
          text-align: center;
        }

        .call-top-hud {
          position: absolute;
          top: calc(1rem + env(safe-area-inset-top));
          left: 50%;
          transform: translateX(-50%);
          z-index: 320;
          width: min(1120px, calc(100% - 2rem));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.85rem;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 28px;
          background: linear-gradient(135deg, rgba(15,8,33,0.74), rgba(34,12,58,0.58));
          box-shadow: 0 18px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
          backdrop-filter: blur(20px);
        }

        .call-identity {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 0.85rem;
        }

        .call-identity-avatar {
          width: 54px;
          height: 54px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 50%;
          overflow: hidden;
          background: var(--grad-primary);
          color: #fff;
          font-weight: 900;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.18), 0 0 26px rgba(224,64,251,0.38);
        }

        .call-identity h1 {
          max-width: min(42vw, 420px);
          margin: 0;
          overflow: hidden;
          color: #fff;
          font-size: clamp(1.05rem, 2vw, 1.35rem);
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .call-eyebrow {
          margin: 0 0 0.15rem;
          color: rgba(255,255,255,0.64);
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .call-hud-metrics {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.55rem;
          flex-wrap: wrap;
        }

        .call-status-pill,
        .call-duration-pill,
        .call-quality-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          min-height: 34px;
          padding: 0.38rem 0.7rem;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.9);
          font-size: 0.76rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .call-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent-yellow);
          box-shadow: 0 0 14px currentColor;
          animation: fade-pulse 1.4s ease-in-out infinite;
        }

        .call-status-pill--connected .call-status-dot { background: var(--success); }
        .call-status-pill--reconnecting .call-status-dot { background: var(--warning); }

        .call-quality-bars {
          display: inline-flex;
          align-items: flex-end;
          gap: 2px;
          height: 13px;
        }

        .call-quality-bars span {
          display: block;
          width: 3px;
          border-radius: 999px;
          background: rgba(255,255,255,0.25);
        }

        .call-quality-bars span:nth-child(1) { height: 5px; }
        .call-quality-bars span:nth-child(2) { height: 8px; }
        .call-quality-bars span:nth-child(3) { height: 11px; }
        .call-quality-bars span:nth-child(4) { height: 14px; }

        .call-quality-pill--excellent .call-quality-bars span.active,
        .call-quality-pill--good .call-quality-bars span.active { background: var(--success); }
        .call-quality-pill--medium .call-quality-bars span.active { background: var(--warning); }
        .call-quality-pill--low .call-quality-bars span.active { background: var(--error); }

        /* Remote video area */
        .call-remote-area {
          flex: 1;
          position: relative;
          margin: 0;
          background: rgba(10, 4, 22, 0.72);
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

        .call-page--video .call-remote-video::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(3,1,10,0.52) 0%, transparent 26%, transparent 62%, rgba(3,1,10,0.72) 100%),
            radial-gradient(circle at 50% 12%, rgba(255,255,255,0.1), transparent 36%);
        }

        .call-remote-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 7rem 1.25rem 8.25rem;
          background:
            radial-gradient(circle at center, rgba(224,64,251,0.2) 0%, transparent 28%),
            radial-gradient(ellipse at center, rgba(30, 12, 60, 0.84) 0%, rgba(6, 2, 15, 0.96) 70%);
        }

        .call-avatar-ring {
          position: absolute;
          width: clamp(180px, 28vw, 300px);
          height: clamp(180px, 28vw, 300px);
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            radial-gradient(circle, transparent 58%, rgba(34,211,238,0.24) 59%, rgba(224,64,251,0.18) 72%, transparent 73%),
            linear-gradient(135deg, rgba(34,211,238,0.22), rgba(224,64,251,0.18));
          opacity: 0.62;
        }

        .call-remote-avatar {
          width: clamp(132px, 20vw, 220px);
          height: clamp(132px, 20vw, 220px);
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: clamp(2.5rem, 6vw, 5rem);
          font-weight: 800;
          overflow: hidden;
          position: relative;
          z-index: 1;
          box-shadow:
            0 0 0 8px rgba(255,255,255,0.08),
            0 0 0 18px rgba(224,64,251,0.08),
            0 28px 90px rgba(224,64,251,0.36);
          animation: avatar-pulse 2s ease-in-out infinite;
        }

        @keyframes avatar-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 8px rgba(255,255,255,0.08),
              0 0 0 18px rgba(224,64,251,0.08),
              0 28px 90px rgba(224,64,251,0.36);
          }
          50% {
            box-shadow:
              0 0 0 12px rgba(255,255,255,0.08),
              0 0 0 28px rgba(34,211,238,0.08),
              0 32px 110px rgba(34,211,238,0.38);
          }
        }

        .call-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }

        .call-status-text {
          position: relative;
          z-index: 1;
          color: #fff;
          font-size: clamp(1rem, 2vw, 1.25rem);
          font-weight: 900;
          margin: 0;
          animation: fade-pulse 1.5s ease-in-out infinite;
        }

        .call-premium-caption {
          position: relative;
          z-index: 1;
          max-width: 360px;
          margin: -0.35rem 0 0;
          color: rgba(255,255,255,0.68);
          font-size: 0.86rem;
          text-align: center;
        }

        @keyframes fade-pulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }

        .call-sub-text {
          color: var(--text);
          font-size: 1.15rem;
          font-weight: 800;
          margin: 0;
          position: relative;
          z-index: 1;
        }

        .call-remote-name {
          position: absolute;
          bottom: calc(6.6rem + env(safe-area-inset-bottom));
          left: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
          background: rgba(10, 4, 24, 0.62);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          padding: 0.58rem 0.85rem;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 18px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.34);
          backdrop-filter: blur(16px);
        }

        .call-remote-name small {
          color: rgba(255,255,255,0.62);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .call-gift-notif {
          position: absolute;
          top: 1.25rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 0.55rem;
          max-width: min(90vw, 460px);
          padding: 0.72rem 1rem;
          border-radius: 999px;
          border: 1px solid rgba(251,191,36,0.45);
          background: rgba(10, 4, 24, 0.82);
          color: #fff;
          font-weight: 800;
          font-size: 0.9rem;
          box-shadow: 0 14px 34px rgba(0,0,0,0.38), 0 0 22px rgba(251,191,36,0.22);
          backdrop-filter: blur(12px);
          animation: gift-toast-in 0.24s ease-out;
        }

        .call-gift-icon {
          font-size: 1.45rem;
          filter: drop-shadow(0 0 10px rgba(251,191,36,0.7));
        }

        .call-notice {
          position: absolute;
          top: calc(5.6rem + env(safe-area-inset-top));
          left: 50%;
          z-index: 6;
          max-width: min(90vw, 420px);
          transform: translateX(-50%);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 999px;
          background: rgba(10, 4, 24, 0.82);
          box-shadow: 0 14px 34px rgba(0,0,0,0.34);
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
          padding: 0.65rem 0.95rem;
          text-align: center;
          backdrop-filter: blur(12px);
          animation: gift-toast-in 0.24s ease-out;
        }

        @keyframes gift-toast-in {
          from { opacity: 0; transform: translate(-50%, -12px) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }

        /* Local PiP */
        .call-local-pip {
          position: absolute;
          top: calc(6.8rem + env(safe-area-inset-top));
          right: 1rem;
          width: clamp(112px, 16vw, 176px);
          height: clamp(84px, 12vw, 132px);
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.22);
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.52), 0 0 30px rgba(224,64,251,0.18);
          background: rgba(20, 8, 40, 0.9);
          z-index: 310;
          backdrop-filter: blur(12px);
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
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 325;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
          pointer-events: none;
        }

        .call-controls__rail {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(0.45rem, 1.4vw, 0.9rem);
          max-width: min(980px, calc(100% - 1rem));
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: none;
          padding: 0.7rem;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 30px;
          background: linear-gradient(135deg, rgba(8,3,18,0.86), rgba(28,12,56,0.72));
          box-shadow: 0 22px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.09);
          backdrop-filter: blur(22px);
          pointer-events: auto;
        }
        .call-moderation-actions {
          flex: 0 0 auto;
          min-width: 150px;
        }

        .call-controls__rail::-webkit-scrollbar {
          display: none;
        }

        .call-control-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          min-width: 74px;
          min-height: 66px;
          padding: 0.68rem 0.78rem;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.07);
          color: var(--text);
          font-size: 0.68rem;
          font-weight: 800;
          cursor: pointer;
          transition: transform var(--transition), background var(--transition), border-color var(--transition), box-shadow var(--transition);
        }

        @media (hover: hover) {
          .call-control-btn:hover {
            background: rgba(255, 255, 255, 0.13);
            transform: translateY(-2px);
          }
        }

        .call-control-icon {
          font-size: 1.25rem;
          line-height: 1;
        }

        .call-control-btn.active-mute,
        .call-control-btn.active-speaker {
          background: rgba(248, 113, 113, 0.12);
          border-color: rgba(248, 113, 113, 0.3);
          color: var(--error);
        }

        .call-control-btn.active-speaker {
          background: rgba(34,211,238,0.14);
          border-color: rgba(34,211,238,0.34);
          color: #a5f3fc;
        }

        .call-end-btn {
          background: linear-gradient(135deg, #ef4444, #be123c) !important;
          border-color: rgba(255,255,255,0.16) !important;
          color: #fff !important;
          box-shadow: 0 10px 32px rgba(229, 57, 53, 0.44);
          min-width: 104px;
        }

        .call-gift-btn {
          border-color: rgba(251,191,36,0.34);
          background: linear-gradient(135deg, rgba(251,191,36,0.18), rgba(236,72,153,0.18));
        }

        .call-gift-btn:not(:disabled):hover {
          box-shadow: 0 0 22px rgba(251,191,36,0.26);
        }

        .call-gift-emoji {
          font-size: 1.25rem;
        }

        .call-end-btn:hover {
          box-shadow: 0 14px 38px rgba(229, 57, 53, 0.62);
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

        .call-ringing-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.5rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .call-answer-btn,
        .call-decline-btn {
          border: 0;
          border-radius: var(--radius-pill);
          color: #fff;
          cursor: pointer;
          font-weight: 800;
          min-width: 112px;
          padding: 0.75rem 1.1rem;
        }

        .call-answer-btn { background: #22c55e; }
        .call-decline-btn { background: #e53935; }

        .call-control-btn:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        @media (max-width: 760px) {
          .call-top-hud {
            align-items: flex-start;
            border-radius: 24px;
            flex-direction: column;
            gap: 0.75rem;
            padding: 0.75rem;
          }

          .call-hud-metrics {
            justify-content: flex-start;
            width: 100%;
          }

          .call-status-pill,
          .call-duration-pill,
          .call-quality-pill {
            min-height: 30px;
            padding: 0.32rem 0.56rem;
            font-size: 0.68rem;
          }

          .call-identity-avatar {
            width: 46px;
            height: 46px;
          }

          .call-local-pip {
            top: calc(9.5rem + env(safe-area-inset-top));
            right: 0.75rem;
            width: 98px;
            height: 74px;
            border-radius: 18px;
          }

          .call-remote-placeholder {
            padding-top: 10.5rem;
            padding-bottom: 8.6rem;
          }

          .call-premium-caption {
            font-size: 0.78rem;
          }

          .call-remote-name {
            bottom: calc(7.2rem + env(safe-area-inset-bottom));
            left: 0.75rem;
          }

          .call-controls {
            justify-content: flex-start;
            padding-inline: 0.5rem;
          }

          .call-controls__rail {
            justify-content: flex-start;
            max-width: 100%;
            width: 100%;
            border-radius: 26px;
            padding: 0.55rem;
          }

          .call-control-btn {
            flex: 0 0 68px;
            min-width: 68px;
            min-height: 62px;
            padding: 0.55rem 0.45rem;
            font-size: 0.62rem;
          }
        }

        @media (max-width: 380px) {
          .call-status-pill,
          .call-duration-pill,
          .call-quality-pill {
            font-size: 0.62rem;
          }

          .call-control-btn {
            flex-basis: 62px;
            min-width: 62px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .call-page,
          .call-ambient,
          .call-avatar-ring,
          .call-remote-avatar,
          .call-status-dot,
          .call-status-text,
          .call-balance-warning {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
