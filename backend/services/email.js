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
function buildVerificationEmailHtml(name, verifyUrl) {
  const firstName = String(name?.split(" ")[0] || "toi").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  return `<!DOCTYPE html>
<html lang="fr" dir="ltr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3f5ef;font-family:Arial,sans-serif;color:#173e3c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:auto;background:white;border-radius:16px">
<tr><td style="padding:36px"><p style="font-size:21px;font-weight:bold;margin:0 0 32px">synta academy<span style="color:#ec773b">.</span></p>
<h1 style="font-size:27px;line-height:1.25">Bienvenue, ${firstName}.</h1>
<p style="color:#65766d;line-height:1.7">Ton compte est créé. Confirme ton adresse e-mail pour commencer à apprendre sur Synta Academy.</p>
<p style="margin:28px 0"><a href="${verifyUrl}" style="display:inline-block;background:#d9672f;color:white;text-decoration:none;padding:15px 24px;border-radius:8px;font-weight:bold">Confirmer mon adresse e-mail →</a></p>
<p style="font-size:13px;color:#65766d;line-height:1.7">Ce lien est valable 24 heures. Une fois ton adresse confirmée, connecte-toi avec ton e-mail et ton mot de passe.</p>
<p style="font-size:12px;color:#7f8d83;line-height:1.7">Tu n’as pas demandé ce compte ? Tu peux ignorer cet e-mail.</p>
<p style="border-top:1px solid #e4e9df;padding-top:20px;margin-top:28px;font-size:12px">Besoin d’aide ? <a href="mailto:contact@syntaacademy.tn" style="color:#3a6b4e">Contacte l’équipe Synta</a>.</p>
</td></tr></table></td></tr></table></body></html>`;
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
  const verifyUrl = `${BASE_URL}/auth/verify-email?token=${token}`;

  const { error } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      [to],
    subject: "Confirme ton adresse e-mail · Synta Academy",
    html:    buildVerificationEmailHtml(name, verifyUrl),
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
