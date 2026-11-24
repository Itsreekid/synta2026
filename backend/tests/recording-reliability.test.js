import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import vm from 'node:vm';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { queueRecordingEvent,processNextRecording,createRecordingWorker } from '../services/zoom-recordings.js';
import { settleRecording,resolveOccurrence,requestRecordingDeletion,restoreRecording,processNextDeletion } from '../services/recording-jobs.js';
import { createRecordingDiscovery } from '../services/recording-discovery.js';
import { validatedDestination,isPublicAddress,downloadRecording } from '../utils/recording-download.js';
import { detectLiveFeatures,recordingDiagnostics,recordingImportsEnabled } from '../services/live-features.js';

test('recording destinations reject private, mixed-DNS, credential and non-HTTPS addresses',async()=>{
  for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','172.16.0.1','192.168.1.2','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('8.8.8.8'),true);
  for(const url of ['http://zoom.us/a','https://127.0.0.1/a','https://[::1]/a','https://u:p@zoom.us/a','https://zoom.us:8443/a'])await assert.rejects(validatedDestination(url));
  await assert.rejects(validatedDestination('https://cdn.example.invalid',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]));
  assert.equal((await validatedDestination('https://cdn.example.invalid',async()=>[{address:'8.8.8.8',family:4}])).address.address,'8.8.8.8');
});

test('every redirect is DNS-validated and pinned, and OAuth never reaches storage',async()=>{
  const calls=[];
  const requestFn=(url,options,callback)=>{
    calls.push({url,options});const req=new EventEmitter();req.setTimeout=()=>{};
    req.end=()=>{const response=Readable.from([Buffer.from('mp4!')]);response.statusCode=calls.length===1?302:200;response.headers=calls.length===1?{location:'https://cdn.example.invalid/video'}:{};callback(response);};
    return req;
  };
  const lookupFn=async()=>[{address:'8.8.8.8',family:4}];
  const response=await downloadRecording('https://zoom.us/file','synthetic',undefined,{lookupFn,requestFn});
  assert.equal(await response.text(),'mp4!');assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic');assert.equal(calls[1].options.headers.Authorization,undefined);
  calls[1].options.lookup('cdn.example.invalid',{},(_error,address)=>assert.equal(address,'8.8.8.8'));
  calls.length=0;
  await assert.rejects(downloadRecording('https://zoom.us/file','synthetic',undefined,{
    requestFn,lookupFn:async host=>[{address:host==='zoom.us'?'8.8.8.8':'127.0.0.1',family:4}],
  }),/Unsafe recording address/);
  assert.equal(calls.length,1,'private redirect never gets an HTTP request');
});

test('Zoom metadata uses exact encoded occurrence UUID and rejects latest-meeting substitution',async()=>{
  const urls=[],uuid='/exact//occurrence==';let returnedUuid=uuid;
  const context=vm.createContext({console,Buffer,AbortSignal,process:{env:{ZOOM_ACCOUNT_ID:'synthetic',ZOOM_CLIENT_ID:'synthetic',ZOOM_CLIENT_SECRET:'synthetic'}},
    fetch:async url=>{urls.push(url);return{ok:true,json:async()=>url.includes('/oauth/token')?{access_token:'synthetic',expires_in:3600}:{uuid:returnedUuid,id:123,recording_files:[]}};}});
  const module=new vm.SourceTextModule(await readFile(new URL('../utils/zoomClient.js',import.meta.url),'utf8'),{context});
  await module.link(()=>new vm.SyntheticModule(['downloadRecording'],function(){this.setExport('downloadRecording',async()=>{});},{context}));await module.evaluate();
  await module.namespace.getZoomOccurrenceRecordings(uuid);
  assert.equal(urls.at(-1),'https://api.zoom.us/v2/meetings/'+encodeURIComponent(encodeURIComponent(uuid))+'/recordings');
  await assert.rejects(module.namespace.getZoomOccurrenceRecordings('123456789'),/Invalid occurrence/);
  returnedUuid='other';await assert.rejects(module.namespace.getZoomOccurrenceRecordings(uuid),/mismatch/);
});
test('manual past-instance discovery honors Zoom Retry-After without polling',async()=>{
  let calls=0;
  const context=vm.createContext({console,Buffer,AbortSignal,process:{env:{ZOOM_ACCOUNT_ID:'synthetic',ZOOM_CLIENT_ID:'synthetic',ZOOM_CLIENT_SECRET:'synthetic'}},
    fetch:async url=>{calls++;return url.includes('/oauth/token')?{ok:true,json:async()=>({access_token:'synthetic',expires_in:3600})}:{ok:false,status:429,headers:{get:()=> '120'}};}});
  const module=new vm.SourceTextModule(await readFile(new URL('../utils/zoomClient.js',import.meta.url),'utf8'),{context});
  await module.link(()=>new vm.SyntheticModule(['downloadRecording'],function(){this.setExport('downloadRecording',async()=>{});},{context}));await module.evaluate();
  await assert.rejects(module.namespace.getZoomPastInstances('123'),error=>error.status===429);
  const first=calls;await assert.rejects(module.namespace.getZoomPastInstances('123'),error=>error.status===429);assert.equal(calls,first);
  await assert.rejects(module.namespace.getZoomOccurrenceRecordings('an-exact-uuid'),error=>error.status===429);assert.equal(calls,first);
});

function storageFixture(){
  const objects=new Map(),uploads=new Map();let calls=0;
  return {objects,uploads,
    createMultipart:async key=>{const id=randomUUID();uploads.set(id,{key,parts:[]});return id;},
    uploadPart:async(key,id,n,body)=>{uploads.get(id).parts[n-1]=Buffer.from(body);return 'etag-'+n;},
    completeMultipart:async(key,id)=>{objects.set(key,Buffer.concat(uploads.get(id).parts));uploads.delete(id);},
    abortMultipart:async(key,id)=>{uploads.delete(id);},
    head:async key=>objects.has(key)?{ContentLength:objects.get(key).length}:null,
    delete:async key=>{calls++;objects.delete(key);},get deletes(){return calls;},
  };
}
const event=(meeting,uuid,id,start='2030-01-01T18:00:00Z')=>({object:{id:meeting,uuid,start_time:start,recording_files:[{id,file_type:'MP4',status:'completed',recording_start:start,recording_end:'2030-01-01T19:00:00Z',file_size:4,download_url:'https://zoom.us/'+id}]}});
const gate=()=>{let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};};

test('on-demand discovery resolves old instances, coalesces requests and keeps trash separate',async()=>{
  let instanceCalls=0,recordingCalls=0;let bound=[],known=[],choices=[{uuid:'old-uuid',start_time:'2020-10-01T18:00:00Z'}];let files=[event('123','old-uuid','file').object.recording_files[0]];
  const service=createRecordingDiscovery({pool:{query:async sql=>({rows:sql.includes('FROM zoom_recording_occurrences')?bound:known})},
    instances:async()=>{instanceCalls++;return choices;},recordings:async uuid=>{recordingCalls++;return{id:123,uuid,recording_files:files};}});
  const session={id:'session',zoom_meeting_id:'123'};
  assert.equal(instanceCalls,0,'no API calls without a user-triggered search');
  const [a,b]=await Promise.all([service.search(session),service.search(session)]);assert.deepEqual(a,b);assert.equal(instanceCalls,1);assert.equal(recordingCalls,1);assert.equal(a.message,'1 segment disponible.');
  service.invalidate(session.id);choices.push({uuid:'another-uuid',start_time:'2020-10-08T18:00:00Z'});
  assert.equal((await service.search(session)).state,'choose_occurrence');assert.equal(recordingCalls,1,'ambiguous search must not guess an occurrence');
  service.invalidate(session.id);bound=[{uuid:'old-uuid'}];known=[{id:'saved',zoom_file_id:'file',status:'needs_review',delete_requested_at:new Date()}];
  assert.equal((await service.search(session)).files[0].status,'deleted');assert.equal(instanceCalls,2,'known UUID avoids an instance scan');
  service.invalidate(session.id);known=[{zoom_file_id:'file',status:'published'}];assert.equal((await service.search(session)).message,'Tous les segments sont déjà importés.');
  service.invalidate(session.id);known=[];files[0].status='processing';assert.equal((await service.search(session)).message,'L’enregistrement est encore en cours de traitement.');
  service.invalidate(session.id);files=[];assert.equal((await service.search(session)).message,'Aucun enregistrement disponible sur Zoom.');
});

test('recording reliability on disposable PostgreSQL',{skip:!process.env.BUGI_QA_POSTGRES_PORT,timeout:120000},async t=>{
  const config={host:'127.0.0.1',port:Number(process.env.BUGI_QA_POSTGRES_PORT),user:'bugi_qa',password:'bugi-synthetic-local-only',ssl:false};
  const name='recording_fence_'+randomUUID().replaceAll('-','');const maintenance=new pg.Pool({...config,database:'postgres'});let db;
  const storage=storageFixture();const zoom={download:async()=>new Response(Buffer.from('mp4!'))};const deps={storage,zoom};
  let sequence=0;
  try{
    await maintenance.query(`CREATE DATABASE "${name}"`);db=new pg.Pool({...config,database:name});
    await db.query(await readFile(new URL('../../database/schema_postgres.sql',import.meta.url),'utf8'));
    for(const file of ['202611200003_create_zoom_recording_imports.sql','202611240001_zoom_recording_reliability.sql','202611240002_recording_trash_retention.sql']){
      const sql=await readFile(new URL('../../database/migrations/'+file,import.meta.url),'utf8');await db.query(sql);await db.query(sql);
      if(file==='202611200003_create_zoom_recording_imports.sql'){
        await detectLiveFeatures(db);assert.equal(recordingDiagnostics().status,'missing_migration');
      }
    }
    const course=(await db.query("INSERT INTO courses(title) VALUES('Synthetic') RETURNING id")).rows[0].id;
    const admin=(await db.query("INSERT INTO users(email,password_hash,name,role) VALUES('admin@example.invalid','synthetic','Synthetic','admin') RETURNING id")).rows[0].id;
    const session=async(meeting,start='2030-01-01T18:00:00Z')=>(await db.query("INSERT INTO live_sessions(course_id,title,zoom_meeting_id,scheduled_at,duration_minutes,status) VALUES($1,'Synthetic',$2,$3,90,'scheduled') RETURNING id",[course,meeting,start])).rows[0].id;
    const row=async id=>(await db.query('SELECT * FROM zoom_recording_imports WHERE zoom_file_id=$1',[id])).rows[0];
    const prepare=async()=>{const meeting='m-'+ ++sequence;const sid=await session(meeting);const data=event(meeting,'uuid-'+meeting,'file-'+meeting);await queueRecordingEvent(db,data);return{sid,data,id:data.object.recording_files[0].id};};

    await t.test('additive migration preserves published legacy keys and conflicting session associations',async()=>{
      const a=await session('legacy'),b=await session('legacy');
      await db.query("UPDATE live_sessions SET replay_url='live-replays/legacy-original.mp4' WHERE id=$1",[a]);
      for(const [id,uuid,sid,key] of [['legacy-one','legacy-uuid',a,'live-replays/legacy-original.mp4'],['conflict-a','legacy-conflict',a,'live-replays/a.mp4'],['conflict-b','legacy-conflict',b,'live-replays/b.mp4']]){
        await db.query("INSERT INTO zoom_recording_imports(zoom_meeting_id,zoom_meeting_uuid,zoom_file_id,recording_start,download_url,live_session_id,status,object_key) VALUES('legacy',$1,$2,NOW(),'https://zoom.us/file',$3,'published',$4)",[uuid,id,sid,key]);
      }
      const migration=await readFile(new URL('../../database/migrations/202611240001_zoom_recording_reliability.sql',import.meta.url),'utf8');await db.query(migration);
      assert.equal((await db.query("SELECT live_session_id FROM zoom_recording_occurrences WHERE occurrence_uuid='legacy-uuid'")).rows[0].live_session_id,a);
      assert.equal((await db.query("SELECT resolution FROM zoom_recording_occurrences WHERE occurrence_uuid='legacy-conflict'")).rows[0].resolution,'legacy_conflict');
      assert.equal((await row('conflict-a')).live_session_id,a);assert.equal((await row('conflict-b')).live_session_id,b);
      assert.equal((await row('legacy-one')).status,'published');assert.equal((await row('legacy-one')).object_key,'live-replays/legacy-original.mp4');
      assert.equal((await db.query('SELECT replay_url FROM live_sessions WHERE id=$1',[a])).rows[0].replay_url,'live-replays/legacy-original.mp4');
    });

    await t.test('UUID binding survives rescheduling and separates reusable meeting occurrences',async()=>{
      const first=await session('recurring');const second=await session('recurring','2030-01-08T18:00:00Z');
      await queueRecordingEvent(db,event('recurring','occurrence-1','first'));
      await db.query("UPDATE live_sessions SET scheduled_at='2030-03-01' WHERE id=$1",[first]);
      await queueRecordingEvent(db,event('recurring','occurrence-1','late-first','2030-01-08T18:00:00Z'));
      await queueRecordingEvent(db,event('recurring','occurrence-2','second','2030-01-08T18:00:00Z'));
      assert.equal((await row('late-first')).live_session_id,first);assert.equal((await row('second')).live_session_id,second);
      while(await processNextRecording(db,deps));
      assert.equal((await db.query('SELECT replay_url FROM live_sessions WHERE id=$1',[first])).rows[0].replay_url,null);
    });
    await t.test('ambiguous occurrence requires explicit resolution without changing existing associations',async()=>{
      const first=await session('ambiguous');await session('ambiguous');await queueRecordingEvent(db,event('ambiguous','occ-ambiguous','ambiguous-file'));
      assert.equal((await row('ambiguous-file')).live_session_id,null);
      await resolveOccurrence(db,'occ-ambiguous',first,admin);assert.equal((await row('ambiguous-file')).live_session_id,first);
      await assert.rejects(resolveOccurrence(db,'occ-ambiguous',await session('different'),admin));
      await processNextRecording(db,deps);
    });
    await t.test('all event segments roll back together if one insert fails',async()=>{
      const meeting='atomic';await session(meeting);const data=event(meeting,'occ-atomic','atomic-good');
      data.object.recording_files.push({...data.object.recording_files[0],id:'atomic-bad',recording_start:'2030-01-01T18:20:00Z',recording_end:'bad-date'});
      await assert.rejects(queueRecordingEvent(db,data));
      assert.equal((await db.query("SELECT COUNT(*)::int n FROM zoom_recording_imports WHERE zoom_meeting_id='atomic'")).rows[0].n,0);
    });
    await t.test('concurrent webhook intake and workers preserve late segments and duplicate IDs',async()=>{
      const {data,id}=await prepare();const late=structuredClone(data);late.object.recording_files.push({...data.object.recording_files[0],id:id+'-late',recording_start:'2030-01-01T18:30:00Z'});
      await Promise.all([queueRecordingEvent(db,late),queueRecordingEvent(db,late),processNextRecording(db,deps)]);
      while(await processNextRecording(db,deps));
      assert.equal((await db.query('SELECT COUNT(*)::int n FROM zoom_recording_imports WHERE zoom_meeting_uuid=$1',[data.object.uuid])).rows[0].n,2);
      assert.equal((await row(id+'-late')).status,'needs_review');
    });
    await t.test('expired concurrent worker cannot settle or overwrite a reclaimed claim object',async()=>{
      const {id}=await prepare();const entered=gate(),resume=gate();let held=false;
      const slow={...storage,uploadPart:async(...args)=>{if(!held){held=true;entered.release();await resume.promise;}return storage.uploadPart(...args);}};
      const stale=processNextRecording(db,{...deps,storage:slow});await entered.promise;
      const old=await row(id);await db.query("UPDATE zoom_recording_imports SET locked_until=NOW()-INTERVAL '1 second' WHERE id=$1",[old.id]);
      const current=await processNextRecording(db,deps);assert.equal(current.status,'needs_review');const stable=await row(id);
      resume.release();assert.equal((await stale).status,'superseded');
      assert.equal((await row(id)).status,'needs_review','stale failure handling must not change the reclaimed result');
      assert.equal((await row(id)).object_key,stable.object_key);assert.equal(storage.objects.get(stable.object_key).toString(),'mp4!');
      await assert.rejects(settleRecording(db,old,'live-replays/stale.mp4'),/ownership lost/);
      assert.equal((await row(id)).object_key,stable.object_key);
    });
    await t.test('completed upload before DB settlement is recovered without downloading again',async()=>{
      const {id}=await prepare();const job=await row(id);const token=randomUUID(),key='live-replays/reconciled-'+token+'.mp4';storage.objects.set(key,Buffer.from('mp4!'));
      await db.query('INSERT INTO zoom_recording_transfers(token,import_id,object_key,expected_size) VALUES($1,$2,$3,4)',[token,job.id,key]);
      const result=await processNextRecording(db,{storage,zoom:{download:async()=>{throw new Error('Must not download');}}});
      assert.equal(result.status,'needs_review');assert.equal((await row(id)).object_key,key);
    });
    await t.test('lease renews during slow R2 upload before any part completes',async()=>{
      await prepare();const entered=gate(),resume=gate();let heartbeats=0;
      const observed={connect:db.connect.bind(db),query:(sql,args)=>{if(sql.startsWith('UPDATE zoom_recording_imports SET locked_until='))heartbeats++;return db.query(sql,args);}};
      const slow={...storage,uploadPart:async(...args)=>{entered.release();await resume.promise;return storage.uploadPart(...args);}};
      const work=processNextRecording(observed,{...deps,storage:slow},{heartbeatMs:10});await entered.promise;const before=heartbeats;
      try{for(let i=0;i<50&&heartbeats<before+2;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(heartbeats>=before+2);}
      finally{resume.release();}
      assert.equal((await work).status,'needs_review');
    });
    await t.test('expired download URL refreshes exact occurrence metadata and keeps same file ID',async()=>{
      const {id,data}=await prepare();let refreshed=0;
      const result=await processNextRecording(db,{storage,zoom:{download:async url=>url.endsWith('/fresh')?new Response('mp4!'):new Response(null,{status:403}),recordings:async uuid=>{assert.equal(uuid,data.object.uuid);refreshed++;return{recording_files:[{id,download_url:'https://zoom.us/fresh',status:'completed'}]};}}});
      assert.equal(result.status,'needs_review');assert.equal(refreshed,1);assert.equal((await row(id)).download_url,'https://zoom.us/fresh');
    });
    await t.test('deletion intent survives R2 success followed by database failure',async()=>{
      const {id}=await prepare();await processNextRecording(db,deps);const job=await row(id);await requestRecordingDeletion(db,job.id,admin);
      let fail=true;
      const failingPool={query:db.query.bind(db),connect:async()=>{const client=await db.connect();return{release:()=>client.release(),query:(sql,args)=>{if(fail&&sql.startsWith('UPDATE zoom_recording_deletions SET completed_at')){fail=false;throw new Error('Synthetic DB outage');}return client.query(sql,args);}};}};
      await db.query("UPDATE zoom_recording_deletions SET requested_at=NOW()-INTERVAL '49 hours',purge_after=NOW()-INTERVAL '1 hour' WHERE import_id=$1",[job.id]);
      await assert.rejects(processNextDeletion(failingPool,storage));assert.equal(storage.objects.has(job.object_key),false);
      assert.ok((await row(id)).delete_requested_at);assert.equal((await row(id)).status,'needs_review');
      await db.query('UPDATE zoom_recording_deletions SET requested_at=NOW()-make_interval(hours=>49),purge_after=NOW()-make_interval(hours=>1),next_attempt_at=NOW() WHERE import_id=$1',[job.id]);
      await processNextDeletion(db,storage);assert.equal((await row(id)).status,'discarded');
      await assert.rejects(restoreRecording(db,job.id,admin));
      assert.equal((await queueRecordingEvent(db,event('m-'+sequence,'uuid-m-'+sequence,id))).queued,0,'deleted file stays deduplicated');
    });
    await t.test('Corbeille preserves objects for 48 hours and restores without download or publication',async()=>{
      const {id,data,sid}=await prepare();await processNextRecording(db,deps);const job=await row(id);const key=job.object_key;
      await requestRecordingDeletion(db,job.id,admin);await requestRecordingDeletion(db,job.id,admin);
      const intent=(await db.query('SELECT * FROM zoom_recording_deletions WHERE import_id=$1',[job.id])).rows[0];
      assert.ok(new Date(intent.purge_after)-new Date(intent.requested_at)>=48*3600000);
      await assert.rejects(db.query('UPDATE zoom_recording_deletions SET purge_after=requested_at WHERE import_id=$1',[job.id]));
      assert.equal(await processNextDeletion(db,storage),null);assert.ok(storage.objects.has(key));
      assert.equal((await queueRecordingEvent(db,data)).queued,0);assert.ok((await row(id)).delete_requested_at,'webhook never restores trash');
      await restoreRecording(db,job.id,admin);await restoreRecording(db,job.id,admin);
      assert.equal((await row(id)).object_key,key);assert.equal((await row(id)).status,'needs_review');assert.equal((await row(id)).delete_requested_at,null);
      assert.equal((await db.query('SELECT replay_url FROM live_sessions WHERE id=$1',[sid])).rows[0].replay_url,null);
      assert.deepEqual((await db.query('SELECT action FROM zoom_recording_deletion_events WHERE import_id=$1 ORDER BY created_at',[job.id])).rows.map(item=>item.action),['requested','restored']);
    });
    await t.test('feature diagnostics separate disabled, missing configuration, worker and invalid schema',async()=>{
      await detectLiveFeatures(db);const old={...process.env};
      try{
        process.env.ZOOM_RECORDING_IMPORT_ENABLED='false';assert.equal(recordingDiagnostics().status,'disabled');assert.equal(recordingImportsEnabled(),false);
        process.env.ZOOM_RECORDING_IMPORT_ENABLED='true';delete process.env.ZOOM_CLIENT_ID;assert.equal(recordingDiagnostics().status,'missing_configuration');
        for(const key of ['ZOOM_ACCOUNT_ID','ZOOM_CLIENT_ID','ZOOM_CLIENT_SECRET','ZOOM_WEBHOOK_SECRET_TOKEN','CLOUDFLARE_ACCOUNT_ID','R2_ACCESS_KEY','R2_SECRET_KEY','R2_BUCKET'])process.env[key]='synthetic';
        assert.equal(recordingDiagnostics().status,'worker_not_running');assert.equal(recordingDiagnostics(true).status,'ready');
        await db.query('ALTER TABLE zoom_recording_imports RENAME COLUMN claim_token TO incomplete_claim');await detectLiveFeatures(db);assert.equal(recordingDiagnostics().status,'invalid_schema');
        await db.query('ALTER TABLE zoom_recording_imports RENAME COLUMN incomplete_claim TO claim_token');await detectLiveFeatures(db);
      }finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
    });
    await t.test('disabled worker makes no claims and deletion outages do not block new imports',async()=>{
      const unwanted=await prepare();await processNextRecording(db,deps);await requestRecordingDeletion(db,(await row(unwanted.id)).id,admin);
      await db.query("UPDATE zoom_recording_deletions SET requested_at=NOW()-INTERVAL '49 hours',purge_after=NOW()-INTERVAL '1 hour' WHERE import_id=$1",[(await row(unwanted.id)).id]);
      const next=await prepare();
      await createRecordingWorker(db,deps,{enabled:()=>false}).drain();assert.equal((await row(next.id)).status,'pending');
      const worker=createRecordingWorker(db,{zoom,storage:{...storage,delete:async()=>{throw new Error('Synthetic R2 delete outage');}}});
      await worker.drain();assert.equal((await row(next.id)).status,'needs_review');assert.ok((await row(unwanted.id)).delete_requested_at);
      const intent=(await db.query('SELECT * FROM zoom_recording_deletions WHERE import_id=$1',[(await row(unwanted.id)).id])).rows[0];
      assert.equal(intent.completed_at,null);assert.ok(new Date(intent.next_attempt_at)>new Date());
    });
  }finally{await db?.end();await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH(FORCE)`);await maintenance.end();}
});
