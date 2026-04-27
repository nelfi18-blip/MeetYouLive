"use strict";

/**
 * VIP subscription tier definitions.
 *
 * Stripe Price IDs are resolved from environment variables so the same
 * code works in both test and production environments.
 *
 * Tiers:
 *   silver   — $4.99/month
 *   gold     — $9.99/month
 *   platinum — $19.99/month
 */

const VIP_TIERS = {
  silver: {
    id: "silver",
    name: "VIP Silver",
    priceUsd: 4.99,
    stripePriceIdEnvKey: "STRIPE_VIP_SILVER_PRICE_ID",
    bonusCoinsPerMonth: 50,
    perks: [
      "Sin anuncios",
      "Insignia de perfil Silver",
      "50 monedas de bono por mes",
    ],
    badge: "🥈",
    color: "#c0c0c0",
  },
  gold: {
    id: "gold",
    name: "VIP Gold",
    priceUsd: 9.99,
    stripePriceIdEnvKey: "STRIPE_VIP_GOLD_PRICE_ID",
    bonusCoinsPerMonth: 150,
    perks: [
      "Sin anuncios",
      "Insignia de perfil Gold",
      "150 monedas de bono por mes",
      "Matching prioritario",
      "Stickers exclusivos",
    ],
    badge: "🥇",
    color: "#ffd700",
  },
  platinum: {
    id: "platinum",
    name: "VIP Platinum",
    priceUsd: 19.99,
    stripePriceIdEnvKey: "STRIPE_VIP_PLATINUM_PRICE_ID",
    bonusCoinsPerMonth: 500,
    perks: [
      "Sin anuncios",
      "Insignia verificada",
      "500 monedas de bono por mes",
      "Matching prioritario",
      "Soporte prioritario",
      "Entrada gratuita a salas",
      "Stickers exclusivos Premium",
    ],
    badge: "💎",
    color: "#e5e4e2",
  },
};

const TIER_IDS = Object.keys(VIP_TIERS);

/**
 * Returns the Stripe Price ID for the given tier by reading the corresponding
 * environment variable. Falls back to null if not configured.
 *
 * @param {string} tierId
 * @returns {string|null}
 */
function getStripePriceId(tierId) {
  const tier = VIP_TIERS[tierId];
  if (!tier) return null;
  return process.env[tier.stripePriceIdEnvKey] || null;
}

module.exports = { VIP_TIERS, TIER_IDS, getStripePriceId };
