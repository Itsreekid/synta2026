// =====================================================
// FREE-SESSION CAMPAIGN API ROUTES
// /api/session/...
//
// A campaign is one public link (/session = default campaign, /session/<slug> = others),
// with its own quiz, class/branch, schedule and Zoom meeting.
//
//  - New students: register → confirm e-mail → quiz → choose password → account in `users`.
//  - Logged-in students: quiz → participant (account details unchanged).
//  - Participants see the campaign's Zoom session through the normal live-session system.
// =====================================================
import express from "express";
import {findActiveCampaign, slugAliasesReady, campaignPublicPolicy, publishedCampaignOccurrence, SLUG_PATTERN, RESERVED_SLUGS, CAMPAIGN_COLUMNS} from "../services/free-campaigns.js";
export {findActiveCampaign, SLUG_PATTERN, RESERVED_SLUGS};
import { normalizeTunisianPhone, validateLearnerProfile } from "../utils/learnerProfile.js";
import * as funnel from '../services/free-session-funnel.js';
import pool from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { startSession } from "../services/sessions.js";
import { authRateLimit } from "../middleware/authRateLimit.js";
import { sendPlacementVerificationEmail } from "../services/email.js";
import { createZoomMeeting, deleteZoomMeeting, rescheduleZoomMeeting } from "../utils/zoomClient.js";
import { liveSessionAccess } from "../utils/offerAccess.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 12;
const placementKey = () => crypto.createHmac("sha256", JWT_SECRET).update("synta-placement-v1").digest();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCHOOL_YEARS = ["1ere", "2eme", "3eme", "bac", "other"];
const SCHOOL_SECTIONS = ["lettres", "mathematiques", "informatique", "sciences", "technique", "economie", "other"];
const QUESTION_TYPES = ["multiple_choice", "drag_drop"];

const placementCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/session",
};

function readPlacementToken(token, audience) {
  try {
    return jwt.verify(token, placementKey(), { algorithms: ["HS256"], audience, issuer: "synta-placement" });
  } catch {
    return null;
  }
}

function requirePlacement(req, res, next) {
  if (req.method !== "GET" && !req.is("application/json")) {
    return res.status(415).json({ error: "Requête invalide." });
  }
  const proof = readPlacementToken(req.cookies?.synta_placement, "placement-verified");
  if (!proof?.sub) return res.status(401).json({ error: "Confirme ton adresse e-mail pour continuer." });
  req.placementId = proof.sub;
  req.placementOccurrenceId = proof.occurrenceId || null;
  next();
}

function requireJson(req, res, next) {
  if (!req.is("application/json")) return res.status(415).json({ error: "Requête invalide." });
  next();
}

function computeTier(score, total) {
  if (total === 0) return "explorer";
  const pct = score / total;
  if (pct >= 0.8) return "elite";
  if (pct >= 0.5) return "challenger";
  return "explorer";
}

/** Server-side scoring; correct answers never leave the server. */
export function scoreAnswers(questions, answers) {
  const safeAnswers = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
  let score = 0;
  const submissions = [];
  for (const question of questions) {
    if (!Object.hasOwn(safeAnswers, question.id)) continue;
    const userAnswer = safeAnswers[question.id];
    const correct = question.correct_answer;
    let isCorrect;
    if (question.type === "drag_drop") {
      const userArr = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
      const correctArr = Array.isArray(correct) ? correct : [correct];
      isCorrect = JSON.stringify(userArr.map(String)) === JSON.stringify(correctArr.map(String));
    } else {
      isCorrect = String(userAnswer).trim() === String(correct).trim();
    }
    if (isCorrect) score++;
    submissions.push({ question_id: question.id, answer: userAnswer, is_correct: isCorrect });
  }
  const total = questions.length;
  return {
    score,
    total,
    tier: computeTier(score, total),
    group: score === total && total > 0 ? "advanced" : "beginner",
    submissions,
  };
}

export function campaignPath(campaign) {
  return "/session/" + campaign.slug;
}

function publicCampaign(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    subject: row.subject,
    target_class: row.target_class,
    target_branch: row.target_branch,
    scheduled_at: row.scheduled_at,
    duration_minutes: row.duration_minutes,
    is_default: row.is_default,
    path: campaignPath(row),
  };
}

async function activeQuestions(db, campaignId, withAnswers = false) {
  const result = await db.query(
    `SELECT id, text, type, options, order_index${withAnswers ? ", explanation, correct_answer" : ""}
     FROM session_questions
     WHERE is_active = true AND free_session_id = $1
     ORDER BY order_index ASC, created_at ASC`,
    [campaignId]
  );
  return result.rows;
}

/** Upcoming Zoom session of a campaign, without any Zoom link (students join through /api/live). */
async function upcomingCampaignSession(db, campaignId) {
  const result = await db.query(
    `SELECT id, title, scheduled_at, duration_minutes FROM live_sessions
     WHERE free_session_id = $1 AND status IN ('scheduled', 'live')
       AND scheduled_at + make_interval(mins => COALESCE(duration_minutes, 60)) > NOW()
     ORDER BY scheduled_at LIMIT 1`,
    [campaignId]
  );
  const session = result.rows[0];
  if (!session) return null;
  const tunisDate = new Date(new Date(session.scheduled_at).getTime() + 3600000).toISOString().slice(0, 10);
  return {
    id: session.id,
    title: session.title,
    scheduled_at: session.scheduled_at,
    duration_minutes: session.duration_minutes,
    calendar_link: "/app/calendar?session=" + encodeURIComponent(session.id) + "&date=" + tunisDate,
  };
}

// =====================================================
// PUBLIC FLOW (new students)
// =====================================================

// POST /api/session/register  { slug?, full_name, email, phone }
router.post("/register", authRateLimit(10), async (req, res) => {
  const { full_name, email, phone, slug } = req.body || {};
  if (![full_name, email, phone].every(value => typeof value === "string" && value.trim()) ||
      full_name.length > 150 || email.length > 254 || phone.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Champs requis manquants." });
  }

  try {
    const campaign = await findActiveCampaign(pool, slug);
    if (!campaign) return res.status(404).json({ error: "Cette séance gratuite n’est plus disponible." });
    const policy=await campaignPublicPolicy(pool,campaign.id);
    if(policy.target_branches && !policy.target_branches.includes(req.body.branch))return res.status(400).json({error:'Choisis une section autorisée pour cette séance.'});
    if(policy.ready && await funnel.funnelReady(pool)){
      try{
        const guest=await funnel.guestStatus(pool,campaign.id,req.cookies);
        if(!guest.attempt.submitted)return res.status(409).json({error:'Termine le défi avant de créer ton compte.'});
      }catch(error){return res.status(error.status||500).json({error:error.status?error.message:'Impossible de retrouver ton résultat.'});}
    }
    if (req.body.track || req.body.branch) {
      if (!SCHOOL_YEARS.includes(campaign.target_class || req.body.track) || !SCHOOL_SECTIONS.includes(campaign.target_branch || req.body.branch)) {
        return res.status(400).json({ error: 'Choisis ta classe et ta section.' });
      }
    }
    const profileError=validateLearnerProfile({phone,userClass:campaign.target_class||req.body.track,userBranch:campaign.target_branch||req.body.branch},true);
    if(profileError)return res.status(400).json({error:profileError});
    const address = email.trim().toLowerCase();
    // A pending registration may move to another campaign only while its quiz is unfinished.
    // Name and phone of an existing registration are never overwritten from this public form.
    await pool.query(
      `INSERT INTO session_registrations (full_name, email, phone, free_session_id, track, filier)
       SELECT $1, $2, $3, $4, $5, $6 WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = $2)
       ON CONFLICT (email) DO UPDATE SET
         free_session_id = EXCLUDED.free_session_id, track = EXCLUDED.track, filier = EXCLUDED.filier,
         updated_at = NOW()
       WHERE NOT session_registrations.account_activated AND NOT session_registrations.completed
         AND session_registrations.free_session_id IS DISTINCT FROM EXCLUDED.free_session_id`,
      [full_name.trim(), address, normalizeTunisianPhone(phone), campaign.id, campaign.target_class || req.body.track || null, campaign.target_branch || req.body.branch || null]
    );
    const result = await pool.query(
      `SELECT r.id, r.updated_at::text AS revision, f.slug
       FROM session_registrations r JOIN free_sessions f ON f.id = r.free_session_id
       WHERE r.email = $1 AND NOT r.account_activated
         AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = r.email)`,
      [address]
    );
    const registration = result.rows[0];
    if (registration) {
      if (await funnel.funnelReady(pool)) await funnel.bindGuestRegistration(pool, campaign.id, registration.id, req.cookies);
      const occurrenceId = policy.ready ? null : req.body.occurrenceId;
      if (!policy.ready && occurrenceId && !(await funnel.campaignOccurrences(pool, campaign.id)).some(row => row.id === occurrenceId)) {
        return res.status(409).json({ error: 'Choisis une séance disponible.' });
      }
      const token = jwt.sign({ revision: registration.revision, ...(occurrenceId && { occurrenceId }) }, placementKey(), {
        issuer: "synta-placement", audience: "placement-email", subject: registration.id,
        jwtid: crypto.randomUUID(), expiresIn: "30m",
      });
      sendPlacementVerificationEmail(address, token, campaignPath(registration))
        .catch(() => console.error("[placement] Verification delivery failed"));
    }
    // Same answer whether or not the address is known, so accounts cannot be discovered here.
    return res.status(202).json({ success: true });
  } catch (err) {
    console.error("[placement] Registration failed:", err.code);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/verify", authRateLimit(20), async (req, res) => {
  if (!req.is("application/json")) return res.status(415).json({ error: "Requête invalide." });
  const proof = readPlacementToken(req.body?.token, "placement-email");
  if (!proof?.sub || !proof.revision) return res.status(400).json({ error: "Lien invalide ou expiré." });
  try {
    const result = await pool.query(
      `UPDATE session_registrations r
       SET updated_at = GREATEST(clock_timestamp(), updated_at + INTERVAL '1 microsecond')
       WHERE id = $1 AND updated_at = $2::timestamptz AND NOT account_activated
         AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = r.email)
       RETURNING completed, score, quiz_total, tier, "group",
         (SELECT slug FROM free_sessions f WHERE f.id = r.free_session_id) AS slug`,
      [proof.sub, proof.revision]
    );
    if (!result.rowCount) return res.status(400).json({ error: "Lien invalide ou déjà utilisé." });
    const token = jwt.sign({ ...(proof.occurrenceId && { occurrenceId: proof.occurrenceId }) }, placementKey(), {
      issuer: "synta-placement", audience: "placement-verified", subject: proof.sub, expiresIn: "1h",
    });
    res.cookie("synta_placement", token, { ...placementCookie, maxAge: 3600000 });
    res.set("Cache-Control", "no-store");
    return res.json({ registration: result.rows[0] });
  } catch (err) {
    console.error("[placement] Verification failed:", err.code);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/status", requirePlacement, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.completed, r.score, r.quiz_total, r.tier, r."group", f.slug
       FROM session_registrations r JOIN free_sessions f ON f.id = r.free_session_id
       WHERE r.id = $1 AND NOT r.account_activated`, [req.placementId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Inscription indisponible." });
    res.set("Cache-Control", "no-store");
    return res.json({ registration: result.rows[0] });
  } catch (err) {
    console.error("[placement] Status failed:", err.code);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// GET /api/session/questions?slug=  — public quiz without the answers.
router.get("/questions", async (req, res) => {
  try {
    const campaign = await findActiveCampaign(pool, req.query.slug);
    if (!campaign) return res.status(404).json({ error: "Cette séance gratuite n’est plus disponible." });
    return res.json({ questions: await activeQuestions(pool, campaign.id) });
  } catch (err) {
    console.error("[placement] Questions fetch failed:", err.code ?? err.name);
    return res.status(500).json({ error: "Impossible de charger les questions." });
  }
});

// POST /api/session/submit — new students, scored against their registration's campaign.
router.post("/submit", requirePlacement, async (req, res) => {
  const { answers, track, branch: filier } = req.body || {};
  const registrationId = req.placementId;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return res.status(400).json({ error: "Données manquantes." });
  }

  try {
    const registration = await pool.query(
      `SELECT r.free_session_id, f.target_class, f.target_branch, f.is_active
       FROM session_registrations r JOIN free_sessions f ON f.id = r.free_session_id
       WHERE r.id = $1 AND NOT r.account_activated`, [registrationId]
    );
    const campaign = registration.rows[0];
    if (!campaign || !campaign.is_active) return res.status(409).json({ error: "Inscription indisponible." });
    // Campaigns with a target class/branch fix them; open campaigns keep the student's choice.
    const finalTrack = campaign.target_class || (typeof track === "string" ? track.slice(0, 40) : null);
    const finalFilier = campaign.target_branch || (typeof filier === "string" ? filier.slice(0, 80) : null);
    if (!SCHOOL_YEARS.includes(finalTrack) || !SCHOOL_SECTIONS.includes(finalFilier)) return res.status(400).json({ error: "Données manquantes." });

    const questions = await activeQuestions(pool, campaign.free_session_id, true);
    const result = scoreAnswers(questions, answers);

    for (const sub of result.submissions) {
      await pool.query(
        `INSERT INTO session_submissions (registration_id, question_id, answer, is_correct)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (registration_id, question_id) DO UPDATE SET answer = EXCLUDED.answer, is_correct = EXCLUDED.is_correct`,
        [registrationId, sub.question_id, JSON.stringify(sub.answer), sub.is_correct]
      );
    }

    const updated = await pool.query(
      `UPDATE session_registrations
       SET score = $1, quiz_total = $2, tier = $3, completed = true, "group" = $4, track = $5, filier = $6, updated_at = NOW()
       WHERE id = $7 AND NOT account_activated
       RETURNING track, score, quiz_total, tier, completed`,
      [result.score, result.total, result.tier, result.group, finalTrack, finalFilier, registrationId]
    );
    if (!updated.rowCount) return res.status(409).json({ error: "Inscription indisponible." });
    return res.json({ success: true, score: result.score, total: result.total, tier: result.tier, group: result.group });
  } catch (err) {
    console.error("[placement] Submit failed:", err.code ?? err.name);
    return res.status(500).json({ error: "Erreur lors de la soumission." });
  }
});

// POST /api/session/set-password — creates the account in `users` and makes the student a participant.
router.post("/set-password", authRateLimit(10), requirePlacement, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < 6 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères et au plus 72 octets." });
  }

  let client;
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    client = await pool.connect();
    await client.query("BEGIN");
    const registration = await client.query(
      `SELECT r.email, r.full_name, r.phone, r.track, r.filier, r.free_session_id, r.score, r.quiz_total, r.tier, r."group",
              f.target_class, f.target_branch
       FROM session_registrations r JOIN free_sessions f ON f.id = r.free_session_id
       WHERE r.id = $1 AND r.completed AND NOT r.account_activated FOR UPDATE OF r`, [req.placementId]
    );
    if (!registration.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Termine le quiz ou connecte-toi à ton compte." });
    }
    const reg = registration.rows[0];
    const registrationPolicy=await campaignPublicPolicy(client,reg.free_session_id);
    if(registrationPolicy.target_branches&&!registrationPolicy.target_branches.includes(reg.target_branch||reg.filier)){
      await client.query('ROLLBACK');return res.status(409).json({error:'Les sections de cette campagne ont changé. Contacte Synta Academy avant de terminer ton inscription.'});
    }
    const result = await client.query(
      `INSERT INTO users (email, password_hash, name, phone, role, email_verified, class, branch,
                          signup_source, signup_free_session_id)
       SELECT $1, $2, $3, $4, 'user', true, $5, $6, 'free_session', $7
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1)
       ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role`,
      [reg.email, passwordHash, reg.full_name, reg.phone, reg.target_class || reg.track, reg.target_branch || reg.filier, reg.free_session_id]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Connecte-toi avec la méthode de ton compte existant." });
    }

    const user = result.rows[0];
    await client.query(
      `UPDATE session_registrations
       SET account_activated = true, auth_user_id = $2, updated_at = NOW() WHERE id = $1`,
      [req.placementId, user.id]
    );
    await client.query(
      `INSERT INTO free_session_participants
         (free_session_id, user_id, source, score, total, tier, "group", registration_id)
       VALUES ($1, $2, 'new_signup', $3, $4, $5, $6, $7)
       ON CONFLICT (free_session_id, user_id) DO NOTHING`,
      [reg.free_session_id, user.id, reg.score, reg.quiz_total, reg.tier, reg.group, req.placementId]
    );
    const savedFree = await funnel.claimRegistration(client, user.id, req.placementId, reg.free_session_id, req.placementOccurrenceId);
    await client.query("COMMIT");
    res.clearCookie("synta_placement", placementCookie);
    await startSession(pool, res, user);
    // Open the campaign session in the student calendar (its popup has the Join button).
    const session = savedFree ? (savedFree.reserved ? savedFree.session : null) : await upcomingCampaignSession(pool, reg.free_session_id).catch(() => null);
    return res.json({ success: true, redirectUrl: "/dashboard", session: savedFree?.session || session, reserved: savedFree?.reserved === true });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[placement] Activation failed:", err.code);
    return res.status(500).json({ error: "Erreur serveur." });
  } finally {
    client?.release();
  }
});

// =====================================================
// LOGGED-IN STUDENTS (existing accounts)
// =====================================================

function participantResult(row) {
  return { score: row.score, total: row.total, tier: row.tier, group: row.group, joined_at: row.joined_at };
}

// GET /api/session/member/status?slug=
router.get("/member/status", authApiMiddleware, async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const campaign = await findActiveCampaign(pool, req.query.slug);
    if (!campaign) return res.status(404).json({ error: "Cette séance gratuite n’est plus disponible." });
    const participant = await pool.query(
      `SELECT score, total, tier, "group", joined_at FROM free_session_participants
       WHERE free_session_id = $1 AND user_id = $2`, [campaign.id, req.user.id]
    );
    return res.json({
      campaign: publicCampaign(campaign),
      canParticipate: req.user.role === "user",
      participant: participant.rowCount ? participantResult(participant.rows[0]) : null,
      session: participant.rowCount ? await upcomingCampaignSession(pool, campaign.id) : null,
    });
  } catch (err) {
    console.error("[free-session] Member status failed:", err.code ?? err.name);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/session/member/submit  { slug?, answers }
// Records the quiz for an existing account. Class, branch and signup source stay unchanged.
router.post("/member/submit", authApiMiddleware, authRateLimit(20, 15 * 60 * 1000, req => req.user.id), requireJson, async (req, res) => {
  const { slug, answers } = req.body || {};
  if (req.user.role !== "user") return res.status(403).json({ error: "Réservé aux comptes étudiants." });
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return res.status(400).json({ error: "Données manquantes." });
  }
  try {
    const campaign = await findActiveCampaign(pool, slug);
    if (!campaign) return res.status(404).json({ error: "Cette séance gratuite n’est plus disponible." });
    const questions = await activeQuestions(pool, campaign.id, true);
    const result = scoreAnswers(questions, answers);
    const answerLog = Object.fromEntries(result.submissions.map(sub =>
      [sub.question_id, { answer: sub.answer, is_correct: sub.is_correct }]));

    const inserted = await pool.query(
      `INSERT INTO free_session_participants
         (free_session_id, user_id, source, score, total, tier, "group", answers)
       SELECT $1, u.id, 'existing_student', $3, $4, $5, $6, $7
       FROM users u WHERE u.id = $2 AND u.role = 'user'
       ON CONFLICT (free_session_id, user_id) DO NOTHING
       RETURNING score, total, tier, "group", joined_at`,
      [campaign.id, req.user.id, result.score, result.total, result.tier, result.group, JSON.stringify(answerLog)]
    );
    if (!inserted.rowCount) {
      const existing = await pool.query(
        `SELECT score, total, tier, "group", joined_at FROM free_session_participants
         WHERE free_session_id = $1 AND user_id = $2`, [campaign.id, req.user.id]
      );
      if (!existing.rowCount) return res.status(403).json({ error: "Réservé aux comptes étudiants." });
      return res.status(409).json({
        error: "Tu as déjà participé à cette séance gratuite.",
        participant: participantResult(existing.rows[0]),
        session: await upcomingCampaignSession(pool, campaign.id),
      });
    }
    return res.json({
      success: true,
      participant: participantResult(inserted.rows[0]),
      session: await upcomingCampaignSession(pool, campaign.id),
    });
  } catch (err) {
    console.error("[free-session] Member submit failed:", err.code ?? err.name);
    return res.status(500).json({ error: "Erreur lors de la soumission." });
  }
});

// =====================================================
// ADMIN — campaigns
// =====================================================

const adminHandler = handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error("[free-session] Admin error:", err.code ?? err.name);
    if (!res.headersSent) res.status(500).json({ error: "Erreur serveur." });
  }
};

/** Validates the full campaign form. Returns { value } or { error }. */
export function validateCampaign(body) {
  const b = body || {};
  const allowed = ["slug", "title", "description", "subject", "target_class", "target_branch",
    "scheduled_at", "duration_minutes", "is_active", "is_default"];
  if (Object.keys(b).some(key => !allowed.includes(key))) return { error: "Champ inconnu." };
  const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : "";
  if (!SLUG_PATTERN.test(slug) || slug.length < 2 || slug.length > 60) {
    return { error: "Lien invalide : lettres minuscules, chiffres et tirets (ex. 3eme-info)." };
  }
  if (RESERVED_SLUGS.has(slug)) return { error: "Ce lien est réservé. Choisis un autre nom." };
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title || title.length > 150) return { error: "Titre requis (150 caractères maximum)." };
  const description = typeof b.description === "string" && b.description.trim() ? b.description.trim() : null;
  if (description && description.length > 2000) return { error: "Description trop longue (2000 caractères maximum)." };
  const subject = typeof b.subject === "string" && b.subject.trim() ? b.subject.trim() : "Informatique";
  if (subject.length > 100) return { error: "Matière trop longue." };
  const targetClass = b.target_class || null;
  const targetBranch = b.target_branch || null;
  if (targetClass !== null && !SCHOOL_YEARS.includes(targetClass)) return { error: "Classe invalide." };
  if (targetBranch !== null && !SCHOOL_SECTIONS.includes(targetBranch)) return { error: "Section invalide." };
  let scheduledAt = null;
  if (b.scheduled_at !== null && b.scheduled_at !== undefined && b.scheduled_at !== "") {
    if (typeof b.scheduled_at !== "string" || !Number.isFinite(Date.parse(b.scheduled_at))) {
      return { error: "Date de séance invalide." };
    }
    scheduledAt = new Date(b.scheduled_at).toISOString();
  }
  const duration = b.duration_minutes === undefined ? 60 : Number(b.duration_minutes);
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
    return { error: "Durée entre 15 et 480 minutes." };
  }
  if (b.is_active !== undefined && typeof b.is_active !== "boolean") return { error: "Statut invalide." };
  if (b.is_default !== undefined && typeof b.is_default !== "boolean") return { error: "Statut invalide." };
  return {
    value: {
      slug, title, description, subject, target_class: targetClass, target_branch: targetBranch,
      scheduled_at: scheduledAt, duration_minutes: duration,
      is_active: b.is_active !== false, is_default: b.is_default === true,
    },
  };
}

const ZOOM_MESSAGES = {
  permissions: "Zoom refuse la modification. Vérifiez les droits de l’application Zoom.",
  authentication: "La connexion à Zoom a échoué. Vérifiez la configuration Zoom du serveur.",
  missing_meeting: "La réunion Zoom associée est introuvable.",
  rate_limit: "Zoom limite les modifications pour le moment. Réessayez plus tard.",
  network: "Impossible de joindre Zoom. Réessayez.",
};

/**
 * Brings the campaign's Zoom meeting in line with its schedule, reusing the existing Zoom
 * integration and live_sessions. Local changes roll back if Zoom refuses.
 * Returns { status, error? } — never throws for provider failures.
 */
export async function syncCampaignZoom(db, campaignId, zoom = { createZoomMeeting, deleteZoomMeeting, rescheduleZoomMeeting }) {
  const client = await db.connect();
  let createdMeetingId = null;
  try {
    await client.query("BEGIN");
    const found = await client.query(`SELECT ${CAMPAIGN_COLUMNS} FROM free_sessions WHERE id = $1 FOR UPDATE`, [campaignId]);
    const campaign = found.rows[0];
    if (!campaign) { await client.query("ROLLBACK"); return { status: "missing" }; }
    if(await funnel.funnelReady(client)){
      const managed=await client.query('SELECT 1 FROM live_sessions WHERE free_session_id=$1 AND free_reservation_required LIMIT 1',[campaignId]);
      if(managed.rowCount){await client.query('COMMIT');return {status:'managed',error:'Les dates sont gérées dans les séances de cette campagne.'};}
    }
    const current = (await client.query(
      `SELECT id, title, description, scheduled_at, duration_minutes, zoom_meeting_id
       FROM live_sessions WHERE free_session_id = $1 AND status IN ('scheduled', 'live') FOR UPDATE`, [campaignId]
    )).rows[0];
    const title = "Séance gratuite · " + campaign.title;

    if (!campaign.scheduled_at) {
      if (!current) { await client.query("COMMIT"); return { status: "none" }; }
      await client.query("UPDATE live_sessions SET status = 'cancelled' WHERE id = $1", [current.id]);
      if (current.zoom_meeting_id) await zoom.deleteZoomMeeting(current.zoom_meeting_id);
      await client.query("COMMIT");
      return { status: "cancelled" };
    }

    if (!current) {
      if (new Date(campaign.scheduled_at).getTime() <= Date.now()) {
        await client.query("COMMIT");
        return { status: "past", error: "Choisis une date future pour créer la réunion Zoom." };
      }
      const meeting = await zoom.createZoomMeeting({
        topic: title, startTime: new Date(campaign.scheduled_at).toISOString(), durationMinutes: campaign.duration_minutes,
      });
      createdMeetingId = meeting.zoom_meeting_id;
      const inserted = await client.query(
        `INSERT INTO live_sessions
           (free_session_id, title, description, scheduled_at, duration_minutes,
            zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled') RETURNING id`,
        [campaignId, title, campaign.description, campaign.scheduled_at, campaign.duration_minutes,
          meeting.zoom_meeting_id, meeting.zoom_join_url, meeting.zoom_start_url, meeting.zoom_password]
      );
      await client.query("COMMIT");
      createdMeetingId = null;
      return { status: "created", liveSessionId: inserted.rows[0].id };
    }

    const timeChanged = new Date(current.scheduled_at).getTime() !== new Date(campaign.scheduled_at).getTime()
      || current.duration_minutes !== campaign.duration_minutes;
    if (timeChanged && new Date(campaign.scheduled_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return { status: "past", error: "Choisis une date future pour reporter la réunion Zoom." };
    }
    await client.query(
      "UPDATE live_sessions SET title = $2, description = $3, scheduled_at = $4, duration_minutes = $5 WHERE id = $1",
      [current.id, title, campaign.description, campaign.scheduled_at, campaign.duration_minutes]
    );
    let notified = 0;
    if (timeChanged) {
      // Same "Séance reportée" notice and popup as normal live sessions, sent to participants only.
      const format = value => new Date(value).toLocaleString("fr-FR", { timeZone: "Africa/Tunis", dateStyle: "full", timeStyle: "short" });
      const message = "La séance « " + title + " » est reportée au " + format(campaign.scheduled_at) + ".";
      const popupSchema = await client.query(
        `SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema = current_schema()
         AND table_name = 'notifications' AND column_name IN ('popup_session_id', 'popup_scheduled_at', 'popup_acknowledged_at')`
      );
      const popupReady = popupSchema.rows[0]?.count === 3;
      const notifications = await client.query(
        `INSERT INTO notifications (user_id, title, message, type, link${popupReady ? ", popup_session_id, popup_scheduled_at" : ""})
         SELECT u.id, $2, $3, 'info', '/app/calendar'${popupReady ? ", $1::uuid, $4::timestamptz" : ""} FROM users u
         WHERE u.role = 'user' AND EXISTS (SELECT 1 FROM live_sessions ls WHERE ls.id = $1 AND ${liveSessionAccess("u.id")})`,
        [current.id, "Séance reportée", message, ...(popupReady ? [campaign.scheduled_at] : [])]
      );
      notified = notifications.rowCount;
      if (current.zoom_meeting_id) {
        await zoom.rescheduleZoomMeeting(current.zoom_meeting_id, new Date(campaign.scheduled_at).toISOString(), campaign.duration_minutes);
      }
    }
    await client.query("COMMIT");
    return { status: timeChanged ? "rescheduled" : "updated", liveSessionId: current.id, notified };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (createdMeetingId) {
      await zoom.deleteZoomMeeting(createdMeetingId).catch(() => console.error("[free-session] Could not clean up Zoom meeting"));
    }
    const reason = Object.hasOwn(ZOOM_MESSAGES, error.reason) ? error.reason : null;
    console.warn(JSON.stringify({ service: "free-sessions", event: "zoom_sync_failed", campaignId, reason: reason || error.code || error.name }));
    return { status: "failed", error: (reason ? ZOOM_MESSAGES[reason] : "La réunion Zoom n’a pas pu être mise à jour.") + " Réessayez depuis cette page." };
  } finally {
    client.release();
  }
}

async function campaignList(db, id = null) {
  const result = await db.query(
    `SELECT f.id, f.slug, f.title, f.description, f.subject, f.target_class, f.target_branch,
            to_jsonb(f)->'target_branches' AS target_branches,
            f.scheduled_at, f.duration_minutes, f.is_active, f.is_default, f.created_at, f.updated_at,
            ls.id AS live_session_id, ls.scheduled_at AS live_scheduled_at, ls.duration_minutes AS live_duration_minutes,
            ls.status AS live_status, ls.zoom_meeting_id IS NOT NULL AS has_zoom,
            (SELECT COUNT(*)::int FROM session_registrations r WHERE r.free_session_id = f.id AND NOT r.account_activated) AS pending_count,
            (SELECT COUNT(*)::int FROM free_session_participants p WHERE p.free_session_id = f.id) AS participant_count,
            (SELECT COUNT(*)::int FROM session_questions q WHERE q.free_session_id = f.id AND q.is_active) AS question_count
     FROM free_sessions f
     LEFT JOIN LATERAL (
       SELECT l.* FROM live_sessions l WHERE l.free_session_id=f.id AND l.status IN ('scheduled','live')
       ORDER BY (l.id::text=COALESCE(to_jsonb(f)->>'published_occurrence_id','')) DESC,l.scheduled_at DESC,l.id LIMIT 1
     ) ls ON true
     WHERE ($1::uuid IS NULL OR f.id = $1)
     ORDER BY f.is_default DESC, f.created_at DESC`,
    [id]
  );
  return result.rows.map(row => ({
    ...row,
    path: campaignPath(row),
    // The Zoom meeting is out of date when the saved schedule differs from the live session.
    zoom_in_sync: row.scheduled_at
      ? Boolean(row.live_session_id) && new Date(row.live_scheduled_at).getTime() === new Date(row.scheduled_at).getTime()
        && row.live_duration_minutes === row.duration_minutes
      : !row.live_session_id,
  }));
}

async function saveCampaign(req, res, id) {
  const { value, error } = validateCampaign(req.body);
  if (error) return res.status(400).json({ error });
  const client = await pool.connect();
  let campaignId = id;
  try {
    await client.query("BEGIN");
    if (id) {
      const current = await client.query("SELECT is_default,slug FROM free_sessions WHERE id = $1 FOR UPDATE", [id]);
      if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Séance gratuite introuvable." }); }
      if (current.rows[0].slug !== value.slug && !await slugAliasesReady(client)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "La modification du lien n’est pas encore disponible. Le lien actuel reste valide." });
      }
      if (current.rows[0].is_default && !value.is_default) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Pour changer le lien /session, définis une autre séance comme séance par défaut." });
      }
    }
    if (value.is_default) {
      await client.query("UPDATE free_sessions SET is_default = false, updated_at = NOW() WHERE is_default AND id IS DISTINCT FROM $1", [id || null]);
    }
    if(id && value.target_branch && (await campaignPublicPolicy(client,id)).ready){
      await client.query('UPDATE free_sessions SET target_branches=NULL WHERE id=$1',[id]);
    }
    const params = [value.slug, value.title, value.description, value.subject, value.target_class, value.target_branch,
      value.scheduled_at, value.duration_minutes, value.is_active, value.is_default];
    const saved = id
      ? await client.query(
        `UPDATE free_sessions SET slug = $1, title = $2, description = $3, subject = $4, target_class = $5,
           target_branch = $6, scheduled_at = $7, duration_minutes = $8, is_active = $9, is_default = $10, updated_at = NOW()
         WHERE id = $11 RETURNING id`, [...params, id])
      : await client.query(
        `INSERT INTO free_sessions (slug, title, description, subject, target_class, target_branch,
           scheduled_at, duration_minutes, is_active, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`, params);
    campaignId = saved.rows[0].id;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") return res.status(409).json({ error: "Ce lien est déjà utilisé par une autre séance gratuite." });
    if (err.code === "23514") return res.status(400).json({ error: "Vérifie le lien, la classe, la section et la durée." });
    throw err;
  } finally {
    client.release();
  }
  const zoom = await syncCampaignZoom(pool, campaignId);
  return res.status(id ? 200 : 201).json({ campaign: (await campaignList(pool, campaignId))[0], zoom });
}

router.get("/admin/campaigns", requireAdmin, adminHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  return res.json({ campaigns: await campaignList(pool) });
}));

router.post("/admin/campaigns", requireAdmin, requireJson, adminHandler((req, res) => saveCampaign(req, res, null)));

router.put("/admin/campaigns/:id", requireAdmin, requireJson, adminHandler(async (req, res) => {
  if (!uuidPattern.test(req.params.id)) return res.status(400).json({ error: "Séance invalide." });
  return saveCampaign(req, res, req.params.id);
}));

// Retry the Zoom step after a provider failure, without changing the campaign.
router.post("/admin/campaigns/:id/zoom", requireAdmin, adminHandler(async (req, res) => {
  if (!uuidPattern.test(req.params.id)) return res.status(400).json({ error: "Séance invalide." });
  const zoom = await syncCampaignZoom(pool, req.params.id);
  if (zoom.status === "missing") return res.status(404).json({ error: "Séance gratuite introuvable." });
  return res.json({ campaign: (await campaignList(pool, req.params.id))[0], zoom });
}));

// Registered students of one campaign: pending sign-ups and participants with their results.
router.get("/admin/campaigns/:id/students", requireAdmin, adminHandler(async (req, res) => {
  if (!uuidPattern.test(req.params.id)) return res.status(400).json({ error: "Séance invalide." });
  res.set("Cache-Control", "no-store");
  const pending = await pool.query(
    `SELECT r.id, r.full_name, r.email, r.phone, r.track, r.filier, r.score, r.quiz_total AS total, r.tier, r."group",
            r.completed, r.created_at,
            COALESCE((SELECT json_object_agg(s.question_id, json_build_object('answer', s.answer, 'is_correct', s.is_correct))
                      FROM session_submissions s WHERE s.registration_id::text = r.id::text), '{}'::json) AS answers
     FROM session_registrations r
     WHERE r.free_session_id = $1 AND NOT r.account_activated
     ORDER BY r.created_at DESC`, [req.params.id]
  );
  const participants = await pool.query(
    `SELECT u.id AS user_id, u.name AS full_name, u.email, u.phone, u.class, u.branch, u.signup_source,
            p.source, p.score, p.total, p.tier, p."group", p.joined_at,
            COALESCE(p.answers::json,
              (SELECT json_object_agg(s.question_id, json_build_object('answer', s.answer, 'is_correct', s.is_correct))
               FROM session_submissions s WHERE s.registration_id::text = p.registration_id::text), '{}'::json) AS answers,
            (SELECT COUNT(*)::int FROM free_session_participants other WHERE other.user_id = p.user_id) AS campaign_count
     FROM free_session_participants p JOIN users u ON u.id = p.user_id
     WHERE p.free_session_id = $1
     ORDER BY p.joined_at DESC`, [req.params.id]
  );
  return res.json({ pending: pending.rows, participants: participants.rows });
}));

// =====================================================
// ADMIN — quiz questions (per campaign)
// =====================================================

function validateQuestion(b, partial = false) {
  if (!partial || b.text !== undefined) {
    if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 2000) return "Texte de la question requis.";
  }
  if (!partial || b.type !== undefined) {
    if (!QUESTION_TYPES.includes(b.type)) return "Type de question invalide.";
  }
  if (!partial || b.options !== undefined) {
    if (!Array.isArray(b.options) || !b.options.length || b.options.length > 20) return "Ajoute entre 1 et 20 options.";
  }
  if (!partial || b.correct_answer !== undefined) {
    if (b.correct_answer === undefined || b.correct_answer === null) return "Réponse correcte requise.";
  }
  if (b.order_index !== undefined && b.order_index !== null && !Number.isInteger(Number(b.order_index))) return "Ordre invalide.";
  if (b.explanation !== undefined && b.explanation !== null && (typeof b.explanation !== "string" || b.explanation.length > 2000)) {
    return "Explication invalide.";
  }
  if (b.is_active !== undefined && typeof b.is_active !== "boolean") return "Statut invalide.";
  return null;
}

router.get("/admin/questions", requireAdmin, adminHandler(async (req, res) => {
  const campaignId = req.query.campaignId;
  if (!uuidPattern.test(campaignId || "")) return res.status(400).json({ error: "Séance gratuite requise." });
  const result = await pool.query(
    `SELECT * FROM session_questions WHERE free_session_id = $1 ORDER BY order_index ASC, created_at ASC`, [campaignId]
  );
  return res.json({ questions: result.rows });
}));

router.post("/admin/questions", requireAdmin, requireJson, adminHandler(async (req, res) => {
  const b = req.body || {};
  if (!uuidPattern.test(b.campaignId || "")) return res.status(400).json({ error: "Séance gratuite requise." });
  const problem = validateQuestion(b);
  if (problem) return res.status(400).json({ error: problem });
  const campaign = await pool.query("SELECT 1 FROM free_sessions WHERE id = $1", [b.campaignId]);
  if (!campaign.rowCount) return res.status(404).json({ error: "Séance gratuite introuvable." });
  const result = await pool.query(
    `INSERT INTO session_questions (text, type, options, correct_answer, explanation, order_index, is_active, free_session_id)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING *`,
    [b.text.trim(), b.type, JSON.stringify(b.options), JSON.stringify(b.correct_answer), b.explanation || null,
      Number(b.order_index) || 0, b.campaignId]
  );
  return res.status(201).json({ question: result.rows[0] });
}));

router.patch("/admin/questions", requireAdmin, requireJson, adminHandler(async (req, res) => {
  const { id, text, type, options, correct_answer, explanation, order_index, is_active } = req.body || {};
  if (!uuidPattern.test(id || "")) return res.status(400).json({ error: "ID manquant." });
  const problem = validateQuestion(req.body, true);
  if (problem) return res.status(400).json({ error: problem });

  const fields = [];
  const values = [];
  let idx = 1;
  if (text !== undefined) { fields.push(`text = $${idx++}`); values.push(text.trim()); }
  if (type !== undefined) { fields.push(`type = $${idx++}`); values.push(type); }
  if (options !== undefined) { fields.push(`options = $${idx++}`); values.push(JSON.stringify(options)); }
  if (correct_answer !== undefined) { fields.push(`correct_answer = $${idx++}`); values.push(JSON.stringify(correct_answer)); }
  if (explanation !== undefined) { fields.push(`explanation = $${idx++}`); values.push(explanation || null); }
  if (order_index !== undefined) { fields.push(`order_index = $${idx++}`); values.push(Number(order_index) || 0); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE session_questions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ error: "Question introuvable." });
  return res.json({ question: result.rows[0] });
}));

// Questions that already have answers are hidden instead of deleted, so past results stay readable.
router.delete("/admin/questions", requireAdmin, requireJson, adminHandler(async (req, res) => {
  const { id } = req.body || {};
  if (!uuidPattern.test(id || "")) return res.status(400).json({ error: "ID manquant." });
  const answered = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM session_submissions WHERE question_id = $1)
         OR EXISTS (SELECT 1 FROM free_session_participants WHERE answers ? $2) AS used`, [id, String(id)]
  );
  if (answered.rows[0].used) {
    await pool.query("UPDATE session_questions SET is_active = false, updated_at = NOW() WHERE id = $1", [id]);
    return res.json({ success: true, hidden: true });
  }
  await pool.query("DELETE FROM session_questions WHERE id = $1", [id]);
  return res.json({ success: true });
}));


// Public guest endpoints use short-lived cookie capabilities; claim endpoints require JWT authentication.
const funnelHandler=work=>async(req,res)=>{
 try{if(!await funnel.funnelReady(pool))return res.status(503).json({error:'Le défi invité sera bientôt disponible.'});
   res.set('Cache-Control','private, no-store');await work(req,res);
 }catch(error){if(!error.status)console.error('[free-funnel] Request failed:',error.code||error.name);res.status(error.status||500).json({error:error.status?error.message:'Impossible de terminer cette opération. Réessaie.'});}
};
const campaignFor=async req=>{const campaign=await findActiveCampaign(pool,req.body?.slug??req.query.slug);if(!campaign)throw Object.assign(new Error('Campagne indisponible.'),{status:404});return (await pool.query('SELECT * FROM free_sessions WHERE id=$1',[campaign.id])).rows[0];};
router.get('/campaign',async(req,res)=>{
 try{const campaign=await findActiveCampaign(pool,req.query.slug);if(!campaign)return res.status(404).json({error:'Campagne indisponible.'});
 const questions=await activeQuestions(pool,campaign.id);res.set('Cache-Control','private, no-store');
 const policy=await campaignPublicPolicy(pool,campaign.id);
 const session=await publishedCampaignOccurrence(pool,campaign.id);
 res.json({campaign:{...publicCampaign(campaign),target_branches:policy.target_branches},count:questions.length,minutes:Math.max(2,Math.ceil(questions.length*.75)),
   funnel:await funnel.funnelReady(pool),session,occurrences:session?[session]:[],
   hasPlacement:Boolean(readPlacementToken(req.cookies?.synta_placement,'placement-verified')),
   hasGuestAttempt:Boolean(req.cookies?.['synta_free_'+campaign.id.replaceAll('-','')])});
 }catch{res.status(503).json({error:'Le défi est momentanément indisponible.'});}
});
router.post('/guest/start',authRateLimit(12,60*60*1000),requireJson,funnelHandler(async(req,res)=>{
 const campaign=await campaignFor(req);res.json(await funnel.startGuest(pool,campaign,req.body.restart===true?{}:req.cookies,res));
}));
router.get('/guest/status',authRateLimit(120),funnelHandler(async(req,res)=>{const campaign=await campaignFor(req);res.json(await funnel.guestStatus(pool,campaign.id,req.cookies));}));
router.post('/guest/submit',authRateLimit(30),requireJson,funnelHandler(async(req,res)=>{const campaign=await campaignFor(req);res.json({attempt:await funnel.submitGuest(pool,campaign,req.cookies,req.body.answers,scoreAnswers)});}));
router.post('/guest/claim',authApiMiddleware,authRateLimit(30,900000,req=>req.user.id),requireJson,funnelHandler(async(req,res)=>{
 const campaign=await campaignFor(req);res.json(await funnel.claimGuest(pool,req.user.id,campaign,req.cookies,req.body.occurrenceId));
}));
router.get('/member/result',authApiMiddleware,funnelHandler(async(req,res)=>{
 const campaign=await campaignFor(req);
 const row=(await pool.query('SELECT id,score,total,level,submitted_at FROM free_session_attempts WHERE user_id=$1 AND campaign_id=$2 AND claimed_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 1',[req.user.id,campaign.id])).rows[0];
 res.json({attempt:row?{...row,submitted:true,claimed:true,fromAccount:true}:null,reuseAllowed:campaign.allow_result_reuse});
}));
router.post('/member/profile',authApiMiddleware,authRateLimit(20,900000,req=>req.user.id),requireJson,funnelHandler(async(req,res)=>{
 const campaign=await campaignFor(req);res.json(await funnel.completeCampaignProfile(pool,req.user.id,campaign,req.cookies,req.body));
}));
router.post('/member/reserve',authApiMiddleware,authRateLimit(30,900000,req=>req.user.id),requireJson,funnelHandler(async(req,res)=>{
 const campaign=await campaignFor(req);res.json(await funnel.reservePrevious(pool,req.user.id,campaign,req.body.occurrenceId));
}));
router.get('/admin/campaigns/:id/occurrences',requireAdmin,funnelHandler(async(req,res)=>{
 if(!uuidPattern.test(req.params.id))return res.status(400).json({error:'Campagne invalide.'});
 const occurrences=(await pool.query('SELECT id,title,scheduled_at,duration_minutes,status,free_reservation_required,zoom_meeting_id IS NOT NULL AS has_zoom FROM live_sessions WHERE free_session_id=$1 ORDER BY scheduled_at DESC',[req.params.id])).rows;
 const policy=(await pool.query('SELECT allow_result_reuse,diagnostic_rules,target_class,target_branch FROM free_sessions WHERE id=$1',[req.params.id])).rows[0];
 const participants=(await pool.query('SELECT r.live_session_id,r.user_id,r.reserved_at,r.status,u.name,a.score,a.total,a.level FROM free_session_reservations r LEFT JOIN free_session_attempts a ON a.id=r.attempt_id JOIN users u ON u.id=r.user_id JOIN live_sessions ls ON ls.id=r.live_session_id WHERE ls.free_session_id=$1 ORDER BY r.reserved_at DESC',[req.params.id])).rows;
 const attempts=(await pool.query('SELECT a.id,a.user_id,a.score,a.total,a.level,a.created_at,a.submitted_at,u.name FROM free_session_attempts a LEFT JOIN users u ON u.id=a.user_id WHERE a.campaign_id=$1 ORDER BY a.created_at DESC LIMIT 100',[req.params.id])).rows;
 res.json({occurrences,policy:{...policy,...await campaignPublicPolicy(pool,req.params.id)},participants,attempts});
}));
router.put('/admin/campaigns/:id/public-occurrence',requireAdmin,requireJson,funnelHandler(async(req,res)=>{
 if(!uuidPattern.test(req.params.id))return res.status(400).json({error:'Campagne invalide.'});
 res.json(await funnel.publishOccurrence(pool,req.params.id,req.body.occurrenceId));
}));
router.put('/admin/campaigns/:id/target-sections',requireAdmin,requireJson,funnelHandler(async(req,res)=>{
 const sections=req.body.sections;
 if(!uuidPattern.test(req.params.id)||!Array.isArray(sections)||sections.length>7||sections.some(value=>!SCHOOL_SECTIONS.includes(value)))return res.status(400).json({error:'Sections invalides.'});
 if(!(await campaignPublicPolicy(pool,req.params.id)).ready)return res.status(503).json({error:'La sélection multiple attend sa migration.'});
 const unique=[...new Set(sections)];
 const result=await pool.query('UPDATE free_sessions SET target_branch=$2,target_branches=$3,updated_at=now() WHERE id=$1 RETURNING id',[req.params.id,unique.length===1?unique[0]:null,unique.length>1?unique:null]);
 if(!result.rowCount)return res.status(404).json({error:'Campagne introuvable.'});
 res.json({success:true});
}));
router.post('/admin/campaigns/:id/occurrences',requireAdmin,requireJson,funnelHandler(async(req,res)=>{
 if(!uuidPattern.test(req.params.id))return res.status(400).json({error:'Campagne invalide.'});
 res.status(201).json({session:await funnel.createOccurrence(pool,req.params.id,req.user.id,req.body,{createZoomMeeting,deleteZoomMeeting})});
}));
router.patch('/admin/campaigns/:id/occurrences/:sessionId',requireAdmin,requireJson,funnelHandler(async(req,res)=>{
 if(!uuidPattern.test(req.params.id))return res.status(400).json({error:'Campagne invalide.'});
 res.json(await funnel.changeOccurrence(pool,req.params.id,req.params.sessionId,req.user.id,req.body,{deleteZoomMeeting,rescheduleZoomMeeting},liveSessionAccess));
}));
router.put('/admin/campaigns/:id/funnel-settings',requireAdmin,requireJson,funnelHandler(async(req,res)=>{
 const {reuse,intermediate,advanced}=req.body;
 if(!uuidPattern.test(req.params.id)||typeof reuse!=='boolean'||!Number.isInteger(intermediate)||!Number.isInteger(advanced)||intermediate<1||advanced>100||advanced<=intermediate)return res.status(400).json({error:'Vérifie les seuils et la réutilisation.'});
 await pool.query('UPDATE free_sessions SET allow_result_reuse=$2,diagnostic_rules=$3 WHERE id=$1',[req.params.id,reuse,JSON.stringify({intermediate,advanced})]);res.json({success:true});
}));

export default router;
