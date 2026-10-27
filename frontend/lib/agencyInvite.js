// Pure helpers for the personal-invite-link flow (/agency/invite?code=X -> /agency?invite=X).
// Extracted so the "preserve the invite code" and "don't duplicate an existing agreement"
// logic can be unit-tested without rendering the full React pages.

/**
 * Builds the "Ir a Mi equipo" destination for an already-logged-in visitor on the public
 * invite landing page, preserving the invite code instead of dropping it.
 */
export function buildTeamLinkHref(code) {
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (!trimmed) return "/agency";
  return `/agency?invite=${encodeURIComponent(trimmed)}`;
}

/**
 * True when the viewer's own sub-creator relationship (if any) already belongs to the same
 * inviter referenced by the preserved `?invite=` code — used to avoid showing a duplicate
 * "ask them to invite you" banner when the real agreement card is already on screen.
 */
export function isAlreadyLinkedToInviter(myRelationship, inviterUsername) {
  const relUsername = myRelationship?.parentCreator?.username;
  if (!relUsername || !inviterUsername) return false;
  return relUsername === inviterUsername;
}

