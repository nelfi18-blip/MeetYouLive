export const PREMIUM_COMMUNICATION_PHASE = "phase_3_frontend_contract";

export const PREMIUM_CALL_STATES = Object.freeze({
  WAITING: "waiting",
  RINGING: "ringing",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  ENDED: "ended",
});

export const PREMIUM_COMMUNICATION_RULES = Object.freeze({
  socialCallsRequireMatch: true,
  socialVideoCallsRequireMatch: true,
  keepCallsInsideMeetYouLive: true,
  hideSessionLimitFromUser: true,
  creatorFlowIsIndependent: true,
  backendControlsFutureDurationLimit: true,
  externalContactSharingAllowed: false,
});

const CREATOR_ROLES = new Set(["creator"]);

export function isCreatorCommunicationFlow(peer) {
  if (!peer) return false;
  return CREATOR_ROLES.has(peer.role);
}

export function getPremiumCommunicationAvailability({ isMatch = false, peer = null } = {}) {
  const creatorFlow = isCreatorCommunicationFlow(peer);
  const matchReady = Boolean(isMatch);

  return {
    phase: PREMIUM_COMMUNICATION_PHASE,
    flow: creatorFlow ? "creator_independent" : "social_match",
    creatorFlow,
    matchReady,
    requiresMatch: !creatorFlow,
    showSocialVoiceAction: matchReady,
    showSocialVideoAction: matchReady,
    voiceActionEnabled: false,
    videoActionEnabled: false,
    reason: matchReady ? "future_phase_ready" : "match_required",
  };
}

export function getPremiumCallEndedMessageKey(reason) {
  if (reason === "permission_denied") return "chatPremium.premiumCallPermissionDenied";
  if (reason === "reconnecting") return "chatPremium.premiumCallReconnecting";
  return "chatPremium.premiumCallEndedElegant";
}
