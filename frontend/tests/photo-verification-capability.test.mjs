import test from "node:test";
import assert from "node:assert/strict";
import {
  getPhotoVerificationCapability,
  isPhotoVerificationCaptureConfigured,
} from "../lib/photoVerificationCapability.js";

// These tests run under plain Node (no DOM/`window`), which mirrors the SSR
// path real users hit before hydration — getPhotoVerificationCapability must
// never crash and must never claim support without a browser environment.

test("getPhotoVerificationCapability reports unsupported (SSR) when there is no window", () => {
  assert.equal(typeof window, "undefined");
  const capability = getPhotoVerificationCapability();
  assert.deepEqual(capability, { supported: false, reason: "SSR" });
});

test("isPhotoVerificationCaptureConfigured requires BOTH region and identityPoolId", () => {
  assert.equal(isPhotoVerificationCaptureConfigured({}), false);
  assert.equal(isPhotoVerificationCaptureConfigured({ region: "us-east-1" }), false);
  assert.equal(isPhotoVerificationCaptureConfigured({ identityPoolId: "pool-1" }), false);
  assert.equal(
    isPhotoVerificationCaptureConfigured({ region: "us-east-1", identityPoolId: "pool-1" }),
    true
  );
});
