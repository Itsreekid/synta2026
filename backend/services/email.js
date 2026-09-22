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
  const firstName = name?.split(" ")[0] || "طالب";

  return /* html */`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تأكيد البريد الإلكتروني - Synta Academy</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f4f8; font-family: Arial, sans-serif; direction: rtl; text-align: right;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f4f8; padding: 20px 0;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #013047; padding: 30px 20px;">
              <img src="https://syntaacademy.tn/source/logo.png" alt="Synta Academy" style="width: 120px; height: auto; display: block;">
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <h1 style="color: #013047; font-size: 24px; margin: 0 0 16px 0;">أهلاً بك، ${firstName}! 👋</h1>
              <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                مرحباً بك في <strong>Synta Academy</strong> — منصتك المتخصصة في علوم الإعلامية والبرمجة.
                <br><br>
                لتفعيل حسابك والوصول إلى جميع الدروس والمحتوى التعليمي، يرجى تأكيد عنوان بريدك الإلكتروني بالنقر على الزر أدناه.
              </p>

              <!-- Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 30px;">
                    <a href="${verifyUrl}" style="display: inline-block; background-color: #F6851F; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; padding: 14px 32px; border-radius: 8px;">
                      تأكيد البريد الإلكتروني
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="color: #013047; font-size: 14px; font-weight: bold; margin: 0 0 8px 0;">معلومات مهمة:</p>
                    <ul style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0; padding-right: 20px;">
                      <li>الرابط صالح لمدة <strong>24 ساعة</strong> فقط.</li>
                      <li>يمكن استخدامه مرة واحدة.</li>
                      <li>إذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0 0; text-align: center; word-break: break-all;">
                إذا لم يعمل الزر، انسخ الرابط التالي:<br>
                <a href="${verifyUrl}" style="color: #219EBC; text-decoration: underline;">${verifyUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color: #f8fafc; padding: 24px 30px; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin: 0 0 8px 0;">
                تم إرسال هذا البريد لأنك سجلت في <a href="${BASE_URL}" style="color: #F6851F; text-decoration: none;">Synta Academy</a>.
              </p>
              <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin: 0;">
                © ${new Date().getFullYear()} Synta Academy. جميع الحقوق محفوظة.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
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
    subject: "✉️ أكد بريدك الإلكتروني للوصول إلى Synta Academy",
    html:    buildVerificationEmailHtml(name, verifyUrl),
  });

  if (error) {
    // Log but don't crash — a missing email must not block account creation
    console.error("[email] Resend error for", to, ":", error);
    throw new Error(`Failed to send verification email: ${error.message || JSON.stringify(error)}`);
  }

  console.log("[email] Verification email sent to:", to);
}
