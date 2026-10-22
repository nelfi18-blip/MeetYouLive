"use strict";

const {
  getCoinReconciliation,
} = require("../adminReconciliation.controller.js");
const {
  reconcileCoinPurchases,
  ReconciliationValidationError,
} = require("../../services/stripeReconciliation.service.js");

jest.mock("../../services/stripeReconciliation.service.js", () => {
  const actual = jest.requireActual("../../services/stripeReconciliation.service.js");
  return {
    ...actual,
    reconcileCoinPurchases: jest.fn(),
  };
});

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

describe("adminReconciliation.controller", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 200 with the service result on success", async () => {
    reconcileCoinPurchases.mockResolvedValue({ ok: true, complete: true, results: {} });
    const req = { query: { startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" } };
    const res = makeRes();

    await getCoinReconciliation(req, res);

    expect(reconcileCoinPurchases).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" })
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("returns 503 with explicit state when Stripe is not configured", async () => {
    reconcileCoinPurchases.mockResolvedValue({
      ok: false,
      complete: false,
      stripeConfigured: false,
      message: "Stripe no está configurado",
    });
    const req = { query: { startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" } };
    const res = makeRes();

    await getCoinReconciliation(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, stripeConfigured: false }));
  });

  test("returns 400 for validation errors (never falls through to a fake 200)", async () => {
    reconcileCoinPurchases.mockRejectedValue(new ReconciliationValidationError("endDate debe ser posterior a startDate"));
    const req = { query: { startDate: "2024-02-01T00:00:00.000Z", endDate: "2024-01-01T00:00:00.000Z" } };
    const res = makeRes();

    await getCoinReconciliation(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  test("returns 500 on unexpected errors", async () => {
    reconcileCoinPurchases.mockRejectedValue(new Error("boom"));
    const req = { query: { startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" } };
    const res = makeRes();

    await getCoinReconciliation(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
