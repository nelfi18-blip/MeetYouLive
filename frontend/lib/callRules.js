import { isApprovedCreator } from "@/lib/creatorUtils";

export const CALL_TYPES = Object.freeze({
  SOCIAL: "social",
  PAID_CREATOR: "paid_creator",
});

export function isPaidCreatorCallCandidate(user) {
  return isApprovedCreator(user) && Boolean(user?.creatorProfile?.privateCallEnabled);
}

export function getCallFlowForPeer({ peer, isMatch = false } = {}) {
  const creatorFlow = isPaidCreatorCallCandidate(peer);
  if (creatorFlow) {
    return {
      type: CALL_TYPES.PAID_CREATOR,
      flow: "paid_creator",
      requiresMatch: false,
      canStart: true,
    };
  }
  return {
    type: CALL_TYPES.SOCIAL,
    flow: "social",
    requiresMatch: true,
    canStart: Boolean(isMatch),
  };
}

export function canStartSocialCall(isMatch) {
  return Boolean(isMatch);
}
