// Live-session features that depend on held migrations. Until the owner applies
// them, the existing behavior is kept and the new options stay unavailable.
import { setExtendedLiveAccess, setFreeSessionAccess, setMultiLiveAccess } from "../utils/offerAccess.js";

export const liveFeatures = { extendedAccess: false, recordingsTable: false, multiAudience: false, freeSessions: false };
export let recordingSchemaState = 'unavailable';
export function recordingDiagnostics(workerRunning = false) {
  const required = ['ZOOM_ACCOUNT_ID','ZOOM_CLIENT_ID','ZOOM_CLIENT_SECRET','ZOOM_WEBHOOK_SECRET_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID','R2_ACCESS_KEY','R2_SECRET_KEY','R2_BUCKET'];
  const missingConfiguration = required.filter(name => !process.env[name]?.trim());
  const enabled = process.env.ZOOM_RECORDING_IMPORT_ENABLED === 'true';
  const status = recordingSchemaState !== 'ready' ? recordingSchemaState : !enabled ? 'disabled' :
    missingConfiguration.length ? 'missing_configuration' : !workerRunning ? 'worker_not_running' : 'ready';
  return { status, schema:recordingSchemaState, enabled, workerRunning, missingConfiguration };
}

export function recordingImportsEnabled() {
  return liveFeatures.recordingsTable && recordingSchemaState === 'ready' && process.env.ZOOM_RECORDING_IMPORT_ENABLED === "true";
}

export async function detectLiveFeatures(pool) {
  recordingSchemaState = 'unavailable';
  const { rows: [row] } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'live_sessions'
          AND column_name IN ('additional_offer_ids', 'granted_student_ids'))::int AS access_columns,
       to_regclass('zoom_recording_imports') IS NOT NULL AS recordings_table,
       to_regclass('live_session_courses') IS NOT NULL AND to_regclass('live_session_offers') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
         AND table_name='live_sessions' AND column_name='access_policy') AS multi_audience,
       to_regclass('free_session_participants') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema=current_schema() AND table_name='live_sessions' AND column_name='free_session_id') AS free_sessions`
  );
  liveFeatures.extendedAccess = row.access_columns === 2;
  liveFeatures.recordingsTable = Boolean(row.recordings_table);
  recordingSchemaState = 'missing_migration';
  if (liveFeatures.recordingsTable) {
    const required = {
      zoom_recording_imports:['id','zoom_meeting_id','zoom_meeting_uuid','zoom_file_id','recording_type','recording_start','recording_end','file_size','download_url','live_session_id','review_reason','object_key','multipart_upload_id','bytes_transferred','status','attempts','next_attempt_at','locked_until','last_error','created_at','updated_at','claim_token','delete_requested_at'],
      zoom_recording_occurrences:['occurrence_uuid','meeting_id','live_session_id','resolution','resolved_by','resolved_at','created_at'],
      zoom_recording_transfers:['token','import_id','object_key','multipart_upload_id','expected_size','completed_at','created_at'],
      zoom_recording_deletions:['import_id','requested_by','requested_at','completed_at','attempts','next_attempt_at','last_error','purge_after','restored_at','restored_by'],
      zoom_recording_deletion_events:['id','import_id','action','actor_id','created_at'],
    };
    const { rows:columns } = await pool.query('SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',[Object.keys(required)]);
    const present = new Set(columns.map(item=>`${item.table_name}.${item.column_name}`));
    const missingTable = Object.keys(required).some(table=>!columns.some(item=>item.table_name===table));
    const complete = Object.entries(required).every(([table,names])=>names.every(name=>present.has(`${table}.${name}`)));
    const {rows:indexes}=await pool.query(`SELECT c.relname AS table_name,a.attname AS column_name
      FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=i.indkey[0]
      WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND i.indisunique AND i.indisvalid
        AND i.indnkeyatts=1 AND i.indpred IS NULL`,[Object.keys(required)]);
    const unique = new Set(indexes.map(item=>`${item.table_name}.${item.column_name}`));
    const validIndexes=['zoom_recording_imports.id','zoom_recording_imports.zoom_file_id','zoom_recording_occurrences.occurrence_uuid',
      'zoom_recording_transfers.token','zoom_recording_transfers.object_key','zoom_recording_deletions.import_id'].every(key=>unique.has(key));
    const validTypes=columns.every(item=>{
      const key=`${item.table_name}.${item.column_name}`;
      if(['zoom_recording_imports.id','zoom_recording_imports.claim_token','zoom_recording_transfers.token','zoom_recording_transfers.import_id','zoom_recording_deletions.import_id'].includes(key))return item.udt_name==='uuid';
      if(item.column_name==='live_session_id'||item.column_name==='resolved_by'||item.column_name==='requested_by')return item.udt_name==='uuid';
      if(['delete_requested_at','locked_until','completed_at','recording_start','recording_end','next_attempt_at'].includes(item.column_name))return item.udt_name==='timestamptz';
      return true;
    });
    recordingSchemaState = missingTable ? 'missing_migration' : complete && validIndexes && validTypes ? 'ready' : 'invalid_schema';
  }
  setExtendedLiveAccess(liveFeatures.extendedAccess);
  liveFeatures.multiAudience = liveFeatures.extendedAccess && Boolean(row.multi_audience);
  setMultiLiveAccess(liveFeatures.multiAudience);
  liveFeatures.freeSessions = Boolean(row.free_sessions);
  setFreeSessionAccess(liveFeatures.freeSessions);
  return { ...liveFeatures };
}
