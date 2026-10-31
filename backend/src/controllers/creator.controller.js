const mongoose = require("mongoose");
const crypto = require("crypto");
const Stripe = require("stripe");
const Gift = require("../models/Gift");
const User = require("../models/User");
const Payout = require("../models/Payout");
const Live = require("../models/Live");
const VideoCall = require("../models/VideoCall");
const CoinTransaction = require("../models/CoinTransaction");
const AgencyRelationship = require("../models/AgencyRelationship");
const CreatorPayoutProfile = require("../models/CreatorPayoutProfile");
const { isPayoutProfileComplete, normalizePaypalEmail } = require("../lib/creatorPayoutProfile.js");
const { computeCreatorProgress } = require("../utils/creatorProgress");
const {
  CREATOR_ELIGIBILITY_VERSION,
  getCreatorAgeEligibilityError,
  getCreatorConsentError,
} = require("../lib/creatorEligibility.js");

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Minimum Stripe transfer in cents ($1.00)
const STRIPE_MIN_TRANSFER_CENTS = 100;

const requireApprovedCreatorHelper = async (userId) => {
  const user = await User.findById(userId).select(
    "role creatorStatus username name creatorApprovedAt earningsCoins coins agencyEarningsCoins followersCount"
  );

  if (!user) {
    return { error: "Usuario no encontrado.", user: null };
  }

  // Allow both creator and subCreator roles with approved status
  const isCreator = user.role === "creator" && user.creatorStatus === "approved";
  const isSubCreator = user.role === "subCreator" && user.creatorStatus === "approved";

  if (!isCreator && !isSubCreator) {
    return { error: "Acceso restringido a creadores aprobados.", user: null };
  }

  return { error: null, user };
};

const getConsistencyDays = async (userId, days = 30) => {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await Live.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), createdAt: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
    { $count: "days" },
  ]).catch(() => []);
  return rows[0]?.days || 0;
};

exports.getCreatorStats = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const [aggregateResult, callAgg, liveCount, pendingPayout, consistencyDays] = await Promise.all([
      Gift.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            totalCoinsReceived: { $sum: "$coinCost" },
            totalCreatorShare: { $sum: "$creatorShare" },
            totalGiftCount: { $sum: 1 },
          },
        },
      ]),
      VideoCall.aggregate([
        { $match: { recipient: new mongoose.Types.ObjectId(user._id), status: "ended", type: "paid_creator" } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalCallDurationSeconds: { $sum: "$totalDurationSeconds" },
            totalCallEarnings: { $sum: "$creatorShare" },
          },
        },
      ]),
      Live.countDocuments({ user: user._id }).catch(() => 0),
      Payout.findOne({
        creator: user._id,
        status: { $in: ["pending", "approved", "processing"] },
      }).sort({ createdAt: -1 }),
      getConsistencyDays(user._id, 30),
    ]);

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalGiftCount: 0,
    };

    const callTotals = callAgg[0] || {
      totalCalls: 0,
      totalCallDurationSeconds: 0,
      totalCallEarnings: 0,
    };

    const creatorLevel = computeCreatorProgress({
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      totalGifts: totals.totalGiftCount || 0,
      totalLives: liveCount || 0,
      consistencyDays: consistencyDays || 0,
      followersCount: user.followersCount || 0,
    });

    return res.json({
      ok: true,
      earningsCoins: user.earningsCoins || 0,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      coins: user.coins || 0,
      totalLives: liveCount,
      totalGifts: totals.totalGiftCount || 0,
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      totalCalls: callTotals.totalCalls || 0,
      totalCallDurationSeconds: callTotals.totalCallDurationSeconds || 0,
      totalCallEarnings: callTotals.totalCallEarnings || 0,
      consistencyDays: consistencyDays || 0,
      creatorLevel,
      pendingPayout: pendingPayout
        ? {
            _id: pendingPayout._id,
            amountCoins: pendingPayout.amountCoins,
            status: pendingPayout.status,
            createdAt: pendingPayout.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error("getCreatorStats error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

exports.getCreatorEarnings = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const aggregateResult = await Gift.aggregate([
      { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
      {
        $group: {
          _id: null,
          totalCoinsReceived: { $sum: "$coinCost" },
          totalCreatorShare: { $sum: "$creatorShare" },
          totalPlatformShare: { $sum: "$platformShare" },
          totalGiftCount: { $sum: 1 },
        },
      },
    ]);

    const [recentTransactions, payoutRows, payoutAgg, callAgg] = await Promise.all([
      Gift.find({ receiver: user._id })
        .populate("sender", "username name avatar")
        .populate("giftCatalogItem")
        .sort({ createdAt: -1 })
        .limit(20),
      Payout.find({ creator: user._id })
        .sort({ createdAt: -1 })
        .limit(10),
      Payout.aggregate([
        { $match: { creator: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            pendingCoins: {
              $sum: {
                $cond: [{ $in: ["$status", ["pending", "approved", "processing"]] }, "$amountCoins", 0],
              },
            },
            withdrawnCoins: {
              $sum: {
                $cond: [{ $in: ["$status", ["completed", "paid"]] }, "$amountCoins", 0],
              },
            },
          },
        },
      ]),
      VideoCall.aggregate([
        { $match: { recipient: new mongoose.Types.ObjectId(user._id), status: "ended", type: "paid_creator" } },
        {
          $group: {
            _id: null,
            totalCallEarnings: { $sum: "$creatorShare" },
          },
        },
      ]),
    ]);

    const totals = aggregateResult[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalPlatformShare: 0,
      totalGiftCount: 0,
    };

    const callTotals = callAgg[0] || { totalCallEarnings: 0 };
    const payoutTotals = payoutAgg[0] || { pendingCoins: 0, withdrawnCoins: 0 };
    const recentMonetizationActivity = [
      ...recentTransactions.map((tx) => ({
        _id: `gift-${tx._id}`,
        type: "gift",
        label: `${tx.giftIcon || "🎁"} ${tx.giftName || "Regalo"} recibido`,
        amountCoins: tx.creatorShare || 0,
        status: "credited",
        createdAt: tx.createdAt,
      })),
      ...payoutRows.map((p) => ({
        _id: `payout-${p._id}`,
        type: "payout",
        label: "Solicitud de retiro",
        amountCoins: p.amountCoins || 0,
        status: p.status,
        createdAt: p.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    return res.json({
      ok: true,
      totalCoinsReceived: totals.totalCoinsReceived,
      totalCreatorShare: totals.totalCreatorShare,
      totalPlatformShare: totals.totalPlatformShare,
      totalGiftCount: totals.totalGiftCount,
      pendingPayoutCoins: payoutTotals.pendingCoins || 0,
      withdrawnCoins: payoutTotals.withdrawnCoins || 0,
      totalEarnedLifetime:
        (totals.totalCreatorShare || 0) + (callTotals.totalCallEarnings || 0),
      availableForPayoutCoins: user.earningsCoins || 0,
      recentTransactions,
      recentMonetizationActivity,
    });
  } catch (err) {
    console.error("getCreatorEarnings error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

// requestPayout transaction tuning: a handful of fast retries absorb MongoDB
// write conflicts between concurrent/duplicate requests for the same creator
// without surfacing a spurious 500 to the client. These retries only apply
// to errors that are guaranteed to have happened BEFORE any commit attempt
// (see isPayoutPreCommitConflict below) — retrying after an ambiguous commit
// result would risk creating a duplicate payout, so that case is handled
// separately by verifying the actual outcome instead of blindly retrying.
const PAYOUT_TX_MAX_RETRIES = 3;
const PAYOUT_TX_RETRY_BACKOFF_MS = 80;

function createPayoutHttpError(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  return err;
}

/**
 * Returns true only for write conflicts that are known to have occurred
 * BEFORE the transaction attempted to commit (e.g. two concurrent sessions
 * touching the same document). Retrying the whole transaction is safe here
 * because nothing was persisted — the previous attempt aborted cleanly.
 */
function isPayoutPreCommitConflict(err) {
  if (!err) return false;
  if (err.code === 112) return true;
  if (typeof err.message === "string" && err.message.includes("Write conflict")) return true;
  // TransientTransactionError covers errors raised while running the
  // callback (before commit was ever attempted), so it is also safe to retry
  // the whole transaction from scratch.
  if (
    typeof err.hasErrorLabel === "function" &&
    err.hasErrorLabel("TransientTransactionError") &&
    !err.hasErrorLabel("UnknownTransactionCommitResult")
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true when the outcome of commitTransaction is unknown: the server
 * may have applied the commit, or it may not have — the driver/network
 * simply couldn't confirm which. Blindly re-running the transaction in this
 * case could execute the reservation + Payout.create a second time, creating
 * a duplicate withdrawal, so this must NEVER be treated as a normal retry.
 */
function isUnknownCommitResult(err) {
  return (
    !!err &&
    typeof err.hasErrorLabel === "function" &&
    err.hasErrorLabel("UnknownTransactionCommitResult")
  );
}

function payoutSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true for a MongoDB duplicate-key error on Payout.requestId: it
 * means a Payout tagged with this exact request's id already exists (e.g. a
 * pre-commit retry whose PREVIOUS attempt actually persisted before the
 * driver reported a conflict). It must never be treated as a hard failure —
 * doing so could make the client retry again and create a second payout.
 */
function isDuplicateRequestIdError(err) {
  if (!err) return false;
  if (err.code !== 11000 && err.code !== 11001) return false;

  if (err.keyPattern && Object.prototype.hasOwnProperty.call(err.keyPattern, "requestId")) {
    return true;
  }
  if (err.keyValue && Object.prototype.hasOwnProperty.call(err.keyValue, "requestId")) {
    return true;
  }
  const text = `${err.errmsg || ""} ${err.message || ""}`;
  return text.includes("requestId");
}

/**
 * Looks up the Payout tagged with `requestId` that belongs to `creatorId`.
 * Never match on requestId alone: scoping by creator means an identifier
 * that happens to collide with a payout belonging to a DIFFERENT creator
 * simply behaves as "not found" here — it must never be resolved or leak
 * that other creator's payout details.
 */
async function findPayoutForRequestId(requestId, creatorId) {
  return Payout.findOne({ requestId, creator: creatorId });
}

/**
 * True only when an existing Payout tagged with a reused requestId was
 * created for the SAME operation (method + paymentDetails) as the current
 * request. A matching identifier reused for a DIFFERENT operation (e.g. a
 * different payout method) must never be treated as "the same request
 * succeeded" — that would silently substitute the client's new instructions
 * with the old payout's details.
 */
function payoutMatchesRequestParams(payout, { method, paymentDetails }) {
  if (!payout) return false;
  const normalizedDetails = paymentDetails || "";
  const payoutDetails = payout.paymentDetails || "";
  return payout.method === method && payoutDetails === normalizedDetails;
}

function serializePayoutForResponse(payout) {
  return {
    _id: payout._id,
    amountCoins: payout.amountCoins,
    amountUsd: payout.amountUsd,
    method: payout.method,
    status: payout.status,
    createdAt: payout.createdAt,
  };
}

function respondPayoutIdempotentSuccess(res, payout) {
  res.json({
    ok: true,
    message: "Solicitud de retiro registrada correctamente.",
    payout: serializePayoutForResponse(payout),
  });
}

// Generic, detail-free conflict response used whenever a requestId is
// reused for something OTHER than a pure replay of the exact same
// operation: either the same creator changed method/paymentDetails while
// reusing their own key, or the key collides with another creator's
// payout (which looks identical to "not found" from this creator's point
// of view, so it also lands here). Never reveals whose payout it is.
function respondPayoutRequestIdConflict(res) {
  res.status(409).json({
    ok: false,
    message:
      "Ya existe una solicitud de retiro con este identificador para una operación diferente. Usa un identificador distinto.",
  });
}

/**
 * Resolves what to do with a (requestId, creatorId) pair against this
 * request's own method/paymentDetails, sending the appropriate response as
 * a side effect. Returns "matched" (idempotent success sent), "conflict"
 * (same key, different operation, or a cross-creator collision resolved to
 * a detail-free conflict — response sent), or "not_found" (nothing sent;
 * caller should continue as if this were a brand-new request).
 */
async function resolveIdempotentPayout(res, requestId, creatorId, requestParams) {
  const existing = await findPayoutForRequestId(requestId, creatorId);
  if (!existing) return "not_found";

  if (payoutMatchesRequestParams(existing, requestParams)) {
    respondPayoutIdempotentSuccess(res, existing);
    return "matched";
  }

  respondPayoutRequestIdConflict(res);
  return "conflict";
}

/**
 * After an ambiguous commit result, determine what actually happened by
 * re-reading state instead of re-running the mutation. The lookup is keyed
 * on THIS request's unique requestId AND this creator — never on "any
 * pending/approved payout for this creator" — so an unrelated prior
 * withdrawal (or another creator's payout) can never be mistaken for the
 * outcome of the current request. If the tagged Payout exists AND matches
 * this request's own operation, we return it as the (idempotent) success
 * response; if it exists but was created for a different operation (e.g. a
 * concurrent conflicting reuse of the same key), we report a conflict
 * instead of a false success; otherwise we report the ambiguity to the
 * client without having mutated anything again.
 */
async function resolvePayoutAfterUnknownCommit(res, requestId, creatorId, requestParams) {
  try {
    const outcome = await resolveIdempotentPayout(res, requestId, creatorId, requestParams);
    if (outcome !== "not_found") return;
  } catch (verifyErr) {
    console.error("requestPayout: failed to verify ambiguous commit result:", verifyErr);
  }

  res.status(503).json({
    ok: false,
    message:
      "No se pudo confirmar el resultado de tu solicitud de retiro. Revisa tu historial de retiros antes de intentarlo de nuevo.",
  });
}

// Matches a conservative set of characters for a client-supplied
// Idempotency-Key: letters, digits, '-', '_', '.', ':' — enough for UUIDs
// and most client-generated tokens, while rejecting anything that could
// behave oddly as a Mongo query/index value (objects, excessively long
// strings, etc). Length is capped well below typical index key limits.
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,200}$/;

/**
 * Reads an optional client-supplied idempotency key for this payout request
 * (standard `Idempotency-Key` header, falling back to `idempotencyKey` in
 * the body for clients that can't set custom headers). Returns
 * `{ ok: true, value }` with `value` set to `null` when the client didn't
 * send one (server will generate its own), or `{ ok: false }` when a value
 * was sent but is not a safe, well-formed string — the caller should reject
 * the request rather than pass an unvalidated value into a unique index
 * lookup/insert.
 */
function extractClientRequestId(req) {
  const raw = req.headers?.["idempotency-key"] ?? req.body?.idempotencyKey;

  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string" || !CLIENT_REQUEST_ID_PATTERN.test(raw)) {
    return { ok: false, value: null };
  }
  return { ok: true, value: raw };
}

exports.requestPayout = async (req, res) => {
  let userId;
  let user;
  try {
    userId = req.userId || req.user?.id;
    const result = await requireApprovedCreatorHelper(userId);

    if (result.error) {
      return res.status(403).json({ ok: false, message: result.error });
    }
    user = result.user;
  } catch (err) {
    console.error("requestPayout: requireApprovedCreatorHelper failed:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }

  const { method, paymentDetails = "" } = req.body;

  // Every new payout request must name its method explicitly — there is no
  // implicit default (in particular, NOT "stripe"). This check runs before
  // any balance reservation, idempotency-key lookup, or Payout creation, so
  // a request with a missing/invalid method is rejected without touching
  // the creator's balance or financial records. The HTTP route also
  // enforces this via payoutRequestSchema; this check keeps the controller
  // safe for any caller that bypasses that middleware (e.g. internal
  // callers/tests).
  const ALLOWED_PAYOUT_METHODS = ["zelle", "paypal", "bank", "stripe", "other"];
  if (!method || typeof method !== "string" || !ALLOWED_PAYOUT_METHODS.includes(method)) {
    return res.status(400).json({
      ok: false,
      message: "Debes indicar un método de pago explícito. Valores permitidos: zelle, paypal, bank, stripe, other.",
    });
  }

  const MIN_PAYOUT_COINS = 100;
  // 1 coin = $0.10 USD
  const COINS_PER_USD = 10;

  // Allow the CLIENT to opt into cross-request idempotency by supplying its
  // own stable identifier for this withdrawal request (e.g. generated once
  // on the device before the first HTTP attempt, and reused unchanged on
  // every network-level retry). Reject anything that isn't a safe,
  // well-formed token before it ever touches a database query — an
  // unvalidated value could otherwise reach the unique-index lookup/insert.
  const clientRequestId = extractClientRequestId(req);
  if (!clientRequestId.ok) {
    return res.status(400).json({
      ok: false,
      message: "Identificador de solicitud inválido.",
    });
  }

  // If the client replayed a request it already made successfully (same
  // Idempotency-Key, same authenticated creator), return that exact payout
  // without mutating anything again: no new Payout, no second balance
  // deduction — and, crucially, WITHOUT re-checking the current balance,
  // since the earlier request already reserved it (the balance may well be
  // below the minimum now as a direct result of that reservation). This
  // check runs BEFORE the balance fast-fail below precisely so a legitimate
  // replay is never mistaken for a new, under-funded request.
  //
  // If the same key is reused for a DIFFERENT operation (different method
  // or paymentDetails), this is not a replay — respond with a detail-free
  // conflict instead of silently honoring the new request under the old
  // key, or leaking the stored payout's details.
  //
  // Scoped to `creator: user._id` so an identifier that happens to belong
  // to a DIFFERENT creator can never be resolved here — it simply behaves
  // as if nothing was found, and the normal "new request" flow below
  // proceeds (safely failing with a generic conflict later if the key really
  // is already taken by someone else; see isDuplicateRequestIdError handling).
  if (clientRequestId.value) {
    try {
      const outcome = await resolveIdempotentPayout(res, clientRequestId.value, user._id, {
        method,
        paymentDetails,
      });
      if (outcome !== "not_found") return;
    } catch (err) {
      console.error("requestPayout: idempotency-key replay lookup failed:", err);
      return res.status(500).json({ ok: false, message: "Error interno del servidor" });
    }
  }

  // A brand-new payout request (no matching replay was found above) must
  // never be created without a complete payout profile on file (beneficiary
  // data + a destination to pay out to) — enforced here server-side, not
  // just in the UI, so a request can never bypass this via a direct API
  // call. This never touches/blocks a replay (already returned above) or
  // any historical/pending request.
  let payoutProfile;
  try {
    payoutProfile = await CreatorPayoutProfile.findOne({ creator: user._id });
  } catch (err) {
    console.error("requestPayout: failed to load payout profile:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
  if (!isPayoutProfileComplete(payoutProfile)) {
    return res.status(400).json({
      ok: false,
      code: "PAYOUT_PROFILE_INCOMPLETE",
      message:
        "Completa tu perfil de cobros (datos del beneficiario y destino de pago) antes de solicitar un retiro.",
    });
  }

  // A brand-new request must target EXACTLY the destination already saved
  // on the payout profile — PayPal is the only backend-supported method,
  // and the email must match (case/whitespace-insensitively) the one on
  // file. This prevents a direct API call from requesting a payout to a
  // different/unregistered destination than the one the creator actually
  // configured in "Mi cuenta de cobros". Never touches the balance, never
  // creates a Payout, and never modifies the saved profile — it only
  // rejects before any of that happens. Replays (already resolved above)
  // and historical/pending payouts are never affected by this check.
  if (
    method !== "paypal" ||
    normalizePaypalEmail(paymentDetails) !== normalizePaypalEmail(payoutProfile.paypalEmail)
  ) {
    return res.status(400).json({
      ok: false,
      code: "PAYOUT_DESTINATION_MISMATCH",
      message:
        "El método y el destino deben coincidir con tu PayPal guardado en \"Mi cuenta de cobros\". Actualiza tu perfil de cobros si necesitas cambiarlo.",
    });
  }

  // Fast-fail using the already-fetched (potentially stale) balance so we
  // avoid opening a transaction for the common "balance too low" case. Only
  // reached for genuinely NEW requests (no existing payout was found above
  // for this idempotency key, or none was supplied). The authoritative
  // check happens again, atomically, inside the transaction.
  if ((user.earningsCoins || 0) < MIN_PAYOUT_COINS) {
    return res.status(400).json({
      ok: false,
      message: "No tienes el mínimo requerido para solicitar retiro.",
      minRequired: MIN_PAYOUT_COINS,
      current: user.earningsCoins || 0,
    });
  }

  // Generated ONCE for this incoming HTTP request, before any transaction
  // attempt — including before the retry loop below — so that every
  // attempt made on behalf of THIS request (pre-commit retries) tags the
  // eventual Payout with the same identifier. This is what lets
  // resolvePayoutAfterUnknownCommit (and the duplicate-key handling below)
  // unambiguously confirm "did THIS request's payout get created?" instead
  // of matching any other pending/approved payout belonging to the creator.
  // A client-supplied Idempotency-Key (already validated above) is reused
  // as-is so a fresh HTTP replay of the same logical request lands on the
  // same identifier; otherwise one is minted fresh for this request only.
  const payoutRequestId = clientRequestId.value || crypto.randomUUID();

  for (let attempt = 1; attempt <= PAYOUT_TX_MAX_RETRIES; attempt++) {
    let session;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      console.error("requestPayout: mongoose.startSession failed:", err);
      return res.status(500).json({ ok: false, message: "Error interno del servidor" });
    }

    try {
      let payout = null;

      // Reserve the balance and create the Payout document in a single
      // MongoDB transaction: if anything fails (including Payout.create),
      // the whole operation — including the earningsCoins reservation — is
      // rolled back, so coins can never be reserved without a matching
      // payout record (and vice versa).
      await session.withTransaction(async () => {
        const existingPending = await Payout.findOne({
          creator: user._id,
          status: { $in: ["pending", "approved"] },
        }).session(session);

        if (existingPending) {
          throw createPayoutHttpError(409, "Ya tienes una solicitud de retiro pendiente.", {
            payout: {
              _id: existingPending._id,
              amountCoins: existingPending.amountCoins,
              status: existingPending.status,
              createdAt: existingPending.createdAt,
            },
          });
        }

        // Atomically reserve the full earnings balance: only succeeds while
        // earningsCoins is still at/above the minimum, which guards against
        // concurrent requests/retries double-spending the same balance.
        const updatedUser = await User.findOneAndUpdate(
          {
            _id: user._id,
            earningsCoins: { $gte: MIN_PAYOUT_COINS },
          },
          {
            $set: { earningsCoins: 0 },
          },
          { new: false, select: "earningsCoins", session }
        );

        if (!updatedUser) {
          const current = await User.findById(user._id).select("earningsCoins").session(session);
          const currentBalance = current ? current.earningsCoins || 0 : 0;
          throw createPayoutHttpError(400, "No tienes el mínimo requerido para solicitar retiro.", {
            minRequired: MIN_PAYOUT_COINS,
            current: currentBalance,
          });
        }

        const reservedCoins = updatedUser.earningsCoins || 0;
        const amountUsd = reservedCoins / COINS_PER_USD;

        const [createdPayout] = await Payout.create(
          [
            {
              creator: user._id,
              requestId: payoutRequestId,
              amountCoins: reservedCoins,
              amountUsd,
              method,
              paymentDetails,
              status: "pending",
              requestedAt: new Date(),
              notes: `Solicitud creada desde creator dashboard. Método: ${method}`,
            },
          ],
          { session }
        );

        payout = createdPayout;
      });

      return respondPayoutIdempotentSuccess(res, payout);
    } catch (err) {
      // Ambiguous commit outcome: NEVER re-run the transaction automatically
      // (that could create a duplicate payout). Verify what actually
      // happened instead and respond based on real state, using THIS
      // request's unique id (scoped to this creator) so an unrelated
      // payout — including one belonging to a different creator — is never
      // mistaken for the outcome of the current call.
      if (isUnknownCommitResult(err)) {
        return await resolvePayoutAfterUnknownCommit(res, payoutRequestId, user._id, {
          method,
          paymentDetails,
        });
      }

      // The unique index on Payout.requestId rejected this attempt's
      // insert. Distinct situations produce this error, and ALL must
      // resolve without a raw 500 or a duplicate payout:
      //   (a) a prior attempt for this SAME request (internal pre-commit
      //       retry, or a fresh HTTP replay using the same client-supplied
      //       Idempotency-Key, with the same method/paymentDetails) already
      //       persisted its Payout — found by (requestId, creator) below,
      //       resolved as the same idempotent success.
      //   (b) a concurrent request reused this exact key for a DIFFERENT
      //       operation (different method/paymentDetails) and won the race
      //       to persist first — resolved as a detail-free conflict rather
      //       than a false "success" under the wrong operation.
      //   (c) the identifier collides with a payout that belongs to a
      //       DIFFERENT creator (e.g. a reused/guessed client key) —
      //       (requestId, creator) finds nothing because the creator
      //       filter excludes it, so we fall through to a generic conflict
      //       response that reveals nothing about who actually owns it.
      if (isDuplicateRequestIdError(err)) {
        try {
          const outcome = await resolveIdempotentPayout(res, payoutRequestId, user._id, {
            method,
            paymentDetails,
          });
          if (outcome !== "not_found") return;
        } catch (lookupErr) {
          console.error("requestPayout: failed to resolve duplicate requestId:", lookupErr);
        }
        return res.status(409).json({
          ok: false,
          message:
            "No se pudo procesar tu solicitud con ese identificador. Intenta nuevamente con uno distinto.",
        });
      }

      if (isPayoutPreCommitConflict(err) && attempt < PAYOUT_TX_MAX_RETRIES) {
        await payoutSleep(PAYOUT_TX_RETRY_BACKOFF_MS * Math.pow(2, attempt - 1));
        continue;
      }

      if (Number.isInteger(err?.status)) {
        return res.status(err.status).json({ ok: false, message: err.message, ...(err.extra || {}) });
      }

      console.error("requestPayout error:", err);
      return res
        .status(500)
        .json({ ok: false, message: "Error interno del servidor" });
    } finally {
      await session.endSession();
    }
  }
};

// GET /api/creator/payout-history — paginated payout history for the authenticated creator
exports.getPayoutHistory = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);
    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const MAX_PAYOUT_HISTORY_LIMIT = 50;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAYOUT_HISTORY_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      Payout.find({ creator: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payout.countDocuments({ creator: user._id }),
    ]);

    return res.json({
      ok: true,
      payouts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("getPayoutHistory error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// GET /api/creator/dashboard — consolidated creator dashboard data (approved creators only)
exports.getCreatorDashboard = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    // Calculate start of today (UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [
      giftAgg,
      callAgg,
      activeLive,
      pendingPayout,
      liveCount,
      consistencyDays,
      payoutAgg,
      todayEarningsAgg,
      topSupporterAgg,
      agencyRelationships,
      subCreatorEarnings,
    ] = await Promise.all([
      // Total gift earnings
      Gift.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            totalCoinsReceived: { $sum: "$coinCost" },
            totalCreatorShare: { $sum: "$creatorShare" },
            totalGiftCount: { $sum: 1 },
          },
        },
      ]),
      // Total call earnings
      VideoCall.aggregate([
        { $match: { recipient: new mongoose.Types.ObjectId(user._id), status: "ended", type: "paid_creator" } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalCallDurationSeconds: { $sum: "$totalDurationSeconds" },
            totalCallEarnings: { $sum: "$creatorShare" },
          },
        },
      ]),
      // Active live
      Live.findOne({ user: user._id, isLive: true }).select(
        "_id title viewerCount chatEnabled giftsEnabled isPrivate entryCost"
      ),
      // Pending payout
      Payout.findOne({
        creator: user._id,
        status: { $in: ["pending", "approved", "processing"] },
      }).sort({ createdAt: -1 }),
      // Total lives count
      Live.countDocuments({ user: user._id }).catch(() => 0),
      // Consistency days
      getConsistencyDays(user._id, 30),
      // Payout aggregation
      Payout.aggregate([
        { $match: { creator: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: null,
            pendingCoins: {
              $sum: {
                $cond: [{ $in: ["$status", ["pending", "approved", "processing"]] }, "$amountCoins", 0],
              },
            },
            withdrawnCoins: {
              $sum: {
                $cond: [{ $in: ["$status", ["completed", "paid"]] }, "$amountCoins", 0],
              },
            },
          },
        },
      ]),
      // Today's earnings from CoinTransaction
      CoinTransaction.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(user._id),
            type: { $in: ["gift_received", "call_earned", "content_earned", "agency_earned"] },
            status: "completed",
            createdAt: { $gte: todayStart },
          },
        },
        {
          $group: {
            _id: null,
            todayEarnings: { $sum: "$amount" },
          },
        },
      ]),
      // Top supporter from all lives
      Gift.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(user._id) } },
        {
          $group: {
            _id: "$sender",
            totalCoins: { $sum: "$coinCost" },
          },
        },
        { $sort: { totalCoins: -1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "senderInfo",
          },
        },
        { $unwind: { path: "$senderInfo", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: "$_id",
            username: "$senderInfo.username",
            name: "$senderInfo.name",
            totalCoins: 1,
          },
        },
      ]),
      // Agency relationships (if creator is a parent)
      AgencyRelationship.find({
        parentCreator: user._id,
        status: "active",
        subCreatorAgreed: true,
      }).select("subCreator percentage"),
      // Sub-creator earnings from agency_earned transactions
      CoinTransaction.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(user._id),
            type: "agency_earned",
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalAgencyEarned: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const totals = giftAgg[0] || {
      totalCoinsReceived: 0,
      totalCreatorShare: 0,
      totalGiftCount: 0,
    };

    const callTotals = callAgg[0] || {
      totalCalls: 0,
      totalCallDurationSeconds: 0,
      totalCallEarnings: 0,
    };

    const pendingCoins = payoutAgg[0]?.pendingCoins || 0;
    const withdrawnCoins = payoutAgg[0]?.withdrawnCoins || 0;
    
    // Today's earnings
    const todayEarnings = todayEarningsAgg[0]?.todayEarnings || 0;

    // Total earnings (from creator shares + call earnings)
    const totalEarnings = (totals.totalCreatorShare || 0) + (callTotals.totalCallEarnings || 0);

    // Top supporter
    const topSupporter = topSupporterAgg[0]
      ? {
          username: topSupporterAgg[0].username || topSupporterAgg[0].name || "Usuario",
          totalCoins: topSupporterAgg[0].totalCoins || 0,
        }
      : null;

    // Average earnings per live
    const avgEarningsPerLive = liveCount > 0 ? Math.floor(totalEarnings / liveCount) : 0;

    // Agency metrics (if user has sub-creators)
    let agencyMetrics = null;
    if (agencyRelationships && agencyRelationships.length > 0) {
      const totalSubCreators = agencyRelationships.length;
      const commissionEarned = subCreatorEarnings[0]?.totalAgencyEarned || 0;
      
      agencyMetrics = {
        totalSubCreators,
        commissionEarned,
      };
    }

    const creatorLevel = computeCreatorProgress({
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      totalGifts: totals.totalGiftCount || 0,
      totalLives: liveCount || 0,
      consistencyDays: consistencyDays || 0,
      followersCount: user.followersCount || 0,
    });

    return res.json({
      ok: true,
      activeLive: activeLive || null,
      earningsCoins: user.earningsCoins || 0,
      agencyEarningsCoins: user.agencyEarningsCoins || 0,
      coins: user.coins || 0,
      totalGifts: totals.totalGiftCount || 0,
      totalLives: liveCount || 0,
      totalCoinsReceived: totals.totalCoinsReceived || 0,
      totalCreatorShare: totals.totalCreatorShare || 0,
      totalCalls: callTotals.totalCalls || 0,
      totalCallDurationSeconds: callTotals.totalCallDurationSeconds || 0,
      totalCallEarnings: callTotals.totalCallEarnings || 0,
      consistencyDays: consistencyDays || 0,
      pendingPayoutCoins: pendingCoins,
      withdrawnCoins,
      totalEarnedLifetime: totalEarnings,
      creatorLevel,
      pendingPayout: pendingPayout
        ? {
            _id: pendingPayout._id,
            amountCoins: pendingPayout.amountCoins,
            status: pendingPayout.status,
            createdAt: pendingPayout.createdAt,
          }
        : null,
      // New metrics for Creator Earnings Dashboard
      todayEarnings,
      totalEarnings,
      totalGiftsReceived: totals.totalGiftCount || 0,
      topSupporter,
      avgEarningsPerLive,
      agencyMetrics,
    });
  } catch (err) {
    console.error("getCreatorDashboard error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno del servidor" });
  }
};

// POST /api/creator/request — submit a creator access request (normal users only)
exports.submitCreatorRequest = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    if (user.role !== "user") {
      return res.status(400).json({ ok: false, message: "Solo los usuarios normales pueden solicitar ser creadores" });
    }

    if (user.creatorStatus === "pending") {
      return res.status(400).json({ ok: false, message: "Ya tienes una solicitud de creador pendiente" });
    }

    if (user.creatorStatus === "approved") {
      return res.status(400).json({ ok: false, message: "Ya eres un creador aprobado" });
    }

    // 18+ Creator eligibility gateway — backend is the sole authority.
    // Reuses the User's existing birthdate + calculateAge(), never a
    // client-submitted "I am 18" flag.
    const ageError = getCreatorAgeEligibilityError(user);
    if (ageError) {
      return res.status(400).json({ ok: false, code: ageError.code, message: ageError.message });
    }

    const consentError = getCreatorConsentError(req.body);
    if (consentError) {
      return res.status(400).json({ ok: false, code: consentError.code, message: consentError.message });
    }

    const { displayName, bio, category, country, languages, socialLinks, agencyCode, creatorInvite } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ ok: false, message: "El nombre de creador es requerido" });
    }
    if (!bio || !bio.trim()) {
      return res.status(400).json({ ok: false, message: "La biografía es requerida" });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ ok: false, message: "La categoría es requerida" });
    }
    if (!country || !country.trim()) {
      return res.status(400).json({ ok: false, message: "El país es requerido" });
    }
    if (!languages || !Array.isArray(languages) || languages.length === 0) {
      return res.status(400).json({ ok: false, message: "Debes seleccionar al menos un idioma" });
    }

    const filteredLanguages = languages.filter((l) => l && l.trim());
    if (filteredLanguages.length === 0) {
      return res.status(400).json({ ok: false, message: "Debes seleccionar al menos un idioma válido" });
    }

    const sanitizedSocialLinks = {
      twitter: (socialLinks?.twitter || "").trim(),
      instagram: (socialLinks?.instagram || "").trim(),
      tiktok: (socialLinks?.tiktok || "").trim(),
      youtube: (socialLinks?.youtube || "").trim(),
    };

    user.creatorApplication = {
      displayName: displayName.trim(),
      bio: bio.trim(),
      category: category.trim(),
      country: country.trim(),
      languages: filteredLanguages.map((l) => l.trim()),
      socialLinks: sanitizedSocialLinks,
      submittedAt: new Date(),
      eligibilityAcceptedAt: new Date(),
      eligibilityVersion: CREATOR_ELIGIBILITY_VERSION,
    };
    user.creatorStatus = "pending";

    // Accept an agency invite code submitted with the creator request — override any code
    // stored at registration time so the most recent intent wins.
    if (agencyCode) {
      const safeCode = String(agencyCode).trim().toUpperCase();
      const agencyOwner = await User.findOne({
        "agencyProfile.agencyCode": safeCode,
        role: "creator",
        creatorStatus: "approved",
      }).select("_id").lean();
      if (agencyOwner) {
        user.pendingAgencyCode = safeCode;
      }
      // Silently ignore invalid codes
    }

    // If creator invite code is provided, validate it and set invitedByCreator + role to subCreator
    let invitedByCreator = user.invitedByCreator || null;
    if (creatorInvite && !invitedByCreator) {
      const safeInviteCode = String(creatorInvite).trim().toUpperCase();
      const inviterCreator = await User.findOne({
        creatorInviteCode: safeInviteCode,
        role: "creator",
        creatorStatus: "approved",
      }).select("_id");
      if (inviterCreator) {
        invitedByCreator = inviterCreator._id;
        user.invitedByCreator = invitedByCreator;
        user.role = "subCreator"; // Set role to subCreator
      }
      // Silently ignore invalid codes
    }

    await user.save();

    return res.json({
      ok: true,
      message: "Solicitud enviada correctamente. Un administrador la revisará pronto.",
      creatorStatus: user.creatorStatus,
    });
  } catch (err) {
    console.error("submitCreatorRequest error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// GET /api/creator/request-status — get current user's creator request status
exports.getCreatorRequestStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "role creatorStatus creatorApplication creatorApprovedAt"
    );
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    return res.json({
      ok: true,
      role: user.role,
      creatorStatus: user.creatorStatus,
      submittedAt: user.creatorApplication?.submittedAt || null,
      approvedAt: user.creatorApprovedAt || null,
    });
  } catch (err) {
    console.error("getCreatorRequestStatus error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// ── Stripe Connect ─────────────────────────────────────────────────────────

/**
 * POST /api/creator/payout/connect-onboarding
 * Creates a Stripe Connect Express account (if the creator doesn't have one yet)
 * and returns an onboarding URL so the creator can set up their payout details.
 */
exports.connectOnboarding = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "Pagos no configurados en este entorno." });
    }

    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);
    if (error) return res.status(403).json({ ok: false, message: error });

    let fullUser = await User.findById(user._id).select("email stripeAccountId stripeAccountStatus");
    if (!fullUser) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

    let accountId = fullUser.stripeAccountId;

    if (!accountId) {
      // Create a new Stripe Express connected account
      const account = await stripe.accounts.create({
        type: "express",
        email: fullUser.email,
        capabilities: { transfers: { requested: true } },
        metadata: { userId: String(user._id) },
      });
      accountId = account.id;
      await User.findByIdAndUpdate(user._id, {
        stripeAccountId: accountId,
        stripeAccountStatus: "pending",
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL}/creator/payout?connect=refresh`,
      return_url: `${process.env.FRONTEND_URL}/creator/payout?connect=success`,
      type: "account_onboarding",
    });

    res.json({ ok: true, url: accountLink.url });
  } catch (err) {
    console.error("connectOnboarding error:", err);
    res.status(500).json({ ok: false, message: "Error al iniciar el proceso de vinculación con Stripe." });
  }
};

/**
 * GET /api/creator/payout/connect-status
 * Returns whether the creator's Stripe Connect account is fully onboarded.
 */
exports.getConnectStatus = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "Pagos no configurados en este entorno." });
    }

    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);
    if (error) return res.status(403).json({ ok: false, message: error });

    const fullUser = await User.findById(user._id).select("stripeAccountId stripeAccountStatus").lean();
    if (!fullUser?.stripeAccountId) {
      return res.json({ ok: true, connected: false, status: null });
    }

    // Refresh status from Stripe (live check)
    const account = await stripe.accounts.retrieve(fullUser.stripeAccountId);
    const enabled = account.charges_enabled && account.payouts_enabled;
    const newStatus = enabled ? "enabled" : account.requirements?.currently_due?.length > 0 ? "restricted" : "pending";

    if (newStatus !== fullUser.stripeAccountStatus) {
      await User.findByIdAndUpdate(user._id, { stripeAccountStatus: newStatus });
    }

    res.json({ ok: true, connected: enabled, status: newStatus, accountId: fullUser.stripeAccountId });
  } catch (err) {
    console.error("getConnectStatus error:", err);
    res.status(500).json({ ok: false, message: "Error al verificar el estado de la cuenta de Stripe." });
  }
};

// Get creator's invite code for viral growth
exports.getCreatorInviteCode = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const { error, user } = await requireApprovedCreatorHelper(userId);

    if (error) {
      return res.status(403).json({ ok: false, message: error });
    }

    const fullUser = await User.findById(userId).select("creatorInviteCode");
    if (!fullUser.creatorInviteCode) {
      return res.json({
        ok: true,
        code: null,
        message: "No tienes código de invitación asignado aún. Contacta al soporte.",
      });
    }

    res.json({
      ok: true,
      code: fullUser.creatorInviteCode,
      inviteUrl: `${process.env.FRONTEND_URL || "https://meetyoulive.vercel.app"}/creator-request?creatorInvite=${fullUser.creatorInviteCode}`,
    });
  } catch (error) {
    console.error("[getCreatorInviteCode] Error:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};
