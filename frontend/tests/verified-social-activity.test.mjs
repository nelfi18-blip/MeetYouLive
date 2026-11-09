import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeActivityCounts } from "../lib/activityCounts.js";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("activity numbers are displayed only when the backend provides valid exact counts", () => {
  const actual = { onlineCount: 0, activeLivesCount: 1, likesToday: 2, boostActiveCount: 0 };
  assert.deepEqual(normalizeActivityCounts(actual), actual);
  assert.equal(normalizeActivityCounts(null), null);
  assert.equal(normalizeActivityCounts({ onlineCount: 12 }), null);
  assert.equal(normalizeActivityCounts({ ...actual, likesToday: -1 }), null);
  assert.equal(normalizeActivityCounts({ ...actual, activeLivesCount: "2" }), null);
  assert.equal(normalizeActivityCounts({ ...actual, boostActiveCount: Number.NaN }), null);
});

test("ActivityBar hides missing data and never applies fabricated minimum floors", async () => {
  const sourceText = await source("components/ActivityBar.jsx");
  assert.match(sourceText, /if \(!stats\) return null/);
  assert.match(sourceText, /normalizeActivityCounts\(await res\.json\(\)\)/);
  assert.doesNotMatch(sourceText, /FLOOR|Math\.max\(stats/);
});

test("Crush never claims 5 bonus Coins based solely on localStorage", async () => {
  const crush = await source("app/crush/page.jsx");
  assert.doesNotMatch(crush, /checkAndClaimDailyReward|crush_daily_reward_|DailyRewardBanner|DAILY_LOGIN_REWARD_COINS/);
  assert.doesNotMatch(crush, /showDailyReward/);
  const rewards = await source("app/daily-reward/page.jsx");
  assert.match(rewards, /daily.reward|dailyReward|claimReward/i);
});

test("the Live ticker only renders a verifiable active stream, not random urgency", async () => {
  const ticker = await source("components/LiveActivityFeed.jsx");
  assert.match(ticker, /LIVE_TEMPLATE = \{ icon: "🎤", key: "liveNow" \}/);
  assert.doesNotMatch(ticker, /randomItem\(|REAL_TEMPLATES|NEW_TEMPLATE/);
  assert.match(ticker, /if \(lives\.length === 0 \|\| events\.length === 0\) return null/);
});

test("matches and hidden likes never interpret a profile edit as a recent login", async () => {
  for (const path of ["app/matches/page.jsx", "components/HiddenLikesSection.jsx"]) {
    const page = await source(path);
    assert.match(page, /user\?\.lastActiveAt \|\| user\?\.lastSeenAt/);
    assert.doesNotMatch(page, /lastSeenAt \|\| user\?\.updatedAt/);
  }
});

test("Boost messages in all languages describe options without guaranteed matches", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await source(`messages/${lang}.json`));
    const text = messages.crush.boostUrgencyMatches + " " + messages.crush.boostUrgencyVisibility;
    assert.ok(text.length > 30);
    assert.doesNotMatch(text, /aumenta tus matches|increase your matches|aumente seus matches|más visibilidad en tiempo real|more visibility in real time/i);
  }
});
