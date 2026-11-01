import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getAvatarUploadErrorMessage,
  getFacePhotoValidationLocalizedMessage,
} from "../lib/avatarUpload.js";
import esMessages from "../messages/es.json" with { type: "json" };
import enMessages from "../messages/en.json" with { type: "json" };
import ptMessages from "../messages/pt.json" with { type: "json" };

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");
const gallerySource = await readSource("../components/SimpleProfilePhotoGallery.jsx");

const makeTranslator = (dictionary) => (key) => {
  const value = key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), dictionary);
  return typeof value === "string" ? value : key;
};

test("getFacePhotoValidationLocalizedMessage + getAvatarUploadErrorMessage surface only the localized NO_FACE_DETECTED copy", () => {
  for (const [lang, dictionary] of [["es", esMessages], ["en", enMessages], ["pt", ptMessages]]) {
    const t = makeTranslator(dictionary);
    const backendPayload = { status: 422, error: "NO_FACE_DETECTED", message: "Face validation rejected", code: "NO_FACE_DETECTED" };
    const localized = getFacePhotoValidationLocalizedMessage(backendPayload.code, t);
    assert.ok(localized, `expected a localized message for ${lang}`);
    const payload = { ...backendPayload, message: localized };
    const finalMessage = getAvatarUploadErrorMessage(422, payload, t("profile.photoUploadError"));

    assert.equal(finalMessage, dictionary.profile.photoFaceNoFace, `[${lang}] should show the friendly face message`);
    assert.doesNotMatch(finalMessage, /status\s*:/i);
    assert.doesNotMatch(finalMessage, /\b422\b/);
    assert.doesNotMatch(finalMessage, /NO_FACE_DETECTED/);
    assert.doesNotMatch(finalMessage, /code\s*:/i);
  }
});

test("SimpleProfilePhotoGallery no longer builds/display raw diagnostic payloads", () => {
  assert.doesNotMatch(gallerySource, /formatAvatarUploadDiagnostic/);
  assert.doesNotMatch(gallerySource, /getAvatarUploadDiagnostic/);
  assert.match(gallerySource, /getAvatarUploadErrorMessage/);
});

test("SimpleProfilePhotoGallery renders a compact, accessible, dismissible rejection alert", () => {
  assert.match(gallerySource, /role="alert"/);
  assert.match(gallerySource, /t\("profile\.photoRejectedTitle"\)/);
  assert.match(gallerySource, /t\("profile\.photoDismissAlert"\)/);
  assert.match(gallerySource, /onClick=\{\(\) => setError\(""\)\}/);
  assert.match(gallerySource, /overflow-wrap: anywhere/);
  assert.match(gallerySource, /word-break: break-word/);
});

test("profile.photoRejectedTitle / photoDismissAlert translations exist in all supported languages", () => {
  for (const dictionary of [esMessages, enMessages, ptMessages]) {
    assert.equal(typeof dictionary.profile.photoRejectedTitle, "string");
    assert.ok(dictionary.profile.photoRejectedTitle.trim());
    assert.equal(typeof dictionary.profile.photoDismissAlert, "string");
    assert.ok(dictionary.profile.photoDismissAlert.trim());
  }
  assert.equal(esMessages.profile.photoRejectedTitle, "Foto no aceptada");
});
