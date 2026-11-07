import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("creator can choose and save an informational payout preference without submitting a withdrawal", async () => {
  const card = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");
  assert.match(card, /id="ppc-preferred-method"/);
  assert.match(card, /value=\{preferredPayoutMethod\}/);
  assert.match(card, /onClick=\{handleSavePreference\}/);
  assert.match(card, /body: JSON\.stringify\(\{ preferredPayoutMethod \}\)/);
  assert.match(card, /t\("creatorPage\.payoutMethodPreferenceTitle"\)/);
  assert.match(card, /t\("creatorPage\.payoutMethodPreferencePending"\)/);
  assert.match(card, /preferenceSaving \|\| saving \|\| preferredPayoutMethod === \(profile\?\.preferredPayoutMethod \|\| "paypal"\)/);
  assert.doesNotMatch(card, /\/api\/creator\/request-payout/);
  assert.doesNotMatch(card, /routingNumber|accountNumber|accountHolderNumber|bankAccountNumber/);
});

test("only PayPal is currently submitted as an active payout destination", async () => {
  const card = await readSource("../components/creator/CreatorPayoutProfileCard.jsx");
  const creator = await readSource("../app/creator/page.jsx");
  assert.match(card, /destinationMethod: "paypal"/);
  assert.match(card, /paypalEmail: trimmedEmail/);
  assert.match(creator, /body: JSON\.stringify\(\{ method: "paypal", paymentDetails: savedEmail \}\)/);
  assert.doesNotMatch(creator, /preferredPayoutMethod/);
  assert.match(card, /onProfileChange\?\.\(data\.profile\);/);
});

test("preferred methods are visible in ES, EN and PT with explicit coming-soon labels", async () => {
  for (const language of ["es", "en", "pt"]) {
    const messages = JSON.parse(await readSource(`../messages/${language}.json`));
    const t = messages.creatorPage;
    for (const key of [
      "payoutMethodPreferenceTitle", "payoutMethodPreferenceSubtitle",
      "payoutMethodPreferenceLabel", "payoutMethodPreferencePaypal",
      "payoutMethodPreferenceZelle", "payoutMethodPreferenceACH",
      "payoutMethodPreferenceWise", "payoutMethodPreferencePayoneer",
      "payoutMethodPreferencePaypalActive", "payoutMethodPreferencePending",
      "payoutMethodPreferenceSave", "payoutMethodPreferenceSaving",
      "payoutMethodPreferenceSaved", "payoutMethodPreferenceSaveError",
    ]) {
      assert.ok(typeof t[key] === "string" && t[key].trim().length > 0, language + ": " + key);
    }
    assert.match(t.payoutMethodPreferencePending, /no|not|não/i);
    assert.ok(t.payoutMethodPreferenceZelle.toLowerCase().includes("zelle"));
    assert.ok(t.payoutMethodPreferenceACH.toLowerCase().includes("ach"));
  }
});
