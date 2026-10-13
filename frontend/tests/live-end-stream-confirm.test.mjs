import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression suite for the "Finalizar transmisión" safety fix (PR #1040),
// re-validated after integrating with PR #1041's Agora continuity/mini-player
// (which already owns a single safe end-stream flow via
// LiveSessionContext.requestEndStream() + registerEndStreamHandler()).
//
// Integration decision: this page NO LONGER has its own local
// handleEndStream()/endingStream state. Instead:
//  - a registerEndStreamHandler() effect registers the actual
//    PATCH /api/lives/:id/end call (explicitly checking response.ok and
//    throwing on any HTTP/network failure) once, shared by the mini-player,
//    the host-conflict screen, and this page's own ".es-modal" dialog;
//  - the dialog's Confirm button calls the SHARED requestEndStream()
//    (LiveSessionContext), which serializes concurrent calls via a
//    closure-scoped endStreamGuard (synchronous, not React state — no
//    double-tap race, and no risk of two independent PATCH requests or a
//    double teardown), only tears down Agora/navigates on confirmed
//    success, and otherwise surfaces session.endStreamStatus === "error"
//    so the dialog stays open with a translated, retryable error.
//
// These tests assert on the authored source (JSX + handler body), the same
// convention as the sibling live-stage-*.test.mjs/live-session-*.test.mjs
// files, since there is no backend/Agora/socket runtime available here.
const __dirname = dirname(fileURLToPath(import.meta.url));
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");
const messagesDir = join(__dirname, "../messages");
const contextPath = join(__dirname, "../contexts/LiveSessionContext.jsx");
const guardPath = join(__dirname, "../lib/liveSession/endStreamGuard.js");

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} must exist`);
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

test("live room page no longer has its own duplicate handleEndStream implementation", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.doesNotMatch(
    source,
    /const handleEndStream\s*=/,
    "a second, independent handleEndStream must not exist — it would risk a duplicate PATCH request or a double Agora teardown alongside LiveSessionContext.requestEndStream()"
  );
});

test("registerEndStreamHandler: the shared handler checks response.ok and throws on any HTTP failure", async () => {
  const source = await readFile(livePagePath, "utf8");
  const call = source.indexOf("registerEndStreamHandler(async () => {");
  assert.ok(call >= 0, "registerEndStreamHandler(...) registration must exist");
  const body = extractFunctionBody(source, "registerEndStreamHandler(async () => {");

  assert.match(body, /const response = await fetch/, "the handler must capture the fetch response so .ok can be inspected");
  assert.match(body, /if \(!response\.ok\)/, "must explicitly branch on !response.ok");
  assert.match(body, /throw new Error\(message\)/, "a failed response must throw so requestEndStream() can distinguish success from failure");
});

test("registerEndStreamHandler: on confirmed success, marks the session as explicitly terminated (not backgrounded)", async () => {
  const source = await readFile(livePagePath, "utf8");
  const body = extractFunctionBody(source, "registerEndStreamHandler(async () => {");

  const okIdx = body.indexOf("if (!response.ok)");
  const afterOkBlock = body.slice(okIdx);
  const throwIdx = afterOkBlock.indexOf("throw new Error(message)");
  const tailAfterThrow = afterOkBlock.slice(throwIdx);

  assert.match(
    tailAfterThrow,
    /minimizingRef\.current\s*=\s*false/,
    "once the backend confirms the stream ended, minimizingRef must be set to false so the Agora join-effect cleanup fully tears down resources instead of suspending them into a mini-player for an already-ended stream"
  );
});

test("LiveSessionContext.requestEndStream: only tears down/navigates on confirmed success, never unconditionally", async () => {
  const source = await readFile(contextPath, "utf8");
  const body = extractFunctionBody(source, "const requestEndStream = useCallback(async () => {");

  const tryIdx = body.indexOf("try {");
  const catchIdx = body.indexOf("} catch");
  assert.ok(tryIdx >= 0 && catchIdx > tryIdx, "requestEndStream must have a try/catch");
  const tryBlock = body.slice(tryIdx, catchIdx);
  const catchBlock = body.slice(catchIdx);

  assert.match(tryBlock, /liveSessionStore\.teardownSuspended\(liveId\)/, "real Agora/mini-player teardown must happen in the success path");
  assert.match(tryBlock, /router\.push\("\/live"\)/, "navigation must happen in the success path");
  assert.doesNotMatch(catchBlock, /router\.push/, "the catch block must never navigate away — the live must stay on screen on failure");
  assert.doesNotMatch(catchBlock, /teardownSuspended/, "the catch block must never tear down Agora resources on failure");
  assert.match(catchBlock, /endStreamStatus:\s*"error"/, "failure must be surfaced via endStreamStatus so the UI can show a retryable error");
});

test("LiveSessionContext.requestEndStream: duplicate calls are serialized via endStreamGuard (not React state)", async () => {
  const source = await readFile(contextPath, "utf8");
  assert.match(source, /import \{ createEndStreamGuard \} from "@\/lib\/liveSession\/endStreamGuard"/, "requestEndStream must reuse the shared endStreamGuard helper");
  const body = extractFunctionBody(source, "const requestEndStream = useCallback(async () => {");
  assert.match(body, /if \(endStreamGuard\.isPending\(\)\) return;/, "a pending call must synchronously block a concurrent second call");
  assert.match(body, /await endStreamGuard\.run\(/, "the actual handler invocation must go through endStreamGuard.run so every caller observes the same in-flight promise");
});

test("endStreamGuard: pending state is a synchronous closure variable, not React state — closes the double-tap race window", async () => {
  const source = await readFile(guardPath, "utf8");
  assert.match(source, /let pending = null;/, "pending must be a plain closure variable (synchronous read/write), not useState/useRef tied to a render cycle");
  assert.match(source, /function isPending\(\)\s*\{\s*return !!pending;\s*\}/, "isPending() must read the closure variable directly");
  assert.match(source, /if \(pending\) return pending;/, "a second concurrent run() call must return the SAME in-flight promise instead of starting a new request");
});

test("end-stream confirmation dialog: Confirm/Cancel stay disabled while a request is in flight (liveSessionCtx.endStreamStatus === \"pending\")", async () => {
  const source = await readFile(livePagePath, "utf8");
  const dialogStart = source.indexOf('{showEndStreamConfirm && (');
  assert.ok(dialogStart >= 0, "the end-stream confirmation dialog block must exist");
  const dialogEnd = source.indexOf("{showGiftPanel && live?.user?._id", dialogStart);
  const dialog = source.slice(dialogStart, dialogEnd);

  assert.match(dialog, /className="es-modal-confirm"[\s\S]*?disabled=\{endStreamPending\}/, "the confirm button must be disabled while endStreamPending is true");
  assert.match(dialog, /className="es-modal-cancel"[\s\S]*?disabled=\{endStreamPending\}/, "the cancel button must also be disabled while a request is in flight");

  const pendingDeclIdx = source.indexOf("const endStreamPending =");
  assert.ok(pendingDeclIdx >= 0, "endStreamPending must be declared");
  const pendingDeclLine = source.slice(pendingDeclIdx, source.indexOf(";", pendingDeclIdx) + 1);
  assert.match(pendingDeclLine, /liveSessionCtx\.endStreamStatus === "pending"/, "endStreamPending must be derived from the shared LiveSessionContext session state");
});

test("end-stream confirmation dialog: Cancel never calls requestEndStream / fires no request", async () => {
  const source = await readFile(livePagePath, "utf8");
  const dialogStart = source.indexOf('{showEndStreamConfirm && (');
  const dialogEnd = source.indexOf("{showGiftPanel && live?.user?._id", dialogStart);
  const dialog = source.slice(dialogStart, dialogEnd);

  const cancelButtonMatch = dialog.match(/className="es-modal-cancel"[\s\S]*?<\/button>/);
  assert.ok(cancelButtonMatch, "cancel button markup must exist");
  assert.doesNotMatch(cancelButtonMatch[0], /requestEndStream/, "cancel button must never call requestEndStream");

  const actionsIdx = dialog.indexOf("es-modal-actions");
  const beforeActions = dialog.slice(0, actionsIdx);
  assert.doesNotMatch(beforeActions, /onClick=\{requestEndStream\}/, "backdrop must never directly trigger requestEndStream");
  // Backdrop/cancel must clear any previous error via clearEndStreamError so
  // a stale failure banner doesn't linger if the dialog is reopened later.
  assert.match(dialog, /clearEndStreamError\(id\)/, "cancel/backdrop must clear a previous end-stream error");
});

test("end-stream confirmation dialog: an error message renders inside the dialog and offers a retry label", async () => {
  const source = await readFile(livePagePath, "utf8");
  const dialogStart = source.indexOf('{showEndStreamConfirm && (');
  const dialogEnd = source.indexOf("{showGiftPanel && live?.user?._id", dialogStart);
  const dialog = source.slice(dialogStart, dialogEnd);

  assert.match(dialog, /endStreamFailed &&/, "the dialog must conditionally render an error message when endStreamFailed is true");
  assert.match(dialog, /className="es-modal-error"/, "a dedicated error element must exist");
  assert.match(dialog, /t\("liveRoomUi\.endStreamRetry"\)/, "the confirm button must switch to a retry label once an error is present");
  // Retrying reuses the same onClick={requestEndStream} — no second handler.
  const confirmButtonMatch = dialog.match(/className="es-modal-confirm"[\s\S]*?<\/button>/);
  assert.ok(confirmButtonMatch, "confirm button markup must exist");
  assert.match(confirmButtonMatch[0], /onClick=\{requestEndStream\}/, "retry must reuse the same shared requestEndStream, not a duplicate handler");

  const failedDeclIdx = source.indexOf("const endStreamFailed =");
  assert.ok(failedDeclIdx >= 0, "endStreamFailed must be declared");
  const failedDeclLine = source.slice(failedDeclIdx, source.indexOf(";", failedDeclIdx) + 1);
  assert.match(failedDeclLine, /liveSessionCtx\.endStreamStatus === "error"/, "endStreamFailed must be derived from the shared LiveSessionContext session state");
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

test("i18n: miniPlayer.endStream* keys (PR #1041) were preserved, not removed or duplicated away", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const raw = await readFile(join(messagesDir, `${lang}.json`), "utf-8");
    const messages = JSON.parse(raw);
    for (const key of ["endStream", "endStreamConfirm", "endStreamConfirmYes", "endStreamConfirmNo", "endStreamPending", "endStreamError", "endStreamRetry"]) {
      assert.equal(typeof messages.miniPlayer?.[key], "string", `miniPlayer.${key} missing/invalid in ${lang}.json`);
      assert.ok(messages.miniPlayer[key].length > 0, `miniPlayer.${key} must not be empty in ${lang}.json`);
    }
  }
});

test("both the desktop (.action-bar) and mobile (.stage-host-bar) end-stream buttons open the confirmation dialog instead of calling requestEndStream directly", async () => {
  const source = await readFile(livePagePath, "utf8");
  const endStreamButtons = [...source.matchAll(/btn-end-stream|shb-end/g)];
  assert.ok(endStreamButtons.length >= 2, "both the desktop and mobile end-stream buttons must exist");

  const openDialogSites = [...source.matchAll(/onClick=\{\(\) => setShowEndStreamConfirm\(true\)\}/g)];
  assert.equal(openDialogSites.length, 2, "both trigger buttons (desktop action-bar + mobile stage-host-bar) must open the confirmation dialog");

  // requestEndStream should only be wired directly to a confirm button —
  // this page's own ".es-modal" dialog, plus the pre-existing (#1041)
  // host-conflict screen's confirm button (a different scenario: host
  // already broadcasting a DIFFERENT live) — so at most two call sites are
  // expected, and neither is one of the trigger buttons above.
  const directCallSites = [...source.matchAll(/onClick=\{requestEndStream\}/g)];
  assert.ok(directCallSites.length >= 1 && directCallSites.length <= 2, "requestEndStream must be wired directly to at most the dialog's confirm button and the pre-existing host-conflict confirm button, not the trigger buttons");
});

test("mobile redesign markup (stage-host-bar / chat-quick-gift / action-menu-sheet) is untouched by this integration", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(source, /className=\{`stage-host-bar/, "mobile host bar must still exist");
  assert.match(source, /className="chat-quick-gift"/, "mobile viewer gift quick action must still exist");
  assert.match(source, /className="action-menu-sheet"/, "shared action menu sheet must still exist");
});

test("continuity markup (LiveSessionContext wiring + mini-player registration) is present on the integrated page", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(source, /useLiveSession\(\)/, "the page must consume LiveSessionContext");
  assert.match(source, /registerEndStreamHandler/, "the page must register its end-stream handler with the context");
  assert.match(source, /openSession\(/, "the page must claim the mini-player slot via openSession");
  assert.match(source, /minimizeSession\(/, "the page must support minimizing into the mini-player");
});
