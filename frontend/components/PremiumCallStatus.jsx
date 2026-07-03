"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { getPremiumCallEndedMessageKey, PREMIUM_CALL_STATES } from "@/lib/premiumCommunication";

const STATE_LABEL_KEYS = {
  [PREMIUM_CALL_STATES.WAITING]: "chatPremium.premiumCallWaiting",
  [PREMIUM_CALL_STATES.RINGING]: "chatPremium.premiumCallRinging",
  [PREMIUM_CALL_STATES.CONNECTING]: "chatPremium.premiumCallConnecting",
  [PREMIUM_CALL_STATES.CONNECTED]: "chatPremium.premiumCallConnected",
  [PREMIUM_CALL_STATES.RECONNECTING]: "chatPremium.premiumCallReconnecting",
  [PREMIUM_CALL_STATES.ENDED]: "chatPremium.premiumCallEndedElegant",
};

export function PremiumCallStatus({ state = PREMIUM_CALL_STATES.WAITING }) {
  const { t } = useLanguage();
  const labelKey = STATE_LABEL_KEYS[state] || STATE_LABEL_KEYS[PREMIUM_CALL_STATES.WAITING];

  return (
    <p className="premium-call-status" aria-live="polite">
      {t(labelKey)}
    </p>
  );
}

export function PremiumCallEndedMessage({ reason }) {
  const { t } = useLanguage();

  return (
    <p className="premium-call-ended-message" aria-live="polite">
      {t(getPremiumCallEndedMessageKey(reason))}
    </p>
  );
}

export function MediaPermissionGuard({ allowed = true, children }) {
  const { t } = useLanguage();

  if (!allowed) {
    return (
      <p className="premium-media-permission-message" role="alert">
        {t("chatPremium.premiumCallPermissionDenied")}
      </p>
    );
  }

  return children;
}
