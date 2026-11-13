import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { SOCIAL_GAME_TEXT, getSocialGameContent } from "../lib/socialRoomGamesContent.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFile(resolve(here, "..", path), "utf8");

test("four original six-round activities support Spanish English Portuguese", () => {
  for (const lang of ["es", "en", "pt"]) {
    for (const [type, choices] of [["would_you_rather", 2], ["emoji_guess", 3], ["connection_mission", 3], ["story_circle", 3]]) {
      assert.ok(SOCIAL_GAME_TEXT[lang][type]);
      assert.equal(SOCIAL_GAME_TEXT[lang].rounds[type].length, 6);
      for (let index = 0; index < 6; index += 1) {
        const content = getSocialGameContent(lang, type, index);
        assert.ok(content?.question?.trim());
        assert.equal(content.options.length, choices);
        assert.ok(content.options.every((option) => typeof option === "string" && option.length > 2));
      }
    }
  }
});

test("connection missions and stories use genuine choices, not forced romance", () => {
  for (const lang of ["es", "en", "pt"]) {
    const copy = SOCIAL_GAME_TEXT[lang];
    for (const name of ["connection_mission", "story_circle", "groupChoice", "talkTogether", "talkHint", "storyHint", "noConsensus"]) {
      assert.ok(typeof copy[name] === "string" && copy[name].trim().length > 2);
    }
    for (const game of ["connection_mission", "story_circle"]) {
      assert.equal(copy.rounds[game].length, 6);
      assert.ok(copy.rounds[game].every(([question, answers]) =>
        question.length > 5 && answers.length === 3 && answers.every((answer) => answer.length > 3)));
    }
  }
});

test("bad payloads never produce invented questions", () => {
  assert.equal(getSocialGameContent("es", "wrong", 0), null);
  assert.equal(getSocialGameContent("es", "emoji_guess", 999), null);
  assert.equal(getSocialGameContent("es", "emoji_guess", "1"), null);
  assert.equal(getSocialGameContent("es", "would_you_rather", -1), null);
  assert.equal(getSocialGameContent("fr", "emoji_guess", 0)?.question, "🌧️☕📖");
});

test("games are a separate tab for all four rooms without replacing chat or practice", async () => {
  const source = await read("app/rooms/[id]/page.jsx");
  const panel = await read("components/RoomGamesPanel.jsx");
  assert.match(source, /activeTab === "games"/);
  assert.match(source, /<RoomGamesPanel/);
  assert.match(source, /activeTab === "chat"/);
  assert.match(source, /<SimulationPanel currentUser=\{currentUser\}/);
  assert.match(source, /socket\.on\("social_room:game", handleRoomGame\)/);
  assert.match(source, /socket\.off\("social_room:game", handleRoomGame\)/);
  assert.match(source, /socket\.timeout\(7000\)\.emit/);
  assert.match(panel, /totalVotes/);
  assert.match(panel, /game\.phase === "results"/);
  assert.match(panel, /game\.selectedOption/);
  assert.match(panel, /onOpenChat/);
  assert.match(source, /onOpenChat=\{\(\) => setActiveTab\("chat"\)\}/);
  assert.doesNotMatch(panel, /Math\.random\(/);
  assert.doesNotMatch(panel, /localStorage/);
});

test("the client may not submit identity, balance, or a claimed vote total", async () => {
  const source = await read("app/rooms/[id]/page.jsx");
  assert.match(source, /\{ roomId: id, action, \.\.\.extras \}/);
  const backend = await read("../backend/src/lib/socialRoomGames.js");
  assert.ok(source.includes("sendRoomGameAction"));
  assert.match(backend, /socket\?\._userId/);
  assert.match(backend, /isSocketInSocialRoom\(socket, roomId\)/);
  assert.doesNotMatch(backend, /CoinTransaction|Stripe|sendGift|Math\.floor\(Math\.random\(\) \* 10_000\)/);
});
