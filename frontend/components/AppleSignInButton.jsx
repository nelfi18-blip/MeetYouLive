"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { isNativeAppleSignInAvailable, signInWithNativeApple, appleSignInErrorKey } from "@/lib/nativeAppleSignIn";
import { setToken } from "@/lib/token";

export default function AppleSignInButton({ ageConfirmed, refCode, agencyCode, disabled, onBusyChange, onSuccess, onError }) {
  const { t } = useLanguage();
  const [available, setAvailable] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const adult = ageConfirmed ?? confirmed;

  useEffect(() => { setAvailable(isNativeAppleSignInAvailable()); }, []);
  if (!available) return null;

  async function handleSignIn() {
    if (inFlight.current) return;
    if (!adult) { onError(t("auth.ageConfirmationRequired")); return; }
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    onError("");
    try {
      const data = await signInWithNativeApple({ ageConfirmed: adult, ref: refCode, agencyCode });
      setToken(data.token);
      window.dispatchEvent(new CustomEvent("meetyoulive:native-session-restored"));
      onSuccess(data);
    } catch (error) {
      // Never log native errors or credential payloads.
      onError(t(appleSignInErrorKey(error?.code)));
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="apple-auth">
      {ageConfirmed === undefined && (
        <label className="apple-age">
          <input type="checkbox" checked={confirmed} disabled={busy || disabled}
            onChange={(event) => setConfirmed(event.target.checked)} />
          <span>{t("auth.ageConfirmation")}</span>
        </label>
      )}
      <button type="button" className="apple-button" onClick={handleSignIn}
        disabled={busy || disabled || !adult} aria-busy={busy}>
        <svg width="20" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.3.74 3.1.8 1.21-.25 2.37-.94 3.66-.85 1.55.12 2.72.74 3.49 1.86-3.2 1.92-2.44 6.13.49 7.31-.59 1.54-1.35 3.07-2.75 3.86l.01-.01zM12.03 7.25c-.15-2.29 1.71-4.18 3.85-4.36.3 2.65-2.4 4.63-3.85 4.36z" />
        </svg>
        <span>{t("auth.appleButton")}</span>
      </button>
      {busy && <p role="status">{t("auth.connectingApple")}</p>}
      <style jsx>{`
        .apple-auth { margin: 0 0 1rem; }
        .apple-age { display: flex; align-items: flex-start; gap: .6rem; margin: .8rem 0; color: var(--text); font-size: .85rem; }
        .apple-age input { width: 20px; height: 20px; flex-shrink: 0; }
        .apple-button { display: flex; align-items: center; justify-content: center; gap: .65rem; width: 100%; min-height: 48px; padding: 12px 16px; border: 1px solid #fff; border-radius: 8px; background: #000; color: #fff; font: 500 17px -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; }
        .apple-button:disabled { opacity: .5; cursor: not-allowed; }
        .apple-button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        p { color: var(--text-muted); font-size: .85rem; text-align: center; }
      `}</style>
    </div>
  );
}
