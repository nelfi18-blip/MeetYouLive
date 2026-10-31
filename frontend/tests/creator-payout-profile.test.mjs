import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("CreatorPayoutProfileCard fetches/saves via /api/creator/payout-profile and reuses the shared PayPal email validator", async () => {
  const source = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");

  assert.match(source, /fetch\(`\$\{API_URL\}\/api\/creator\/payout-profile`, \{ headers \}\)/);
  assert.match(source, /method:\s*"PATCH"/);
  assert.match(source, /import \{ isValidPaypalEmail \} from "@\/lib\/payoutValidation"/);
  assert.match(source, /isValidPaypalEmail\(trimmedEmail\)/);
  // Never claims PayPal verification from a syntactically valid email.
  assert.doesNotMatch(source, /verified:\s*true/);
});

test("CreatorPayoutProfileCard reuses the canonical country list instead of a second hardcoded one", async () => {
  const source = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");

  assert.match(source, /import \{ COUNTRY_ISO_CODES \} from "@\/lib\/countryDetection"/);
  assert.match(source, /Object\.values\(COUNTRY_ISO_CODES\)/);
});

test("CreatorPayoutProfileCard masks the saved PayPal destination in its summary view", async () => {
  const source = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");

  // The card must render the backend-masked value from the profile payload
  // rather than reconstructing/unmasking the raw email client-side.
  assert.match(source, /profile\?\.destination\?\.maskedPaypalEmail|destination\.maskedPaypalEmail/);
});

test("/creator wires CreatorPayoutProfileCard into the approved-creator panel with an anchor for the completion CTA", async () => {
  const source = await readSource("../app/creator/page.jsx");

  assert.match(source, /import CreatorPayoutProfileCard from "@\/components\/creator\/CreatorPayoutProfileCard"/);
  assert.match(source, /<section id="payout-profile">/);
  assert.match(source, /<CreatorPayoutProfileCard onProfileChange=\{setPayoutProfile\}\s*\/>/);
});

test("/creator blocks opening the withdrawal modal when the payout profile is incomplete, and never lets the saved PayPal email be retyped", async () => {
  const source = await readSource("../app/creator/page.jsx");

  assert.match(source, /const isPayoutProfileComplete = payoutProfile\?\.completionStatus === "complete";/);
  assert.match(source, /if \(!isPayoutProfileComplete\) \{/);
  assert.match(source, /t\("creatorPage\.payoutProfileCompleteRequiredNote"\)/);
  // The saved destination is reused directly from the profile at confirm
  // time — it is never copied into an editable input the creator could
  // retype or substitute.
  assert.match(source, /const savedEmail = \(payoutProfile\?\.destination\?\.paypalEmail \|\| ""\)\.trim\(\);/);
  assert.doesNotMatch(source, /setPaypalEmail\(/);
});

test("/creator fetches the payout profile alongside dashboard/earnings data for the approved creator", async () => {
  const source = await readSource("../app/creator/page.jsx");

  assert.match(source, /fetch\(`\$\{API_URL\}\/api\/creator\/payout-profile`, \{ headers \}\)/);
  assert.match(source, /setPayoutProfile\(payoutProfileData\.profile\)/);
});

test("CreatorPayoutProfileCard saves beneficiary + PayPal destination together with a single button", async () => {
  const source = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");

  // Exactly one submit button/label for the whole form.
  assert.match(source, /t\("creatorPage\.payoutProfileSaveAll"\)/);
  assert.doesNotMatch(source, /payoutProfileSaveBeneficiary|payoutProfileSaveDestination/);
  // A single PATCH call carries both the beneficiary and destination fields.
  assert.match(source, /legalName: form\.legalName\.trim\(\)/);
  assert.match(source, /destinationMethod: "paypal"/);
  assert.match(source, /paypalEmail: trimmedEmail/);
});

test("CreatorPayoutProfileCard offers a single 'same country' toggle for tax residence and still sends taxResidenceCountry to the backend", async () => {
  const source = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");

  assert.match(source, /t\("creatorPage\.payoutProfileSameTaxResidence"\)/);
  assert.match(source, /const \[sameTaxResidence, setSameTaxResidence\] = useState\(true\)/);
  assert.match(source, /const effectiveTaxCountry = sameTaxResidence \? form\.residenceCountry : taxResidenceCountry;/);
  assert.match(source, /taxResidenceCountry: effectiveTaxCountry/);
});

test("CreatorPayoutProfileCard collapses into a summary card with an Edit action once the profile is complete", async () => {
  const source = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");

  assert.match(source, /t\("creatorPage\.payoutProfileConfiguredTitle"\)/);
  assert.match(source, /t\("creatorPage\.payoutProfileEditCta"\)/);
  assert.match(source, /onClick=\{\(\) => setEditing\(true\)\}/);
});

test("CreatorPayoutProfileCard disables the PayPal field while a pending/approved withdrawal locks the destination", async () => {
  const source = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");

  assert.match(source, /disabled=\{saving \|\| lockedDestination\}/);
  assert.match(source, /t\("creatorPage\.payoutProfileLockedNote"\)/);
});

test("CreatorWalletCompact never shows the payout as available while the payout profile is incomplete", async () => {
  const source = await readSource("../components/creator/CreatorWalletCompact.jsx");

  assert.match(source, /isPayoutProfileComplete/);
  assert.match(source, /t\("creatorPage\.payoutStatusIncompleteProfile"\)/);
});

test("/creator passes payout-profile completeness down to the wallet status card", async () => {
  const source = await readSource("../app/creator/page.jsx");

  assert.match(
    source,
    /<CreatorWalletCompact hasPendingPayout=\{hasPendingPayout\} isPayoutProfileComplete=\{isPayoutProfileComplete\} \/>/
  );
});
