import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveAppAccountToken } from "../lib/appleAccountToken.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("deriveAppAccountToken is a pure function of the user id", () => {
  const a = deriveAppAccountToken("507f1f77bcf86cd799439011");
  const b = deriveAppAccountToken("507f1f77bcf86cd799439011");
  assert.equal(a, b);
});

test("different user ids yield different tokens", () => {
  const a = deriveAppAccountToken("507f1f77bcf86cd799439011");
  const b = deriveAppAccountToken("507f1f77bcf86cd799439099");
  assert.notEqual(a, b);
});

test("always returns a valid UUID string", () => {
  const token = deriveAppAccountToken("507f1f77bcf86cd799439011");
  assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("throws rather than silently deriving a token for a missing user id", () => {
  assert.throws(() => deriveAppAccountToken(undefined));
  assert.throws(() => deriveAppAccountToken(null));
  assert.throws(() => deriveAppAccountToken(""));
});

test("coins page resolves identity before launching Apple IAP and derives the appAccountToken client-side", async () => {
  const src = await readFile(join(__dirname, "../app/coins/page.jsx"), "utf8");
  const start = src.indexOf("const buyWithApple");
  const body = src.slice(start, src.indexOf("const buy = async", start));
  assert.ok(!body.includes("session?.user?.id"));
  const resolveIdx = body.indexOf("resolveGooglePlayAccountId(");
  const purchaseIdx = body.indexOf("purchaseCoinPackageWithApple(");
  assert.ok(resolveIdx >= 0 && resolveIdx < purchaseIdx);
  assert.ok(body.includes('t("coins.authError")'));
  assert.ok(body.includes('t("coins.connectionError")'));
  assert.match(body, /purchaseCoinPackageWithApple\(pkg, accountId\)/);
});

test("coins page routes iOS native billing to Apple IAP before falling back to the blocked native-store message", async () => {
  const src = await readFile(join(__dirname, "../app/coins/page.jsx"), "utf8");
  const start = src.indexOf("const buy = async (pkg) => {");
  const body = src.slice(start, start + 600);
  const androidIdx = body.indexOf("isAndroidNativeBillingAvailable()");
  const iosIdx = body.indexOf("isIOSNativeBillingAvailable()");
  const blockedIdx = body.indexOf("shouldUseNativeStorePayments()");
  assert.ok(androidIdx >= 0 && iosIdx > androidIdx && blockedIdx > iosIdx);
});
