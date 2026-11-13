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
export function isAlreadyLinkedToInviter(myRelationship, inviter) {
  const parent = myRelationship?.parentCreator;
  if (!parent || !inviter) return false;

  // New privacy-safe invite payloads provide a stable ID and a public
  // nickname. A nickname is presentation only and must NEVER be compared
  // with the stored internal username.
  if (typeof inviter === "object") {
    const inviterId = inviter.id || inviter._id;
    const parentId = parent._id || parent.id;
    return Boolean(inviterId && parentId && String(inviterId) === String(parentId));
  }

  // Compatibility with older callers that explicitly passed a username.
  return Boolean(parent.username && parent.username === inviter);
}

