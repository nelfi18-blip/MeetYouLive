/**
 * Pure helpers to derive Battle VS UI state from a GET /api/lives/:id/vs-status
 * response. Kept separate from LiveVsBattlePanel so the recovery/fallback logic
 * (used after a refresh or a missed socket event) can be unit tested in isolation.
 */

/**
 * Builds the "active VS" recovery patch from a vs-status payload, or null when
 * there is no active battle to recover.
 */
export function deriveActiveVsState(data) {
  if (!data || !data.isVsActive || !data.opponent) return null;
  return {
    vsActive: true,
    vsStartTime: data.vsStartTime,
    vsDuration: data.vsDuration || 0,
    myScore: data.vsScore?.host || 0,
    theirScore: data.vsScore?.opponent || 0,
    opponentIdentity: data.opponent,
  };
}

/**
 * Builds the "incoming challenge" recovery patch (current live is the one being
 * challenged) from a vs-status payload, or null when there is none to recover.
 */
export function deriveIncomingChallenge(data, isCreator) {
  if (!isCreator || !data || !data.challenger) return null;
  return {
    challengeId: data.vsChallenge?.challengeId,
    challengerUsername: data.challenger.username,
    challengerAvatar: data.challenger.avatar,
    durationMinutes: data.vsChallenge?.durationMinutes,
  };
}

/**
 * Builds the "outgoing challenge" recovery patch (current live is the challenger
 * that is still waiting for a response) from a vs-status payload, or null when
 * there is none to recover.
 */
export function deriveOutgoingChallenge(data, isCreator) {
  if (!isCreator || !data || !data.challengeOpponent) return null;
  return {
    challengeId: data.vsChallenge?.challengeId,
    opponentUsername: data.challengeOpponent.username,
  };
}
