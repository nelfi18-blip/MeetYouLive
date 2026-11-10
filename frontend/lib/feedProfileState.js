export function shouldShowFeedProfileIncompleteState(showEmptyState, viewerProfileStatus = null) {
  if (!showEmptyState) return false;
  const missingFields = Array.isArray(viewerProfileStatus?.missingFields)
    ? viewerProfileStatus.missingFields
    : [];
  return viewerProfileStatus?.profileComplete === false || missingFields.length > 0;
}

// Mandatory Discovery gender-preference gate: Discovery must never be usable
// until the viewer has explicitly confirmed Men/Women/Both. This is
// independent of profile completeness/loading state so callers must combine
// it with their own loading check (e.g. `shouldShowDiscoveryPreferenceGate(status) && !isLoading`).
export function shouldShowDiscoveryPreferenceGate(viewerProfileStatus = null) {
  if (viewerProfileStatus?.preferenceCompletionNeeded !== true) return false;
  // The backend's preferenceCompletionNeeded also includes a missing
  // *profile gender*. Repeating "Who do you want to meet?" cannot fill that
  // field and traps incomplete accounts in an endless choice loop.
  if (viewerProfileStatus.interestedInConfirmed === true) return false;
  const pending = viewerProfileStatus.missingPreferenceFields;
  return !Array.isArray(pending) || pending.includes("interestedIn");
}

// Keep an incomplete account out of the Discover deck when the underlying
// profile is missing the photograph or gender that the preference chooser
// cannot supply. Use the existing "Complete profile" action, not another modal.
export function shouldShowDiscoveryProfileSetupGate(viewerProfileStatus = null) {
  const missing = viewerProfileStatus?.missingFields;
  return Array.isArray(missing) && (missing.includes("photo") || missing.includes("gender"));
}
