// =====================================================
// LIVE SESSIONS API ROUTES
// =====================================================
import express from "express";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { rescheduleZoomMeeting, createZoomMeeting, deleteZoomMeeting, getZoomOccurrenceRecordings, getZoomPastInstances } from "../utils/zoomClient.js";
import { createR2UploadUrl, generateSignedUrl } from "../utils/r2Utils.js";
import { r2Client, R2_BUCKET } from "../config/r2.js";
import { liveSessionAccess, offerEntitlement, enrollmentAccess, hasExtendedLiveAccess, sessionCourseMatch } from "../utils/offerAccess.js";
import { liveFeatures, recordingImportsEnabled, recordingDiagnostics, recordingSchemaState } from "../services/live-features.js";
import { recordingStorage, recordingWorker } from "../services/recording-worker.js";

import { lockOccurrence, queueRecordingEvent, resolveOccurrence, requestRecordingDeletion, restoreRecording, recordingLog } from '../services/recording-jobs.js';
import { createRecordingDiscovery } from '../services/recording-discovery.js';
import { selectRecordingSegments } from '../services/zoom-recordings.js';

const router = express.Router();
const discovery=createRecordingDiscovery({pool,recordings:getZoomOccurrenceRecordings,instances:getZoomPastInstances});
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOIN_EARLY_MS = 10 * 60_000;

const joinPath = id => `/api/live/${encodeURIComponent(id)}/join`;
const signReplay = async url => url && !/^https?:\/\//i.test(url) ? generateSignedUrl(url, 3600) : url;

// Historical recordings reuse course enrollment permissions; never schedule Zoom.
router.post('/replays', requireAdmin, async (req, res) => {
  const { id, courseId, title, startTime, durationMinutes = 60, replayUrl = null } = req.body || {};
  if (!uuidPattern.test(id || '') || !uuidPattern.test(courseId || '') ||
      typeof title !== 'string' || !title.trim() || title.length > 500 ||
      typeof startTime !== 'string' || !Number.isFinite(Date.parse(startTime)) || Date.parse(startTime) > Date.now() ||
      !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440 ||
      Date.parse(startTime) + durationMinutes * 60000 > Date.now() ||
      (replayUrl !== null && (typeof replayUrl !== 'string' || replayUrl.length > 4096))) {
    return res.status(400).json({ error:'Vérifiez le titre, le cours, la date passée et la durée.' });
  }
  if (replayUrl !== null) {
    try {
      const url = new URL(replayUrl);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { return res.status(400).json({ error:'Lien du replay invalide. Utilisez un lien HTTP ou HTTPS.' }); }
  }
  try {
    const inserted = await pool.query(`INSERT INTO live_sessions
      (id,course_id,title,scheduled_at,duration_minutes,status,replay_url)
      SELECT $1,c.id,$3,$4,$5,'completed',$6 FROM courses c WHERE c.id=$2
      ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id,courseId,title.trim(),startTime,durationMinutes,replayUrl]);
    if (inserted.rowCount) return res.status(201).json({ success:true,id });
    const existing = await pool.query(`SELECT id FROM live_sessions WHERE id=$1 AND course_id=$2 AND title=$3
      AND scheduled_at=$4 AND duration_minutes=$5 AND status='completed' AND zoom_meeting_id IS NULL`,
      [id,courseId,title.trim(),startTime,durationMinutes]);
    if (existing.rowCount) return res.json({ success:true,id });
    return res.status(409).json({ error:'Cours introuvable ou référence déjà utilisée. Fermez puis réessayez.' });
  } catch (error) {
    console.error('Error adding historical replay:',error.code ?? error.name);
    return res.status(500).json({ error:'Impossible d’ajouter le replay. Réessayez.' });
  }
});

// Mark the local session finished; Zoom recording delivery remains webhook-driven.
router.patch('/:sessionId/finish',requireAdmin,async(req,res)=>{
  if(!uuidPattern.test(req.params.sessionId))return res.status(400).json({error:'Séance invalide.'});
  try{
    const result=await pool.query("UPDATE live_sessions SET status='completed' WHERE id=$1 AND status IN ('scheduled','live') AND scheduled_at<=NOW() RETURNING id",[req.params.sessionId]);
    if(!result.rowCount){
      const current=await pool.query('SELECT status FROM live_sessions WHERE id=$1',[req.params.sessionId]);
      if(!current.rowCount)return res.status(404).json({error:'Séance introuvable.'});
      if(current.rows[0].status!=='completed')return res.status(409).json({error:'Seule une séance commencée peut être terminée.'});
    }
    console.info(JSON.stringify({service:'live-sessions',event:'finished',sessionId:req.params.sessionId,adminId:req.user.id}));
    return res.json({success:true});
  }catch(error){console.error('Session finish failed:',error.code??error.name);return res.status(500).json({error:'Impossible de terminer la séance.'});}
});

// Reschedule one upcoming session and notify each currently entitled student once.
router.patch('/:sessionId/reschedule',requireAdmin,async(req,res)=>{
  const {startTime,expectedStartTime}=req.body||{};
  if(!uuidPattern.test(req.params.sessionId)||typeof startTime!=='string'||!Number.isFinite(Date.parse(startTime))||Date.parse(startTime)<=Date.now()||!Number.isFinite(Date.parse(expectedStartTime))||Object.keys(req.body||{}).some(key=>!['startTime','expectedStartTime'].includes(key)))return res.status(400).json({error:'Choisissez une date future valide.'});
  let client;
  try{
    client=await pool.connect();await client.query('BEGIN');
    const result=await client.query('SELECT id,title,scheduled_at,duration_minutes,status,zoom_meeting_id, (SELECT COUNT(*)>1 FROM live_sessions sibling WHERE sibling.zoom_meeting_id=live_sessions.zoom_meeting_id) AS shared_meeting FROM live_sessions WHERE id=$1 FOR UPDATE',[req.params.sessionId]);
    const session=result.rows[0];
    if(!session){await client.query('ROLLBACK');return res.status(404).json({error:'Séance introuvable.'});}
    if(session.status!=='scheduled'||new Date(session.scheduled_at).getTime()<=Date.now()){await client.query('ROLLBACK');return res.status(409).json({error:'Seule une séance à venir peut être reportée.'});}
    if(new Date(session.scheduled_at).getTime()===Date.parse(startTime)){await client.query('COMMIT');return res.json({success:true,notified:0});}
    if(new Date(session.scheduled_at).getTime()!==Date.parse(expectedStartTime)){await client.query('ROLLBACK');return res.status(409).json({error:'La séance a déjà été modifiée. Actualisez avant de réessayer.'});}
    const format=value=>new Date(value).toLocaleString('fr-FR',{timeZone:'Africa/Tunis',dateStyle:'full',timeStyle:'short'});
    const message='La séance « '+session.title+' » est reportée au '+format(startTime)+'.';
    // All fallible local writes precede the provider request; rollback if Zoom rejects it.
    await client.query('UPDATE live_sessions SET scheduled_at=$2 WHERE id=$1',[session.id,startTime]);
    const notifications=await client.query(`INSERT INTO notifications(user_id,title,message,type,link)
      SELECT u.id,$2,$3,'info','/app/calendar' FROM users u
      WHERE u.role='user' AND EXISTS(SELECT 1 FROM live_sessions ls WHERE ls.id=$1 AND ${liveSessionAccess('u.id')})`,[session.id,'Séance reportée',message]);
    if(session.zoom_meeting_id){try{
      await rescheduleZoomMeeting(session.zoom_meeting_id,new Date(startTime).toISOString(),session.duration_minutes,{sharedMeeting:session.shared_meeting===true});
    }catch(error){
      await client.query('ROLLBACK');
      const messages={
        permissions:'Zoom refuse la modification. Vérifiez le droit meeting:update:meeting:admin (ou meeting:write:admin) de l’application Zoom, puis réactivez-la si nécessaire.',
        authentication:'La connexion à Zoom a échoué. Vérifiez la configuration OAuth Zoom côté serveur.',
        missing_meeting:'La réunion associée est introuvable sur Zoom. Vérifiez cette réunion avant de reporter la séance.',
        rate_limit:'Zoom limite les modifications pour le moment. Réessayez plus tard.',
        network:'Impossible de joindre Zoom ou délai dépassé. Vérifiez aussi l’horaire sur Zoom avant de réessayer.',
      };
      const reason=Object.hasOwn(messages,error.reason)?error.reason:'provider_rejected';
      console.warn(JSON.stringify({service:'live-sessions',event:'reschedule_zoom_failed',sessionId:session.id,reason,httpStatus:Number.isInteger(error.httpStatus)?error.httpStatus:undefined,zoomCode:Number.isInteger(error.zoomCode)?error.zoomCode:undefined}));
      return res.status(reason==='rate_limit'?429:502).json({error:(messages[reason]||'Zoom a refusé le report. Consultez le diagnostic reschedule_zoom_failed dans les logs serveur.')+' Aucun changement enregistré sur Synta.'});
    }}

    await client.query('COMMIT');
    console.info(JSON.stringify({service:'live-sessions',event:'rescheduled',sessionId:session.id,adminId:req.user.id,notified:notifications.rowCount}));
    return res.json({success:true,notified:notifications.rowCount});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('Session reschedule failed:',error.code??error.name);return res.status(500).json({error:'Impossible de reporter la séance. Actualisez puis réessayez.'});}
  finally{client?.release();}
});

// Edit completed replay/session presentation without changing Zoom or recording identity.
router.patch('/:sessionId/details', requireAdmin, async (req,res)=>{
  const {title,courseId,courseIds,startTime,durationMinutes,description=''}=req.body || {};
  const hasCourses=courseId!==undefined||courseIds!==undefined;
  const selectedCourses=courseIds!==undefined?uuidList(courseIds):courseId?uuidList([courseId]):[];
  if(!uuidPattern.test(req.params.sessionId)||(courseIds!==undefined&&!Array.isArray(courseIds))||!selectedCourses||selectedCourses.length>100||(courseId!==undefined&&courseIds!==undefined)||
      typeof title!=='string'||!title.trim()||title.length>500||typeof description!=='string'||description.length>10000||
      typeof startTime!=='string'||!Number.isFinite(Date.parse(startTime))||!Number.isInteger(durationMinutes)||
      durationMinutes<1||durationMinutes>1440||
      Object.keys(req.body).some(key=>!['title','courseId','courseIds','startTime','durationMinutes','description'].includes(key))) {
    return res.status(400).json({error:'Vérifiez le titre, les cours, la date passée et la durée.'});
  }
  let client;
  try{
    client=await pool.connect();await client.query('BEGIN');
    const result=await client.query('SELECT course_id,offer_id,zoom_meeting_id,status,scheduled_at,duration_minutes'+(liveFeatures.multiAudience?',access_policy':'')+' FROM live_sessions WHERE id=$1 FOR UPDATE',[req.params.sessionId]);
    const session=result.rows[0];
    if(!session){await client.query('ROLLBACK');return res.status(404).json({error:'Séance introuvable.'});}
    const started=new Date(session.scheduled_at).getTime()<=Date.now();
    const finished=session.status==='completed'||new Date(session.scheduled_at).getTime()+session.duration_minutes*60000<=Date.now();
    if(session.status==='cancelled'||(started&&!finished)){
      await client.query('ROLLBACK');return res.status(409).json({error:'Terminez la séance avant de modifier ses détails.'});
    }
    const scheduleChanged=Date.parse(startTime)!==new Date(session.scheduled_at).getTime()||durationMinutes!==session.duration_minutes;
    if((!finished&&scheduleChanged)||(finished&&scheduleChanged&&Date.parse(startTime)+durationMinutes*60000>Date.now())){
      await client.query('ROLLBACK');return res.status(409).json({error:'Utilisez Reporter la séance pour modifier un horaire à venir. Pour un replay, choisissez une date terminée.'});
    }
    const multi=liveFeatures.multiAudience&&session.access_policy==='any_selected';
    if(hasCourses && !multi && selectedCourses.length!==1){await client.query('ROLLBACK');return res.status(400).json({error:'Choisissez un seul cours pour cette séance.'});}
    if(hasCourses){
      const courses=await client.query('SELECT id FROM courses WHERE id=ANY($1::uuid[]) FOR SHARE',[selectedCourses]);
      if(courses.rowCount!==selectedCourses.length){await client.query('ROLLBACK');return res.status(400).json({error:'Cours introuvable.'});}
      if(multi && !selectedCourses.length){
        const offers=await client.query('SELECT 1 FROM live_session_offers WHERE session_id=$1 LIMIT 1',[req.params.sessionId]);
        if(!offers.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Conservez au moins un cours ou une offre.'});}
      }
      if(multi){
        await client.query('DELETE FROM live_session_courses WHERE session_id=$1',[req.params.sessionId]);
        await client.query('INSERT INTO live_session_courses(session_id,course_id) SELECT $1,unnest($2::uuid[])',[req.params.sessionId,selectedCourses]);
      }
    }
    const primary=multi?null:hasCourses?(selectedCourses.includes(session.course_id)?session.course_id:selectedCourses[0]||null):session.course_id;
    await client.query('UPDATE live_sessions SET title=$2,course_id=$3,scheduled_at=$4,duration_minutes=$5,description=$6 WHERE id=$1',
      [req.params.sessionId,title.trim(),primary,startTime,durationMinutes,description.trim()||null]);
    await client.query('COMMIT');return res.json({success:true});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('Error editing replay details:',error.code??error.name);return res.status(500).json({error:'Impossible de modifier la séance.'});}
  finally{client?.release();}
});

router.get('/session/:sessionId', authApiMiddleware, async (req, res) => {
  if (!uuidPattern.test(req.params.sessionId)) return res.status(400).json({ error: 'Séance invalide.' });
  try {
    const { rows } = await pool.query(`SELECT ls.id,ls.title,ls.description,ls.scheduled_at,ls.duration_minutes,ls.replay_url,
      ls.zoom_join_url IS NOT NULL AS has_join_link FROM live_sessions ls
      WHERE ls.id=$1 AND ${liveSessionAccess('$2')}`, [req.params.sessionId, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Séance introuvable.' });
    const { has_join_link, ...session } = rows[0];
    session.join_url = has_join_link && session.status!=='completed' ? joinPath(session.id) : null;
    session.replay_url = await signReplay(session.replay_url);
    res.set('Cache-Control', 'private, no-store');
    res.json((await attachSessionResources(await attachReplayParts([session]), true))[0]);
  } catch { res.status(500).json({ error: 'Impossible de charger la séance.' }); }
});

/** Published Zoom segments beyond the first are exposed as extra replay parts. */
async function attachReplayParts(sessions) {
  if (!liveFeatures.recordingsTable || !sessions.length) return sessions;
  const { rows } = await pool.query(
    `SELECT r.id, r.live_session_id, r.object_key FROM zoom_recording_imports r
     JOIN live_sessions published_session ON published_session.id=r.live_session_id
     WHERE r.live_session_id = ANY($1) AND r.status = 'published' AND r.object_key IS NOT NULL
       AND EXISTS (SELECT 1 FROM zoom_recording_imports current_part
         WHERE current_part.live_session_id=r.live_session_id AND current_part.status='published'
           AND current_part.object_key=published_session.replay_url)
     ORDER BY r.recording_start, r.id`,
    [sessions.map(session => session.id)]
  );
  const bySession = new Map();
  for (const row of rows) {
    if (!bySession.has(row.live_session_id)) bySession.set(row.live_session_id, []);
    bySession.get(row.live_session_id).push(row);
  }
  return Promise.all(sessions.map(async session => {
    const parts = bySession.get(session.id) || [];
    if (parts.length < 2) return session;
    return {
      ...session,
      replay_parts: await Promise.all(parts.map(async (part, index) => ({
        id: part.id, label: `Partie ${index + 1}`, url: await generateSignedUrl(part.object_key, 3600),
      }))),
    };
  }));
}

async function getEligibleStudents(courseId, offerId, studentIds = null) {
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     WHERE e.course_id = $1 AND u.role = 'user'
       AND ($2::uuid IS NULL OR ${offerEntitlement("u.id", "$2", "e.course_id")})
       AND ${enrollmentAccess("e")}
       AND ($3::uuid[] IS NULL OR u.id = ANY($3))
     ORDER BY u.name, u.email`,
    [courseId, offerId || null, studentIds]
  );
  return result.rows;
}

router.get("/admin/eligible-students", requireAdmin, async (req, res) => {
  const { courseId, offerId } = req.query;
  if (!uuidPattern.test(courseId) || (offerId && !uuidPattern.test(offerId))) {
    return res.status(400).json({ error: "Cours ou offre invalide." });
  }
  try {
    res.json(await getEligibleStudents(courseId, offerId));
  } catch (error) {
    console.error("Error fetching eligible session students:", error.message);
    res.status(500).json({ error: "Impossible de charger les étudiants." });
  }
});

async function attachSessionResources(sessions, includeSignedUrls = false) {
  if (!sessions.length) return [];
  const ids = sessions.map(session => session.id);
  const result = await pool.query(
    `SELECT id, live_session_id, title, file_name, object_key, content_type, file_size
     FROM learning_resources WHERE live_session_id = ANY($1) ORDER BY created_at, title`,
    [ids]
  );
  const resourcesBySession = new Map();
  for (const resource of result.rows) {
    if (!resourcesBySession.has(resource.live_session_id)) resourcesBySession.set(resource.live_session_id, []);
    const item = {
      id: resource.id, title: resource.title, file_name: resource.file_name,
      content_type: resource.content_type, file_size: Number(resource.file_size),
    };
    if (includeSignedUrls) {
      item.url = await generateSignedUrl(resource.object_key, 3600, resource.file_name);
      if (String(resource.file_name || '').toLowerCase().endsWith('.pdf')) {
        item.preview_url = await generateSignedUrl(resource.object_key, 3600);
      }
      if (String(resource.file_name || '').toLowerCase().endsWith('.py')) {
        item.code_url = '/api/live/resources/' + encodeURIComponent(resource.id) + '/code';
      }
    }
    resourcesBySession.get(resource.live_session_id).push(item);
  }
  return sessions.map(session => ({ ...session, resources: resourcesBySession.get(session.id) || [] }));
}

/**
 * GET /api/live/course/:courseId — ENROLLED STUDENTS ONLY
 * Returns scheduled sessions and past sessions for the course. Past sessions
 * remain visible while the replay is being prepared.
 */
router.get("/course/:courseId", authApiMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT ls.id, ls.title, ls.description, ls.scheduled_at,
              ls.duration_minutes, ls.status, ls.zoom_join_url IS NOT NULL AS has_join_link, ls.replay_url,
              md5(jsonb_build_array(ls.title,ls.description,ls.scheduled_at,ls.duration_minutes,ls.replay_url)::text) AS revision
       FROM live_sessions ls
       WHERE ${sessionCourseMatch('$1')}
         AND ${liveSessionAccess("$2")}
       ORDER BY ls.scheduled_at DESC`,
      [courseId, userId]
    );

    const sessions = await Promise.all(result.rows.map(async ({ has_join_link, ...session }) => ({
      ...session,
      join_url: has_join_link && session.status!=='completed' ? joinPath(session.id) : null,
      replay_url: await signReplay(session.replay_url),
    })));
    res.json(await attachSessionResources(await attachReplayParts(sessions), true));
  } catch (error) {
    console.error("Error fetching course live sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/resources/:resourceId/code", authApiMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lr.object_key, lr.file_name, lr.file_size
       FROM learning_resources lr
       JOIN live_sessions ls ON ls.id = lr.live_session_id
       WHERE lr.id = $1
         AND lower(lr.file_name) LIKE '%.py'
         AND ${liveSessionAccess("$2")}`,
      [req.params.resourceId, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Python resource not found" });
    const resource = result.rows[0];
    if (Number(resource.file_size) > 1024 * 1024) {
      return res.status(413).json({ error: "This file is too large to open in the editor. Download it instead." });
    }
    const object = await r2Client.send(new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: resource.object_key,
    }));
    if (!object.Body) return res.status(404).json({ error: "File content is unavailable" });
    const code = await object.Body.transformToString("utf-8");
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.type("text/plain").send(code);
  } catch (error) {
    console.error("Could not load session Python resource into editor:", error.message);
    res.status(500).json({ error: "Could not load this Python file" });
  }
});

/**
 * GET /api/live/upcoming — PROTECTED
 */
router.get("/upcoming", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const sessionResult = await pool.query(
      `SELECT ls.id, ls.title, ls.description, ls.scheduled_at, ls.duration_minutes,
              ls.status, ls.zoom_join_url IS NOT NULL AS has_join_link, ls.replay_url,
              c.title AS course_title, c.thumbnail_url AS course_thumbnail
       FROM live_sessions ls
       LEFT JOIN courses c ON c.id = ls.course_id
       WHERE ${liveSessionAccess("$1")}
         AND ls.status <> 'completed' AND ls.scheduled_at + make_interval(mins => COALESCE(ls.duration_minutes, 60)) > NOW()
       ORDER BY ls.scheduled_at ASC`,
      [userId]
    );

    const response = await Promise.all(sessionResult.rows.map(async ({ has_join_link, course_title, course_thumbnail, ...s }) => ({
      ...s,
      join_url: has_join_link ? joinPath(s.id) : null,
      replay_url: await signReplay(s.replay_url),
      course: { title: course_title, thumbnail_url: course_thumbnail },
    })));

    res.json(response);
  } catch (error) {
    console.error("Error fetching live sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/live/replays — PROTECTED
 */
router.get("/replays", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT DISTINCT ls.id, ls.title, ls.description, ls.scheduled_at,
              ls.duration_minutes, ls.replay_url, ls.course_id, c.title AS course_title
       FROM live_sessions ls
       LEFT JOIN courses c ON c.id = ls.course_id
       WHERE ls.scheduled_at < NOW()
         AND ${liveSessionAccess("$1")}
         AND ls.replay_url IS NOT NULL
       ORDER BY ls.scheduled_at DESC`,
      [userId]
    );

    const replays = await Promise.all(result.rows.map(async ({ course_title, ...s }) => ({
      ...s,
      replay_url: await signReplay(s.replay_url),
      course: { title: course_title },
    })));

    res.json(replays);
  } catch (error) {
    console.error("Error fetching replays:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function joinNotice(res, status, message) {
  res.set("Cache-Control", "private, no-store");
  return res.status(status).type("html").send(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Séance live</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1e293b">` +
    `<p>${message}</p><p><a href="/app/calendar">Retour au calendrier</a></p></body></html>`
  );
}

/**
 * GET /api/live/:sessionId/join — PROTECTED
 * Redirects to Zoom only for authorized students inside the join window.
 */
router.get("/:sessionId/join", authApiMiddleware, async (req, res) => {
  if (!uuidPattern.test(req.params.sessionId)) return joinNotice(res, 404, "Séance introuvable.");
  try {
    const { rows: [session] } = await pool.query(
      `SELECT ls.scheduled_at, ls.duration_minutes, ls.zoom_join_url, ls.status
       FROM live_sessions ls
       WHERE ls.id = $1 AND ${liveSessionAccess("$2")}`,
      [req.params.sessionId, req.user.id]
    );
    if (!session?.zoom_join_url) return joinNotice(res, 404, "Séance introuvable ou accès non autorisé.");
    const start = new Date(session.scheduled_at).getTime();
    const end = start + Number(session.duration_minutes || 60) * 60_000;
    const now = Date.now();
    if (now < start - JOIN_EARLY_MS) {
      return joinNotice(res, 403, "La séance n’a pas encore commencé. Le lien s’ouvre 10 minutes avant le début.");
    }
    if (session.status==='completed' || now > end) return joinNotice(res, 410, "Cette séance est terminée.");
    res.set("Cache-Control", "private, no-store");
    res.redirect(302, session.zoom_join_url);
  } catch (error) {
    console.error("Error opening live session:", error.code ?? error.name);
    joinNotice(res, 500, "Impossible d’ouvrir la séance. Réessayez.");
  }
});

function uuidList(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every(id => typeof id === "string" && uuidPattern.test(id))) return null;
  return [...new Set(value.map(id => id.toLowerCase()))];
}

/**
 * POST /api/live/schedule — ADMIN ONLY
 */
router.post("/schedule", requireAdmin, async (req, res) => {
  if (req.body?.courseIds !== undefined || req.body?.offerIds !== undefined) {
    return scheduleMultipleAudiences(req, res);
  }
  const { courseId, offerId, title, description, startTime, startTimes, durationMinutes = 60, audienceStudentIds = null,
    additionalOfferIds = null, grantedStudentIds = null } = req.body || {};
  const dates = startTimes ?? (startTime ? [startTime] : []);
  const extraOffers = uuidList(additionalOfferIds);
  const grantedStudents = uuidList(grantedStudentIds);
  if (!extraOffers || !grantedStudents) {
    return res.status(400).json({ error: "Offres supplémentaires ou étudiants invités invalides." });
  }
  if ((extraOffers.length || grantedStudents.length) && !hasExtendedLiveAccess()) {
    return res.status(409).json({ error: "Les offres multiples et les accès individuels seront disponibles après la mise à jour de la base de données." });
  }
  if (extraOffers.length && !offerId) {
    return res.status(400).json({ error: "Choisissez d’abord l’offre principale." });
  }
  const additional = extraOffers.filter(id => id !== String(offerId).toLowerCase());

  if (!uuidPattern.test(courseId) || (offerId && !uuidPattern.test(offerId)) ||
      typeof title !== "string" || !title.trim() || !Array.isArray(dates) ||
      !dates.length || dates.length > 84 ||
      dates.some(date => typeof date !== "string" || !Number.isFinite(Date.parse(date))) ||
      !Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 1) {
    return res.status(400).json({ error: "courseId, title, and at least one startTime are required" });
  }
  const times = [...new Set(dates.map(date => new Date(date).toISOString()))].sort();

  try {
    let audience = null;
    if (audienceStudentIds !== null) {
      if (!Array.isArray(audienceStudentIds) || !audienceStudentIds.length ||
          !audienceStudentIds.every(id => typeof id === "string" && uuidPattern.test(id))) {
        return res.status(400).json({ error: "Sélectionnez au moins un étudiant valide." });
      }
      audience = [...new Set(audienceStudentIds.map(id => id.toLowerCase()))];
      const eligibleStudents = await getEligibleStudents(courseId, offerId, audience);
      if (eligibleStudents.length !== audience.length) {
        return res.status(400).json({ error: "Tous les étudiants sélectionnés doivent être inscrits au cours et à l’offre choisie, le cas échéant." });
      }
    }
    if (additional.length) {
      const found = await pool.query("SELECT COUNT(*)::int AS count FROM offers WHERE id = ANY($1::uuid[])", [additional]);
      if (found.rows[0].count !== additional.length) return res.status(400).json({ error: "Une offre supplémentaire est introuvable." });
    }
    if (grantedStudents.length) {
      const found = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE id = ANY($1::uuid[]) AND role = 'user'", [grantedStudents]);
      if (found.rows[0].count !== grantedStudents.length) return res.status(400).json({ error: "Un étudiant invité est introuvable." });
    }

    const isRecurring = times.length > 1;
    const { zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password } =
      await createZoomMeeting({ topic: title, startTime: times[0], durationMinutes, isRecurring });

    const extended = hasExtendedLiveAccess();
    let result;
    try {
      result = await pool.query(
        `INSERT INTO live_sessions
           (course_id, offer_id, title, description, scheduled_at, duration_minutes,
            zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password, status, audience_student_ids
            ${extended ? ", additional_offer_ids, granted_student_ids" : ""})
         SELECT $1, $2, $3, $4, occurrence, $6, $7, $8, $9, $10, 'scheduled', $11
            ${extended ? ", $12::uuid[], $13::uuid[]" : ""}
         FROM unnest($5::timestamptz[]) AS dates(occurrence)
         RETURNING id, title, scheduled_at, zoom_meeting_id, zoom_join_url, offer_id`,
        [
          courseId, offerId || null, title, description || null,
          times, durationMinutes, zoom_meeting_id, zoom_join_url,
          zoom_start_url, zoom_password, audience,
          ...(extended ? [additional.length ? additional : null, grantedStudents.length ? grantedStudents : null] : []),
        ]
      );
    } catch (error) {
      try {
        await deleteZoomMeeting(zoom_meeting_id);
      } catch (cleanupError) {
        console.error("Error cleaning up unscheduled Zoom meeting:", cleanupError.message);
      }
      throw error;
    }

    res.status(201).json({ success: true, sessions: result.rows });
  } catch (error) {
    console.error("Error scheduling live session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

async function scheduleMultipleAudiences(req, res) {
  if (!liveFeatures.multiAudience || process.env.LIVE_MULTI_AUDIENCE_ENABLED !== 'true') {
    return res.status(409).json({ error: 'La sélection multiple nécessite la migration et son activation.' });
  }
  const { title, description, durationMinutes = 60 } = req.body;
  const courses = uuidList(req.body.courseIds);
  const offers = uuidList(req.body.offerIds);
  const invited = uuidList(req.body.grantedStudentIds);
  const dates = req.body.startTimes ?? (req.body.startTime ? [req.body.startTime] : []);
  if (!courses || !offers || !invited || courses.length + offers.length === 0 ||
      [courses, offers, invited].some(ids => ids.length > 100) || typeof title !== 'string' || !title.trim() || title.length > 500 ||
      (description != null && typeof description !== 'string') ||
      !Array.isArray(dates) || !dates.length || dates.length > 84 ||
      dates.some(date => typeof date !== 'string' || !Number.isFinite(Date.parse(date))) ||
      !Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 1 || Number(durationMinutes) > 1440 ||
      req.body.audienceStudentIds != null || req.body.courseId || req.body.offerId || req.body.additionalOfferIds?.length) {
    return res.status(400).json({ error: 'Sélectionnez au moins un cours ou une offre et vérifiez les champs de la séance.' });
  }
  const validate = async db => {
    for (const [table, ids, restriction] of [['courses', courses, ''], ['offers', offers, ''], ['users', invited, "AND role='user'"]]) {
      // Table names and restrictions are fixed server constants.
      const result = await db.query(`SELECT id FROM ${table} WHERE id=ANY($1::uuid[]) ${restriction} FOR SHARE`, [ids]);
      if (result.rowCount !== ids.length) throw Object.assign(new Error('Un cours, une offre ou un étudiant est introuvable.'), { status: 400 });
    }
  };
  let meeting;
  let client;
  let committed = false;
  try {
    await validate(pool);
    const times = [...new Set(dates.map(date => new Date(date).toISOString()))].sort();
    meeting = await createZoomMeeting({ topic: title.trim(), startTime: times[0], durationMinutes: Number(durationMinutes), isRecurring: times.length > 1 });
    client = await pool.connect();
    await client.query('BEGIN');
    await validate(client);
    const result = await client.query(`INSERT INTO live_sessions
      (title,description,scheduled_at,duration_minutes,zoom_meeting_id,zoom_join_url,zoom_start_url,zoom_password,status,access_policy,granted_student_ids)
      SELECT $1,$2,occurrence,$3,$4,$5,$6,$7,'scheduled','any_selected',$8::uuid[]
      FROM unnest($9::timestamptz[]) dates(occurrence)
      RETURNING id,title,scheduled_at,zoom_meeting_id`,
      [title.trim(), description || null, Number(durationMinutes), meeting.zoom_meeting_id, meeting.zoom_join_url,
        meeting.zoom_start_url, meeting.zoom_password, invited.length ? invited : null, times]);
    for (const session of result.rows) {
      await client.query('INSERT INTO live_session_courses(session_id,course_id) SELECT $1,unnest($2::uuid[])', [session.id, courses]);
      await client.query('INSERT INTO live_session_offers(session_id,offer_id) SELECT $1,unnest($2::uuid[])', [session.id, offers]);
    }
    await client.query('COMMIT');
    committed = true;
    return res.status(201).json({ success: true, sessions: result.rows });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (meeting && !committed) await deleteZoomMeeting(meeting.zoom_meeting_id).catch(() => console.error('Failed to clean up unscheduled Zoom meeting'));
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Impossible de créer la séance.' });
  } finally { client?.release(); }
}

/**
 * DELETE /api/live/:sessionId — ADMIN ONLY
 */
router.delete("/:sessionId", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const wholeSeries = req.query.series === "true";
  if (!uuidPattern.test(sessionId)) return res.status(400).json({ error: "Séance invalide." });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT zoom_meeting_id,scheduled_at,duration_minutes FROM live_sessions WHERE id = $1",
      [sessionId]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Session not found" });
    }

    const meetingId = result.rows[0].zoom_meeting_id;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`zoom-cancel:${meetingId || sessionId}`]);
    const current = await client.query("SELECT status FROM live_sessions WHERE id = $1", [sessionId]);
    if (!wholeSeries && current.rows[0]?.status === "cancelled") {
      await client.query("COMMIT");
      return res.json({ success: true, cancelledIds: [sessionId] });
    }
    const siblings = meetingId ? await client.query(
      `SELECT id FROM live_sessions WHERE zoom_meeting_id = $1 AND id <> $2 AND status <> 'cancelled'
       AND scheduled_at + duration_minutes * INTERVAL '1 minute' > NOW()`,
      [meetingId, sessionId]
    ) : { rows: [] };

    const ended=new Date(result.rows[0].scheduled_at).getTime()+Number(result.rows[0].duration_minutes)*60000<=Date.now();
    // Hiding an old replay must not depend on Zoom or delete its original cloud meeting.
    if (meetingId && (wholeSeries || !siblings.rows.length) && (!ended || wholeSeries)) {
      try {
        await deleteZoomMeeting(meetingId);
      } catch {
        await client.query("ROLLBACK");
        return res.status(502).json({ error: "Zoom n’a pas confirmé l’annulation. Réessayez." });
      }
    }

    const cancelled = await client.query(
      "UPDATE live_sessions SET status = 'cancelled' WHERE id = ANY($1::uuid[]) RETURNING id",
      [wholeSeries ? [sessionId, ...siblings.rows.map(row => row.id)] : [sessionId]]
    );
    await client.query("COMMIT");
    res.json({ success: true, cancelledIds: cancelled.rows.map(row => row.id) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Error cancelling live session:", error.code);
    res.status(500).json({ error: "Failed to delete session" });
  } finally {
    client?.release();
  }
});

/**
 * PATCH /api/live/:sessionId/replay — ADMIN ONLY
 * Attach or clear the recording link after a live session.
 */
router.patch("/:sessionId/replay", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const replayKey = typeof req.body?.replayKey === "string" ? req.body.replayKey.trim() : "";
  if (replayKey) {
    if (!replayKey.startsWith(`live-replays/${sessionId}/`) || replayKey.includes("..")) {
      return res.status(400).json({ error: "Invalid replay upload key" });
    }
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Match publication's lock order: session first, then recording rows.
        const target = await client.query('SELECT id FROM live_sessions WHERE id=$1 FOR UPDATE', [sessionId]);
        if (!target.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error:'Session not found' }); }
        if (liveFeatures.recordingsTable) {
          const imports = await client.query(`SELECT status${recordingSchemaState === 'ready' ? ',delete_requested_at' : ''} FROM zoom_recording_imports WHERE object_key=$1 FOR UPDATE`, [replayKey]);
          if (imports.rows.some(row => row.status === 'discarded' || row.delete_requested_at)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error:'Ce fichier a été supprimé. Téléversez une nouvelle vidéo.' });
          }
        }
        const result = await client.query(
        `UPDATE live_sessions SET replay_url = $1 WHERE id = $2 RETURNING id, replay_url`,
        [replayKey, sessionId]
        );
        await client.query('COMMIT');
        return res.json({ success:true,...result.rows[0] });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } catch (error) {
      console.error("Error attaching live replay:", error.message);
      return res.status(500).json({ error: "Failed to attach replay" });
    }
  }
  const rawReplayUrl = typeof req.body?.replayUrl === "string" ? req.body.replayUrl.trim() : "";
  let replayUrl = null;

  if (rawReplayUrl) {
    try {
      const parsedUrl = new URL(rawReplayUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Invalid protocol");
      replayUrl = parsedUrl.toString();
    } catch {
      return res.status(400).json({ error: "Replay URL must be a valid HTTP or HTTPS URL" });
    }
  }

  try {
    const result = await pool.query(
      `UPDATE live_sessions SET replay_url = $1 WHERE id = $2 RETURNING id, replay_url`,
      [replayUrl, sessionId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Session not found" });
    res.json({ success: true, ...result.rows[0] });
  } catch (error) {
    console.error("Error updating live session replay:", error);
    res.status(500).json({ error: "Failed to update replay link" });
  }
});

router.post("/:sessionId/replay-upload-url", requireAdmin, async (req, res) => {
  const { fileName, contentType, size } = req.body || {};
  if (!new Set(["video/mp4", "video/webm", "video/quicktime"]).has(contentType)) {
    return res.status(400).json({ error: "Upload an MP4, WebM, or MOV video" });
  }
  if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > 1024 * 1024 * 1024) {
    return res.status(400).json({ error: "Replay file must be 1 GB or less" });
  }
  try {
    const session = await pool.query("SELECT id FROM live_sessions WHERE id = $1", [req.params.sessionId]);
    if (!session.rowCount) return res.status(404).json({ error: "Session not found" });
    const safeName = String(fileName || "replay").normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const key = `live-replays/${req.params.sessionId}/${Date.now()}-${safeName}`;
    const uploadUrl = await createR2UploadUrl(key, contentType, 900);
    res.json({ uploadUrl, key });
  } catch (error) {
    console.error("Could not prepare replay upload:", error.message);
    res.status(500).json({ error: "Could not prepare replay upload" });
  }
});

/**
 * GET /api/live/admin/sessions — ADMIN ONLY
 */
router.get("/admin/sessions", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ls.id, ls.course_id, ls.offer_id, ls.title, ls.description, ls.scheduled_at,
              ls.duration_minutes, ls.status, ls.zoom_meeting_id, ls.replay_url, ls.audience_student_ids,
              ${hasExtendedLiveAccess() ? "ls.additional_offer_ids, ls.granted_student_ids," : ""}
              ${liveFeatures.multiAudience ? "ls.access_policy, ARRAY(SELECT course_id FROM live_session_courses WHERE session_id=ls.id) AS course_ids, ARRAY(SELECT offer_id FROM live_session_offers WHERE session_id=ls.id) AS offer_ids," : ""}
              ${hasExtendedLiveAccess() ? "COALESCE((SELECT json_agg(json_build_object('id',u.id,'name',u.name,'email',u.email)) FROM users u WHERE u.id=ANY(ls.granted_student_ids)), '[]'::json) AS invited_students," : ""}
              ${liveFeatures.recordingsTable ? "EXISTS(SELECT 1 FROM zoom_recording_imports r WHERE r.live_session_id=ls.id AND r.status='published' AND r.object_key=ls.replay_url)" : "false"} AS replay_is_zoom,
              ls.zoom_start_url IS NOT NULL AS has_host_link, c.title AS course_title
       FROM live_sessions ls
       LEFT JOIN courses c ON c.id = ls.course_id
       WHERE ls.status <> 'cancelled'
       ORDER BY ls.scheduled_at DESC`
    );

    const data = await Promise.all(result.rows.map(async ({ course_title, replay_is_zoom, ...s }) => ({
      ...s,
      course: { title: course_title },
      replay_source: !s.replay_url ? null : replay_is_zoom ? 'zoom' : /^https?:\/\//i.test(s.replay_url) ? 'external' : 'upload',
      replay_preview_url: await signReplay(s.replay_url),
    })));

    res.set('Cache-Control', 'private, no-store');
    res.json(await attachSessionResources(data, true));
  } catch (error) {
    console.error("Error fetching admin sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/live/admin/features — ADMIN ONLY
 */
router.get("/admin/features", requireAdmin, (req, res) => {
  if(recordingSchemaState==='unavailable')return res.status(503).json({error:'Vérification de la base indisponible.'});
  res.set('Cache-Control','private, no-store');
  res.json({ extendedAccess: hasExtendedLiveAccess(), recordings: liveFeatures.recordingsTable,
    multiAudience: liveFeatures.multiAudience && process.env.LIVE_MULTI_AUDIENCE_ENABLED === 'true',
    recordingDiagnostics: recordingDiagnostics(recordingWorker.isRunning?.() || false) });
});

/**
 * GET /api/live/admin/students?q= — ADMIN ONLY
 * Any student account can be granted individual access to a session.
 */
router.get("/admin/students", requireAdmin, async (req, res) => {
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email FROM users
       WHERE role = 'user' AND ($1 = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
       ORDER BY name NULLS LAST, email LIMIT 50`,
      [search]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error searching students:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de charger les étudiants." });
  }
});

function requireRecordingsTable(req, res, next) {
  if (!liveFeatures.recordingsTable || recordingSchemaState !== 'ready') {
    return res.status(409).json({ error: "L’import automatique des enregistrements n’est pas encore activé." });
  }
  next();
}

const recoveryRequests = new Map();
function allowRecordingRecovery(req,res,next) {
  if(!recordingImportsEnabled())return res.status(409).json({error:'Les imports sont désactivés.'});
  const now=Date.now();
  for(const [id,item] of recoveryRequests)if(item.until<now)recoveryRequests.delete(id);
  const item=recoveryRequests.get(req.user.id)||{until:now+60000,count:0};
  if(++item.count>10)return res.status(429).json({error:'Trop de recherches. Réessayez dans une minute.'});
  recoveryRequests.set(req.user.id,item);next();
}
const validOccurrence = value => typeof value==='string' && value.length>0 && value.length<=512 && !/^\d+$/.test(value);

// Discovery is read-only. Only the explicitly selected file IDs are queued later.
router.post('/admin/recordings/discover',requireAdmin,requireRecordingsTable,allowRecordingRecovery,async(req,res)=>{
  const {occurrenceUuid,sessionId}=req.body||{};
  if((occurrenceUuid && !validOccurrence(occurrenceUuid))||!uuidPattern.test(sessionId||''))return res.status(400).json({error:'Séance ou occurrence invalide.'});
  try{
    const {rows:[session]}=await pool.query("SELECT id,title,zoom_meeting_id,scheduled_at FROM live_sessions WHERE id=$1 AND status<>'cancelled'",[sessionId]);
    if(!session||!session.zoom_meeting_id)return res.status(404).json({error:'Aucune réunion Zoom associée à cette séance.'});
    const result=await discovery.search(session,occurrenceUuid);
    res.json(result);recordingLog('historical_discovered',{sessionId,adminId:req.user.id,count:result.files.length,state:result.state});
  }catch(error){recordingLog('historical_discovery_failed',{error:error.code||error.name});res.status(error.status===409?409:error.status===429?429:502).json({error:error.status===409?'Cette occurrence appartient à une autre réunion Zoom.':'Impossible de contacter Zoom. Veuillez réessayer.'});}
});
router.get('/admin/recordings/trash',requireAdmin,requireRecordingsTable,async(req,res)=>{
  if(!uuidPattern.test(req.query.sessionId||''))return res.status(400).json({error:'Séance invalide.'});
  try{
    const {rows}=await pool.query(`SELECT r.id,r.recording_start,r.recording_end,r.file_size,r.status,d.requested_at,d.purge_after,d.completed_at,
      (d.completed_at IS NULL AND r.status IN ('needs_review','failed')) AS restorable
      FROM zoom_recording_imports r JOIN zoom_recording_deletions d ON d.import_id=r.id
      WHERE r.live_session_id=$1 AND r.delete_requested_at IS NOT NULL AND d.restored_at IS NULL ORDER BY d.requested_at DESC`,[req.query.sessionId]);
    res.set('Cache-Control','private, no-store');res.json(rows);
  }catch{res.status(500).json({error:'Impossible de charger la Corbeille.'});}
});
router.post('/admin/recordings/:importId/restore',requireAdmin,requireRecordingsTable,async(req,res)=>{
  if(!uuidPattern.test(req.params.importId))return res.status(400).json({error:'Segment invalide.'});
  try{await restoreRecording(pool,req.params.importId,req.user.id);
    const {rows:[row]}=await pool.query('SELECT live_session_id FROM zoom_recording_imports WHERE id=$1',[req.params.importId]);
    if(row?.live_session_id)discovery.invalidate(row.live_session_id);
    res.json({success:true});}
  catch{res.status(409).json({error:'Ce segment a déjà été supprimé définitivement ou ne peut pas être restauré.'});}
});
router.post('/admin/recordings/recover',requireAdmin,requireRecordingsTable,allowRecordingRecovery,async(req,res)=>{
  const {occurrenceUuid,sessionId,fileIds}=req.body||{};
  if(!validOccurrence(occurrenceUuid)||!uuidPattern.test(sessionId||'')||!Array.isArray(fileIds)||!fileIds.length||fileIds.length>100||fileIds.some(id=>typeof id!=='string'))return res.status(400).json({error:'Sélectionnez les fichiers de l’occurrence.'});
  try{
    const {rows:[session]}=await pool.query("SELECT zoom_meeting_id FROM live_sessions WHERE id=$1 AND status<>'cancelled'",[sessionId]);
    if(!session)return res.status(404).json({error:'Séance introuvable.'});
    const data=await getZoomOccurrenceRecordings(occurrenceUuid);
    if(String(data.id)!==session.zoom_meeting_id)return res.status(409).json({error:'Réunion incompatible.'});
    const deleted=await pool.query("SELECT 1 FROM zoom_recording_imports WHERE zoom_file_id=ANY($1::text[]) AND (delete_requested_at IS NOT NULL OR status='discarded') LIMIT 1",[fileIds]);
    if(deleted.rowCount)return res.status(409).json({error:'Ce segment est supprimé. Utilisez la Corbeille pour le restaurer.'});
    const files=selectRecordingSegments(data.recording_files);
    if(fileIds.some(id=>!files.some(file=>String(file.id)===id)))return res.status(409).json({error:'La sélection Zoom a changé. Relancez la recherche.'});
    // Resolve BEFORE queueing, so an invalid target never leaves new jobs behind.
    const client=await pool.connect();
    try{
      await client.query('BEGIN');await lockOccurrence(client,occurrenceUuid);
      const existing=await client.query('SELECT * FROM zoom_recording_occurrences WHERE occurrence_uuid=$1 FOR UPDATE',[occurrenceUuid]);
      const conflicts=await client.query('SELECT 1 FROM zoom_recording_imports WHERE zoom_meeting_uuid=$1 AND live_session_id IS NOT NULL AND live_session_id<>$2 LIMIT 1',[occurrenceUuid,sessionId]);
      if(conflicts.rowCount||(existing.rows[0]?.live_session_id && existing.rows[0].live_session_id!==sessionId)||existing.rows[0]?.resolution==='legacy_conflict'){
        await client.query('ROLLBACK');return res.status(409).json({error:'Cette occurrence possède une association existante à préserver.'});
      }
      await client.query(`INSERT INTO zoom_recording_occurrences(occurrence_uuid,meeting_id,live_session_id,resolution,resolved_by,resolved_at)
        VALUES($1,$2,$3,'admin',$4,NOW()) ON CONFLICT(occurrence_uuid) DO NOTHING`,[occurrenceUuid,String(data.id),sessionId,req.user.id]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
    await resolveOccurrence(pool,occurrenceUuid,sessionId,req.user.id);
    const result=await queueRecordingEvent(pool,{object:data},{selectedIds:fileIds});
    discovery.invalidate(sessionId);
    recordingWorker.kick();res.json({success:true,queued:result.queued});
  }catch(error){recordingLog('historical_recovery_failed',{error:error.code||error.name});res.status(502).json({error:'Import impossible. Vérifiez l’occurrence et réessayez.'});}
});
router.post('/admin/recordings/resolve',requireAdmin,requireRecordingsTable,async(req,res)=>{
  const {occurrenceUuid,sessionId}=req.body||{};
  if(!validOccurrence(occurrenceUuid)||!uuidPattern.test(sessionId||''))return res.status(400).json({error:'Association invalide.'});
  try{await resolveOccurrence(pool,occurrenceUuid,sessionId,req.user.id);res.json({success:true});}
  catch(error){recordingLog('resolution_rejected',{error:error.code||error.name});res.status(409).json({error:'Association incompatible ou déjà attribuée à une autre séance.'});}
});

/**
 * GET /api/live/admin/recordings — ADMIN ONLY
 * Import status per Zoom segment, with a short preview link once stored in R2.
 */
router.get("/admin/recordings", requireAdmin, requireRecordingsTable, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, live_session_id, zoom_meeting_id, zoom_meeting_uuid, recording_type, recording_start, recording_end,
              file_size, bytes_transferred, status, review_reason, attempts, last_error, object_key, delete_requested_at, created_at
       FROM zoom_recording_imports
       WHERE status <> 'discarded' AND delete_requested_at IS NULL
       ORDER BY recording_start DESC`
    );
    const stored = new Set(["needs_review", "published"]);
    res.json(await Promise.all(rows.map(async ({ object_key, ...row }) => ({
      ...row,
      format:'MP4',
      preview_url: stored.has(row.status) && !row.delete_requested_at && object_key ? await generateSignedUrl(object_key, 3600) : null,
    }))));
  } catch (error) {
    console.error("Error listing recording imports:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de charger les enregistrements." });
  }
});

/**
 * POST /api/live/admin/recordings/:importId/retry — ADMIN ONLY
 */
router.post("/admin/recordings/:importId/retry", requireAdmin, requireRecordingsTable, async (req, res) => {
  if (!uuidPattern.test(req.params.importId)) return res.status(400).json({ error: "Import invalide." });
  if (!recordingImportsEnabled()) return res.status(409).json({ error:'Les imports sont désactivés.' });
  try {
    const result = await pool.query(
      `UPDATE zoom_recording_imports
       SET status = 'pending', attempts = 0, next_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'failed' AND delete_requested_at IS NULL RETURNING id`,
      [req.params.importId]
    );
    if (!result.rowCount) return res.status(409).json({ error: "Seuls les imports en échec peuvent être relancés." });
    recordingLog('retry_requested',{importId:req.params.importId,adminId:req.user.id});
    recordingWorker.kick();
    res.json({ success: true });
  } catch (error) {
    console.error("Error retrying recording import:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de relancer l’import." });
  }
});

/**
 * POST /api/live/admin/recordings/publish — ADMIN ONLY
 * Body: { sessionId, importIds } — the chosen stored segments become the
 * session replay, in recording order. Other segments stay stored for review.
 */
router.post("/admin/recordings/publish", requireAdmin, requireRecordingsTable, async (req, res) => {
  const sessionId = req.body?.sessionId;
  const importIds = uuidList(req.body?.importIds);
  if (!uuidPattern.test(sessionId || "") || !importIds?.length) {
    return res.status(400).json({ error: "Choisissez une séance et au moins un segment." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identified=await client.query('SELECT DISTINCT zoom_meeting_uuid FROM zoom_recording_imports WHERE id=ANY($1::uuid[])',[importIds]);
    if(identified.rows.length!==1){await client.query('ROLLBACK');return res.status(409).json({error:'Choisissez les segments d’une seule occurrence Zoom.'});}
    const occurrence=identified.rows[0].zoom_meeting_uuid;
    await lockOccurrence(client,occurrence);
    const {rows:[binding]}=await client.query('SELECT * FROM zoom_recording_occurrences WHERE occurrence_uuid=$1 FOR UPDATE',[occurrence]);
    if(!binding || binding.resolution==='legacy_conflict' || binding.live_session_id!==sessionId){
      await client.query('ROLLBACK');return res.status(409).json({error:'Associez explicitement cette occurrence à la séance avant publication.'});
    }
    const { rows: [session] } = await client.query(
      "SELECT id, zoom_meeting_id FROM live_sessions WHERE id = $1 AND status <> 'cancelled' FOR UPDATE", [sessionId]);
    if (!session) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Séance introuvable." });
    }
    const { rows: chosen } = await client.query(
      `SELECT id, object_key FROM zoom_recording_imports
       WHERE id = ANY($1::uuid[]) AND status IN ('needs_review', 'published') AND object_key IS NOT NULL
         AND zoom_meeting_id = $2 AND live_session_id = $3 AND delete_requested_at IS NULL
       ORDER BY recording_start, id
       FOR UPDATE`,
      [importIds, session.zoom_meeting_id, sessionId]
    );
    if (chosen.length !== importIds.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Un segment choisi n’est pas disponible pour cette séance." });
    }
    for(const row of chosen) { const head=await recordingStorage.head(row.object_key); if(!Number(head?.ContentLength)) throw new Error('Stored recording unavailable'); }
    await client.query(
      `UPDATE zoom_recording_imports SET status = 'needs_review', review_reason = 'not_selected', updated_at = NOW()
       WHERE live_session_id = $1 AND status = 'published' AND NOT (id = ANY($2::uuid[]))`,
      [sessionId, importIds]
    );
    await client.query(
      `UPDATE zoom_recording_imports
       SET status = 'published', live_session_id = $1, review_reason = NULL, updated_at = NOW()
       WHERE id = ANY($2::uuid[])`,
      [sessionId, importIds]
    );
    await client.query("UPDATE live_sessions SET replay_url = $2 WHERE id = $1", [sessionId, chosen[0].object_key]);
    await client.query("COMMIT");
    recordingLog('published',{sessionId,adminId:req.user.id,count:chosen.length});
    res.json({ success: true, published: chosen.map(row => row.id) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error publishing recording:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de publier le replay." });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/live/admin/recordings/:importId — ADMIN ONLY
 * Deletes an unpublished segment from R2 only. The Zoom cloud recording is kept,
 * and the row stays so the same Zoom file is never imported again.
 */
router.delete("/admin/recordings/:importId", requireAdmin, requireRecordingsTable, async (req, res) => {
  if (!uuidPattern.test(req.params.importId)) return res.status(400).json({ error: "Import invalide." });
  if(!recordingImportsEnabled())return res.status(409).json({error:'Les imports sont désactivés.'});
  try {
    await requestRecordingDeletion(pool,req.params.importId,req.user.id);
    const {rows:[row]}=await pool.query('SELECT live_session_id FROM zoom_recording_imports WHERE id=$1',[req.params.importId]);
    if(row?.live_session_id)discovery.invalidate(row.live_session_id);
    recordingWorker.kick();
    res.status(202).json({success:true,pendingDeletion:true});
  } catch(error) {
    recordingLog('deletion_rejected',{error:error.code||error.name});
    res.status(409).json({error:'Suppression impossible : segment publié, utilisé ou indisponible.'});
  }
});

export default router;
