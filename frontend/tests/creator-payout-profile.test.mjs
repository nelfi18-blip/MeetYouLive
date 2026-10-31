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

test("/creator blocks opening the withdrawal modal and reuses the saved PayPal email when the payout profile is incomplete", async () => {
  const source = await readSource("../app/creator/page.jsx");

  assert.match(source, /const isPayoutProfileComplete = payoutProfile\?\.completionStatus === "complete";/);
  assert.match(source, /if \(!isPayoutProfileComplete\) \{/);
  assert.match(source, /t\("creatorPage\.payoutProfileCompleteRequiredNote"\)/);
  // The saved destination is reused instead of forcing the creator to retype it.
  assert.match(source, /setPaypalEmail\(payoutProfile\?\.destination\?\.paypalEmail \|\| ""\)/);
});

test("/creator fetches the payout profile alongside dashboard/earnings data for the approved creator", async () => {
  const source = await readSource("../app/creator/page.jsx");

  assert.match(source, /fetch\(`\$\{API_URL\}\/api\/creator\/payout-profile`, \{ headers \}\)/);
  assert.match(source, /setPayoutProfile\(payoutProfileData\.profile\)/);
});
