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
  return viewerProfileStatus?.preferenceCompletionNeeded === true;
}
