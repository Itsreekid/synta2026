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
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Tajawal', Arial, sans-serif;
      background-color: #f0f4f8;
      direction: rtl;
      -webkit-font-smoothing: antialiased;
    }

    .wrapper {
      max-width: 600px;
      margin: 32px auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(1, 48, 71, 0.12);
    }

    /* ── Header gradient panel ── */
    .header {
      background: linear-gradient(160deg, #024a6e 0%, #013047 45%, #001e30 100%);
      padding: 0;
      position: relative;
      overflow: hidden;
    }

    .header-inner {
      position: relative;
      z-index: 2;
      padding: 40px 40px 0;
      text-align: center;
    }

    /* SVG chart graphic */
    .header-graphic {
      display: block;
      width: 100%;
      max-height: 180px;
      margin-top: 16px;
    }

    .logo-img {
      width: 100px;
      height: auto;
      margin-bottom: 16px;
    }

    /* Decorative orbs */
    .orb {
      position: absolute;
      border-radius: 50%;
      pointer-events: none;
    }
    .orb-1 {
      width: 220px; height: 220px;
      background: radial-gradient(circle, rgba(33,158,188,.22) 0%, transparent 70%);
      top: -60px; left: -60px;
    }
    .orb-2 {
      width: 160px; height: 160px;
      background: radial-gradient(circle, rgba(246,133,31,.18) 0%, transparent 70%);
      bottom: 20px; right: -40px;
    }

    /* ── Body content ── */
    .body {
      padding: 40px 40px 32px;
    }

    .greeting {
      font-size: 26px;
      font-weight: 900;
      color: #013047;
      margin-bottom: 12px;
      line-height: 1.3;
    }

    .subtext {
      font-size: 15px;
      color: #5c6b78;
      line-height: 1.75;
      margin-bottom: 32px;
    }

    /* Verification button */
    .btn-wrap {
      text-align: center;
      margin-bottom: 32px;
    }

    .btn-verify {
      display: inline-block;
      background: linear-gradient(135deg, #F6851F 0%, #e07010 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-family: 'Tajawal', Arial, sans-serif;
      font-size: 17px;
      font-weight: 700;
      padding: 16px 48px;
      border-radius: 12px;
      box-shadow: 0 4px 18px rgba(246,133,31,.4);
      letter-spacing: 0.3px;
    }

    /* Info card */
    .info-card {
      background: #f7fbff;
      border: 1.5px solid #d1e7f8;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 28px;
    }

    .info-card-title {
      font-size: 14px;
      font-weight: 700;
      color: #013047;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .info-card ul {
      list-style: none;
      padding: 0;
    }

    .info-card li {
      font-size: 13.5px;
      color: #5c6b78;
      padding: 4px 0;
      padding-right: 18px;
      position: relative;
      line-height: 1.6;
    }

    .info-card li::before {
      content: '✓';
      position: absolute;
      right: 0;
      color: #F6851F;
      font-weight: 700;
    }

    /* Fallback URL */
    .fallback {
      font-size: 12px;
      color: #94a3b8;
      word-break: break-all;
      text-align: center;
      margin-bottom: 20px;
      line-height: 1.5;
    }

    .fallback a {
      color: #219EBC;
      text-decoration: none;
    }

    /* ── Footer ── */
    .footer {
      background: #f7f9fb;
      border-top: 1px solid #e8edf2;
      padding: 24px 40px;
      text-align: center;
    }

    .footer p {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.7;
      margin-bottom: 6px;
    }

    .footer a {
      color: #F6851F;
      text-decoration: none;
    }

    /* Chart SVG styles */
    .chart-svg {
      display: block;
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- ── Header with branding + chart graphic ── -->
    <div class="header">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>

      <div class="header-inner">
        <img
          src="https://syntaacademy.tn/source/logo.png"
          alt="Synta Academy"
          class="logo-img"
        >
      </div>

      <!-- Inline SVG: rising performance chart -->
      <svg class="header-graphic chart-svg" viewBox="0 0 600 180" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <!-- Background glow -->
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#F6851F" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#F6851F" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stop-color="#219EBC"/>
            <stop offset="100%" stop-color="#F6851F"/>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <!-- Grid lines -->
        <line x1="0" y1="45"  x2="600" y2="45"  stroke="rgba(255,255,255,.06)" stroke-width="1"/>
        <line x1="0" y1="90"  x2="600" y2="90"  stroke="rgba(255,255,255,.06)" stroke-width="1"/>
        <line x1="0" y1="135" x2="600" y2="135" stroke="rgba(255,255,255,.06)" stroke-width="1"/>

        <!-- Area fill under the chart line -->
        <path
          d="M0,160 L0,140 C60,130 100,120 160,105 C220,90 260,80 320,60 C380,40 420,30 480,20 C520,14 560,12 600,10 L600,160 Z"
          fill="url(#chartFill)"
        />

        <!-- Main rising line -->
        <path
          d="M0,140 C60,130 100,120 160,105 C220,90 260,80 320,60 C380,40 420,30 480,20 C520,14 560,12 600,10"
          fill="none"
          stroke="url(#chartLine)"
          stroke-width="3"
          stroke-linecap="round"
          filter="url(#glow)"
        />

        <!-- Data-point dots -->
        <circle cx="160" cy="105" r="5" fill="#F6851F" stroke="#fff" stroke-width="2"/>
        <circle cx="320" cy="60"  r="5" fill="#F6851F" stroke="#fff" stroke-width="2"/>
        <circle cx="480" cy="20"  r="6" fill="#F6851F" stroke="#fff" stroke-width="2.5"/>

        <!-- "verified" badge near the last dot -->
        <rect x="486" y="4" width="72" height="22" rx="6" fill="#F6851F"/>
        <text x="522" y="19" font-family="Arial" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">تم التحقق ✓</text>
      </svg>
    </div>

    <!-- ── Body ── -->
    <div class="body">
      <p class="greeting">أهلاً بك، ${firstName}! 👋</p>

      <p class="subtext">
        مرحباً بك في <strong>Synta Academy</strong> — منصتك التعليمية المتخصصة في الرياضيات والعلوم.
        <br><br>
        لتفعيل حسابك والوصول إلى جميع الدروس والمحتوى التعليمي، يرجى تأكيد عنوان بريدك الإلكتروني بالنقر على الزر أدناه.
      </p>

      <div class="btn-wrap">
        <a href="${verifyUrl}" class="btn-verify" target="_blank">
          تأكيد البريد الإلكتروني &larr;
        </a>
      </div>

      <div class="info-card">
        <div class="info-card-title">
          <span>ℹ️</span> معلومات مهمة حول هذا الرابط
        </div>
        <ul>
          <li>صالح لمدة <strong>24 ساعة</strong> من وقت إرسال هذا البريد</li>
          <li>يمكن استخدامه مرة واحدة فقط</li>
          <li>إذا لم تقم بالتسجيل في Synta Academy، يمكنك تجاهل هذا البريد بأمان</li>
        </ul>
      </div>

      <p class="fallback">
        إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:<br>
        <a href="${verifyUrl}">${verifyUrl}</a>
      </p>
    </div>

    <!-- ── Footer ── -->
    <div class="footer">
      <p>
        تم إرسال هذا البريد إلى عنوانك لأنك سجّلت في <a href="${BASE_URL}">Synta Academy</a>.
      </p>
      <p>
        إذا لم تكن أنت من أجرى هذا الطلب، يرجى تجاهل هذه الرسالة أو
        <a href="mailto:contact@syntaacademy.tn">التواصل معنا</a>.
      </p>
      <p style="margin-top:12px; color:#c7d0db;">
        © ${new Date().getFullYear()} Synta Academy. جميع الحقوق محفوظة.
      </p>
    </div>

  </div>
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
