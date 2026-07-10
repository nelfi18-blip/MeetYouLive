"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MODAL_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const REPORT_REASONS = [
  "Spam",
  "Fake profile",
  "Harassment",
  "Inappropriate content",
  "Scam/Fraud",
  "Minor safety concern",
  "Other",
];

export default function ModerationActions({
  targetUserId,
  targetName = "this user",
  authToken = "",
  onBlocked,
  className = "",
  compact = false,
}) {
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const closeButtonRef = useRef(null);
  const modalCardRef = useRef(null);

  const token = useMemo(() => authToken || getToken() || "", [authToken]);
  const safeTargetName = targetName || "this user";
  const disabled = submitting || !targetUserId;

  useEffect(() => {
    if (showReport) closeButtonRef.current?.focus();
  }, [showReport]);

  const trapModalFocus = (event) => {
    if (event.key !== "Tab" || !modalCardRef.current) return;

    const focusableElements = Array.from(
      modalCardRef.current.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)
    );
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const requireToken = () => {
    if (token) return true;
    setStatus("Please sign in to use safety tools.");
    return false;
  };

  const submitReport = async () => {
    if (!targetUserId || !requireToken()) return;
    const trimmedDetails = details.trim();
    const finalReason = reason === "Other" && trimmedDetails ? `Other: ${trimmedDetails}` : reason;
    if (!window.confirm(`Report ${safeTargetName} for "${finalReason}"?`)) return;

    setSubmitting(true);
    setStatus("");
    try {
      const response = await fetch(`${API_URL}/api/moderation/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          targetType: "user",
          targetId: targetUserId,
          reason: finalReason,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not submit report.");
      }
      setStatus("Report submitted. Thank you for helping keep MeetYouLive safe.");
      setShowReport(false);
      setReason(REPORT_REASONS[0]);
      setDetails("");
    } catch (error) {
      setStatus(error.message || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  const blockUser = async () => {
    if (!targetUserId || !requireToken()) return;
    if (!window.confirm(`Block ${safeTargetName}? You will no longer see or message each other.`)) return;

    setSubmitting(true);
    setStatus("");
    try {
      const response = await fetch(`${API_URL}/api/moderation/users/${encodeURIComponent(targetUserId)}/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not block user.");
      }
      setStatus(`${safeTargetName} has been blocked.`);
      try {
        await onBlocked?.(targetUserId);
      } catch {
        setStatus(`${safeTargetName} has been blocked. Refresh if the page does not update.`);
      }
    } catch (error) {
      setStatus(error.message || "Could not block user.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`moderation-actions${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}>
      <div className="moderation-actions__buttons">
        <button type="button" onClick={() => setShowReport(true)} disabled={disabled}>
          Report user
        </button>
        <button type="button" className="danger" onClick={blockUser} disabled={disabled}>
          Block user
        </button>
      </div>

      {showReport && (
        <div
          className="moderation-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="moderation-report-title"
          aria-describedby="moderation-report-description"
          onKeyDown={trapModalFocus}
        >
          <div className="moderation-modal__card" ref={modalCardRef}>
            <button
              ref={closeButtonRef}
              type="button"
              className="moderation-modal__close"
              onClick={() => setShowReport(false)}
              aria-label="Close report dialog"
              disabled={submitting}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
            <h3 id="moderation-report-title">Report user</h3>
            <p id="moderation-report-description">Select a reason before confirming your report.</p>
            <label>
              Reason
              <select value={reason} onChange={(event) => setReason(event.target.value)} disabled={submitting}>
                {REPORT_REASONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            {reason === "Other" && (
              <label>
                Details
                <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={500} disabled={submitting} />
              </label>
            )}
            <div className="moderation-modal__actions">
              <button type="button" onClick={() => setShowReport(false)} disabled={submitting}>Cancel</button>
              <button type="button" className="danger" onClick={submitReport} disabled={submitting}>Submit report</button>
            </div>
          </div>
        </div>
      )}

      {status && <p className="moderation-actions__status" aria-live="polite">{status}</p>}

      <style jsx>{`
        .moderation-actions {
          width: 100%;
        }
        .moderation-actions__buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          align-items: center;
        }
        .moderation-actions.compact .moderation-actions__buttons {
          gap: 0.4rem;
        }
        button {
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.72);
          color: #f8fafc;
          cursor: pointer;
          font-weight: 800;
          padding: 0.62rem 0.95rem;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .compact button {
          font-size: 0.78rem;
          padding: 0.48rem 0.7rem;
        }
        button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(224, 64, 251, 0.55);
          background: rgba(224, 64, 251, 0.16);
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.58;
        }
        .danger {
          border-color: rgba(248, 113, 113, 0.35);
          color: #fecaca;
        }
        .moderation-actions__status {
          color: #c4b5fd;
          font-size: 0.82rem;
          font-weight: 700;
          margin: 0.45rem 0 0;
        }
        .moderation-modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          background: rgba(2, 6, 23, 0.72);
          padding: 1rem;
        }
        .moderation-modal__card {
          position: relative;
          width: min(420px, 100%);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 24px;
          background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(49, 12, 67, 0.98));
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
          color: #f8fafc;
          padding: 1.25rem;
        }
        .moderation-modal__close {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          width: 2rem;
          height: 2rem;
          display: grid;
          place-items: center;
          padding: 0;
        }
        h3 {
          margin: 0 0 0.35rem;
        }
        p {
          color: #cbd5e1;
          margin: 0 0 1rem;
        }
        label {
          display: grid;
          gap: 0.4rem;
          color: #e2e8f0;
          font-weight: 800;
          margin-top: 0.75rem;
        }
        select,
        textarea {
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.78);
          color: #fff;
          padding: 0.78rem;
        }
        textarea {
          min-height: 96px;
          resize: vertical;
        }
        .moderation-modal__actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.6rem;
          margin-top: 1rem;
        }
      `}</style>
    </div>
  );
}
