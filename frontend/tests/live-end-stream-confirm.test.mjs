import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression suite for the "Finalizar transmisión" safety fix on PR #1040:
// handleEndStream used to fire the PATCH /api/lives/:id/end request and
// unconditionally redirect to /live from `finally`, regardless of whether
// the backend actually accepted the request, and relied only on the
// (batched/async) `endingStream` state to block duplicate taps. That could
// leave the live broadcast active on the server while the host's screen
// had already navigated away.
//
// These tests assert on the authored source (JSX + handler body), the same
// convention as the sibling live-stage-*.test.mjs files, since there is no
// backend/Agora/socket runtime available in this environment.
const __dirname = dirname(fileURLToPath(import.meta.url));
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");
const messagesDir = join(__dirname, "../messages");

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} must exist in the live room page`);
  // Walk balanced braces starting at the function's opening "{".
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not find balanced end for ${signature}`);
}

test("handleEndStream: checks response.ok before treating the end-stream request as successful", async () => {
  const source = await readFile(livePagePath, "utf8");
  const body = extractFunctionBody(source, "const handleEndStream = async () => {");
  assert.match(body, /if \(!res\.ok\)/, "must explicitly branch on !res.ok");
  assert.match(body, /const res = await fetch/, "fetch's response must be captured so .ok can be inspected");
});

test("handleEndStream: only navigates to /live inside the success path, never unconditionally in finally", async () => {
  const source = await readFile(livePagePath, "utf8");
  const body = extractFunctionBody(source, "const handleEndStream = async () => {");

  const finallyIdx = body.lastIndexOf("} finally {");
  assert.ok(finallyIdx >= 0, "handleEndStream must still have a finally block (for guard/state cleanup)");
  const finallyBlock = body.slice(finallyIdx);
  assert.doesNotMatch(finallyBlock, /router\.push\("\/live"\)/, "router.push('/live') must NOT be unconditional inside finally");

  // The outer success/failure catch is "} catch (err) {" — the only other
  // catch in this function is the nested, param-less JSON-parsing one
  // ("} catch {") used while reading an error response body.
  const outerCatchIdx = body.indexOf("} catch (err) {");
  assert.ok(outerCatchIdx >= 0, "an outer `catch (err)` must exist for the fetch/response handling");
  const tryIdx = body.indexOf("try {");
  const tryBlock = body.slice(tryIdx, outerCatchIdx);
  assert.match(tryBlock, /router\.push\("\/live"\)/, "router.push('/live') must happen in the success (try) path, after the res.ok check");
  assert.match(tryBlock, /if \(!res\.ok\)/, "the res.ok check must happen before router.push in the try block");
});

test("handleEndStream: a failed/erroring request keeps the confirmation dialog open and surfaces a translated error instead of navigating away", async () => {
  const source = await readFile(livePagePath, "utf8");
  const body = extractFunctionBody(source, "const handleEndStream = async () => {");

  const outerCatchIdx = body.indexOf("} catch (err) {");
  const finallyIdx = body.lastIndexOf("} finally {");
  const catchBlock = body.slice(outerCatchIdx, finallyIdx);

  assert.doesNotMatch(catchBlock, /router\.push/, "the catch block must never navigate away — the live must stay on screen on failure");
  assert.doesNotMatch(catchBlock, /setShowEndStreamConfirm\(false\)/, "the catch block must not close the confirmation dialog — it must stay open so the host can retry");
  assert.match(catchBlock, /setEndStreamError\(/, "the catch block must surface a translated error via setEndStreamError");
  assert.match(catchBlock, /t\("liveRoomUi\.endStreamErrorGeneric"\)/, "a translated fallback error key must be used");
});

test("handleEndStream: uses a synchronous ref guard (not just the endingStream state) against duplicate requests", async () => {
  const source = await readFile(livePagePath, "utf8");

  assert.match(source, /const endingStreamRef = useRef\(false\)/, "a dedicated ref must exist for the synchronous duplicate-request guard");

  const body = extractFunctionBody(source, "const handleEndStream = async () => {");
  assert.match(body, /if \(endingStreamRef\.current\) return;/, "the guard must check the ref synchronously at the top of the handler");
  assert.match(body, /endingStreamRef\.current = true;/, "the ref must be set to true before any await, closing the double-tap race window");
  assert.match(body, /endingStreamRef\.current = false;/, "the ref must be reset in finally so a legitimate retry is possible afterwards");
});

test("end-stream confirmation dialog: Confirm button stays disabled while a request is in flight (endingStream)", async () => {
  const source = await readFile(livePagePath, "utf8");
  const dialogStart = source.indexOf('{showEndStreamConfirm && (');
  assert.ok(dialogStart >= 0, "the end-stream confirmation dialog block must exist");
  const dialogEnd = source.indexOf("{showGiftPanel && live?.user?._id", dialogStart);
  const dialog = source.slice(dialogStart, dialogEnd);

  assert.match(dialog, /className="es-modal-confirm"[\s\S]*?disabled=\{endingStream\}/, "the confirm button must be disabled while endingStream is true");
  assert.match(dialog, /className="es-modal-cancel"[\s\S]*?disabled=\{endingStream\}/, "the cancel button must also be disabled while a request is in flight");
});

test("end-stream confirmation dialog: Cancel never calls handleEndStream / fires no request", async () => {
  const source = await readFile(livePagePath, "utf8");
  const dialogStart = source.indexOf('{showEndStreamConfirm && (');
  const dialogEnd = source.indexOf("{showGiftPanel && live?.user?._id", dialogStart);
  const dialog = source.slice(dialogStart, dialogEnd);

  // The Cancel button and the backdrop click-away must only toggle local
  // state (setShowEndStreamConfirm/setEndStreamError), never handleEndStream.
  const cancelButtonMatch = dialog.match(/className="es-modal-cancel"[\s\S]*?<\/button>/);
  assert.ok(cancelButtonMatch, "cancel button markup must exist");
  assert.doesNotMatch(cancelButtonMatch[0], /handleEndStream/, "cancel button must never call handleEndStream");

  assert.doesNotMatch(dialog.slice(0, dialog.indexOf("es-modal-actions")), /onClick=\{handleEndStream\}/, "backdrop must never directly trigger handleEndStream");
});

test("end-stream confirmation dialog: an error message renders inside the dialog and offers a retry label", async () => {
  const source = await readFile(livePagePath, "utf8");
  const dialogStart = source.indexOf('{showEndStreamConfirm && (');
  const dialogEnd = source.indexOf("{showGiftPanel && live?.user?._id", dialogStart);
  const dialog = source.slice(dialogStart, dialogEnd);

  assert.match(dialog, /endStreamError &&/, "the dialog must conditionally render the endStreamError message");
  assert.match(dialog, /className="es-modal-error"/, "a dedicated error element must exist");
  assert.match(dialog, /t\("liveRoomUi\.endStreamRetry"\)/, "the confirm button must switch to a retry label once an error is present");
  // Retrying reuses the same onClick={handleEndStream} — no second handler.
  const confirmButtonMatch = dialog.match(/className="es-modal-confirm"[\s\S]*?<\/button>/);
  assert.ok(confirmButtonMatch, "confirm button markup must exist");
  assert.match(confirmButtonMatch[0], /onClick=\{handleEndStream\}/, "retry must reuse the same handleEndStream handler, not a duplicate");
});

test("i18n: endStreamErrorGeneric and endStreamRetry exist in es/en/pt under liveRoomUi", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const raw = await readFile(join(messagesDir, `${lang}.json`), "utf-8");
    const messages = JSON.parse(raw);
    assert.equal(typeof messages.liveRoomUi?.endStreamErrorGeneric, "string", `liveRoomUi.endStreamErrorGeneric missing/invalid in ${lang}.json`);
    assert.ok(messages.liveRoomUi.endStreamErrorGeneric.length > 0, `liveRoomUi.endStreamErrorGeneric must not be empty in ${lang}.json`);
    assert.equal(typeof messages.liveRoomUi?.endStreamRetry, "string", `liveRoomUi.endStreamRetry missing/invalid in ${lang}.json`);
    assert.ok(messages.liveRoomUi.endStreamRetry.length > 0, `liveRoomUi.endStreamRetry must not be empty in ${lang}.json`);
  }
});

test("both the desktop (.action-bar) and mobile (.stage-host-bar) end-stream buttons open the confirmation dialog instead of calling handleEndStream directly", async () => {
  const source = await readFile(livePagePath, "utf8");
  const endStreamButtons = [...source.matchAll(/btn-end-stream|shb-end/g)];
  assert.ok(endStreamButtons.length >= 2, "both the desktop and mobile end-stream buttons must exist");

  // Neither trigger button's onClick should call handleEndStream directly —
  // only the dialog's own confirm button should.
  const directCallSites = [...source.matchAll(/onClick=\{handleEndStream\}/g)];
  assert.equal(directCallSites.length, 1, "handleEndStream must be wired to exactly one onClick — the dialog's confirm button — not the trigger buttons");

  const openDialogSites = [...source.matchAll(/onClick=\{\(\) => setShowEndStreamConfirm\(true\)\}/g)];
  assert.equal(openDialogSites.length, 2, "both trigger buttons (desktop action-bar + mobile stage-host-bar) must open the confirmation dialog");
});

test("mobile redesign markup (stage-host-bar / chat-quick-gift / action-menu-sheet) is untouched by this fix", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(source, /className=\{`stage-host-bar/, "mobile host bar must still exist");
  assert.match(source, /className="chat-quick-gift"/, "mobile viewer gift quick action must still exist");
  assert.match(source, /className="action-menu-sheet"/, "shared action menu sheet must still exist");
});
