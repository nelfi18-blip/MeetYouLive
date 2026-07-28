import test from "node:test";
import assert from "node:assert/strict";
import { getAdminUserEmailStatus } from "../lib/adminUsers.js";

test("local unverified user shows label and manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: "local", emailVerified: false });

  assert.equal(status.label, "Email sin verificar");
  assert.equal(status.canVerifyManually, true);
});

test("legacy user with explicit unverified email shows unverified label", () => {
  const status = getAdminUserEmailStatus({ authProvider: null, emailVerified: false });

  assert.equal(status.label, "Email sin verificar");
  assert.equal(status.canVerifyManually, true);
});

test("local verified user shows verified label without manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: "local", emailVerified: true });

  assert.equal(status.label, "Email verificado");
  assert.equal(status.canVerifyManually, false);
});

test("legacy user with explicit verified email shows verified label", () => {
  const status = getAdminUserEmailStatus({ authProvider: null, emailVerified: true });

  assert.equal(status.label, "Email verificado");
  assert.equal(status.canVerifyManually, false);
});

test("Google user shows Google label without manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: "google", emailVerified: true, isGoogleAccount: true });

  assert.equal(status.label, "Cuenta Google");
  assert.equal(status.canVerifyManually, false);
});

test("users without explicit emailVerified/provider are not treated as unverified by default", () => {
  const status = getAdminUserEmailStatus({});

  assert.equal(status.label, "Email sin estado");
  assert.equal(status.canVerifyManually, false);
});
