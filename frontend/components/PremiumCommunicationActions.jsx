"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { getPremiumCommunicationAvailability } from "@/lib/premiumCommunication";

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.08 4.18 2 2 0 014.06 2h3a2 2 0 012 1.72c.12.9.33 1.78.63 2.63a2 2 0 01-.45 2.11L8 9.7a16 16 0 006.3 6.3l1.24-1.24a2 2 0 012.11-.45c.85.3 1.73.51 2.63.63A2 2 0 0122 16.92z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

/**
 * Match-gated, disabled Phase 3 premium communication actions.
 * `peer` is the other chat participant and can be null while chat metadata loads.
 */
export default function PremiumCommunicationActions({
  isMatch,
  peer,
  onStartCall,
  className = "",
  buttonClassName = "",
}) {
  const { t } = useLanguage();
  const availability = getPremiumCommunicationAvailability({ isMatch, peer });

  if (!availability.showSocialVoiceAction && !availability.showSocialVideoAction) {
    return null;
  }

  return (
    <div className={className} aria-label={t("chatPremium.premiumCommunicationActionsAria")}>
      {availability.showSocialVoiceAction && (
        <button
          type="button"
          className={buttonClassName}
          title={t("chatPremium.startVoiceCall")}
          aria-label={t("chatPremium.startVoiceCall")}
          onClick={() => onStartCall?.("audio")}
          disabled={!availability.voiceActionEnabled}
        >
          <PhoneIcon />
        </button>
      )}
      {availability.showSocialVideoAction && (
        <button
          type="button"
          className={buttonClassName}
          title={t("chatPremium.startVideoCall")}
          aria-label={t("chatPremium.startVideoCall")}
          onClick={() => onStartCall?.("video")}
          disabled={!availability.videoActionEnabled}
        >
          <VideoIcon />
        </button>
      )}
    </div>
  );
}
