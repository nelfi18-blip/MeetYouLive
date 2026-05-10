const WithdrawalRequest = require("../models/WithdrawalRequest");
const User = require("../models/User");
const CoinTransaction = require("../models/CoinTransaction");
const { logStaffAction } = require("../services/audit.service");

// Minimum withdrawal amount in coins
const MIN_WITHDRAWAL_COINS = 1000;
// Conversion rate: 1 coin = $0.10 USD
const COINS_PER_USD = 10;

/**
 * POST /api/withdraw/request
 * Creator requests a withdrawal from their coin balance
 */
exports.requestWithdrawal = async (req, res) => {
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

    // Check for existing pending/approved requests first
    const existingRequest = await WithdrawalRequest.findOne({
      userId,
      status: { $in: ["pending", "approved"] },
    });

    if (existingRequest) {
      return res.status(400).json({
        message: "Ya tienes una solicitud de retiro pendiente",
      });
    }

    // Atomically deduct coins from user's earnings balance
    // This prevents race conditions and ensures sufficient funds
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
      }
    );

    // If user not found or insufficient balance
    if (!user) {
      const userCheck = await User.findById(userId).select("earningsCoins");
      if (!userCheck) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      return res.status(400).json({
        message: "Saldo insuficiente",
        available: userCheck.earningsCoins || 0,
        requested: amountCoins,
      });
    }

    // Calculate USD amount
    const amountUSD = amountCoins / COINS_PER_USD;

    // Create withdrawal request
    const withdrawalRequest = await WithdrawalRequest.create({
      userId,
      amountCoins,
      amountUSD,
      status: "pending",
    });

    // Create coin transaction record
    await CoinTransaction.create({
      userId,
      type: "admin_adjustment",
      amount: -amountCoins,
      reason: "Retiro solicitado - monedas bloqueadas temporalmente",
      status: "completed",
      metadata: { withdrawalType: "request", withdrawalId: withdrawalRequest._id },
    });

    return res.status(201).json({
      ok: true,
      message: "Solicitud de retiro creada exitosamente",
      request: withdrawalRequest,
    });
  } catch (error) {
    console.error("Error requesting withdrawal:", error);
    return res.status(500).json({ message: "Error al procesar solicitud de retiro" });
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
        reason: reason ? `Retiro rechazado - ${reason}` : "Retiro rechazado - monedas restauradas",
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
        reason: reason || "No reason provided",
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
        paymentMethod: paymentMethod || "manual",
        transactionId: transactionId || null,
        notes: notes || "",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    console.log("[withdraw] Payment marked as completed", {
      adminId: req.userId,
      withdrawalId: String(request._id),
      userId: String(request.userId),
      amountUSD: request.amountUSD,
      paymentMethod,
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
