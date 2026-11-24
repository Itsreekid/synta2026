// Durable occurrence intake and fenced Zoom → private R2 imports.
import crypto from 'node:crypto';
import { matchSession, selectRecordingSegments, recordingObjectKey, PART_SIZE, MAX_ATTEMPTS, RETRY_DELAYS_MS } from './zoom-recordings.js';

const LEASE_MS = 15 * 60_000;
export const recordingLog = (event, fields = {}) => console.log(JSON.stringify({ service:'zoom-recordings', event, ...fields }));
export async function lockOccurrence(client, uuid) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [uuid]);
}
class LostClaim extends Error { constructor() { super('Import ownership lost'); this.name='LostClaim'; } }
const ownedSql = "id=$1 AND claim_token=$2 AND status='importing' AND delete_requested_at IS NULL AND locked_until>clock_timestamp()";

export async function queueRecordingEvent(pool, payload, { selectedIds } = {}) {
  const meeting = payload?.object;
  const meetingId = meeting?.id == null ? '' : String(meeting.id);
  const occurrence = meeting?.uuid;
  const files = selectRecordingSegments(meeting?.recording_files).filter(file => !selectedIds || selectedIds.includes(String(file.id)));
  if (!meetingId || typeof occurrence !== 'string' || !occurrence || occurrence.length>512 || !files.length) return { queued:0, ignored:true };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockOccurrence(client, occurrence);
    let { rows:[binding] } = await client.query('SELECT * FROM zoom_recording_occurrences WHERE occurrence_uuid=$1 FOR UPDATE',[occurrence]);
    if (binding && binding.meeting_id !== meetingId) throw new Error('Occurrence meeting mismatch');
    if (binding?.resolution === 'legacy_conflict') throw new Error('Legacy occurrence conflict requires investigation');
    if (!binding) {
      const { rows:sessions } = await client.query("SELECT id,scheduled_at,duration_minutes FROM live_sessions WHERE zoom_meeting_id=$1 AND status<>'cancelled'",[meetingId]);
      if (!sessions.length) { await client.query('ROLLBACK'); return { queued:0, ignored:true }; }
      const start = Date.parse(meeting.start_time || files[0].recording_start);
      const match = matchSession(sessions,start);
      ({rows:[binding]} = await client.query(`INSERT INTO zoom_recording_occurrences(occurrence_uuid,meeting_id,live_session_id,resolution)
        VALUES($1,$2,$3,$4) RETURNING *`,[occurrence,meetingId,match.sessionId,match.reason==='ambiguous_session'?'ambiguous':match.sessionId?'matched':'unmatched']));
      recordingLog('occurrence_matched',{ sessionId:binding.live_session_id, resolution:binding.resolution });
    }
    let queued=0;const importIds=[];
    for (const file of files) {
      const result=await client.query(`INSERT INTO zoom_recording_imports(zoom_meeting_id,zoom_meeting_uuid,zoom_file_id,recording_type,
        recording_start,recording_end,file_size,download_url,live_session_id,review_reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(zoom_file_id) DO NOTHING RETURNING id`,
        [meetingId,occurrence,String(file.id),file.recording_type||null,file.recording_start,file.recording_end||null,
          Number(file.file_size)>0?Number(file.file_size):null,file.download_url,binding.live_session_id,
          binding.resolution==='ambiguous'?'ambiguous_session':binding.live_session_id?'admin_approval_required':'no_matching_session']);
      queued+=result.rowCount;
      if(result.rows[0])importIds.push(result.rows[0].id);
    }
    await client.query('COMMIT');
    recordingLog('jobs_queued',{ sessionId:binding.live_session_id, occurrence:crypto.createHash('sha256').update(occurrence).digest('hex').slice(0,16), count:queued, importIds });
    return {queued,sessionId:binding.live_session_id,reason:binding.live_session_id?null:binding.resolution};
  } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { client.release(); }
}

export async function resolveOccurrence(pool, occurrence, sessionId, adminId) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN'); await lockOccurrence(client,occurrence);
    const {rows:[binding]}=await client.query('SELECT * FROM zoom_recording_occurrences WHERE occurrence_uuid=$1 FOR UPDATE',[occurrence]);
    const {rows:[session]}=await client.query("SELECT id,zoom_meeting_id FROM live_sessions WHERE id=$1 AND status<>'cancelled' FOR UPDATE",[sessionId]);
    if(!binding||!session||binding.meeting_id!==session.zoom_meeting_id||binding.resolution==='legacy_conflict') throw new Error('Association incompatible');
    // Preserve existing associations; never silently reassign a previously attached import.
    const conflict=await client.query('SELECT 1 FROM zoom_recording_imports WHERE zoom_meeting_uuid=$1 AND live_session_id IS NOT NULL AND live_session_id<>$2 LIMIT 1',[occurrence,sessionId]);
    if(conflict.rowCount || (binding.live_session_id && binding.live_session_id!==sessionId)) throw new Error('Association existante à préserver');
    await client.query("UPDATE zoom_recording_occurrences SET live_session_id=$2,resolution='admin',resolved_by=$3,resolved_at=NOW() WHERE occurrence_uuid=$1",[occurrence,sessionId,adminId]);
    await client.query("UPDATE zoom_recording_imports SET live_session_id=$2,review_reason=CASE WHEN status='needs_review' THEN 'admin_approval_required' ELSE review_reason END WHERE zoom_meeting_uuid=$1 AND live_session_id IS NULL",[occurrence,sessionId]);
    await client.query('COMMIT'); recordingLog('occurrence_resolved',{sessionId,adminId});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

async function claim(pool) {
  const token=crypto.randomUUID();
  const {rows:[job]}=await pool.query(`UPDATE zoom_recording_imports SET status='importing',claim_token=$1,attempts=attempts+1,
    locked_until=NOW()+$2*INTERVAL '1 millisecond',updated_at=NOW() WHERE id=(SELECT id FROM zoom_recording_imports
    WHERE delete_requested_at IS NULL AND ((status='pending' AND next_attempt_at<=NOW()) OR (status='importing' AND locked_until<NOW()))
    ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[token,LEASE_MS]);
  return job;
}
async function heartbeat(pool,job) {
  const result=await pool.query(`UPDATE zoom_recording_imports SET locked_until=NOW()+$3*INTERVAL '1 millisecond' WHERE ${ownedSql}`,[job.id,job.claim_token,LEASE_MS]);
  if(!result.rowCount)throw new LostClaim();
}
async function updateOwned(pool,job,assignments,values=[]) {
  const result=await pool.query(`UPDATE zoom_recording_imports SET ${assignments},updated_at=NOW() WHERE ${ownedSql}`,[job.id,job.claim_token,...values]);
  if(!result.rowCount)throw new LostClaim();
}
async function updateAttempt(pool,job,token,assignments,values=[]) {
  const result=await pool.query(`UPDATE zoom_recording_transfers SET ${assignments} WHERE token=$3
    AND EXISTS(SELECT 1 FROM zoom_recording_imports WHERE ${ownedSql})`,[job.id,job.claim_token,token,...values]);
  if(!result.rowCount)throw new LostClaim();
}
async function metadata(storage,key) {
  try{return await storage.head(key);}catch(error){if(error?.$metadata?.httpStatusCode===404||['NotFound','NoSuchKey'].includes(error?.name))return null;throw error;}
}
async function abortUpload(storage,key,id) {
  try{await storage.abortMultipart(key,id);}catch(error){if(error.name!=='NoSuchUpload'&&error?.$metadata?.httpStatusCode!==404)throw error;}
}

async function transfer(pool,job,{zoom,storage},signal) {
  // Reconcile completed multipart objects even if the process crashed before settlement.
  const {rows:previous}=await pool.query('SELECT * FROM zoom_recording_transfers WHERE import_id=$1 ORDER BY created_at DESC',[job.id]);
  for(const attempt of previous) {
    const head=attempt.expected_size?await metadata(storage,attempt.object_key):null;
    if(head && Number(head.ContentLength)===Number(attempt.expected_size)) {
      await heartbeat(pool,job);
      await updateAttempt(pool,job,attempt.token,'completed_at=COALESCE(completed_at,NOW()),multipart_upload_id=NULL');
      await updateOwned(pool,job,'object_key=$3,bytes_transferred=$4,multipart_upload_id=NULL',[attempt.object_key,attempt.expected_size]);
      recordingLog('upload_reconciled',{importId:job.id}); return attempt.object_key;
    }
    if(attempt.multipart_upload_id){
      await heartbeat(pool,job);
      await abortUpload(storage,attempt.object_key,attempt.multipart_upload_id);
      await updateAttempt(pool,job,attempt.token,'multipart_upload_id=NULL');
    }
  }
  // Legacy interrupted uploads have no transfer record; abort only that incomplete upload.
  if(job.multipart_upload_id && job.object_key) await storage.abortMultipart(job.object_key,job.multipart_upload_id).catch(()=>{});
  const key=recordingObjectKey(job.live_session_id,job.zoom_file_id).replace(/\.mp4$/,`-${job.claim_token}.mp4`);
  await heartbeat(pool,job);
  const inserted=await pool.query(`INSERT INTO zoom_recording_transfers(token,import_id,object_key)
    SELECT $2,id,$3 FROM zoom_recording_imports WHERE ${ownedSql}`,[job.id,job.claim_token,key]);
  if(!inserted.rowCount)throw new LostClaim();
  const uploadId=await storage.createMultipart(key,'video/mp4');
  try {
    await heartbeat(pool,job);
    await updateAttempt(pool,job,job.claim_token,'multipart_upload_id=$4',[uploadId]);
    await updateOwned(pool,job,'multipart_upload_id=$3,bytes_transferred=0',[uploadId]);
    let response=await zoom.download(job.download_url,signal);
    if([401,403,404,410].includes(response.status) && zoom.recordings) {
      await response.body?.cancel?.();
      const fresh=await zoom.recordings(job.zoom_meeting_uuid);
      const file=fresh.recording_files?.find(file=>String(file.id)===job.zoom_file_id && (!file.status||file.status==='completed'));
      if(file?.download_url) {
        await updateOwned(pool,job,'download_url=$3',[file.download_url]);
        response=await zoom.download(file.download_url,signal);
        recordingLog('download_metadata_refreshed',{importId:job.id});
      }
    }
    if(!response.ok||!response.body) {await response.body?.cancel?.();const error=new Error(`Zoom download failed (${response.status})`);error.permanent=[404,410].includes(response.status);throw error;}
    const reader=response.body.getReader(); let total=0,buffer=Buffer.alloc(0);const parts=[];
    const flush=async chunk=>{
      await heartbeat(pool,job);
      const ETag=await storage.uploadPart(key,uploadId,parts.length+1,chunk);
      parts.push({ETag,PartNumber:parts.length+1});
      await updateOwned(pool,job,'bytes_transferred=$3',[total]);
    };
    try {
      for(;;){
        let timeout;
        const result=await Promise.race([reader.read(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Zoom download stalled')),120000);})]).finally(()=>clearTimeout(timeout));
        if(result.done)break;
        const chunk=Buffer.from(result.value);total+=chunk.length;buffer=Buffer.concat([buffer,chunk]);
        while(buffer.length>=PART_SIZE){await flush(buffer.subarray(0,PART_SIZE));buffer=buffer.subarray(PART_SIZE);}
      }
      if(buffer.length)await flush(buffer);
    }finally{await reader.cancel().catch(()=>{});}
    if(!total)throw new Error('Zoom returned an empty recording');
    if(job.file_size && Number(job.file_size)!==total)throw new Error(`Size mismatch (expected ${job.file_size}, received ${total})`);
    await heartbeat(pool,job);
    await updateAttempt(pool,job,job.claim_token,'expected_size=$4',[total]);
    await storage.completeMultipart(key,uploadId,parts);
    const head=await storage.head(key);
    if(Number(head?.ContentLength)!==total)throw new Error('Stored object size does not match the download');
    await heartbeat(pool,job);
    await updateAttempt(pool,job,job.claim_token,'completed_at=NOW(),multipart_upload_id=NULL');
    await updateOwned(pool,job,'object_key=$3,bytes_transferred=$4,multipart_upload_id=NULL',[key,total]);
    recordingLog('upload_completed',{importId:job.id,bytes:total});return key;
  }catch(error){
    // This worker can only abort its own unique upload, never another claim's object.
    try{
      await abortUpload(storage,key,uploadId);
      await updateAttempt(pool,job,job.claim_token,'multipart_upload_id=NULL');
    }catch{/* Keep the upload ID for durable abort/retry recovery. */}
    await updateOwned(pool,job,'multipart_upload_id=NULL').catch(()=>{});
    throw error;
  }
}

export async function settleRecording(pool,job,key) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');await lockOccurrence(client,job.zoom_meeting_uuid);
    const {rows:[current]}=await client.query(`SELECT * FROM zoom_recording_imports WHERE ${ownedSql} FOR UPDATE`,[job.id,job.claim_token]);
    if(!current)throw new LostClaim();
    const {rows:[binding]}=await client.query('SELECT * FROM zoom_recording_occurrences WHERE occurrence_uuid=$1',[job.zoom_meeting_uuid]);
    const count=await client.query("SELECT COUNT(*)::int AS n FROM zoom_recording_imports WHERE zoom_meeting_uuid=$1 AND status<>'discarded'",[job.zoom_meeting_uuid]);
    const reason=!current.live_session_id?(binding?.resolution==='ambiguous'?'ambiguous_session':'no_matching_session'):count.rows[0].n>1?'multiple_segments':'admin_approval_required';
    await client.query(`UPDATE zoom_recording_imports SET status='needs_review',review_reason=$3,object_key=$4,locked_until=NULL,
      claim_token=NULL,last_error=NULL,updated_at=NOW() WHERE id=$1 AND claim_token=$2`,[job.id,job.claim_token,reason,key]);
    await client.query('COMMIT');recordingLog('review_required',{importId:job.id,sessionId:current.live_session_id});return 'needs_review';
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export async function processNextRecording(pool,deps,{heartbeatMs=30000}={}) {
  const job=await claim(pool);if(!job)return null;
  const controller=new AbortController();let renewing=false,lost=false;
  // Renew during downloads AND slow R2 operations, not only after a part finishes.
  const timer=setInterval(async()=>{if(renewing)return;renewing=true;try{await heartbeat(pool,job);}catch{lost=true;controller.abort();}finally{renewing=false;}},heartbeatMs);timer.unref?.();
  try {const key=await transfer(pool,job,deps,controller.signal);if(lost)throw new LostClaim();return{id:job.id,status:await settleRecording(pool,job,key)};}
  catch(error){
    if(error instanceof LostClaim||lost)return{id:job.id,status:'superseded'};
    const status=error.permanent||job.attempts>=MAX_ATTEMPTS?'failed':'pending';
    const safeMessage=/^(Zoom download failed \(\d+\)|Size mismatch|Zoom returned an empty recording|Stored object size|Zoom download stalled)/.test(error.message||'')?error.message.slice(0,300):String(error.name||'Error').slice(0,100);
    const result=await pool.query(`UPDATE zoom_recording_imports SET status=$3,last_error=$4,locked_until=NULL,claim_token=NULL,
      next_attempt_at=NOW()+$5*INTERVAL '1 millisecond',updated_at=NOW() WHERE ${ownedSql}`,[job.id,job.claim_token,status,safeMessage,status==='failed'?0:RETRY_DELAYS_MS[Math.min(job.attempts-1,4)]]);
    recordingLog('import_retry',{importId:job.id,status:result.rowCount?status:'superseded',error:safeMessage});
    return{id:job.id,status:result.rowCount?status:'superseded'};
  }finally{clearInterval(timer);controller.abort();}
}

export async function requestRecordingDeletion(pool,importId,adminId) {
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows:[row]}=await client.query("SELECT * FROM zoom_recording_imports WHERE id=$1 AND status IN ('needs_review','failed') FOR UPDATE",[importId]);
    if(!row)throw new Error('Seuls les segments non publiés peuvent être supprimés.');
    if(row.delete_requested_at){await client.query('COMMIT');return;}
    const refs=await client.query('SELECT 1 FROM live_sessions WHERE replay_url=$1 LIMIT 1',[row.object_key]);
    const shared=await client.query("SELECT 1 FROM zoom_recording_imports WHERE object_key=$1 AND id<>$2 AND status<>'discarded' LIMIT 1",[row.object_key,importId]);
    if(refs.rowCount||shared.rowCount)throw new Error('Ce fichier est encore utilisé par un replay.');
    await client.query(`INSERT INTO zoom_recording_deletions(import_id,requested_by) VALUES($1,$2)
      ON CONFLICT(import_id) DO UPDATE SET requested_by=$2,requested_at=NOW(),purge_after=NOW()+INTERVAL '48 hours',
      restored_at=NULL,restored_by=NULL,completed_at=NULL,attempts=0,last_error=NULL,next_attempt_at=NOW()`,[importId,adminId]);
    await client.query("INSERT INTO zoom_recording_deletion_events(import_id,action,actor_id) VALUES($1,'requested',$2)",[importId,adminId]);
    await client.query('UPDATE zoom_recording_imports SET delete_requested_at=COALESCE(delete_requested_at,NOW()) WHERE id=$1',[importId]);
    await client.query('COMMIT');recordingLog('deletion_requested',{importId,adminId});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export async function restoreRecording(pool,importId,adminId) {
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows:[row]}=await client.query(`SELECT r.status,r.delete_requested_at,d.completed_at,d.restored_at
      FROM zoom_recording_imports r JOIN zoom_recording_deletions d ON d.import_id=r.id WHERE r.id=$1 FOR UPDATE OF r,d`,[importId]);
    if(row?.restored_at&&!row.delete_requested_at){await client.query('COMMIT');return;}
    if(!row||row.completed_at||!row.delete_requested_at||!['needs_review','failed'].includes(row.status))throw new Error('Restauration indisponible');
    await client.query('UPDATE zoom_recording_imports SET delete_requested_at=NULL,updated_at=NOW() WHERE id=$1',[importId]);
    await client.query('UPDATE zoom_recording_deletions SET restored_at=NOW(),restored_by=$2 WHERE import_id=$1',[importId,adminId]);
    await client.query("INSERT INTO zoom_recording_deletion_events(import_id,action,actor_id) VALUES($1,'restored',$2)",[importId,adminId]);
    await client.query('COMMIT');recordingLog('restored',{importId,adminId});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export async function processNextDeletion(pool,storage) {
  const client=await pool.connect();let importId;
  try {
    await client.query('BEGIN');
    const {rows:[row]}=await client.query(`SELECT d.import_id,r.object_key,r.multipart_upload_id FROM zoom_recording_deletions d JOIN zoom_recording_imports r ON r.id=d.import_id
      WHERE d.completed_at IS NULL AND d.restored_at IS NULL AND d.attempts<6 AND d.purge_after<=NOW() AND d.next_attempt_at<=NOW()
        AND r.status IN ('needs_review','failed') AND r.delete_requested_at IS NOT NULL
      ORDER BY d.requested_at FOR UPDATE OF r,d SKIP LOCKED LIMIT 1`);
    if(!row){await client.query('ROLLBACK');return null;}importId=row.import_id;
    // The intent was committed separately. If deletion succeeds but this transaction fails,
    // retrying the same private key is safe and publication remains blocked.
    const references=await client.query('SELECT 1 FROM live_sessions WHERE replay_url=$1 LIMIT 1',[row.object_key]);
    if(references.rowCount)throw new Error('ReferencedObject');
    const {rows:attempts}=await client.query('SELECT object_key,multipart_upload_id FROM zoom_recording_transfers WHERE import_id=$1',[importId]);
    const keys=new Set([row.object_key,...attempts.map(item=>item.object_key)].filter(Boolean));
    if(row.multipart_upload_id&&row.object_key)await abortUpload(storage,row.object_key,row.multipart_upload_id);
    for(const attempt of attempts)if(attempt.multipart_upload_id)await abortUpload(storage,attempt.object_key,attempt.multipart_upload_id);
    for(const key of keys){
      const used=await client.query("SELECT 1 FROM live_sessions WHERE replay_url=$1 UNION ALL SELECT 1 FROM zoom_recording_imports WHERE object_key=$1 AND id<>$2 AND status<>'discarded' LIMIT 1",[key,importId]);
      if(used.rowCount)throw new Error('ReferencedObject');
      if(key.startsWith('live-replays/'))await storage.delete(key);
    }
    await client.query("UPDATE zoom_recording_imports SET status='discarded',multipart_upload_id=NULL WHERE id=$1",[importId]);
    await client.query('UPDATE zoom_recording_deletions SET completed_at=NOW(),attempts=attempts+1,last_error=NULL WHERE import_id=$1',[importId]);
    await client.query("INSERT INTO zoom_recording_deletion_events(import_id,action) VALUES($1,'purged')",[importId]);
    await client.query('COMMIT');recordingLog('deletion_completed',{importId});return {id:importId};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});if(importId)await pool.query("UPDATE zoom_recording_deletions SET attempts=attempts+1,last_error=$2,next_attempt_at=NOW()+INTERVAL '1 minute' WHERE import_id=$1",[importId,String(error.name||'Error')]).catch(()=>{});throw error;}
  finally{client.release();}
}

export function createRecordingWorker(pool,deps,{intervalMs=30000,enabled=()=>true}={}) {
  let running=false,timer=null;
  const drain=async()=>{
    if(running||!enabled())return;running=true;
    try{
      try{while(enabled() && await processNextDeletion(pool,deps.storage));}
      catch(error){recordingLog('deletion_retry',{error:error.code||error.name});}
      while(enabled() && await processNextRecording(pool,deps));
    }
    catch(error){recordingLog('worker_error',{error:error.code||error.name});}finally{running=false;}
  };
  return {kick:()=>{void drain();},start(){if(!timer){timer=setInterval(drain,intervalMs);timer.unref?.();void drain();}},stop(){clearInterval(timer);timer=null;},isRunning:()=>Boolean(timer),drain};
}
