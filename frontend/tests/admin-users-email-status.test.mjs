import test from "node:test";
import assert from "node:assert/strict";
import { getAdminUserEmailStatus } from "../lib/adminUsers.js";

test("local unverified user shows label and manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: "local", emailVerified: false });

  assert.equal(status.label, "Email sin verificar");
  assert.equal(status.canVerifyManually, true);
});

test("local Gmail unverified user shows manual verification action before verification", () => {
  const status = getAdminUserEmailStatus({
    email: "local-person@gmail.com",
    authProvider: "local",
    emailVerified: false,
  });

  assert.equal(status.label, "Email sin verificar");
  assert.equal(status.canVerifyManually, true);
});

test("local Gmail verified user hides manual verification action after verification", () => {
  const status = getAdminUserEmailStatus({
    email: "local-person@gmail.com",
    authProvider: "local",
    emailVerified: true,
  });

  assert.equal(status.label, "Email verificado");
  assert.equal(status.canVerifyManually, false);
});

test("Google current user does not show manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: "google", googleId: "google-1", emailVerified: false });

  assert.equal(status.label, "Cuenta Google");
  assert.equal(status.canVerifyManually, false);
});

test("safely identified legacy Google user does not show manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: null, googleId: "google-legacy", emailVerified: false });

  assert.equal(status.label, "Cuenta Google");
  assert.equal(status.canVerifyManually, false);
});

test("historical Google user identified from persisted creation metadata does not show manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: null, isGoogleAccount: true, emailVerified: false });

  assert.equal(status.label, "Cuenta Google");
  assert.equal(status.canVerifyManually, false);
});

test("ambiguous user with explicit unverified email shows no information and no action", () => {
  const status = getAdminUserEmailStatus({ authProvider: null, emailVerified: false });

  assert.equal(status.label, "Sin información");
  assert.equal(status.canVerifyManually, false);
});

test("local verified user shows verified label without manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: "local", emailVerified: true });

  assert.equal(status.label, "Email verificado");
  assert.equal(status.canVerifyManually, false);
});

test("ambiguous user with explicit verified email shows no information", () => {
  const status = getAdminUserEmailStatus({ authProvider: null, emailVerified: true });

  assert.equal(status.label, "Sin información");
  assert.equal(status.canVerifyManually, false);
});

test("Google user shows Google label without manual verification action", () => {
  const status = getAdminUserEmailStatus({ authProvider: "google", emailVerified: true, isGoogleAccount: true });

  assert.equal(status.label, "Cuenta Google");
  assert.equal(status.canVerifyManually, false);
});

test("admin user shows administrative account without manual verification action", () => {
  const status = getAdminUserEmailStatus({ role: "admin", authProvider: "local", emailVerified: false });

  assert.equal(status.label, "Administrador");
  assert.equal(status.canVerifyManually, false);
});

test("users without explicit emailVerified/provider are not treated as unverified by default", () => {
  const status = getAdminUserEmailStatus({});

  assert.equal(status.label, "Sin información");
  assert.equal(status.canVerifyManually, false);
});
