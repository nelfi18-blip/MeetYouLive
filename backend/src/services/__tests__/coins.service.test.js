jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const User = require("../../models/User.js");
const {
  MAX_USER_COINS_BALANCE,
  amountThatFits,
  fitsWithinCap,
  creditCoinsWithCap,
} = require("../coins.service.js");

function selectQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

describe("coins.service — scope isolation (earningsCoins must never be touched)", () => {
  test("creditCoinsWithCap only ever writes the `coins` field, never earningsCoins/agencyEarningsCoins/totalAgencyGeneratedCoins", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: 100 }));

    await creditCoinsWithCap("user-1", 50);

    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, updatePipeline] = User.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "user-1" });
    const serializedPipeline = JSON.stringify(updatePipeline);
    // The only field ever assigned by the pipeline must be `coins`.
    expect(updatePipeline).toHaveLength(1);
    expect(Object.keys(updatePipeline[0].$set)).toEqual(["coins"]);
    expect(serializedPipeline).not.toMatch(/earningsCoins/);
    expect(serializedPipeline).not.toMatch(/agencyEarningsCoins/);
    expect(serializedPipeline).not.toMatch(/totalAgencyGeneratedCoins/);
  });
});

describe("coins.service — MAX_USER_COINS_BALANCE", () => {
  test("is sized conservatively under the $2,000 USD Stripe requirement using the most expensive package rate ($0.0499/coin)", () => {
    expect(MAX_USER_COINS_BALANCE).toBe(40000);
    expect(MAX_USER_COINS_BALANCE * 0.0499).toBeLessThan(2000);
  });
});

describe("coins.service — amountThatFits / fitsWithinCap", () => {
  test("returns the full amount when comfortably under the cap", () => {
    expect(amountThatFits(0, 100)).toBe(100);
    expect(amountThatFits(39000, 500)).toBe(500);
    expect(fitsWithinCap(39000, 500)).toBe(true);
  });

  test("allows crediting exactly up to the cap", () => {
    expect(amountThatFits(39900, 100)).toBe(100);
    expect(fitsWithinCap(39900, 100)).toBe(true);
  });

  test("caps the creditable amount when it would exceed the max", () => {
    expect(amountThatFits(39950, 100)).toBe(50);
    expect(fitsWithinCap(39950, 100)).toBe(false);
  });

  test("returns 0 when already at or above the cap", () => {
    expect(amountThatFits(40000, 100)).toBe(0);
    expect(amountThatFits(45000, 100)).toBe(0);
    expect(fitsWithinCap(40000, 100)).toBe(false);
  });

  test("treats non-positive requested amounts as 0", () => {
    expect(amountThatFits(100, 0)).toBe(0);
    expect(amountThatFits(100, -50)).toBe(0);
  });
});

describe("coins.service — creditCoinsWithCap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("credits the full amount when comfortably under the cap", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: 100 }));

    const result = await creditCoinsWithCap("user-1", 250);

    expect(result).toEqual({
      userFound: true,
      requested: 250,
      credited: 250,
      capped: false,
      previousCoins: 100,
      newCoins: 350,
    });
  });

  test("credits exactly up to the cap when the balance is precisely at 40000 after crediting", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: 39900 }));

    const result = await creditCoinsWithCap("user-1", 100);

    expect(result.credited).toBe(100);
    expect(result.newCoins).toBe(40000);
    expect(result.capped).toBe(false);
  });

  test("caps the credited amount so the balance never exceeds 40000", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: 39950 }));

    const result = await creditCoinsWithCap("user-1", 250);

    expect(result.credited).toBe(50);
    expect(result.newCoins).toBe(40000);
    expect(result.capped).toBe(true);
  });

  test("credits 0 (and reports capped) when the wallet is already at the max", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: 40000 }));

    const result = await creditCoinsWithCap("user-1", 100);

    expect(result.credited).toBe(0);
    expect(result.newCoins).toBe(40000);
    expect(result.capped).toBe(true);
  });

  test("performs a single atomic findOneAndUpdate call (no separate pre-read), safe under concurrent purchases", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: 0 }));

    await creditCoinsWithCap("user-1", 100, { session: "fake-session" });

    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(User.findById).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "user-1" },
      expect.any(Array),
      expect.objectContaining({ new: false, session: "fake-session" })
    );
  });

  test("returns userFound=false when the user does not exist", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery(null));

    const result = await creditCoinsWithCap("missing-user", 100);

    expect(result).toEqual({
      userFound: false,
      requested: 100,
      credited: 0,
      capped: false,
      previousCoins: null,
      newCoins: null,
    });
  });

  test("does not touch the database for a non-positive amount", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue({ coins: 500 }) }),
    });

    const result = await creditCoinsWithCap("user-1", 0);

    expect(result.credited).toBe(0);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("coins.service — concurrent purchases never exceed the cap", () => {
  test("two 'simultaneous' credits of 30000 coins each on a 0-balance wallet never exceed 40000 in aggregate", async () => {
    // Simulate MongoDB's single-document atomicity: each call to
    // findOneAndUpdate observes the *result* of any previously applied
    // write, exactly like two real concurrent requests would be
    // serialized by the MongoDB storage engine on the same document.
    let coins = 0;
    User.findOneAndUpdate.mockImplementation(() => {
      const before = coins;
      const credited = Math.max(0, Math.min(30000, MAX_USER_COINS_BALANCE - before));
      coins = before + credited;
      return selectQuery({ coins: before });
    });

    const first = await creditCoinsWithCap("user-1", 30000);
    const second = await creditCoinsWithCap("user-1", 30000);

    expect(first.credited + second.credited).toBeLessThanOrEqual(MAX_USER_COINS_BALANCE);
    expect(coins).toBe(MAX_USER_COINS_BALANCE);
    expect(second.capped).toBe(true);
  });
});
