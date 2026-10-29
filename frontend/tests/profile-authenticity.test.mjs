import test from "node:test";
import assert from "node:assert/strict";
import {
  getAuthenticityMissingKeys,
  isProfileAuthenticityUiEnabled,
  needsMorePhotos,
} from "../lib/profileAuthenticity.js";

test("needs a second photo; selfie never counts", () => {
  assert.equal(needsMorePhotos(0), true);
  assert.equal(needsMorePhotos(1), true);
  assert.equal(needsMorePhotos(2), false);
});

test("the UI display flag is independent of backend enforcement (preview-only, never gates Discover)", () => {
  const original = process.env.NEXT_PUBLIC_PROFILE_AUTHENTICITY_ENABLED;
  try {
    process.env.NEXT_PUBLIC_PROFILE_AUTHENTICITY_ENABLED = "true";
    assert.equal(isProfileAuthenticityUiEnabled(), true);

    process.env.NEXT_PUBLIC_PROFILE_AUTHENTICITY_ENABLED = "false";
    assert.equal(isProfileAuthenticityUiEnabled(), false);

    delete process.env.NEXT_PUBLIC_PROFILE_AUTHENTICITY_ENABLED;
    assert.equal(isProfileAuthenticityUiEnabled(), false);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_PROFILE_AUTHENTICITY_ENABLED;
    else process.env.NEXT_PUBLIC_PROFILE_AUTHENTICITY_ENABLED = original;
  }
});

test("missing keys are derived purely from the backend's `missing` list (display gating is the caller's job, via isProfileAuthenticityUiEnabled)", () => {
  const base = { missing: ["minPhotos", "selfieVerified"] };
  // Even when enforcement doesn't apply to this (legacy) user yet, the
  // requirement keys must still be computable so a UI preview can show them
  // during testing — see isProfileAuthenticityUiEnabled() for the real gate.
  assert.deepEqual(getAuthenticityMissingKeys({ ...base, appliesToUser: false }), [
    "profile.authenticity.missingPhotos",
    "profile.authenticity.missingSelfie",
  ]);
  assert.deepEqual(getAuthenticityMissingKeys(undefined), []);
  assert.deepEqual(getAuthenticityMissingKeys({ ...base, appliesToUser: true }), [
    "profile.authenticity.missingPhotos",
    "profile.authenticity.missingSelfie",
  ]);
});
