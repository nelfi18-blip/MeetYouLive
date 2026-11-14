import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

for (const lang of ["es", "en", "pt"]) {
  test(`Meet Hub header in ${lang} does not imply currently active users`, async () => {
    const data = JSON.parse(await read(`../messages/${lang}.json`));
    const copy = data.chatPremium;
    assert.ok(copy.meetHubKicker.length > 8);
    assert.doesNotMatch(copy.meetHubKicker, /happening now|pasando ahora|acontecendo agora|en vivo|online now/i);
    assert.ok(copy.emptyTitle.length > 5);
    assert.ok(copy.emptyText.length > 5);
  });
}

test("Meet Hub's decorative dot is neutral, while actual user presence indicators remain", async () => {
  const code = await read("../app/chats/page.jsx");
  assert.match(code, /t\("chatPremium\.meetHubKicker"\)/);
  assert.match(code, /\.meet-hub-kicker::before \{[^}]*background: var\(--accent-cyan\);[^}]*animation: none;/);
  assert.doesNotMatch(code, /\.meet-hub-kicker::before \{[^}]*animation: pulseDot/);
  assert.match(code, /onlineUserIds\.has\(userId\)/);
  assert.match(code, /isLive && <span className="rail-live-pill"/);
  assert.match(code, /socket\.on\("message:new"/);
});
