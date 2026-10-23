"use strict";

const { getMonthlyFinancialReportHandler } = require("../adminFinancialReport.controller.js");
const {
  getMonthlyFinancialReport,
  FinancialReportValidationError,
} = require("../../services/adminMonthlyFinancialReport.service.js");

jest.mock("../../services/adminMonthlyFinancialReport.service.js", () => {
  const actual = jest.requireActual("../../services/adminMonthlyFinancialReport.service.js");
  return {
    ...actual,
    getMonthlyFinancialReport: jest.fn(),
  };
});

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

describe("adminFinancialReport.controller", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 200 with the service result on success", async () => {
    getMonthlyFinancialReport.mockResolvedValue({ ok: true, complete: true });
    const req = { query: { year: "2024", month: "1" } };
    const res = makeRes();

    await getMonthlyFinancialReportHandler(req, res);

    expect(getMonthlyFinancialReport).toHaveBeenCalledWith(
      expect.objectContaining({ year: "2024", month: "1" })
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("returns 503 with explicit state when Stripe is not configured", async () => {
    getMonthlyFinancialReport.mockResolvedValue({
      ok: false,
      complete: false,
      stripeConfigured: false,
      message: "Stripe no está configurado",
    });
    const req = { query: { year: "2024", month: "1" } };
    const res = makeRes();

    await getMonthlyFinancialReportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });

  test("returns 400 for validation errors (e.g. invalid month)", async () => {
    getMonthlyFinancialReport.mockRejectedValue(new FinancialReportValidationError("month inválido"));
    const req = { query: { year: "2024", month: "13" } };
    const res = makeRes();

    await getMonthlyFinancialReportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, message: "month inválido" }));
  });

  test("returns 500 on unexpected errors", async () => {
    getMonthlyFinancialReport.mockRejectedValue(new Error("boom"));
    const req = { query: { year: "2024", month: "1" } };
    const res = makeRes();

    await getMonthlyFinancialReportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
