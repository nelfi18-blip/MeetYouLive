"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import GiftEffect from "@/components/GiftEffect";
import GiftPanel from "@/components/GiftPanel";
import GiftAnimation from "@/components/GiftAnimation";
import SuperGiftAnimation from "@/components/gifts/SuperGiftAnimation";
import TopGifters from "@/components/TopGifters";
import TopSupporterBadge from "@/components/TopSupporterBadge";
import FloatingReactions from "@/components/FloatingReactions";
import FollowButton from "@/components/FollowButton";
import StatusBadges from "@/components/StatusBadges";
import LiveFeedOverlay from "@/components/LiveFeedOverlay";
import LiveGoalPanel from "@/components/LiveGoalPanel";
import LiveVsBattlePanel from "@/components/LiveVsBattlePanel";
import GiftComboOverlay from "@/components/GiftComboOverlay";
import GiftComboNotification from "@/components/GiftComboNotification";
import LiveEventBanner from "@/components/LiveEventBanner";
import LiveGiftToast from "@/components/LiveGiftToast";
import LivePressureHints from "@/components/LivePressureHints";
import PaywallModal from "@/components/PaywallModal";
import GiftOverlay from "@/components/GiftOverlay";
import LiveEventFeed from "@/components/LiveEventFeed";
import ModerationActions from "@/components/ModerationActions";
import MultiVideoGrid from "@/components/MultiVideoGrid";
import GuestControlsPanel from "@/components/GuestControlsPanel";
import { computeStatusBadges } from "@/lib/statusBadges";
import { RARITY_STYLES } from "@/lib/gifts";
import { getDisplayName, getUserImage } from "@/lib/imageHelpers";
import { useLanguage } from "@/contexts/LanguageContext";
import socket, { configureSocketAuth } from "@/lib/socket";
import { isNativeMobileApp } from "@/lib/mobileEnvironment";
import useMultiGuestLive from "@/lib/useMultiGuestLive";
import {
  createLocalParticipant,
  createMultiGuestUidUserInfoMap,
  buildRenderableVideoParticipants,
  buildGiftRecipients,
  getGuestPublicationStatusForTransition,
} from "@/lib/multiGuestPresentation";
import {
  shouldPublish as shouldAgoraPublish,
  createGuestTransitionQueue,
  applyGuestTransition,
} from "@/lib/agoraGuestTransition";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;

const truncateText = (text, max = 50) => {
  const safeText = text == null ? "" : String(text);
  return safeText.length > max ? safeText.slice(0, max) + "…" : safeText;
};

const FAN_MEDALS = ["👑", "🥈", "🥉"];

// Gift rarities that qualify as "epic or better" for pressure triggers
const EPIC_PLUS_RARITIES = ["epic", "legendary", "mythic"];

// Pressure system configuration constants
const PRESSURE_HINT_MIN_INTERVAL_MS = 6000;   // min time between same-type hints
const PRESSURE_HINT_DISPLAY_MS      = 4000;   // how long a hint stays visible
const TOP_FAN_PROXIMITY_THRESHOLD   = 0.7;    // 70% of 3rd fan's coins = "close"
const GIFT_ACTIVITY_WINDOW_MS       = 10000;  // window for counting unique gifters
const BOOST_QUANTITY_THRESHOLD      = 10;     // qty >= this triggers a boost moment
const BOOST_MEGA_THRESHOLD          = 50;     // qty >= this triggers "mega" subtext
const MIN_AGORA_RENEWAL_DELAY_MS    = 10000;
const DEFAULT_AGORA_TOKEN_TTL_SECONDS = 60;
const AGORA_RENEWAL_BUFFER_SECONDS  = 30;
const LIVE_JOIN_TIMEOUT_MS = 20000;

function isPermissionDeniedError(err) {
  return (
    err?.name === "NotAllowedError" ||
    err?.name === "PermissionDeniedError" ||
    err?.code === "PERMISSION_DENIED"
  );
}

export default function LiveRoomPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const router = useRouter();
  const formatText = useCallback(
    (key, replacements = {}) =>
      Object.entries(replacements).reduce(
        (message, [name, value]) => message.replace(`{${name}}`, String(value)),
        t(key)
      ),
    [t]
  );

  const [live, setLive] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [activeGiftEffect, setActiveGiftEffect] = useState(null);
  const [recentGift, setRecentGift] = useState(null);
  const [giftAnimation, setGiftAnimation] = useState(null);
  
  // Super gift animation state (for new 3-tier system)
  const [superGiftAnimation, setSuperGiftAnimation] = useState(null);

  
  // Gift queue for new overlay system
  const [giftQueue, setGiftQueue] = useState([]);
  const giftQueueIdRef = useRef(0);

  const [startingCall, setStartingCall] = useState(false);
  const [callError, setCallError] = useState("");

  const [chatMessages, setChatMessages] = useState([
    { id: 0, user: t("liveRoomUi.systemUser"), text: t("liveRoomUi.welcomeLive"), system: true },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatSendError, setChatSendError] = useState("");
  const [socketState, setSocketState] = useState(() => (socket.connected ? "connected" : "connecting"));
  const chatEndRef = useRef(null);
  const msgCounterRef = useRef(1);
  const giftEffectTimeoutRef = useRef(null);
  const recentGiftTimeoutRef = useRef(null);
  const liveModerationStatusTimeoutRef = useRef(null);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUsername, setCurrentUsername] = useState("");
  const currentUsernameRef = useRef("");
  const [meLoaded, setMeLoaded] = useState(false);
  const [endingStream, setEndingStream] = useState(false);
  const [showEntryAnim, setShowEntryAnim] = useState(true);

  // Live viewer count (updated in real time via socket)
  const [viewerCount, setViewerCount] = useState(0);
  const [audienceViewers, setAudienceViewers] = useState([]);
  const [showAudiencePanel, setShowAudiencePanel] = useState(false);
  // Incremented on each received gift to trigger TopGifters re-fetch
  const [giftRefreshTrigger, setGiftRefreshTrigger] = useState(0);

  // Top supporter tracking (current leader in the room)
  const [topSupporter, setTopSupporter] = useState(null);

  // Recent gifts for combo overlay (keeps last 15 with timestamps)
  const [recentGiftsForCombo, setRecentGiftsForCombo] = useState([]);

  // User combo notification (rapid gift streaks)
  const [currentCombo, setCurrentCombo] = useState(null);

  // Live activity overlay events (gifts, joins, messages)
  const [overlayEvents, setOverlayEvents] = useState([]);
  const overlayCounterRef = useRef(0);

  // Live event feed (top supporter, combo streak, super gift)
  const [eventFeedItems, setEventFeedItems] = useState([]);
  const eventFeedCounterRef = useRef(0);

  // Live engagement event (x2 coins, boost, etc.)
  const [activeEvent, setActiveEvent] = useState(null);

  // Countdown seconds for last_boost events (for urgency banner)
  const [boostSecondsLeft, setBoostSecondsLeft] = useState(null);

  // Top fan tracking: userId → totalCoins (for chat badge highlighting)
  const topFanMapRef = useRef({});
  // Top fan name lookup: userId → username
  const topFanNamesRef = useRef({});
  const [topFanNames, setTopFanNames] = useState({});
  // Top 3 fan user IDs sorted by spend (index 0 = #1 fan)
  const [topFanIds, setTopFanIds] = useState([]);

  const rememberTopFanName = useCallback((fanId, username) => {
    if (!fanId || !username) return;
    const key = String(fanId);
    topFanNamesRef.current[key] = username;
    setTopFanNames((prev) => (prev[key] === username ? prev : { ...prev, [key]: username }));
  }, []);

  const [currentUserIsVIP, setCurrentUserIsVIP] = useState(false);
  const currentUserIsVIPRef = useRef(false);

  // Multi-Guest is Creator-only: reuse the existing /api/user/me response
  // (no second request) to know whether this viewer is an approved creator.
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [currentUserCreatorStatus, setCurrentUserCreatorStatus] = useState(null);

  // Viewer coin balance (for low-coin CTA)
  const [coinBalance, setCoinBalance] = useState(null);

  // Ref for the gift toast component
  const giftToastRef = useRef(null);

  // Creator event controls
  const [triggeringEvent, setTriggeringEvent] = useState(false);
  const [liveModerationStatus, setLiveModerationStatus] = useState("");

  // Seen gift IDs for dedup
  const seenGiftIdsRef = useRef(new Set());

  // Goal data from LiveGoalPanel (for goal-based urgency bar)
  const [goalData, setGoalData] = useState(null);
  const goalDataRef = useRef(null);

  // Active pressure hint (non-blocking overlay)
  const [pressureHint, setPressureHint] = useState(null);
  const hintTimerRef = useRef(null);
  const lastHintTimeByTypeRef = useRef({});
  const hintCounterRef = useRef(0);

  // Gift activity window (for "N personas enviando regalos" signal)
  const giftWindowRef = useRef([]); // [{senderId, ts}]
  const prevTopFanIdsRef = useRef([]); // track changes to top fan list

  // Contextual paywall modal
  const [paywallReason, setPaywallReason] = useState(null); // null | 'low_coins' | 'lost_top_fan' | 'goal_urgent'
  // Per-reason debounce: reason → last-shown timestamp (5 min cooldown)
  const paywallCooldownRef = useRef({});
  // Track previous coinBalance to detect drops below 50
  const prevCoinBalanceRef = useRef(null);
  // Prevent the goal_urgent trigger from firing more than once per boost event
  const boostPaywallTriggeredRef = useRef(false);
  // Tracks whether the current user is the creator of this live room (kept in sync via effect)
  const isCreatorRef = useRef(false);

  /** Recompute the top 3 fan userIds from the local coins map (highest spenders first). */
  const computeTopFans = (map) => {
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([uid]) => uid);
  };

  /**
   * Returns true if the gift warrants a boost-moment pressure hint.
   * Extracted to avoid duplication between socket and sender-side paths.
   */
  const isBoostGift = (quantity, rarity) =>
    quantity >= BOOST_QUANTITY_THRESHOLD || EPIC_PLUS_RARITIES.includes(rarity);

  const boostSubtext = (quantity) =>
    quantity >= BOOST_MEGA_THRESHOLD ? t("liveRoomUi.boostKeepSending") : t("liveRoomUi.boostStreakActive");

  const addOverlayEvent = useCallback((type, icon, text) => {
    const overlayEventId = `ov_${++overlayCounterRef.current}_${Date.now()}`;
    setOverlayEvents((prev) => [...prev, { id: overlayEventId, type, icon, text }]);
  }, []);

  // Helper function to add events to the live event feed
  const addEventFeedItem = useCallback((type, data) => {
    const eventId = `event_${++eventFeedCounterRef.current}_${Date.now()}`;
    setEventFeedItems((prev) => [...prev, { id: eventId, type, data }]);
  }, []);

  /**
   * Show a pressure hint. Debounced per type (min interval between same types).
   * Safe to call from anywhere – no infinite loops.
   */
  const showPressureHint = useCallback((type, icon, text, subtext) => {
    const now = Date.now();
    const lastTime = lastHintTimeByTypeRef.current[type] || 0;
    if (now - lastTime < PRESSURE_HINT_MIN_INTERVAL_MS) return;
    lastHintTimeByTypeRef.current[type] = now;
    const id = `ph_${++hintCounterRef.current}_${now}`;
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setPressureHint({ id, type, icon, text, subtext: subtext || null });
    hintTimerRef.current = setTimeout(() => setPressureHint(null), PRESSURE_HINT_DISPLAY_MS + 500);
  }, []);

  /**
   * Add gift to the queue for the new overlay system.
   * Queued gifts will be displayed one at a time without overlapping.
   */
  const addGiftToQueue = useCallback((giftData) => {
    giftQueueIdRef.current += 1;
    const queueItem = {
      id: `gift_${giftQueueIdRef.current}_${Date.now()}`,
      ...giftData,
    };
    setGiftQueue((prev) => [...prev, queueItem]);
  }, []);

  /**
   * Show the contextual paywall modal. Debounced per reason (5-min cooldown).
   * Never shown to the creator of the live room.
   */
  const PAYWALL_COOLDOWN_MS = 5 * 60 * 1000;
  const triggerPaywall = useCallback((reason) => {
    if (!currentUserId) return;
    const now = Date.now();
    const last = paywallCooldownRef.current[reason] || 0;
    if (now - last < PAYWALL_COOLDOWN_MS) return;
    paywallCooldownRef.current[reason] = now;
    setPaywallReason(reason);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Trigger paywall: coinBalance drops from ≥50 to <50 during the session
  useEffect(() => {
    if (!currentUserId || !meLoaded) return;
    if (coinBalance === null) return;
    if (isCreatorRef.current) { prevCoinBalanceRef.current = coinBalance; return; }
    const prev = prevCoinBalanceRef.current;
    prevCoinBalanceRef.current = coinBalance;
    if (prev !== null && prev >= 50 && coinBalance < 50) {
      triggerPaywall("low_coins");
    }
  }, [coinBalance, currentUserId, meLoaded, triggerPaywall]);

  // Reset boost paywall guard when a new last_boost event becomes active
  useEffect(() => {
    if (activeEvent?.type === "last_boost") {
      boostPaywallTriggeredRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent?.type, activeEvent?.expiresAt]);

  // Trigger paywall: last_boost event hits ≤30 s remaining
  useEffect(() => {
    if (!currentUserId || !meLoaded) return;
    if (!boostSecondsLeft || boostSecondsLeft > 30) return;
    if (isCreatorRef.current) return;
    if (!boostPaywallTriggeredRef.current) {
      boostPaywallTriggeredRef.current = true;
      triggerPaywall("goal_urgent");
    }
  }, [boostSecondsLeft, currentUserId, meLoaded, triggerPaywall]);

  // Keep isCreatorRef in sync whenever currentUserId or live data changes
  useEffect(() => {
    isCreatorRef.current = !!(currentUserId && live?.user?._id && currentUserId === String(live.user._id));
  }, [currentUserId, live]);

  // Computed early (before any conditional return) so it can be used by hooks below.
  const isCreator = !!(currentUserId && live?.user?._id && currentUserId === String(live.user._id));

  // Creator-only gate for Multi-Guest: only approved creators/subCreators may
  // request to join with camera/mic. Regular viewers remain spectators.
  const canRequestMultiGuest =
    (currentUserRole === "creator" || currentUserRole === "subCreator") &&
    currentUserCreatorStatus === "approved";

  // Declared before useMultiGuestLive (below) since that hook needs `token` on first call.
  const [token, setToken] = useState(null);
  useEffect(() => {
    setToken(localStorage.getItem("token"));
  }, []);

  // ── Multi-guest state (single source of truth — reuses existing hook/API/socket events) ──
  const {
    guests,
    guestRequests,
    isGuest,
    hasRequestedJoin,
    requestStatus,
    requestJoin,
    approveGuest,
    declineGuest,
    removeGuest,
    leaveAsGuest,
  } = useMultiGuestLive(id, token, currentUserId, isCreator, socket);

  // Agora state
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [agoraError, setAgoraError] = useState("");
  const [guestPublicationStatus, setGuestPublicationStatus] = useState("preparing");
  // True only while the most recent guest promote-to-publisher attempt has
  // failed (and been rolled back to audience) — drives the "tap to retry"
  // affordance on the existing Agora error overlay. Reset on any successful
  // promote/demote.
  const [guestPromotionFailed, setGuestPromotionFailed] = useState(false);
  // Map of remote Agora uid → { uid, videoTrack, audioTrack, hasVideo, hasAudio }
  // Powers MultiVideoGrid for viewers (audience) AND for host/guests seeing each other.
  const [remoteAgoraUsers, setRemoteAgoraUsers] = useState(new Map());
  const agoraClientRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoContainerRef = useRef(null);
  const hostTrackRecoveryInFlightRef = useRef(false);
  const hostTrackRecoveryPendingRef = useRef(false);
  const hostWasBackgroundedRef = useRef(false);
  // Tracks whether the local client currently holds publish privilege
  // (host, or an approved guest promoted in place). Used to pick the right
  // role when renewing the Agora token, and to avoid re-running a
  // promote/demote transition that's already in the desired state.
  const isPublisherStateRef = useRef(false);
  // Serializes audience <-> publisher transitions for Multi-Guest approvals
  // so a demote/promote already in flight always finishes before the next
  // one starts — see frontend/lib/agoraGuestTransition.js.
  const [guestTransitionQueue] = useState(() => createGuestTransitionQueue());

  // Shared Agora token fetcher used both by the initial join and by the
  // Multi-Guest audience/publisher transition below — keeps the channel/role
  // query contract in one place.
  const fetchAgoraTokenForRole = useCallback(
    async (channelName, role) => {
      const tokenRes = await fetch(
        `${API_URL}/api/agora/token?channelName=${encodeURIComponent(channelName)}&role=${role}`,
        { headers: { Authorization: "Bearer " + token } }
      );
      if (!tokenRes.ok) throw new Error("No se pudo obtener token de Agora");
      return tokenRes.json();
    },
    [token]
  );

  useEffect(() => {
    fetch(`${API_URL}/api/lives/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(t("liveRoomUi.loadLiveError"));
        return res.json();
      })
      .then((data) => {
        setLive(data);
        // Initialize top supporter from live data
        if (data.topSupporter?.username && data.topSupporter?.totalCoins != null) {
          setTopSupporter({
            userId: data.topSupporter.userId,
            username: data.topSupporter.username,
            totalCoins: data.topSupporter.totalCoins,
          });
        }
      })
      .catch(() => setError(t("liveRoomUi.liveEndedOrNotFound")));
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
        if (data?.username || data?.name) {
          const uname = getDisplayName(data);
          setCurrentUsername(uname);
          currentUsernameRef.current = uname;
        }
        if (data?.coins !== undefined) setCoinBalance(data.coins);
        const vip = !!(data?.isVIP);
        setCurrentUserIsVIP(vip);
        currentUserIsVIPRef.current = vip;
        if (data?.role !== undefined) setCurrentUserRole(data.role);
        if (data?.creatorStatus !== undefined) setCurrentUserCreatorStatus(data.creatorStatus);
      })
      .catch(() => {})
      .finally(() => setMeLoaded(true));
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const markConnected = () => setSocketState("connected");
    const markConnecting = () => setSocketState("connecting");
    const markDisconnected = () => setSocketState("disconnected");

    setSocketState(socket.connected ? "connected" : "connecting");
    socket.on("connect", markConnected);
    socket.on("reconnect_attempt", markConnecting);
    socket.on("connect_error", markDisconnected);
    socket.on("disconnect", markDisconnected);

    return () => {
      socket.off("connect", markConnected);
      socket.off("reconnect_attempt", markConnecting);
      socket.off("connect_error", markDisconnected);
      socket.off("disconnect", markDisconnected);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (giftEffectTimeoutRef.current) clearTimeout(giftEffectTimeoutRef.current);
      if (recentGiftTimeoutRef.current) clearTimeout(recentGiftTimeoutRef.current);
      if (liveModerationStatusTimeoutRef.current) clearTimeout(liveModerationStatusTimeoutRef.current);
    };
  }, []);

  // Initialise viewerCount from the loaded live data
  useEffect(() => {
    if (live) {
      setViewerCount(live.viewerCount ?? 0);
    }
  }, [live]);

  // Countdown timer for last_boost live events (drives urgency banner)
  useEffect(() => {
    if (!activeEvent?.expiresAt) {
      setBoostSecondsLeft(null);
      return;
    }
    const updateCountdown = () => {
      const diff = Math.max(0, Math.ceil((new Date(activeEvent.expiresAt) - Date.now()) / 1000));
      setBoostSecondsLeft(diff);
    };
    updateCountdown();
    const timerId = setInterval(updateCountdown, 1000);
    return () => clearInterval(timerId);
  }, [activeEvent?.expiresAt]);

  // Top fan pressure: detect when current viewer enters/leaves/approaches top 3
  useEffect(() => {
    if (!currentUserId || !meLoaded) return;

    const prevIds = prevTopFanIdsRef.current;
    const wasTopFan = prevIds.includes(currentUserId);
    const isTopFan  = topFanIds.includes(currentUserId);

    if (!wasTopFan && isTopFan) {
      // User just became a top fan – positive feedback, no pressure needed here
    } else if (wasTopFan && !isTopFan) {
      // User just LOST their top fan position
      showPressureHint("lost_top_fan", "⚠️", t("liveRoomUi.lostTopFanTitle"), t("liveRoomUi.recoverTopFanPrompt"));
      triggerPaywall("lost_top_fan");
    } else if (!isTopFan && topFanIds.length >= 3) {
      // All 3 top fan slots taken — check proximity to the 3rd-place fan
      const thirdFanCoins = topFanMapRef.current[topFanIds[2]] || 0;
      const myCoins = topFanMapRef.current[currentUserId] || 0;
      if (thirdFanCoins > 0 && myCoins > 0 && myCoins >= thirdFanCoins * TOP_FAN_PROXIMITY_THRESHOLD) {
        const needed = Math.max(0, thirdFanCoins - myCoins + 1);
        showPressureHint(
          "top_fan_close",
          "👑",
          t("liveRoomUi.closeToTopFanTitle"),
          needed > 0 ? formatText("liveRoomUi.coinsAway", { count: needed }) : t("liveRoomUi.sendGiftNow")
        );
      }
    }

    prevTopFanIdsRef.current = topFanIds;
  }, [formatText, topFanIds, currentUserId, meLoaded, showPressureHint, t, triggerPaywall]);

  // ── Socket live room ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !meLoaded) return;
    if (!token) return;

    configureSocketAuth(token);
    if (!socket.connected) socket.connect();

    const joinRoom = () => {
      socket.emit("join_live_room", {
        liveId: id,
        user: currentUserId ? { username: currentUsername || t("liveRoomUi.genericViewer") } : null,
      });
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on("connect", joinRoom);

    const onChatMessage = ({ user, text }) => {
      const displayName = getDisplayName(user);
      const userId = user?.userId || null;
      const isVIP = !!(user?.isVIP);
      setChatMessages((prev) => [
        ...prev,
        { id: ++msgCounterRef.current, user: displayName, userId, text, system: false, isVIP },
      ]);
      // Show recent chat messages in the video overlay (truncated)
      addOverlayEvent("chat", isVIP ? "💎" : "💬", `${displayName}: ${truncateText(text)}`);
    };

    const onViewerCountUpdate = ({ liveId: updatedId, count }) => {
      if (String(updatedId) !== String(id)) return;
      setViewerCount(Number.isFinite(count) ? count : 0);
    };
    const onLiveAudienceUpdate = ({ liveId: updatedId, count, viewers }) => {
      if (String(updatedId) !== String(id)) return;
      const nextViewers = Array.isArray(viewers) ? viewers : [];
      setAudienceViewers(nextViewers);
      setViewerCount(Number.isFinite(count) ? count : nextViewers.length);
    };
    const onLiveJoinRejected = ({ liveId: rejectedLiveId }) => {
      if (String(rejectedLiveId) !== String(id)) return;
      setChatMessages((prev) => [
        ...prev,
        { id: ++msgCounterRef.current, user: t("liveRoomUi.systemUser"), text: t("liveRoomUi.joinRejected"), system: true },
      ]);
      setTimeout(() => router.replace("/live"), 1200);
    };

    const onLiveGiftSent = ({ senderName, senderId, receiverId: giftReceiverId, giftId, gift, quantity: qty }) => {
      if (!gift) return;

      // Dedup: skip if we've already processed this giftId
      if (giftId) {
        if (seenGiftIdsRef.current.has(giftId)) return;
        seenGiftIdsRef.current.add(giftId);
        // Keep seen set bounded
        if (seenGiftIdsRef.current.size > 200) {
          const first = seenGiftIdsRef.current.values().next().value;
          seenGiftIdsRef.current.delete(first);
        }
      }

      // Skip if this user is the sender (they already have immediate local feedback)
      if (senderId && currentUserId && senderId === currentUserId) return;

      const quantity = qty && qty > 1 ? qty : 1;

      // Update top fan map
      if (senderId && gift.coinCost > 0) {
        topFanMapRef.current[senderId] = (topFanMapRef.current[senderId] || 0) + gift.coinCost;
        rememberTopFanName(senderId, senderName);
        setTopFanIds(computeTopFans(topFanMapRef.current));
      }

      // Trigger NEW gift animation (super or normal)
      setGiftAnimation({
        gift: { ...gift, quantity },
        senderName,
      });

      // Trigger gift animation effect for all viewers
      const effectRarity = quantity >= 50 ? "mythic" : quantity >= 10 ? "epic" : gift.rarity;
      setActiveGiftEffect({ gift: { ...gift, rarity: effectRarity }, senderName, quantity });
      setRecentGift({ ...gift, senderName });

      if (giftEffectTimeoutRef.current) clearTimeout(giftEffectTimeoutRef.current);
      if (recentGiftTimeoutRef.current) clearTimeout(recentGiftTimeoutRef.current);

      giftEffectTimeoutRef.current = setTimeout(
        () => setActiveGiftEffect(null),
        ["mythic", "legendary"].includes(effectRarity) ? 7000 : ["epic", "rare"].includes(effectRarity) ? 4500 : 2200,
      );
      recentGiftTimeoutRef.current = setTimeout(() => setRecentGift(null), 6000);

      // Add gift to the new overlay queue system for enhanced animations
      addGiftToQueue({
        giftId: giftId || null,
        giftName: gift.name || t("gifts.giftLabel"),
        senderId: senderId || null,
        senderName: senderName || t("gifts.someone"),
        receiverId: giftReceiverId || live?.user?._id || null,
        coins: gift.coinCost || 0,
        isSuper: gift.isSuper || false,
        animationUrl: gift.animationUrl || null,
        soundUrl: gift.soundUrl || null,
        icon: gift.icon || "🎁",
        rarity: effectRarity,
      });
      
      // Add super gift notification to event feed if it's a super gift
      if (gift.isSuper || EPIC_PLUS_RARITIES.includes(effectRarity)) {
        addEventFeedItem("super_gift", {
          icon: gift.icon || "✨",
          name: gift.name || t("gifts.premiumGift"),
          sender: senderName || t("gifts.someone"),
          quantity: quantity || 1,
        });
      }

      // Add gift event to the chat / activity feed
      const qtyLabel = quantity > 1 ? ` x${quantity}` : "";
      setChatMessages((prev) => [
        ...prev,
        {
          id: ++msgCounterRef.current,
          user: senderName,
          userId: senderId || null,
          text: `${gift.icon || "🎁"} ${gift.name || t("gifts.giftLabel").toLowerCase()}${qtyLabel}`,
          gift,
          system: false,
          isGift: true,
        },
      ]);

      // Show gift event in the video overlay
      addOverlayEvent(
        "gift",
        gift.icon || "🎁",
        formatText("gifts.sentPattern", {
          sender: senderName,
          gift: gift.name || t("gifts.genericGift"),
          quantity: qtyLabel,
        })
      );

      // Animated toast notification for high-value gifts
      giftToastRef.current?.push({
        senderName,
        giftIcon: gift.icon || "🎁",
        giftName: gift.name || t("gifts.giftLabel").toLowerCase(),
        coinCost: gift.coinCost || 0,
        rarity: gift.rarity || "common",
        quantity,
      });

      // Refresh top gifters leaderboard
      setGiftRefreshTrigger((n) => n + 1);

      // Track for combo overlay
      setRecentGiftsForCombo((prev) => {
        const updated = [...prev.slice(-14), { gift, senderName, timestamp: Date.now() }];
        
        // Check for combo/streak and trigger event feed notification
        const now = Date.now();
        const recentWindow = updated.filter((g) => now - g.timestamp < 4000); // 4 second window
        
        if (recentWindow.length >= 3) { // Show feed notification for combos of 3+
          const latestIcon = gift.icon;
          const streakCount = recentWindow.filter((g) => g.gift?.icon === latestIcon).length;
          const isStreak = streakCount >= 3 && streakCount === recentWindow.length;
          
          addEventFeedItem("combo_streak", {
            count: recentWindow.length,
            isStreak,
            streakIcon: latestIcon,
          });
        }
        
        return updated;
      });

      // ── Pressure signals ────────────────────────────────────────────────────

      // Boost moment: big quantity or high rarity
      if (isBoostGift(quantity, effectRarity)) {
        showPressureHint("boost_moment", "💥", t("liveRoomUi.epicMomentTitle"), boostSubtext(quantity));
      }

      // Activity signal: track unique gifters in last GIFT_ACTIVITY_WINDOW_MS
      const now = Date.now();
      if (senderId) {
        giftWindowRef.current = [
          ...giftWindowRef.current.filter((e) => now - e.ts < GIFT_ACTIVITY_WINDOW_MS),
          { senderId, ts: now },
        ];
        const uniqueSenders = new Set(giftWindowRef.current.map((e) => e.senderId));
        if (uniqueSenders.size >= 3) {
          showPressureHint(
            "activity",
            "🔥",
            formatText("liveRoomUi.peopleSendingGifts", { count: uniqueSenders.size }),
            t("liveRoomUi.momentIsNow")
          );
        }
      }

      // Goal contribution: notify when active goal exists
      const gd = goalDataRef.current;
      if (gd?.active && !gd?.completed && gift.coinCost > 0) {
        const remaining = Math.max(0, gd.target - gd.progress);
        const addedCoins = gift.coinCost * quantity;
        showPressureHint(
          "goal_contrib",
          "🎯",
          formatText("liveRoomUi.goalContribution", { count: addedCoins }),
          remaining > addedCoins
            ? formatText("liveRoomUi.coinsRemaining", { count: Math.max(0, remaining - addedCoins) })
            : t("liveRoomUi.almostThere")
        );
      }
    };

    const onUserJoined = ({ user }) => {
      const name = user?.username || t("gifts.someone");
      setChatMessages((prev) => [
        ...prev,
        {
          id: ++msgCounterRef.current,
          user: t("liveRoomUi.systemUser"),
          userId: user?.userId || null,
          displayName: name,
          text: formatText("liveRoomUi.userJoinedLive", { name }),
          system: true,
        },
      ]);
      // Show join event in the video overlay
      addOverlayEvent("join", "👋", formatText("liveRoomUi.userJoinedLive", { name }));
    };

    const onLiveEnded = () => {
      // Show an in-chat notice and redirect viewers after a short delay
      setChatMessages((prev) => [
        ...prev,
        { id: ++msgCounterRef.current, user: t("liveRoomUi.systemUser"), text: t("liveRoomUi.liveEndedNotice"), system: true },
      ]);
      setTimeout(() => router.push("/live"), 3000);
    };

    const onLiveUserModerated = ({ liveId: moderatedLiveId, targetUserId, action }) => {
      const isSameLive = String(moderatedLiveId) === String(id);
      const isCurrentUserTarget = currentUserId && String(targetUserId) === String(currentUserId);
      if (!isSameLive || !isCurrentUserTarget) return;
      const message = action === "ban"
        ? t("liveRoomUi.bannedByCreator")
        : t("liveRoomUi.kickedByCreator");
      setChatMessages((prev) => [
        ...prev,
        { id: ++msgCounterRef.current, user: t("liveRoomUi.systemUser"), text: message, system: true },
      ]);
      socket.emit("leave_live_room", { liveId: id });
      agoraClientRef.current?.leave().catch(() => {});
      setTimeout(() => router.replace("/live"), 1200);
    };

    // Refresh leaderboard on battle score changes
    const onBattleScoreUpdated = () => setGiftRefreshTrigger((n) => n + 1);

    // Live ranking push from server (more efficient than polling)
    const onRankingUpdated = ({ topFans }) => {
      if (!Array.isArray(topFans) || topFans.length === 0) return;
      // Update local top fan map and names from server data
      const newMap = {};
      for (const fan of topFans) {
        if (fan.userId) {
          newMap[String(fan.userId)] = fan.totalCoins || 0;
          rememberTopFanName(fan.userId, fan.username);
        }
      }
      topFanMapRef.current = { ...topFanMapRef.current, ...newMap };
      setTopFanIds(computeTopFans(topFanMapRef.current));
      setGiftRefreshTrigger((n) => n + 1);
    };

    // Live engagement events
    const onLiveEventStarted = ({ type, label, icon, expiresAt, durationSecs }) => {
      setActiveEvent({ type, label, icon, expiresAt, durationSecs });
      addOverlayEvent("event", icon || "🔥", label);
    };
    const onLiveEventEnded = () => setActiveEvent(null);

    // Super gift event handler (new 3-tier system)
    const onSuperGift = ({ sender, gift, value, animationType, quantity }) => {
      if (!gift) return;
      
      // Trigger full-screen super gift animation
      setSuperGiftAnimation({
        gift: {
          icon: gift.icon || "🎁",
          name: gift.name || t("gifts.superGift"),
          animationType: animationType || "fullscreen",
        },
        sender: sender || t("gifts.someone"),
        value: value || 0,
        quantity: quantity || 1,
      });
      
      // Add to event feed
      addEventFeedItem("super_gift", {
        icon: gift.icon || "✨",
        name: gift.name || t("gifts.superGift"),
        sender: sender || t("gifts.someone"),
        quantity: quantity || 1,
      });
    };

    // Top supporter update handler
    const onTopSupporterUpdate = ({ userId, username, totalCoins }) => {
      setTopSupporter({
        userId,
        username,
        totalCoins,
      });
      
      // Add to event feed only if username is valid
      if (username && totalCoins > 0) {
        addEventFeedItem("top_supporter", {
          username,
          totalCoins,
        });
      }
    };

    // Gift combo notification handler
    const onGiftCombo = ({ userId, username, comboCount }) => {
      setCurrentCombo({
        userId,
        username,
        comboCount,
      });
    };

    socket.on("LIVE_CHAT_MESSAGE", onChatMessage);
    socket.on("VIEWER_COUNT_UPDATE", onViewerCountUpdate);
    socket.on("LIVE_AUDIENCE_UPDATE", onLiveAudienceUpdate);
    socket.on("LIVE_JOIN_REJECTED", onLiveJoinRejected);
    socket.on("LIVE_GIFT_SENT", onLiveGiftSent);
    socket.on("super_gift", onSuperGift);
    socket.on("USER_JOINED_LIVE", onUserJoined);
    socket.on("LIVE_ENDED", onLiveEnded);
    socket.on("LIVE_USER_MODERATED", onLiveUserModerated);
    socket.on("BATTLE_SCORE_UPDATED", onBattleScoreUpdated);
    socket.on("LIVE_RANKING_UPDATED", onRankingUpdated);
    socket.on("LIVE_EVENT_STARTED", onLiveEventStarted);
    socket.on("LIVE_EVENT_ENDED", onLiveEventEnded);
    socket.on("TOP_SUPPORTER_UPDATE", onTopSupporterUpdate);
    socket.on("GIFT_COMBO", onGiftCombo);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("LIVE_CHAT_MESSAGE", onChatMessage);
      socket.off("VIEWER_COUNT_UPDATE", onViewerCountUpdate);
      socket.off("LIVE_AUDIENCE_UPDATE", onLiveAudienceUpdate);
      socket.off("LIVE_JOIN_REJECTED", onLiveJoinRejected);
      socket.off("LIVE_GIFT_SENT", onLiveGiftSent);
      socket.off("super_gift", onSuperGift);
      socket.off("USER_JOINED_LIVE", onUserJoined);
      socket.off("LIVE_ENDED", onLiveEnded);
      socket.off("LIVE_USER_MODERATED", onLiveUserModerated);
      socket.off("BATTLE_SCORE_UPDATED", onBattleScoreUpdated);
      socket.off("LIVE_RANKING_UPDATED", onRankingUpdated);
      socket.off("LIVE_EVENT_STARTED", onLiveEventStarted);
      socket.off("LIVE_EVENT_ENDED", onLiveEventEnded);
      socket.off("TOP_SUPPORTER_UPDATE", onTopSupporterUpdate);
      socket.off("GIFT_COMBO", onGiftCombo);
      socket.emit("leave_live_room", { liveId: id });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, meLoaded, currentUserId, currentUsername, addOverlayEvent, addEventFeedItem]);

  // Mark live as truly active only when the creator is present in the room.
  useEffect(() => {
    if (!id || !live || !meLoaded || !currentUserId) return;
    const creatorId = live.user?._id ? String(live.user._id) : null;
    if (!creatorId || creatorId !== currentUserId) return;

    const announceHostActive = () => {
      if (!socket.connected) return;
      socket.emit("live_host_active", { liveId: id });
    };

    socket.on("connect", announceHostActive);
    announceHostActive();

    return () => {
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
    // A guest is only ever an approved (active) guest — never a pending requester.
    // This flag is derived from useMultiGuestLive, which itself reflects the
    // server-authoritative `guests` list (see backend/src/controllers/live.controller.js).
    // The Agora token endpoint independently re-verifies guest status server-side
    // before minting a PUBLISHER token, so this client-side flag can never be used
    // to self-grant publishing rights (see backend/src/controllers/agora.controller.js).
    const isLocalPublisher = shouldAgoraPublish({ isCreator: isCreatorCheck, isGuest });

    let client;
    let localAudio;
    let localVideo;
    let cancelled = false;
    let tokenRenewalTimer = null;
    let joinTimeoutTimer = null;
    let appStateListenerPromise = null;
    let removeHostLifecycleListeners = null;
    const role = isLocalPublisher ? "publisher" : "subscriber";

    const fetchAgoraToken = () => fetchAgoraTokenForRole(live._id, role);

    const handleAgoraRenewalFailure = () => {
      if (cancelled) return;
      setAgoraError(t("liveRoomUi.renewAccessError"));
      socket.emit("leave_live_room", { liveId: id });
      agoraClientRef.current?.leave().catch(() => {});
      setTimeout(() => router.replace("/live"), 1200);
    };

    const joinAgora = async () => {
      try {
        joinTimeoutTimer = setTimeout(() => {
          if (!cancelled) {
            setAgoraError(t("liveRoomUi.liveConnectionSlow"));
          }
        }, LIVE_JOIN_TIMEOUT_MS);
        if (!AGORA_APP_ID) throw new Error("No se pudo obtener token de Agora");
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        if (cancelled) return;

        const recoverHostTracks = async () => {
          if (cancelled || !isCreatorCheck) return;
          if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            hostWasBackgroundedRef.current = true;
            return;
          }
          if (hostTrackRecoveryInFlightRef.current) {
            hostTrackRecoveryPendingRef.current = true;
            return;
          }
          const activeClient = agoraClientRef.current;
          if (!activeClient) return;

          hostTrackRecoveryInFlightRef.current = true;
          const previousAudio = localAudioTrackRef.current;
          const previousVideo = localVideoTrackRef.current;
          let nextAudio = null;
          let nextVideo = null;

          try {
            const tracksToUnpublish = [previousAudio, previousVideo].filter(Boolean);
            if (tracksToUnpublish.length > 0) {
              await activeClient.unpublish(tracksToUnpublish).catch(() => {});
            }
            previousAudio?.close();
            previousVideo?.close();
            localAudioTrackRef.current = null;
            localVideoTrackRef.current = null;

            [nextAudio, nextVideo] = await AgoraRTC.createMicrophoneAndCameraTracks();
            if (cancelled) {
              nextAudio.close();
              nextVideo.close();
              return;
            }

            await activeClient.publish([nextAudio, nextVideo]);
            if (cancelled) {
              await activeClient.unpublish([nextAudio, nextVideo]).catch(() => {});
              nextAudio.close();
              nextVideo.close();
              return;
            }

            localAudioTrackRef.current = nextAudio;
            localVideoTrackRef.current = nextVideo;
            if (localVideoContainerRef.current) {
              try {
                nextVideo.play(localVideoContainerRef.current);
              } catch (previewErr) {
                console.warn("[Agora] recovered local preview failed:", previewErr);
              }
            }
            setAgoraError("");
          } catch (err) {
            if (nextAudio || nextVideo) {
              const nextTracks = [nextAudio, nextVideo].filter(Boolean);
              if (nextTracks.length > 0) {
                await activeClient.unpublish(nextTracks).catch(() => {});
              }
              if (localAudioTrackRef.current === nextAudio) localAudioTrackRef.current = null;
              if (localVideoTrackRef.current === nextVideo) localVideoTrackRef.current = null;
              nextAudio?.close();
              nextVideo?.close();
            }
            console.error("[Agora] host track recovery failed:", err);
            setAgoraError(
              isPermissionDeniedError(err)
                ? t("liveRoomUi.grantCameraMic")
                : t("liveRoomUi.recoverCameraMic")
            );
          } finally {
            hostTrackRecoveryInFlightRef.current = false;
            if (hostTrackRecoveryPendingRef.current && !cancelled) {
              hostTrackRecoveryPendingRef.current = false;
              window.setTimeout(() => {
                recoverHostTracks().catch((err) => {
                  console.error("[Agora] host pending recovery error:", err);
                });
              }, 0);
            }
          }
        };

        const scheduleHostTrackRecovery = () => {
          if (!isCreatorCheck) return;
          if (!hostWasBackgroundedRef.current) return;
          hostWasBackgroundedRef.current = false;
          window.setTimeout(() => {
            recoverHostTracks().catch((err) => {
              console.error("[Agora] host foreground recovery error:", err);
            });
          }, 300);
        };

        const { token: agoraToken, uid, expiresIn } = await fetchAgoraToken();
        if (cancelled) return;

        client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        agoraClientRef.current = client;
        function scheduleAgoraTokenRenewal(ttlSeconds) {
          if (tokenRenewalTimer) clearTimeout(tokenRenewalTimer);
          const delayMs = Math.max(
            MIN_AGORA_RENEWAL_DELAY_MS,
            ((Number(ttlSeconds) || DEFAULT_AGORA_TOKEN_TTL_SECONDS) - AGORA_RENEWAL_BUFFER_SECONDS) * 1000
          );
          tokenRenewalTimer = setTimeout(() => {
            renewAgoraToken().catch(handleAgoraRenewalFailure);
          }, delayMs);
        }
        async function renewAgoraToken() {
          // Use the CURRENT publish state (which may have changed since this
          // client joined, via a Multi-Guest promote/demote), not the role
          // this effect captured at join time — otherwise a guest promoted
          // to publisher mid-session would be silently handed a
          // subscriber-only token on the next renewal and lose publish
          // privilege.
          const currentRole = isPublisherStateRef.current ? "publisher" : "subscriber";
          const { token: renewedToken, expiresIn: renewedExpiresIn } = await fetchAgoraTokenForRole(
            live._id,
            currentRole
          );
          if (cancelled || !agoraClientRef.current) return;
          await agoraClientRef.current.renewToken(renewedToken);
          scheduleAgoraTokenRenewal(renewedExpiresIn);
        }
        client.on("token-privilege-will-expire", () => {
          renewAgoraToken().catch(handleAgoraRenewalFailure);
        });
        client.on("token-privilege-did-expire", () => {
          renewAgoraToken().catch(handleAgoraRenewalFailure);
        });

        // Track remote publishers (the other host, or approved guests) for MultiVideoGrid.
        // Registered for every role — a publisher (host/guest) also needs to see other
        // simultaneous publishers, not just plain viewers/audience.
        const upsertRemoteUser = (user, patch) => {
          setRemoteAgoraUsers((prev) => {
            const next = new Map(prev);
            const existing = next.get(user.uid) || { uid: user.uid };
            next.set(user.uid, { ...existing, ...patch });
            return next;
          });
        };

        const subscribeToRemoteUser = async (user, mediaType) => {
          try {
            await client.subscribe(user, mediaType);
            if (mediaType === "audio") {
              try {
                user.audioTrack?.play();
              } catch (err) {
                console.warn("[Agora] audio autoplay blocked:", err);
              }
            }
            const patch = {};
            if (mediaType === "video") {
              patch.videoTrack = user.videoTrack;
              patch.hasVideo = true;
            } else if (mediaType === "audio") {
              patch.audioTrack = user.audioTrack;
              patch.hasAudio = true;
            }
            upsertRemoteUser(user, patch);
          } catch (err) {
            console.error("[Agora] subscribe error:", err);
          }
        };

        client.on("user-published", (user, mediaType) => {
          subscribeToRemoteUser(user, mediaType).catch((err) => {
            console.error("[Agora] user-published error:", err);
          });
        });

        client.on("user-unpublished", (user, mediaType) => {
          try {
            if (mediaType === "video") {
              user.videoTrack?.stop();
            }
            setRemoteAgoraUsers((prev) => {
              const existing = prev.get(user.uid);
              if (!existing) return prev;
              const next = new Map(prev);
              next.set(user.uid, {
                ...existing,
                videoTrack: mediaType === "video" ? null : existing.videoTrack,
                audioTrack: mediaType === "audio" ? null : existing.audioTrack,
                hasVideo: mediaType === "video" ? false : existing.hasVideo,
                hasAudio: mediaType === "audio" ? false : existing.hasAudio,
              });
              return next;
            });
          } catch (err) {
            console.warn("[Agora] video stop error:", err);
          }
        });

        client.on("user-left", (user) => {
          setRemoteAgoraUsers((prev) => {
            if (!prev.has(user.uid)) return prev;
            const next = new Map(prev);
            next.delete(user.uid);
            return next;
          });
        });

        if (isLocalPublisher) {
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

          // Subscribe to any publishers already in the channel (host, or other guests)
          for (const user of client.remoteUsers) {
            if (user.hasVideo) await subscribeToRemoteUser(user, "video");
            if (user.hasAudio) await subscribeToRemoteUser(user, "audio");
          }

          if (isCreatorCheck && isNativeMobileApp()) {
            const markHostBackgrounded = () => {
              hostWasBackgroundedRef.current = true;
            };
            const handleVisibilityChange = () => {
              if (document.visibilityState === "hidden") {
                markHostBackgrounded();
              } else if (document.visibilityState === "visible") {
                scheduleHostTrackRecovery();
              }
            };
            const handlePageShow = () => scheduleHostTrackRecovery();

            document.addEventListener("visibilitychange", handleVisibilityChange);
            window.addEventListener("pagehide", markHostBackgrounded);
            window.addEventListener("pageshow", handlePageShow);

            appStateListenerPromise = import("@capacitor/app")
              .then(({ App }) =>
                App.addListener("appStateChange", ({ isActive }) => {
                  if (isActive) {
                    scheduleHostTrackRecovery();
                  } else {
                    markHostBackgrounded();
                  }
                })
              )
              .catch((err) => {
                console.warn("[Agora] Capacitor appStateChange listener unavailable:", err);
                return null;
              });
            removeHostLifecycleListeners = () => {
              document.removeEventListener("visibilitychange", handleVisibilityChange);
              window.removeEventListener("pagehide", markHostBackgrounded);
              window.removeEventListener("pageshow", handlePageShow);
            };
          }
        } else {
          await client.setClientRole("audience");
          await client.join(AGORA_APP_ID, String(live._id), agoraToken, uid);

          // Subscribe to existing remote users (host + any approved guests already publishing)
          for (const user of client.remoteUsers) {
            if (user.hasVideo) await subscribeToRemoteUser(user, "video");
            if (user.hasAudio) await subscribeToRemoteUser(user, "audio");
          }
        }

        if (!cancelled) {
          if (joinTimeoutTimer) clearTimeout(joinTimeoutTimer);
          isPublisherStateRef.current = isLocalPublisher;
          setAgoraError("");
          setAgoraJoined(true);
          if (!isCreatorCheck && isGuest && isLocalPublisher) {
            setGuestPublicationStatus("published");
          }
          scheduleAgoraTokenRenewal(expiresIn);
          setTimeout(() => setShowEntryAnim(false), 2000);
        }
      } catch (err) {
        if (joinTimeoutTimer) clearTimeout(joinTimeoutTimer);
        if (!cancelled) {
          if (!isCreatorCheck && isGuest) {
            setGuestPublicationStatus("error");
          }
          setAgoraError(
            isPermissionDeniedError(err)
              ? t("liveRoomUi.grantCameraMic")
              : t("liveRoomUi.videoChannelError")
          );
        }
      }
    };

    joinAgora();

    return () => {
      cancelled = true;
      if (tokenRenewalTimer) clearTimeout(tokenRenewalTimer);
      if (joinTimeoutTimer) clearTimeout(joinTimeoutTimer);
      removeHostLifecycleListeners?.();
      appStateListenerPromise?.then((listener) => listener?.remove()).catch(() => {});
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
      setRemoteAgoraUsers(new Map());
      isPublisherStateRef.current = false;
    };
  // This effect intentionally does NOT depend on `isGuest`: Multi-Guest
  // audience <-> publisher transitions are handled in-place by the dedicated
  // effect below (via frontend/lib/agoraGuestTransition.js) so that approving
  // a guest never tears down and recreates this client/join. Re-running this
  // effect is reserved for actual session changes (different live, auth, or
  // user identity).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, meLoaded, token, currentUserId]);

  // ── Multi-Guest audience <-> publisher transition ──────────────────────
  // Promotes an approved guest's already-joined client to a publisher (and
  // demotes it back on removal/leave) WITHOUT leaving/rejoining the channel,
  // eliminating the leave()/join() race that previously left the host never
  // receiving the guest's `user-published` event. See
  // frontend/lib/agoraGuestTransition.js for the serialization guarantee.
  //
  // `attemptGuestTransition` is the SINGLE call site that funnels into
  // `applyGuestTransition()` — it is invoked automatically below whenever
  // the target state changes, AND directly by `retryGuestPromotion` (wired
  // to the existing Agora error UI) so a previously-failed promotion can be
  // retried deterministically without re-implementing any of this logic.
  const attemptGuestTransition = useCallback(() => {
    const isCreatorCheck =
      !!(currentUserId && live?.user?._id && currentUserId === String(live.user._id));
    if (!isCreatorCheck) {
      if (!isGuest) {
        setGuestPublicationStatus("idle");
      } else if (!isPublisherStateRef.current) {
        setGuestPublicationStatus("preparing");
      }
    }
    // The host's publisher lifecycle is fully owned by the join effect above
    // and never changes — this transition only ever applies to guests.
    if (isCreatorCheck) return Promise.resolve({ outcome: "skipped" });
    if (!agoraJoined) return Promise.resolve({ outcome: "skipped" });
    if (!live?._id) return Promise.resolve({ outcome: "skipped" });

    const channelId = live._id;
    const targetIsGuest = isGuest;

    return applyGuestTransition({
      queue: guestTransitionQueue,
      client: agoraClientRef.current,
      targetIsGuest,
      getIsPublisherState: () => isPublisherStateRef.current,
      setIsPublisherState: (value) => {
        isPublisherStateRef.current = value;
      },
      createTracks: async () => {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        return AgoraRTC.createMicrophoneAndCameraTracks();
      },
      fetchPublisherToken: () => fetchAgoraTokenForRole(channelId, "publisher"),
      // Used only for best-effort rollback if a later step (token renewal,
      // role switch, track creation/publish) fails after privilege was
      // already (or might have been) granted.
      fetchSubscriberToken: () => fetchAgoraTokenForRole(channelId, "subscriber"),
      onLocalTracks: (audioTrack, videoTrack) => {
        localAudioTrackRef.current = audioTrack;
        localVideoTrackRef.current = videoTrack;
        if (localVideoContainerRef.current) {
          try {
            videoTrack.play(localVideoContainerRef.current);
          } catch (previewErr) {
            console.warn("[Agora] guest local preview failed:", previewErr);
          }
        }
      },
      getAudioTrack: () => localAudioTrackRef.current,
      getVideoTrack: () => localVideoTrackRef.current,
    }).then((result) => {
      const nextPublicationStatus = getGuestPublicationStatusForTransition(result.outcome);
      if (nextPublicationStatus) {
        setGuestPublicationStatus(nextPublicationStatus);
      }

      switch (result.outcome) {
        case "promoted":
          setAgoraError("");
          setGuestPromotionFailed(false);
          break;
        case "demoted":
          // Tracks are always closed by demoteToAudience (success case) —
          // safe to drop the local refs here.
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          setGuestPromotionFailed(false);
          break;
        case "promote-failed":
          console.error("[Agora] guest promote-to-publisher failed:", result.error);
          // Reflect Agora's REAL resulting role rather than assuming the
          // promotion's intended end state (already applied inside
          // applyGuestTransition via setIsPublisherState). Surface a
          // retry-capable error so the user can explicitly try again
          // without this ever auto-looping.
          setGuestPromotionFailed(true);
          setAgoraError(
            isPermissionDeniedError(result.error)
              ? t("liveRoomUi.grantCameraMic")
              : t("liveRoomUi.videoChannelError")
          );
          break;
        case "demote-failed":
          console.error("[Agora] guest demote-to-audience failed:", result.error);
          // Tracks were already closed inside demoteToAudience regardless of
          // outcome, so the refs are no longer usable either way.
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          break;
        default:
          break;
      }
      return result;
    });
  }, [isGuest, agoraJoined, live, currentUserId, fetchAgoraTokenForRole, guestTransitionQueue, t]);

  useEffect(() => {
    attemptGuestTransition();
  }, [attemptGuestTransition]);

  // Explicit, user-triggered retry for a guest whose promotion previously
  // failed and was rolled back to audience (`guestPromotionFailed`). Reuses
  // the exact same `attemptGuestTransition` path — same serialized queue,
  // same already-joined Agora client — so there is never a second client,
  // never a leave()/join(), and the retry can never run concurrently with
  // an in-flight transition. Only ever invoked by an explicit user action
  // (tap on the error overlay), never by a timer/poll, so a permanently
  // denied permission cannot spin in an automatic retry loop.
  const retryGuestPromotion = useCallback(() => {
    if (!isGuest || !guestPromotionFailed) return;
    attemptGuestTransition();
  }, [isGuest, guestPromotionFailed, attemptGuestTransition]);

  const sendChatMessage = (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    if (!socket.connected) {
      setChatSendError(t("liveRoomUi.chatOfflineRetry"));
      return;
    }

    setChatSendError("");
    // Add message locally immediately (optimistic, sender sees it as the current user)
    setChatMessages((prev) => [
      ...prev,
      { id: ++msgCounterRef.current, user: t("gifts.you"), text, system: false, isVIP: currentUserIsVIPRef.current },
    ]);
    setChatInput("");

    // Show in overlay for the sender
    addOverlayEvent("chat", "💬", `${t("gifts.you")}: ${truncateText(text)}`);

    // Broadcast to all other viewers in the live room
    socket.emit("live_chat_message", {
      liveId: id,
      text,
      user: { username: currentUsername || t("liveRoomUi.anonymousUser"), ...(currentUserId ? { userId: currentUserId } : {}) },
    }, (response) => {
      if (response && response.ok === false) {
        setChatSendError(response.message || t("liveRoomUi.messageSendError"));
      } else {
        setChatSendError("");
      }
    });
  };

  const handleGiftSent = useCallback((data) => {
    // Normalize two possible payload shapes:
    //   1. { gift, senderName }  – already shaped (e.g. from a socket event forwarded here)
    //   2. raw /api/gifts/send response document – has giftCatalogItem + sender fields
    let gift = data?.gift || null;
    let senderName = data?.senderName || null;
    const quantity = data?.quantity ?? 1;

    if (!gift && data?.giftCatalogItem) {
      const cat = data.giftCatalogItem;
      gift = {
        name: cat.name || "",
        icon: cat.icon || "🎁",
        coinCost: data.coinCost ?? cat.coinCost ?? 0,
        rarity: cat.rarity || "common",
        slug: cat.slug || "",
      };
    }
    if (!senderName) {
      senderName = data?.sender ? getDisplayName(data.sender) : currentUsernameRef.current || t("gifts.you");
    }

    if (gift) {
      const effectRarity = quantity >= 50 ? "mythic" : quantity >= 10 ? "epic" : gift.rarity;
      setActiveGiftEffect({ gift: { ...gift, rarity: effectRarity }, senderName, quantity });
      setRecentGift({ ...gift, senderName });

      if (giftEffectTimeoutRef.current) clearTimeout(giftEffectTimeoutRef.current);
      if (recentGiftTimeoutRef.current) clearTimeout(recentGiftTimeoutRef.current);

      giftEffectTimeoutRef.current = setTimeout(() => {
        setActiveGiftEffect(null);
      }, ["mythic", "legendary"].includes(effectRarity) ? 7000 : ["epic", "rare"].includes(effectRarity) ? 4500 : 2200);

      recentGiftTimeoutRef.current = setTimeout(() => {
        setRecentGift(null);
      }, 6000);

      // Refresh leaderboard after sending a gift
      setGiftRefreshTrigger((n) => n + 1);

      // Track for combo overlay (sender side)
      setRecentGiftsForCombo((prev) => [...prev.slice(-14), { gift, senderName, timestamp: Date.now() }]);

      const qtyLabel = quantity > 1 ? ` x${quantity}` : "";
      // Show sender's own gift in the overlay immediately
      addOverlayEvent(
        "gift",
        gift.icon || "🎁",
        formatText("gifts.sentByYouPattern", {
          gift: gift.name || t("gifts.genericGift"),
          quantity: qtyLabel,
        })
      );

      // Animated toast for sender
      giftToastRef.current?.push({
        senderName,
        giftIcon: gift.icon || "🎁",
        giftName: gift.name || t("gifts.giftLabel").toLowerCase(),
        coinCost: gift.coinCost || 0,
        rarity: gift.rarity || "common",
        quantity,
      });

      // Update local top fan map for the sender
      if (currentUserId && gift.coinCost > 0) {
        topFanMapRef.current[currentUserId] = (topFanMapRef.current[currentUserId] || 0) + gift.coinCost;
        rememberTopFanName(currentUserId, currentUsernameRef.current);
        setTopFanIds(computeTopFans(topFanMapRef.current));
        // Deduct total cost from local coin balance to reflect spend immediately
        setCoinBalance((prev) => (prev !== null ? Math.max(0, prev - gift.coinCost) : null));
      }

      // ── Pressure signals (sender side) ──────────────────────────────────────

      // Boost moment for the sender on big gifts
      const senderEffectRarity = quantity >= BOOST_MEGA_THRESHOLD ? "mythic" : quantity >= BOOST_QUANTITY_THRESHOLD ? "epic" : gift.rarity;
      if (isBoostGift(quantity, senderEffectRarity)) {
        showPressureHint(
          "boost_moment",
          "💥",
          t("liveRoomUi.epicMomentTitle"),
          quantity >= BOOST_MEGA_THRESHOLD ? t("liveRoomUi.youAreAmazing") : t("liveRoomUi.liveExplodesWithYou")
        );
      }

      // Goal contribution feedback for the sender
      const gd = goalDataRef.current;
      if (gd?.active && !gd?.completed && gift.coinCost > 0) {
        const addedCoins = gift.coinCost * quantity;
        const newProgress = (gd.progress || 0) + addedCoins;
        const remaining = Math.max(0, gd.target - newProgress);
        showPressureHint(
          "goal_contrib",
          "🎯",
          formatText("liveRoomUi.goalContribution", { count: addedCoins }),
          remaining > 0 ? formatText("liveRoomUi.coinsRemaining", { count: remaining }) : t("liveRoomUi.goalAlmostReached")
        );
      }
    }

    const qtyMsgLabel = quantity > 1 ? ` x${quantity}` : "";
    setChatMessages((prev) => [
      ...prev,
      {
        id: ++msgCounterRef.current,
        user: senderName,
        userId: currentUserId || null,
        text: `${gift?.icon || "🎁"} ${gift?.name || t("gifts.giftLabel").toLowerCase()}${qtyMsgLabel}`,
        gift,
        system: false,
        isGift: true,
      },
    ]);
  }, [addOverlayEvent, currentUserId, formatText, rememberTopFanName, showPressureHint, t]);

  /** Keep goalDataRef in sync so socket callbacks (closed over refs) can access it. */
  const handleGoalChange = useCallback((gd) => {
    goalDataRef.current = gd;
    setGoalData(gd);
  }, []);

  const handleJoin = async () => {
    if (!token) {
      setJoinError(t("liveRoomUi.joinPrivateLoginRequired"));
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
        setJoinError(data.message || t("liveRoomUi.joinLiveError"));
        return;
      }
      setLive(data);
    } catch {
      setJoinError(t("common.serverConnectionError"));
    } finally {
      setJoining(false);
    }
  };

  const handleTriggerEvent = async (type) => {
    if (!token) return;
    setTriggeringEvent(true);
    try {
      await fetch(`${API_URL}/api/lives/${id}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type }),
      });
    } catch {
      // non-fatal
    } finally {
      setTriggeringEvent(false);
    }
  };

  const handleStopEvent = async () => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/lives/${id}/event`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // non-fatal
    }
  };

  const showLiveModerationStatus = (message) => {
    setLiveModerationStatus(message);
    if (liveModerationStatusTimeoutRef.current) clearTimeout(liveModerationStatusTimeoutRef.current);
    liveModerationStatusTimeoutRef.current = setTimeout(() => {
      liveModerationStatusTimeoutRef.current = null;
      setLiveModerationStatus("");
    }, 5000);
  };

  const handleLiveModeration = async (targetUserId, action, targetName) => {
    if (!token) {
      showLiveModerationStatus(t("liveModeration.loginRequired"));
      return;
    }
    if (!isCreator) {
      showLiveModerationStatus(t("liveModeration.noPermission"));
      return;
    }
    if (!targetUserId) {
      showLiveModerationStatus(t("liveModeration.invalidUser"));
      return;
    }
    const targetLabel = targetName || t("liveModeration.thisUser");
    const confirmMessage =
      action === "ban"
        ? formatText("liveModeration.confirmBanUser", { name: targetLabel })
        : formatText("liveModeration.confirmKickUser", { name: targetLabel });
    if (!window.confirm(confirmMessage)) return;

    setLiveModerationStatus("");
    try {
      const res = await fetch(`${API_URL}/api/lives/${id}/moderation/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("liveModeration.applyError"));
      showLiveModerationStatus(action === "ban" ? t("liveModeration.bannedSuccess") : t("liveModeration.kickedSuccess"));
    } catch (err) {
      showLiveModerationStatus(err.message || t("liveModeration.applyError"));
    }
  };

  const handleBlockAudienceUser = async (targetUserId, targetName) => {
    if (!token) {
      showLiveModerationStatus(t("liveModeration.blockLoginRequired"));
      return;
    }
    if (!isCreator) {
      showLiveModerationStatus(t("liveModeration.noPermission"));
      return;
    }
    if (!targetUserId || String(targetUserId) === String(currentUserId)) {
      showLiveModerationStatus(t("liveModeration.invalidUser"));
      return;
    }
    if (!window.confirm(formatText("liveModeration.confirmBlockAndRemove", { name: targetName || t("liveModeration.thisUser") }))) return;

    setLiveModerationStatus("");
    try {
      const blockRes = await fetch(`${API_URL}/api/moderation/users/${encodeURIComponent(targetUserId)}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      });
      const blockData = await blockRes.json().catch(() => ({}));
      if (!blockRes.ok) throw new Error(blockData.message || t("liveModeration.blockError"));

      const kickRes = await fetch(`${API_URL}/api/lives/${id}/moderation/kick`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ targetUserId, reason: "blocked_by_host" }),
      });
      const kickData = await kickRes.json().catch(() => ({}));
      if (!kickRes.ok) throw new Error(kickData.message || t("liveModeration.blockedButNotRemoved"));
      showLiveModerationStatus(t("liveModeration.blockedAndRemovedSuccess"));
    } catch (err) {
      showLiveModerationStatus(err.message || t("liveModeration.blockError"));
    }
  };

  const handleToggleVipOnly = async () => {
    if (!token) return;
    const newVal = !live.isVipOnly;
    try {
      const res = await fetch(`${API_URL}/api/lives/${id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isVipOnly: newVal }),
      });
      if (res.ok) {
        setLive((prev) => prev ? { ...prev, isVipOnly: newVal } : prev);
      }
    } catch {
      // non-fatal
    }
  };

  if (error) {
    return (
      <div className="viewer-error">
        <span style={{ fontSize: "3rem" }}>📡</span>
        <h2>{t("liveRoomUi.liveEndedTitle")}</h2>
        <p>{error}</p>
        <Link href="/live" className="btn btn-primary">{t("liveRoomUi.backToLives")}</Link>
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
        <p>{t("liveRoomUi.loadingLive")}</p>
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
          <p className="paywall-streamer">
            {formatText("liveRoomUi.byUsername", {
              username: live.user?.username || t("liveRoomUi.anonymousHandle"),
            })}
          </p>
          <p className="paywall-desc">{t("liveRoomUi.privateLiveDescription")}</p>
          <div className="paywall-cost">
            <span className="coin-icon">🪙</span>
            <span className="cost-num">{live.entryCost}</span>
            <span className="cost-label">{t("common.coins")}</span>
          </div>
          {joinError && <div className="error-banner">{joinError}</div>}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? t("liveRoomUi.processing") : formatText("liveRoomUi.payEntryAndJoin", { count: live.entryCost })}
          </button>
          {!token && (
            <p className="paywall-login-hint">
              <Link href="/login" className="link-accent">{t("common.signIn")}</Link>{" "}
              {t("liveRoomUi.signInToBuyEntrySuffix")}
            </p>
          )}
          <Link href="/coins" className="paywall-buy-coins">
            🪙 {t("nav.buyCoins")}
          </Link>
          <Link href="/live" className="btn btn-secondary">{t("liveRoomUi.backToLives")}</Link>
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

  if (live.isVipOnly && !live.hasVipAccess) {
    return (
      <div className="viewer-page">
        <div className="paywall card" style={{ borderColor: "rgba(251,191,36,0.35)", background: "linear-gradient(135deg, rgba(251,191,36,0.06), rgba(224,64,251,0.06))" }}>
          <div className="paywall-icon">💎</div>
          <h2 className="paywall-title">{live.title}</h2>
          <p className="paywall-streamer">
            {formatText("liveRoomUi.byUsername", {
              username: live.user?.username || t("liveRoomUi.anonymousHandle"),
            })}
          </p>
          <p className="paywall-desc" style={{ color: "#fbbf24" }}>
            {t("subscriptionSoftLaunch.liveVipUnavailable")}
          </p>
          <p className="paywall-desc">{t("subscriptionSoftLaunch.liveVipSupport")}</p>
          <Link href="/coins" className="btn btn-vip-cta btn-lg">
            {t("subscriptionSoftLaunch.buyCoins")}
          </Link>
          <Link href="/live" className="btn btn-secondary">{t("liveRoomUi.backToLives")}</Link>
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
          .btn-vip-cta {
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            color: #000;
            font-weight: 800;
            border: none;
          }
          .btn-vip-cta:hover {
            background: linear-gradient(135deg, #fde68a, #fbbf24);
            box-shadow: 0 0 18px rgba(251,191,36,0.45);
          }
        `}</style>
      </div>
    );
  }

  const privateCallEnabled = live.user?.creatorProfile?.privateCallEnabled;
  const pricePerMinute = live.user?.creatorProfile?.pricePerMinute ?? 0;

  const handleStartPrivateCall = async () => {
    if (!token) {
      setCallError(t("liveRoomUi.privateCallLoginRequired"));
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
      if (!res.ok) throw new Error(data.message || t("liveRoomUi.startCallError"));
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

  const creatorNameRaw = getDisplayName(live?.user);
  const creatorName =
    typeof creatorNameRaw === "string" && creatorNameRaw.trim()
      ? creatorNameRaw.trim()
      : t("liveRoomUi.creatorFallback");
  const creatorInitial = creatorName.charAt(0).toUpperCase() || "C";
  const creatorAvatar = getUserImage(live.user);
  const creatorProfileHref = live.user?._id ? `/profile/${live.user._id}` : "/profile";
  const handleBlockedCreator = () => {
    router.replace("/live");
  };
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

  // Derived rendering helpers
  const showBoostUrgency = activeEvent?.type === "last_boost" && boostSecondsLeft !== null && boostSecondsLeft > 0 && boostSecondsLeft <= 30;
  const showGoalUrgency  = !isCreator && goalData?.active && !goalData?.completed && goalData?.target > 0;
  const showUrgencyBar   = showBoostUrgency || showGoalUrgency;
  const goalRemaining    = showGoalUrgency ? Math.max(0, (goalData.target || 0) - (goalData.progress || 0)) : 0;
  const liveAudienceCount = audienceViewers.length;
  const audienceCount = isCreator ? liveAudienceCount : viewerCount;

  // ── Multi-guest video participants (host + active guests + Agora remote users) ──
  // Maps Agora numeric uids (fnv1a hash of the MongoDB userId, see backend/src/controllers/agora.controller.js)
  // back to a display name/host flag, so remote tiles in MultiVideoGrid show who they are.
  // Never used to grant publishing rights — that stays server-authoritative (Agora token role).
  const activeGuests = (guests || []).filter((g) => g.status === "active");
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host: live.user,
    activeGuests,
    creatorName,
    defaultGuestName: t("multiGuest.defaultGuest"),
  });
  const localParticipant = createLocalParticipant({
    isCreator,
    isGuest,
    creatorName,
    currentUsername,
    currentUserId,
    youFallback: t("gifts.you"),
  });

  // ── Gift recipients for Multi-Guest lives (host + active guests, excluding
  // the viewer's own account) — drives the compact recipient selector inside
  // GiftPanel. With 0-1 participants it stays the simple single-receiver flow. */
  const giftRecipients = buildGiftRecipients({
    host: live.user,
    guests,
    currentUserId,
    defaultGuestName: t("multiGuest.defaultGuest"),
    resolveAvatar: getUserImage,
  });

  // Single source of truth for which streams get a tile: local publisher (if
  // any) + every remote Agora user currently publishing video/audio. Never
  // includes slots, max-guest counts, or approved-but-not-yet-publishing
  // guests — see buildRenderableVideoParticipants().
  const videoParticipants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers,
    uidUserInfoById,
  });

  return (
    <div className="room">
      <div className="room-bg-glow room-bg-glow-a" />
      <div className="room-bg-glow room-bg-glow-b" />

      {/* ── Non-blocking pressure hint overlay ── */}
      <LivePressureHints hint={pressureHint} />

      {/* ── Contextual paywall modal ── */}
      {paywallReason && !isCreator && (
        <PaywallModal reason={paywallReason} onClose={() => setPaywallReason(null)} />
      )}

      {isCreator && showAudiencePanel && (
        <div className="audience-modal-backdrop" role="presentation" onClick={() => setShowAudiencePanel(false)}>
          <section
            className="audience-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audience-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="audience-modal-header">
              <div>
                <p className="audience-modal-kicker">{t("liveRoomUi.currentAudience")}</p>
                <h2 id="audience-modal-title">👥 {formatText("liveRoomUi.watchingNow", { count: liveAudienceCount })}</h2>
              </div>
              <button
                type="button"
                className="audience-modal-close"
                aria-label={t("liveRoomUi.closeAudience")}
                onClick={() => setShowAudiencePanel(false)}
              >
                ×
              </button>
            </div>
            {audienceViewers.length === 0 ? (
              <p className="viewer-empty">{t("liveRoomUi.noViewersConnected")}</p>
            ) : (
              <div className="viewer-list">
                {audienceViewers.map((viewer) => {
                  const viewerName = getDisplayName(viewer) || viewer.username || viewer.name || t("liveRoomUi.genericViewer");
                  const viewerInitial = viewerName.charAt(0).toUpperCase() || "E";
                  const viewerAvatar = getUserImage(viewer);
                  return (
                    <Link href={`/profile/${viewer.userId}`} className="viewer-identity viewer-identity-modal" key={viewer.userId}>
                      <span className="viewer-avatar">
                        {viewerAvatar ? <img src={viewerAvatar} alt={viewerName} /> : viewerInitial}
                      </span>
                      <span className="viewer-name">@{viewerName}</span>
                      <span className="viewer-presence" aria-label={t("liveRoomUi.connectedPresence")} />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Live Event Banner ── */}
      {activeEvent && (
        <div style={{ marginBottom: "0.5rem" }}>
          <LiveEventBanner event={activeEvent} onClose={isCreator ? handleStopEvent : null} />
        </div>
      )}

      {/* ── Urgency bar: boost countdown OR active goal progress ── */}
      {showUrgencyBar && (
        <div className="urgency-countdown-bar" role="status" aria-live="polite">
          {showBoostUrgency ? (
            <>
              <span className="ucb-icon">⏳</span>
              <span className="ucb-text">{formatText("liveRoomUi.lastSecondsToGoal", { count: boostSecondsLeft })}</span>
              <span className="ucb-fire">🔥</span>
            </>
          ) : (
            <>
              <span className="ucb-icon">🔥</span>
              <span className="ucb-text">
                {goalRemaining > 0
                  ? formatText("liveRoomUi.coinsToReachGoal", { count: goalRemaining.toLocaleString() })
                  : t("liveRoomUi.goalAlmostReached")}
              </span>
              <span className="ucb-fire">🎯</span>
            </>
          )}
        </div>
      )}

      {/* ── Gift toast (absolute-positioned, rendered via ref) ── */}
      <LiveGiftToast ref={giftToastRef} minCoins={50} />

      {/* ── Gift overlay queue system (new Tango/TikTok style animations) ── */}
      <GiftOverlay 
        giftQueue={giftQueue}
        onGiftProcessed={() => {
          // Remove processed gift from queue
          setGiftQueue((prev) => prev.slice(1));
        }}
      />

      {/* ── Gift combo notification (rapid gift streaks) ── */}
      <GiftComboNotification combo={currentCombo} />

      <div className="room-layout">
        <div className="room-main">
          {/* ── Premium creator header bar ── */}
          <div className="creator-header-bar">
            <Link href={creatorProfileHref} className="chr-left" title={t("liveRoomUi.profile")}>
              <div className="chr-avatar">
                {creatorAvatar ? (
                  <img src={creatorAvatar} alt={creatorName} className="chr-avatar-img" />
                ) : (
                  creatorInitial
                )}
                <span className="chr-live-dot" />
              </div>
              <div className="chr-info">
                <div className="chr-name-row">
                  <span className="chr-name">@{creatorName}</span>
                  {(live.user?.role === "creator" || live.user?.creatorStatus === "approved") && (
                    <span className="chr-creator-badge">⭐ {t("role.creator")}</span>
                  )}
                </div>
                {creatorStatusBadges.length > 0 && (
                  <StatusBadges badges={creatorStatusBadges} compact style={{ marginTop: "0.2rem" }} />
                )}
                <div className="chr-meta-row">
                  <span className="chr-live-badge">🔴 {t("liveRoomUi.liveBadge")}</span>
                  <span className="chr-viewers">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    {viewerCount}
                  </span>
                  {live.isPrivate && <span className="chr-private-tag">🔒 {t("chatPremium.private")}</span>}
                  {live.isVipOnly && <span className="chr-private-tag" style={{ borderColor: "rgba(251,191,36,0.4)", color: "#fbbf24", background: "rgba(251,191,36,0.08)" }}>💎 VIP</span>}
                </div>
              </div>
            </Link>
            <div className="chr-right">
              {!isCreator && live.user?._id && (
                <div className="creator-safety-actions">
                  <FollowButton targetId={String(live.user._id)} token={token} />
                  <ModerationActions
                    targetUserId={String(live.user._id)}
                    targetName={creatorName}
                    authToken={token}
                    onBlocked={handleBlockedCreator}
                    compact
                    showBlock={false}
                    reportLabel={t("common.report")}
                  />
                </div>
              )}
              <Link href="/live" className="chr-back-btn" title={t("liveRoomUi.backToLivesTitle")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </Link>
            </div>
          </div>

          <div className="video-wrap">
            <div className="video-ambient-glow" />

            {/* Multi-guest video grid: host solo, host+guest split view, or full grid.
                Renders the local publisher (host or approved guest) plus every other
                Agora publisher currently in the channel. Pending join requests never
                appear here — only active, server-approved guests can publish. */}
            <div className="agora-video-container">
              <MultiVideoGrid
                participants={videoParticipants}
                isHost={isCreator}
                localVideoRef={localVideoContainerRef}
                hostUserId={live.user?._id}
              />
            </div>

            {/* Loading / error overlay (shown before Agora joins) */}
            {!agoraJoined && !agoraError && token && (
              <div className="video-joining">
                <div className="video-spinner" />
                <p className="video-joining-text">
                  {isCreator ? t("liveRoomUi.startingStream") : t("liveRoomUi.connectingToLive")}
                </p>
              </div>
            )}

            {/* Agora error overlay */}
            {agoraError && (
              <div
                className="video-joining"
                // When a guest's promotion to publisher failed (and was
                // rolled back to audience), make this existing error
                // overlay itself the "retry" affordance — no new UI,
                // no Live redesign: tapping it re-attempts the exact same
                // serialized, in-place promotion via `retryGuestPromotion`.
                {...(isGuest && guestPromotionFailed
                  ? {
                      role: "button",
                      tabIndex: 0,
                      onClick: retryGuestPromotion,
                      onKeyDown: (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          retryGuestPromotion();
                        }
                      },
                      style: { cursor: "pointer" },
                    }
                  : {})}
              >
                <span style={{ fontSize: "2.5rem" }}>📡</span>
                <p className="video-joining-text video-error-text">{agoraError}</p>
                {isGuest && guestPromotionFailed && (
                  <p className="video-joining-text">{t("liveRoomUi.retryPublishGuest")}</p>
                )}
              </div>
            )}

            {/* No token overlay */}
            {!token && (
              <div className="video-joining">
                <span style={{ fontSize: "2.5rem" }}>🔐</span>
                <p className="video-joining-text">
                  <Link href="/login" className="link-accent">{t("common.signIn")}</Link>{" "}
                  {t("liveRoomUi.signInToWatchLiveSuffix")}
                </p>
              </div>
            )}

            {activeGiftEffect ? (
              <GiftEffect
                gift={activeGiftEffect.gift}
                senderName={activeGiftEffect.senderName}
                quantity={activeGiftEffect.quantity}
              />
            ) : null}

            {/* New gift animation system */}
            {giftAnimation && (
              <GiftAnimation
                gift={giftAnimation.gift}
                senderName={giftAnimation.senderName}
                onComplete={() => setGiftAnimation(null)}
              />
            )}

            {/* Super gift animation (3-tier system) */}
            {superGiftAnimation && (
              <SuperGiftAnimation
                gift={superGiftAnimation.gift}
                sender={superGiftAnimation.sender}
                value={superGiftAnimation.value}
                onComplete={() => setSuperGiftAnimation(null)}
              />
            )}

            {/* Entry join animation */}
            {agoraJoined && showEntryAnim && !isCreator && (
              <div className="entry-anim">
                <span className="entry-anim-icon">🎉</span>
                <span className="entry-anim-text">{t("liveRoomUi.connectedToLive")}</span>
              </div>
            )}

            {/* Floating reactions (viewer only) */}
            {agoraJoined && !isCreator && <FloatingReactions />}

            <div className="live-overlay-stack" aria-live="polite">
              {/* Gift combo/streak overlay */}
              {recentGiftsForCombo.length >= 3 && <GiftComboOverlay recentGifts={recentGiftsForCombo} />}

              {/* Live event feed - top supporter, combo streaks, super gifts */}
              {eventFeedItems.length > 0 && <LiveEventFeed events={eventFeedItems} />}

              {/* Live activity overlay — floating event feed on video */}
              {overlayEvents.length > 0 && <LiveFeedOverlay events={overlayEvents} />}
            </div>

            {/* Compact bottom overlay: only ephemeral, non-duplicated info
                (private badge + transient recent-gift toast). The live
                status, viewer count and host identity already live in the
                creator header bar above the stage — repeating them here
                would compete with the camera(s) for space. */}
            <div className="video-overlay">
              <div className="overlay-left">
                {live.isPrivate ? <span className="badge-private">🔒 {t("liveRoomUi.privateBadge")}</span> : null}
                {recentGift ? (
                  <span
                    className="recent-gift-badge"
                    style={{
                      borderColor: rarityStyle?.color || "rgba(255,255,255,0.12)",
                      boxShadow: rarityStyle?.glow ? `0 0 12px ${rarityStyle.glow}` : "0 0 12px rgba(224,64,251,0.18)",
                    }}
                  >
                    {recentGift.icon}{" "}
                    <span className="rgb-sender">{recentGift.senderName || t("gifts.someone")}</span>
                    {` ${t("gifts.sentVerb")} `}
                    <span className="rgb-coins">🪙 {recentGift.coinCost || 0} coins</span>
                  </span>
                ) : null}
              </div>

              {/* Connection pill: only surfaces when there is something
                  actionable to tell the viewer (reconnecting). While
                  connected it stays silent instead of repeating "Chat
                  activo" permanently over the video. */}
              {socketState !== "connected" && (
                <div className="overlay-right">
                  <span className="vap-pill vap-reconnecting" role="status">
                    {t("liveRoomUi.reconnecting")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="action-bar">
            {isCreator ? (
              <button
                type="button"
                className="viewers-badge viewers-badge-button"
                onClick={() => setShowAudiencePanel(true)}
                aria-label={formatText("liveRoomUi.viewCurrentAudience", { count: audienceCount })}
              >
                <span>👥</span>
                <span>{formatText("liveRoomUi.watchingNow", { count: audienceCount })}</span>
              </button>
            ) : (
              <div className="viewers-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <span>🔥 {formatText("liveRoomUi.watchingNow", { count: viewerCount })}</span>
              </div>
            )}

            <div className="action-buttons">
              {isCreator ? (
                <>
                  <span className="badge-broadcasting">{t("liveRoomUi.broadcasting")}</span>
                  <button
                    className="btn btn-end-stream btn-sm"
                    onClick={handleEndStream}
                    disabled={endingStream}
                  >
                    {endingStream ? t("liveRoomUi.ending") : t("liveRoomUi.endStream")}
                  </button>
                  {/* Creator event controls */}
                  <div className="creator-events">
                    {!activeEvent ? (
                      <>
                        <button
                          className="btn-event btn-event-fire"
                          onClick={() => handleTriggerEvent("x2_coins")}
                          disabled={triggeringEvent}
                          title={t("liveRoomUi.x2EventTitle")}
                        >
                          {t("liveRoomUi.x2EventLabel")}
                        </button>
                        <button
                          className="btn-event btn-event-boost"
                          onClick={() => handleTriggerEvent("last_boost")}
                          disabled={triggeringEvent}
                          title={t("liveRoomUi.finalBoostTitle")}
                        >
                          {t("liveRoomUi.boostLabel")}
                        </button>
                      </>
                    ) : (
                      <button className="btn-event btn-event-stop" onClick={handleStopEvent}>
                        {t("liveRoomUi.stopEventLabel")}
                      </button>
                    )}
                    <button
                      className={`btn-event${live.isVipOnly ? " btn-event-vip-active" : " btn-event-vip"}`}
                      onClick={handleToggleVipOnly}
                      title={live.isVipOnly ? t("liveRoomUi.disableVipOnlyTitle") : t("liveRoomUi.enableVipOnlyTitle")}
                    >
                      {live.isVipOnly ? t("liveRoomUi.vipOnlyOnLabel") : t("liveRoomUi.vipOnlyLabel")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button className="btn-gift-cta" onClick={() => setShowGiftPanel(true)}>
                    <span className="btn-gift-cta-icon">🎁</span>
                    <span>{t("gifts.send")}</span>
                  </button>

                  {privateCallEnabled ? (
                    <button
                      className="btn btn-call btn-sm"
                      onClick={handleStartPrivateCall}
                      disabled={startingCall}
                      title={formatText("liveRoomUi.privateCallTitle", { price: pricePerMinute })}
                    >
                      {startingCall ? t("chatPremium.connecting") : formatText("liveRoomUi.privateCallAction", { price: pricePerMinute })}
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled
                      title={t("liveRoomUi.privateCallDisabledTitle")}
                    >
                      {t("liveRoomUi.privateCallDisabledLabel")}
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
                        <Link href="/coins" className="call-error-coins-link">🪙 {t("nav.buyCoins")}</Link>
                      )}
                    </div>
                  ) : null}
                </>
              )}

              <Link href="/live" className="btn btn-ghost btn-sm">
                ← {t("liveRoomUi.livesShort")}
              </Link>
            </div>
          </div>

          <div className="stream-info card">
            <div className="stream-meta">
              <div className="stream-creator-row">
                <div className="avatar-placeholder" style={{ width: 40, height: 40, fontSize: "1rem", overflow: "hidden", flexShrink: 0 }}>
                  {creatorAvatar ? (
                    <img src={creatorAvatar} alt={creatorName} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  ) : (
                    creatorInitial
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stream-creator-name">@{creatorName}</div>
                  <span className="badge badge-live" style={{ fontSize: "0.6rem", padding: "0.1rem 0.45rem" }}>
                    {t("liveRoomUi.liveBadge")}
                  </span>
                </div>
                {!isCreator && live.user?._id && (
                  <div className="creator-safety-actions inline">
                    <FollowButton targetId={String(live.user._id)} token={token} />
                    <ModerationActions
                      targetUserId={String(live.user._id)}
                      targetName={creatorName}
                      authToken={token}
                      onBlocked={handleBlockedCreator}
                      compact
                      showBlock={false}
                      reportLabel={t("common.report")}
                    />
                  </div>
                )}
              </div>

              <h1 className="stream-title">{live.title}</h1>
              {live.description ? <p className="stream-desc">{live.description}</p> : null}
            </div>
          </div>

          {/* ── Battle Panel (below stream info in main column) ── */}
          <LiveVsBattlePanel liveId={id} isCreator={isCreator} hostUser={live.user} />

          {/* ── Multi-Guest controls: host manages requests/guests, viewer can
                 request to join, approved guest can leave. Never blocks chat/gifts. ── */}
          <GuestControlsPanel
            isHost={isCreator}
            isGuest={isGuest}
            canRequestMultiGuest={canRequestMultiGuest}
            guestRequests={isCreator ? guestRequests : []}
            currentGuests={guests}
            hasRequestedJoin={hasRequestedJoin}
            requestStatus={requestStatus}
            publicationStatus={guestPublicationStatus}
            onRequestJoin={!isCreator && !isGuest && token && canRequestMultiGuest ? requestJoin : null}
            onApproveGuest={isCreator ? approveGuest : null}
            onDeclineGuest={isCreator ? declineGuest : null}
            onRemoveGuest={isCreator ? removeGuest : null}
            onLeaveAsGuest={isGuest ? leaveAsGuest : null}
            maxGuests={live.maxGuests || 3}
          />

          {/* ── Creator prompts panel ── */}
          {isCreator && (
            <div className="creator-prompts">
              <div className="cp-header">{t("liveRoomUi.creatorPromptsTitle")}</div>
              <div className="cp-list">
                <div className="cp-item">{t("liveRoomUi.creatorPromptGoal")}</div>
                <div className="cp-item">{t("liveRoomUi.creatorPromptInvite")}</div>
                <div className="cp-item">{t("liveRoomUi.creatorPromptBattle")}</div>
              </div>
            </div>
          )}
        </div>

        <div className="room-chat">
          <div className="chat-header">
            <span className="chat-header-icon">💬</span>
            <span>{t("liveRoomUi.liveChatTitle")}</span>
            <span className="chat-header-live-dot" />
          </div>
          {socketState !== "connected" && (
            <div className="live-chat-status" role="status">
              {socketState === "connecting" ? t("liveRoomUi.chatReconnecting") : t("liveRoomUi.chatRetrying")}
            </div>
          )}
          {chatSendError && <div className="live-chat-status live-chat-status-error">{chatSendError}</div>}
          {liveModerationStatus && (
            <div className="live-moderation-status" role="status" aria-live="polite">
              {liveModerationStatus}
            </div>
          )}

          <div className="chat-messages">
            {chatMessages.map((msg) => {
              const fanRank = !msg.system && msg.userId ? topFanIds.indexOf(msg.userId) : -1;
              const messageType = msg.system ? "system" : msg.isGift ? "gift" : "message";
              const chatMsgClass = [
                "chat-msg",
                msg.system && "chat-msg-system",
                msg.isGift && "chat-msg-gift",
                msg.isVIP && !msg.system && "chat-msg-vip-user",
                fanRank === 0 && "chat-msg-top-fan",
                fanRank > 0 && "chat-msg-vip-fan",
              ].filter(Boolean).join(" ");
              const canModerateMessageUser =
                isCreator && msg.userId && currentUserId && String(msg.userId) !== String(currentUserId);
              const moderationTargetName = msg.displayName || msg.user;
              return (
                <div key={msg.id} className={chatMsgClass} data-type={messageType}>
                  {msg.system ? (
                    <>
                      <span className="chat-type-label">{messageType}</span>
                      <span className="chat-text-system">{msg.text}</span>
                    </>
                  ) : msg.isGift ? (
                    <>
                      <span className="chat-type-label gift">{t("liveRoomUi.giftTypeLabel")}</span>
                      <span className="chat-gift-icon">{msg.gift?.icon || "🎁"}</span>
                      {msg.isVIP && <span className="chat-vip-badge" title={t("liveRoomUi.vipUserTitle")}>💎</span>}
                      {fanRank >= 0 && (
                        <span className="chat-crown" title={fanRank === 0 ? t("liveRoomUi.topFan") : formatText("liveRoomUi.fanRank", { count: fanRank + 1 })}>
                          {FAN_MEDALS[fanRank]}
                        </span>
                      )}
                      <span className="chat-user chat-user-gift">{msg.user}</span>
                      <span className="chat-text chat-text-gift">{t("gifts.sentVerb")} {msg.gift?.name || t("gifts.genericGift")}</span>
                      {msg.gift?.coinCost > 0 && (
                        <span className="chat-gift-coins">🪙 {msg.gift.coinCost}</span>
                      )}
                    </>
                  ) : (
                    <>
                      {msg.isVIP && <span className="chat-vip-badge" title={t("liveRoomUi.vipUserTitle")}>💎</span>}
                      {fanRank >= 0 && (
                        <span className="chat-crown" title={fanRank === 0 ? t("liveRoomUi.topFan") : formatText("liveRoomUi.fanRank", { count: fanRank + 1 })}>
                          {FAN_MEDALS[fanRank]}
                        </span>
                      )}
                      <span className="chat-user">{msg.user}</span>
                      <span className="chat-text">{msg.text}</span>
                    </>
                  )}
                  {canModerateMessageUser && (
                    <div className="live-chat-moderation-actions">
                      <ModerationActions
                        targetUserId={String(msg.userId)}
                        targetName={moderationTargetName}
                        authToken={token}
                        compact
                        showBlock={false}
                        reportLabel={t("common.report")}
                      />
                      <button
                        type="button"
                        className="live-chat-moderation-btn"
                        onClick={() => handleLiveModeration(String(msg.userId), "kick", moderationTargetName)}
                      >
                        {t("liveRoomUi.kickUser")}
                      </button>
                      <button
                        type="button"
                        className="live-chat-moderation-btn danger"
                        onClick={() => handleBlockAudienceUser(String(msg.userId), moderationTargetName)}
                      >
                        {t("liveRoomUi.blockUser")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {chatMessages.length <= 1 && !isCreator && (
              <div className="chat-empty-state">
                {t("liveRoomUi.chatEmpty")}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-form" onSubmit={sendChatMessage}>
            <input
              className="chat-input"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={token ? t("rooms.messagePlaceholder") : t("rooms.loginToChat")}
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

          <details className="top-gifters-disclosure" open={topFanIds.length > 0 || !!topSupporter}>
            <summary>🏆 Top Gifters</summary>
            <TopGifters liveId={id} refreshTrigger={giftRefreshTrigger} />
            <TopSupporterBadge topSupporter={topSupporter} />
            {topFanIds.length > 0 && topFanNames[topFanIds[0]] && (
              <div className="fan-del-live">
                <span className="fdl-crown">👑</span>
                <div className="fdl-info">
                  <span className="fdl-label">{t("liveRoomUi.topLiveFan")}</span>
                  <span className="fdl-name">@{topFanNames[topFanIds[0]]}</span>
                </div>
                <span className="fdl-badge">💎 VIP</span>
              </div>
            )}
          </details>

          <LiveGoalPanel liveId={id} onGoalChange={handleGoalChange} />

          {!isCreator && coinBalance !== null && coinBalance < 50 && (
            <Link href="/coins" className="low-coins-cta">
              {t("liveRoomUi.lowBalancePrefix")} <strong>{t("liveRoomUi.lowBalanceAction")}</strong>
            </Link>
          )}

          {!isCreator && !currentUserIsVIP && (
            <Link href="/coins" className="vip-live-cta">
              🪙 <strong>{t("subscriptionSoftLaunch.buyCoinsShort")}</strong> · {t("subscriptionSoftLaunch.liveCoinsCta")}
            </Link>
          )}

          {!isCreator && currentUserIsVIP && (
            <div className="vip-active-badge">
              <span>💎</span>
              <span>{t("subscriptionSoftLaunch.liveVipActivePaused")}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky quick dock (viewers only, mobile-friendly) ── */}
      {!isCreator && (
        <div className="quick-dock">
          <button className="dock-btn dock-gift" onClick={() => setShowGiftPanel(true)}>
            <span className="dock-icon">🎁</span>
            <span className="dock-label">{t("gifts.send")}</span>
          </button>
          {privateCallEnabled ? (
            <button
              className="dock-btn dock-call"
              onClick={handleStartPrivateCall}
              disabled={startingCall}
            >
              <span className="dock-icon">📞</span>
              <span className="dock-label">{startingCall ? "…" : t("liveRoomUi.privateShort")}</span>
            </button>
          ) : null}
          <button
            className="dock-btn dock-chat"
            onClick={() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            <span className="dock-icon">💬</span>
            <span className="dock-label">{t("liveRoomUi.chat")}</span>
          </button>
        </div>
      )}

      {showGiftPanel && live?.user?._id ? (
        <GiftPanel
          receiverId={live.user._id}
          recipients={giftRecipients}
          liveId={id}
          context="live"
          onClose={() => setShowGiftPanel(false)}
          onGiftSent={handleGiftSent}
          initialCoinBalance={coinBalance}
          isOwnLive={isCreator}
        />
      ) : null}

      <style jsx>{`
        .room {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .room-bg-glow {
          position: fixed;
          width: 360px;
          height: 360px;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(8px);
          opacity: 0.35;
          z-index: -1;
        }

        .room-bg-glow-a {
          top: 8%;
          left: -120px;
          background: radial-gradient(circle, rgba(224,64,251,0.36), transparent 66%);
        }

        .room-bg-glow-b {
          right: -140px;
          bottom: 10%;
          background: radial-gradient(circle, rgba(34,211,238,0.28), transparent 64%);
        }

        /* ── Urgency countdown bar ── */
        .urgency-countdown-bar {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.5rem 1rem;
          margin-bottom: 0.5rem;
          background: linear-gradient(90deg, rgba(220,38,38,0.9) 0%, rgba(185,28,28,0.9) 100%);
          border-radius: var(--radius-sm);
          border: 1px solid rgba(255,255,255,0.15);
          animation: ucbSlide 0.35s ease both, ucbPulse 0.65s ease-in-out infinite;
          box-shadow: 0 0 28px rgba(220,38,38,0.55);
        }

        @keyframes ucbSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes ucbPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(220,38,38,0.4); }
          50%       { box-shadow: 0 0 38px rgba(220,38,38,0.75); }
        }

        .ucb-icon { font-size: 1.15rem; flex-shrink: 0; animation: ucbIconBounce 0.7s ease-in-out infinite; }
        @keyframes ucbIconBounce {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.2); }
        }

        .ucb-text {
          flex: 1;
          font-size: 0.85rem;
          font-weight: 800;
          color: #fff;
          text-shadow: 0 1px 4px rgba(0,0,0,0.35);
          letter-spacing: 0.01em;
        }

        .ucb-fire { font-size: 1.1rem; flex-shrink: 0; }

        /* ── Fan del live card ── */
        .fan-del-live {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          margin-bottom: 0.4rem;
          background: linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(245,158,11,0.08) 100%);
          border: 1px solid rgba(251,191,36,0.35);
          border-radius: var(--radius-sm);
          box-shadow: 0 0 14px rgba(251,191,36,0.1);
          animation: fdlIn 0.4s ease both;
        }

        @keyframes fdlIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .fdl-crown { font-size: 1.1rem; flex-shrink: 0; animation: crownFloat 2s ease-in-out infinite; }

        @keyframes crownFloat {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-3px); }
        }

        .fdl-info { flex: 1; display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; }

        .fdl-label {
          font-size: 0.58rem;
          font-weight: 700;
          color: rgba(251,191,36,0.8);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .fdl-name {
          font-size: 0.76rem;
          font-weight: 800;
          color: #fde68a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .fdl-badge {
          font-size: 0.6rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          color: #fbbf24;
          background: rgba(251,191,36,0.15);
          border: 1px solid rgba(251,191,36,0.45);
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* ── Low-coins CTA ── */
        .low-coins-cta {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          margin-bottom: 0.4rem;
          background: rgba(251,191,36,0.06);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          color: #fbbf24;
          text-decoration: none;
          transition: background 0.18s, border-color 0.18s;
        }

        .low-coins-cta:hover {
          background: rgba(251,191,36,0.12);
          border-color: rgba(251,191,36,0.45);
        }

        .vip-live-cta {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          margin-bottom: 0.4rem;
          background: linear-gradient(90deg, rgba(251,191,36,0.1), rgba(224,64,251,0.06));
          border: 1px solid rgba(251,191,36,0.35);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          color: #fbbf24;
          text-decoration: none;
          transition: background 0.18s, box-shadow 0.18s;
        }

        .vip-live-cta:hover {
          background: linear-gradient(90deg, rgba(251,191,36,0.18), rgba(224,64,251,0.12));
          box-shadow: 0 0 10px rgba(251,191,36,0.2);
        }

        .vip-active-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          margin-bottom: 0.4rem;
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: var(--radius-sm);
          font-size: 0.72rem;
          color: #fbbf24;
          font-weight: 600;
        }

        /* ── Creator prompts panel ── */
        .creator-prompts {
          background: linear-gradient(135deg, rgba(12,6,28,0.9) 0%, rgba(22,10,46,0.9) 100%);
          border: 1px solid rgba(139,92,246,0.22);
          border-radius: var(--radius-sm);
          padding: 0.65rem 0.85rem;
          animation: cpIn 0.35s ease both;
        }

        @keyframes cpIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .cp-header {
          font-size: 0.68rem;
          font-weight: 800;
          color: #a78bfa;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 0.5rem;
        }

        .cp-list { display: flex; flex-direction: column; gap: 0.3rem; }

        .cp-item {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          padding: 0.3rem 0.45rem;
          border-radius: 6px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
        }

        /* ── VIP fan chat highlight (rank 2-3) ── */
        .chat-msg-vip-fan {
          background: rgba(192,132,252,0.04);
          border-left: 2px solid rgba(192,132,252,0.3);
          border-radius: 0 0.5rem 0.5rem 0;
          padding-left: 0.45rem;
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
          position: relative;
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
          overflow: hidden;
        }

        .creator-header-bar::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(34,211,238,0.08), transparent);
          transform: translateX(-100%);
          animation: roomHeaderSweep 6s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes roomHeaderSweep {
          0%, 55% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .chr-left {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          min-width: 0;
          flex: 1;
          text-decoration: none;
          color: inherit;
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
          box-shadow: 0 26px 70px rgba(0,0,0,0.36), 0 0 45px rgba(255,15,138,0.17), var(--shadow);
          isolation: isolate;
        }

        /* Mobile: the stage is the protagonist of the experience. A 16:9 box
           on a tall, narrow viewport leaves the cameras small/compressed, so
           portrait phones get a taller ratio that claims most of the
           viewport height instead. Landscape/tablet/desktop keep 16:9. */
        @media (max-width: 900px) and (orientation: portrait) {
          .video-wrap {
            aspect-ratio: 3 / 4;
            max-height: 72vh;
          }
        }

        @media (max-width: 480px) and (orientation: portrait) {
          .video-wrap {
            aspect-ratio: 9 / 13;
            max-height: 76vh;
          }
        }

        .video-wrap::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 -120px 130px rgba(8,3,20,0.28);
        }

        .live-overlay-stack {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
        }

        .video-ambient-glow {
          position: absolute;
          inset: -30%;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 18% 20%, rgba(224,64,251,0.16), transparent 28%),
            radial-gradient(circle at 82% 18%, rgba(34,211,238,0.12), transparent 26%);
          animation: ambientFloat 8s ease-in-out infinite alternate;
        }

        @keyframes ambientFloat {
          from { transform: translate3d(-1%, -1%, 0) scale(1); }
          to { transform: translate3d(1.5%, 1%, 0) scale(1.03); }
        }

        .agora-video-container {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          background: #000;
          z-index: 0;
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
          pointer-events: none;
        }

        /* Single reconnecting pill — the only "connection status" surfaced
           on the video itself. Live badge/viewer count/host identity are
           not repeated here; they already live in the creator header bar
           above the stage. */
        .vap-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(7,3,18,0.6);
          color: #fff;
          backdrop-filter: blur(12px);
          font-size: 0.68rem;
          font-weight: 900;
          padding: 0.25rem 0.65rem;
          box-shadow: 0 0 18px rgba(0,0,0,0.18);
        }

        .vap-reconnecting {
          border-color: rgba(251,191,36,0.4);
          background: rgba(251,191,36,0.16);
          color: #fde68a;
          animation: vapLivePulse 1.6s ease-in-out infinite;
        }

        @keyframes vapLivePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.35); }
          50% { box-shadow: 0 0 0 6px rgba(251,191,36,0); }
        }

        .overlay-left,
        .overlay-right {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
          pointer-events: auto;
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

        .viewers-badge-button {
          border: 1px solid rgba(103,232,249,0.35);
          color: #e0f2fe;
          cursor: pointer;
          font: inherit;
        }

        .viewers-badge-button:hover {
          background: rgba(14,165,233,0.16);
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

        .chat-empty-state {
          align-self: center;
          margin: 0.5rem 0;
          padding: 0.55rem 0.8rem;
          border: 1px dashed rgba(224,64,251,0.24);
          border-radius: 999px;
          background: rgba(224,64,251,0.045);
          color: var(--text-dim);
          font-size: 0.78rem;
          font-style: italic;
          pointer-events: none;
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
        }
        .creator-safety-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        .creator-safety-actions.inline {
          justify-content: flex-start;
          margin-left: auto;
        }

        .live-moderation-status {
          margin: 0.45rem 0 0.2rem;
          color: #c4b5fd;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .live-chat-status {
          margin: 0.45rem 0.75rem 0;
          padding: 0.48rem 0.65rem;
          border-radius: 12px;
          border: 1px solid rgba(250,204,21,0.24);
          background: rgba(250,204,21,0.08);
          color: #fde68a;
          font-size: 0.74rem;
          font-weight: 800;
        }

        .live-chat-status-error {
          border-color: rgba(248,113,113,0.32);
          background: rgba(248,113,113,0.1);
          color: #fecaca;
        }

        .live-chat-moderation-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          width: 100%;
          margin-top: 0.35rem;
        }

        .live-chat-moderation-btn {
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.72);
          color: #f8fafc;
          cursor: pointer;
          font-size: 0.78rem;
          font-weight: 800;
          padding: 0.48rem 0.7rem;
        }

        .live-chat-moderation-btn.danger {
          border-color: rgba(248, 113, 113, 0.35);
          color: #fecaca;
        }

        .chat-msg-gift {
          background: linear-gradient(135deg, rgba(224,64,251,0.08), rgba(244,63,94,0.06));
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: 0.85rem;
          padding: 0.5rem 0.7rem;
          box-shadow: 0 0 16px rgba(224,64,251,0.08), inset 0 1px 0 rgba(255,255,255,0.04);
          animation: giftMsgSlide 0.35s ease;
        }

        .chat-type-label {
          align-self: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: var(--text-dim);
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          line-height: 1;
          padding: 0.18rem 0.38rem;
          text-transform: uppercase;
        }

        .chat-type-label.gift {
          border-color: rgba(251,191,36,0.25);
          background: rgba(251,191,36,0.09);
          color: #fde68a;
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
          background:
            radial-gradient(circle at 0% 0%, rgba(224,64,251,0.1), transparent 34%),
            linear-gradient(180deg, rgba(16,6,38,0.94), rgba(8,3,21,0.96));
          border: 1px solid rgba(224,64,251,0.18);
          border-radius: var(--radius);
          overflow: hidden;
          height: auto;
          position: sticky;
          top: 1rem;
          box-shadow: 0 18px 50px rgba(0,0,0,0.24), 0 0 24px rgba(224,64,251,0.07);
          backdrop-filter: blur(18px);
        }

        .viewer-panel {
          padding: 0.65rem 0.75rem;
          border-top: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.025);
          flex-shrink: 0;
        }

        .viewer-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.7rem;
          color: var(--text);
          font-size: 0.82rem;
          font-weight: 900;
          cursor: pointer;
          list-style: none;
        }

        .viewer-panel-header::-webkit-details-marker { display: none; }

        .viewer-panel-header strong {
          color: #67e8f9;
          font-size: 0.95rem;
        }

        .audience-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(3,0,14,0.72);
          backdrop-filter: blur(10px);
        }

        .audience-modal {
          width: min(420px, 100%);
          max-height: min(560px, 86vh);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(103,232,249,0.28);
          border-radius: 24px;
          background:
            radial-gradient(circle at 0% 0%, rgba(34,211,238,0.16), transparent 38%),
            linear-gradient(180deg, rgba(16,6,38,0.98), rgba(8,3,21,0.98));
          box-shadow: 0 28px 80px rgba(0,0,0,0.45);
          padding: 1rem;
        }

        .audience-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.35rem;
        }

        .audience-modal-kicker {
          margin: 0 0 0.25rem;
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .audience-modal h2 {
          margin: 0;
          color: var(--text);
          font-size: 1.15rem;
        }

        .audience-modal-close {
          width: 2rem;
          height: 2rem;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          color: var(--text);
          cursor: pointer;
          font-size: 1.35rem;
          line-height: 1;
        }

        .audience-modal .viewer-list {
          max-height: 420px;
        }

        .viewer-list {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          margin-top: 0.65rem;
          max-height: 210px;
          overflow-y: auto;
          padding-right: 0.2rem;
        }

        .viewer-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.55rem;
          padding: 0.5rem;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          background: rgba(255,255,255,0.025);
        }

        .viewer-identity {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
          color: var(--text);
          text-decoration: none;
        }

        .viewer-identity .viewer-avatar {
          margin-left: 0;
          flex-shrink: 0;
        }

        .viewer-name {
          font-size: 0.78rem;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .viewer-presence {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34,197,94,0.55);
          flex-shrink: 0;
        }

        .viewer-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.35rem;
          flex: 1;
        }

        .viewer-action {
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 999px;
          background: rgba(15,23,42,0.72);
          color: #f8fafc;
          cursor: pointer;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 0.42rem 0.58rem;
          text-decoration: none;
        }

        .viewer-action.danger {
          border-color: rgba(248,113,113,0.34);
          color: #fecaca;
        }

        .viewer-empty {
          margin-top: 0.55rem;
        }

        .viewer-stack {
          display: flex;
          align-items: center;
          margin-bottom: 0.55rem;
        }

        .viewer-avatar,
        .viewer-more {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          margin-left: -0.4rem;
          border: 2px solid rgba(12,5,28,0.98);
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.8rem;
          font-weight: 900;
          overflow: hidden;
          box-shadow: 0 0 14px rgba(224,64,251,0.14);
        }

        .viewer-avatar:first-child { margin-left: 0; }

        .viewer-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .viewer-avatar.fan {
          background: linear-gradient(135deg, rgba(251,191,36,0.26), rgba(224,64,251,0.2));
        }

        .viewer-more {
          width: auto;
          min-width: 38px;
          padding: 0 0.5rem;
          border-radius: 999px;
          background: rgba(255,255,255,0.07);
          color: var(--text-muted);
          font-size: 0.72rem;
        }

        .viewer-panel p {
          margin: 0;
          color: var(--text-dim);
          font-size: 0.72rem;
          line-height: 1.4;
        }

        .top-gifters-disclosure {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 0.55rem 0.75rem;
          flex-shrink: 0;
        }

        .top-gifters-disclosure > summary {
          cursor: pointer;
          color: var(--text);
          font-size: 0.78rem;
          font-weight: 900;
          list-style: none;
        }

        .top-gifters-disclosure > summary::-webkit-details-marker { display: none; }

        @media (max-width: 900px) {
          .room-chat {
            min-height: min(560px, 76dvh);
            position: static;
          }
        }

        .chat-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: linear-gradient(90deg, rgba(224,64,251,0.1), rgba(34,211,238,0.05));
          border-bottom: 1px solid rgba(255,255,255,0.08);
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
          min-height: 280px;
          max-height: 390px;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(224,64,251,0.2) transparent;
        }

        @media (max-width: 900px) {
          .chat-messages {
            min-height: 260px;
            max-height: 46dvh;
          }
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
          width: fit-content;
          max-width: 100%;
          padding: 0.3rem 0.48rem;
          border-radius: 0.78rem;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.045);
          animation: chatAppear 0.24s ease both;
        }

        @keyframes chatAppear {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .chat-msg-system {
          justify-content: center;
          width: 100%;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.045);
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
          padding: 0.75rem 0.75rem max(0.75rem, env(safe-area-inset-bottom));
          border-top: 1px solid rgba(255,255,255,0.08);
          flex-shrink: 0;
          background: rgba(7,3,18,0.78);
          backdrop-filter: blur(14px);
        }

        .chat-input {
          flex: 1;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
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

        /* ── Creator event controls ── */
        .creator-events {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .btn-event {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.3rem 0.8rem;
          border-radius: var(--radius-pill, 999px);
          font-size: 0.75rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.18s;
          border: 1px solid transparent;
          letter-spacing: 0.02em;
        }

        .btn-event:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-event-fire {
          background: rgba(251,101,6,0.15);
          border-color: rgba(251,101,6,0.55);
          color: #fdba74;
          animation: eventBtnGlow 2.5s ease-in-out infinite;
        }

        .btn-event-fire:hover:not(:disabled) {
          background: rgba(251,101,6,0.3);
          box-shadow: 0 0 14px rgba(251,101,6,0.45);
        }

        @keyframes eventBtnGlow {
          0%, 100% { box-shadow: 0 0 4px rgba(251,101,6,0.2); }
          50%       { box-shadow: 0 0 12px rgba(251,101,6,0.5); }
        }

        .btn-event-boost {
          background: rgba(220,38,38,0.12);
          border-color: rgba(220,38,38,0.5);
          color: #fca5a5;
        }

        .btn-event-boost:hover:not(:disabled) {
          background: rgba(220,38,38,0.25);
          box-shadow: 0 0 12px rgba(220,38,38,0.35);
        }

        .btn-event-stop {
          background: rgba(100,116,139,0.15);
          border-color: rgba(100,116,139,0.45);
          color: #94a3b8;
        }

        .btn-event-stop:hover {
          background: rgba(100,116,139,0.25);
        }

        .btn-event-vip {
          background: rgba(251,191,36,0.08);
          border-color: rgba(251,191,36,0.35);
          color: #fbbf24;
        }

        .btn-event-vip:hover {
          background: rgba(251,191,36,0.18);
          box-shadow: 0 0 10px rgba(251,191,36,0.25);
        }

        .btn-event-vip-active {
          background: rgba(251,191,36,0.2);
          border-color: rgba(251,191,36,0.6);
          color: #fbbf24;
          box-shadow: 0 0 10px rgba(251,191,36,0.3);
        }

        .btn-event-vip-active:hover {
          background: rgba(251,191,36,0.28);
        }

        /* ── VIP chat badge ── */
        .chat-vip-badge {
          font-size: 0.72rem;
          line-height: 1;
          flex-shrink: 0;
        }

        .chat-msg-vip-user {
          background: linear-gradient(135deg, rgba(251,191,36,0.06), rgba(224,64,251,0.04));
          border-radius: 0.5rem;
          padding: 0.15rem 0.4rem;
          border-left: 2px solid rgba(251,191,36,0.45);
        }

        .chat-msg-vip-user .chat-user {
          color: #fbbf24;
          text-shadow: 0 0 6px rgba(251,191,36,0.3);
        }

        .chat-msg-vip-user .chat-text {
          color: rgba(255,255,255,0.92);
        }

        /* ── Top fan crown in chat ── */
        .chat-crown {
          font-size: 0.8rem;
          line-height: 1;
          flex-shrink: 0;
          animation: crownBob 2s ease-in-out infinite;
        }

        @keyframes crownBob {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-2px); }
        }

        .chat-msg-top-fan {
          background: linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.04));
          border-radius: 0.5rem;
          padding: 0.15rem 0.4rem;
          border-left: 2px solid rgba(251,191,36,0.55);
        }

        .chat-msg-top-fan .chat-user {
          color: #fbbf24;
        }
      `}</style>
    </div>
  );
}
