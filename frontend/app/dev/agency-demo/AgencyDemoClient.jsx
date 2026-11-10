"use client";

import { useState } from "react";
import CreatorNetworkCompact from "@/components/creator/CreatorNetworkCompact";
import { useLanguage } from "@/contexts/LanguageContext";

const GOOD = Object.freeze({
  eligible: true,
  daysAsCreator: 45,
  completedLives: 4,
  requirements: {
    approvedCreator: true,
    adult: true,
    authenticProfile: true,
    creatorTenure: true,
    completedLives: true,
    goodStanding: true,
    independentCreator: true,
  },
});

const NOT_YET = Object.freeze({
  ...GOOD,
  eligible: false,
  daysAsCreator: 12,
  completedLives: 1,
  requirements: {
    ...GOOD.requirements,
    creatorTenure: false,
    completedLives: false,
  },
});

const LABELS = {
  es: {
    demo: "ENTORNO DE DEMOSTRACIÓN",
    title: "Revisión de MeetYouLive — Agencias",
    lead: "Entra directamente como usuario o creador, sin registrarte ni introducir contraseña.",
    warning: "Son perfiles ficticios para revisar pantallas. No son cuentas reales, no inician sesión, no guardan datos y no pueden acceder a chats, pagos ni Lives reales.",
    user: "Entrar como usuario",
    creator: "Entrar como creador",
    userDesc: "Comprueba lo que ve un usuario que aún no es creador.",
    creatorDesc: "Prueba la solicitud para convertirse en agencia.",
    change: "Cambiar tipo de usuario",
    userTitle: "Vista de usuario",
    userCopy: "El usuario normal puede solicitar ser creador, pero no puede solicitar una agencia directamente.",
    userSteps: ["Inicio", "Descubrir", "Chats", "Perfil", "Solicitar ser creador"],
    userHint: "Estas opciones son representativas. En este modo no se abre contenido privado.",
    creatorTitle: "Vista de creador",
    creatorSubtitle: "Este es el formulario real de la interfaz, alimentado por datos de prueba.",
    meets: "Creador con requisitos cumplidos",
    missing: "Creador al que le faltan requisitos",
    mockPending: "La solicitud aparece pendiente (solo simulación; no se envió al servidor).",
    simulatedApprove: "Ver cómo se muestra una agencia aprobada",
    agencyApproved: "Agencia aprobada (simulación)",
    agencyApprovedText: "En una cuenta real, solo administración puede aprobar. Aquí se ilustra el estado habilitado, sin generar invitaciones ni comisiones.",
    reset: "Reiniciar demostración",
    noBackend: "No se envían solicitudes al backend de producción.",
  },
  en: {
    demo: "DEMO ENVIRONMENT",
    title: "MeetYouLive — Agency Review",
    lead: "Enter directly as a user or creator, without registration or a password.",
    warning: "These are fictional profiles for reviewing the UI. They are not real accounts, do not sign in, save no data, and cannot access real chats, payments, or Lives.",
    user: "Enter as user",
    creator: "Enter as creator",
    userDesc: "See what a standard user can access.",
    creatorDesc: "Review the application to become an agency.",
    change: "Switch role",
    userTitle: "User view",
    userCopy: "A regular user may apply to become a creator, but cannot directly apply for an agency.",
    userSteps: ["Home", "Discover", "Chats", "Profile", "Apply as creator"],
    userHint: "These are representative UI areas, not links to private content.",
    creatorTitle: "Creator view",
    creatorSubtitle: "This is the real application UI component using synthetic data.",
    meets: "Creator meets requirements",
    missing: "Creator does not meet requirements",
    mockPending: "Application is pending (simulation only; nothing was sent).",
    simulatedApprove: "Preview approved agency appearance",
    agencyApproved: "Agency approved (simulation)",
    agencyApprovedText: "Only administrators can approve real agencies. This mock state has no invitation links or commissions.",
    reset: "Reset demo",
    noBackend: "No requests are sent to the production backend.",
  },
  pt: {
    demo: "AMBIENTE DE DEMONSTRAÇÃO",
    title: "MeetYouLive — Revisão de Agências",
    lead: "Entre como usuário ou criador, sem cadastro ou senha.",
    warning: "São perfis fictícios para revisar telas. Não são contas reais, não fazem login nem salvam dados, e não acessam chats, pagamentos ou Lives reais.",
    user: "Entrar como usuário",
    creator: "Entrar como criador",
    userDesc: "Veja o que um usuário comum pode acessar.",
    creatorDesc: "Confira a solicitação para se tornar agência.",
    change: "Trocar perfil",
    userTitle: "Visão de usuário",
    userCopy: "Um usuário comum pode solicitar ser criador, mas não pode solicitar agência diretamente.",
    userSteps: ["Início", "Descobrir", "Chats", "Perfil", "Solicitar ser criador"],
    userHint: "Essas áreas representam a interface, não links para conteúdos privados.",
    creatorTitle: "Visão de criador",
    creatorSubtitle: "Este é o componente real da solicitação, alimentado por dados fictícios.",
    meets: "Criador cumpre requisitos",
    missing: "Criador ainda não cumpre requisitos",
    mockPending: "Solicitação pendente (apenas simulação; nada foi enviado).",
    simulatedApprove: "Ver aparência de agência aprovada",
    agencyApproved: "Agência aprovada (simulação)",
    agencyApprovedText: "Somente administradores aprovam agências reais. Nenhum convite ou comissão é gerado.",
    reset: "Reiniciar demonstração",
    noBackend: "Nenhuma solicitação é enviada ao backend de produção.",
  },
};

const panel = {
  border: "1px solid rgba(168,85,247,.27)",
  borderRadius: 16,
  background: "rgba(21,16,41,.93)",
  padding: "clamp(14px,4vw,24px)",
};

export default function AgencyDemoClient() {
  const { lang } = useLanguage();
  const copy = LABELS[lang] || LABELS.es;
  const [role, setRole] = useState(null);
  const [qualified, setQualified] = useState(true);
  const [requestStatus, setRequestStatus] = useState("none");
  const [approvedView, setApprovedView] = useState(false);
  const eligibility = qualified ? GOOD : NOT_YET;
  const agencyData = {
    agencyEnabled: false,
    agencyProfile: { requestStatus },
    counts: { total: 0, active: 0, pending: 0 },
  };
  const switchRole = (next) => {
    setRole(next);
    setQualified(true);
    setRequestStatus("none");
    setApprovedView(false);
  };

  return (
    <div style={{
      minHeight: "100vh", color: "#f3edff", padding: "clamp(18px,4vw,34px) 14px 70px",
      background: "radial-gradient(ellipse at top left, #342066 0%, #120d24 48%, #0b0916 100%)",
      fontFamily: "system-ui,-apple-system,sans-serif",
    }}>
      <div style={{ maxWidth: 850, margin: "auto", display: "grid", gap: 16 }}>
        <div style={panel}>
          <span style={{ fontSize: 11, letterSpacing: 2, fontWeight: 800, color: "#bfb0ff" }}>{copy.demo}</span>
          <h1 style={{ fontSize: "clamp(23px,5vw,33px)", lineHeight: 1.17, margin: "11px 0", color: "#fff" }}>{copy.title}</h1>
          <p style={{ color: "#bdafdb", lineHeight: 1.55, margin: 0 }}>{copy.lead}</p>
        </div>
        <div role="note" style={{ ...panel, borderColor: "rgba(251,191,36,.37)", color: "#f9e9be", fontSize: 13, lineHeight: 1.55 }}>
          {copy.warning}
        </div>

        {!role ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))", gap: 12 }}>
            {[
              { id: "user", title: copy.user, description: copy.userDesc, emoji: "👤" },
              { id: "creator", title: copy.creator, description: copy.creatorDesc, emoji: "🎥" },
            ].map((item) => (
              <button key={item.id} type="button" onClick={() => switchRole(item.id)}
                style={{ ...panel, cursor: "pointer", textAlign: "left", color: "#fff", minHeight: 154 }}>
                <div style={{ fontSize: 33, marginBottom: 10 }}>{item.emoji}</div>
                <strong style={{ display: "block", fontSize: 18, marginBottom: 8 }}>{item.title}</strong>
                <span style={{ color: "#c3b6dd", fontSize: 13, lineHeight: 1.5 }}>{item.description}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <button type="button" onClick={() => switchRole(null)}
              style={{ width: "fit-content", padding: "10px 16px", background: "#30234e", border: "1px solid #614e91", color: "#eee", borderRadius: 12, fontWeight: 700 }}>
              ← {copy.change}
            </button>

            {role === "user" ? (
              <section style={{ ...panel, display: "grid", gap: 16 }}>
                <h2 style={{ margin: 0, fontSize: 21 }}>{copy.userTitle}</h2>
                <p style={{ color: "#c3b6dd", margin: 0 }}>{copy.userCopy}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 9 }}>
                  {copy.userSteps.map((name) => (
                    <div key={name} style={{ background: "#251b41", borderRadius: 12, padding: "18px 10px", textAlign: "center", color: "#d9cef4" }}>
                      {name}
                    </div>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#aca0c6" }}>{copy.userHint}</p>
              </section>
            ) : (
              <>
                <section style={{ ...panel, display: "grid", gap: 11 }}>
                  <h2 style={{ fontSize: 21, margin: 0 }}>{copy.creatorTitle}</h2>
                  <p style={{ margin: 0, color: "#c3b6dd" }}>{copy.creatorSubtitle}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button type="button" onClick={() => { setQualified(true); setRequestStatus("none"); setApprovedView(false); }}
                      aria-pressed={qualified} style={{ borderRadius: 9, padding: "11px 13px", color: "#fff", background: qualified ? "#6940bb" : "#29213f", border: "1px solid #77669d", fontWeight: 600 }}>
                      {copy.meets}
                    </button>
                    <button type="button" onClick={() => { setQualified(false); setRequestStatus("none"); setApprovedView(false); }}
                      aria-pressed={!qualified} style={{ borderRadius: 9, padding: "11px 13px", color: "#fff", background: !qualified ? "#6940bb" : "#29213f", border: "1px solid #77669d", fontWeight: 600 }}>
                      {copy.missing}
                    </button>
                  </div>
                </section>
                {approvedView ? (
                  <section style={{ ...panel, display: "grid", gap: 11 }}>
                    <h2 style={{ margin: 0, color: "#86efac" }}>✓ {copy.agencyApproved}</h2>
                    <p style={{ margin: 0, color: "#c3b6dd" }}>{copy.agencyApprovedText}</p>
                  </section>
                ) : (
                  <CreatorNetworkCompact
                    agencyData={agencyData}
                    agencyEligibility={eligibility}
                    agencyCopied={false}
                    agencyCopyError={false}
                    onCopyLink={() => {}}
                    onRequestAgency={() => setRequestStatus("pending")}
                  />
                )}
                {requestStatus === "pending" && !approvedView && (
                  <section style={{ ...panel, display: "grid", gap: 12 }}>
                    <p role="status" style={{ margin: 0, color: "#86efac" }}>{copy.mockPending}</p>
                    <button type="button" onClick={() => setApprovedView(true)}
                      style={{ padding: 12, background: "#2f664f", color: "#fff", border: 0, borderRadius: 10, fontWeight: 700 }}>
                      {copy.simulatedApprove}
                    </button>
                  </section>
                )}
                {(requestStatus === "pending" || approvedView) && (
                  <button type="button" onClick={() => { setRequestStatus("none"); setApprovedView(false); }}
                    style={{ width: "fit-content", padding: "11px 17px", background: "#32224b", border: "1px solid #6d58a1", borderRadius: 10, color: "#eee" }}>
                    {copy.reset}
                  </button>
                )}
              </>
            )}
          </>
        )}
        <p style={{ margin: 0, textAlign: "center", fontSize: 12, color: "#b0a3cd" }}>{copy.noBackend}</p>
      </div>
    </div>
  );
}
