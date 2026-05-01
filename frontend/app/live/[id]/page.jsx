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
import LiveBattlePanel from "@/components/LiveBattlePanel";
import GiftComboOverlay from "@/components/GiftComboOverlay";
import GiftComboNotification from "@/components/GiftComboNotification";
import LiveEventBanner from "@/components/LiveEventBanner";
import LiveGiftToast from "@/components/LiveGiftToast";
import LivePressureHints from "@/components/LivePressureHints";
import PaywallModal from "@/components/PaywallModal";
import GiftOverlay from "@/components/GiftOverlay";
import LiveEventFeed from "@/components/LiveEventFeed";
import VsBattleOverlay from "@/components/VsBattleOverlay";
import { computeStatusBadges } from "@/lib/statusBadges";
import { RARITY_STYLES } from "@/lib/gifts";
import socket from "@/lib/socket";

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
  const [giftAnimation, setGiftAnimation] = useState(null);
  
  // Super gift animation state (for new 3-tier system)
  const [superGiftAnimation, setSuperGiftAnimation] = useState(null);

  
  // Gift queue for new overlay system
  const [giftQueue, setGiftQueue] = useState([]);
  const giftQueueIdRef = useRef(0);

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
  const currentUsernameRef = useRef("");
  const [meLoaded, setMeLoaded] = useState(false);
  const [endingStream, setEndingStream] = useState(false);
  const [showEntryAnim, setShowEntryAnim] = useState(true);

  // Live viewer count (updated in real time via socket)
  const [viewerCount, setViewerCount] = useState(0);
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
  // Top 3 fan user IDs sorted by spend (index 0 = #1 fan)
  const [topFanIds, setTopFanIds] = useState([]);

  const [currentUserIsVIP, setCurrentUserIsVIP] = useState(false);
  const currentUserIsVIPRef = useRef(false);

  // Viewer coin balance (for low-coin CTA)
  const [coinBalance, setCoinBalance] = useState(null);

  // Ref for the gift toast component
  const giftToastRef = useRef(null);

  // Creator event controls
  const [triggeringEvent, setTriggeringEvent] = useState(false);

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

  // VS Battle state
  const [vsBattleActive, setVsBattleActive] = useState(false);
  const [vsBattleData, setVsBattleData] = useState(null);
  const [vsHostScore, setVsHostScore] = useState(0);
  const [vsOpponentScore, setVsOpponentScore] = useState(0);
  const [vsResult, setVsResult] = useState(null);

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
    quantity >= BOOST_MEGA_THRESHOLD ? "🚀 Sigue enviando para ganar" : "🔥 Racha activa";

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

  // Agora state
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [agoraError, setAgoraError] = useState("");
  const agoraClientRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoContainerRef = useRef(null);
  const remoteVideoContainerRef = useRef(null);

  const [token, setToken] = useState(null);
  useEffect(() => {
    setToken(localStorage.getItem("token"));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/lives/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar el directo");
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
        if (data?.username || data?.name) {
          const uname = data.username || data.name || "";
          setCurrentUsername(uname);
          currentUsernameRef.current = uname;
        }
        if (data?.coins !== undefined) setCoinBalance(data.coins);
        const vip = !!(data?.isVIP);
        setCurrentUserIsVIP(vip);
        currentUserIsVIPRef.current = vip;
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
      showPressureHint("lost_top_fan", "⚠️", "Perdiste el Top Fan", "Envía más regalos para recuperarlo");
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
          "Estás cerca de ser Top Fan",
          needed > 0 ? `Solo te faltan ${needed} coins` : "¡Envía un regalo ahora!"
        );
      }
    }

    prevTopFanIdsRef.current = topFanIds;
  }, [topFanIds, currentUserId, meLoaded, showPressureHint, triggerPaywall]);

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
      if (updatedId === id) setViewerCount(count);
    };

    const onLiveGiftSent = ({ senderName, senderId, giftId, gift, quantity: qty }) => {
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
        if (senderName) topFanNamesRef.current[senderId] = senderName;
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
        giftName: gift.name || "Regalo",
        senderId: senderId || null,
        senderName: senderName || "Alguien",
        receiverId: live?.user?._id || null,
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
          name: gift.name || "Regalo épico",
          sender: senderName || "Alguien",
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
          text: `${gift.icon || "🎁"} ${gift.name || "regalo"}${qtyLabel}`,
          gift,
          system: false,
          isGift: true,
        },
      ]);

      // Show gift event in the video overlay
      addOverlayEvent("gift", gift.icon || "🎁", `${senderName} envió ${gift.name || "un regalo"}${qtyLabel}`);

      // Animated toast notification for high-value gifts
      giftToastRef.current?.push({
        senderName,
        giftIcon: gift.icon || "🎁",
        giftName: gift.name || "regalo",
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
        showPressureHint("boost_moment", "💥", "MOMENTO ÉPICO", boostSubtext(quantity));
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
            `${uniqueSenders.size} personas enviando regalos`,
            "¡El momento es ahora!"
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
          `+${addedCoins} coins a la meta`,
          remaining > addedCoins ? `Faltan ${Math.max(0, remaining - addedCoins)} coins` : "¡Casi llegamos!"
        );
      }
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
          if (fan.username) topFanNamesRef.current[String(fan.userId)] = fan.username;
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
          name: gift.name || "Super Regalo",
          animationType: animationType || "fullscreen",
        },
        sender: sender || "Alguien",
        value: value || 0,
        quantity: quantity || 1,
      });
      
      // Add to event feed
      addEventFeedItem("super_gift", {
        icon: gift.icon || "✨",
        name: gift.name || "Super Regalo",
        sender: sender || "Alguien",
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

    // VS Battle event handlers
    const onVsBattleStarted = (data) => {
      const { vsStartTime, vsDuration, hostLiveId, hostUsername, opponentLiveId, opponentUsername, role } = data;
      setVsBattleActive(true);
      setVsBattleData({
        vsStartTime,
        vsDuration,
        hostLiveId,
        hostUsername,
        opponentLiveId,
        opponentUsername,
        role,
      });
      setVsHostScore(0);
      setVsOpponentScore(0);
      setVsResult(null);
      
      // Add notification to chat
      setChatMessages((prev) => [
        ...prev,
        {
          id: ++msgCounterRef.current,
          user: "Sistema",
          text: `🔥 ¡BATALLA VS iniciada! ${hostUsername} vs ${opponentUsername}`,
          system: true,
        },
      ]);
      
      // Add to event feed
      addEventFeedItem("vs_battle_started", {
        hostUsername,
        opponentUsername,
      });
    };

    const onVsUpdate = ({ hostScore, opponentScore }) => {
      setVsHostScore(hostScore || 0);
      setVsOpponentScore(opponentScore || 0);
    };

    const onVsResult = (data) => {
      const { winner, hostScore, opponentScore, hostUsername, opponentUsername } = data;
      setVsResult({
        winner,
        hostScore,
        opponentScore,
        hostUsername,
        opponentUsername,
      });
      
      // Update final scores
      setVsHostScore(hostScore || 0);
      setVsOpponentScore(opponentScore || 0);
      
      // Add notification to chat
      const resultMsg = winner === "tie" 
        ? `🤝 ¡Batalla VS terminada en empate! ${hostScore} - ${opponentScore}`
        : `🏆 ¡${winner === "host" ? hostUsername : opponentUsername} ganó la batalla VS! ${hostScore} - ${opponentScore}`;
      
      setChatMessages((prev) => [
        ...prev,
        {
          id: ++msgCounterRef.current,
          user: "Sistema",
          text: resultMsg,
          system: true,
        },
      ]);
      
      // End battle after showing result for 5 seconds
      setTimeout(() => {
        setVsBattleActive(false);
        setVsBattleData(null);
        setVsResult(null);
      }, 5000);
    };

    socket.on("LIVE_CHAT_MESSAGE", onChatMessage);
    socket.on("VIEWER_COUNT_UPDATE", onViewerCountUpdate);
    socket.on("LIVE_GIFT_SENT", onLiveGiftSent);
    socket.on("super_gift", onSuperGift);
    socket.on("USER_JOINED_LIVE", onUserJoined);
    socket.on("LIVE_ENDED", onLiveEnded);
    socket.on("BATTLE_SCORE_UPDATED", onBattleScoreUpdated);
    socket.on("LIVE_RANKING_UPDATED", onRankingUpdated);
    socket.on("LIVE_EVENT_STARTED", onLiveEventStarted);
    socket.on("LIVE_EVENT_ENDED", onLiveEventEnded);
    socket.on("TOP_SUPPORTER_UPDATE", onTopSupporterUpdate);
    socket.on("GIFT_COMBO", onGiftCombo);
    socket.on("vs_battle_started", onVsBattleStarted);
    socket.on("vs_update", onVsUpdate);
    socket.on("vs_result", onVsResult);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("LIVE_CHAT_MESSAGE", onChatMessage);
      socket.off("VIEWER_COUNT_UPDATE", onViewerCountUpdate);
      socket.off("LIVE_GIFT_SENT", onLiveGiftSent);
      socket.off("super_gift", onSuperGift);
      socket.off("USER_JOINED_LIVE", onUserJoined);
      socket.off("LIVE_ENDED", onLiveEnded);
      socket.off("BATTLE_SCORE_UPDATED", onBattleScoreUpdated);
      socket.off("LIVE_RANKING_UPDATED", onRankingUpdated);
      socket.off("LIVE_EVENT_STARTED", onLiveEventStarted);
      socket.off("LIVE_EVENT_ENDED", onLiveEventEnded);
      socket.off("TOP_SUPPORTER_UPDATE", onTopSupporterUpdate);
      socket.off("GIFT_COMBO", onGiftCombo);
      socket.off("vs_battle_started", onVsBattleStarted);
      socket.off("vs_update", onVsUpdate);
      socket.off("vs_result", onVsResult);
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
            try {
              if (user.hasVideo) {
                await client.subscribe(user, "video");
                if (remoteVideoContainerRef.current) {
                  user.videoTrack?.play(remoteVideoContainerRef.current);
                }
              }
              if (user.hasAudio) {
                await client.subscribe(user, "audio");
                try { user.audioTrack?.play(); } catch (err) { console.warn("[Agora] audio autoplay blocked:", err); }
              }
            } catch (err) {
              console.error("[Agora] subscribe existing user error:", err);
            }
          }

          client.on("user-published", async (user, mediaType) => {
            try {
              await client.subscribe(user, mediaType);
              if (mediaType === "video" && remoteVideoContainerRef.current) {
                user.videoTrack?.play(remoteVideoContainerRef.current);
              }
              if (mediaType === "audio") {
                try { user.audioTrack?.play(); } catch (err) { console.warn("[Agora] audio autoplay blocked:", err); }
              }
            } catch (err) {
              console.error("[Agora] user-published error:", err);
            }
          });

          client.on("user-unpublished", (user, mediaType) => {
            try {
              if (mediaType === "video") {
                user.videoTrack?.stop();
              }
            } catch (err) { console.warn("[Agora] video stop error:", err); }
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
      { id: ++msgCounterRef.current, user: "Tú", text, system: false, isVIP: currentUserIsVIPRef.current },
    ]);
    setChatInput("");

    // Show in overlay for the sender
    addOverlayEvent("chat", "💬", `Tú: ${truncateText(text)}`);

    // Broadcast to all other viewers in the live room
    socket.emit("live_chat_message", {
      liveId: id,
      text,
      user: { username: currentUsername || "Anónimo", ...(currentUserId ? { userId: currentUserId } : {}) },
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
      senderName = data?.sender?.username || data?.sender?.name || currentUsernameRef.current || "Tú";
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
      addOverlayEvent("gift", gift.icon || "🎁", `Tú enviaste ${gift.name || "un regalo"}${qtyLabel}`);

      // Animated toast for sender
      giftToastRef.current?.push({
        senderName,
        giftIcon: gift.icon || "🎁",
        giftName: gift.name || "regalo",
        coinCost: gift.coinCost || 0,
        rarity: gift.rarity || "common",
        quantity,
      });

      // Update local top fan map for the sender
      if (currentUserId && gift.coinCost > 0) {
        topFanMapRef.current[currentUserId] = (topFanMapRef.current[currentUserId] || 0) + gift.coinCost;
        if (currentUsernameRef.current) topFanNamesRef.current[currentUserId] = currentUsernameRef.current;
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
          "MOMENTO ÉPICO",
          quantity >= BOOST_MEGA_THRESHOLD ? "🚀 ¡Eres increíble!" : "🔥 El live explota contigo"
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
          `+${addedCoins} coins a la meta`,
          remaining > 0 ? `Faltan ${remaining} coins` : "¡Meta casi alcanzada!"
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
        text: `${gift?.icon || "🎁"} ${gift?.name || "regalo"}${qtyMsgLabel}`,
        gift,
        system: false,
        isGift: true,
      },
    ]);
  }, [addOverlayEvent, currentUserId, showPressureHint]);

  /** Keep goalDataRef in sync so socket callbacks (closed over refs) can access it. */
  const handleGoalChange = useCallback((gd) => {
    goalDataRef.current = gd;
    setGoalData(gd);
  }, []);

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

  if (live.isVipOnly && !live.hasVipAccess) {
    return (
      <div className="viewer-page">
        <div className="paywall card" style={{ borderColor: "rgba(251,191,36,0.35)", background: "linear-gradient(135deg, rgba(251,191,36,0.06), rgba(224,64,251,0.06))" }}>
          <div className="paywall-icon">💎</div>
          <h2 className="paywall-title">{live.title}</h2>
          <p className="paywall-streamer">por @{live.user?.username || "anónimo"}</p>
          <p className="paywall-desc" style={{ color: "#fbbf24" }}>
            Este contenido es solo para usuarios VIP 💎
          </p>
          <p className="paywall-desc">Usuarios VIP ganan más atención · Destaca en el live · Acceso exclusivo</p>
          <Link href="/subscription" className="btn btn-vip-cta btn-lg">
            💎 Hazte VIP
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

  // Derived rendering helpers
  const showBoostUrgency = activeEvent?.type === "last_boost" && boostSecondsLeft !== null && boostSecondsLeft > 0 && boostSecondsLeft <= 30;
  const showGoalUrgency  = !isCreator && goalData?.active && !goalData?.completed && goalData?.target > 0;
  const showUrgencyBar   = showBoostUrgency || showGoalUrgency;
  const goalRemaining    = showGoalUrgency ? Math.max(0, (goalData.target || 0) - (goalData.progress || 0)) : 0;

  return (
    <div className="room">
      {/* ── Non-blocking pressure hint overlay ── */}
      <LivePressureHints hint={pressureHint} />

      {/* ── Contextual paywall modal ── */}
      {paywallReason && !isCreator && (
        <PaywallModal reason={paywallReason} onClose={() => setPaywallReason(null)} />
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
              <span className="ucb-text">¡Últimos {boostSecondsLeft} segundos para llegar a la meta!</span>
              <span className="ucb-fire">🔥</span>
            </>
          ) : (
            <>
              <span className="ucb-icon">🔥</span>
              <span className="ucb-text">
                {goalRemaining > 0
                  ? `Faltan ${goalRemaining.toLocaleString()} coins para alcanzar la meta`
                  : "¡Meta casi alcanzada!"}
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
                  {live.isVipOnly && <span className="chr-private-tag" style={{ borderColor: "rgba(251,191,36,0.4)", color: "#fbbf24", background: "rgba(251,191,36,0.08)" }}>💎 VIP</span>}
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
                <span className="entry-anim-text">¡Conectado al directo!</span>
              </div>
            )}

            {/* Floating reactions (viewer only) */}
            {agoraJoined && !isCreator && <FloatingReactions />}

            {/* Gift combo/streak overlay */}
            <GiftComboOverlay recentGifts={recentGiftsForCombo} />

            {/* Live event feed - top supporter, combo streaks, super gifts */}
            <LiveEventFeed events={eventFeedItems} />

            {/* VS Battle Overlay */}
            {vsBattleActive && vsBattleData && (
              <VsBattleOverlay
                battleData={vsBattleData}
                isActive={vsBattleActive}
                hostScore={vsHostScore}
                opponentScore={vsOpponentScore}
                hostUsername={vsBattleData.hostUsername}
                opponentUsername={vsBattleData.opponentUsername}
                hostLiveId={vsBattleData.hostLiveId}
                opponentLiveId={vsBattleData.opponentLiveId}
              />
            )}

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
                  {/* Creator event controls */}
                  <div className="creator-events">
                    {!activeEvent ? (
                      <>
                        <button
                          className="btn-event btn-event-fire"
                          onClick={() => handleTriggerEvent("x2_coins")}
                          disabled={triggeringEvent}
                          title="Iniciar evento x2 Coins (2 min)"
                        >
                          🔥 Evento x2
                        </button>
                        <button
                          className="btn-event btn-event-boost"
                          onClick={() => handleTriggerEvent("last_boost")}
                          disabled={triggeringEvent}
                          title="Activar boost final (60s)"
                        >
                          ⏳ Boost
                        </button>
                      </>
                    ) : (
                      <button className="btn-event btn-event-stop" onClick={handleStopEvent}>
                        ✕ Parar evento
                      </button>
                    )}
                    <button
                      className={`btn-event${live.isVipOnly ? " btn-event-vip-active" : " btn-event-vip"}`}
                      onClick={handleToggleVipOnly}
                      title={live.isVipOnly ? "Desactivar modo VIP-only" : "Activar modo VIP-only (solo usuarios 💎 VIP)"}
                    >
                      {live.isVipOnly ? "💎 VIP-only ON" : "💎 VIP-only"}
                    </button>
                  </div>
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

          {/* ── Battle Panel (below stream info in main column) ── */}
          <LiveBattlePanel liveId={id} isCreator={isCreator} />

          {/* ── Creator prompts panel ── */}
          {isCreator && (
            <div className="creator-prompts">
              <div className="cp-header">💡 Sugerencias para ti</div>
              <div className="cp-list">
                <div className="cp-item">🎯 Activa una meta para motivar a tus fans</div>
                <div className="cp-item">💬 Invita a tus fans a completar el objetivo</div>
                <div className="cp-item">⚔️ Inicia una batalla para aumentar regalos</div>
              </div>
            </div>
          )}
        </div>

        <div className="room-chat">
          <TopGifters liveId={id} refreshTrigger={giftRefreshTrigger} />

          {/* ── Top Supporter Badge ── */}
          <TopSupporterBadge topSupporter={topSupporter} />

          {/* ── Fan del live VIP card ── */}
          {topFanIds.length > 0 && topFanNamesRef.current[topFanIds[0]] && (
            <div className="fan-del-live">
              <span className="fdl-crown">👑</span>
              <div className="fdl-info">
                <span className="fdl-label">Fan del live</span>
                <span className="fdl-name">@{topFanNamesRef.current[topFanIds[0]]}</span>
              </div>
              <span className="fdl-badge">💎 VIP</span>
            </div>
          )}

          {/* ── Live Goal Panel (below top gifters in chat sidebar) ── */}
          <LiveGoalPanel liveId={id} onGoalChange={handleGoalChange} />

          {/* ── Low-coin CTA (viewer only, non-intrusive) ── */}
          {!isCreator && coinBalance !== null && coinBalance < 50 && (
            <Link href="/coins" className="low-coins-cta">
              🪙 Saldo bajo · <strong>Compra coins para apoyar</strong>
            </Link>
          )}

          {/* ── VIP CTA (viewer only, non-VIP) ── */}
          {!isCreator && !currentUserIsVIP && (
            <Link href="/subscription" className="vip-live-cta">
              💎 <strong>Hazte VIP</strong> · Destaca en el live · Acceso exclusivo
            </Link>
          )}

          {/* ── VIP badge (viewer, already VIP) ── */}
          {!isCreator && currentUserIsVIP && (
            <div className="vip-active-badge">
              <span>💎</span>
              <span>VIP activo · Disfruta de tus ventajas exclusivas</span>
            </div>
          )}

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

            {chatMessages.map((msg) => {
              const fanRank = !msg.system && msg.userId ? topFanIds.indexOf(msg.userId) : -1;
              const chatMsgClass = [
                "chat-msg",
                msg.system && "chat-msg-system",
                msg.isGift && "chat-msg-gift",
                msg.isVIP && !msg.system && "chat-msg-vip-user",
                fanRank === 0 && "chat-msg-top-fan",
                fanRank > 0 && "chat-msg-vip-fan",
              ].filter(Boolean).join(" ");
              return (
                <div key={msg.id} className={chatMsgClass}>
                  {msg.system ? (
                    <span className="chat-text-system">{msg.text}</span>
                  ) : msg.isGift ? (
                    <>
                      <span className="chat-gift-icon">{msg.gift?.icon || "🎁"}</span>
                      {msg.isVIP && <span className="chat-vip-badge" title="Usuario VIP">💎</span>}
                      {fanRank >= 0 && <span className="chat-crown" title={fanRank === 0 ? "Top Fan" : `Fan #${fanRank + 1}`}>{FAN_MEDALS[fanRank]}</span>}
                      <span className="chat-user chat-user-gift">{msg.user}</span>
                      <span className="chat-text chat-text-gift">envió {msg.gift?.name || "un regalo"}</span>
                      {msg.gift?.coinCost > 0 && (
                        <span className="chat-gift-coins">🪙 {msg.gift.coinCost}</span>
                      )}
                    </>
                  ) : (
                    <>
                      {msg.isVIP && <span className="chat-vip-badge" title="Usuario VIP">💎</span>}
                      {fanRank >= 0 && <span className="chat-crown" title={fanRank === 0 ? "Top Fan" : `Fan #${fanRank + 1}`}>{FAN_MEDALS[fanRank]}</span>}
                      <span className="chat-user">{msg.user}</span>
                      <span className="chat-text">{msg.text}</span>
                    </>
                  )}
                </div>
              );
            })}
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
            <span className="dock-label">Enviar regalo</span>
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
          initialCoinBalance={coinBalance}
          isOwnLive={isCreator}
        />
      ) : null}

      <style jsx>{`
        .room {
          display: flex;
          flex-direction: column;
          gap: 0;
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
