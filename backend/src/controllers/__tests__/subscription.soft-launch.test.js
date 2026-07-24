const {
  createSubscriptionSession,
  createTierSubscriptionSession,
  getVipTiers,
} = require("../subscription.controller.js");

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("subscription soft launch guard", () => {
  const originalEnableVipCheckout = process.env.ENABLE_VIP_CHECKOUT;

  afterEach(() => {
    if (originalEnableVipCheckout === undefined) {
      delete process.env.ENABLE_VIP_CHECKOUT;
    } else {
      process.env.ENABLE_VIP_CHECKOUT = originalEnableVipCheckout;
    }
    delete process.env.STRIPE_VIP_SILVER_PRICE_ID;
  });

  test("blocks legacy Premium checkout unless VIP checkout is explicitly enabled", async () => {
    delete process.env.ENABLE_VIP_CHECKOUT;
    const res = createRes();

    await createSubscriptionSession({ userId: "user_123" }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("VIP is coming soon"),
    }));
  });

  test("blocks tier checkout unless VIP checkout is explicitly enabled", async () => {
    delete process.env.ENABLE_VIP_CHECKOUT;
    const res = createRes();

    await createTierSubscriptionSession({ body: { tier: "silver" }, userId: "user_123" }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("soft launch"),
    }));
  });

  test("returns VIP tiers as unavailable during soft launch", () => {
    delete process.env.ENABLE_VIP_CHECKOUT;
    process.env.STRIPE_VIP_SILVER_PRICE_ID = "price_silver";
    const res = createRes();

    getVipTiers({}, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      tiers: expect.arrayContaining([
        expect.objectContaining({ id: "silver", available: false }),
      ]),
    }));
  });
});
