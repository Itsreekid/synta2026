import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import express from 'express';

export async function createSessionManagerFixture() {
    const emptyId = randomUUID(), singleId = randomUUID(), multiId = randomUUID();
    const resourceId = randomUUID(), courseId = randomUUID(), offerId = randomUUID();
    const makeSession = (id, title) => ({ id, title, scheduled_at:'2026-01-01T18:00:00Z', duration_minutes:90,
        has_host_link:true,zoom_meeting_id:'synthetic-meeting',course_id:courseId,offer_id:offerId,
        course:{title:'Python'},resources:[],replay_url:null,granted_student_ids:[],invited_students:[] });
    const sessions = [makeSession(emptyId,'Séance sans replay'),makeSession(singleId,'Import automatique'),makeSession(multiId,'Révision · <b>synthetic</b>')];
    sessions[1].replay_url='live-replays/single.mp4';sessions[1].replay_source='zoom';sessions[1].replay_preview_url='/preview/single';
    sessions[2].resources=[{id:resourceId,title:'Exercice <b>texte</b>',file_name:'exercice.py',file_size:40,url:'/download/exercice.py'}];
    const makeRecording = (sessionId,status,index) => ({id:randomUUID(),live_session_id:sessionId,status,zoom_meeting_uuid:'occurrence-'+sessionId,
        recording_start:`2026-01-01T${18+index}:00:00Z`,recording_end:`2026-01-01T${18+index}:30:00Z`,file_size:1048576,
        preview_url:['needs_review','published'].includes(status)?'/preview/segment':null,attempts:0});
    const recordings=[makeRecording(singleId,'published',0),makeRecording(multiId,'needs_review',0),
        makeRecording(multiId,'needs_review',1),makeRecording(multiId,'failed',2),makeRecording(multiId,'pending',3),makeRecording(multiId,'importing',4)];
    const calls=[];
    let failRecordings=false;
    let failFeatures=false;
    let importStatus='ready';
    const app=express();app.use(express.json());
    app.use('/api', (req,res,next)=>{calls.push({method:req.method,path:req.path,body:req.body});next();});
    app.get('/api/live/admin/features',(req,res)=>failFeatures?res.sendStatus(503):res.json({recordings:true,extendedAccess:true,multiAudience:false,recordingDiagnostics:{status:importStatus}}));
    app.post('/api/live/admin/recordings/discover',(req,res)=>res.json({state:'available',message:'1 segment disponible.',occurrenceUuid:req.body.occurrenceUuid||'/exact//uuid==',files:[{id:'historical-file',start:'2020-10-01T18:00:00Z',durationSeconds:300,size:100,status:'available'}]}));
    app.post('/api/live/admin/recordings/recover',(req,res)=>res.json({success:true,queued:1}));
    app.get('/api/live/admin/recordings/trash',(req,res)=>res.json(recordings.filter(row=>row.live_session_id===req.query.sessionId&&row.delete_requested_at).map(row=>({...row,restorable:true,purge_after:new Date(Date.now()+48*3600000).toISOString()}))));
    app.post('/api/live/admin/recordings/:id/restore',(req,res)=>{recordings.find(row=>row.id===req.params.id).delete_requested_at=null;res.json({success:true});});
    app.get('/api/live/admin/sessions',(req,res)=>res.json(sessions));
    app.get('/api/live/admin/recordings',(req,res)=>failRecordings?res.status(503).json({error:'Synthetic outage'}):res.json(recordings.filter(row=>!row.delete_requested_at)));
    app.get('/api/admin/offers',(req,res)=>res.json({data:[{id:offerId,title:'Mensuel',fixed_price:60}]}));
    app.get('/api/admin/courses',(req,res)=>res.json({data:[{id:courseId,title:'Python'}]}));
    app.get('/api/live/admin/students',(req,res)=>res.json([]));
    app.post('/api/live/replays',(req,res)=>{
        const existing=sessions.find(item=>item.id===req.body.id);
        if(!existing)sessions.push({...makeSession(req.body.id,req.body.title),zoom_meeting_id:null,has_host_link:false,offer_id:null,course_id:req.body.courseId,scheduled_at:req.body.startTime,replay_url:req.body.replayUrl,replay_source:req.body.replayUrl?'external':null});
        res.status(existing?200:201).json({success:true,id:req.body.id});
    });
    app.patch('/api/live/:id/details',(req,res)=>{
        const session=sessions.find(item=>item.id===req.params.id);
        Object.assign(session,{title:req.body.title,scheduled_at:req.body.startTime,duration_minutes:req.body.durationMinutes,course_id:req.body.courseId,description:req.body.description});
        res.json({success:true});
    });
    app.post('/api/live/admin/recordings/publish',(req,res)=>{
        const chosen=recordings.filter(recording=>req.body.importIds.includes(recording.id)).sort((a,b)=>a.recording_start.localeCompare(b.recording_start));
        for(const recording of chosen)recording.status='published';
        const session=sessions.find(item=>item.id===req.body.sessionId);
        Object.assign(session,{replay_url:'live-replays/selected.mp4',replay_source:'zoom',replay_preview_url:'/preview/selected'});
        res.json({success:true,published:chosen.map(recording=>recording.id)});
    });
    app.post('/api/live/admin/recordings/:id/retry',(req,res)=>{recordings.find(item=>item.id===req.params.id).status='pending';res.json({success:true});});
    app.delete('/api/live/admin/recordings/:id',(req,res)=>{recordings.splice(recordings.findIndex(item=>item.id===req.params.id),1);res.json({success:true});});
    app.post('/api/live/:id/replay-upload-url',(req,res)=>res.json({uploadUrl:'/synthetic-put',key:`live-replays/${req.params.id}/manual.mp4`}));
    app.post('/api/admin/resources/upload-url',(req,res)=>res.json({uploadUrl:'/synthetic-put',key:`learning-resources/sessions/${req.body.liveSessionId}/new.py`}));
    app.put('/synthetic-put',express.raw({type:()=>true}),(req,res)=>res.sendStatus(200));
    app.post('/api/admin/resources',(req,res)=>{
        const resource={id:randomUUID(),title:req.body.title,file_name:req.body.fileName,file_size:req.body.size,url:'/download/new.py'};
        sessions.find(item=>item.id===req.body.liveSessionId).resources.push(resource);res.status(201).json({success:true,resource});
    });
    app.delete('/api/admin/resources/:id',(req,res)=>{for(const session of sessions)session.resources=session.resources.filter(item=>item.id!==req.params.id);res.json({success:true});});
    app.patch('/api/live/:id/replay',(req,res)=>{
        const session=sessions.find(item=>item.id===req.params.id);
        session.replay_url=req.body.replayKey||req.body.replayUrl;
        session.replay_source=req.body.replayKey?'upload':'external';session.replay_preview_url=session.replay_url;
        res.json({success:true,replay_url:session.replay_url});
    });
    app.delete('/api/live/:id',(req,res)=>{
        const index=sessions.findIndex(item=>item.id===req.params.id);
        if(index<0)return res.sendStatus(404);
        sessions.splice(index,1);res.json({success:true,cancelledIds:[req.params.id]});
    });
    app.use(express.static(fileURLToPath(new URL('../../public',import.meta.url))));
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    return {server,calls,sessions,recordings,emptyId,singleId,multiId,setRecordingsFailure(value){failRecordings=value;},setFeaturesFailure(value){failFeatures=value;},setImportStatus(value){importStatus=value;}};
}
