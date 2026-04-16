const nodemailer = require("nodemailer");

let transporter = null;

class MailServiceError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "MailServiceError";
    this.code = code;
    this.status = status;
  }
}

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const hasAnySmtpValue = Boolean(SMTP_HOST || SMTP_USER || SMTP_PASS);
  const hasFullSmtpConfig = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

  if (hasAnySmtpValue && !hasFullSmtpConfig) {
    throw new MailServiceError(
      "EMAIL_CONFIG_INVALID",
      "SMTP configuration is incomplete. SMTP_HOST, SMTP_USER, and SMTP_PASS are required."
    );
  }

  if (hasFullSmtpConfig) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || "587", 10),
      secure: parseInt(SMTP_PORT || "587", 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  } else if (process.env.NODE_ENV === "production") {
    throw new MailServiceError(
      "EMAIL_NOT_CONFIGURED",
      "Email service is not configured. In production, SMTP_HOST, SMTP_USER, and SMTP_PASS are required."
    );
  } else {
    // Development fallback: log emails to the console
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }

  return transporter;
}

const FROM = process.env.SMTP_FROM || "MeetYouLive <noreply@meetyoulive.net>";

/**
 * Send an email verification code to a user.
 * @param {string} to  - recipient email
 * @param {string} code - 6-digit numeric code
 */
async function sendVerificationEmail(to, code) {
  let transport;
  try {
    transport = getTransporter();
  } catch (err) {
    if (err instanceof MailServiceError) throw err;
    throw new MailServiceError("EMAIL_TRANSPORT_ERROR", "Unable to initialize email transport.");
  }

  const mailOptions = {
    from: FROM,
    to,
    subject: "Confirma tu email — MeetYouLive",
    text: `Tu código de verificación para MeetYouLive es: ${code}\n\nEste código caduca en 24 horas. Si no has creado esta cuenta, ignora este mensaje.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f0821;color:#e2e8f0;border-radius:12px">
        <h1 style="font-size:1.5rem;margin-bottom:8px;color:#fff">Confirma tu email</h1>
        <p style="color:#94a3b8;margin-bottom:24px">Gracias por unirte a <strong style="color:#e040fb">MeetYouLive</strong>. Usa el siguiente código para verificar tu cuenta:</p>
        <div style="background:#1e1040;border:1px solid rgba(224,64,251,0.3);border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
          <span style="font-size:2.4rem;font-weight:800;letter-spacing:0.25em;color:#e040fb">${code}</span>
        </div>
        <p style="color:#64748b;font-size:0.85rem">Este código caduca en <strong>24 horas</strong>. Si no has creado esta cuenta, ignora este mensaje.</p>
      </div>
    `,
  };

  let info;
  try {
    info = await transport.sendMail(mailOptions);
  } catch (err) {
    throw new MailServiceError(
      "EMAIL_DELIVERY_FAILED",
      `Unable to send verification email: ${err.message}`,
      502
    );
  }

  // In dev (jsonTransport), print what would have been sent.
  // This code path is only reached when SMTP_HOST is not set (non-production).
  // NEVER log verification codes in production.
  if (!process.env.SMTP_HOST && process.env.NODE_ENV !== "production") {
    const parsed = typeof info.message === "string" ? JSON.parse(info.message) : info;
    console.log(`\n📧 [DEV EMAIL] To: ${to}`);
    console.log(`   Subject: ${parsed.subject || mailOptions.subject}`);
    console.log(`   Verification code: ${code}\n`);
  }

  return info;
}

const REACTIVATION_MESSAGES = [
  null, // index 0 unused
  {
    subject: "💖 Tienes nuevos likes esperándote — MeetYouLive",
    headline: "Tienes nuevos likes esperándote",
    body: "Mientras estuviste fuera, alguien se fijó en ti. ¡No los hagas esperar más!",
    cta: "Ver mis likes",
    href: "/matches",
    emoji: "💖",
  },
  {
    subject: "🔥 Estás perdiendo matches ahora mismo — MeetYouLive",
    headline: "Estás perdiendo matches ahora mismo",
    body: "Cada minuto que pasa es una conexión que se enfría. Vuelve y descubre quién espera por ti.",
    cta: "Ver mis matches",
    href: "/crush",
    emoji: "🔥",
  },
  {
    subject: "🚀 Vuelve ahora y destaca tu perfil — MeetYouLive",
    headline: "¡Es hora de volver!",
    body: "Tu perfil está perdiendo visibilidad. Regresa ahora, destaca entre la multitud y no te pierdas nada.",
    cta: "Destacar mi perfil",
    href: "/profile",
    emoji: "🚀",
  },
];

/**
 * Send a reactivation email to an inactive user.
 * @param {string}  to           - recipient email
 * @param {string}  displayName  - user name or username shown in the email
 * @param {1|2|3}   day          - inactivity window (1 = 24 h, 2 = 48 h, 3 = 72 h)
 * @param {number}  likesCount   - pending likes count (for personalisation)
 * @param {number}  matchesCount - matches count (for personalisation)
 */
async function sendReactivationEmail(to, displayName, day, likesCount = 0, matchesCount = 0) {
  const transport = getTransporter();
  const msg = REACTIVATION_MESSAGES[day];
  if (!msg) return;

  const name = displayName || "amigo";
  const appUrl = process.env.FRONTEND_URL || "https://meetyoulive.net";

  let personalNote = "";
  if (day === 1 && likesCount > 0) {
    const count = Number(likesCount);
    personalNote = `<p style="color:#c8a2f8;font-size:0.95rem;margin:0 0 20px">Tienes <strong style="color:#e040fb">${count} like${count > 1 ? "s" : ""}</strong> esperándote.</p>`;
  } else if (day === 2 && matchesCount > 0) {
    const count = Number(matchesCount);
    personalNote = `<p style="color:#c8a2f8;font-size:0.95rem;margin:0 0 20px">Ya tienes <strong style="color:#e040fb">${count} match${count > 1 ? "es" : ""}</strong>. ¡No los dejes enfriar!</p>`;
  }

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f0821;color:#e2e8f0;border-radius:12px">
      <p style="font-size:2rem;margin:0 0 8px;line-height:1">${msg.emoji}</p>
      <h1 style="font-size:1.4rem;margin:0 0 8px;color:#fff">${msg.headline}</h1>
      <p style="color:#94a3b8;margin:0 0 16px">Hola ${name},</p>
      <p style="color:#c8a2f8;font-size:0.95rem;margin:0 0 20px">${msg.body}</p>
      ${personalNote}
      <a href="${appUrl}${msg.href}"
         style="display:inline-block;background:linear-gradient(135deg,#c040ff,#ff4fa3);color:#fff;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:1rem;margin-bottom:24px">
        ${msg.cta}
      </a>
      <p style="color:#64748b;font-size:0.8rem;margin:0">Si no quieres recibir más recordatorios, simplemente ignora este mensaje. Te echamos de menos 💜</p>
    </div>
  `;

  const info = await transport.sendMail({
    from: FROM,
    to,
    subject: msg.subject,
    text: `${msg.headline}\n\n${msg.body}\n\nVuelve ahora: ${appUrl}${msg.href}`,
    html,
  });

  if (!process.env.SMTP_HOST && process.env.NODE_ENV !== "production") {
    console.log(`\n📧 [DEV EMAIL] Reactivation day ${day} → ${to}`);
    console.log(`   Subject: ${msg.subject}\n`);
  }

  return info;
}

module.exports = { sendVerificationEmail, sendReactivationEmail };
