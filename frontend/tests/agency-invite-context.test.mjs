import test from "node:test";
import assert from "node:assert/strict";
import { buildTeamLinkHref, isAlreadyLinkedToInviter } from "../lib/agencyInvite.js";

test("buildTeamLinkHref preserves the invite code as a query param instead of dropping it", () => {
  assert.equal(buildTeamLinkHref("ABCD1234"), "/agency?invite=ABCD1234");
});

test("buildTeamLinkHref encodes special characters safely", () => {
  assert.equal(buildTeamLinkHref("AB CD/12"), "/agency?invite=AB%20CD%2F12");
});

test("buildTeamLinkHref trims whitespace around the code", () => {
  assert.equal(buildTeamLinkHref("  CODE1  "), "/agency?invite=CODE1");
});

test("buildTeamLinkHref falls back to plain /agency when there is no code", () => {
  assert.equal(buildTeamLinkHref(""), "/agency");
  assert.equal(buildTeamLinkHref(null), "/agency");
  assert.equal(buildTeamLinkHref(undefined), "/agency");
});

test("isAlreadyLinkedToInviter is true only when the viewer's own relationship matches the inviter's username", () => {
  const myRelationship = { parentCreator: { username: "janecreator" } };
  assert.equal(isAlreadyLinkedToInviter(myRelationship, "janecreator"), true);
  assert.equal(isAlreadyLinkedToInviter(myRelationship, "othercreator"), false);
});

test("isAlreadyLinkedToInviter is false when there is no existing relationship or no inviter username", () => {
  assert.equal(isAlreadyLinkedToInviter(null, "janecreator"), false);
  assert.equal(isAlreadyLinkedToInviter({}, "janecreator"), false);
  assert.equal(isAlreadyLinkedToInviter({ parentCreator: { username: "janecreator" } }, ""), false);
  assert.equal(isAlreadyLinkedToInviter({ parentCreator: { username: "janecreator" } }, undefined), false);
});
