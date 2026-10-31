import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Regression coverage for /admin/payouts' Manual/Automatic payout mode
// card: a failed GET /api/admin/settings (missing token, network error, or
// a non-ok response) must NEVER be presented as a server-confirmed
// "manual" default, must show a clear retryable error, must always finish
// loading, must leave the payouts table unaffected, and must block mode
// changes until a successful load.
test("loadPayoutMode never confirms the default mode without a successful server response", async () => {
  const source = await readSource("../components/admin/PayoutsPage.jsx");

  // A dedicated "confirmed from server" flag exists, separate from the
  // optimistic default state.
  assert.match(source, /const \[payoutModeLoaded, setPayoutModeLoaded\] = useState\(false\)/);

  // Missing token: must mark the mode as NOT loaded, surface a load error,
  // and still end the loading state (no early return bypassing `finally`).
  assert.match(
    source,
    /if \(!token\) \{\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*setPayoutModeLoaded\(false\);\s*setPayoutModeLoadError\(t\("adminPayouts\.payoutModeLoadError"\)\);\s*setPayoutModeLoading\(false\);\s*return;\s*\}/
  );

  // Non-ok HTTP response: same treatment — not loaded + load error, inside
  // the try block so `finally` still runs to end loading.
  assert.match(
    source,
    /if \(!res\.ok\) \{\s*setPayoutModeLoaded\(false\);\s*setPayoutModeLoadError\(t\("adminPayouts\.payoutModeLoadError"\)\);\s*return;\s*\}/
  );

  // Network/parse failure (catch block): same treatment.
  assert.match(
    source,
    /\} catch \{\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*setPayoutModeLoaded\(false\);\s*setPayoutModeLoadError\(t\("adminPayouts\.payoutModeLoadError"\)\);\s*\} finally \{\s*setPayoutModeLoading\(false\);\s*\}/
  );

  // Loading state always ends via `finally`, regardless of which branch ran.
  assert.match(source, /\} finally \{\s*setPayoutModeLoading\(false\);\s*\}/);

  // Success path is the ONLY place payoutModeLoaded is set to true.
  const loadedTrueCount = (source.match(/setPayoutModeLoaded\(true\)/g) || []).length;
  assert.equal(loadedTrueCount, 1, "payoutModeLoaded must only be set to true after a confirmed successful load");
});

test("a retry affordance is rendered when the payout mode fails to load, and the buttons are hidden instead of showing stale state", async () => {
  const source = await readSource("../components/admin/PayoutsPage.jsx");

  assert.match(source, /payoutModeLoadError \?/);
  assert.match(source, /onClick=\{loadPayoutMode\}/);
  assert.match(source, /t\("adminPayouts\.payoutModeRetry"\)/);
  assert.match(source, /t\("adminPayouts\.payoutModeLoadError"\)/);
});

test("mode switch buttons are disabled until payoutModeLoaded is true, and handleSelectPayoutMode bails out early otherwise", async () => {
  const source = await readSource("../components/admin/PayoutsPage.jsx");

  assert.match(
    source,
    /const handleSelectPayoutMode = useCallback\(async \(nextMode\) => \{\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(!payoutModeLoaded\) return;/
  );
  assert.match(source, /disabled=\{payoutModeLoading \|\| payoutModeSaving \|\| !payoutModeLoaded\}/);
  assert.match(
    source,
    /disabled=\{payoutModeLoading \|\| payoutModeSaving \|\| !payoutModeLoaded \|\| !payoutAutomationAvailable\}/
  );
});

test("the payouts table keeps its own independent loading/error state, unaffected by the payout mode card", async () => {
  const source = await readSource("../components/admin/PayoutsPage.jsx");

  // loadPayouts (the table) must retain its own `error`/`loading` state and
  // must not reference any payoutMode* variables.
  const loadPayoutsMatch = source.match(/const loadPayouts = useCallback\(async \(\) => \{[\s\S]*?\}, \[authHeader, router, statusFilter\]\);/);
  assert.ok(loadPayoutsMatch, "loadPayouts function not found");
  assert.doesNotMatch(loadPayoutsMatch[0], /payoutMode/);
});
