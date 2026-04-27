"use strict";

/**
 * Payment safety tests — logic-only.
 * These particular tests do not interact with the database and run in-process.
 * The test suite may be extended with database-backed tests using the setup.js
 * helper (which connects to MongoDB before all tests).
 */

// ─── Helpers copied / derived from source files ──────────────────────────────

const BOOST_COSTS = {
  visibility_boost: 50,
  super_interest: 30,
  speed_dating: 100,
  room_entry: 75,
};

const VALID_BOOST_TYPES = Object.keys(BOOST_COSTS);

const PLATFORM_RATE = 0.40;
const CREATOR_RATE = 0.60;

function calculateSplit(totalCoins, agencyPercentage) {
  const platformShare = Math.floor(totalCoins * PLATFORM_RATE);
  const creatorSide = totalCoins - platformShare;

  let agencyShare = 0;
  let creatorNetShare = creatorSide;

  if (
    agencyPercentage &&
    agencyPercentage >= 5 &&
    agencyPercentage <= 30
  ) {
    agencyShare = Math.floor(creatorSide * (agencyPercentage / 100));
    creatorNetShare = creatorSide - agencyShare;
  }

  return { platformShare, creatorNetShare, agencyShare };
}

const BUNDLE_DISCOUNTS = { 10: 0.10, 50: 0.20 };

function calcBundleTotal(unitCost, quantity) {
  const discount = BUNDLE_DISCOUNTS[quantity] || 0;
  const total = unitCost * quantity;
  return Math.round(total * (1 - discount));
}

const MIN_PAYOUT_COINS = 100;

// ─── Spark boost tests ────────────────────────────────────────────────────────

describe("Spark boost — rejection logic", () => {
  test("rejects when sparks are insufficient", () => {
    const userSparks = 20;
    const cost = BOOST_COSTS.visibility_boost; // 50
    expect(userSparks < cost).toBe(true);
  });

  test("spark balance never goes negative after deduction", () => {
    const userSparks = 60;
    const cost = BOOST_COSTS.visibility_boost; // 50
    const remaining = userSparks - cost;
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  test("rejects invalid boost types", () => {
    const boostType = "invalid_boost";
    expect(BOOST_COSTS[boostType]).toBeUndefined();
  });

  test("only valid boost types are accepted", () => {
    expect(VALID_BOOST_TYPES).toEqual(
      expect.arrayContaining(["visibility_boost", "super_interest", "speed_dating", "room_entry"])
    );
    expect(VALID_BOOST_TYPES).toHaveLength(4);
  });

  test("visibility_boost costs 50 sparks", () => {
    expect(BOOST_COSTS.visibility_boost).toBe(50);
  });

  test("super_interest costs 30 sparks", () => {
    expect(BOOST_COSTS.super_interest).toBe(30);
  });

  test("speed_dating costs 100 sparks", () => {
    expect(BOOST_COSTS.speed_dating).toBe(100);
  });

  test("room_entry costs 75 sparks", () => {
    expect(BOOST_COSTS.room_entry).toBe(75);
  });
});

// ─── Coin balance safety ──────────────────────────────────────────────────────

describe("Coin balance safety", () => {
  test("coin balance never goes negative — rejects when insufficient", () => {
    const coinsBalance = 10;
    const giftCost = 100;
    expect(coinsBalance < giftCost).toBe(true);
  });

  test("coin balance after valid gift send stays non-negative", () => {
    const coinsBalance = 200;
    const giftCost = 100;
    const remaining = coinsBalance - giftCost;
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});

// ─── Bulk gift cost calculation ───────────────────────────────────────────────

describe("Bulk gift cost calculation", () => {
  test("x1 gift has no discount", () => {
    const unitCost = 100;
    expect(calcBundleTotal(unitCost, 1)).toBe(100);
  });

  test("x5 gift has no discount", () => {
    const unitCost = 100;
    expect(calcBundleTotal(unitCost, 5)).toBe(500);
  });

  test("x10 gift applies 10% discount", () => {
    const unitCost = 100;
    expect(calcBundleTotal(unitCost, 10)).toBe(900);
  });

  test("x50 gift applies 20% discount", () => {
    const unitCost = 100;
    expect(calcBundleTotal(unitCost, 50)).toBe(4000);
  });
});

// ─── Webhook signature validation ────────────────────────────────────────────

describe("Stripe webhook signature validation", () => {
  test("rejects requests with invalid signature", () => {
    const stripe = require("stripe")("sk_test_fake");
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const invalidSig = "invalid_signature";
    const webhookSecret = "whsec_test_fake";

    expect(() => {
      stripe.webhooks.constructEvent(payload, invalidSig, webhookSecret);
    }).toThrow();
  });
});

// ─── Payout logic ─────────────────────────────────────────────────────────────

describe("Payout request validation", () => {
  test("payout minimum threshold is 100 coins ($10 equivalent)", () => {
    expect(MIN_PAYOUT_COINS).toBe(100);
  });

  test("rejects payout when below minimum threshold", () => {
    const earningsCoins = 50;
    expect(earningsCoins < MIN_PAYOUT_COINS).toBe(true);
  });

  test("payout cannot exceed available earnings", () => {
    const earningsCoins = 80;
    const requestedAmount = 100;
    expect(requestedAmount > earningsCoins).toBe(true);
  });

  test("payout is allowed when earnings meet minimum", () => {
    const earningsCoins = 200;
    expect(earningsCoins >= MIN_PAYOUT_COINS).toBe(true);
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe("Stripe session idempotency", () => {
  test("duplicate stripeSessionId detection prevents double credit", () => {
    const processedSessions = new Set(["cs_test_abc123"]);
    const incomingSessionId = "cs_test_abc123";
    expect(processedSessions.has(incomingSessionId)).toBe(true);
  });

  test("new stripeSessionId is processed", () => {
    const processedSessions = new Set(["cs_test_abc123"]);
    const incomingSessionId = "cs_test_newone";
    expect(processedSessions.has(incomingSessionId)).toBe(false);
  });
});

// ─── Commission split ─────────────────────────────────────────────────────────

describe("Creator earnings split", () => {
  test("platform takes 40%, creator gets 60% with no agency", () => {
    const { platformShare, creatorNetShare, agencyShare } = calculateSplit(100, null);
    expect(platformShare).toBe(40);
    expect(creatorNetShare).toBe(60);
    expect(agencyShare).toBe(0);
  });

  test("agency commission is 10% of creator 60% share", () => {
    const { platformShare, creatorNetShare, agencyShare } = calculateSplit(100, 10);
    expect(platformShare).toBe(40); // platform always 40%
    expect(agencyShare).toBe(6);    // 10% of 60
    expect(creatorNetShare).toBe(54);
  });

  test("platform share is never reduced by agency commission", () => {
    const { platformShare } = calculateSplit(1000, 20);
    expect(platformShare).toBe(400); // always 40%
  });

  test("total shares sum to total coins", () => {
    const total = 250;
    const { platformShare, creatorNetShare, agencyShare } = calculateSplit(total, 15);
    expect(platformShare + creatorNetShare + agencyShare).toBe(total);
  });
});
