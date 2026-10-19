"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  isPhotoVerificationFeatureEnabled,
  startPhotoVerificationSession,
  completePhotoVerificationSession,
} from "@/lib/photoVerification";
import { getPhotoVerificationCapability } from "@/lib/photoVerificationCapability";

const AMPLIFY_REGION = process.env.NEXT_PUBLIC_AWS_REKOGNITION_REGION || "";
const AMPLIFY_IDENTITY_POOL_ID = process.env.NEXT_PUBLIC_AWS_IDENTITY_POOL_ID || "";

/**
 * "Verificar mi foto" — voluntary, consent-gated selfie liveness check
 * against the user's persisted primary photo.
 *
 * The backend is the sole authority on the result (see
 * backend/src/services/photoVerification.service.js); this component only
 * ever renders whatever status the server returns and NEVER marks the user
 * as verified on its own. If the AWS Amplify Face Liveness capture widget is
 * unavailable or unverified for the current environment (see
 * getPhotoVerificationCapability), we show a clear "not available here"
 * state instead of simulating a liveness check.
 */
export default function VerifyPhotoFlow({ user, onStatusChange }) {
  const { t } = useLanguage();
  const [step, setStep] = useState("idle"); // idle | consent | capturing | result
  const [session, setSession] = useState(null);
  const [capability, setCapability] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);

  const status = user?.photoVerification?.status || "none";
  const hasPrimaryPhoto = Boolean(user?.primaryPhoto);

  const openConsent = () => {
    setError("");
    setOutcome(null);
    setCapability(getPhotoVerificationCapability());
    setStep("consent");
  };

  const closeFlow = () => {
    setStep("idle");
    setSession(null);
    setError("");
  };

  const handleConsent = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await startPhotoVerificationSession(true);
      setSession(result);
      setStep("capturing");
    } catch (err) {
      setError(err.message || t("profile.photoVerification.genericError"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const handleCaptureFinished = useCallback(async () => {
    if (!session?.sessionId) return;
    setBusy(true);
    setError("");
    try {
      const result = await completePhotoVerificationSession(session.sessionId);
      setOutcome(result.status);
      setStep("result");
      onStatusChange?.(result.status);
    } catch (err) {
      setError(err.message || t("profile.photoVerification.genericError"));
      setStep("result");
      setOutcome("error");
    } finally {
      setBusy(false);
    }
  }, [session, onStatusChange, t]);

  if (!isPhotoVerificationFeatureEnabled()) return null;
  if (status === "verified") return null; // badge is shown elsewhere once verified
  if (!hasPrimaryPhoto) return null;

  return (
    <div className="photo-verification">
      {step === "idle" && (
        <button type="button" className="btn btn-secondary btn-sm photo-verification-cta" onClick={openConsent}>
          🛡️ {t("profile.photoVerification.cta")}
        </button>
      )}

      {step !== "idle" && (
        <div className="photo-verification-modal-backdrop" role="dialog" aria-modal="true">
          <div className="photo-verification-modal">
            <button type="button" className="photo-verification-close" onClick={closeFlow} aria-label={t("common.close")}>
              ×
            </button>

            {step === "consent" && (
              <>
                <h3>{t("profile.photoVerification.consentTitle")}</h3>
                <p>{t("profile.photoVerification.consentBody")}</p>
                <ul className="photo-verification-consent-points">
                  <li>{t("profile.photoVerification.consentPointSelfieNotStored")}</li>
                  <li>{t("profile.photoVerification.consentPointServerDecision")}</li>
                  <li>{t("profile.photoVerification.consentPointIndependent")}</li>
                </ul>
                {error && <p className="photo-verification-error">{error}</p>}
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={handleConsent}>
                  {busy ? t("profile.photoVerification.starting") : t("profile.photoVerification.consentAccept")}
                </button>
              </>
            )}

            {step === "capturing" && (
              <>
                <h3>{t("profile.photoVerification.captureTitle")}</h3>
                {capability?.supported ? (
                  <AmplifyLivenessCapture
                    sessionId={session?.rekognitionSessionId}
                    region={AMPLIFY_REGION}
                    identityPoolId={AMPLIFY_IDENTITY_POOL_ID}
                    onFinished={handleCaptureFinished}
                    onError={(message) => setError(message)}
                  />
                ) : (
                  <p className="photo-verification-unsupported">
                    {t("profile.photoVerification.unsupportedDevice")}
                  </p>
                )}
                {error && <p className="photo-verification-error">{error}</p>}
              </>
            )}

            {step === "result" && (
              <>
                {outcome === "verified" && <p>✅ {t("profile.photoVerification.resultVerified")}</p>}
                {outcome === "review" && <p>🕵️ {t("profile.photoVerification.resultReview")}</p>}
                {outcome === "failed" && <p>↻ {t("profile.photoVerification.resultFailed")}</p>}
                {outcome === "error" && <p>⚠️ {error || t("profile.photoVerification.genericError")}</p>}
                <button type="button" className="btn btn-secondary btn-sm" onClick={closeFlow}>
                  {t("common.close")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .photo-verification-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1200;
          padding: 1rem;
        }
        .photo-verification-modal {
          position: relative;
          background: #161622;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1.5rem;
          max-width: 420px;
          width: 100%;
        }
        .photo-verification-close {
          position: absolute;
          top: 0.5rem;
          right: 0.75rem;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 1.4rem;
          cursor: pointer;
        }
        .photo-verification-consent-points {
          font-size: 0.85rem;
          opacity: 0.85;
          padding-left: 1.1rem;
        }
        .photo-verification-error {
          color: #f87171;
          font-size: 0.85rem;
        }
        .photo-verification-unsupported {
          font-size: 0.9rem;
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}

/**
 * Dynamically loads the AWS Amplify Face Liveness capture widget. This is
 * isolated in its own component so the (large) `@aws-amplify/ui-react-liveness`
 * bundle is only ever fetched when a user actually opts into the flow AND
 * the environment passed basic capability detection.
 *
 * KNOWN LIMITATION (documented, not hidden): this widget needs temporary AWS
 * credentials in the browser (normally via an Amplify/Cognito Identity Pool)
 * to open its streaming connection to Rekognition. That identity-pool wiring
 * is NOT part of this phase-1 change — until NEXT_PUBLIC_AWS_IDENTITY_POOL_ID
 * is configured and verified on a real device, this renders a clear error
 * instead of a fake capture.
 */
function AmplifyLivenessCapture({ sessionId, region, identityPoolId, onFinished, onError }) {
  const { t } = useLanguage();
  const [Widget, setWidget] = useState(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!region || !identityPoolId) {
      setLoadError(t("profile.photoVerification.notConfigured"));
      return;
    }
    try {
      const [{ Amplify }, { FaceLivenessDetector }] = await Promise.all([
        import("aws-amplify"),
        import("@aws-amplify/ui-react-liveness"),
      ]);
      Amplify.configure({
        Auth: { Cognito: { identityPoolId, allowGuestAccess: true, region } },
      });
      setWidget(() => FaceLivenessDetector);
    } catch (err) {
      const message = t("profile.photoVerification.widgetLoadFailed");
      setLoadError(message);
      onError?.(message);
      console.error("[photo-verification] Failed to load liveness widget", err?.message);
    }
  }, [region, identityPoolId, onError, t]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) return <p className="photo-verification-error">{loadError}</p>;
  if (!Widget || !sessionId) return <p>{t("profile.photoVerification.loadingCapture")}</p>;

  return (
    <Widget
      sessionId={sessionId}
      region={region}
      onAnalysisComplete={onFinished}
      onError={(err) => onError?.(err?.message || t("profile.photoVerification.genericError"))}
    />
  );
}
