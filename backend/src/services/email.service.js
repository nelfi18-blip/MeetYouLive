const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || "587", 10),
      secure: parseInt(SMTP_PORT || "587", 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
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
  const transport = getTransporter();

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

  const info = await transport.sendMail(mailOptions);

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

module.exports = { sendVerificationEmail };
