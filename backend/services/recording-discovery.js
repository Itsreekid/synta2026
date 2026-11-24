// On demand ONLY. Nothing schedules this service or scans Zoom periodically.
import { selectRecordingSegments } from './zoom-recordings.js';

export function createRecordingDiscovery({pool,recordings,instances}) {
  const inFlight=new Map(),cache=new Map();
  async function discover(session,requestedUuid){
    let uuid=requestedUuid;
    if(!uuid){
      const {rows:known}=await pool.query(`SELECT o.occurrence_uuid AS uuid,MIN(r.recording_start) AS start_time
        FROM zoom_recording_occurrences o LEFT JOIN zoom_recording_imports r ON r.zoom_meeting_uuid=o.occurrence_uuid
        WHERE o.live_session_id=$1 AND o.resolution<>'legacy_conflict' GROUP BY o.occurrence_uuid`,[session.id]);
      const choices=known.length?known:await instances(session.zoom_meeting_id);
      if(!choices.length)return {state:'empty',message:'Aucun enregistrement disponible sur Zoom.',files:[]};
      if(choices.length>1)return {state:'choose_occurrence',message:'Plusieurs occurrences trouvées. Veuillez sélectionner la séance correspondante.',
        occurrences:choices.map(item=>({uuid:item.uuid,start:item.start_time})),files:[]};
      uuid=choices[0].uuid;
    }
    let data;
    try{data=await recordings(uuid);}catch(error){if(error.status===404)return{state:'empty',occurrenceUuid:uuid,message:'Aucun enregistrement disponible sur Zoom.',files:[]};throw error;}
    if(data.uuid!==uuid||String(data.id)!==session.zoom_meeting_id){const error=new Error('Occurrence mismatch');error.status=409;throw error;}
    const {rows:known}=await pool.query('SELECT id,zoom_file_id,status,delete_requested_at FROM zoom_recording_imports WHERE zoom_meeting_uuid=$1',[uuid]);
    const files=selectRecordingSegments(data.recording_files).map(file=>{
      const row=known.find(item=>item.zoom_file_id===String(file.id));
      return {id:String(file.id),start:file.recording_start,end:file.recording_end||null,
        durationSeconds:file.recording_end?Math.max(0,Math.round((Date.parse(file.recording_end)-Date.parse(file.recording_start))/1000)):null,
        size:Number(file.file_size)||null,type:file.recording_type||null,importId:row?.id||null,
        status:row?.delete_requested_at||row?.status==='discarded'?'deleted':row?.status||'available'};
    });
    const pending=(data.recording_files||[]).some(file=>String(file.file_type).toUpperCase()==='MP4'&&file.status&&file.status!=='completed');
    const available=files.filter(file=>file.status==='available').length;
    const state=available?'available':files.some(file=>file.status==='deleted')?'trash':files.length?'imported':pending?'processing':'empty';
    const message={available:`${available} segment${available>1?'s':''} disponible${available>1?'s':''}.`,trash:'Des segments sont dans la Corbeille. Restaurez-les depuis la Corbeille.',
      imported:'Tous les segments sont déjà importés.',processing:'L’enregistrement est encore en cours de traitement.',empty:'Aucun enregistrement disponible sur Zoom.'}[state];
    return {occurrenceUuid:uuid,state,message,files};
  }
  return {
    // Coalesce double clicks/cross-admin searches and cache briefly to bound Zoom calls.
    search(session,uuid){
      const key=session.id+':'+(uuid||'auto');const now=Date.now();
      for(const [id,item]of cache)if(item.until<now)cache.delete(id);
      if(cache.has(key))return Promise.resolve(cache.get(key).value);
      if(inFlight.has(key))return inFlight.get(key);
      const work=discover(session,uuid).then(value=>{cache.set(key,{until:Date.now()+15000,value});return value;}).finally(()=>inFlight.delete(key));
      inFlight.set(key,work);return work;
    },
    invalidate(sessionId){for(const key of cache.keys())if(key.startsWith(sessionId+':'))cache.delete(key);},
  };
}
