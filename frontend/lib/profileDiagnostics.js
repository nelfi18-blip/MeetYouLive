const PROFILE_FLOW_DIAGNOSTIC_LABEL = "[profile-flow]";

export function getProfileFlowDiagnostics() {
  if (typeof window === "undefined") return null;
  if (!window.__MEETYOULIVE_PROFILE_FLOW_DIAGNOSTICS__) {
    window.__MEETYOULIVE_PROFILE_FLOW_DIAGNOSTICS__ = {
      renders: 0,
      loads: 0,
      loadResponses: 0,
      saves: 0,
      saveResponses: 0,
      sessionRefreshes: 0,
      clientErrors: 0,
      uploads: 0,
      uploadResponses: 0,
    };
  }
  return window.__MEETYOULIVE_PROFILE_FLOW_DIAGNOSTICS__;
}

export function logProfileFlowDiagnostic(event, details = {}) {
  const diagnostics = getProfileFlowDiagnostics();
  if (!diagnostics) return;
  console.info(PROFILE_FLOW_DIAGNOSTIC_LABEL, {
    event,
    ...details,
    counts: { ...diagnostics },
    timestamp: new Date().toISOString(),
  });
}
