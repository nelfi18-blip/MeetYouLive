import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isValidPaypalEmail } from "../lib/payoutValidation.js";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("isValidPaypalEmail accepts well-formed emails and rejects everything else", () => {
  assert.equal(isValidPaypalEmail("creator@example.com"), true);
  assert.equal(isValidPaypalEmail("  creator@example.com  "), true);
  assert.equal(isValidPaypalEmail("first.last+tag@sub.example.com"), true);

  assert.equal(isValidPaypalEmail(""), false);
  assert.equal(isValidPaypalEmail("   "), false);
  assert.equal(isValidPaypalEmail("not-an-email"), false);
  assert.equal(isValidPaypalEmail("missing-domain@"), false);
  assert.equal(isValidPaypalEmail("@missing-local.com"), false);
  assert.equal(isValidPaypalEmail("no-at-sign.example.com"), false);
  assert.equal(isValidPaypalEmail(null), false);
  assert.equal(isValidPaypalEmail(undefined), false);
});

test("/creator payout flow always sends an explicit paypal method + the saved destination email, never an implicit default", async () => {
  const source = await readSource("../app/creator/page.jsx");

  // The request body must explicitly name "paypal" and reuse the PayPal
  // email already saved on the payout profile — it is never retyped or
  // substituted from this modal.
  assert.match(
    source,
    /body:\s*JSON\.stringify\(\{\s*method:\s*"paypal",\s*paymentDetails:\s*savedEmail\s*\}\)/
  );
  // Confirming is gated behind validating the SAVED profile email, not a
  // user-editable field.
  assert.match(source, /isValidPaypalEmail\(savedEmail\)/);
  assert.match(source, /import \{ isValidPaypalEmail \} from "@\/lib\/payoutValidation"/);
});

test("/creator payout request reuses a stable Idempotency-Key across retries of the same attempt, and resets it on success/cancel", async () => {
  const source = await readSource("../app/creator/page.jsx");

  assert.match(source, /"Idempotency-Key":\s*payoutIdempotencyKeyRef\.current/);
  // A fresh key is only minted when none is pending yet (first attempt, or
  // after a reset) — never unconditionally on every click.
  assert.match(source, /if \(!payoutIdempotencyKeyRef\.current\) \{/);
  // Resets happen on cancel and after a successful request — each marks
  // the NEXT attempt as a new request. There is no "edit destination"
  // reset anymore: the destination can't be edited from this modal.
  const resets = source.match(/payoutIdempotencyKeyRef\.current = null;/g) || [];
  assert.ok(resets.length >= 2, `expected at least 2 idempotency-key resets, found ${resets.length}`);
  // On a failed attempt the key must be KEPT (no reset in the catch block)
  // so a retry with the same email is recognized as a replay.
  assert.match(
    source,
    /catch \(err\) \{\s*setPayoutError\(err\.message \|\| t\("creatorPage\.payoutProcessError"\)\);\s*\/\/ Keep the idempotency key/
  );
});

test("/creator renders a read-only PayPal destination modal gated on isApproved via openPayoutModal, with no editable email field", async () => {
  const source = await readSource("../app/creator/page.jsx");

  assert.match(source, /onRequestPayout=\{isApproved \? openPayoutModal : null\}/);
  assert.match(source, /onRequestPayout=\{openPayoutModal\}/);
  assert.match(source, /payoutModalOpen \?/);
  assert.match(source, /payoutPaypalEmailInvalid/);
  assert.doesNotMatch(source, /onRequestPayout=\{handleRequestPayout\}/);
  // The destination is displayed read-only (masked), never as an editable
  // input, and links to "Mi cuenta de cobros" for changes.
  assert.doesNotMatch(source, /id="payout-paypal-email"/);
  assert.doesNotMatch(source, /handlePaypalEmailChange/);
  assert.match(source, /payoutProfile\?\.destination\?\.maskedPaypalEmail/);
  assert.match(source, /href="#payout-profile"/);
  assert.match(source, /payoutPaypalChangeDestinationLink/);
});

test("/dashboard/creator no longer posts payout/withdrawal requests itself and redirects to the unified /creator flow", async () => {
  const source = await readSource("../app/dashboard/creator/page.jsx");

  assert.doesNotMatch(source, /\/api\/creator\/request-payout/);
  assert.doesNotMatch(source, /\/api\/withdraw\/request/);
  assert.doesNotMatch(source, /handleRequestPayout/);
  assert.doesNotMatch(source, /handleRequestWithdrawal/);
  assert.doesNotMatch(source, /showWithdrawalForm/);

  // Still reads the GET history endpoint and sends the creator to /creator
  // to actually request a payout.
  assert.match(source, /\/api\/creator\/payout-history/);
  assert.match(source, /<Link\s+href="\/creator"/);
  assert.match(source, /t\("creatorDashboard\.goToCreatorPayout"\)/);
});

test("/dashboard/creator still surfaces payout history (stats + history preserved)", async () => {
  const source = await readSource("../app/dashboard/creator/page.jsx");

  assert.match(source, /payoutHistory\.map/);
  assert.match(source, /t\("creatorDashboard\.payoutHistoryTitle"\)/);
  assert.match(source, /t\("creatorDashboard\.payoutHistoryEmpty"\)/);
});
