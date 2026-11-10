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
  assert.match(card, /agencyRequirementsTitle/);
  assert.match(card, /agencyEligibility\.requirements/);
  assert.match(card, /!agencyEligibility\?\.eligible/);
  assert.match(creator, /api\/agency\/eligibility/);
  assert.match(card, /type="checkbox" checked={acceptedSupervision}/);
  assert.match(card, /required disabled={agencyRequestLoading}/);
  assert.match(card, /!acceptedSupervision/);
  assert.match(card, /onRequestAgency\?\.\(requestedName\.trim\(\), true\)/);
  assert.doesNotMatch(card, /href="\/agency" className="activate-btn"/);
});

test("creator application uses a real authenticated backend request, not automatic agency activation", async () => {
  const creator = await read("app/creator/page.jsx");
  assert.match(creator, /fetch\(\`\$\{API_URL\}\/api\/agency\/request\`/);
  assert.match(creator, /method: "POST"/);
  assert.match(creator, /body: JSON.stringify\(\{ agencyName, acceptSupervision \}\)/);
  assert.match(creator, /Authorization: \`Bearer \$\{token\}\`/);
  assert.match(creator, /if \(!res\.ok\) throw new Error/);
  assert.doesNotMatch(creator, /api\/admin\/agencies\/.*enable/);
});

test("agency request copy exists in ES EN PT and admin can review pending requests", async () => {
  for (const lang of ["es", "en", "pt"]) {
    const messages = JSON.parse(await read(`messages/${lang}.json`));
    for (const key of ["agencyRequestTitle", "agencyRequestDescription", "agencyRequestPending", "agencyRequestName", "agencyRequestSend", "agencyRequestError", "agencySupervisionAgreement", "agencyRequirementsTitle", "agencyRequirementsUnavailable", "agencyRequirementAdult", "agencyRequirementAuthentic", "agencyRequirementDays", "agencyRequirementLives", "agencyRequirementStanding", "agencyRequirementIndependent"]) {
      assert.ok(messages.creatorPage[key]?.length > 2, `${lang}.creatorPage.${key}`);
    }
    for (const key of ["agencyRequestPending", "agencyRequestApprove", "agencyRequestReject", "agencySafetyReview"]) {
      assert.ok(messages.adminAgencies[key]?.length > 2, `${lang}.adminAgencies.${key}`);
    }
  }
  const admin = await read("app/admin/agencies/page.jsx");
  assert.match(admin, /agencyRequestPending/);
  assert.match(admin, /agencyRequestApprove/);
  assert.match(admin, /agencyRequestReject/);
});

test("administrator review must be explicitly acknowledged before enabling an agency", async () => {
  const admin = await read("app/admin/agencies/page.jsx");
  assert.match(admin, /safetyReviewConfirmed\[agency\._id\]/);
  assert.match(admin, /safetyReviewConfirmed: true/);
  assert.match(admin, /agencySafetyReview/);
});

test("agency network and invitations remain hidden until agency enabled", async () => {
  const agency = await read("app/agency/page.jsx");
  const launcher = await read("components/creator/CreatorActionLauncher.jsx");
  const creator = await read("app/creator/page.jsx");
  assert.match(agency, /agencyData && agencyData\.agencyEnabled !== true &&/);
  assert.match(agency, /agencyData\?\.agencyEnabled === true &&/);
  assert.match(agency, /href="\/creator#agency-request"/);
  assert.match(agency, /<InviteLinkSection/);
  assert.match(creator, /<section id="agency-request">/);
  assert.match(launcher, /userRole === "creator" && !agencyEnabled \? "#agency-request" : "\/agency"/);
});
