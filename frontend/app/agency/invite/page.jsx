"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0a0a0f 0%,#0d0b1a 60%,#0a0a0f 100%)",
    color: "#e2e8f0",
    padding: "24px 16px",
    fontFamily: "system-ui,-apple-system,sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(168,85,247,0.25)",
    backdropFilter: "blur(12px)",
    borderRadius: 18,
    padding: 28,
    textAlign: "center",
  },
};

/**
 * Public landing page for a creator's personal invite link
 * (/agency/invite?code=XXXX). Never creates or mutates any AgencyRelationship
 * itself — it only displays the inviter's identity and routes the visitor
 * (new or already-registered) toward the right next step, preserving the
 * invite context instead of silently dropping it.
 */
function InviteLandingContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const code = (searchParams.get("code") || "").trim();
  const [status, setStatus] = useState("loading"); // loading | valid | invalid
  const [inviter, setInviter] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!getToken());
  }, []);

  useEffect(() => {
    if (!code) { setStatus("invalid"); return; }
    let cancelled = false;
    fetch(`${apiUrl}/api/agency/invite-info?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.valid && data.creator) {
          setInviter(data.creator);
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => { if (!cancelled) setStatus("invalid"); });
    return () => { cancelled = true; };
  }, [code]);

  if (status === "loading") {
    return (
      <div style={S.page}>
        <div style={S.card} role="status" aria-live="polite">
          <p style={{ color: "#94a3b8" }}>{t("agency.inviteLanding.loading")}</p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t("agency.inviteLanding.invalidTitle")}</h1>
          <p style={{ color: "#94a3b8", marginBottom: 20 }}>{t("agency.inviteLanding.invalidDescription")}</p>
          <Link
            href="/"
            style={{
              display: "inline-block", padding: "10px 20px", borderRadius: 10,
              background: "linear-gradient(135deg,#a855f7,#6366f1)", color: "#fff",
              textDecoration: "none", fontWeight: 600, fontSize: 14,
            }}
          >
            {t("agency.inviteLanding.backHome")}
          </Link>
        </div>
      </div>
    );
  }

  const inviterName = inviter?.name || inviter?.username || "";
  const callbackPath = `/agency/invite?code=${encodeURIComponent(code)}`;

  return (
    <div style={S.page}>
      <div style={S.card}>
        {inviter?.avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={inviter.avatar}
            alt=""
            style={{ width: 72, height: 72, borderRadius: "50%", border: "2px solid #a855f7", marginBottom: 14 }}
          />
        )}
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>{t("agency.inviteLanding.title")}</h1>
        <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>
          {t("agency.inviteLanding.invitedByLabel")}
        </div>
        <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: 17, marginBottom: 18 }}>
          {inviterName}
          {inviter?.agencyName ? ` · ${inviter.agencyName}` : ""}
        </div>

        {isLoggedIn ? (
          <>
            <p style={{ color: "#94a3b8", fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>
              {t("agency.inviteLanding.loggedInMessage").replace("{name}", inviterName)}
            </p>
            <Link
              href="/agency"
              style={{
                display: "inline-block", padding: "10px 22px", borderRadius: 10,
                background: "linear-gradient(135deg,#a855f7,#6366f1)", color: "#fff",
                textDecoration: "none", fontWeight: 600, fontSize: 14,
              }}
            >
              {t("agency.inviteLanding.goToTeam")}
            </Link>
          </>
        ) : (
          <>
            <p style={{ color: "#94a3b8", fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>
              {t("agency.inviteLanding.notLoggedInMessage").replace("{name}", inviterName)}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={`/register?creatorInvite=${encodeURIComponent(code)}`}
                style={{
                  display: "inline-block", padding: "10px 20px", borderRadius: 10,
                  background: "linear-gradient(135deg,#a855f7,#6366f1)", color: "#fff",
                  textDecoration: "none", fontWeight: 600, fontSize: 14,
                }}
              >
                {t("agency.inviteLanding.createAccount")}
              </Link>
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}
                style={{
                  display: "inline-block", padding: "10px 20px", borderRadius: 10,
                  background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.4)",
                  color: "#818cf8", textDecoration: "none", fontWeight: 600, fontSize: 14,
                }}
              >
                {t("agency.inviteLanding.login")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function InviteLandingPage() {
  return (
    <Suspense fallback={<div style={S.page} />}>
      <InviteLandingContent />
    </Suspense>
  );
}
