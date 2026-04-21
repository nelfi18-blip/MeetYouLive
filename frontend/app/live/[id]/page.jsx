"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import GiftEffect from "@/components/GiftEffect";
import GiftPanel from "@/components/GiftPanel";
import TopGifters from "@/components/TopGifters";
import FloatingReactions from "@/components/FloatingReactions";
import FollowButton from "@/components/FollowButton";
import StatusBadges from "@/components/StatusBadges";
import LiveFeedOverlay from "@/components/LiveFeedOverlay";
import { computeStatusBadges } from "@/lib/statusBadges";
import { RARITY_STYLES } from "@/lib/gifts";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;

const truncateText = (text, max = 50) => {
  const safeText = text == null ? "" : String(text);
  return safeText.length > max ? safeText.slice(0, max) + "…" : safeText;
};

export default function LiveRoomPage() {
  const { id } = useParams();
  const router = useRouter();

  const [live, setLive] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [activeGiftEffect, setActiveGiftEffect] = useState(null);
  const [recentGift, setRecentGift] = useState(null);

  const [startingCall, setStartingCall] = useState(false);
  const [callError, setCallError] = useState("");

  const [chatMessages, setChatMessages] = useState([
    { id: 0, user: "Sistema", text: "¡Bienvenido al directo! 🎉", system: true },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);
  const msgCounterRef = useRef(1);
  const giftEffectTimeoutRef = useRef(null);
  const recentGiftTimeoutRef = useRef(null);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUsername, setCurrentUsername] = useState("");
  const [meLoaded, setMeLoaded] = useState(false);
  const [endingStream, setEndingStream] = useState(false);
  const [showEntryAnim, setShowEntryAnim] = useState(true);

  // Live viewer count (updated in real time via socket)
  const [viewerCount, setViewerCount] = useState(0);
  // Incremented on each received gift to trigger TopGifters re-fetch
  const [giftRefreshTrigger, setGiftRefreshTrigger] = useState(0);

  // Live activity overlay events (gifts, joins, messages)
  const [overlayEvents, setOverlayEvents] = useState([]);
  const overlayCounterRef = useRef(0);

  const addOverlayEvent = useCallback((type, icon, text) => {
    const id = `ov_${++overlayCounterRef.current}_${Date.now()}`;
    setOverlayEvents((prev) => [...prev, { id, type, icon, text }]);
  }, []);

  // Agora state
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [agoraError, setAgoraError] = useState("");
  const agoraClientRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoContainerRef = useRef(null);
  const remoteVideoContainerRef = useRef(null);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    fetch(`${API_URL}/api/lives/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar el directo");
        return res.json();
      })
      .then((data) => setLive(data))
      .catch(() => setError("Directo no encontrado o ya finalizado"));
  }, [id, token]);

  useEffect(() => {
    if (!token) {
      setMeLoaded(true);
      return;
    }
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?._id) setCurrentUserId(String(data._id));
        if (data?.username || data?.name) setCurrentUsername(data.username || data.name || "");
      })
      .catch(() => {})
      .finally(() => setMeLoaded(true));
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      if (giftEffectTimeoutRef.current) clearTimeout(giftEffectTimeoutRef.current);
      if (recentGiftTimeoutRef.current) clearTimeout(recentGiftTimeoutRef.current);
    };
  }, []);

  // Initialise viewerCount from the loaded live data
  useEffect(() => {
    if (live) {
      setViewerCount(live.viewerCount ?? live.viewers ?? 0);
    }
  }, [live]);

  // ── Socket live room ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !meLoaded) return;

    if (!socket.connected) socket.connect();

    const joinRoom = () => {
      socket.emit("join_live_room", {
        liveId: id,
        user: currentUserId ? { username: currentUsername || "Espectador" } : null,
      });
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on("connect", joinRoom);

    const onChatMessage = ({ user, text }) => {
      const displayName = user?.username || "Anónimo";
      setChatMessages((prev) => [
        ...prev,
        { id: ++msgCounterRef.current, user: displayName, text, system: false },
      ]);
      // Show recent chat messages in the video overlay (truncated)
      addOverlayEvent("chat", "💬", `${displayName}: ${truncateText(text)}`);
    };

    const onViewerCountUpdate = ({ liveId: updatedId, count }) => {
      if (updatedId === id) setViewerCount(count);
    };

    const onLiveGiftSent = ({ senderName, senderId, gift }) => {
      if (!gift) return;
      // Skip if this user is the sender (they already have immediate local feedback)
      if (senderId && currentUserId && senderId === currentUserId) return;

      // Trigger gift animation effect for all viewers
      setActiveGiftEffect({ gift, senderName });
      setRecentGift({ ...gift, senderName });

      if (giftEffectTimeoutRef.current) clearTimeout(giftEffectTimeoutRef.current);
      if (recentGiftTimeoutRef.current) clearTimeout(recentGiftTimeoutRef.current);

      giftEffectTimeoutRef.current = setTimeout(
        () => setActiveGiftEffect(null),
        ["mythic", "legendary"].includes(gift?.rarity) ? 7000 : ["epic", "rare"].includes(gift?.rarity) ? 4500 : 2200,
      );
      recentGiftTimeoutRef.current = setTimeout(() => setRecentGift(null), 6000);

      // Add gift event to the chat / activity feed
      setChatMessages((prev) => [
        ...prev,
        {
          id: ++msgCounterRef.current,
          user: senderName,
          text: `${gift.icon || "🎁"} ${gift.name || "regalo"}`,
          gift,
          system: false,
          isGift: true,
        },
      ]);

      // Show gift event in the video overlay
      addOverlayEvent("gift", gift.icon || "🎁", `${senderName} envió ${gift.name || "un regalo"}`);

      // Refresh top gifters leaderboard
      setGiftRefreshTrigger((n) => n + 1);
    };

    const onUserJoined = ({ user }) => {
      const name = user?.username || "Alguien";
      setChatMessages((prev) => [
        ...prev,
        {
          id: ++msgCounterRef.current,
          user: "Sistema",
          text: `👋 ${name} se unió al directo`,
          system: true,
        },
      ]);
      // Show join event in the video overlay
      addOverlayEvent("join", "👋", `${name} se unió al directo`);
    };

    const onLiveEnded = () => {
      // Show an in-chat notice and redirect viewers after a short delay
      setChatMessages((prev) => [
        ...prev,
        { id: ++msgCounterRef.current, user: "Sistema", text: "📡 El directo ha terminado", system: true },
      ]);
      setTimeout(() => router.push("/live"), 3000);
    };

    socket.on("LIVE_CHAT_MESSAGE", onChatMessage);
    socket.on("VIEWER_COUNT_UPDATE", onViewerCountUpdate);
    socket.on("LIVE_GIFT_SENT", onLiveGiftSent);
    socket.on("USER_JOINED_LIVE", onUserJoined);
    socket.on("LIVE_ENDED", onLiveEnded);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("LIVE_CHAT_MESSAGE", onChatMessage);
      socket.off("VIEWER_COUNT_UPDATE", onViewerCountUpdate);
      socket.off("LIVE_GIFT_SENT", onLiveGiftSent);
      socket.off("USER_JOINED_LIVE", onUserJoined);
      socket.off("LIVE_ENDED", onLiveEnded);
      socket.emit("leave_live_room", { liveId: id });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, meLoaded, currentUserId, currentUsername, addOverlayEvent]);

  // Mark live as truly active only when the creator is present in the room.
  useEffect(() => {
    if (!id || !live || !meLoaded || !currentUserId) return;
    const creatorId = live.user?._id ? String(live.user._id) : null;
    if (!creatorId || creatorId !== currentUserId) return;

    if (!socket.connected) socket.connect();

    const announceHostActive = () => {
      if (!socket.connected) return;
      socket.emit("live_host_active", { liveId: id });
    };

    socket.on("connect", announceHostActive);
    announceHostActive();

    return () => {
      if (socket.connected) {
        socket.emit("live_host_inactive", { liveId: id });
      }
      socket.off("connect", announceHostActive);
    };
  }, [id, live, meLoaded, currentUserId]);

  // ── Agora join ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live || !meLoaded) return;
    if (live.isPrivate && !live.hasAccess) return;
    if (!token) return;

    const isCreatorCheck =
      !!(currentUserId && live.user?._id && currentUserId === String(live.user._id));

    let client;
    let localAudio;
    let localVideo;
    let cancelled = false;

    const joinAgora = async () => {
      try {
        if (!AGORA_APP_ID) throw new Error("No se pudo obtener token de Agora");
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        if (cancelled) return;

        const role = isCreatorCheck ? "publisher" : "subscriber";
        const tokenRes = await fetch(
          `${API_URL}/api/agora/token?channelName=${encodeURIComponent(live._id)}&role=${role}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!tokenRes.ok) throw new Error("No se pudo obtener token de Agora");
        const { token: agoraToken, uid } = await tokenRes.json();
        if (cancelled) return;

        client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        agoraClientRef.current = client;

        if (isCreatorCheck) {
          await client.setClientRole("host");
          [localAudio, localVideo] =
            await AgoraRTC.createMicrophoneAndCameraTracks();
          if (cancelled) {
            localAudio.close();
            localVideo.close();
            return;
          }
          localAudioTrackRef.current = localAudio;
          localVideoTrackRef.current = localVideo;

          await client.join(AGORA_APP_ID, String(live._id), agoraToken, uid);
          await client.publish([localAudio, localVideo]);

          if (localVideoContainerRef.current) {
            localVideo.play(localVideoContainerRef.current);
          }
        } else {
          await client.setClientRole("audience");
          await client.join(AGORA_APP_ID, String(live._id), agoraToken, uid);

          // Subscribe to existing remote users
          for (const user of client.remoteUsers) {
            if (user.hasVideo) {
              await client.subscribe(user, "video");
              if (remoteVideoContainerRef.current) {
                user.videoTrack?.play(remoteVideoContainerRef.current);
              }
            }
            if (user.hasAudio) {
              await client.subscribe(user, "audio");
              user.audioTrack?.play();
            }
          }

          client.on("user-published", async (user, mediaType) => {
            await client.subscribe(user, mediaType);
            if (mediaType === "video" && remoteVideoContainerRef.current) {
              user.videoTrack?.play(remoteVideoContainerRef.current);
            }
            if (mediaType === "audio") {
              user.audioTrack?.play();
            }
          });

          client.on("user-unpublished", (user, mediaType) => {
            if (mediaType === "video") {
              user.videoTrack?.stop();
            }
          });
        }

        if (!cancelled) {
          setAgoraJoined(true);
          setTimeout(() => setShowEntryAnim(false), 2000);
        }
      } catch (err) {
        if (!cancelled) {
          setAgoraError(
            err?.message?.includes("cámara") || err?.message?.includes("mic")
              ? "Permite el acceso a cámara/micrófono para transmitir"
              : "No se pudo conectar al canal de video"
          );
        }
      }
    };

    joinAgora();

    return () => {
      cancelled = true;
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.close();
        localVideoTrackRef.current = null;
      }
      if (agoraClientRef.current) {
        agoraClientRef.current.leave().catch(() => {});
        agoraClientRef.current = null;
      }
      setAgoraJoined(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, meLoaded, token, currentUserId]);

  const sendChatMessage = (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    // Add message locally immediately (optimistic, sender sees it as "Tú")
    setChatMessages((prev) => [
      ...prev,
      { id: ++msgCounterRef.current, user: "Tú", text, system: false },
    ]);
    setChatInput("");

    // Show in overlay for the sender
    addOverlayEvent("chat", "💬", `Tú: ${truncateText(text)}`);

    // Broadcast to all other viewers in the live room
    socket.emit("live_chat_message", {
      liveId: id,
      text,
      user: { username: currentUsername || "Anónimo" },
    });
  };

  const handleGiftSent = useCallback((data) => {
    const gift = data?.gift || null;
    const senderName = data?.senderName || "Tú";

    if (gift) {
      setActiveGiftEffect({ gift, senderName });
      setRecentGift({ ...gift, senderName });

      if (giftEffectTimeoutRef.current) clearTimeout(giftEffectTimeoutRef.current);
      if (recentGiftTimeoutRef.current) clearTimeout(recentGiftTimeoutRef.current);

      giftEffectTimeoutRef.current = setTimeout(() => {
        setActiveGiftEffect(null);
      }, ["mythic", "legendary"].includes(gift?.rarity) ? 7000 : ["epic", "rare"].includes(gift?.rarity) ? 4500 : 2200);

      recentGiftTimeoutRef.current = setTimeout(() => {
        setRecentGift(null);
      }, 6000);

      // Refresh leaderboard after sending a gift
      setGiftRefreshTrigger((n) => n + 1);

      // Show sender's own gift in the overlay immediately
      addOverlayEvent("gift", gift.icon || "🎁", `Tú enviaste ${gift.name || "un regalo"}`);
    }

    setChatMessages((prev) => [
      ...prev,
      {
        id: ++msgCounterRef.current,
        user: senderName,
        text: `${gift?.icon || "🎁"} ${gift?.name || "regalo"}`,
        gift,
        system: false,
        isGift: true,
      },
    ]);
  }, [addOverlayEvent]);

  const handleJoin = async () => {
    if (!token) {
      setJoinError("Debes iniciar sesión para unirte a este directo privado.");
      return;
    }

    setJoining(true);
    setJoinError("");

    try {
      const res = await fetch(`${API_URL}/api/lives/${id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.message || "No se pudo unir al directo");
        return;
      }
      setLive(data);
    } catch {
      setJoinError("No se pudo conectar con el servidor");
    } finally {
      setJoining(false);
    }
  };

  if (error) {
    return (
      <div className="viewer-error">
        <span style={{ fontSize: "3rem" }}>📡</span>
        <h2>Este directo ya terminó</h2>
        <p>{error}</p>
        <Link href="/live" className="btn btn-primary">← Volver a directos</Link>
        <style jsx>{`
          .viewer-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 0.75rem;
            text-align: center;
          }
          .viewer-error h2 { color: var(--text); font-size: 1.4rem; }
          .viewer-error p { color: var(--text-muted); }
        `}</style>
      </div>
    );
  }

  if (!live) {
    return (
      <div className="viewer-loading">
        <div className="spinner" />
        <p>Cargando directo…</p>
        <style jsx>{`
          .viewer-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 1rem;
            color: var(--text-muted);
          }
          .spinner {
            width: 44px;
            height: 44px;
            border: 3px solid rgba(255,15,138,0.15);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (live.isPrivate && !live.hasAccess) {
    return (
      <div className="viewer-page">
        <div className="paywall card">
          <div className="paywall-icon">🔒</div>
          <h2 className="paywall-title">{live.title}</h2>
          <p className="paywall-streamer">por @{live.user?.username || "anónimo"}</p>
          <p className="paywall-desc">Este directo es privado. Paga la entrada con monedas para acceder.</p>
          <div className="paywall-cost">
            <span className="coin-icon">🪙</span>
            <span className="cost-num">{live.entryCost}</span>
            <span className="cost-label">monedas</span>
          </div>
          {joinError && <div className="error-banner">{joinError}</div>}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? "Procesando…" : `🪙 Pagar ${live.entryCost} monedas y entrar`}
          </button>
          {!token && (
            <p className="paywall-login-hint">
              <Link href="/login" className="link-accent">Inicia sesión</Link> para comprar la entrada.
            </p>
          )}
          <Link href="/coins" className="paywall-buy-coins">
            🪙 Comprar monedas
          </Link>
          <Link href="/live" className="btn btn-secondary">← Volver a directos</Link>
        </div>

        <style jsx>{`
          .viewer-page { display: flex; flex-direction: column; gap: 1rem; }
          .paywall {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 3rem 2rem;
            max-width: 480px;
            margin: 2rem auto;
            text-align: center;
          }
          .paywall-icon { font-size: 3rem; }
          .paywall-title { font-size: 1.4rem; font-weight: 800; color: var(--text); margin: 0; }
          .paywall-streamer { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
          .paywall-desc { color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
          .paywall-cost {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(139,92,246,0.1);
            border: 1px solid rgba(139,92,246,0.3);
            border-radius: var(--radius-pill);
            padding: 0.5rem 1.5rem;
          }
          .coin-icon { font-size: 1.4rem; }
          .cost-num { font-size: 1.75rem; font-weight: 900; color: #a78bfa; }
          .cost-label { font-size: 0.85rem; color: var(--text-muted); font-weight: 600; }
          .error-banner {
            width: 100%;
            background: rgba(244,67,54,0.1);
            border: 1px solid var(--error);
            color: var(--error);
            border-radius: var(--radius-sm);
            padding: 0.65rem 1rem;
            font-size: 0.85rem;
          }
          .paywall-login-hint { font-size: 0.8rem; color: var(--text-muted); }
          .link-accent { color: var(--accent); text-decoration: underline; }
          .paywall-buy-coins {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.45rem 1.25rem;
            border-radius: 999px;
            font-size: 0.82rem;
            font-weight: 700;
            text-decoration: none;
            background: rgba(251,191,36,0.1);
            border: 1px solid rgba(251,191,36,0.3);
            color: #fbbf24;
            transition: all 0.2s;
          }
          .paywall-buy-coins:hover {
            background: rgba(251,191,36,0.2);
            box-shadow: 0 0 12px rgba(251,191,36,0.2);
          }
        `}</style>
      </div>
    );
  }

  const isCreator = !!(currentUserId && live.user?._id && currentUserId === String(live.user._id));
  const privateCallEnabled = live.user?.creatorProfile?.privateCallEnabled;
  const pricePerMinute = live.user?.creatorProfile?.pricePerMinute ?? 0;

  const handleStartPrivateCall = async () => {
    if (!token) {
      setCallError("Debes iniciar sesión para realizar llamadas privadas.");
      return;
    }

    setStartingCall(true);
    setCallError("");

    try {
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipientId: live.user._id, type: "paid_creator" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al iniciar la llamada");
      router.push(`/call/${data._id}`);
    } catch (err) {
      setCallError(err.message);
    } finally {
      setStartingCall(false);
    }
  };

  const handleEndStream = async () => {
    if (!token) return;
    setEndingStream(true);
    try {
      await fetch(`${API_URL}/api/lives/${id}/end`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
    } finally {
      setEndingStream(false);
      router.push("/live");
    }
  };

  const creatorNameRaw = live?.user?.username || live?.user?.name || "Creador";
  const creatorName =
    typeof creatorNameRaw === "string" && creatorNameRaw.trim()
      ? creatorNameRaw.trim()
      : "Creador";
  const creatorInitial = creatorName.charAt(0).toUpperCase() || "C";
  const recentGiftRarity = recentGift?.rarity || "common";
  const rarityStyle = RARITY_STYLES?.[recentGiftRarity] || {};
  let creatorStatusBadges = [];
  try {
    creatorStatusBadges = computeStatusBadges(
      { ...live.user, isLive: true, liveId: live._id },
      { viewerCount, giftsTotal: live.giftsTotal ?? 0 },
    ) || [];
  } catch (err) {
    console.error("[LiveRoomPage] status badge computation failed:", err);
    creatorStatusBadges = [];
  }

  return (
    <div className="room">
      <div className="room-layout">
        <div className="room-main">
          {/* ── Premium creator header bar ── */}
          <div className="creator-header-bar">
            <div className="chr-left">
              <div className="chr-avatar">
                {live.user?.avatar ? (
                  <img src={live.user.avatar} alt={creatorName} className="chr-avatar-img" />
                ) : (
                  creatorInitial
                )}
                <span className="chr-live-dot" />
              </div>
              <div className="chr-info">
                <div className="chr-name-row">
                  <span className="chr-name">@{creatorName}</span>
                  {(live.user?.role === "creator" || live.user?.creatorStatus === "approved") && (
                    <span className="chr-creator-badge">⭐ Creador</span>
                  )}
                </div>
                {creatorStatusBadges.length > 0 && (
                  <StatusBadges badges={creatorStatusBadges} compact style={{ marginTop: "0.2rem" }} />
                )}
                <div className="chr-meta-row">
                  <span className="chr-live-badge">🔴 EN VIVO</span>
                  <span className="chr-viewers">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    {viewerCount}
                  </span>
                  {live.isPrivate && <span className="chr-private-tag">🔒 Privado</span>}
                </div>
              </div>
            </div>
            <div className="chr-right">
              {!isCreator && live.user?._id && (
                <FollowButton targetId={String(live.user._id)} token={token} />
              )}
              <Link href="/live" className="chr-back-btn" title="Volver a directos">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </Link>
            </div>
          </div>

          <div className="video-wrap">
            {/* Agora video containers */}
            {isCreator ? (
              <div
                ref={localVideoContainerRef}
                className="agora-video-container"
              />
            ) : (
              <div
                ref={remoteVideoContainerRef}
                className="agora-video-container"
              />
            )}

            {/* Loading / error overlay (shown before Agora joins) */}
            {!agoraJoined && !agoraError && token && (
              <div className="video-joining">
                <div className="video-spinner" />
                <p className="video-joining-text">
                  {isCreator ? "Iniciando transmisión…" : "Conectando al directo…"}
                </p>
              </div>
            )}

            {/* Agora error overlay */}
            {agoraError && (
              <div className="video-joining">
                <span style={{ fontSize: "2.5rem" }}>📡</span>
                <p className="video-joining-text video-error-text">{agoraError}</p>
              </div>
            )}

            {/* No token overlay */}
            {!token && (
              <div className="video-joining">
                <span style={{ fontSize: "2.5rem" }}>🔐</span>
                <p className="video-joining-text">
                  <Link href="/login" className="link-accent">Inicia sesión</Link>{" "}
                  para ver el directo
                </p>
              </div>
            )}

            {activeGiftEffect ? (
              <GiftEffect
                gift={activeGiftEffect.gift}
                senderName={activeGiftEffect.senderName}
              />
            ) : null}

            {/* Entry join animation */}
            {agoraJoined && showEntryAnim && !isCreator && (
              <div className="entry-anim">
                <span className="entry-anim-icon">🎉</span>
                <span className="entry-anim-text">¡Conectado al directo!</span>
              </div>
            )}

            {/* Floating reactions (viewer only) */}
            {agoraJoined && !isCreator && <FloatingReactions />}

            {/* Live activity overlay — floating event feed on video */}
            <LiveFeedOverlay events={overlayEvents} />

            <div className="video-overlay">
              <div className="overlay-left">
                <span className="badge badge-live pulse">● EN VIVO</span>
                {live.isPrivate ? <span className="badge-private">🔒 PRIVADO</span> : null}
                {recentGift ? (
                  <span
                    className="recent-gift-badge"
                    style={{
                      borderColor: rarityStyle?.color || "rgba(255,255,255,0.12)",
                      boxShadow: rarityStyle?.glow ? `0 0 12px ${rarityStyle.glow}` : "0 0 12px rgba(224,64,251,0.18)",
                    }}
                  >
                    {recentGift.icon}{" "}
                    <span className="rgb-sender">{recentGift.senderName || "Alguien"}</span>
                    {" envió "}
                    <span className="rgb-coins">🪙 {recentGift.coinCost || 0} coins</span>
                  </span>
                ) : null}
              </div>

              <div className="overlay-right">
                <div className="creator-chip">
                  <div className="creator-avatar">
                    {creatorInitial}
                  </div>
                  <span>@{creatorName}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="action-bar">
            <div className="viewers-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <span>🔥 {viewerCount} viendo ahora</span>
            </div>

            <div className="action-buttons">
              {isCreator ? (
                <>
                  <span className="badge-broadcasting">🔴 TRANSMITIENDO</span>
                  <button
                    className="btn btn-end-stream btn-sm"
                    onClick={handleEndStream}
                    disabled={endingStream}
                  >
                    {endingStream ? "Finalizando…" : "⏹ Finalizar"}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-gift-cta" onClick={() => setShowGiftPanel(true)}>
                    <span className="btn-gift-cta-icon">🎁</span>
                    <span>Enviar regalo</span>
                  </button>

                  {privateCallEnabled ? (
                    <button
                      className="btn btn-call btn-sm"
                      onClick={handleStartPrivateCall}
                      disabled={startingCall}
                      title={`Llamada privada · 🪙 ${pricePerMinute}/min`}
                    >
                      {startingCall ? "Conectando…" : `📞 Llamar · 🪙${pricePerMinute}/min`}
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled
                      title="El creador no tiene llamadas privadas habilitadas"
                    >
                      📞 Llamada privada
                    </button>
                  )}

                  {callError ? (
                    <div className="call-error-banner">
                      <span>{callError}</span>
                      {(callError.toLowerCase().includes("balance") ||
                        callError.toLowerCase().includes("moneda") ||
                        callError.toLowerCase().includes("coin") ||
                        callError.toLowerCase().includes("saldo") ||
                        callError.toLowerCase().includes("insufficient")) && (
                        <Link href="/coins" className="call-error-coins-link">🪙 Comprar monedas</Link>
                      )}
                    </div>
                  ) : null}
                </>
              )}

              <Link href="/live" className="btn btn-ghost btn-sm">
                ← Directos
              </Link>
            </div>
          </div>

          <div className="stream-info card">
            <div className="stream-meta">
              <div className="stream-creator-row">
                <div className="avatar-placeholder" style={{ width: 40, height: 40, fontSize: "1rem", overflow: "hidden", flexShrink: 0 }}>
                  {live.user?.avatar ? (
                    <img src={live.user.avatar} alt={creatorName} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  ) : (
                    creatorInitial
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stream-creator-name">@{creatorName}</div>
                  <span className="badge badge-live" style={{ fontSize: "0.6rem", padding: "0.1rem 0.45rem" }}>
                    EN VIVO
                  </span>
                </div>
                {!isCreator && live.user?._id && (
                  <FollowButton targetId={String(live.user._id)} token={token} />
                )}
              </div>

              <h1 className="stream-title">{live.title}</h1>
              {live.description ? <p className="stream-desc">{live.description}</p> : null}
            </div>
          </div>
        </div>

        <div className="room-chat">
          <TopGifters liveId={id} refreshTrigger={giftRefreshTrigger} />
          <div className="chat-header">
            <span className="chat-header-icon">💬</span>
            <span>Chat en vivo</span>
            <span className="chat-header-live-dot" />
          </div>

          <div className="chat-messages">
            {/* Low-activity prompts */}
            {chatMessages.length <= 1 && !isCreator && (
              <div className="chat-prompts">
                <button className="chat-prompt-item" onClick={() => setShowGiftPanel(true)}>
                  🎁 Sé el primero en enviar un regalo
                </button>
                <div className="chat-prompt-item chat-prompt-static">
                  💬 Escribe en el chat y saluda
                </div>
                {privateCallEnabled && (
                  <button className="chat-prompt-item" onClick={handleStartPrivateCall} disabled={startingCall}>
                    📞 Conecta en privado
                  </button>
                )}
              </div>
            )}

            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-msg${msg.system ? " chat-msg-system" : ""}${msg.isGift ? " chat-msg-gift" : ""}`}
              >
                {msg.system ? (
                  <span className="chat-text-system">{msg.text}</span>
                ) : msg.isGift ? (
                  <>
                    <span className="chat-gift-icon">{msg.gift?.icon || "🎁"}</span>
                    <span className="chat-user chat-user-gift">{msg.user}</span>
                    <span className="chat-text chat-text-gift">envió {msg.gift?.name || "un regalo"}</span>
                    {msg.gift?.cost && (
                      <span className="chat-gift-coins">🪙 {msg.gift.cost}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="chat-user">{msg.user}</span>
                    <span className="chat-text">{msg.text}</span>
                  </>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-form" onSubmit={sendChatMessage}>
            <input
              className="chat-input"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={token ? "Escribe un mensaje…" : "Inicia sesión para chatear"}
              maxLength={200}
              disabled={!token}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!token || !chatInput.trim()}
            >
              ➤
            </button>
          </form>
        </div>
      </div>

      {/* ── Sticky quick dock (viewers only, mobile-friendly) ── */}
      {!isCreator && (
        <div className="quick-dock">
          <button className="dock-btn dock-gift" onClick={() => setShowGiftPanel(true)}>
            <span className="dock-icon">🎁</span>
            <span className="dock-label">Regalo</span>
          </button>
          {privateCallEnabled ? (
            <button
              className="dock-btn dock-call"
              onClick={handleStartPrivateCall}
              disabled={startingCall}
            >
              <span className="dock-icon">📞</span>
              <span className="dock-label">{startingCall ? "…" : "Privado"}</span>
            </button>
          ) : null}
          <button
            className="dock-btn dock-chat"
            onClick={() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            <span className="dock-icon">💬</span>
            <span className="dock-label">Chat</span>
          </button>
        </div>
      )}

      {showGiftPanel && live?.user?._id ? (
        <GiftPanel
          receiverId={live.user._id}
          liveId={id}
          context="live"
          onClose={() => setShowGiftPanel(false)}
          onGiftSent={handleGiftSent}
        />
      ) : null}

      <style jsx>{`
        .room {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .room-layout {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 1rem;
          align-items: start;
        }

        @media (max-width: 900px) {
          .room-layout { grid-template-columns: 1fr; }
        }

        .room-main {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        /* ── Premium Creator Header Bar ── */
        .creator-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, rgba(22,8,48,0.97) 0%, rgba(14,4,32,0.99) 100%);
          border: 1px solid rgba(224,64,251,0.22);
          border-radius: var(--radius);
          backdrop-filter: blur(16px);
          box-shadow: 0 0 28px rgba(224,64,251,0.08), var(--shadow);
        }

        .chr-left {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          min-width: 0;
          flex: 1;
        }

        .chr-avatar {
          position: relative;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          font-weight: 900;
          color: #fff;
          flex-shrink: 0;
          border: 2px solid rgba(224,64,251,0.5);
          box-shadow: 0 0 14px rgba(224,64,251,0.3);
          overflow: hidden;
        }

        .chr-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }

        .chr-live-dot {
          position: absolute;
          bottom: 1px;
          right: 1px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444;
          border: 2px solid rgba(14,4,32,0.99);
          animation: liveDotAnim 1.4s infinite;
        }

        @keyframes liveDotAnim {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.8); }
        }

        .chr-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 0;
        }

        .chr-name-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .chr-name {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chr-creator-badge {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #fbbf24;
          background: rgba(251,191,36,0.12);
          border: 1px solid rgba(251,191,36,0.35);
          border-radius: 999px;
          padding: 0.1rem 0.45rem;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .chr-meta-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .chr-live-badge {
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          color: #fff;
          background: #ef4444;
          border-radius: 999px;
          padding: 0.12rem 0.48rem;
          animation: liveBadgePulse 1.6s ease-in-out infinite;
          flex-shrink: 0;
        }

        @keyframes liveBadgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }

        .chr-viewers {
          display: flex;
          align-items: center;
          gap: 0.28rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .chr-private-tag {
          font-size: 0.62rem;
          font-weight: 700;
          color: #a78bfa;
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 999px;
          padding: 0.1rem 0.45rem;
        }

        .chr-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .chr-back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-muted);
          text-decoration: none;
          transition: all 0.18s;
          flex-shrink: 0;
        }

        .chr-back-btn:hover {
          background: rgba(255,255,255,0.1);
          color: var(--text);
        }

        .video-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid rgba(255,15,138,0.25);
          box-shadow: 0 0 40px rgba(255,15,138,0.15), var(--shadow);
        }

        .agora-video-container {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          background: #000;
        }

        .video-joining {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          background: radial-gradient(ellipse at center, rgba(30,8,60,0.95) 0%, rgba(6,2,15,0.98) 100%);
          z-index: 2;
        }

        .video-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255,15,138,0.15);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .video-joining-text {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-muted);
          text-align: center;
          padding: 0 1rem;
        }

        .video-error-text { color: var(--error); }

        .link-accent { color: var(--accent); text-decoration: underline; }

        /* Entry animation */
        .entry-anim {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 8;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          animation: entryFade 2s ease-out forwards;
          pointer-events: none;
        }

        .entry-anim-icon {
          font-size: 3rem;
          animation: entryBounce 0.6s ease-out;
        }

        .entry-anim-text {
          font-size: 1rem;
          font-weight: 800;
          color: #fff;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(8px);
          border-radius: 999px;
          padding: 0.4rem 1.2rem;
          border: 1px solid rgba(255,255,255,0.15);
        }

        @keyframes entryFade {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          20%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          70%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.05); }
        }

        @keyframes entryBounce {
          0%   { transform: scale(0.5); }
          60%  { transform: scale(1.2); }
          100% { transform: scale(1); }
        }

        .agora-video-container {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          background: #000;
        }

        .agora-video-container video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .agora-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255,15,138,0.15);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .video-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          padding: 0.6rem 0.85rem;
          background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%);
          z-index: 3;
        }

        .overlay-left,
        .overlay-right {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .creator-chip {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--radius-pill);
          padding: 0.25rem 0.65rem 0.25rem 0.25rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text);
          backdrop-filter: blur(6px);
        }

        .creator-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--grad-warm);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 900;
          color: #fff;
          flex-shrink: 0;
        }

        .recent-gift-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(12, 8, 26, 0.72);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--radius-pill);
          padding: 0.18rem 0.6rem;
          font-size: 0.68rem;
          font-weight: 800;
          color: #fff;
          backdrop-filter: blur(8px);
          animation: giftBadgeGlow 1.8s ease-in-out infinite;
          max-width: calc(100% - 1rem);
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .rgb-sender {
          color: #fbbf24;
          font-weight: 900;
        }

        .rgb-coins {
          color: #fbbf24;
          font-weight: 900;
        }

        @keyframes giftBadgeGlow {
          0%, 100% { transform: translateY(0); opacity: 0.95; }
          50% { transform: translateY(-1px); opacity: 1; }
        }

        .pulse::before {
          content: "";
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ff2d78;
          margin-right: 5px;
          animation: pulse-dot 1.4s infinite;
          vertical-align: middle;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }

        .badge-private {
          background: rgba(139,92,246,0.25);
          color: #c4b5fd;
          border: 1px solid rgba(139,92,246,0.4);
          border-radius: var(--radius-pill);
          padding: 0.15rem 0.55rem;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .viewers-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(26,11,46,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          padding: 0.35rem 0.9rem;
          font-size: 0.82rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .action-buttons {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .badge-broadcasting {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(255,15,138,0.12);
          border: 1px solid rgba(255,15,138,0.4);
          border-radius: var(--radius-pill);
          padding: 0.25rem 0.75rem;
          font-size: 0.65rem;
          font-weight: 800;
          color: #ff4fbd;
          letter-spacing: 0.07em;
          animation: bcast-glow 2s ease-in-out infinite;
        }

        @keyframes bcast-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(255,15,138,0.2); }
          50% { box-shadow: 0 0 14px rgba(255,15,138,0.45); }
        }

        .btn-end-stream {
          background: rgba(220,38,38,0.12);
          border: 1px solid rgba(220,38,38,0.45);
          color: #f87171;
          border-radius: var(--radius-pill);
          padding: 0.35rem 0.9rem;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
        }

        .btn-end-stream:hover:not(:disabled) {
          background: rgba(220,38,38,0.25);
          border-color: rgba(220,38,38,0.7);
          box-shadow: 0 0 12px rgba(220,38,38,0.3);
        }

        .btn-end-stream:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-call {
          background: rgba(99,102,241,0.15);
          border: 1px solid rgba(99,102,241,0.45);
          color: #a5b4fc;
          border-radius: var(--radius-pill);
          padding: 0.35rem 0.9rem;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
        }

        .btn-call:hover:not(:disabled) {
          background: rgba(99,102,241,0.28);
          border-color: rgba(99,102,241,0.7);
          box-shadow: 0 0 12px rgba(99,102,241,0.35);
        }

        .btn-call:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Glowing gift CTA */
        .btn-gift-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.45rem 1.2rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(224,64,251,0.25), rgba(139,92,246,0.25));
          border: 1px solid rgba(224,64,251,0.55);
          color: #f0abfc;
          font-size: 0.85rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
          animation: giftCtaGlow 2.5s ease-in-out infinite;
          letter-spacing: 0.02em;
        }

        .btn-gift-cta-icon { font-size: 1.05rem; }

        .btn-gift-cta:hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.4), rgba(139,92,246,0.4));
          border-color: rgba(224,64,251,0.8);
          box-shadow: 0 0 24px rgba(224,64,251,0.45);
          transform: scale(1.04);
        }

        @keyframes giftCtaGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(224,64,251,0.2), 0 0 20px rgba(224,64,251,0.08); }
          50% { box-shadow: 0 0 16px rgba(224,64,251,0.45), 0 0 36px rgba(224,64,251,0.18); }
        }

        /* Call error banner */
        .call-error-banner {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: rgba(244,67,54,0.08);
          border: 1px solid rgba(244,67,54,0.3);
          border-radius: var(--radius-pill);
          padding: 0.3rem 0.85rem;
          font-size: 0.75rem;
          color: var(--error);
          flex-wrap: wrap;
        }

        .call-error-coins-link {
          color: #fbbf24;
          font-weight: 700;
          text-decoration: none;
          border-bottom: 1px solid rgba(251,191,36,0.4);
          transition: color 0.15s;
          white-space: nowrap;
        }

        .call-error-coins-link:hover { color: #fde68a; }

        /* Quick dock */
        .quick-dock {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          margin-top: 0.5rem;
          background: linear-gradient(135deg, rgba(14,6,30,0.97) 0%, rgba(22,8,48,0.95) 100%);
          border: 1px solid rgba(224,64,251,0.18);
          border-radius: var(--radius);
          backdrop-filter: blur(16px);
          box-shadow: 0 0 24px rgba(224,64,251,0.06), var(--shadow);
        }

        @media (max-width: 900px) {
          .quick-dock {
            position: sticky;
            bottom: 0.5rem;
            z-index: 20;
            border-radius: var(--radius);
            margin-top: 0.75rem;
          }
        }

        .dock-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          padding: 0.55rem 1.1rem;
          border-radius: var(--radius);
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s;
          min-width: 64px;
        }

        .dock-icon { font-size: 1.35rem; line-height: 1; }
        .dock-label { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em; }

        .dock-gift {
          background: linear-gradient(135deg, rgba(224,64,251,0.18), rgba(139,92,246,0.18));
          border-color: rgba(224,64,251,0.45);
          color: #f0abfc;
          animation: dockGiftGlow 2.8s ease-in-out infinite;
        }

        @keyframes dockGiftGlow {
          0%, 100% { box-shadow: 0 0 6px rgba(224,64,251,0.15); }
          50% { box-shadow: 0 0 18px rgba(224,64,251,0.45), 0 0 36px rgba(224,64,251,0.12); }
        }

        .dock-gift:hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.35), rgba(139,92,246,0.35));
          border-color: rgba(224,64,251,0.75);
          box-shadow: 0 0 24px rgba(224,64,251,0.5);
          transform: translateY(-2px);
          color: #f5d0fe;
        }

        .dock-call {
          background: rgba(99,102,241,0.12);
          border-color: rgba(99,102,241,0.4);
          color: #a5b4fc;
        }

        .dock-call:hover:not(:disabled) {
          background: rgba(99,102,241,0.25);
          border-color: rgba(99,102,241,0.7);
          box-shadow: 0 0 16px rgba(99,102,241,0.35);
          transform: translateY(-2px);
        }

        .dock-call:disabled { opacity: 0.5; cursor: not-allowed; }

        .dock-chat {
          background: rgba(34,211,238,0.08);
          border-color: rgba(34,211,238,0.25);
          color: #67e8f9;
        }

        .dock-chat:hover {
          background: rgba(34,211,238,0.18);
          border-color: rgba(34,211,238,0.5);
          box-shadow: 0 0 14px rgba(34,211,238,0.25);
          transform: translateY(-2px);
        }

        /* Chat prompts (low-activity) */
        .chat-prompts {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          border: 1px dashed rgba(224,64,251,0.2);
          border-radius: var(--radius-sm);
          background: rgba(224,64,251,0.03);
          animation: promptsFadeIn 0.4s ease;
        }

        @keyframes promptsFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .chat-prompt-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.65rem;
          border-radius: var(--radius-sm);
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-muted);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
          width: 100%;
        }

        .chat-prompt-item:hover {
          background: rgba(224,64,251,0.08);
          border-color: rgba(224,64,251,0.25);
          color: var(--text);
        }

        .chat-prompt-static {
          cursor: default;
        }

        .chat-prompt-static:hover {
          background: rgba(255,255,255,0.03);
          border-color: rgba(255,255,255,0.06);
          color: var(--text-muted);
        }

        /* Enhanced chat messages */
        .chat-header-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ef4444;
          animation: chatLiveDot 1.4s infinite;
          margin-left: auto;
          flex-shrink: 0;
        }

        @keyframes chatLiveDot {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(239,68,68,0); }
        }

        .chat-user-gift {
          color: #f9a8d4 !important;
          font-size: 0.8rem;
        }

        .chat-user-gift::after { content: ""; }

        .chat-text-gift {
          color: var(--text-muted);
          font-size: 0.78rem;
        }

        .chat-gift-icon {
          font-size: 1rem;
          line-height: 1;
          align-self: center;
        }

        .chat-gift-coins {
          font-size: 0.7rem;
          font-weight: 800;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: 999px;
          padding: 0.08rem 0.4rem;
          align-self: center;
          flex-shrink: 0;
          margin-left: auto;
        }

        .chat-msg-gift {
          background: linear-gradient(135deg, rgba(224,64,251,0.08), rgba(244,63,94,0.06));
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: 0.85rem;
          padding: 0.5rem 0.7rem;
          box-shadow: 0 0 16px rgba(224,64,251,0.08), inset 0 1px 0 rgba(255,255,255,0.04);
          animation: giftMsgSlide 0.35s ease;
        }

        @keyframes giftMsgSlide {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .stream-info {
          background: rgba(20,8,42,0.9);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1rem 1.25rem;
          backdrop-filter: blur(16px);
        }

        .stream-meta {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .stream-creator-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .stream-creator-name {
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--text);
        }

        .stream-title {
          font-size: 1.2rem;
          font-weight: 800;
          background: linear-gradient(135deg, #F8F4FF, #FF4FD8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          line-height: 1.3;
        }

        .stream-desc {
          color: var(--text-muted);
          font-size: 0.875rem;
          line-height: 1.5;
          margin: 0;
        }

        .room-chat {
          display: flex;
          flex-direction: column;
          background: rgba(14,5,32,0.92);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          height: 540px;
          position: sticky;
          top: 1rem;
        }

        @media (max-width: 900px) {
          .room-chat {
            height: 400px;
            position: static;
          }
        }

        .chat-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: rgba(224,64,251,0.06);
          border-bottom: 1px solid var(--border);
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text);
          flex-shrink: 0;
        }

        .chat-header-icon { font-size: 1rem; }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(224,64,251,0.2) transparent;
        }

        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-thumb { background: rgba(224,64,251,0.25); border-radius: 4px; }

        .chat-msg {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
          align-items: baseline;
          font-size: 0.82rem;
          line-height: 1.4;
          word-break: break-word;
        }

        .chat-msg-system {
          justify-content: center;
        }

        .chat-user {
          font-weight: 700;
          color: var(--accent-2);
          white-space: nowrap;
        }

        .chat-user::after { content: ":"; }

        .chat-text { color: var(--text); }

        .chat-text-system {
          font-size: 0.75rem;
          color: var(--text-dim);
          font-style: italic;
          text-align: center;
        }

        .chat-form {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
          background: rgba(10,4,24,0.8);
        }

        .chat-input {
          flex: 1;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          color: var(--text);
          font-size: 0.82rem;
          padding: 0.5rem 0.875rem;
          outline: none;
          transition: border-color var(--transition);
          min-width: 0;
        }

        .chat-input:focus { border-color: rgba(224,64,251,0.45); }
        .chat-input::placeholder { color: var(--text-dim); }
        .chat-input:disabled { opacity: 0.5; cursor: not-allowed; }

        .chat-send-btn {
          flex-shrink: 0;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--grad-warm);
          border: none;
          color: #fff;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity var(--transition), transform var(--transition);
        }

        .chat-send-btn:hover:not(:disabled) { opacity: 0.85; transform: scale(1.08); }
        .chat-send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
