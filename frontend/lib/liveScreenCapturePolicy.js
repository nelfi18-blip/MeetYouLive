// Presentation policy only: never grants access, joins media, or charges entry.
// Protect the restricted room including its access gate. A free public Live
// stays outside this policy, regardless of who is watching it.
// During a route transition React may still render the previous Live until
// the replacement metadata arrives. Keep that visible sensitive content secure.
export function isSensitiveLiveScreen(live) {
  return Boolean(live &&
    (live.isPrivate || live.isVipOnly || Number(live.entryCost) > 0));
}
