export function shouldShowFeedProfileIncompleteState(showEmptyState, viewerProfileStatus = null) {
  if (!showEmptyState) return false;
  const missingFields = Array.isArray(viewerProfileStatus?.missingFields)
    ? viewerProfileStatus.missingFields
    : [];
  return viewerProfileStatus?.profileComplete === false || missingFields.length > 0;
}
