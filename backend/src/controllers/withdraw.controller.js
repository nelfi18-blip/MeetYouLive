const WithdrawalRequest = require("../models/WithdrawalRequest");
const User = require("../models/User");
const CoinTransaction = require("../models/CoinTransaction");

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

    // Get user
    const user = await User.findById(userId).select("earningsCoins role creatorStatus");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Check if user is an approved creator
    const isApprovedCreator = 
      (user.role === "creator" || user.role === "subCreator") && 
      user.creatorStatus === "approved";
    
    if (!isApprovedCreator) {
      return res.status(403).json({ message: "Solo creadores aprobados pueden solicitar retiros" });
    }

    // Check sufficient balance
    const availableCoins = user.earningsCoins || 0;
    if (availableCoins < amountCoins) {
      return res.status(400).json({
        message: "Saldo insuficiente",
        available: availableCoins,
        requested: amountCoins,
      });
    }

    // Check for existing pending/approved requests
    const existingRequest = await WithdrawalRequest.findOne({
      userId,
      status: { $in: ["pending", "approved"] },
    });

    if (existingRequest) {
      return res.status(400).json({
        message: "Ya tienes una solicitud de retiro pendiente",
      });
    }

    // Calculate USD amount
    const amountUSD = amountCoins / COINS_PER_USD;

    // Deduct coins from user's earnings balance
    user.earningsCoins -= amountCoins;
    await user.save();

    // Create coin transaction record
    await CoinTransaction.create({
      userId,
      type: "admin_adjustment",
      amount: -amountCoins,
      reason: "Retiro solicitado - monedas bloqueadas temporalmente",
      status: "completed",
      metadata: { withdrawalType: "request" },
    });

    // Create withdrawal request
    const withdrawalRequest = await WithdrawalRequest.create({
      userId,
      amountCoins,
      amountUSD,
      status: "pending",
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
 */
exports.approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await WithdrawalRequest.findById(id);
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

    return res.json({
      ok: true,
      message: "Solicitud aprobada exitosamente",
      request,
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

    const request = await WithdrawalRequest.findById(id);
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
        reason: "Retiro rechazado - monedas restauradas",
        status: "completed",
        metadata: { withdrawalId: request._id },
      });
    }

    // Update status to rejected
    request.status = "rejected";
    await request.save();

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
