"use strict";

const { deriveAppAccountToken, APPLE_ACCOUNT_TOKEN_NAMESPACE } = require("../appleAccountToken.service.js");

describe("appleAccountToken.service", () => {
  test("is a pure function: the same userId always yields the same UUID", () => {
    const a = deriveAppAccountToken("507f1f77bcf86cd799439011");
    const b = deriveAppAccountToken("507f1f77bcf86cd799439011");
    expect(a).toBe(b);
  });

  test("different user ids yield different UUIDs", () => {
    const a = deriveAppAccountToken("507f1f77bcf86cd799439011");
    const b = deriveAppAccountToken("507f1f77bcf86cd799439099");
    expect(a).not.toBe(b);
  });

  test("always returns a valid UUID string", () => {
    const token = deriveAppAccountToken("507f1f77bcf86cd799439011");
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test("throws when userId is missing (never silently derives a token for an unauthenticated caller)", () => {
    expect(() => deriveAppAccountToken(undefined)).toThrow();
    expect(() => deriveAppAccountToken(null)).toThrow();
    expect(() => deriveAppAccountToken("")).toThrow();
  });

  test("the derivation namespace stays byte-for-byte identical to the frontend's copy", () => {
    // frontend/lib/appleAccountToken.js MUST keep this exact constant so
    // both sides derive the same UUID for the same user id.
    expect(APPLE_ACCOUNT_TOKEN_NAMESPACE).toBe("7c7b6a9e-3e0a-4a0d-9d4e-9f7c6e9b6a21");
  });
});
