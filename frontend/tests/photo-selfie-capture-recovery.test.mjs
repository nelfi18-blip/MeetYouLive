import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import es from "../messages/es.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import pt from "../messages/pt.json" with { type: "json" };

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("AWS capture error exits the camera instead of leaving a black capturing screen", async () => {
  const source = await readSource("../components/PhotoVerification/VerifyPhotoFlow.jsx");
  assert.match(source, /const handleCaptureError = useCallback\(\(\) => \{[\s\S]*?setSession\(null\);[\s\S]*?setOutcome\("error"\);[\s\S]*?setStep\("result"\);/);
  assert.match(source, /onError=\{handleCaptureError\}/);
  assert.doesNotMatch(source, /onError=\{\(message\) => setError\(message\)\}/);
  assert.match(source, /\{step === "capturing" && \(/);
  assert.match(source, /\{step === "result" && \(/);
  assert.match(source, /\{outcome === "error" && <p>⚠️ \{error \|\| t\("profile\.photoVerification\.genericError"\)\}<\/p>\}/);
});

test("a late AWS analysis callback cannot complete a session after capture failure", async () => {
  const source = await readSource("../components/PhotoVerification/VerifyPhotoFlow.jsx");
  assert.match(source, /const captureFailedRef = useRef\(false\);/);
  assert.match(source, /if \(captureFailedRef\.current \|\| !session\?\.sessionId\) return;/);
  assert.match(source, /captureFailedRef\.current = true;/);
  assert.match(source, /captureFailedRef\.current = false;\s*setSession\(result\);/);
  assert.match(source, /completePhotoVerificationSession\(session\.sessionId\)/);
  assert.doesNotMatch(source, /onStatusChange\?\.\("verified"\)/);
  assert.match(source, /onStatusChange\?\.\(result\.status\)/);
});

test("AWS raw SDK error strings are not passed to the user's verification dialog", async () => {
  const source = await readSource("../components/PhotoVerification/VerifyPhotoFlow.jsx");
  assert.match(source, /setError\(t\("profile\.photoVerification\.captureFailed"\)\)/);
  assert.match(source, /onError=\{\(\) => onError\?\.\(t\("profile\.photoVerification\.captureFailed"\)\)\}/);
  assert.match(source, /onError\?\.\(message\)/); // pre-existing sanitized widget-import message
});

test("capture recovery text exists in ES, EN and PT and does not claim identity was verified", () => {
  for (const [language, messages] of [["es", es], ["en", en], ["pt", pt]]) {
    const text = messages?.profile?.photoVerification?.captureFailed;
    assert.equal(typeof text, "string", language);
    assert.ok(text.length > 35, language);
    assert.ok(!/verified!|verificada!|verificado!|verificada com sucesso/i.test(text), language);
  }
});

test("capture recovery leaves backend verification, consent and native device gate untouched", async () => {
  const source = await readSource("../components/PhotoVerification/VerifyPhotoFlow.jsx");
  assert.match(source, /if \(!isPhotoVerificationFeatureEnabled\(\)\) return null;/);
  assert.match(source, /getPhotoVerificationCapability\(\)/);
  assert.match(source, /isPhotoVerificationCaptureConfigured\(/);
  assert.match(source, /startPhotoVerificationSession\(true, keepReferenceConsent\)/);
  assert.match(source, /<AmplifyLivenessCapture/);
  assert.match(source, /result\.status/);
});
