"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { calcSplit } from "@/lib/commission";
import { useLanguage } from "@/contexts/LanguageContext";
import { isAlreadyLinkedToInviter } from "@/lib/agencyInvite";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

// ─── Primitive UI helpers ────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0a0a0f 0%,#0d0b1a 60%,#0a0a0f 100%)",
    color: "#e2e8f0",
    padding: "24px 16px",
    fontFamily: "system-ui,-apple-system,sans-serif",
  },
  wrap: { maxWidth: 960, margin: "0 auto" },
  glassCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(168,85,247,0.15)",
    backdropFilter: "blur(12px)",
    borderRadius: 16,
    padding: 20,
  },
  glassCardSm: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(99,102,241,0.15)",
    backdropFilter: "blur(8px)",
    borderRadius: 12,
    padding: 14,
  },
};

const statusColor = (s) => {
  if (s === "active") return "#22c55e";
  if (s === "pending") return "#f59e0b";
  if (s === "suspended") return "#f97316";
  return "#6b7280";
};

const statusLabel = (s) => {
  if (s === "active") return "active";
  if (s === "pending") return "pending";
  if (s === "suspended") return "suspended";
  if (s === "removed") return "removed";
  return s;
};

function Badge({ status }) {
  const { t } = useLanguage();
  const c = statusColor(status);
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20,
      background: c + "22", border: `1px solid ${c}66`,
      color: c, fontSize: 12, fontWeight: 600,
    }}>
      {t(`agency.status.${statusLabel(status)}`)}
    </span>
  );
}

function StatCard({ icon, value, label, color = "#a855f7" }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}22`,
      borderRadius: 14,
      padding: "18px 16px",
      display: "flex", flexDirection: "column", gap: 4,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -20, right: -20,
        fontSize: 64, opacity: 0.05, lineHeight: 1,
      }}>{icon}</div>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function NeonButton({ onClick, disabled, children, variant = "primary", size = "md" }) {
  const bg = variant === "primary"
    ? "linear-gradient(135deg,#a855f7,#6366f1)"
    : variant === "success"
    ? "rgba(34,197,94,0.12)"
    : variant === "danger"
    ? "rgba(239,68,68,0.12)"
    : variant === "warning"
    ? "rgba(249,115,22,0.12)"
    : "rgba(99,102,241,0.12)";
  const border = variant === "primary" ? "none"
    : variant === "success" ? "1px solid rgba(34,197,94,0.4)"
    : variant === "danger" ? "1px solid rgba(239,68,68,0.4)"
    : variant === "warning" ? "1px solid rgba(249,115,22,0.4)"
    : "1px solid rgba(99,102,241,0.4)";
  const textColor = variant === "primary" ? "#fff"
    : variant === "success" ? "#86efac"
    : variant === "danger" ? "#f87171"
    : variant === "warning" ? "#fb923c"
    : "#818cf8";
  const pad = size === "sm" ? "5px 12px" : "9px 18px";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#1a1a2e" : bg,
        border, color: disabled ? "#4b5563" : textColor,
        borderRadius: 8, padding: pad,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: size === "sm" ? 12 : 13, fontWeight: 600,
        transition: "opacity 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// ─── Invite link block ───────────────────────────────────────────────────────

function InviteLinkSection({ agencyCode, inviterName }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const inviteUrl = typeof window !== "undefined"
    ? `${window.location.origin}/register?creatorInvite=${agencyCode}`
    : `/register?creatorInvite=${agencyCode}`;
  const shareText = t("agency.shareNativeText").replace("{name}", inviterName || "");

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true); setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    });
  };

  const handleWhatsAppShare = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${inviteUrl}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: t("agency.inviteLinkTitle"), text: shareText, url: inviteUrl });
      } catch {
        /* user cancelled the native share sheet — nothing to do */
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div style={{
      background: "rgba(168,85,247,0.06)",
      border: "1px solid rgba(168,85,247,0.25)",
      borderRadius: 12, padding: 16, marginTop: 16,
    }}>
      <div style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        🔗 {t("agency.inviteLinkTitle")}
      </div>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>
        {t("agency.inviteLinkDescriptionLine1")}
        {" "}
        {t("agency.inviteLinkDescriptionLine2")}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: 0,
          background: "#0a0a0f",
          border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 8, padding: "8px 12px",
          fontSize: 12, color: "#818cf8", wordBreak: "break-all",
          fontFamily: "monospace",
        }}>
          {inviteUrl}
        </div>
        <NeonButton onClick={handleCopy} variant={copied ? "success" : copyError ? "danger" : "secondary"}>
          {copied ? `✅ ${t("agency.copied")}` : copyError ? `❌ ${t("common.error")}` : `📋 ${t("agency.copy")}`}
        </NeonButton>
        <button
          type="button"
          onClick={handleWhatsAppShare}
          aria-label={t("agency.shareWhatsApp")}
          style={{
            background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.4)",
            color: "#25d366", borderRadius: 8, padding: "9px 14px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          }}
        >
          💬 {t("agency.shareWhatsApp")}
        </button>
        <button
          type="button"
          onClick={handleNativeShare}
          aria-label={t("agency.shareNative")}
          style={{
            background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.4)",
            color: "#818cf8", borderRadius: 8, padding: "9px 14px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          }}
        >
          📤 {t("agency.shareNative")}
        </button>
      </div>
    </div>
  );
}

// ─── Split preview ───────────────────────────────────────────────────────────

function SplitPreview({ percentage, coins = 100 }) {
  const { t } = useLanguage();
  const s = calcSplit(coins, percentage);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {[
        { label: t("agency.splitPlatform"), value: s.platform, color: "#f59e0b" },
        { label: t("agency.splitAgency").replace("{percentage}", percentage), value: s.agency, color: "#a855f7" },
        { label: t("agency.splitCreatorNet"), value: s.creator, color: "#22c55e" },
      ].map((item) => (
        <div key={item.label} style={{
          background: "#0a0a0f",
          borderRadius: 8, padding: "6px 10px",
          fontSize: 12, minWidth: 90,
        }}>
          <div style={{ color: "#64748b", fontSize: 10, marginBottom: 2 }}>{item.label}</div>
          <div style={{ color: item.color, fontWeight: 700 }}>{item.value} 🪙</div>
        </div>
      ))}
    </div>
  );
}

// ─── Graphic split bar (visual representation of the revenue share) ─────────

function SplitBar({ percentage }) {
  const { t } = useLanguage();
  const s = calcSplit(100, percentage);
  return (
    <div>
      <div style={{ display: "flex", width: "100%", height: 10, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${s.platform}%`, background: "#f59e0b" }} title={t("agency.splitPlatform")} />
        <div style={{ width: `${s.agency}%`, background: "#a855f7" }} title={t("agency.splitAgency").replace("{percentage}", percentage)} />
        <div style={{ width: `${s.creator}%`, background: "#22c55e" }} title={t("agency.splitCreatorNet")} />
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#fbbf24" }}>● {t("agency.splitPlatform")} 40%</span>
        <span style={{ fontSize: 11, color: "#c4b5fd" }}>● {t("agency.splitAgency").replace("{percentage}", percentage)} {s.agency}%</span>
        <span style={{ fontSize: 11, color: "#86efac" }}>● {t("agency.splitCreatorNet")} {s.creator}%</span>
      </div>
    </div>
  );
}

// ─── Creator search (find/select sub-creator by name or username) ───────────

function CreatorSearchField({ selected, onSelect, onClear, apiUrl, authHeaders }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selected) { setOpen(false); return; }
    const trimmed = query.trim();
    if (trimmed.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/agency/search-creators?q=${encodeURIComponent(trimmed)}`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const d = await res.json();
          setResults(d.results || []);
          setOpen(true);
        }
      } catch { /* non-fatal */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selected]);

  if (selected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 10, padding: "8px 12px" }}>
        {selected.avatar
          ? <img src={selected.avatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%" }} />
          : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.name || selected.username}</div>
          <div style={{ color: "#64748b", fontSize: 12 }}>@{selected.username}</div>
        </div>
        <NeonButton onClick={onClear} variant="secondary" size="sm">✕ {t("agency.changeSelection")}</NeonButton>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={t("agency.searchCreatorPlaceholder")}
        style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, color: "#e2e8f0", padding: "10px 14px", fontSize: 14, boxSizing: "border-box", outline: "none" }}
      />
      <div style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>
        {query.trim().length < 2 ? t("agency.searchMinChars") : searching ? t("agency.searching") : t("agency.searchHelp")}
      </div>
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4,
          background: "#0d0b1a", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 10,
          maxHeight: 260, overflowY: "auto",
        }}>
          {results.map((r) => (
            <button
              key={r._id}
              type="button"
              onClick={() => { onSelect(r); setQuery(""); setResults([]); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", background: "transparent", border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", textAlign: "left",
              }}
            >
              {r.avatar
                ? <img src={r.avatar} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
                : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
              }
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{r.name || r.username}</div>
                <div style={{ color: "#64748b", fontSize: 11 }}>@{r.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && !searching && query.trim().length >= 2 && results.length === 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, background: "#0d0b1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", color: "#64748b", fontSize: 12 }}>
          {t("agency.searchNoResults")}
        </div>
      )}
    </div>
  );
}

// ─── Commission history row ──────────────────────────────────────────────────

function CommissionRow({ tx }) {
  const { t } = useLanguage();
  const sc = tx.subCreator;
  const date = new Date(tx.createdAt);
  const dateStr = date.toLocaleDateString(t("common.locale"), { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString(t("common.locale"), { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      {sc?.avatar
        ? <img src={sc.avatar} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(168,85,247,0.4)" }} />
        : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(168,85,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎁</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {sc ? (sc.name || sc.username || t("agency.creatorFallback")) : t("agency.subCreatorFallback")}
        </div>
        <div style={{ color: "#64748b", fontSize: 11 }}>{dateStr} · {timeStr}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: "#a855f7", fontWeight: 700, fontSize: 15 }}>+{tx.amount} 🪙</div>
        <div style={{ color: "#64748b", fontSize: 10 }}>{t("agency.commissionLabel")}</div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

function AgencyPageContent() {
  const router = useRouter();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const inviteCode = (searchParams.get("invite") || "").trim();
  const [inviteContext, setInviteContext] = useState(null); // { creator, alreadyLinked } | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agencyData, setAgencyData] = useState(null);
  const [subCreators, setSubCreators] = useState([]);
  const [myRelationship, setMyRelationship] = useState(null);
  const [commissions, setCommissions] = useState({ transactions: [], total: 0, page: 1, pages: 1 });
  const [topSubCreators, setTopSubCreators] = useState([]);
  const [activeTab, setActiveTab] = useState("red");
  const [commPage, setCommPage] = useState(1);
  const [commLoading, setCommLoading] = useState(false);

  // Invite form
  const [selectedCreator, setSelectedCreator] = useState(null);
  const [inviteForm, setInviteForm] = useState({ percentage: 10 });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  // Percentage edit (proposal — requires sub-creator acceptance before it applies)
  const [editingPct, setEditingPct] = useState(null);
  const [pctValue, setPctValue] = useState(10);
  const [pctLoading, setPctLoading] = useState(false);
  const [pctError, setPctError] = useState("");

  // Sub-creator responding to a pending percentage-change proposal
  const [pctChangeLoading, setPctChangeLoading] = useState(false);
  const [pctChangeMsg, setPctChangeMsg] = useState({ type: "", text: "" });

  // Remove sub-creator
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [removeError, setRemoveError] = useState("");

  // Sub-creator accept/decline
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementMsg, setAgreementMsg] = useState({ type: "", text: "" });

  // Expanded commission history per sub-creator
  const [expandedHistory, setExpandedHistory] = useState(null);

  const authHeaders = useCallback(() => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadCommissions = useCallback(async (page = 1) => {
    setCommLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/agency/commission-history?page=${page}&limit=20`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const d = await res.json();
        setCommissions(d);
        setCommPage(page);
      }
    } catch { /* non-fatal */ }
    setCommLoading(false);
  }, [authHeaders]);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    try {
      const [agencyRes, subRes, relRes, topRes] = await Promise.all([
        fetch(`${apiUrl}/api/agency/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/agency/sub-creators`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/agency/my-relationship`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/agency/top-sub-creators`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (agencyRes.status === 401) { router.replace("/login"); return; }

      if (agencyRes.ok) setAgencyData(await agencyRes.json());
      else { const e = await agencyRes.json(); setError(e.message || t("agency.loadError")); }
      if (subRes.ok) { const d = await subRes.json(); setSubCreators(d.relationships || []); }
      if (relRes.ok) { const d = await relRes.json(); setMyRelationship(d.relationship); }
      if (topRes.ok) { const d = await topRes.json(); setTopSubCreators(d.top || []); }
    } catch { setError(t("agency.connectionError")); }
    finally { setLoading(false); }
  }, [router, t]);

  useEffect(() => { loadData(); }, [loadData]);

  // Preserve the invite-code context carried over from /agency/invite?code=X — purely
  // informational. Never auto-creates or auto-links an AgencyRelationship; it only shows
  // who invited this user so they can be guided to the right next step (the parent creator
  // must still search & send a direct invitation from their own panel).
  useEffect(() => {
    if (!inviteCode) { setInviteContext(null); return; }
    let cancelled = false;
    fetch(`${apiUrl}/api/agency/invite-info?code=${encodeURIComponent(inviteCode)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.valid && data.creator) setInviteContext({ creator: data.creator });
        else setInviteContext({ invalid: true });
      })
      .catch(() => { if (!cancelled) setInviteContext({ invalid: true }); });
    return () => { cancelled = true; };
  }, [inviteCode]);

  useEffect(() => {
    if (activeTab === "comisiones") loadCommissions(1);
  }, [activeTab, loadCommissions]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!selectedCreator) { setInviteError(t("agency.searchCreatorLabel")); return; }
    setInviteLoading(true); setInviteError(""); setInviteSuccess("");
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subCreatorId: selectedCreator._id, percentage: Number(inviteForm.percentage) }),
      });
      const data = await res.json();
      if (res.ok) { setInviteSuccess(data.message); setSelectedCreator(null); setInviteForm({ percentage: 10 }); loadData(); }
      else setInviteError(data.message || t("agency.inviteError"));
    } catch { setInviteError(t("agency.connectionError")); }
    finally { setInviteLoading(false); }
  };

  const handleUpdatePct = async (relId) => {
    setPctLoading(true); setPctError("");
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/sub-creators/${relId}/percentage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ percentage: Number(pctValue) }),
      });
      const data = await res.json();
      if (res.ok) { setEditingPct(null); loadData(); }
      else setPctError(data.message || t("agency.updateError"));
    } catch { setPctError(t("agency.connectionError")); }
    finally { setPctLoading(false); }
  };

  const handleRemoveSub = async (relId) => {
    setRemoveError("");
    const token = getToken();
    const res = await fetch(`${apiUrl}/api/agency/sub-creators/${relId}/remove`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { setConfirmRemoveId(null); loadData(); }
    else { const d = await res.json(); setRemoveError(d.message || t("agency.removeError")); setConfirmRemoveId(null); }
  };

  const handleAcceptAgreement = async () => {
    setAgreementLoading(true); setAgreementMsg({ type: "", text: "" });
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/my-relationship/accept`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAgreementMsg({ type: res.ok ? "success" : "error", text: data.message || (res.ok ? t("agency.agreementAccepted") : t("common.error")) });
      if (res.ok) loadData();
    } catch { setAgreementMsg({ type: "error", text: t("agency.connectionError") }); }
    finally { setAgreementLoading(false); }
  };

  const handleDeclineAgreement = async () => {
    setAgreementLoading(true); setAgreementMsg({ type: "", text: "" });
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/my-relationship/decline`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAgreementMsg({ type: res.ok ? "success" : "error", text: data.message || (res.ok ? t("agency.invitationRejected") : t("common.error")) });
      if (res.ok) loadData();
    } catch { setAgreementMsg({ type: "error", text: t("agency.connectionError") }); }
    finally { setAgreementLoading(false); }
  };

  // The sub-creator must confirm the EXACT proposal they are looking at — the backend now
  // rejects accept/decline calls that omit these, or that no longer match the live pending
  // proposal (409), so we always source them from the currently rendered `myRelationship`.
  const handleAcceptPctChange = async () => {
    if (!myRelationship || myRelationship.pendingPercentage == null) return;
    setPctChangeLoading(true); setPctChangeMsg({ type: "", text: "" });
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/my-relationship/percentage/accept`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expectedPercentage: myRelationship.pendingPercentage,
          expectedProposedAt: myRelationship.pendingPercentageProposedAt,
        }),
      });
      const data = await res.json();
      setPctChangeMsg({
        type: res.ok ? "success" : "error",
        text: data.message || (res.ok ? t("agency.percentageChangeAccepted") : res.status === 409 ? t("agency.percentageChangeStale") : t("common.error")),
      });
      if (res.ok || res.status === 409) loadData();
    } catch { setPctChangeMsg({ type: "error", text: t("agency.connectionError") }); }
    finally { setPctChangeLoading(false); }
  };

  const handleDeclinePctChange = async () => {
    if (!myRelationship || myRelationship.pendingPercentage == null) return;
    setPctChangeLoading(true); setPctChangeMsg({ type: "", text: "" });
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/my-relationship/percentage/decline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expectedPercentage: myRelationship.pendingPercentage,
          expectedProposedAt: myRelationship.pendingPercentageProposedAt,
        }),
      });
      const data = await res.json();
      setPctChangeMsg({
        type: res.ok ? "success" : "error",
        text: data.message || (res.ok ? t("agency.percentageChangeDeclined") : res.status === 409 ? t("agency.percentageChangeStale") : t("common.error")),
      });
      if (res.ok || res.status === 409) loadData();
    } catch { setPctChangeMsg({ type: "error", text: t("agency.connectionError") }); }
    finally { setPctChangeLoading(false); }
  };

  if (loading) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏢</div>
        <div style={{ color: "#a855f7", fontSize: 16, fontWeight: 600 }}>{t("agency.loading")}</div>
      </div>
    </div>
  );

  // Compute counts from all relationships (need all statuses)
  const totalInvitados = agencyData?.counts?.total || 0;
  const totalPendientes = agencyData?.counts?.pending || 0;
  const totalActivos = agencyData?.counts?.active || 0;
  const totalAprobados = subCreators.filter((r) => r.status === "active").length;

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
          <button
            onClick={() => router.back()}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontSize: 13 }}
          >
            ← {t("common.back")}
          </button>
          <div>
            <h1 style={{
              fontSize: 28, fontWeight: 800, margin: 0,
              background: "linear-gradient(135deg,#a855f7 0%,#6366f1 60%,#3b82f6 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              🏢 {t("agency.pageTitle")}
            </h1>
            <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
              {t("agency.pageSubtitle")}
            </p>
          </div>
        </div>

        {/* ── Invite-code context banner (carried over from /agency/invite?code=X) ──
            Purely informational: never auto-links anything. If the viewer already has a
            relationship with this same inviter, point them at the existing agreement card
            below instead of duplicating it. */}
        {inviteContext && !inviteContext.invalid && (() => {
          const alreadyLinkedToInviter = isAlreadyLinkedToInviter(myRelationship, inviteContext.creator?.username);
          const inviterLabel = inviteContext.creator.name || inviteContext.creator.username;
          return (
            <div style={{
              ...S.glassCard,
              border: "1px solid rgba(168,85,247,0.3)",
              background: "linear-gradient(135deg,rgba(88,28,135,0.25),rgba(30,27,75,0.25))",
              marginBottom: 24, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            }}>
              {inviteContext.creator.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inviteContext.creator.avatar} alt="" style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #a855f7" }} />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: 14 }}>
                  🔗 {t("agency.inviteContext.invitedBy").replace("{name}", inviterLabel)}
                </div>
                <div style={{ color: "#94a3b8", fontSize: 12.5, marginTop: 4 }}>
                  {alreadyLinkedToInviter
                    ? t("agency.inviteContext.alreadyLinked")
                    : t("agency.inviteContext.needsDirectInvite")}
                </div>
              </div>
            </div>
          );
        })()}
        {inviteContext?.invalid && (
          <div style={{
            ...S.glassCard,
            border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.06)",
            marginBottom: 24, color: "#f87171", fontSize: 13,
          }}>
            ⚠️ {t("agency.inviteContext.invalidCode")}
          </div>
        )}

        {/* ── My agency relationship (sub-creator view) ── */}
        {myRelationship && (
          <div style={{
            ...S.glassCard,
            border: "1px solid rgba(67,56,202,0.4)",
            background: "linear-gradient(135deg,rgba(30,27,75,0.4),rgba(20,20,43,0.4))",
            marginBottom: 24,
          }}>
            <div style={{ color: "#818cf8", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
              🔗 {t("agency.mainAgencyTitle")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {myRelationship.parentCreator?.avatar && (
                <img src={myRelationship.parentCreator.avatar} alt="" style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid #4338ca" }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{myRelationship.parentCreator?.name || myRelationship.parentCreator?.username}</div>
                <div style={{ color: "#818cf8", fontSize: 13 }}>{t("agency.agencyLabel")}: {myRelationship.parentCreator?.agencyProfile?.agencyName || "—"}</div>
                {myRelationship.subCreatorAgreed && <div style={{ color: "#22c55e", fontSize: 12, marginTop: 4 }}>✅ {t("agency.agreementAccepted")}</div>}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#a855f7" }}>{myRelationship.percentage}%</div>
                <div style={{ color: "#64748b", fontSize: 11 }}>{t("agency.agencyCommissionLabel")}</div>
              </div>
              <Badge status={myRelationship.status} />
            </div>

            {/* Earnings breakdown example */}
            <div style={{ marginTop: 16 }}>
              <div style={{ color: "#818cf8", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>{t("agency.splitExample")}</div>
              <SplitPreview percentage={myRelationship.percentage} coins={100} />
              <div style={{ marginTop: 10 }}>
                <SplitBar percentage={myRelationship.percentage} />
              </div>
            </div>

            {/* Accept / Decline initial agreement */}
            {myRelationship.status === "pending" && !myRelationship.subCreatorAgreed && (
              <div style={{ marginTop: 16, padding: "14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10 }}>
                <div style={{ color: "#fbbf24", fontSize: 13, marginBottom: 12 }}>
                  ⏳ {t("agency.pendingInviteAlert")}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <NeonButton onClick={handleAcceptAgreement} disabled={agreementLoading} variant="primary">
                    ✅ {t("agency.acceptAgreement")}
                  </NeonButton>
                  <NeonButton onClick={handleDeclineAgreement} disabled={agreementLoading} variant="danger">
                    ✕ {t("agency.reject")}
                  </NeonButton>
                </div>
              </div>
            )}

            {/* Accepted by sub-creator, waiting on administrator approval */}
            {myRelationship.status === "pending" && myRelationship.subCreatorAgreed && (
              <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, color: "#818cf8", fontSize: 13 }}>
                ⏳ {t("agency.pendingAdminApprovalLabel")}
              </div>
            )}

            {agreementMsg.text && (
              <div style={{ marginTop: 10, color: agreementMsg.type === "error" ? "#f87171" : "#86efac", fontSize: 13 }}>
                {agreementMsg.text}
              </div>
            )}

            {/* Percentage-change proposal — requires the sub-creator's explicit acceptance */}
            {myRelationship.status === "active" && myRelationship.pendingPercentage != null && (
              <div style={{ marginTop: 16, padding: "14px", background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 10 }}>
                <div style={{ color: "#fb923c", fontSize: 13, marginBottom: 10, fontWeight: 700 }}>
                  🔔 {t("agency.percentageChangePendingLabel")}
                </div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>{t("agency.percentageChangeBanner")}</div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>{t("agency.agencyCommissionLabel")}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#a855f7" }}>{myRelationship.percentage}%</div>
                  </div>
                  <div style={{ color: "#64748b" }}>→</div>
                  <div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>{t("agency.percentageChangeTo")}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#fb923c" }}>{myRelationship.pendingPercentage}%</div>
                  </div>
                </div>
                <SplitBar percentage={myRelationship.pendingPercentage} />
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <NeonButton onClick={handleAcceptPctChange} disabled={pctChangeLoading} variant="primary">
                    ✅ {t("agency.acceptPercentageChange")}
                  </NeonButton>
                  <NeonButton onClick={handleDeclinePctChange} disabled={pctChangeLoading} variant="danger">
                    ✕ {t("agency.declinePercentageChange")}
                  </NeonButton>
                </div>
              </div>
            )}
            {pctChangeMsg.text && (
              <div style={{ marginTop: 10, color: pctChangeMsg.type === "error" ? "#f87171" : "#86efac", fontSize: 13 }}>
                {pctChangeMsg.text}
              </div>
            )}
          </div>
        )}

        {error && !agencyData && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 20, color: "#f87171", marginBottom: 24 }}>
            {error}
          </div>
        )}

        {agencyData && (
          <>
            {/* ── Stats grid ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 28 }}>
              <StatCard icon="👥" value={totalInvitados} label={t("agency.totalInvited")} color="#6366f1" />
              <StatCard icon="✅" value={totalActivos} label={t("agency.active")} color="#22c55e" />
              <StatCard icon="⏳" value={totalPendientes} label={t("agency.pending")} color="#f59e0b" />
              <StatCard icon="💰" value={`${agencyData.agencyEarningsCoins || 0} 🪙`} label={t("agency.commissionEarned")} color="#a855f7" />
              <StatCard icon="📈" value={`${agencyData.totalAgencyGeneratedCoins || 0} 🪙`} label={t("agency.totalGenerated")} color="#3b82f6" />
            </div>

            {/* ── Agency profile card ── */}
            <div style={{ ...S.glassCard, marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("agency.profileAgencyName")}</div>
                  <div style={{ fontWeight: 700, fontSize: 17, marginTop: 4 }}>{agencyData.agencyProfile?.agencyName || "—"}</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("agency.profileAgencyCode")}</div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: "#a855f7", fontFamily: "monospace", marginTop: 4 }}>
                    {agencyData.agencyProfile?.agencyCode || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("agency.profileDefaultPercentage")}</div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: "#f59e0b", marginTop: 4 }}>
                    {agencyData.agencyProfile?.subCreatorPercentageDefault || 10}%
                  </div>
                </div>
              </div>
              {agencyData.agencyProfile?.agencyCode && (
                <InviteLinkSection
                  agencyCode={agencyData.agencyProfile.agencyCode}
                  inviterName={agencyData?.me?.name || agencyData?.me?.username}
                />
              )}
            </div>

            {/* ── Payout readiness info ── */}
            <div style={{
              ...S.glassCardSm,
              border: "1px solid rgba(99,102,241,0.2)",
              background: "rgba(99,102,241,0.04)",
              marginBottom: 24,
              display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
            }}>
              <div style={{ color: "#6366f1", fontSize: 13, fontWeight: 700 }}>💼 {t("agency.payoutStatusTitle")}</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>{t("agency.accruedCommission")}</div>
                  <div style={{ color: "#a855f7", fontWeight: 700, fontSize: 15 }}>{agencyData.agencyEarningsCoins || 0} 🪙</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>{t("agency.totalGeneratedBySubCreators")}</div>
                  <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 15 }}>{agencyData.totalAgencyGeneratedCoins || 0} 🪙</div>
                </div>
                <div style={{ color: "#64748b", fontSize: 11, fontStyle: "italic", alignSelf: "center" }}>
                  {t("agency.payoutManual")}
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
              {[
                { key: "red", label: `👥 ${t("agency.tabNetwork")}` },
                { key: "top", label: `🏆 ${t("agency.tabTopSubCreators")}` },
                { key: "comisiones", label: `💸 ${t("agency.tabCommissionHistory")}` },
                { key: "invitar", label: `✉️ ${t("agency.tabLinkCreator")}` },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: activeTab === t.key
                      ? "linear-gradient(135deg,#a855f7,#6366f1)"
                      : "rgba(255,255,255,0.04)",
                    color: activeTab === t.key ? "#fff" : "#64748b",
                    transition: "all 0.2s",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Mi red ── */}
            {activeTab === "red" && (
              <div>
                {removeError && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 12, color: "#f87171", fontSize: 13, marginBottom: 12 }}>
                    {removeError}
                  </div>
                )}
                {pctError && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 12, color: "#f87171", fontSize: 13, marginBottom: 12 }}>
                    {pctError}
                  </div>
                )}
                {subCreators.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0" }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>👥</div>
                    <div style={{ color: "#64748b", fontSize: 15 }}>{t("agency.noSubCreators")}</div>
                    <div style={{ color: "#4b5563", fontSize: 13, marginTop: 8 }}>
                      {t("agency.noSubCreatorsHelp")}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {subCreators.map((rel) => (
                      <div key={rel._id} style={S.glassCard}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                          {rel.subCreator?.avatar
                            ? <img src={rel.subCreator.avatar} alt="" style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(99,102,241,0.4)" }} />
                            : <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👤</div>
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{rel.subCreator?.name || rel.subCreator?.username || "—"}</div>
                            <div style={{ color: "#64748b", fontSize: 12 }}>{t("agency.userEarnings").replace("{username}", rel.subCreator?.username || "").replace("{earnings}", rel.subCreator?.earningsCoins || 0)}</div>
                            {rel.subCreatorAgreed
                              ? <div style={{ color: "#22c55e", fontSize: 11, marginTop: 2 }}>✅ {t("agency.agreementAccepted")}</div>
                              : rel.status === "active"
                                ? <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 2 }}>⏳ {t("agency.pendingAgreementSuspended")}</div>
                                : null
                            }
                            {rel.pendingPercentage != null && (
                              <div style={{ color: "#fb923c", fontSize: 11, marginTop: 2 }}>
                                🔔 {t("agency.percentageChangePendingLabel")}: {rel.percentage}% → {rel.pendingPercentage}%
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "center", minWidth: 70 }}>
                            {editingPct === rel._id ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                                <input
                                  type="number" value={pctValue}
                                  onChange={(e) => setPctValue(e.target.value)}
                                  min={5} max={30}
                                  style={{ width: 60, background: "#0a0a0f", border: "1px solid #a855f7", borderRadius: 6, color: "#fff", padding: "4px 8px", textAlign: "center", fontSize: 14 }}
                                />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <NeonButton onClick={() => handleUpdatePct(rel._id)} disabled={pctLoading} size="sm">✓</NeonButton>
                                  <NeonButton onClick={() => { setEditingPct(null); setPctError(""); }} variant="secondary" size="sm">✕</NeonButton>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#a855f7" }}>{rel.percentage}%</div>
                                <div style={{ color: "#64748b", fontSize: 11 }}>{t("agency.commissionLabel")}</div>
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <Badge status={rel.status} />
                            {rel.status === "active" && rel.pendingPercentage == null && (
                              <>
                                <NeonButton
                                  onClick={() => { setEditingPct(rel._id); setPctValue(rel.percentage); setPctError(""); }}
                                  variant="secondary" size="sm"
                                >✏️ %</NeonButton>
                                {confirmRemoveId === rel._id ? (
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ color: "#f87171", fontSize: 12 }}>{t("agency.removeConfirm")}</span>
                                    <NeonButton onClick={() => handleRemoveSub(rel._id)} variant="danger" size="sm">{t("agency.yes")}</NeonButton>
                                    <NeonButton onClick={() => setConfirmRemoveId(null)} variant="secondary" size="sm">{t("agency.no")}</NeonButton>
                                  </div>
                                ) : (
                                  <NeonButton onClick={() => { setConfirmRemoveId(rel._id); setRemoveError(""); }} variant="danger" size="sm">🗑</NeonButton>
                                )}
                              </>
                            )}
                            {rel.status === "active" && rel.pendingPercentage != null && (
                              <>
                                {confirmRemoveId === rel._id ? (
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ color: "#f87171", fontSize: 12 }}>{t("agency.removeConfirm")}</span>
                                    <NeonButton onClick={() => handleRemoveSub(rel._id)} variant="danger" size="sm">{t("agency.yes")}</NeonButton>
                                    <NeonButton onClick={() => setConfirmRemoveId(null)} variant="secondary" size="sm">{t("agency.no")}</NeonButton>
                                  </div>
                                ) : (
                                  <NeonButton onClick={() => { setConfirmRemoveId(rel._id); setRemoveError(""); }} variant="danger" size="sm">🗑</NeonButton>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {rel.status === "active" && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ color: "#64748b", fontSize: 11, marginBottom: 8 }}>{t("agency.per100CoinsSent")}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <SplitPreview percentage={rel.percentage} coins={100} />
                              {(rel.percentageHistory || []).length > 0 && (
                                <button
                                  onClick={() => setExpandedHistory(expandedHistory === rel._id ? null : rel._id)}
                                  style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                                >
                                  {t("agency.historyButton").replace("{count}", rel.percentageHistory.length)}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {expandedHistory === rel._id && (rel.percentageHistory || []).length > 0 && (
                          <div style={{ marginTop: 12, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12 }}>
                            <div style={{ color: "#818cf8", fontSize: 12, marginBottom: 8, fontWeight: 700 }}>{t("agency.commissionChangeHistory")}</div>
                            {rel.percentageHistory.map((h, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", padding: "4px 0", borderBottom: i < rel.percentageHistory.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                <span>{t("agency.previousPercentage")} <strong style={{ color: "#a855f7" }}>{h.percentage}%</strong></span>
                                <span>{h.changedAt ? new Date(h.changedAt).toLocaleDateString(t("common.locale")) : "—"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Top sub-creadores ── */}
            {activeTab === "top" && (
              <div>
                {topSubCreators.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0" }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>🏆</div>
                    <div style={{ color: "#64748b", fontSize: 15 }}>{t("agency.noCommissionData")}</div>
                    <div style={{ color: "#4b5563", fontSize: 13, marginTop: 8 }}>{t("agency.rankingUpdates")}</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {topSubCreators.map((item, idx) => {
                      const sc = item.subCreator;
                      const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
                      return (
                        <div key={item.subCreatorId || idx} style={S.glassCard}>
                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ fontSize: 28, width: 40, textAlign: "center" }}>{medals[idx] || `${idx + 1}`}</div>
                            {sc?.avatar
                              ? <img src={sc.avatar} alt="" style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid rgba(168,85,247,0.4)" }} />
                              : <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(168,85,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👤</div>
                            }
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 15 }}>{sc ? (sc.name || sc.username) : t("agency.subCreatorFallback")}</div>
                              {sc && <div style={{ color: "#64748b", fontSize: 12 }}>@{sc.username}</div>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ color: "#a855f7", fontWeight: 800, fontSize: 18 }}>{item.totalCommission} 🪙</div>
                              <div style={{ color: "#64748b", fontSize: 11 }}>{t("agency.generatedCommission")}</div>
                              <div style={{ color: "#4b5563", fontSize: 11 }}>{t("agency.transactionsCount").replace("{count}", item.transactionCount)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Historial de comisiones ── */}
            {activeTab === "comisiones" && (
              <div style={S.glassCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>💸 {t("agency.commissionHistoryTitle")}</div>
                  <div style={{ color: "#64748b", fontSize: 13 }}>{t("agency.totalTransactions").replace("{count}", commissions.total)}</div>
                </div>

                {commLoading ? (
                  <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>{t("common.loading")}</div>
                ) : commissions.transactions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 0" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>💸</div>
                    <div style={{ color: "#64748b", fontSize: 14 }}>{t("agency.noCommissionsYet")}</div>
                    <div style={{ color: "#4b5563", fontSize: 12, marginTop: 6 }}>{t("agency.commissionsRecordedHelp")}</div>
                  </div>
                ) : (
                  <>
                    <div>
                      {commissions.transactions.map((tx) => (
                        <CommissionRow key={tx._id} tx={tx} />
                      ))}
                    </div>
                    {commissions.pages > 1 && (
                      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
                        <NeonButton
                          onClick={() => loadCommissions(commPage - 1)}
                          disabled={commPage <= 1}
                          variant="secondary" size="sm"
                        >← {t("agency.previous")}</NeonButton>
                        <span style={{ color: "#64748b", fontSize: 13, alignSelf: "center" }}>
                          {commPage} / {commissions.pages}
                        </span>
                        <NeonButton
                          onClick={() => loadCommissions(commPage + 1)}
                          disabled={commPage >= commissions.pages}
                          variant="secondary" size="sm"
                        >{t("agency.next")} →</NeonButton>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Tab: Vincular creador ── */}
            {activeTab === "invitar" && (
              <div style={{ ...S.glassCard, maxWidth: 520 }}>
                <h3 style={{ color: "#a855f7", margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>✉️ {t("agency.linkSubCreatorTitle")}</h3>
                <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>
                  {t("agency.linkSubCreatorDesc")}
                </p>
                {inviteError && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 12, color: "#f87171", marginBottom: 16, fontSize: 13 }}>
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: 12, color: "#86efac", marginBottom: 16, fontSize: 13 }}>
                    {inviteSuccess}
                  </div>
                )}
                <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6, fontWeight: 600 }}>{t("agency.searchCreatorLabel")}</label>
                    <CreatorSearchField
                      selected={selectedCreator}
                      onSelect={setSelectedCreator}
                      onClear={() => setSelectedCreator(null)}
                      apiUrl={apiUrl}
                      authHeaders={authHeaders}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6, fontWeight: 600 }}>{t("agency.commissionPercentageLabel")}</label>
                    <input
                      type="number"
                      value={inviteForm.percentage}
                      onChange={(e) => setInviteForm({ ...inviteForm, percentage: e.target.value })}
                      min={5} max={30} required
                      style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, color: "#e2e8f0", padding: "10px 14px", fontSize: 14, boxSizing: "border-box", outline: "none" }}
                    />
                    <div style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>
                      {t("agency.previewBreakdown")
                        .replace("{percentage}", inviteForm.percentage)
                        .replace("{agency}", Math.floor(60 * inviteForm.percentage / 100))
                        .replace("{creator}", 60 - Math.floor(60 * inviteForm.percentage / 100))}
                    </div>
                  </div>

                  {/* Agreement preview: identity of both parties + graphic split */}
                  {selectedCreator && (
                    <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 12, padding: 14 }}>
                      <div style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        🤝 {t("agency.agreementPreviewTitle")}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ textAlign: "center" }}>
                          {agencyData?.me?.avatar
                            ? <img src={agencyData.me.avatar} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                            : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(168,85,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>🏢</div>
                          }
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{t("agency.youLabel")}</div>
                        </div>
                        <div style={{ color: "#64748b", fontSize: 18 }}>→</div>
                        <div style={{ textAlign: "center" }}>
                          {selectedCreator.avatar
                            ? <img src={selectedCreator.avatar} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                            : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>
                          }
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>@{selectedCreator.username}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 140, textAlign: "right" }}>
                          <div style={{ color: "#64748b", fontSize: 11 }}>{t("agency.proposedCommissionLabel")}</div>
                          <div style={{ color: "#a855f7", fontWeight: 800, fontSize: 20 }}>{inviteForm.percentage}%</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <SplitBar percentage={Number(inviteForm.percentage) || 0} />
                      </div>
                    </div>
                  )}

                  <NeonButton disabled={inviteLoading || !selectedCreator}>
                    {inviteLoading ? t("agency.sending") : `✉️ ${t("agency.sendLinkRequest")}`}
                  </NeonButton>
                </form>

                {/* Rules reminder */}
                <div style={{ marginTop: 24, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 10, padding: 14 }}>
                  <div style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📋 {t("agency.commissionRulesTitle")}</div>
                  {[
                    t("agency.rulePlatformFixed"),
                    t("agency.ruleAgencyFromCreator"),
                    t("agency.ruleAllowedRange"),
                    t("agency.ruleApplyAfterAcceptance"),
                    t("agency.ruleRequiresAdminApproval"),
                  ].map((rule, i) => (
                    <div key={i} style={{ color: "#64748b", fontSize: 12, padding: "3px 0" }}>✓ {rule}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AgencyPage() {
  return (
    <Suspense fallback={null}>
      <AgencyPageContent />
    </Suspense>
  );
}
