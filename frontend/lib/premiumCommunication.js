import { getCallFlowForPeer } from "@/lib/callRules";

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

export function isCreatorCommunicationFlow(peer) {
  return getCallFlowForPeer({ peer }).flow === "paid_creator";
}

export function getPremiumCommunicationAvailability({ isMatch = false, peer = null } = {}) {
  const callFlow = getCallFlowForPeer({ peer, isMatch });
  const creatorFlow = callFlow.flow === "paid_creator";
  const matchReady = Boolean(isMatch);

  return {
    phase: PREMIUM_COMMUNICATION_PHASE,
    flow: creatorFlow ? "creator_independent" : "social_match",
    callType: callFlow.type,
    creatorFlow,
    matchReady,
    requiresMatch: !creatorFlow,
    showSocialVoiceAction: !creatorFlow && matchReady,
    showSocialVideoAction: !creatorFlow && matchReady,
    voiceActionEnabled: !creatorFlow && matchReady,
    videoActionEnabled: !creatorFlow && matchReady,
    reason: callFlow.canStart ? "ready" : "match_required",
  };
}

export function getPremiumCallEndedMessageKey(reason) {
  if (reason === "permission_denied") return "chatPremium.premiumCallPermissionDenied";
  if (reason === "reconnecting") return "chatPremium.premiumCallReconnecting";
  return "chatPremium.premiumCallEndedElegant";
}
