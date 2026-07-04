import { isApprovedCreator } from "@/lib/creatorUtils";

export const CALL_TYPES = Object.freeze({
  SOCIAL: "social",
  PAID_CREATOR: "paid_creator",
});

export function isPaidCreatorCallCandidate(user) {
  return isApprovedCreator(user) && Boolean(user?.creatorProfile?.privateCallEnabled);
}

export function hasMutualMatchFlag(user) {
  // Online/discovery payloads currently expose match state under different
  // names depending on the source endpoint; keep the call gate centralized here.
  return Boolean(user?.isMatch || user?.match || user?.matched);
}

export function getCallFlowForPeer({ peer, isMatch = false } = {}) {
  const creatorFlow = isPaidCreatorCallCandidate(peer);
  if (creatorFlow) {
    return {
      type: CALL_TYPES.PAID_CREATOR,
      flow: "creator_independent",
      requiresMatch: false,
      canStart: true,
    };
  }
  return {
    type: CALL_TYPES.SOCIAL,
    flow: "social_match",
    requiresMatch: true,
    canStart: Boolean(isMatch),
  };
}
