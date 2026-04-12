const mongoose = require("mongoose");
const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");

const INVITER_REWARD = 50;
const INVITED_REWARD = 20;

/**
 * GET /api/referral/me
 * Returns the authenticated user's referral info.
 */
const getMyReferral = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("referralCode referralCount referralRewardsEarned referralRewardClaimed referredBy onboardingComplete loginCount")
      .lean();
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const canClaim =
      !user.referralRewardClaimed &&
      Boolean(user.referredBy) &&
      (user.onboardingComplete || (user.loginCount || 0) >= 2);

    res.json({
      referralCode: user.referralCode || null,
      referralCount: user.referralCount || 0,
      referralRewardsEarned: user.referralRewardsEarned || 0,
      referralRewardClaimed: user.referralRewardClaimed || false,
      canClaim,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/referral/claim
 * Claim the referral reward for the invited user.
 * Conditions: profile complete (onboardingComplete) OR loginCount >= 2.
 * Rewards: inviter +50 coins, invited +20 coins. One-time only.
 */
const claimReferral = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const invited = await User.findById(req.userId)
      .select("referredBy referralRewardClaimed onboardingComplete loginCount coins")
      .session(session);
    if (!invited) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!invited.referredBy) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "No fuiste referido por nadie" });
    }

    if (invited.referralRewardClaimed) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({ message: "Ya has reclamado tu recompensa de referido" });
    }

    const conditionMet = invited.onboardingComplete || (invited.loginCount || 0) >= 2;
    if (!conditionMet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Completa tu perfil o inicia sesión al menos 2 veces para reclamar tu recompensa",
      });
    }

    // Credit invited user
    invited.coins += INVITED_REWARD;
    invited.referralRewardClaimed = true;
    await invited.save({ session });

    await CoinTransaction.create(
      [
        {
          userId: invited._id,
          type: "referral_reward",
          amount: INVITED_REWARD,
          reason: "Recompensa por ser referido",
          status: "completed",
          metadata: { referredBy: invited.referredBy },
        },
      ],
      { session }
    );

    // Credit inviter
    const inviter = await User.findById(invited.referredBy)
      .select("coins referralCount referralRewardsEarned")
      .session(session);

    if (inviter) {
      inviter.coins += INVITER_REWARD;
      inviter.referralCount = (inviter.referralCount || 0) + 1;
      inviter.referralRewardsEarned = (inviter.referralRewardsEarned || 0) + INVITER_REWARD;
      await inviter.save({ session });

      await CoinTransaction.create(
        [
          {
            userId: inviter._id,
            type: "referral_reward",
            amount: INVITER_REWARD,
            reason: "Recompensa por referir a un amigo",
            status: "completed",
            metadata: { invitedUserId: invited._id },
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "¡Recompensa reclamada! Has recibido monedas por unirte con un código de referido.",
      coinsAwarded: INVITED_REWARD,
      newBalance: invited.coins,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getMyReferral, claimReferral };
