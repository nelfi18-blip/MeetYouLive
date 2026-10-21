import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowDiscoveryPreferenceGate } from "../lib/feedProfileState.js";

test("new user with no viewer profile status does not see the gate before data loads", () => {
  assert.equal(shouldShowDiscoveryPreferenceGate(null), false);
});

test("existing user without a confirmed preference must see the mandatory gate", () => {
  assert.equal(
    shouldShowDiscoveryPreferenceGate({
      interestedInConfirmed: false,
      preferenceCompletionNeeded: true,
    }),
    true
  );
});

test("user with an explicit confirmed preference (men/women/both) never sees the gate", () => {
  for (const interestedIn of ["men", "women", "both"]) {
    assert.equal(
      shouldShowDiscoveryPreferenceGate({
        interestedIn,
        interestedInConfirmed: true,
        preferenceCompletionNeeded: false,
      }),
      false
    );
  }
});

test("legacy accounts with a historical 'both' value but no confirmation flag still see the gate", () => {
  assert.equal(
    shouldShowDiscoveryPreferenceGate({
      interestedIn: "both",
      interestedInConfirmed: false,
      preferenceCompletionNeeded: true,
    }),
    true
  );
});

test("after confirming a preference the gate is cleared immediately (optimistic update)", () => {
  const before = { interestedIn: "both", interestedInConfirmed: false, preferenceCompletionNeeded: true };
  assert.equal(shouldShowDiscoveryPreferenceGate(before), true);

  const after = { ...before, interestedInConfirmed: true, preferenceCompletionNeeded: false };
  assert.equal(shouldShowDiscoveryPreferenceGate(after), false);
});

test("a missing preferenceCompletionNeeded flag (e.g. older API payload) defaults to not gating", () => {
  assert.equal(shouldShowDiscoveryPreferenceGate({ interestedIn: "both" }), false);
});
