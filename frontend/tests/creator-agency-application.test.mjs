import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL("../" + name, import.meta.url), "utf8");

test("the agency application form is only rendered for approved full creators in Creator", async () => {
  const creator = await read("app/creator/page.jsx");
  const card = await read("components/creator/CreatorNetworkCompact.jsx");
  assert.match(creator, /\{user\?\.role === "creator" && \(/);
  assert.match(creator, /<CreatorNetworkCompact/);
  assert.match(card, /<form onSubmit=/);
  assert.match(card, /if \(!agencyData\.agencyEnabled\)/);
  assert.match(card, /agencyRequestPending/);
  assert.match(card, /onRequestAgency\?\.\(requestedName\.trim\(\)\)/);
  assert.doesNotMatch(card, /href="\/agency" className="activate-btn"/);
});

test("creator application uses a real authenticated backend request, not automatic agency activation", async () => {
  const creator = await read("app/creator/page.jsx");
  assert.match(creator, /fetch\(\`\$\{API_URL\}\/api\/agency\/request\`/);
  assert.match(creator, /method: "POST"/);
  assert.match(creator, /Authorization: \`Bearer \$\{token\}\`/);
  assert.match(creator, /if \(!res\.ok\) throw new Error/);
  assert.doesNotMatch(creator, /api\/admin\/agencies\/.*enable/);
});

test("agency request copy exists in ES EN PT and admin can review pending requests", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await read(`messages/${lang}.json`));
    for (const key of ["agencyRequestTitle", "agencyRequestDescription", "agencyRequestPending", "agencyRequestName", "agencyRequestSend", "agencyRequestError"]) {
      assert.ok(messages.creatorPage[key]?.length > 2, `${lang}.creatorPage.${key}`);
    }
    for (const key of ["agencyRequestPending", "agencyRequestApprove", "agencyRequestReject"]) {
      assert.ok(messages.adminAgencies[key]?.length > 2, `${lang}.adminAgencies.${key}`);
    }
  }
  const admin = await read("app/admin/agencies/page.jsx");
  assert.match(admin, /agencyRequestPending/);
  assert.match(admin, /agencyRequestApprove/);
  assert.match(admin, /agencyRequestReject/);
});
