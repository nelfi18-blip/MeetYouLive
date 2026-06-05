const mongoose = require("mongoose");
const User = require("../models/User.js");
const Live = require("../models/Live.js");
const Like = require("../models/Like.js");
const UserVisit = require("../models/UserVisit.js");
const Greeting = require("../models/Greeting.js");
const Gift = require("../models/Gift.js");
const { isLiveActuallyActive, filterActiveLives } = require("../services/live.service.js");
const { isApprovedCreator } = require("../lib/creatorUtils.js");
const { hasLiveHost } = require("../lib/socket.js");

const FEED_MIX_RATIO = { live: 0.6, match: 0.4 }; // 60% live, 40% match
const DEFAULT_FEED_SIZE = 20;
const MAX_FEED_SIZE = 50;
const STAFF_ROLES = ["admin", "moderator", "support", "creator_manager", "finance", "content_reviewer"];

const toObjectIdOrNull = (id) =>
  id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;

const normalizeHttpProtocol = (value) => {
  const protocol = typeof value === "string" ? value.replace(/:$/, "").toLowerCase() : "";
  return protocol === "http" || protocol === "https" ? protocol : "https";
};

const getRequestOrigin = (req) => {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = normalizeHttpProtocol(forwardedProto || req.protocol);
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return "";
  return host ? `${protocol}://${host}` : "";
};

/**
 * Accept image fields stored as strings or common upload/provider objects.
 * Supports raw URL strings, Cloudinary-style url/secure_url, and file src/path values.
 */
const getFeedImageValue = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return (
    value.secure_url || // Cloudinary and similar hosted image providers.
    value.url || // Generic persisted URL objects.
    value.src || // Browser/file preview objects.
    value.path || // Local upload metadata stored with a path.
    ""
  );
};

const normalizeFeedImageUrl = (req, value) => {
  const rawValue = getFeedImageValue(value);
  if (typeof rawValue !== "string") return "";
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  const requestOrigin = getRequestOrigin(req);
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (requestOrigin) {
        const requestUrl = new URL(requestOrigin);
        if (
          url.protocol === "http:" &&
          requestUrl.protocol === "https:" &&
          url.hostname === requestUrl.hostname &&
          url.pathname.startsWith("/uploads/")
        ) {
          url.protocol = "https:";
        }
      }
      return url.toString();
    } catch {
      return "";
    }
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (/^\/?uploads\//.test(trimmed)) {
    const uploadPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return requestOrigin ? `${requestOrigin}${uploadPath}` : uploadPath;
  }

  return "";
};

const serializeFeedImageFields = (req, item) => {
  if (!item || typeof item !== "object") return item;

  const rawPhotos = [
    ...(Array.isArray(item.profilePhotos) ? item.profilePhotos : []),
    ...(Array.isArray(item.photos) ? item.photos : []),
    item.profileImage,
    item.photo,
  ];
  const normalizedPhotos = [];
  const seenPhotos = new Set();
  for (const photo of rawPhotos) {
    const normalized = normalizeFeedImageUrl(req, photo);
    if (normalized && !seenPhotos.has(normalized)) {
      seenPhotos.add(normalized);
      normalizedPhotos.push(normalized);
    }
  }

  const normalizedAvatar = normalizeFeedImageUrl(req, item.avatar) || normalizedPhotos[0] || "";
  const profilePhotos = normalizedAvatar
    ? [normalizedAvatar, ...normalizedPhotos.filter((photo) => photo !== normalizedAvatar)]
    : normalizedPhotos;

  return {
    ...item,
    avatar: normalizedAvatar,
    profileImage: normalizedAvatar,
    photo: normalizedAvatar,
    photos: profilePhotos,
    profilePhotos,
  };
};

// Simple in-memory cache for featured creators (they change infrequently)
let featuredCreatorsCache = null;
let featuredCreatorsCacheTime = 0;
let featuredCreatorsFetchPromise = null; // Shared promise to prevent concurrent fetches
const FEATURED_CREATORS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get featured creators with caching
 * @returns {Promise<Array>} Featured creators list
 */
async function getFeaturedCreatorsWithCache() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (featuredCreatorsCache && (now - featuredCreatorsCacheTime) < FEATURED_CREATORS_CACHE_TTL) {
    console.log("[Feed API] Using cached featured creators");
    return featuredCreatorsCache;
  }
  
  // If another request is already fetching, wait for that promise
  if (featuredCreatorsFetchPromise) {
    console.log("[Feed API] Waiting for ongoing featured creators fetch");
    return featuredCreatorsFetchPromise;
  }
  
  // Create a new fetch promise
  featuredCreatorsFetchPromise = (async () => {
    try {
      console.log("[Feed API] Fetching fresh featured creators");
      const creators = await User.find({
        role: { $in: ["creator", "subCreator"] },
        creatorStatus: "approved",
        isBlocked: false,
        isSuspended: false
      })
        .sort({ earningsCoins: -1 })
        .limit(12)
        .select("name avatar earningsCoins")
        .lean();
      
      // Update cache
      featuredCreatorsCache = creators;
      featuredCreatorsCacheTime = Date.now();
      
      return creators;
    } finally {
      // Clear the promise so next request can create a new one
      featuredCreatorsFetchPromise = null;
    }
  })();
  
  return featuredCreatorsFetchPromise;
}

/**
 * GET /api/feed
 * Returns real data for hybrid feed (live + match + creators)
 * - activeLives: Active live streams ONLY (isLive=true, no endedAt)
 * - recommendedProfiles: Regular users (NO admin, NO staff)
 * - featuredCreators: Top approved creators by earnings
 */
const getFeed = async (req, res) => {
  const startTime = Date.now();
  try {
    console.log("[Feed API] Fetching feed data...");

    const authenticatedUserId = toObjectIdOrNull(req.userId);
    const recommendedProfilesMatch = {
      role: "user", // Excludes creators and all staff roles
      isBlocked: false,
      isSuspended: false,
      onboardingComplete: true
    };
    if (authenticatedUserId) {
      recommendedProfilesMatch._id = { $ne: authenticatedUserId };
    }
    
    // Run all queries in parallel for better performance
    const [allLives, recommendedProfiles, featuredCreators] = await Promise.all([
      // 🔴 Active live streams ONLY - fetch more than 12 to account for filtering
      Live.find({
        isLive: true,
        endedAt: null
      })
        .sort({ viewerCount: -1 })
        .limit(30) // Fetch more to ensure we get 12 after filtering
        .populate("user", "name avatar role creatorStatus")
        .lean(),
      
      // ❤️ Recommended users (NO admin, NO staff) - use query to filter directly
      // Add randomization for variety
      User.aggregate([
        {
          $match: recommendedProfilesMatch
        },
        { $sample: { size: 12 } }, // Randomize selection
        {
          $project: {
            name: 1,
            avatar: 1,
            profilePhotos: 1,
            photos: 1,
            profileImage: 1,
            photo: 1,
            location: 1,
            bio: 1,
            tags: 1,
            interests: 1,
            isOnline: 1,
            // Calculate age from birthdate without exposing raw birthdate
            // Use $$NOW system variable for better performance (evaluated once per query)
            age: {
              $cond: {
                if: { $ne: ["$birthdate", null] },
                then: {
                  $floor: {
                    $divide: [
                      { $subtract: ["$$NOW", "$birthdate"] },
                      365.25 * 24 * 60 * 60 * 1000
                    ]
                  }
                },
                else: null
              }
            }
          }
        }
      ]),
      
      // ⭐ Featured creators - use cached function (data changes infrequently)
      getFeaturedCreatorsWithCache()
    ]);

    // Apply active live filter FIRST to ensure only truly active streams
    const activeLives = filterActiveLives(allLives);

    // Filter out staff roles and ensure only approved creators with active Socket.io connection
    const filteredLives = activeLives
      .filter((live) => {
        if (!live.user) return false;
        const userRole = live.user.role;
        // Exclude all staff roles
        if (STAFF_ROLES.includes(userRole)) return false;
        // Only include approved creators or subCreators
        const isApprovedCreator = (userRole === "creator" || userRole === "subCreator") && 
                                  live.user.creatorStatus === "approved";
        return isApprovedCreator;
      })
      // CRITICAL: Only include streams with active host Socket.io connection
      .filter((live) => hasLiveHost(String(live._id)))
      .slice(0, 12); // Take only first 12 after filtering

    const serializedLives = filteredLives.map((live) => ({
      ...live,
      user: serializeFeedImageFields(req, live.user),
    }));
    const serializedRecommendedProfiles = recommendedProfiles.map((profile) =>
      serializeFeedImageFields(req, profile)
    );
    const serializedFeaturedCreators = featuredCreators.map((creator) =>
      serializeFeedImageFields(req, creator)
    );

    const responseTime = Date.now() - startTime;
    console.log(`[Feed API] Response ready in ${responseTime}ms:`, {
      activeLives: serializedLives.length,
      recommendedProfiles: serializedRecommendedProfiles.length,
      featuredCreators: serializedFeaturedCreators.length
    });

    res.json({
      activeLives: serializedLives,
      recommendedProfiles: serializedRecommendedProfiles,
      featuredCreators: serializedFeaturedCreators
    });
  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error(`[Feed API] Error loading feed after ${errorTime}ms:`, error.message);
    
    // Only log stack trace in development to prevent information disclosure
    if (process.env.NODE_ENV !== 'production') {
      console.error("[Feed API] Error stack:", error.stack);
    }
    
    // Use consistent error response format as per project guidelines
    res.status(500).json({ 
      message: process.env.NODE_ENV === 'production' 
        ? "Error al cargar el feed" 
        : `Error al cargar el feed: ${error.message}`
    });
  }
};

/**
 * GET /api/feed/hybrid
 * Returns an intelligent mix of live streams and match profiles
 * - 60% Live content (active streams from approved creators)
 * - 40% Match profiles (regular users for dating)
 * Priority: Verified creators → Active streams → New users
 */
const getHybridFeed = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = DEFAULT_FEED_SIZE } = req.query;
    const feedSize = Math.min(parseInt(limit, 10) || DEFAULT_FEED_SIZE, MAX_FEED_SIZE);

    // Calculate split
    const liveCount = Math.ceil(feedSize * FEED_MIX_RATIO.live);
    const matchCount = Math.floor(feedSize * FEED_MIX_RATIO.match);

    // Fetch user's existing likes to exclude from match feed
    const userLikes = await Like.find({ from: userId }).select("to").lean();
    const likedIds = userLikes.map((l) => l.to.toString());

    // Parallel fetch: live streams and match profiles
    const [liveStreams, matchProfiles] = await Promise.all([
      getLiveStreams(liveCount, userId),
      getMatchProfiles(matchCount, userId, likedIds),
    ]);

    // Intelligent mixing: prioritize content
    const feed = intelligentMix(liveStreams, matchProfiles, feedSize);

    res.json({
      ok: true,
      feed,
      stats: {
        totalItems: feed.length,
        liveCount: feed.filter((item) => item.type === "live").length,
        matchCount: feed.filter((item) => item.type === "match").length,
      },
    });
  } catch (err) {
    console.error("Hybrid feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Fetch live streams with priority sorting
 * Priority: Verified creators > High viewer count > New streams
 */
const getLiveStreams = async (count, currentUserId) => {
  try {
    const lives = await Live.find({ isLive: true, endedAt: null })
      .populate("user", "username name avatar role creatorStatus isVerifiedCreator followersCount")
      .select("-streamKey -paidViewers")
      .lean();

    // Apply active live filter FIRST
    const trulyActiveLives = filterActiveLives(lives);

    // Filter and validate active lives
    const activeLives = trulyActiveLives
      .filter((live) => live && live._id && live.user)
      .filter((live) => {
        const userRole = live.user?.role;
        // Exclude all staff roles (admin/moderator/support/creator_manager/finance/content_reviewer)
        if (STAFF_ROLES.includes(userRole)) return false;
        const approved = (userRole === "creator" || userRole === "subCreator") && live.user?.creatorStatus === "approved";
        return approved && isLiveActuallyActive(live);
      })
      // CRITICAL: Only include streams with active host Socket.io connection
      .filter((live) => hasLiveHost(String(live._id)));

    // Get total coins earned for each live (for sorting)
    const liveIds = activeLives.map((l) => l._id);
    const coinsData = await Gift.aggregate([
      { $match: { liveId: { $in: liveIds } } },
      { $group: { _id: "$liveId", totalCoins: { $sum: "$coinCost" } } },
    ]);

    const coinsMap = new Map();
    coinsData.forEach((c) => {
      coinsMap.set(c._id.toString(), c.totalCoins || 0);
    });

    // Enrich lives with coins data and calculate priority score
    const enrichedLives = activeLives.map((live) => {
      const totalCoinsEarned = coinsMap.get(String(live._id)) || 0;
      const isVerified = live.user?.isVerifiedCreator || false;
      const viewerCount = live.viewerCount || 0;
      const isNew = live.createdAt ? (Date.now() - new Date(live.createdAt).getTime()) < 10 * 60 * 1000 : false;

      // Priority score calculation
      let priority = 0;
      if (isVerified) priority += 1000; // Verified creators get highest priority
      priority += viewerCount * 10; // Active viewers boost
      priority += totalCoinsEarned; // Earning streams boost
      if (isNew) priority += 500; // New streams get boosted

      return {
        ...live,
        totalCoinsEarned,
        priority,
        type: "live",
      };
    });

    // Sort by priority and return top N
    enrichedLives.sort((a, b) => b.priority - a.priority);
    return enrichedLives.slice(0, count);
  } catch (err) {
    console.error("Error fetching live streams:", err);
    return [];
  }
};

/**
 * Fetch match profiles with priority sorting
 * Priority: New users > Active users > Users with complete profiles
 * Excludes: Already liked users, creators, self, blocked users
 */
const getMatchProfiles = async (count, currentUserId, likedIds) => {
  try {
    // Fetch current user's data for filtering
    const currentUser = await User.findById(currentUserId)
      .select("gender birthdate location blockedUsers")
      .lean();

    if (!currentUser) return [];

    const blockedUsers = currentUser.blockedUsers || [];
    const excludeIds = [
      ...likedIds,
      ...blockedUsers.map((id) => id.toString()),
      currentUserId.toString(),
    ];

    // Find potential matches (regular users, not creators)
    const users = await User.find({
      _id: { $nin: excludeIds },
      role: "user", // Only regular users in match feed
      onboardingComplete: true,
      isBlocked: false,
      isSuspended: false,
      username: { $ne: null },
    })
      .select("username name avatar bio gender birthdate location interests intent profilePhotos isVerifiedCreator createdAt")
      .limit(count * 3) // Fetch more to allow for filtering
      .lean();

    // Calculate priority for each user
    const enrichedUsers = users.map((user) => {
      const isNew = user.createdAt ? (Date.now() - new Date(user.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000 : false; // New = less than 7 days
      const hasProfilePhoto = (user.profilePhotos && user.profilePhotos.length > 0) || user.avatar;
      const hasCompleteProfile = user.bio && user.location && user.interests && user.interests.length > 0;

      // Priority score
      let priority = 0;
      if (isNew) priority += 800; // New users boosted
      if (hasCompleteProfile) priority += 300; // Complete profiles boosted
      if (hasProfilePhoto) priority += 200; // Users with photos boosted
      priority += Math.random() * 100; // Add randomness for variety

      return {
        ...user,
        priority,
        type: "match",
        tags: generateTags(user, isNew),
      };
    });

    // Sort by priority
    enrichedUsers.sort((a, b) => b.priority - a.priority);
    return enrichedUsers.slice(0, count);
  } catch (err) {
    console.error("Error fetching match profiles:", err);
    return [];
  }
};

/**
 * Generate tags for match cards
 */
const generateTags = (user, isNew) => {
  const tags = [];
  if (isNew) tags.push("Nuevo");
  if (user.intent === "dating") tags.push("Busca relación");
  if (user.intent === "casual") tags.push("Algo casual");
  if (user.isVerifiedCreator) tags.push("Verificado");
  return tags;
};

/**
 * Intelligent mixing algorithm
 * Ensures good distribution while maintaining priority
 */
const intelligentMix = (liveStreams, matchProfiles, targetSize) => {
  const mixed = [];
  let liveIdx = 0;
  let matchIdx = 0;

  // Interleave content with 60/40 ratio pattern
  // Pattern: L L M L M L L M... (roughly 60/40)
  const pattern = [1, 1, 0, 1, 0, 1, 1, 0, 1, 0]; // 1=live, 0=match (6 live, 4 match per 10 items)

  for (let i = 0; i < targetSize && (liveIdx < liveStreams.length || matchIdx < matchProfiles.length); i++) {
    const shouldAddLive = pattern[i % pattern.length] === 1;

    if (shouldAddLive && liveIdx < liveStreams.length) {
      mixed.push(liveStreams[liveIdx++]);
    } else if (!shouldAddLive && matchIdx < matchProfiles.length) {
      mixed.push(matchProfiles[matchIdx++]);
    } else if (liveIdx < liveStreams.length) {
      // Fallback: add live if no match available
      mixed.push(liveStreams[liveIdx++]);
    } else if (matchIdx < matchProfiles.length) {
      // Fallback: add match if no live available
      mixed.push(matchProfiles[matchIdx++]);
    }
  }

  return mixed;
};

/**
 * GET /api/feed/live-only
 * Returns only live streams (for Live tab)
 */
const getLiveOnlyFeed = async (req, res) => {
  try {
    const { limit = DEFAULT_FEED_SIZE } = req.query;
    const feedSize = Math.min(parseInt(limit, 10) || DEFAULT_FEED_SIZE, MAX_FEED_SIZE);

    const liveStreams = await getLiveStreams(feedSize, req.userId);

    res.json({
      ok: true,
      feed: liveStreams,
      count: liveStreams.length,
    });
  } catch (err) {
    console.error("Live feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/feed/match-only
 * Returns only match profiles (for Match tab)
 */
const getMatchOnlyFeed = async (req, res) => {
  try {
    const { limit = DEFAULT_FEED_SIZE } = req.query;
    const feedSize = Math.min(parseInt(limit, 10) || DEFAULT_FEED_SIZE, MAX_FEED_SIZE);

    const userLikes = await Like.find({ from: req.userId }).select("to").lean();
    const likedIds = userLikes.map((l) => l.to.toString());

    const matchProfiles = await getMatchProfiles(feedSize, req.userId, likedIds);

    res.json({
      ok: true,
      feed: matchProfiles,
      count: matchProfiles.length,
    });
  } catch (err) {
    console.error("Match feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/feed/top
 * Returns top content (trending lives + popular users)
 */
const getTopFeed = async (req, res) => {
  try {
    const { limit = DEFAULT_FEED_SIZE } = req.query;
    const feedSize = Math.min(parseInt(limit, 10) || DEFAULT_FEED_SIZE, MAX_FEED_SIZE);

    // Top = Trending lives + popular verified creators
    const liveCount = Math.ceil(feedSize * 0.7); // 70% live
    const matchCount = Math.floor(feedSize * 0.3); // 30% match

    const [topLives, topUsers] = await Promise.all([
      getTopLiveStreams(liveCount),
      getTopMatchProfiles(matchCount, req.userId),
    ]);

    const feed = [...topLives, ...topUsers];

    res.json({
      ok: true,
      feed,
      count: feed.length,
    });
  } catch (err) {
    console.error("Top feed error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getTopLiveStreams = async (count) => {
  try {
    const lives = await Live.find({ isLive: true, endedAt: null })
      .populate("user", "username name avatar role creatorStatus isVerifiedCreator")
      .select("-streamKey -paidViewers")
      .lean();

    // Apply active live filter FIRST
    const trulyActiveLives = filterActiveLives(lives);

    const activeLives = trulyActiveLives
      .filter((live) => live && live._id && live.user)
      .filter((live) => {
        const userRole = live.user?.role;
        // Exclude all staff roles
        if (STAFF_ROLES.includes(userRole)) return false;
        const approved = (userRole === "creator" || userRole === "subCreator") && live.user?.creatorStatus === "approved";
        return approved && isLiveActuallyActive(live);
      })
      // CRITICAL: Only include streams with active host Socket.io connection
      .filter((live) => hasLiveHost(String(live._id)));

    const liveIds = activeLives.map((l) => l._id);
    const coinsData = await Gift.aggregate([
      { $match: { liveId: { $in: liveIds } } },
      { $group: { _id: "$liveId", totalCoins: { $sum: "$coinCost" } } },
    ]);

    const coinsMap = new Map();
    coinsData.forEach((c) => {
      coinsMap.set(c._id.toString(), c.totalCoins || 0);
    });

    const enrichedLives = activeLives
      .map((live) => {
        const totalCoinsEarned = coinsMap.get(String(live._id)) || 0;
        const viewerCount = live.viewerCount || 0;
        const isTrending = viewerCount >= 10 || totalCoinsEarned >= 500;

        return {
          ...live,
          totalCoinsEarned,
          isTrending,
          type: "live",
          score: viewerCount * 10 + totalCoinsEarned,
        };
      })
      .filter((live) => live.isTrending); // Only trending for top feed

    enrichedLives.sort((a, b) => b.score - a.score);
    return enrichedLives.slice(0, count);
  } catch (err) {
    console.error("Error fetching top lives:", err);
    return [];
  }
};

const getTopMatchProfiles = async (count, currentUserId) => {
  try {
    // Top match profiles = verified or popular users
    const users = await User.find({
      _id: { $ne: currentUserId },
      role: "user",
      onboardingComplete: true,
      isBlocked: false,
      isSuspended: false,
      username: { $ne: null },
    })
      .select("username name avatar bio gender birthdate location interests profilePhotos isVerifiedCreator followersCount")
      .sort({ followersCount: -1, _id: 1 })
      .limit(count)
      .lean();

    return users.map((user) => ({
      ...user,
      type: "match",
      tags: generateTags(user, false),
    }));
  } catch (err) {
    console.error("Error fetching top users:", err);
    return [];
  }
};

/**
 * POST /api/feed/track-visit
 * Track when a user views another user's profile (for hook system)
 */
const trackProfileVisit = async (req, res) => {
  try {
    const { userId: visitedUserId } = req.body;
    const visitorId = req.userId;

    if (!visitedUserId) {
      return res.status(400).json({ message: "userId es requerido" });
    }

    if (String(visitedUserId) === String(visitorId)) {
      return res.json({ ok: true, message: "No se registran auto-visitas" });
    }

    // Upsert visit record
    await UserVisit.findOneAndUpdate(
      { visitor: visitorId, visited: visitedUserId },
      {
        $inc: { visitCount: 1 },
        $set: { lastVisitAt: new Date() },
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Track visit error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/feed/visits
 * Get recent profile visits (for hook display)
 */
const getRecentVisits = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 10 } = req.query;
    const maxLimit = Math.min(parseInt(limit, 10) || 10, 50);

    const visits = await UserVisit.find({ visited: userId })
      .populate("visitor", "username name avatar")
      .sort({ lastVisitAt: -1 })
      .limit(maxLimit)
      .lean();

    res.json({
      ok: true,
      visits: visits.map((v) => ({
        user: v.visitor,
        visitCount: v.visitCount,
        lastVisitAt: v.lastVisitAt,
      })),
    });
  } catch (err) {
    console.error("Get visits error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/feed/send-greeting
 * Send a greeting to another user (hook system, optional coin cost)
 */
const sendGreeting = async (req, res) => {
  try {
    const { userId: toUserId, message = "👋" } = req.body;
    const fromUserId = req.userId;

    if (!toUserId) {
      return res.status(400).json({ message: "userId es requerido" });
    }

    if (String(toUserId) === String(fromUserId)) {
      return res.status(400).json({ message: "No puedes enviarte un saludo a ti mismo" });
    }

    // Create greeting
    const greeting = await Greeting.create({
      from: fromUserId,
      to: toUserId,
      message: message || "👋",
    });

    // TODO: Optionally deduct coins and notify user via socket

    res.json({ ok: true, greeting });
  } catch (err) {
    console.error("Send greeting error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/feed/greetings
 * Get received greetings (for hook display)
 */
const getReceivedGreetings = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 10 } = req.query;
    const maxLimit = Math.min(parseInt(limit, 10) || 10, 50);

    const greetings = await Greeting.find({ to: userId, viewed: false })
      .populate("from", "username name avatar")
      .sort({ createdAt: -1 })
      .limit(maxLimit)
      .lean();

    res.json({
      ok: true,
      greetings: greetings.map((g) => ({
        user: g.from,
        message: g.message,
        createdAt: g.createdAt,
      })),
      count: greetings.length,
    });
  } catch (err) {
    console.error("Get greetings error:", err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getFeed,
  getHybridFeed,
  getLiveOnlyFeed,
  getMatchOnlyFeed,
  getTopFeed,
  trackProfileVisit,
  getRecentVisits,
  sendGreeting,
  getReceivedGreetings,
};
