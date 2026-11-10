// =====================================================
// EMAIL SERVICE — Resend integration
// backend/services/email.js
//
// Exports a single function: sendVerificationEmail(to, name, token)
// All email logic is isolated here so routes stay thin.
// =====================================================
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "Synta Academy <contact@syntaacademy.tn>";
const BASE_URL     = process.env.APP_URL || "https://syntaacademy.tn";

// ── Token generation ───────────────────────────────────────────────────────
/**
 * Generate a cryptographically secure hex token and its 24-hour expiry.
 * @returns {{ token: string, expiresAt: Date }}
 */
export function generateVerificationToken() {
  const token    = crypto.randomBytes(32).toString("hex"); // 64-char hex
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24 h
  return { token, expiresAt };
}

// ── Email template ─────────────────────────────────────────────────────────
function escapeEmailHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function buildVerificationEmailHtml(name, email, verifyUrl) {
  const firstName = escapeEmailHtml(name?.trim().split(/\s+/)[0] || "toi");
  const address = escapeEmailHtml(email);
  const link = escapeEmailHtml(verifyUrl);
  const logo = escapeEmailHtml(new URL("/source/logo.png", BASE_URL).href);

  // Tables and inline styles keep the registration page's visual language in email clients.
  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Confirme ton adresse e-mail · Synta Academy</title>
  <style>
    @media screen and (max-width: 480px) {
      .email-content { padding-left: 22px !important; padding-right: 22px !important; }
      .email-heading { font-size: 29px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;color:#013047;font-family:Tajawal,Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">Ton compte est créé. Confirme ton adresse e-mail et commence à apprendre avec Synta Academy.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="width:100%;background-color:#f8fafc">
    <tr><td align="center" style="padding:32px 0 40px">
      <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;margin:0 auto">
        <tr><td align="center" style="padding:0 28px 36px">
          <img src="${logo}" alt="Synta Academy" width="90" height="83" style="display:block;width:90px;height:auto;border:0">
        </td></tr>
        <tr><td class="email-content" align="center" style="padding:0 40px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 25px">
            <tr><td align="center" width="64" height="64" bgcolor="#edf6fa" style="width:64px;height:64px;background-color:#edf6fa;border-radius:20px;color:#013047;font-size:28px;line-height:64px">&#9993;</td></tr>
          </table>
          <p style="margin:0 0 18px;color:#167c99;font-size:10px;line-height:18px;font-weight:bold;letter-spacing:1.8px;text-transform:uppercase">Ton compte est créé</p>
          <h1 class="email-heading" style="margin:0 0 24px;color:#013047;font-size:34px;line-height:1.25;font-weight:bold;letter-spacing:-0.6px">Un dernier clic,<br>et c’est parti.</h1>
          <p style="margin:0 0 12px;color:#013047;font-size:15px;line-height:24px">Bienvenue, ${firstName}.</p>
          <p style="margin:0;color:#64748b;font-size:14px;line-height:24px">Confirme ton adresse e-mail pour activer ton compte et commencer à apprendre.</p>
          <p style="margin:14px 0 30px;color:#013047;font-size:14px;line-height:24px;font-weight:bold;word-break:break-word">${address}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">
            <tr><td align="center" bgcolor="#F6851F" style="background-color:#F6851F;border-radius:10px;mso-padding-alt:17px 20px">
              <a href="${link}" style="display:block;padding:17px 20px;border:1px solid #F6851F;border-radius:10px;color:#013047;font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;text-align:center">Confirmer mon adresse e-mail&nbsp; &#8594;</a>
            </td></tr>
          </table>
          <p style="margin:22px 0 0;color:#64748b;font-size:12px;line-height:21px">Ce lien est valable 24 heures.<br>Une fois ton adresse confirmée, connecte-toi pour retrouver tes formations.</p>
          <p style="margin:22px 0 0;font-size:12px;line-height:20px"><a href="mailto:contact@syntaacademy.tn" style="color:#013047;text-decoration:underline">Besoin d’aide ? Contacte l’équipe Synta</a></p>
          <p style="margin:30px 0 0;padding-top:22px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:19px">Tu n’as pas créé de compte ? Tu peux ignorer cet e-mail.<br>Un peu de curiosité. Beaucoup de possibilités.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main export ────────────────────────────────────────────────────────────
/**
 * Send the verification email using Resend.
 *
 * @param {string} to      - Recipient email address
 * @param {string} name    - User's display name (for the greeting)
 * @param {string} token   - The hex verification token
 * @returns {Promise<void>}
 */
export async function sendVerificationEmail(to, name, token) {
  const verificationUrl = new URL("/auth/verify-email", BASE_URL);
  verificationUrl.searchParams.set("token", token);
  const verifyUrl = verificationUrl.href;

  const { error } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [to],
    subject: "Confirme ton adresse e-mail · Synta Academy",
    html:    buildVerificationEmailHtml(name, to, verifyUrl),
    text:    `Bienvenue, ${name || "toi"}.\n\nConfirme ton adresse e-mail pour activer ton compte :\n${verifyUrl}\n\nCe lien est valable 24 heures.\nBesoin d’aide ? contact@syntaacademy.tn\n\nSi tu n’as pas créé de compte, tu peux ignorer cet e-mail.`,
  });

  if (error) {
    // Log but don't crash — a missing email must not block account creation
    console.error("[email] Resend error for", to, ":", error);
    throw new Error(`Failed to send verification email: ${error.message || JSON.stringify(error)}`);
  }

  console.log("[email] Verification email sent to:", to);
}

export async function sendPlacementVerificationEmail(to, token) {
  const url = new URL("/session", BASE_URL);
  url.hash = new URLSearchParams({ placement: token }).toString();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [to],
    subject: "Synta Academy · Confirmation de ton inscription au quiz",
    text: `Ouvre ce lien dans les 30 minutes pour confirmer ton adresse et accéder au quiz de placement : ${url}`,
  });
  if (error) throw new Error("Placement verification email delivery failed");
}
