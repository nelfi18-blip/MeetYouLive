const WithdrawalRequest = require("../models/WithdrawalRequest");
const User = require("../models/User");
const CoinTransaction = require("../models/CoinTransaction");
const mongoose = require("mongoose");
const { logStaffAction } = require("../services/audit.service");

// Minimum withdrawal amount in coins
const MIN_WITHDRAWAL_COINS = 1000;
// Conversion rate: 1 coin = $0.10 USD
const COINS_PER_USD = 10;
// Minimum rejection reason length for audit trail
const MIN_REJECTION_REASON_LENGTH = 10;

/**
 * POST /api/withdraw/request
 * Creator requests a withdrawal from their coin balance
 */
exports.requestWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  let insufficientBalance = null;
  try {
    const userId = req.userId;
    const { amountCoins } = req.body;

    // Validate input
    if (!amountCoins || amountCoins < MIN_WITHDRAWAL_COINS) {
      return res.status(400).json({
        message: `El mínimo de retiro es ${MIN_WITHDRAWAL_COINS} monedas`,
        minRequired: MIN_WITHDRAWAL_COINS,
      });
    }

    // Calculate USD amount
    const amountUSD = amountCoins / COINS_PER_USD;
    let withdrawalRequest;

    await session.withTransaction(async () => {
      // Check for existing pending/approved requests inside the transaction.
      const existingRequest = await WithdrawalRequest.findOne({
        userId,
        status: { $in: ["pending", "approved"] },
      }).session(session);

      if (existingRequest) {
        throw Object.assign(new Error("Ya tienes una solicitud de retiro pendiente"), { status: 400 });
      }

      // Atomically deduct coins from user's earnings balance.
      const user = await User.findOneAndUpdate(
        {
          _id: userId,
          earningsCoins: { $gte: amountCoins },
        },
        {
          $inc: { earningsCoins: -amountCoins },
        },
        {
          new: true,
          select: "earningsCoins role creatorStatus",
          session,
        }
      );

      if (!user) {
        const userCheck = await User.findById(userId).select("earningsCoins").session(session);
        if (!userCheck) {
          throw Object.assign(new Error("Usuario no encontrado"), { status: 404 });
        }
        insufficientBalance = userCheck.earningsCoins || 0;
        throw Object.assign(new Error("Saldo insuficiente"), { status: 400 });
      }

      // Create withdrawal request
      const [createdRequest] = await WithdrawalRequest.create(
        [{
          userId,
          amountCoins,
          amountUSD,
          status: "pending",
        }],
        { session }
      );
      withdrawalRequest = createdRequest;

      // Create coin transaction record
      await CoinTransaction.create(
        [{
          userId,
          type: "admin_adjustment",
          amount: -amountCoins,
          reason: "Retiro solicitado - monedas bloqueadas temporalmente",
          status: "completed",
          metadata: { withdrawalType: "request", withdrawalId: withdrawalRequest._id },
        }],
        { session }
      );
    });

    return res.status(201).json({
      ok: true,
      message: "Solicitud de retiro creada exitosamente",
      request: withdrawalRequest,
    });
  } catch (error) {
    if (error.status === 400 && error.message === "Saldo insuficiente") {
      return res.status(400).json({
        message: "Saldo insuficiente",
        available: insufficientBalance,
        requested: req.body.amountCoins,
      });
    }
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: "Ya tienes una solicitud de retiro pendiente" });
    }
    console.error("Error requesting withdrawal:", error);
    return res.status(500).json({ message: "Error al procesar solicitud de retiro" });
  } finally {
    await session.endSession();
  }
};

/**
 * GET /api/admin/withdrawals
 * List all withdrawal requests (admin only)
 */
exports.listWithdrawals = async (req, res) => {
  try {
    const { status } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }

    const requests = await WithdrawalRequest.find(query)
      .populate("userId", "username name email avatar")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      requests,
      total: requests.length,
    });
  } catch (error) {
    console.error("Error listing withdrawals:", error);
    return res.status(500).json({ message: "Error al listar solicitudes de retiro" });
  }
};

/**
 * PATCH /api/admin/withdrawals/:id/approve
 * Approve a withdrawal request (admin only)
 * 
 * IMPORTANT: This is a MANUAL approval system.
 * Approval does NOT trigger automatic Stripe Connect payout.
 * Admin must manually process payment via external means.
 * Status "approved" means admin has reviewed and will manually send funds.
 * Future enhancement: integrate Stripe Connect for automatic payouts.
 */
exports.approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await WithdrawalRequest.findById(id).populate("userId", "username email");
    if (!request) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Solo se pueden aprobar solicitudes pendientes",
        currentStatus: request.status,
      });
    }

    // Update status to approved
    request.status = "approved";
    await request.save();

    // Log admin action for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "approve_withdrawal",
      targetType: "Payout",
      targetId: request._id,
      targetIdentifier: request.userId?.username || request.userId?.email || String(request.userId),
      details: {
        amountCoins: request.amountCoins,
        amountUSD: request.amountUSD,
        withdrawalId: String(request._id),
        previousStatus: "pending",
        newStatus: "approved",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[withdraw] Approval logged", {
      adminId: req.userId,
      withdrawalId: String(request._id),
      userId: String(request.userId),
      amountUSD: request.amountUSD,
    });

    return res.json({
      ok: true,
      message: "Solicitud aprobada exitosamente. Procesa el pago manualmente.",
      request,
      note: "MANUAL PAYOUT REQUIRED: This approval does not trigger automatic Stripe payment. Admin must manually send funds.",
    });
  } catch (error) {
    console.error("Error approving withdrawal:", error);
    return res.status(500).json({ message: "Error al aprobar solicitud de retiro" });
  }
};

/**
 * PATCH /api/admin/withdrawals/:id/reject
 * Reject a withdrawal request and restore coins (admin only)
 */
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Validate reason is provided and meaningful
    if (!reason || typeof reason !== "string" || reason.trim().length < MIN_REJECTION_REASON_LENGTH) {
      return res.status(400).json({
        message: `Razón de rechazo es requerida (mínimo ${MIN_REJECTION_REASON_LENGTH} caracteres)`,
      });
    }

    const request = await WithdrawalRequest.findById(id).populate("userId", "username email");
    if (!request) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Solo se pueden rechazar solicitudes pendientes",
        currentStatus: request.status,
      });
    }

    // Restore coins to user's earnings balance
    const user = await User.findById(request.userId);
    if (user) {
      user.earningsCoins = (user.earningsCoins || 0) + request.amountCoins;
      await user.save();

      // Create coin transaction record
      await CoinTransaction.create({
        userId: request.userId,
        type: "admin_adjustment",
        amount: request.amountCoins,
        reason: `Retiro rechazado - ${reason.trim()}`,
        status: "completed",
        metadata: { withdrawalId: request._id, withdrawalRejection: true },
      });
    }

    // Update status to rejected
    request.status = "rejected";
    await request.save();

    // Log admin action for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "reject_withdrawal",
      targetType: "Payout",
      targetId: request._id,
      targetIdentifier: request.userId?.username || request.userId?.email || String(request.userId),
      details: {
        amountCoins: request.amountCoins,
        amountUSD: request.amountUSD,
        withdrawalId: String(request._id),
        previousStatus: "pending",
        newStatus: "rejected",
        reason: reason.trim(),
        coinsRestored: true,
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[withdraw] Rejection logged", {
      adminId: req.userId,
      withdrawalId: String(request._id),
      userId: String(request.userId),
      amountCoins: request.amountCoins,
      reason,
    });

    return res.json({
      ok: true,
      message: "Solicitud rechazada y monedas restauradas",
      request,
    });
  } catch (error) {
    console.error("Error rejecting withdrawal:", error);
    return res.status(500).json({ message: "Error al rechazar solicitud de retiro" });
  }
};

/**
 * PATCH /api/admin/withdrawals/:id/mark-paid
 * Mark a withdrawal as paid after manual payment (admin only)
 * 
 * IMPORTANT: This endpoint should be called ONLY after admin has
 * manually sent funds to the creator via external payment method.
 */
exports.markWithdrawalPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod, transactionId, notes } = req.body;

    // Validate required fields for complete audit trail
    if (!paymentMethod || typeof paymentMethod !== "string" || !paymentMethod.trim()) {
      return res.status(400).json({
        message: "Método de pago es requerido (ej: 'PayPal', 'Wire Transfer', 'Zelle')",
      });
    }

    if (!transactionId || typeof transactionId !== "string" || !transactionId.trim()) {
      return res.status(400).json({
        message: "ID de transacción es requerido para verificación",
      });
    }

    const request = await WithdrawalRequest.findById(id).populate("userId", "username email");
    if (!request) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }

    if (request.status !== "approved") {
      return res.status(400).json({
        message: "Solo se pueden marcar como pagadas las solicitudes aprobadas",
        currentStatus: request.status,
      });
    }

    // Update status to paid
    request.status = "paid";
    await request.save();

    // Log admin action for audit trail
    await logStaffAction({
      staffId: req.userId,
      staffRole: "admin",
      action: "mark_withdrawal_paid",
      targetType: "Payout",
      targetId: request._id,
      targetIdentifier: request.userId?.username || request.userId?.email || String(request.userId),
      details: {
        amountCoins: request.amountCoins,
        amountUSD: request.amountUSD,
        withdrawalId: String(request._id),
        previousStatus: "approved",
        newStatus: "paid",
        paymentMethod: paymentMethod.trim(),
        transactionId: transactionId.trim(),
        notes: notes ? notes.trim() : "",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[withdraw] Payment marked as completed", {
      adminId: req.userId,
      withdrawalId: String(request._id),
      userId: String(request.userId),
      amountUSD: request.amountUSD,
      paymentMethod: paymentMethod.trim(),
      transactionId: transactionId.trim(),
    });

    return res.json({
      ok: true,
      message: "Solicitud marcada como pagada",
      request,
    });
  } catch (error) {
    console.error("Error marking withdrawal as paid:", error);
    return res.status(500).json({ message: "Error al marcar solicitud como pagada" });
  }
};
