"use strict";

const express = require("express");
const request = require("supertest");

const userId = "507f1f77bcf86cd799439011";
const adminId = "507f1f77bcf86cd799439099";

// verifyToken is mocked (no real JWT/DB round-trip needed for a route-wiring
// test), but blockAdminSocialAccess is the REAL middleware from
// auth.middleware.js — this test exists specifically to prove the actual
// existing admin-exclusion rule is wired into the Random routes, not a
// reimplementation of it.
jest.mock("../../middlewares/auth.middleware.js", () => {
  const actual = jest.requireActual("../../middlewares/auth.middleware.js");
  return {
    ...actual,
    verifyToken: (req, _res, next) => {
      const role = req.headers["x-test-role"] || "user";
      req.userId = role === "admin" ? adminId : userId;
      req.userRole = role;
      next();
    },
  };
});

jest.mock("../../controllers/random.controller.js", () => ({
  join: jest.fn((req, res) => res.json({ ok: true, status: "waiting" })),
  status: jest.fn((req, res) => res.json({ ok: true, status: "idle" })),
  leave: jest.fn((req, res) => res.json({ ok: true, status: "idle" })),
  next: jest.fn((req, res) => res.json({ ok: true, status: "waiting" })),
}));

const randomController = require("../../controllers/random.controller.js");
const randomRoutes = require("../random.routes.js");

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/random", randomRoutes);
  return app;
};

describe("random.routes admin exclusion (blockAdminSocialAccess)", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  test.each([
    ["POST", "/api/random/join", randomController.join],
    ["GET", "/api/random/status", randomController.status],
    ["POST", "/api/random/leave", randomController.leave],
    ["POST", "/api/random/next", randomController.next],
  ])("%s %s reaches the controller for a normal authenticated user", async (method, url, controllerFn) => {
    const res = await request(app)[method.toLowerCase()](url).set("x-test-role", "user");

    expect(res.status).toBe(200);
    expect(controllerFn).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["POST", "/api/random/join", randomController.join],
    ["GET", "/api/random/status", randomController.status],
    ["POST", "/api/random/leave", randomController.leave],
    ["POST", "/api/random/next", randomController.next],
  ])("%s %s returns 403 for role=admin and never reaches the controller/service", async (method, url, controllerFn) => {
    const res = await request(app)[method.toLowerCase()](url).set("x-test-role", "admin");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Los administradores deben usar el panel /admin" });
    expect(controllerFn).not.toHaveBeenCalled();
  });

  test("routes still require verifyToken (401 without a valid session)", async () => {
    // Re-mock verifyToken for just this test to simulate a rejected/missing token,
    // matching how the real verifyToken behaves for unauthenticated requests.
    jest.resetModules();
    jest.doMock("../../middlewares/auth.middleware.js", () => {
      const actual = jest.requireActual("../../middlewares/auth.middleware.js");
      return {
        ...actual,
        verifyToken: (req, res) => res.status(401).json({ message: "Token requerido" }),
      };
    });
    jest.doMock("../../controllers/random.controller.js", () => ({
      join: jest.fn((req, res) => res.json({ ok: true, status: "waiting" })),
      status: jest.fn((req, res) => res.json({ ok: true, status: "idle" })),
      leave: jest.fn((req, res) => res.json({ ok: true, status: "idle" })),
      next: jest.fn((req, res) => res.json({ ok: true, status: "waiting" })),
    }));

    const freshControllers = require("../../controllers/random.controller.js");
    const freshRoutes = require("../random.routes.js");
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use("/api/random", freshRoutes);

    const res = await request(freshApp).post("/api/random/join").send({});

    expect(res.status).toBe(401);
    expect(freshControllers.join).not.toHaveBeenCalled();
  });
});
