const mongoose = require("mongoose");
const Like = require("../models/Like.js");
const Chat = require("../models/Chat.js");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const CrushTransaction = require("../models/CrushTransaction.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const { calculateSplit } = require("../services/agency.service.js");
const { getIO } = require("../lib/socket.js");

const SUPER_CRUSH_PRICE = 50; // coins
const DAILY_FREE_SWIPES = 20; // free swipes per day
const EXTRA_SWIPES_PRICE = 5; // coins to unlock extra swipes batch
const EXTRA_SWIPES_BATCH = 10; // swipes per unlock
const BOOST_PRICE = 100; // coins to boost crush profile
const BOOST_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Create a chat room (idempotent) and notify both users of a match. */
const handleMatch = async (userId, matchedUserId, io) => {
  const participants = [String(userId), String(matchedUserId)].sort();
  await Chat.findOneAndUpdate(
    { participants: { $all: participants, $size: 2 } },
    { $setOnInsert: { participants } },
    { upsert: true }
  );

  if (io) {
    const [userA, userB] = await Promise.all([
      User.findById(userId).select("username name"),
      User.findById(matchedUserId).select("username name"),
    ]);
    const nameA = userA?.username || userA?.name || "";
    const nameB = userB?.username || userB?.name || "";

    io.to(String(matchedUserId)).emit("MATCH_CREATED", {
      matchedUserId: String(userId),
      matchedUsername: nameA,
    });
    io.to(String(userId)).emit("MATCH_CREATED", {
      matchedUserId: String(matchedUserId),
      matchedUsername: nameB,
    });
  }
};

// ─── Like a user ──────────────────────────────────────────────────────────────
exports.likeUser = async (req, res) => {
  const { userId } = req.params;
  if (String(userId) === String(req.userId)) {
    return res.status(400).json({ message: "No puedes dar like a ti mismo" });
  }
  try {
    // Upsert the like (idempotent) – standard like only
    await Like.findOneAndUpdate(
      { from: req.userId, to: userId },
      { from: req.userId, to: userId, crushType: "standard" },
      { upsert: true }
    );

    // Check if the other user already liked back → mutual match
    const mutual = await Like.findOne({ from: userId, to: req.userId });

    if (mutual) {
      await handleMatch(req.userId, userId, getIO());
    }

    // Notify target of the like
    const io = getIO();
    if (io) {
      const liker = await User.findById(req.userId).select("username name");
      const likerName = liker?.username || liker?.name || "";
      io.to(String(userId)).emit("CRUSH_RECEIVED", {
        fromUserId: String(req.userId),
        fromUsername: likerName,
        crushType: "standard",
      });
    }

    res.json({ match: !!mutual });
  } catch (err) {
    if (err.code === 11000) {
      const mutual = await Like.findOne({ from: userId, to: req.userId });
      return res.json({ match: !!mutual });
    }
    res.status(500).json({ message: err.message });
  }
};

// ─── Remove a like (pass) ─────────────────────────────────────────────────────
exports.unlikeUser = async (req, res) => {
  const { userId } = req.params;
  try {
    await Like.deleteOne({ from: req.userId, to: userId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Super Crush ──────────────────────────────────────────────────────────────
exports.superCrushUser = async (req, res) => {
  const { userId } = req.params;
  if (String(userId) === String(req.userId)) {
    return res.status(400).json({ message: "No puedes enviarte un Super Crush a ti mismo" });
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "userId inválido" });
  }

  const fromObjId = new mongoose.Types.ObjectId(req.userId);
  const toObjId   = new mongoose.Types.ObjectId(userId);

  const session = await mongoose.startSession();
  try {
    let matchCreated = false;

    await session.withTransaction(async () => {
      const sender = await User.findById(fromObjId).session(session);
      if (!sender) throw Object.assign(new Error("Usuario no encontrado"), { status: 404 });
      if (sender.coins < SUPER_CRUSH_PRICE) {
        throw Object.assign(
          new Error(`Necesitas al menos ${SUPER_CRUSH_PRICE} monedas para enviar un Super Crush`),
          { status: 400 }
        );
      }

      const target = await User.findById(toObjId).session(session);
      if (!target) throw Object.assign(new Error("Perfil de destino no encontrado"), { status: 404 });

      // Deduct coins from sender
      await User.findByIdAndUpdate(fromObjId, { $inc: { coins: -SUPER_CRUSH_PRICE } }, { session });

      // Revenue split
      const isCreatorTarget =
        target.role === "creator" && target.creatorStatus === "approved";

      let platformShare = 0;
      let creatorNetShare = 0;
      let agencyShare = 0;
      let referrerId = null;
      let agencyPercentageApplied = 0;

      if (isCreatorTarget) {
        const rel = await AgencyRelationship.findOne({
          subCreator: toObjId,
          status: "active",
        }).session(session);
        const agencyPct = rel?.percentage > 0 ? rel.percentage : null;
        const split = calculateSplit(SUPER_CRUSH_PRICE, agencyPct);

        platformShare   = split.platformShare;
        agencyShare     = split.agencyShare;
        creatorNetShare = split.creatorNetShare;

        if (agencyPct) {
          referrerId              = rel.parentCreator;
          agencyPercentageApplied = rel.percentage;
        }

        await User.findByIdAndUpdate(
          toObjId,
          { $inc: { earningsCoins: creatorNetShare } },
          { session }
        );

        if (agencyShare > 0 && referrerId) {
          await User.findByIdAndUpdate(
            referrerId,
            { $inc: { agencyEarningsCoins: agencyShare, totalAgencyGeneratedCoins: SUPER_CRUSH_PRICE } },
            { session }
          );
        }
      } else {
        platformShare = SUPER_CRUSH_PRICE;
      }

      // Upsert like with super_crush type
      await Like.findOneAndUpdate(
        { from: fromObjId, to: toObjId },
        { from: fromObjId, to: toObjId, crushType: "super_crush" },
        { upsert: true, session }
      );

      // Check mutual match
      const mutual = await Like.findOne({ from: toObjId, to: fromObjId }).session(session);
      if (mutual) {
        matchCreated = true;
        const participants = [String(fromObjId), String(toObjId)].sort();
        await Chat.findOneAndUpdate(
          { participants: { $all: participants, $size: 2 } },
          { $setOnInsert: { participants } },
          { upsert: true, session }
        );
      }

      // Save CrushTransaction
      await CrushTransaction.create(
        [
          {
            fromUser: fromObjId,
            toUser: toObjId,
            coinsSpent: SUPER_CRUSH_PRICE,
            isCreatorTarget,
            platformShare,
            creatorShare: creatorNetShare,
            agencyShare,
            referrerId,
            agencyPercentageApplied,
            matchCreated,
          },
        ],
        { session }
      );

      // CoinTransaction records
      await CoinTransaction.create(
        [
          {
            userId: fromObjId,
            type: "crush_sent",
            amount: -SUPER_CRUSH_PRICE,
            reason: `Super Crush enviado a ${userId}`,
            status: "completed",
            metadata: { toUserId: String(toObjId), crushType: "super_crush" },
          },
        ],
        { session }
      );

      if (isCreatorTarget && creatorNetShare > 0) {
        await CoinTransaction.create(
          [
            {
              userId: toObjId,
              type: "crush_received",
              amount: creatorNetShare,
              reason: `Super Crush recibido de ${req.userId}`,
              status: "completed",
              metadata: { fromUserId: String(fromObjId), crushType: "super_crush" },
            },
          ],
          { session }
        );
      }
    });

    // Socket notifications (outside transaction)
    const io = getIO();
    if (io) {
      const [senderDoc, targetDoc] = await Promise.all([
        User.findById(fromObjId).select("username name"),
        User.findById(toObjId).select("username name"),
      ]);
      const senderName = senderDoc?.username || senderDoc?.name || "";
      const targetName = targetDoc?.username || targetDoc?.name || "";

      io.to(String(toObjId)).emit("SUPER_CRUSH_RECEIVED", {
        fromUserId: String(fromObjId),
        fromUsername: senderName,
        crushType: "super_crush",
        coinsSpent: SUPER_CRUSH_PRICE,
      });

      if (matchCreated) {
        io.to(String(toObjId)).emit("MATCH_CREATED", {
          matchedUserId: String(fromObjId),
          matchedUsername: senderName,
        });
        io.to(String(fromObjId)).emit("MATCH_CREATED", {
          matchedUserId: String(toObjId),
          matchedUsername: targetName,
        });
      }
    }

    res.json({ match: matchCreated, superCrushPrice: SUPER_CRUSH_PRICE });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  } finally {
    await session.endSession();
  }
};

// ─── Get all mutual matches ───────────────────────────────────────────────────
exports.getMatches = async (req, res) => {
  try {
    const me = await User.findById(req.userId).select("interests intent");
    const myInterests = me?.interests || [];
    const myIntent = me?.intent || "";

    const myLikes = await Like.find({ from: req.userId }).select("to");
    const myLikedIds = myLikes.map((l) => String(l.to));

    const mutualLikes = await Like.find({
      from: { $in: myLikedIds },
      to: req.userId,
    }).populate("from", "username name avatar bio role isLive liveId creatorProfile interests intent");

    const matches = mutualLikes.map((l) => {
      const user = l.from.toObject ? l.from.toObject() : l.from;
      const theirInterests = user.interests || [];
      const sharedInterests = myInterests.filter((i) => theirInterests.includes(i));
      const totalInterests = new Set([...myInterests, ...theirInterests]).size;
      const interestScore = totalInterests > 0 ? (sharedInterests.length / totalInterests) * 80 : 0;
      const intentBonus = myIntent && user.intent && myIntent === user.intent ? 20 : 0;
      const compatibilityScore = Math.round(Math.min(100, interestScore + intentBonus));
      return { ...user, sharedInterests, compatibilityScore };
    });

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Check if a specific user is a mutual match ───────────────────────────────
exports.checkMatch = async (req, res) => {
  const { userId } = req.params;
  try {
    const iLiked    = await Like.findOne({ from: req.userId, to: userId });
    const theyLiked = await Like.findOne({ from: userId, to: req.userId });
    res.json({ iLiked: !!iLiked, theyLiked: !!theyLiked, match: !!iLiked && !!theyLiked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Crush stats for the current user ────────────────────────────────────────
exports.getCrushStats = async (req, res) => {
  try {
    const userId = req.userId;

    const [
      likesReceived,
      superCrushesReceived,
      matchCount,
      revenueAgg,
    ] = await Promise.all([
      Like.countDocuments({ to: userId }),
      Like.countDocuments({ to: userId, crushType: "super_crush" }),
      (async () => {
        const myLikes = await Like.find({ from: userId }).select("to");
        const myLikedIds = myLikes.map((l) => String(l.to));
        return Like.countDocuments({ from: { $in: myLikedIds }, to: userId });
      })(),
      CrushTransaction.aggregate([
        { $match: { toUser: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: "$creatorShare" } } },
      ]),
    ]);

    const crushRevenue = revenueAgg[0]?.total ?? 0;
    res.json({ likesReceived, superCrushesReceived, matchCount, crushRevenue });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Expose crush config (price) to the frontend ─────────────────────────────
exports.getCrushConfig = async (_req, res) => {
  res.json({
    superCrushPrice: SUPER_CRUSH_PRICE,
    dailyFreeSwipes: DAILY_FREE_SWIPES,
    extraSwipesPrice: EXTRA_SWIPES_PRICE,
    extraSwipesBatch: EXTRA_SWIPES_BATCH,
    boostPrice: BOOST_PRICE,
    boostDurationHours: BOOST_DURATION_MS / (60 * 60 * 1000),
  });
};

// ─── Boost Crush (increase visibility for 24h) ───────────────────────────────
exports.boostCrush = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let boostUntil;

    await session.withTransaction(async () => {
      const user = await User.findById(req.userId).session(session);
      if (!user) throw Object.assign(new Error("Usuario no encontrado"), { status: 404 });
      if (user.coins < BOOST_PRICE) {
        throw Object.assign(
          new Error(`Necesitas al menos ${BOOST_PRICE} monedas para activar el Boost Crush`),
          { status: 400 }
        );
      }

      boostUntil = new Date(Date.now() + BOOST_DURATION_MS);

      await User.findByIdAndUpdate(
        req.userId,
        { $inc: { coins: -BOOST_PRICE }, $set: { crushBoostUntil: boostUntil } },
        { session }
      );

      await CoinTransaction.create(
        [
          {
            userId: req.userId,
            amount: -BOOST_PRICE,
            type: "boost_crush",
            reason: "Boost Crush activado (24h)",
          },
        ],
        { session }
      );
    });

    res.json({ ok: true, boostUntil, boostPrice: BOOST_PRICE });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  } finally {
    await session.endSession();
  }
};

// ─── Unlock extra swipes with coins ──────────────────────────────────────────
exports.unlockSwipes = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.userId).session(session);
      if (!user) throw Object.assign(new Error("Usuario no encontrado"), { status: 404 });
      if (user.coins < EXTRA_SWIPES_PRICE) {
        throw Object.assign(
          new Error(`Necesitas al menos ${EXTRA_SWIPES_PRICE} monedas para desbloquear más swipes`),
          { status: 400 }
        );
      }

      await User.findByIdAndUpdate(
        req.userId,
        { $inc: { coins: -EXTRA_SWIPES_PRICE } },
        { session }
      );

      await CoinTransaction.create(
        [
          {
            userId: req.userId,
            amount: -EXTRA_SWIPES_PRICE,
            type: "swipe_unlock",
            reason: `Desbloqueados ${EXTRA_SWIPES_BATCH} swipes extra`,
          },
        ],
        { session }
      );
    });

    res.json({ ok: true, unlockedSwipes: EXTRA_SWIPES_BATCH, price: EXTRA_SWIPES_PRICE });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  } finally {
    await session.endSession();
  }
};

// ─── Get boost status for the current user ───────────────────────────────────
exports.getBoostStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("crushBoostUntil coins");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const isBoosted = user.crushBoostUntil && user.crushBoostUntil > new Date();
    res.json({
      isBoosted: !!isBoosted,
      boostUntil: isBoosted ? user.crushBoostUntil : null,
      coins: user.coins,
      boostPrice: BOOST_PRICE,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
