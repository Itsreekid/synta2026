// =====================================================
// EMAIL SERVICE — Resend integration
// backend/services/email.js
//
// Verification, password-reset, password-changed and placement emails.
// All email logic is isolated here so routes stay thin.
// =====================================================
import { Resend } from "resend";
import crypto from "crypto";

let resendClient;
const resend = {
  emails: {
    send(payload) {
      resendClient ??= new Resend(process.env.RESEND_API_KEY);
      return resendClient.emails.send(payload);
    },
  },
};

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

/**
 * Shared Synta email layout (logo, icon tile, eyebrow, heading, orange button).
 * Every *Html argument must already be escaped; plain values are escaped here.
 */
function renderEmailLayout({ title, preheader, icon, eyebrow, headingHtml, greetingHtml, introHtml, address, button, noteHtml, footerHtml }) {
  const logo = escapeEmailHtml(new URL("/source/logo.png", BASE_URL).href);
  const addressRow = address
    ? `\n          <p style="margin:14px 0 30px;color:#013047;font-size:14px;line-height:24px;font-weight:bold;word-break:break-word">${escapeEmailHtml(address)}</p>`
    : `\n          <p style="margin:0 0 30px"></p>`;
  const buttonRow = button ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">
            <tr><td align="center" bgcolor="#F6851F" style="background-color:#F6851F;border-radius:10px;mso-padding-alt:17px 20px">
              <a href="${escapeEmailHtml(button.url)}" style="display:block;padding:17px 20px;border:1px solid #F6851F;border-radius:10px;color:#013047;font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;text-align:center">${escapeEmailHtml(button.label)}&nbsp; &#8594;</a>
            </td></tr>
          </table>` : "";

  // Tables and inline styles keep the registration page's visual language in email clients.
  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeEmailHtml(title)} · Synta Academy</title>
  <style>
    @media screen and (max-width: 480px) {
      .email-content { padding-left: 22px !important; padding-right: 22px !important; }
      .email-heading { font-size: 29px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;color:#013047;font-family:Tajawal,Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeEmailHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="width:100%;background-color:#f8fafc">
    <tr><td align="center" style="padding:32px 0 40px">
      <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;margin:0 auto">
        <tr><td align="center" style="padding:0 28px 36px">
          <img src="${logo}" alt="Synta Academy" width="90" height="83" style="display:block;width:90px;height:auto;border:0">
        </td></tr>
        <tr><td class="email-content" align="center" style="padding:0 40px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 25px">
            <tr><td align="center" width="64" height="64" bgcolor="#edf6fa" style="width:64px;height:64px;background-color:#edf6fa;border-radius:20px;color:#013047;font-size:28px;line-height:64px">${icon}</td></tr>
          </table>
          <p style="margin:0 0 18px;color:#167c99;font-size:10px;line-height:18px;font-weight:bold;letter-spacing:1.8px;text-transform:uppercase">${escapeEmailHtml(eyebrow)}</p>
          <h1 class="email-heading" style="margin:0 0 24px;color:#013047;font-size:34px;line-height:1.25;font-weight:bold;letter-spacing:-0.6px">${headingHtml}</h1>
          <p style="margin:0 0 12px;color:#013047;font-size:15px;line-height:24px">${greetingHtml}</p>
          <p style="margin:0;color:#64748b;font-size:14px;line-height:24px">${introHtml}</p>${addressRow}${buttonRow}
          <p style="margin:22px 0 0;color:#64748b;font-size:12px;line-height:21px">${noteHtml}</p>
          <p style="margin:22px 0 0;font-size:12px;line-height:20px"><a href="mailto:contact@syntaacademy.tn" style="color:#013047;text-decoration:underline">Besoin d’aide ? Contacte l’équipe Synta</a></p>
          <p style="margin:30px 0 0;padding-top:22px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:19px">${footerHtml}<br>Un peu de curiosité. Beaucoup de possibilités.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

function firstNameOf(name) {
  return escapeEmailHtml(name?.trim().split(/\s+/)[0] || "toi");
}

function buildVerificationEmailHtml(name, email, verifyUrl) {
  return renderEmailLayout({
    title: "Confirme ton adresse e-mail",
    preheader: "Ton compte est créé. Confirme ton adresse e-mail et commence à apprendre avec Synta Academy.",
    icon: "&#9993;",
    eyebrow: "Ton compte est créé",
    headingHtml: "Un dernier clic,<br>et c’est parti.",
    greetingHtml: `Bienvenue, ${firstNameOf(name)}.`,
    introHtml: "Confirme ton adresse e-mail pour activer ton compte et commencer à apprendre.",
    address: email,
    button: { url: verifyUrl, label: "Confirmer mon adresse e-mail" },
    noteHtml: "Ce lien est valable 24 heures.<br>Une fois ton adresse confirmée, connecte-toi pour retrouver tes formations.",
    footerHtml: "Tu n’as pas créé de compte ? Tu peux ignorer cet e-mail.",
  });
}

export function buildPasswordResetEmailHtml(name, email, resetUrl) {
  return renderEmailLayout({
    title: "Réinitialise ton mot de passe",
    preheader: "Tu as demandé un nouveau mot de passe pour ton compte Synta Academy. Ce lien est valable 1 heure.",
    icon: "&#128273;",
    eyebrow: "Mot de passe oublié",
    headingHtml: "On te remet<br>sur les rails.",
    greetingHtml: `Bonjour, ${firstNameOf(name)}.`,
    introHtml: "Tu as demandé à réinitialiser le mot de passe de ton compte. Clique sur le bouton pour en choisir un nouveau.",
    address: email,
    button: { url: resetUrl, label: "Choisir un nouveau mot de passe" },
    noteHtml: "Ce lien est valable 1 heure et ne fonctionne qu’une seule fois.<br>Après le changement, tu seras déconnecté de tous tes appareils.",
    footerHtml: "Tu n’as rien demandé ? Ignore cet e-mail : ton mot de passe actuel reste inchangé.",
  });
}

export function buildPasswordChangedEmailHtml(name, email) {
  return renderEmailLayout({
    title: "Ton mot de passe a été modifié",
    preheader: "Le mot de passe de ton compte Synta Academy vient d’être modifié.",
    icon: "&#10003;",
    eyebrow: "Sécurité du compte",
    headingHtml: "Mot de passe<br>modifié.",
    greetingHtml: `Bonjour, ${firstNameOf(name)}.`,
    introHtml: "Le mot de passe de ton compte vient d’être changé. Par sécurité, tous tes appareils ont été déconnectés.",
    address: email,
    button: { url: new URL("/login", BASE_URL).href, label: "Me connecter" },
    noteHtml: "Si c’est bien toi, tu n’as rien d’autre à faire.",
    footerHtml: "Ce n’était pas toi ? Demande un nouveau lien depuis « Mot de passe oublié » et contacte l’équipe Synta.",
  });
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

/**
 * Send the password-reset link. The token travels in the URL fragment, so it never
 * reaches server logs, proxies or Referer headers.
 */
export async function sendPasswordResetEmail(to, name, token) {
  const url = new URL("/password-reset", BASE_URL);
  url.hash = new URLSearchParams({ token }).toString();
  const resetUrl = url.href;

  const { error } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [to],
    subject: "Réinitialise ton mot de passe · Synta Academy",
    html:    buildPasswordResetEmailHtml(name, to, resetUrl),
    text:    `Bonjour, ${name || "toi"}.\n\nTu as demandé à réinitialiser le mot de passe de ton compte Synta Academy. Choisis un nouveau mot de passe ici :\n${resetUrl}\n\nCe lien est valable 1 heure et ne fonctionne qu’une seule fois. Après le changement, tu seras déconnecté de tous tes appareils.\n\nTu n’as rien demandé ? Ignore cet e-mail : ton mot de passe actuel reste inchangé.\nBesoin d’aide ? contact@syntaacademy.tn`,
  });
  if (error) throw new Error("Password reset email delivery failed");
}

/** Security notice sent after any successful password change. */
export async function sendPasswordChangedEmail(to, name) {
  const { error } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [to],
    subject: "Ton mot de passe a été modifié · Synta Academy",
    html:    buildPasswordChangedEmailHtml(name, to),
    text:    `Bonjour, ${name || "toi"}.\n\nLe mot de passe de ton compte Synta Academy vient d’être changé. Par sécurité, tous tes appareils ont été déconnectés.\n\nCe n’était pas toi ? Demande un nouveau lien depuis « Mot de passe oublié » sur ${new URL("/password-reset", BASE_URL).href} et contacte contact@syntaacademy.tn.`,
  });
  if (error) throw new Error("Password changed email delivery failed");
}

export async function sendPlacementVerificationEmail(to, token, pagePath = "/session") {
  // Only same-site free-session pages may receive the confirmation token.
  const safePath = /^\/session(\/[a-z0-9]+(-[a-z0-9]+)*)?$/.test(pagePath) ? pagePath : "/session";
  const url = new URL(safePath, BASE_URL);
  url.hash = new URLSearchParams({ placement: token }).toString();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [to],
    subject: "Synta Academy · Confirmation de ton inscription au quiz",
    text: `Ouvre ce lien dans les 30 minutes pour confirmer ton adresse et accéder au quiz de placement : ${url}`,
  });
  if (error) throw new Error("Placement verification email delivery failed");
}
