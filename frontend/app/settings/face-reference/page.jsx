"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { getFaceReferenceStatus, deleteFaceReference } from "@/lib/photoVerification";

/**
 * Privacy control page for the "Perfil Auténtico" reusable facial
 * reference: lets the user see whether one exists (non-biometric metadata
 * only — never the image, video, or vector itself) and withdraw consent by
 * requesting its deletion. This is the accessible path required by the
 * consent rules in VerifyPhotoFlow.jsx — the reference can ONLY be created
 * there, with explicit opt-in, but can always be reviewed/removed here.
 */
export default function FaceReferenceSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const { t, lang } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [reference, setReference] = useState(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (status === "unauthenticated" && !token) {
      router.replace("/login");
    }
  }, [status, token, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getFaceReferenceStatus();
      setReference(data);
    } catch (err) {
      setError(err.message || t("profile.photoVerification.reference.deleteError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined" && !window.confirm(t("profile.photoVerification.reference.deleteConfirm"))) {
      return;
    }
    setDeleting(true);
    setDeleteMessage("");
    setError("");
    try {
      await deleteFaceReference();
      setDeleteMessage(t("profile.photoVerification.reference.deleteSuccess"));
      await load();
    } catch (err) {
      setError(err.message || t("profile.photoVerification.reference.deleteError"));
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleDateString(lang || undefined);
    } catch {
      return String(value);
    }
  };

  const formatTemplate = (template, params) =>
    Object.entries(params).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, value ?? ""), template);

  if (status === "loading" || loading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0f1a" }}>
        <p style={{ color: "#aaa" }}>{t("common.loading")}</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page">
        <header className="header">
          <button className="back-btn" onClick={() => router.back()}>{t("notificationSettings.page.back")}</button>
          <h1>{t("settingsPage.faceReference")}</h1>
        </header>

        <section className="card">
          <p className="section-title">{t("profile.photoVerification.reference.sectionTitle")}</p>
          <p className="row-sub">{t("profile.photoVerification.reference.sectionBody")}</p>

          {error && <p className="error-msg">{error}</p>}
          {deleteMessage && <p className="success-msg">{deleteMessage}</p>}

          {reference?.hasReference ? (
            <>
              <p className="row-title">
                {formatTemplate(t("profile.photoVerification.reference.activeSince"), {
                  date: formatDate(reference.consentedAt),
                  expiresAt: formatDate(reference.retentionExpiresAt),
                })}
              </p>
              <button className="danger-btn" onClick={handleDelete} disabled={deleting}>
                {deleting ? t("profile.photoVerification.reference.deleting") : t("profile.photoVerification.reference.deleteButton")}
              </button>
            </>
          ) : (
            <p className="row-sub">{t("profile.photoVerification.reference.none")}</p>
          )}
        </section>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #0f0f1a;
          color: #fff;
          padding: 20px 16px 80px;
          max-width: 480px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }
        .header h1 {
          font-size: 1.25rem;
          font-weight: 700;
          flex: 1;
          margin: 0;
        }
        .back-btn {
          background: none;
          border: none;
          color: #a78bfa;
          font-size: 0.9rem;
          cursor: pointer;
          padding: 4px 0;
          white-space: nowrap;
        }
        .card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .section-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 0 0 12px;
        }
        .row-title {
          margin: 0.5rem 0 0.75rem;
          font-size: 0.95rem;
          font-weight: 600;
        }
        .row-sub {
          margin: 0;
          font-size: 0.85rem;
          color: #888;
        }
        .error-msg {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          border-radius: 8px;
          padding: 10px 14px;
          color: #fca5a5;
          font-size: 0.85rem;
          margin: 12px 0;
        }
        .success-msg {
          background: rgba(74, 222, 128, 0.15);
          border: 1px solid rgba(74, 222, 128, 0.4);
          border-radius: 8px;
          padding: 10px 14px;
          color: #86efac;
          font-size: 0.85rem;
          margin: 12px 0;
        }
        .danger-btn {
          border: none;
          border-radius: 999px;
          padding: 10px 16px;
          font-weight: 700;
          color: white;
          background: #b91c1c;
          cursor: pointer;
        }
        .danger-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </main>
  );
}
