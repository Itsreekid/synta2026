import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { UUID, fail, transaction } from './timed-offers.js';
import { saveLearnerProfile } from './learner-onboarding.js';
import { campaignPublicPolicy, publishedCampaignOccurrence } from './free-campaigns.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const tokenName = campaignId => 'synta_free_' + campaignId.replaceAll('-', '');
const tokenOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  path: '/api/session', maxAge: 2 * 60 * 60 * 1000 });

export async function funnelReady(db) {
  const { rows: [row] } = await db.query("SELECT to_regclass('free_session_attempts') IS NOT NULL AND to_regclass('free_session_reservations') IS NOT NULL AS ready");
  return row.ready;
}

export async function campaignOccurrences(db, campaignId) {
  return (await db.query(`SELECT id,title,scheduled_at,duration_minutes,status FROM live_sessions
    WHERE free_session_id=$1 AND status IN ('scheduled','live')
      AND scheduled_at+make_interval(mins=>duration_minutes)>now() ORDER BY scheduled_at,id`, [campaignId])).rows;
}

export async function publishOccurrence(db, campaignId, occurrenceId) {
  if (occurrenceId !== null && !UUID.test(occurrenceId || '')) fail(400, 'Séance invalide.');
  return transaction(db, async client => {
    const campaign=(await client.query('SELECT id FROM free_sessions WHERE id=$1 FOR UPDATE',[campaignId])).rows[0];
    if(!campaign)fail(404,'Campagne introuvable.');
    if(!(await campaignPublicPolicy(client,campaignId)).ready)fail(503,'La publication sera disponible après activation de sa migration.');
    if(occurrenceId){
      const live=(await client.query(`SELECT id FROM live_sessions WHERE id=$1 AND free_session_id=$2
        AND status='scheduled' AND scheduled_at>now() FOR SHARE`,[occurrenceId,campaignId])).rows[0];
      if(!live)fail(409,'Choisis une séance à venir de cette campagne.');
    }
    await client.query('UPDATE free_sessions SET published_occurrence_id=$2,updated_at=now() WHERE id=$1',[campaignId,occurrenceId]);
    return {success:true,session:await publishedCampaignOccurrence(client,campaignId)};
  });
}

function publicQuestions(rows) {
  return rows.map(({ id, text, type, options, order_index }) => ({ id, text, type, options, order_index }));
}

function resultOf(attempt) {
  return { id: attempt.id, score: attempt.score, total: attempt.total, level: attempt.level,
    percentage: Math.round(1000 * attempt.score / attempt.total)/10, submitted: Boolean(attempt.submitted_at),
    expires_at: attempt.expires_at, claimed: Boolean(attempt.claimed_at) };
}

async function ownedGuest(db, campaignId, cookies, { submitted = false, lock = false } = {}) {
  const token = cookies?.[tokenName(campaignId)];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail(401, 'Recommence le défi : cette tentative a expiré.');
  const { rows: [attempt] } = await db.query(`SELECT * FROM free_session_attempts
    WHERE campaign_id=$1 AND token_hash=$2 AND expires_at>now() ${lock ? 'FOR UPDATE' : ''}`, [campaignId, digest(token)]);
  if (!attempt) fail(401, 'Recommence le défi : cette tentative a expiré.');
  if (submitted && !attempt.submitted_at) fail(409, 'Termine d’abord le défi.');
  return attempt;
}

export async function startGuest(db, campaign, cookies, res) {
  try {
    const attempt = await ownedGuest(db, campaign.id, cookies);
    return { attempt: resultOf(attempt), questions: publicQuestions(attempt.question_snapshot) };
  } catch (error) { if (error.status !== 401) throw error; }
  const questions = (await db.query(`SELECT id,text,type,options,order_index,correct_answer FROM session_questions
    WHERE free_session_id=$1 AND is_active ORDER BY order_index,created_at`, [campaign.id])).rows;
  if (!questions.length || questions.length>100) fail(409, 'Le défi est en préparation. Reviens bientôt.');
  const rules = campaign.diagnostic_rules || { intermediate: 50, advanced: 80 };
  // Freeze scoring rules with the private snapshot; no answers or rules are trusted from the client.
  const snapshot = questions.map(question => ({ ...question, diagnostic_rules: rules }));
  const token = randomBytes(32).toString('hex');
  const { rows: [attempt] } = await db.query(`INSERT INTO free_session_attempts
    (campaign_id,token_hash,question_snapshot,total,expires_at,claim_expires_at)
    VALUES($1,$2,$3,$4,now()+interval '2 hours',now()+interval '48 hours') RETURNING *`,
  [campaign.id, digest(token), JSON.stringify(snapshot), questions.length]);
  res.cookie(tokenName(campaign.id), token, tokenOptions());
  return { attempt: resultOf(attempt), questions: publicQuestions(questions) };
}

export async function submitGuest(db, campaign, cookies, answers, scoreAnswers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length > 100) fail(400, 'Réponses invalides.');
  return transaction(db, async client => {
    const attempt = await ownedGuest(client, campaign.id, cookies, { lock: true });
    if (attempt.submitted_at) return resultOf(attempt);
    if (Object.keys(answers).some(key => !attempt.question_snapshot.some(question => question.id === key))) fail(400, 'Question inconnue.');
    for(const question of attempt.question_snapshot){
      const allowed=question.options.map(option=>String(typeof option==='object'&&option!==null?option.id:option));
      const answer=answers[question.id];
      if(question.type==='drag_drop'){
        if(!Array.isArray(answer)||answer.length!==allowed.length||new Set(answer.map(String)).size!==allowed.length||answer.some(value=>!allowed.includes(String(value))))fail(400,'Vérifie l’ordre de tous les éléments.');
      }else if(!['string','number'].includes(typeof answer)||!allowed.includes(String(answer)))fail(400,'Réponds à chaque question.');
    }
    const result = scoreAnswers(attempt.question_snapshot, answers);
    const rules = attempt.question_snapshot[0].diagnostic_rules;
    const percentage = result.score * 100 / result.total;
    const level = percentage >= rules.advanced ? 'advanced' : percentage >= rules.intermediate ? 'intermediate' : 'beginner';
    const { rows: [saved] } = await client.query(`UPDATE free_session_attempts SET answers=$2,score=$3,level=$4,submitted_at=now()
      WHERE id=$1 RETURNING *`, [attempt.id, JSON.stringify(answers), result.score, level]);
    return resultOf(saved);
  });
}

export async function guestStatus(db, campaignId, cookies) {
  const attempt = await ownedGuest(db, campaignId, cookies);
  return { attempt: resultOf(attempt), questions: publicQuestions(attempt.question_snapshot) };
}

/** Same profile persistence as normal onboarding, with server-owned campaign targets.
 * Kept under /api/session because the existing guest capability is scoped to that path.
 */
export async function completeCampaignProfile(db, userId, campaign, cookies, input) {
  return transaction(db, async client => {
    const attempt = await ownedGuest(client, campaign.id, cookies, { lock: true, submitted: true });
    if (attempt.user_id && String(attempt.user_id) !== String(userId)) fail(403, 'Ce résultat appartient à un autre compte.');
    const user = (await client.query(`SELECT u.id,u.email,u.email_verified,u.phone,u.class,u.branch,
      u.created_at >= a.created_at AS campaign_signup
      FROM users u CROSS JOIN free_session_attempts a WHERE u.id=$1 AND a.id=$2 AND u.role='user' FOR UPDATE OF u`, [userId, attempt.id])).rows[0];
    if (!user?.email_verified) fail(403, 'Confirme ton adresse e-mail.');
    if (attempt.registration_id) {
      const registration = (await client.query('SELECT email FROM session_registrations WHERE id=$1', [attempt.registration_id])).rows[0];
      if (!registration || registration.email.toLowerCase() !== user.email.toLowerCase()) fail(403, 'Utilise le compte de cette inscription vérifiée.');
    }
    if (user.phone && user.class && user.branch) return { success: true, preserved: true };
    const policy=await campaignPublicPolicy(client,campaign.id);
    if(!user.branch&&policy.target_branches&&!policy.target_branches.includes(input.user_branch))fail(400,'Choisis une section autorisée pour cette séance.');
    await saveLearnerProfile(client, userId, {
      phone: user.phone || input.phone,
      userClass: user.class || (user.campaign_signup && campaign.target_class) || input.user_class,
      userBranch: user.branch || (user.campaign_signup && campaign.target_branch) || input.user_branch
    });
    return { success: true };
  });
}

export async function bindGuestRegistration(db, campaignId, registrationId, cookies) {
  if (!cookies?.[tokenName(campaignId)]) return false;
  return transaction(db, async client => {
    const attempt = await ownedGuest(client, campaignId, cookies, { lock: true, submitted: true });
    if (attempt.user_id || (attempt.registration_id && String(attempt.registration_id) !== String(registrationId))) {
      fail(409, 'Ce résultat est déjà associé à une inscription.');
    }
    const registration=(await client.query('SELECT completed,free_session_id FROM session_registrations WHERE id=$1 FOR UPDATE',[registrationId])).rows[0];
    if(!registration || registration.free_session_id!==campaignId || (registration.completed&&!attempt.registration_id))fail(409,'Cette inscription possède déjà un résultat.');
    await client.query('UPDATE free_session_attempts SET registration_id=$2 WHERE id=$1', [attempt.id, registrationId]);
    await client.query('UPDATE session_registrations SET completed=true,score=$2,quiz_total=$3,tier=$4,"group"=$5 WHERE id=$1',
      [registrationId,attempt.score,attempt.total,attempt.level==='advanced'?'elite':attempt.level==='intermediate'?'challenger':'explorer',attempt.score===attempt.total?'advanced':'beginner']);
    return true;
  });
}

async function reserve(client, userId, campaign, attempt, occurrenceId) {
  const current=(await client.query('SELECT is_active,allow_result_reuse FROM free_sessions WHERE id=$1 FOR SHARE',[campaign.id])).rows[0];
  if(!current?.is_active)fail(409,'Cette campagne n’est plus disponible.');
  campaign={...campaign,...current};
  const policy=await campaignPublicPolicy(client,campaign.id);
  if(policy.ready){
    const previous=(await client.query(`SELECT l.id,l.title,l.scheduled_at,l.duration_minutes,l.status
      FROM free_session_reservations r JOIN live_sessions l ON l.id=r.live_session_id
      WHERE r.user_id=$1 AND r.attempt_id=$2 AND r.status='reserved' AND l.status IN ('scheduled','live')
        AND l.scheduled_at+make_interval(mins=>l.duration_minutes)>now() ORDER BY r.reserved_at LIMIT 1`,[userId,attempt.id])).rows[0];
    if(previous)return {reserved:true,session:previous};
  }
  // Retain legacy API compatibility until the approved pending migration is applied.
  const occurrences = policy.ready ? [] : await campaignOccurrences(client, campaign.id);
  const selected = policy.ready ? await publishedCampaignOccurrence(client,campaign.id) : occurrenceId ? occurrences.find(row => row.id === occurrenceId) : occurrences[0];
  if (!policy.ready && occurrenceId && !selected) fail(409,'Cette séance n’est plus disponible.');
  if (!selected) return { reserved: false, message: 'Ton résultat est enregistré. La prochaine séance sera annoncée ici.' };
  await client.query('SELECT id FROM live_sessions WHERE id=$1 FOR SHARE', [selected.id]);
  const { rows: [live] } = await client.query(`SELECT id FROM live_sessions WHERE id=$1 AND free_session_id=$2
    AND status IN ('scheduled','live') AND scheduled_at+make_interval(mins=>duration_minutes)>now()
    AND ($3=false OR (status='scheduled' AND scheduled_at>now()))`, [selected.id, campaign.id,policy.ready]);
  if (!live) fail(409, 'Cette séance a changé. Actualise les dates.');
  if (!campaign.allow_result_reuse) {
    const used = await client.query('SELECT 1 FROM free_session_reservations WHERE attempt_id=$1 AND live_session_id<>$2', [attempt.id, selected.id]);
    if (used.rowCount) fail(409, 'Un nouveau défi est nécessaire pour cette nouvelle séance.');
  }
  await client.query(`INSERT INTO free_session_reservations(live_session_id,user_id,attempt_id)
    VALUES($1,$2,$3) ON CONFLICT(live_session_id,user_id) DO NOTHING`, [selected.id, userId, attempt.id]);
  const reservation=(await client.query('SELECT status FROM free_session_reservations WHERE live_session_id=$1 AND user_id=$2',[selected.id,userId])).rows[0];
  if(reservation.status!=='reserved')fail(409,'Cette réservation a été annulée. Contacte Synta Academy.');
  return { reserved: true, session: selected };
}

async function claim(client, userId, campaign, attempt, occurrenceId) {
  if (!attempt?.submitted_at || new Date(attempt.claim_expires_at) <= new Date()) fail(409, 'Le délai pour enregistrer ce résultat a expiré.');
  if (attempt.user_id && String(attempt.user_id) !== String(userId)) fail(403, 'Ce résultat appartient à un autre compte.');
  const user = (await client.query("SELECT id,email,email_verified,created_at,signup_source,phone,class,branch,created_at >= (SELECT created_at FROM free_session_attempts WHERE id=$2) AS campaign_signup FROM users WHERE id=$1 AND role='user' FOR UPDATE", [userId,attempt.id])).rows[0];
  if (!user || !user.email_verified) fail(403, 'Confirme ton adresse e-mail pour enregistrer le résultat.');
  if(user.campaign_signup&&(!user.phone||!user.class||!user.branch))fail(409,'Complète ton profil avant de réserver ta séance.');
  if (attempt.registration_id) {
    const registration = (await client.query('SELECT email FROM session_registrations WHERE id=$1', [attempt.registration_id])).rows[0];
    if (!registration || registration.email.toLowerCase() !== user.email.toLowerCase()) fail(403, 'Utilise le compte de cette inscription vérifiée.');
  }
  const { rows: [saved] } = await client.query(`UPDATE free_session_attempts SET user_id=$2,claimed_at=COALESCE(claimed_at,now()) WHERE id=$1 RETURNING *`, [attempt.id, userId]);
  // Compare exact database timestamps; rounding to browser milliseconds must never
  // relabel a pre-existing account as a campaign signup.
  const acquisition=await client.query("UPDATE users SET signup_source='free_session',signup_free_session_id=$2 WHERE id=$1 AND signup_source IS NULL AND created_at >= (SELECT created_at FROM free_session_attempts WHERE id=$3) RETURNING id",[userId,campaign.id,attempt.id]);
  const acquired=acquisition.rowCount===1;
  const tier = saved.level === 'advanced' ? 'elite' : saved.level === 'intermediate' ? 'challenger' : 'explorer';
  await client.query(`INSERT INTO free_session_participants(free_session_id,user_id,source,score,total,tier,"group",answers)
    VALUES($1,$2,$8,$3,$4,$5,$6,$7) ON CONFLICT(free_session_id,user_id) DO NOTHING`,
  [campaign.id, userId, saved.score, saved.total, tier, saved.score === saved.total ? 'advanced' : 'beginner', JSON.stringify(saved.answers),acquired?'new_signup':'existing_student']);
  return { attempt: resultOf(saved), ...await reserve(client, userId, campaign, saved, occurrenceId) };
}

export async function claimGuest(db, userId, campaign, cookies, occurrenceId = null) {
  if (occurrenceId && !UUID.test(occurrenceId)) fail(400, 'Séance invalide.');
  return transaction(db, async client => claim(client, userId, campaign,
    await ownedGuest(client, campaign.id, cookies, { lock: true, submitted: true }), occurrenceId));
}

// Called inside the verified password activation transaction; the registration proof,
// not a browser-supplied user ID, identifies the saved guest result on another device.
export async function claimRegistration(client, userId, registrationId, campaignId, occurrenceId) {
  if (!await funnelReady(client)) return null;
  const attempt = (await client.query(`SELECT * FROM free_session_attempts WHERE registration_id=$1 AND submitted_at IS NOT NULL
    ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE`, [registrationId])).rows[0];
  if (!attempt) return null;
  if(new Date(attempt.claim_expires_at)<=new Date())return {resultExpired:true,reserved:false};
  const campaign = (await client.query('SELECT * FROM free_sessions WHERE id=$1 AND is_active', [campaignId])).rows[0];
  if (!campaign) return {campaignInactive:true,reserved:false};
  return claim(client, userId, campaign, attempt, occurrenceId);
}

export async function reservePrevious(db, userId, campaign, occurrenceId) {
  if (occurrenceId && !UUID.test(occurrenceId)) fail(400, 'Séance invalide.');
  return transaction(db, async client => {
    const attempt = (await client.query(`SELECT * FROM free_session_attempts WHERE user_id=$1 AND campaign_id=$2
      AND claimed_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE`, [userId, campaign.id])).rows[0];
    if (!attempt) fail(409, 'Termine le défi avant de réserver.');
    return reserve(client, userId, campaign, attempt, occurrenceId);
  });
}

export async function createOccurrence(db, campaignId, actorId, input, zoom) {
  if (!UUID.test(input.id || '') || !Number.isFinite(Date.parse(input.startTime)) || Date.parse(input.startTime) <= Date.now()
    || !Number.isInteger(input.duration) || input.duration < 15 || input.duration > 480) fail(400, 'Vérifie la date et la durée.');
  let meeting;
  try {
    return await transaction(db, async client => {
      const campaign = (await client.query('SELECT * FROM free_sessions WHERE id=$1 FOR UPDATE', [campaignId])).rows[0];
      if (!campaign) fail(404, 'Campagne introuvable.');
      const prior = (await client.query('SELECT id,free_session_id,scheduled_at,duration_minutes FROM live_sessions WHERE id=$1', [input.id])).rows[0];
      if (prior) {
        if (prior.free_session_id !== campaignId || new Date(prior.scheduled_at).getTime() !== Date.parse(input.startTime) || prior.duration_minutes !== input.duration) fail(409, 'Cette demande a déjà été utilisée.');
        return prior;
      }
      meeting = await zoom.createZoomMeeting({ topic: 'Séance gratuite · ' + campaign.title, startTime: input.startTime, durationMinutes: input.duration });
      const selected = (await client.query(`INSERT INTO live_sessions(id,free_session_id,title,scheduled_at,duration_minutes,
        zoom_meeting_id,zoom_join_url,zoom_start_url,zoom_password,free_reservation_required)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id,title,scheduled_at,duration_minutes`,
      [input.id, campaignId, 'Séance gratuite · ' + campaign.title, input.startTime, input.duration,
        meeting.zoom_meeting_id, meeting.zoom_join_url, meeting.zoom_start_url, meeting.zoom_password])).rows[0];
      await client.query(`INSERT INTO free_session_occurrence_events(live_session_id,actor_id,event_type,next_details)
        VALUES($1,$2,'created',$3)`, [selected.id, actorId, JSON.stringify(selected)]);
      return selected;
    });
  } catch (error) {
    if (meeting) {
      // A failed COMMIT response can mean the row committed. Never delete a meeting
      // unless a fresh database read confirms that the local occurrence is absent.
      const saved=await db.query('SELECT id FROM live_sessions WHERE id=$1',[input.id]).catch(()=>null);
      if(saved?.rowCount===0)await zoom.deleteZoomMeeting(meeting.zoom_meeting_id).catch(()=>{});
    }
    throw error;
  }
}

export async function changeOccurrence(db, campaignId, sessionId, actorId, input, zoom, accessPredicate) {
  if (!UUID.test(sessionId) || !['rescheduled', 'cancelled'].includes(input.action)) fail(400, 'Modification invalide.');
  return transaction(db, async client => {
    await client.query('SELECT id FROM free_sessions WHERE id=$1 FOR UPDATE',[campaignId]);
    const prior = (await client.query('SELECT * FROM live_sessions WHERE id=$1 AND free_session_id=$2 FOR UPDATE', [sessionId, campaignId])).rows[0];
    if (!prior) fail(404, 'Séance introuvable.');
    if (prior.status === 'cancelled' && input.action === 'cancelled') return { success: true };
    if (!['scheduled', 'live'].includes(prior.status) || new Date(prior.scheduled_at) <= new Date()) fail(409, 'Cette séance a déjà commencé ou est terminée.');
    if (input.expectedStartTime !== new Date(prior.scheduled_at).toISOString()) fail(409, 'La séance a changé. Actualise la liste.');
    if (input.action === 'rescheduled') {
      if (!Number.isFinite(Date.parse(input.startTime)) || Date.parse(input.startTime) <= Date.now()) fail(400, 'Choisis une date future.');
      if (Date.parse(input.startTime) === new Date(prior.scheduled_at).getTime()) return { success: true };
      if (prior.zoom_meeting_id) await zoom.rescheduleZoomMeeting(prior.zoom_meeting_id, input.startTime, prior.duration_minutes);
      await client.query('UPDATE live_sessions SET scheduled_at=$2 WHERE id=$1', [sessionId, input.startTime]);
      const formatted = new Date(input.startTime).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'full', timeStyle: 'short' });
      await client.query(`INSERT INTO notifications(user_id,title,message,type,link,popup_session_id,popup_scheduled_at)
        SELECT u.id,'Séance reportée',$2,'info','/app/calendar',$1,$3 FROM users u WHERE u.role='user'
          AND EXISTS(SELECT 1 FROM live_sessions ls WHERE ls.id=$1 AND ${accessPredicate('u.id')})`,
      [sessionId, 'La séance « ' + prior.title + ' » est reportée au ' + formatted + '.', input.startTime]);
    } else {
      if (prior.zoom_meeting_id) await zoom.deleteZoomMeeting(prior.zoom_meeting_id);
      await client.query("UPDATE live_sessions SET status='cancelled' WHERE id=$1", [sessionId]);
      await client.query("UPDATE free_session_reservations SET status='cancelled',cancelled_at=now() WHERE live_session_id=$1 AND status='reserved'",[sessionId]);
    }
    const before = { scheduled_at: prior.scheduled_at, status: prior.status };
    const after = input.action === 'cancelled' ? { status: 'cancelled' } : { scheduled_at: input.startTime };
    await client.query(`INSERT INTO free_session_occurrence_events(live_session_id,actor_id,event_type,previous_details,next_details)
      VALUES($1,$2,$3,$4,$5)`, [sessionId, actorId, input.action, JSON.stringify(before), JSON.stringify(after)]);
    return { success: true };
  });
}
