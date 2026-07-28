import test from "node:test";
import assert from "node:assert/strict";
import {
  canAdminVerifyEmail,
  getEmailStatusLabel,
} from "../lib/adminUsersEmailStatus.js";

test("local no verificado muestra etiqueta y botón", () => {
  const user = { authProvider: "local", emailVerified: false, role: "user" };

  assert.equal(getEmailStatusLabel(user), "Email sin verificar");
  assert.equal(canAdminVerifyEmail(user), true);
});

test("local verificado muestra Email verificado sin botón", () => {
  const user = { authProvider: "local", emailVerified: true, role: "user" };

  assert.equal(getEmailStatusLabel(user), "Email verificado");
  assert.equal(canAdminVerifyEmail(user), false);
});

test("Google muestra Cuenta Google sin botón", () => {
  const user = { authProvider: "google", emailVerified: true, role: "user" };

  assert.equal(getEmailStatusLabel(user), "Cuenta Google");
  assert.equal(canAdminVerifyEmail(user), false);
});

test("usuarios sin emailVerified no aparecen por defecto como no verificados", () => {
  const user = { authProvider: "local", role: "user" };

  assert.equal(getEmailStatusLabel(user), "Email pendiente de diagnóstico");
  assert.equal(canAdminVerifyEmail(user), false);
});
