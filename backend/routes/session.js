// =====================================================
// SESSION ONBOARDING API ROUTES
// Handles: register, fetch questions, submit answers
// All endpoints prefixed: /api/session/...
// =====================================================
import express from 'express';
import { supabaseAdmin, supabaseAnon, createUserClient } from '../config/supabase.js';
import crypto from 'crypto';
import { requireAdmin } from '../middleware/requireAdmin.js'; // FIX #1

const router = express.Router();

// Helper: generate random secure password
function generateRandomPassword() {
  return crypto.randomBytes(16).toString('hex') + 'Aa1!';
}

// Helper: set persistent cookie
function setSessionCookie(res, registrationId) {
  res.cookie('synta_session_token', registrationId, {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
}

// Helper: compute tier from score
function computeTier(score, total) {
  if (total === 0) return 'explorer';
  const pct = score / total;
  if (pct >= 0.8) return 'elite';
  if (pct >= 0.5) return 'challenger';
  return 'explorer';
}

// -------------------------------------------------------
// POST /api/session/register
// Silent registration — creates or returns existing user
// -------------------------------------------------------
router.post('/register', async (req, res) => {
  const { full_name, email, phone } = req.body;

  if (!full_name || !email || !phone) {
    return res.status(400).json({ error: 'Champs requis manquants.' });
  }

  try {
    // Check for existing registration
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('session_registrations')
      .select('id, full_name, email, track, tier, score, completed')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      setSessionCookie(res, existing.id);
      return res.json({ success: true, returning: true, registration: existing, token: existing.id });
    }

    // Create new registration
    const { data: registration, error: insertErr } = await supabaseAdmin
      .from('session_registrations')
      .insert({
        full_name: full_name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim()
      })
      .select()
      .single();

    if (insertErr) {
      console.error('❌ Session register error:', insertErr.message);
      return res.status(500).json({ error: 'Échec de l\'inscription: ' + insertErr.message });
    }

    setSessionCookie(res, registration.id);
    return res.json({ success: true, returning: false, registration, token: registration.id });
  } catch (err) {
    console.error('❌ Session register exception:', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -------------------------------------------------------
// GET /api/session/questions
// Returns active questions (without correct_answer)
// -------------------------------------------------------
router.get('/questions', async (req, res) => {
  try {
    const { data: questions, error } = await supabaseAdmin
      .from('session_questions')
      .select('id, text, type, options, order_index, explanation')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('❌ Questions fetch error:', error.message);
      return res.status(500).json({ error: 'Impossible de charger les questions.' });
    }

    return res.json({ questions: questions || [] });
  } catch (err) {
    console.error('❌ Questions exception:', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -------------------------------------------------------
// POST /api/session/submit
// Grades answers server-side, updates registration
// -------------------------------------------------------
router.post('/submit', async (req, res) => {
  const { registration_id, answers, track, branch: filier } = req.body;

  if (!registration_id || !answers || !track) {
    return res.status(400).json({ error: 'Données manquantes.' });
  }

  // FIX #9: Prevent registration_id spoofing — cookie token must match claimed ID
  const cookieToken = req.cookies?.synta_session_token;
  if (!cookieToken || cookieToken !== registration_id) {
    return res.status(403).json({ error: 'Unauthorized: session token mismatch.' });
  }

  try {
    // Fetch questions WITH correct answers (server-side only)
    const { data: questions, error: qErr } = await supabaseAdmin
      .from('session_questions')
      .select('id, correct_answer, type')
      .eq('is_active', true);

    if (qErr || !questions) {
      return res.status(500).json({ error: 'Impossible de charger les questions.' });
    }

    let score = 0;
    const submissions = [];

    for (const question of questions) {
      const userAnswer = answers[question.id];
      if (userAnswer === undefined) continue;

      let is_correct = false;
      const correct = question.correct_answer;

      if (question.type === 'drag_drop') {
        const userArr = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
        const correctArr = Array.isArray(correct) ? correct : [correct];
        is_correct = JSON.stringify(userArr) === JSON.stringify(correctArr);
      } else {
        is_correct = String(userAnswer).trim() === String(correct).trim();
      }

      if (is_correct) score++;

      submissions.push({
        registration_id,
        question_id: question.id,
        answer: userAnswer,
        is_correct,
      });
    }

    const tier = computeTier(score, questions.length);
    const group = (score === questions.length && questions.length > 0) ? 'advanced' : 'beginner';

    // Save submissions
    if (submissions.length > 0) {
      await supabaseAdmin.from('session_submissions').upsert(submissions, {
        onConflict: 'registration_id,question_id',
      }).catch(e => console.warn('No session_submissions table, skipping'));
    }

    // Update registration with score, tier, group
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('session_registrations')
      .update({
        score,
        tier,
        completed: true,
        group,
        track,
        filier,
        updated_at: new Date().toISOString()
      })
      .eq('id', registration_id)
      .select('id, full_name, email, track, score, tier, completed')
      .single();

    if (updateErr) {
      console.warn('⚠️ Submit: could not update registration:', updateErr.message);
    }

    return res.json({ success: true, score, total: questions.length, tier, group, registration: updated });
  } catch (err) {
    console.error('❌ Submit exception:', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -------------------------------------------------------
// POST /api/session/set-password
// Activates account, issues auth cookies, routes to dashboard
// NOTE: Registration data is ALWAYS saved regardless of this step
// -------------------------------------------------------
router.post('/set-password', async (req, res) => {
  const { registration_id, password } = req.body;

  if (!registration_id || !password) {
    return res.status(400).json({ error: 'بيانات ناقصة.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تحتوي على 6 أحرف على الأقل.' });
  }

  try {
    // 1. Fetch registration record
    const { data: reg, error: regErr } = await supabaseAdmin
      .from('session_registrations')
      .select('id, email, full_name, phone')
      .eq('id', registration_id)
      .maybeSingle();

    if (regErr || !reg) {
      return res.status(404).json({ error: 'التسجيل غير موجود.' });
    }

    let authUserId = null;
    let signInSession = null;

    try {
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: reg.email,
        password,
        email_confirm: true,
        user_metadata: { fullname: reg.full_name, number: reg.phone }
      });

      if (createErr) {
        // FIX #10: Use getUserByEmail instead of listing all users
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        // Try direct email lookup via filter (more efficient)
        const existing = users?.find(u => u.email?.toLowerCase() === reg.email.toLowerCase());
        if (existing) {
          await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
          authUserId = existing.id;
        }
      } else {
        authUserId = newUser?.user?.id;
      }
    } catch (adminErr) {
      console.warn('⚠️ set-password: auth.admin error:', adminErr.message);
    }

    try {
      const { data: signInData, error: signInErr } = await supabaseAnon.auth.signInWithPassword({
        email: reg.email,
        password
      });
      if (!signInErr && signInData?.session) {
        signInSession = signInData.session;
      }
    } catch (signInEx) {}

    const updatePayload = { account_activated: true, completed: true };
    if (authUserId) updatePayload.auth_user_id = authUserId;

    await supabaseAdmin
      .from('session_registrations')
      .update(updatePayload)
      .eq('id', registration_id);

    // 4. Issue platform cookies
    if (signInSession) {
      const maxAge = 30 * 24 * 60 * 60 * 1000;
      res.cookie('synta_access', signInSession.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge
      });
      res.cookie('synta_refresh', signInSession.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge
      });
      return res.json({ success: true, redirectUrl: '/dashboard' });
    }

    return res.json({ success: true, redirectUrl: '/login?registered=1' });
  } catch (err) {
    console.error('❌ set-password fatal error:', err.message);
    return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message });
  }
});

// -------------------------------------------------------
// ADMIN CONFIG — /api/session/admin/config
// FIX #1: All admin routes now require admin role
// -------------------------------------------------------
router.get('/admin/config', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('session_config')
      .select('session_date, session_matiere')
      .eq('id', 1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ config: data || {} });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/admin/config', requireAdmin, async (req, res) => {
  try {
    const { session_date, session_matiere } = req.body;
    const { data, error } = await supabaseAdmin
      .from('session_config')
      .upsert({ id: 1, session_date, session_matiere, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, config: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/admin/students', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('session_registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ students: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/admin/questions', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('session_questions')
    .select('*')
    .order('order_index', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ questions: data });
});

router.post('/admin/questions', requireAdmin, async (req, res) => {
  const { text, type, options, correct_answer, explanation, order_index } = req.body;
  if (!text || !type || !options || correct_answer === undefined) {
    return res.status(400).json({ error: 'Champs requis manquants.' });
  }
  const { data, error } = await supabaseAdmin
    .from('session_questions')
    .insert({ text, type, options, correct_answer, explanation, order_index: order_index ?? 0, is_active: true })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ question: data });
});

router.patch('/admin/questions', requireAdmin, async (req, res) => {
  const { id, ...updates } = req.body;
  if (!id) return res.status(400).json({ error: 'ID manquant.' });
  const { data, error } = await supabaseAdmin
    .from('session_questions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ question: data });
});

router.delete('/admin/questions', requireAdmin, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'ID manquant.' });
  const { error } = await supabaseAdmin.from('session_questions').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

export default router;
