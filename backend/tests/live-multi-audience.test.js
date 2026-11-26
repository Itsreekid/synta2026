import { createRecordingDiscovery } from '../services/recording-discovery.js';
import * as recordingJobs from '../services/recording-jobs.js';
import * as recordingHelpers from '../services/zoom-recordings.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { once } from 'node:events';
import vm from 'node:vm';
import test from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import ejs from 'ejs';
import pg from 'pg';
import * as access from '../utils/offerAccess.js';
import * as features from '../services/live-features.js';
import * as learnerProfile from '../utils/learnerProfile.js';
import * as courseImages from '../utils/courseImages.js';
import * as onboarding from '../services/learner-onboarding.js';
import * as depositRequests from '../services/deposit-requests.js';
import { loginUrlFor } from '../utils/returnPath.js';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('OR session migration, API access and admin browser on disposable PostgreSQL', {
  skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 120000,
}, async t => {
  const connection = { host:'127.0.0.1',port:Number(process.env.BUGI_QA_POSTGRES_PORT),user:'bugi_qa',
    password:'bugi-synthetic-local-only',ssl:false };
  const name = 'live_multi_' + randomUUID().replaceAll('-','');
  const maintenance = new pg.Pool({...connection,database:'postgres'});
  let db, server;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'synthetic-live-multi-secret';
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
    db = new pg.Pool({...connection,database:name});
    await db.query(await readFile(new URL('../../database/schema_postgres.sql',import.meta.url),'utf8'));
    await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/migrate.js',import.meta.url))], {
      env:{...process.env,DATABASE_URL:`postgresql://bugi_qa:bugi-synthetic-local-only@127.0.0.1:${connection.port}/${name}`,DB_SSL:'false'},timeout:30000,
    });
    await Promise.all([1,2].map(()=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/migrate.js',import.meta.url))],{env:{...process.env,DATABASE_URL:`postgresql://bugi_qa:bugi-synthetic-local-only@127.0.0.1:${connection.port}/${name}`,DB_SSL:'false'},timeout:30000})));
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM schema_migrations WHERE filename='202611250001_notification_popup_acknowledgment.sql'")).rows[0].n,1);
    await t.test('migration failures roll back and destructive SQL is blocked before execution',async()=>{
      let sequence=0;
      for(const sql of ['CREATE TABLE popup_rollback_probe(id INT); SELECT 1/0;','DROP TABLE users;']){
        const filename='29990101000'+(++sequence)+'_failure_probe.sql';let done;const finished=new Promise(resolve=>done=resolve);const logs=[];
        const context=vm.createContext({console:{log(){},error:(...args)=>logs.push(args)},process:{}});
        const file=new URL('../scripts/migrate.js',import.meta.url);
        const source=new vm.SourceTextModule(await readFile(file,'utf8'),{context,initializeImportMeta:meta=>meta.url=file.href});
        await source.link(async spec=>{
          const values=spec==='../config/db.js'?{default:{connect:()=>db.connect(),end:async()=>done()}}:spec==='../loadEnv.js'?{}:spec==='node:fs/promises'?{access:async()=>{},readdir:async()=>[filename],readFile:async()=>sql}:await import(spec);
          return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
        });
        await source.evaluate();await finished;await new Promise(resolve=>setTimeout(resolve,0));
        assert.equal(context.process.exitCode,1);assert.equal(logs.length,1);
        assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1',[filename])).rows[0].n,0);
      }
      assert.equal((await db.query("SELECT to_regclass('popup_rollback_probe') AS probe,to_regclass('users') AS users")).rows[0].probe,null);
      assert.ok((await db.query("SELECT to_regclass('users') AS users")).rows[0].users);
    });
    const makeUser = async (label,role='user') => (await db.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,'synthetic',$2,$3) RETURNING id",[label+'@example.invalid',label,role])).rows[0].id;
    const course = async label => (await db.query('INSERT INTO courses(title,is_published) VALUES($1,true) RETURNING id',[label])).rows[0].id;
    const admin=await makeUser('Admin','admin'), buyer=await makeUser('Buyer'), enrolled=await makeUser('Enrolled');
    const guest=await makeUser('Guest'), stranger=await makeUser('Stranger'), expired=await makeUser('Expired');
    const c1=await course('Python'), c2=await course('Cours indépendant');
    const o1=(await db.query("INSERT INTO offers(title,fixed_price) VALUES('Mensuel',60) RETURNING id")).rows[0].id;
    const o2=(await db.query("INSERT INTO offers(title,fixed_price) VALUES('Révision',180) RETURNING id")).rows[0].id;
    await db.query('INSERT INTO offer_courses(offer_id,course_id) VALUES($1,$2)',[o1,c1]);
    await db.query("INSERT INTO enrollments(user_id,course_id,offer_id) VALUES($1,$2,$3)",[buyer,c1,o1]);
    await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,60,'wallet_completed')",[buyer,o1]);
    await db.query('INSERT INTO enrollments(user_id,course_id) VALUES($1,$2)',[enrolled,c2]);
    await db.query("INSERT INTO enrollments(user_id,course_id,expires_at) VALUES($1,$2,NOW()-interval '1 day')",[expired,c2]);
    const legacy=(await db.query("INSERT INTO live_sessions(course_id,offer_id,title,scheduled_at) VALUES($1,$2,'Legacy',NOW()) RETURNING id",[c1,o1])).rows[0].id;
    await t.test('004 requires 002 and a failed migration rolls back cleanly',async()=>{
      await db.query('BEGIN');
      await assert.rejects(db.query(await readFile(new URL('../../database/pending-migrations/202611200004_live_session_multi_audience.sql',import.meta.url),'utf8')));
      await db.query('ROLLBACK');
      assert.equal((await db.query("SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_name='live_sessions' AND column_name='access_policy'")).rows[0].n,0);
    });
    for(const file of ['202611200002_extend_live_session_access.sql','202611200003_create_zoom_recording_imports.sql','202611200004_live_session_multi_audience.sql','202611240001_zoom_recording_reliability.sql','202611240002_recording_trash_retention.sql']) {
      await db.query('BEGIN');
      try { await db.query(await readFile(new URL('../../database/'+(['202611200002_extend_live_session_access.sql','202611200004_live_session_multi_audience.sql'].includes(file)?'pending-migrations':'migrations')+'/'+file,import.meta.url),'utf8')); await db.query('COMMIT'); }
      catch(error) { await db.query('ROLLBACK'); throw error; }
    }
    await features.detectLiveFeatures(db);
    const allowed=async(id,user)=>(await db.query(`SELECT ${access.liveSessionAccess('$2')} AS allowed FROM live_sessions ls WHERE id=$1`,[id,user])).rows[0].allowed;
    await t.test('legacy data and permissions survive all pending migrations',async()=>{
      assert.equal((await db.query('SELECT access_policy,course_id FROM live_sessions WHERE id=$1',[legacy])).rows[0].course_id,c1);
      assert.equal(await allowed(legacy,buyer),true);
      assert.equal(await allowed(legacy,guest),false);
      assert.equal(features.liveFeatures.multiAudience,true);
    });
    const {accountAllowed,authApiMiddleware,isAccessPayload,verifyToken}=await import('../middleware/requireAuth.js');
    const {requireAdmin}=await import('../middleware/requireAdmin.js');
    let zoomCalls=0, zoomDeletes=0,failReschedule=false;
    const storageDeletes=[];
    let failStorageDelete=false;
    const previousImportFlag=process.env.ZOOM_RECORDING_IMPORT_ENABLED;process.env.ZOOM_RECORDING_IMPORT_ENABLED='true';t.after(()=>{if(previousImportFlag===undefined)delete process.env.ZOOM_RECORDING_IMPORT_ENABLED;else process.env.ZOOM_RECORDING_IMPORT_ENABLED=previousImportFlag;});
    const env={LIVE_MULTI_AUDIENCE_ENABLED:'true'};
    let routeNow=null;
    class RouteDate extends Date { static now(){return routeNow??Date.now();} }
    let historicalMetadata=null;
    const dependencies={
      '../services/recording-discovery.js':{createRecordingDiscovery},'../services/recording-jobs.js':recordingJobs,'../services/zoom-recordings.js':recordingHelpers,
      express:{default:express}, jsonwebtoken:{default:jwt}, '../config/db.js':{default:db}, '../utils/offerAccess.js':access,
      '../middleware/requireAuth.js':{accountAllowed,authApiMiddleware,isAccessPayload,verifyToken}, '../middleware/requireAdmin.js':{requireAdmin},
      '../utils/returnPath.js':{loginUrlFor},
      './requireAuth.js':{accountAllowed,isAccessPayload},
      '../services/live-features.js':features, '../services/recording-worker.js':{recordingStorage:{
        delete:async key=>{if(failStorageDelete)throw new Error('Synthetic storage outage');storageDeletes.push(key);},
        abortMultipart:async()=>{},head:async()=>({ContentLength:100}),
      },recordingWorker:{kick(){}}},
      '../utils/zoomClient.js':{getZoomPastInstances:async()=>historicalMetadata?[{uuid:historicalMetadata.uuid,start_time:historicalMetadata.start_time}]:[],getZoomOccurrenceRecordings:async uuid=>{if(historicalMetadata?.uuid!==uuid)throw new Error('synthetic-unavailable');return structuredClone(historicalMetadata);},rescheduleZoomMeeting:async()=>{if(failReschedule)throw new Error("synthetic Zoom failure");},createZoomMeeting:async()=>{zoomCalls++;return {zoom_meeting_id:'synthetic-'+zoomCalls,zoom_join_url:'https://zoom.us/j/synthetic',zoom_start_url:'private-host',zoom_password:'synthetic'};},deleteZoomMeeting:async()=>{zoomDeletes++;}},
      '../utils/r2Utils.js':{createR2UploadUrl:async()=>'',generateSignedUrl:async key=>'https://storage.example.invalid/'+key},
      '@aws-sdk/client-s3':{GetObjectCommand:class{}},
      '../config/r2.js':{r2Client:{send:async()=>({Body:{transformToString:async()=> 'print(42)'}})},R2_BUCKET:'synthetic'},
      '../utils/learnerProfile.js':learnerProfile,'../utils/courseImages.js':courseImages,
      '../services/learner-onboarding.js':onboarding,
      '../services/timed-offers.js':{createOfferQuote:async()=>{}},
      // Added with the deposit/deactivation batch (user-api.js); not exercised by this suite.
      'node:crypto':{randomUUID},
      '../services/deposit-requests.js':depositRequests,
      '../services/account-status.js':{requireActiveAccount:()=>(req,res,next)=>next()},
      '../middleware/authRateLimit.js':{authRateLimit:()=>(req,res,next)=>next()},
    };
    dependencies['../utils/r2Utils.js'].deleteFromR2=async()=>{};
    const load=async (file,directory='routes')=>{
      const context=vm.createContext({process:{env},console,Buffer,URL,Date:RouteDate,setTimeout,clearTimeout});
      const source=new vm.SourceTextModule(await readFile(new URL('../'+directory+'/'+file+'.js',import.meta.url),'utf8'),{context});
      await source.link(specifier=>{const exports=dependencies[specifier];assert.ok(exports,specifier);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});});
      await source.evaluate();return directory==='middleware'?source.namespace:source.namespace.default;
    };
    dependencies['../middleware/auth.js']=await load('auth','middleware');
    const app=express();app.use(express.json(),cookieParser());
    app.use('/api/live',await load('live'));app.use(await load('user-api'));
    app.use('/api/content',await load('content'));
    app.use('/api/courses',await load('courses'));
    app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
    app.get('/api/admin/offers',requireAdmin,async(req,res)=>res.json({data:(await db.query('SELECT * FROM offers')).rows}));
    app.get('/api/admin/courses',requireAdmin,async(req,res)=>res.json({data:(await db.query('SELECT * FROM courses')).rows}));
    app.get('/app/calendar',authApiMiddleware,async(req,res)=>{
      let html=await ejs.renderFile(fileURLToPath(new URL('../views/pages/calendar/index.ejs',import.meta.url)),{
        user:req.user,profile:{full_name:'Synthetic student',balance:'0.00'},
      });
      // Exercise the real calendar and media scripts without unrelated CDN/auth bootstrapping.
      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,script=>
        /src="\/js\/(calendar|replay-player|live-session-popup)\.js/.test(script)?script:'');
      res.send(html.replace('<body>','<body><style>#global-hydration-overlay{display:none!important}</style>'));
    });
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const token=user=>jwt.sign({id:user,role:user===admin?'admin':'user'},process.env.JWT_SECRET,{expiresIn:'1h'});
    const request=(path,user=admin,body,method=body?'POST':'GET')=>fetch(origin+path,{method,redirect:'manual',headers:{...(user?{cookie:'synta_access='+token(user)}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const schedule=async(fields)=>{
      const response=await request('/api/live/schedule',admin,{title:'Séance partagée',startTime:new Date(Date.now()+60000).toISOString(),courseIds:[],offerIds:[],...fields});
      const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));return result.sessions[0].id;
    };
    await db.query(await readFile(new URL('../../database/migrations/202611050001_create_notifications.sql',import.meta.url),'utf8'));
    await t.test('reschedule authorizes, rejects stale changes and atomically notifies eligible students once',async()=>{
      const id=await schedule({courseIds:[c1,c2],offerIds:[o1],grantedStudentIds:[guest]});
      const old=(await db.query('SELECT scheduled_at FROM live_sessions WHERE id=$1',[id])).rows[0].scheduled_at.toISOString();
      const body={expectedStartTime:old,startTime:new Date(Date.now()+86400000).toISOString()};
      assert.equal((await request('/api/live/'+id+'/reschedule',guest,body,'PATCH')).status,403);
      assert.equal((await request('/api/live/'+id+'/reschedule',admin,{...body,startTime:'bad'},'PATCH')).status,400);
      failReschedule=true;
      assert.equal((await request('/api/live/'+id+'/reschedule',admin,body,'PATCH')).status,502);
      assert.equal((await db.query('SELECT scheduled_at FROM live_sessions WHERE id=$1',[id])).rows[0].scheduled_at.toISOString(),old);
      assert.equal((await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n,0);
      failReschedule=false;
      assert.equal((await request('/api/live/'+id+'/reschedule',admin,body,'PATCH')).status,200);
      assert.equal((await request('/api/live/'+id+'/reschedule',admin,body,'PATCH')).status,200);
      const notices=(await db.query('SELECT user_id,message FROM notifications')).rows;
      assert.deepEqual(notices.map(r=>r.user_id).sort(),[buyer,enrolled,guest].sort());
      assert.ok(notices.every(r=>r.message.includes('est reportée au')&&!r.message.includes('heure de Tunis')));
      const pending=await(await request('/api/user/notifications/important',guest)).json();
      assert.equal(pending.notifications.length,1);assert.match(pending.notifications[0].message,/est reportée au/);
      const notice=pending.notifications[0];
      assert.equal((await request('/api/user/notifications/'+notice.id+'/acknowledge',stranger,{})).status,404);
      assert.equal((await request('/api/user/notifications/'+notice.id+'/acknowledge',guest,{})).status,200);
      assert.equal((await request('/api/user/notifications/'+notice.id+'/acknowledge',guest,{})).status,200);
      assert.equal((await(await request('/api/user/notifications/important',guest)).json()).notifications.length,0);
      const bell=(await db.query('SELECT is_read,popup_acknowledged_at FROM notifications WHERE id=$1',[notice.id])).rows[0];
      assert.equal(bell.is_read,false);assert.ok(bell.popup_acknowledged_at);
      assert.equal((await(await request('/api/user/notifications/important',enrolled)).json()).notifications.length,1);
      assert.equal((await(await request('/api/user/notifications/important',stranger)).json()).notifications.length,0);

      assert.equal((await request('/api/live/'+id+'/reschedule',admin,{...body,startTime:new Date(Date.now()+172800000).toISOString()},'PATCH')).status,409);
      const nextTime=new Date(Date.now()+259200000).toISOString();
      assert.equal((await request('/api/live/'+id+'/reschedule',admin,{expectedStartTime:body.startTime,startTime:nextTime},'PATCH')).status,200);
      const renewed=(await(await request('/api/user/notifications/important',guest)).json()).notifications;
      assert.equal(renewed.length,1);assert.notEqual(renewed[0].id,notice.id);
      assert.equal((await(await request('/api/user/notifications/important',enrolled)).json()).notifications.length,1,'superseded popup suppressed');
      await db.query("UPDATE live_sessions SET status='cancelled' WHERE id=$1",[id]);
      assert.equal((await(await request('/api/user/notifications/important',guest)).json()).notifications.length,0,'cancelled popup suppressed');

    });
    let mixed,offerOnly,courseOnly,resource;
    await t.test('offer-only, course-only, invitations, duplicate selections and API guards',async()=>{
      offerOnly=await schedule({offerIds:[o1]});courseOnly=await schedule({courseIds:[c2]});
      mixed=await schedule({courseIds:[c1,c2,c2],offerIds:[o1,o2,o1],grantedStudentIds:[guest,guest]});
      for(const [id,expected] of [[offerOnly,[buyer]],[courseOnly,[enrolled]],[mixed,[buyer,enrolled,guest]]]) {
        for(const user of [buyer,enrolled,guest,stranger,expired]) assert.equal(await allowed(id,user),expected.includes(user));
      }
      assert.equal((await db.query('SELECT COUNT(*)::int n FROM live_session_courses WHERE session_id=$1',[mixed])).rows[0].n,2);
      assert.equal((await request('/api/live/schedule',admin,{title:'Bad',courseIds:[],offerIds:[],grantedStudentIds:[guest],startTime:new Date().toISOString()})).status,400);
      assert.equal((await request('/api/live/schedule',guest,{})).status,403);
      assert.equal((await request('/api/live/upcoming',null)).status,401);
      assert.equal((await request('/api/live/schedule',admin,{title:'Bad',courseIds:[randomUUID()],offerIds:[],startTime:new Date().toISOString()})).status,400);
      assert.equal(zoomCalls,4);
      const links=(await db.query('SELECT COUNT(*)::int n FROM enrollments WHERE user_id=$1',[guest])).rows[0].n;
      assert.equal(links,0,'invitation cannot grant paid course enrollment');
      const module=(await db.query("INSERT INTO modules(course_id,title) VALUES($1,'Paid chapter') RETURNING id",[c1])).rows[0].id;
      await db.query('INSERT INTO course_modules(course_id,module_id) VALUES($1,$2)',[c1,module]);
      const lesson=(await db.query("INSERT INTO lessons(module_id,title,type,is_preview) VALUES($1,'Paid video','video',false) RETURNING id",[module])).rows[0].id;
      assert.equal((await request('/api/content/lesson/'+lesson,guest)).status,403,'session invitation must not unlock paid lessons');
    });
    await t.test('Dashboard, Calendar, join, course replay lists and resources use the same OR authorization',async()=>{
      await db.query("UPDATE live_sessions SET replay_url='live-replays/synthetic.mp4' WHERE id=$1",[mixed]);
      resource=(await db.query("INSERT INTO learning_resources(live_session_id,title,file_name,object_key,content_type,file_size) VALUES($1,'Exercice','test.py','synthetic/test.py','text/plain',9) RETURNING id",[mixed])).rows[0].id;
      for(const user of [buyer,enrolled,guest]) {
        const upcoming=await(await request('/api/live/upcoming',user)).json();assert.equal(upcoming.filter(s=>s.id===mixed).length,1);
        const events=await(await request('/api/events',user)).json();assert.equal(events.events.filter(s=>s.id===mixed).length,1);
        const details=await(await request('/api/live/session/'+mixed,user)).json();
        assert.equal(details.resources.length,1);assert.ok(details.resources[0].url.startsWith('https://storage.example.invalid/'));
        assert.ok(!JSON.stringify(details).includes('private-host'));
        assert.equal((await request('/api/live/'+mixed+'/join',user)).status,302);
        assert.equal(await(await request('/api/live/resources/'+resource+'/code',user)).text(),'print(42)');
      }
      for(const user of [stranger,expired]) {
        assert.equal((await request('/api/live/session/'+mixed,user)).status,404);
        assert.equal((await request('/api/live/'+mixed+'/join',user)).status,404);
        assert.equal((await request('/api/live/resources/'+resource+'/code',user)).status,404);
        const upcoming=await(await request('/api/live/upcoming',user)).json();assert.ok(!upcoming.some(s=>s.id===mixed));
      }
      for(const courseId of [c1,c2]) {
        const sessions=await(await request('/api/live/course/'+courseId,enrolled)).json();assert.equal(sessions.filter(s=>s.id===mixed).length,1);
      }
      await db.query("UPDATE live_sessions SET scheduled_at=NOW()-interval '2 hours' WHERE id=$1",[mixed]);
      assert.equal((await(await request('/api/live/replays',guest)).json()).filter(s=>s.id===mixed).length,1);
      assert.equal((await request('/api/live/'+mixed+'/join',guest)).status,410);
      env.LIVE_MULTI_AUDIENCE_ENABLED='false';
      assert.equal((await request('/api/live/session/'+mixed,guest)).status,200,'disabling creation preserves existing access');
      assert.equal((await request('/api/live/schedule',admin,{courseIds:[c2]})).status,409);
      env.LIVE_MULTI_AUDIENCE_ENABLED='true';
    });
    await t.test('database rejects missing audiences, duplicate links and concurrent final-audience deletion',async()=>{
      await assert.rejects(db.query("INSERT INTO live_sessions(title,scheduled_at,access_policy) VALUES('Invalid',NOW(),'any_selected')"));
      await assert.rejects(db.query('INSERT INTO live_session_offers VALUES($1,$2)',[mixed,o1]),{code:'23505'});
      const concurrent=await schedule({courseIds:[c1,c2]});
      const clients=await Promise.all([db.connect(),db.connect()]);
      try {
        await clients[0].query('BEGIN');await clients[1].query('BEGIN');
        await clients[0].query('DELETE FROM live_session_courses WHERE session_id=$1 AND course_id=$2',[concurrent,c1]);
        const blocked=clients[1].query('DELETE FROM live_session_courses WHERE session_id=$1 AND course_id=$2',[concurrent,c2]);
        await clients[0].query('COMMIT');await blocked;
        await assert.rejects(clients[1].query('COMMIT'));
        assert.equal((await db.query('SELECT COUNT(*)::int n FROM live_session_courses WHERE session_id=$1',[concurrent])).rows[0].n,1);
        await assert.rejects(db.query('DELETE FROM live_session_offers WHERE session_id=$1',[offerOnly]));
      } finally {for(const client of clients){await client.query('ROLLBACK');client.release();}}
      await db.query("UPDATE payments SET status='refunded' WHERE user_id=$1",[buyer]);
      assert.equal(await allowed(offerOnly,buyer),false,'refunded offer access is rejected');
      await db.query("UPDATE live_sessions SET status='cancelled' WHERE id=$1",[mixed]);
      assert.equal(await allowed(mixed,guest),false);
    });
    await t.test('timed offer access expires and revokes without losing independent invitations',async()=>{
      const timed=await makeUser('Timed');
      const payment=(await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,60,'timed_wallet_completed') RETURNING id",[timed,o1])).rows[0].id;
      const grant=(await db.query("INSERT INTO offer_access_grants(user_id,offer_id,payment_id,request_id,request_fingerprint,access_mode,monthly_anchor_day,starts_at,expires_at) VALUES($1,$2,$3,$4,repeat('a',64),'monthly',20,NOW()-interval '1 day',NOW()+interval '1 day') RETURNING id",[timed,o1,payment,randomUUID()])).rows[0].id;
      assert.equal(await allowed(offerOnly,timed),true);
      await db.query("UPDATE offer_access_grants SET expires_at=NOW()-interval '1 hour' WHERE id=$1",[grant]);
      assert.equal(await allowed(offerOnly,timed),false);
      await db.query("UPDATE offer_access_grants SET expires_at=NOW()+interval '1 day',revoked_at=NOW() WHERE id=$1",[grant]);
      assert.equal(await allowed(offerOnly,timed),false);
      await db.query('UPDATE live_sessions SET granted_student_ids=$2 WHERE id=$1',[offerOnly,[timed]]);
      assert.equal(await allowed(offerOnly,timed),true);
      assert.equal((await db.query('SELECT COUNT(*)::int n FROM enrollments WHERE user_id=$1',[timed])).rows[0].n,0);
    });
    await t.test('Zoom cleanup after database failure rolls back the entire session',async()=>{
      await db.query("CREATE FUNCTION reject_test_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='Force rollback' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_test_session BEFORE INSERT ON live_sessions FOR EACH ROW EXECUTE FUNCTION reject_test_session()");
      const response=await request('/api/live/schedule',admin,{title:'Force rollback',courseIds:[c2],offerIds:[],startTime:new Date().toISOString()});
      assert.equal(response.status,500);assert.equal(zoomDeletes,1);
      assert.equal((await db.query("SELECT COUNT(*)::int n FROM live_sessions WHERE title='Force rollback'")).rows[0].n,0);
    });
    await t.test('recurring dates reuse one meeting and deduplicate repeated dates',async()=>{
      const before=zoomCalls;
      const response=await request('/api/live/schedule',admin,{title:'Recurring synthetic',courseIds:[c2],offerIds:[o1],
        startTimes:['2030-01-01T18:00:00Z','2030-01-08T18:00:00Z','2030-01-01T18:00:00Z']});
      const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));
      assert.equal(result.sessions.length,2);assert.equal(zoomCalls,before+1);
      assert.equal(new Set(result.sessions.map(session=>session.zoom_meeting_id)).size,1);
      for(const session of result.sessions) assert.equal(await allowed(session.id,enrolled),true);
    });
    await t.test('admin replay management signs private previews, publishes in order and preserves manual replacements',async()=>{
      const review=await schedule({courseIds:[c2],grantedStudentIds:[guest]});
      const meeting=(await db.query('SELECT zoom_meeting_id FROM live_sessions WHERE id=$1',[review])).rows[0].zoom_meeting_id;
      const segments=[];
      for(let index=0;index<3;index++) {
        const row=(await db.query(`INSERT INTO zoom_recording_imports
          (live_session_id,zoom_meeting_id,zoom_meeting_uuid,zoom_file_id,recording_start,recording_end,status,download_url,object_key)
          VALUES($1,$2,'synthetic-uuid',$3,NOW()+($4::int*interval '1 hour'),NOW()+($4::int*interval '1 hour')+interval '30 minutes',$5,'https://zoom.us/rec/synthetic',$6) RETURNING id`,
          [review,meeting,randomUUID(),index,index===2?'failed':'needs_review',index===2?null:`live-replays/${review}/${index}.mp4`])).rows[0];
        segments.push(row.id);
      }
      assert.equal((await request('/api/live/admin/recordings',guest)).status,403);
      assert.equal((await request('/api/live/admin/sessions',guest)).status,403);
      const imports=await(await request('/api/live/admin/recordings')).json();
      assert.equal(imports.filter(row=>row.live_session_id===review).length,3);
      assert.ok(imports.find(row=>row.id===segments[0]).preview_url.startsWith('https://storage.example.invalid/'));
      assert.ok(!('object_key' in imports[0]));
      await db.query(`INSERT INTO zoom_recording_occurrences(occurrence_uuid,meeting_id,live_session_id,resolution) SELECT zoom_meeting_uuid,MIN(zoom_meeting_id),MIN(live_session_id::text)::uuid,'matched' FROM zoom_recording_imports GROUP BY zoom_meeting_uuid ON CONFLICT DO NOTHING`);
      const published=await request('/api/live/admin/recordings/publish',admin,{sessionId:review,importIds:[segments[1],segments[0]]});
      assert.equal(published.status,200);
      assert.equal((await request('/api/live/admin/recordings/'+segments[0],admin,undefined,'DELETE')).status,409);
      assert.deepEqual((await published.json()).published,[segments[0],segments[1]]);
      assert.equal((await(await request('/api/live/session/'+review,guest)).json()).replay_parts.length,2);
      const upload=await request('/api/live/'+review+'/replay-upload-url',admin,{fileName:'replay.mp4',contentType:'video/mp4',size:50});
      assert.equal(upload.status,200);const signed=await upload.json();
      assert.ok(signed.key.startsWith('live-replays/'+review+'/'));
      assert.equal((await request('/api/live/'+review+'/replay',guest,{replayKey:signed.key},'PATCH')).status,403);
      assert.equal((await request('/api/live/'+review+'/replay',admin,{replayKey:signed.key},'PATCH')).status,200);
      const manual=await(await request('/api/live/session/'+review,guest)).json();
      assert.equal(manual.replay_parts,undefined,'old Zoom segments must not replace a manually published replay');
      let adminSession=(await(await request('/api/live/admin/sessions')).json()).find(row=>row.id===review);
      assert.equal(adminSession.replay_source,'upload');
      assert.ok(adminSession.replay_preview_url.startsWith('https://storage.example.invalid/'));
      assert.ok(!JSON.stringify(adminSession).includes('private-host'));
      assert.equal((await request('/api/live/'+review+'/replay',admin,{replayUrl:'https://drive.google.com/file/d/synthetic/view'},'PATCH')).status,200);
      adminSession=(await(await request('/api/live/admin/sessions')).json()).find(row=>row.id===review);
      assert.equal(adminSession.replay_source,'external');
      assert.equal((await db.query('SELECT COUNT(*)::int n FROM zoom_recording_imports WHERE live_session_id=$1',[review])).rows[0].n,3);
      await db.query(`INSERT INTO zoom_recording_occurrences(occurrence_uuid,meeting_id,live_session_id,resolution) SELECT zoom_meeting_uuid,MIN(zoom_meeting_id),MIN(live_session_id::text)::uuid,'matched' FROM zoom_recording_imports GROUP BY zoom_meeting_uuid ON CONFLICT DO NOTHING`);
      assert.equal((await request('/api/live/admin/recordings/publish',admin,{sessionId:review,importIds:segments.slice(0,2)})).status,200);
      assert.equal((await(await request('/api/live/session/'+review,guest)).json()).replay_parts.length,2,'automatic parts can be republished after manual sources');
      assert.equal((await request('/api/live/admin/recordings/'+segments[2]+'/retry',admin,{})).status,200);
      assert.equal((await db.query('SELECT status FROM zoom_recording_imports WHERE id=$1',[segments[2]])).rows[0].status,'pending');
      assert.deepEqual(storageDeletes,[],'publication, replacements and retry must not delete objects');
    });
    await t.test('exact UUID historical recovery, duplicate selection, review and occurrence isolation',async()=>{
      const sid=await schedule({courseIds:[c2]});
      const meeting=(await db.query('SELECT zoom_meeting_id FROM live_sessions WHERE id=$1',[sid])).rows[0].zoom_meeting_id;
      historicalMetadata={id:meeting,uuid:'/historical//exact==',start_time:'2020-10-01T18:00:00Z',recording_files:[0,1].map(i=>({
        id:'historical-'+sid+'-'+i,file_type:'MP4',status:'completed',recording_type:'speaker_view',recording_start:'2020-10-01T18:'+i+'0:00Z',file_size:100,download_url:'https://zoom.us/private-token-must-not-be-returned'}))};
      const body={sessionId:sid,occurrenceUuid:historicalMetadata.uuid};
      const automatic=await request('/api/live/admin/recordings/discover',admin,{sessionId:sid});
      assert.equal(automatic.status,200);assert.equal((await automatic.json()).occurrenceUuid,historicalMetadata.uuid);
      assert.equal((await request('/api/live/admin/recordings/discover',guest,body)).status,403);
      assert.equal((await request('/api/live/admin/recordings/discover',admin,{...body,occurrenceUuid:meeting})).status,502);
      const discovered=await request('/api/live/admin/recordings/discover',admin,body);assert.equal(discovered.status,200);
      const metadata=await discovered.json();assert.equal(metadata.files.length,2);assert.ok(!JSON.stringify(metadata).includes('private-token'));
      const recovery={...body,fileIds:metadata.files.map(file=>file.id)};
      assert.equal((await request('/api/live/admin/recordings/recover',guest,recovery)).status,403);
      assert.equal((await request('/api/live/admin/recordings/recover',admin,{...recovery,fileIds:['made-up']})).status,409);
      const first=await request('/api/live/admin/recordings/recover',admin,recovery);assert.equal(first.status,200);assert.equal((await first.json()).queued,2);
      assert.equal((await(await request('/api/live/admin/recordings/recover',admin,recovery)).json()).queued,0);
      const ids=(await db.query('SELECT id FROM zoom_recording_imports WHERE live_session_id=$1 ORDER BY recording_start',[sid])).rows.map(row=>row.id);
      assert.equal((await request('/api/live/admin/recordings/publish',admin,{sessionId:sid,importIds:ids})).status,400,'pending uploads cannot publish');
      await db.query("UPDATE zoom_recording_imports SET status='needs_review',object_key='live-replays/historical/'||id||'.mp4' WHERE live_session_id=$1",[sid]);
      assert.equal((await request('/api/live/admin/recordings/publish',admin,{sessionId:sid,importIds:ids})).status,200);
      assert.equal((await request('/api/live/admin/recordings/trash?sessionId='+sid,guest)).status,403);
      assert.equal((await request('/api/live/admin/recordings/'+ids[0]+'/restore',guest,{})).status,403);
      assert.equal((await request('/api/live/admin/recordings/publish',admin,{sessionId:sid,importIds:[ids[0]]})).status,200);
      assert.equal((await request('/api/live/admin/recordings/'+ids[1],admin,undefined,'DELETE')).status,202);
      const trash=await(await request('/api/live/admin/recordings/trash?sessionId='+sid)).json();
      assert.ok(trash.find(row=>row.id===ids[1]).restorable);
      assert.equal((await request('/api/live/admin/recordings/recover',admin,{...recovery,fileIds:[metadata.files[1].id]})).status,409,'discovery cannot restore a deleted segment');
      assert.equal((await request('/api/live/admin/recordings/'+ids[1]+'/restore',admin,{})).status,200);
      assert.equal((await db.query('SELECT status,delete_requested_at FROM zoom_recording_imports WHERE id=$1',[ids[1]])).rows[0].delete_requested_at,null);
      const other=(await db.query("INSERT INTO zoom_recording_imports(zoom_meeting_id,zoom_meeting_uuid,zoom_file_id,recording_start,download_url,live_session_id,status,object_key) VALUES($1,'other-occurrence',$2,NOW(),'https://zoom.us/file',$3,'needs_review','live-replays/other.mp4') RETURNING id",[meeting,randomUUID(),sid])).rows[0].id;
      assert.equal((await request('/api/live/admin/recordings/publish',admin,{sessionId:sid,importIds:[ids[0],other]})).status,409);
      process.env.ZOOM_RECORDING_IMPORT_ENABLED='false';
      try{
        assert.equal((await request('/api/live/admin/recordings/recover',admin,recovery)).status,409);
        await db.query("UPDATE zoom_recording_imports SET status='failed' WHERE id=$1",[other]);
        assert.equal((await request('/api/live/admin/recordings/'+other+'/retry',admin,{})).status,409);
        assert.equal((await db.query('SELECT status FROM zoom_recording_imports WHERE id=$1',[other])).rows[0].status,'failed');
      }finally{process.env.ZOOM_RECORDING_IMPORT_ENABLED='true';}
    });
    await t.test('recording deletion protects referenced files and rolls back storage failures',async()=>{
      const session=await schedule({courseIds:[c2]});
      const add=async suffix=>{
        const key=`live-replays/${session}/${suffix}.mp4`;
        const row=(await db.query(`INSERT INTO zoom_recording_imports
          (zoom_meeting_id,zoom_meeting_uuid,zoom_file_id,recording_start,download_url,live_session_id,status,object_key)
          VALUES('synthetic-delete','synthetic-delete',$1,NOW(),'https://zoom.us/rec/synthetic',$2,'needs_review',$3) RETURNING id`,[randomUUID(),session,key])).rows[0];
        return {...row,key};
      };
      const used=await add('used');
      await db.query('UPDATE live_sessions SET replay_url=$1 WHERE id=$2',[used.key,session]);
      assert.equal((await request('/api/live/admin/recordings/'+used.id,admin,undefined,'DELETE')).status,409);
      assert.deepEqual(storageDeletes,[]);
      await db.query('UPDATE live_sessions SET replay_url=NULL WHERE id=$1',[session]);
      const shared=await add('shared');
      await db.query('UPDATE zoom_recording_imports SET object_key=$1 WHERE id=$2',[used.key,shared.id]);
      assert.equal((await request('/api/live/admin/recordings/'+used.id,admin,undefined,'DELETE')).status,409,'another import still owns the file');
      await db.query('UPDATE zoom_recording_imports SET object_key=$1 WHERE id=$2',[shared.key,shared.id]);
      failStorageDelete=true;
      assert.equal((await request('/api/live/admin/recordings/'+used.id,admin,undefined,'DELETE')).status,202);
      await db.query("UPDATE zoom_recording_deletions SET requested_at=NOW()-INTERVAL '49 hours',purge_after=NOW()-INTERVAL '1 hour' WHERE import_id=$1",[used.id]);
      await assert.rejects(recordingJobs.processNextDeletion(db,dependencies['../services/recording-worker.js'].recordingStorage));
      assert.equal((await db.query('SELECT status FROM zoom_recording_imports WHERE id=$1',[used.id])).rows[0].status,'needs_review');
      failStorageDelete=false;
      await db.query('UPDATE zoom_recording_deletions SET requested_at=NOW()-make_interval(hours=>49),purge_after=NOW()-make_interval(hours=>1),next_attempt_at=NOW() WHERE import_id=$1',[used.id]);
      assert.equal((await request('/api/live/admin/recordings/'+used.id,admin,undefined,'DELETE')).status,202);
      await recordingJobs.processNextDeletion(db,dependencies['../services/recording-worker.js'].recordingStorage);
      assert.deepEqual(storageDeletes,[used.key]);
      assert.equal((await request('/api/live/'+session+'/replay',admin,{replayKey:used.key},'PATCH')).status,409);
      const raced=await add('raced');
      const results=await Promise.all([
        request('/api/live/'+session+'/replay',admin,{replayKey:raced.key},'PATCH'),
        request('/api/live/admin/recordings/'+raced.id,admin,undefined,'DELETE'),
      ]);
      assert.ok([[200,409],[202,409]].some(pair=>JSON.stringify(pair)===JSON.stringify(results.map(result=>result.status).sort())));
      const state=(await db.query('SELECT replay_url FROM live_sessions WHERE id=$1',[session])).rows[0];
      assert.ok(!state.replay_url || !storageDeletes.includes(state.replay_url));
    });
    await t.test('historical replay preserves October date, course permissions and retry identity without Zoom',async()=>{
      const before=zoomCalls,id=randomUUID();
      const body={id,courseId:c2,title:'Ancienne séance octobre',startTime:'2025-10-15T20:00:00+01:00',durationMinutes:90,replayUrl:'https://drive.google.com/file/d/synthetic/view'};
      assert.equal((await request('/api/live/replays',guest,body)).status,403);
      for(const invalid of [{...body,startTime:'bad'},{...body,startTime:'2099-01-01T00:00:00Z'},{...body,replayUrl:'javascript:alert(1)'}])assert.equal((await request('/api/live/replays',admin,invalid)).status,400);
      assert.equal((await request('/api/live/replays',admin,body)).status,201);
      assert.equal((await request('/api/live/replays',admin,body)).status,200);
      assert.equal((await request('/api/live/replays',admin,{...body,title:'Conflicting retry'})).status,409);
      const saved=(await db.query('SELECT * FROM live_sessions WHERE id=$1',[id])).rows[0];
      assert.equal(saved.scheduled_at.toISOString(),'2025-10-15T19:00:00.000Z');assert.equal(saved.status,'completed');assert.equal(saved.zoom_meeting_id,null);assert.equal(zoomCalls,before);
      assert.equal((await request('/api/live/session/'+id,enrolled)).status,200);
      assert.equal((await request('/api/live/session/'+id,stranger)).status,404);
      assert.ok((await(await request('/api/live/replays',enrolled)).json()).some(row=>row.id===id));
      assert.ok((await(await request('/api/live/course/'+c2,enrolled)).json()).some(row=>row.id===id));
      const catalogue=await(await request('/api/courses/'+c2,stranger)).json();
      const preview=catalogue.replay_previews.find(row=>row.id===id);
      assert.deepEqual(Object.keys(preview).sort(),['duration_minutes','id','scheduled_at','title']);
      assert.equal(preview.title,body.title);
      const restricted=randomUUID();
      await db.query(`INSERT INTO live_sessions(id,course_id,title,scheduled_at,status,replay_url,audience_student_ids)
        VALUES($1,$2,'Private replay',NOW()-interval '1 day','completed','https://drive.google.com/private',$3)`,[restricted,c2,[enrolled]]);
      const filtered=await(await request('/api/courses/'+c2,stranger)).json();
      assert.ok(!filtered.replay_previews.some(row=>row.id===restricted));
      assert.equal((await request('/api/live/session/'+restricted,stranger)).status,404);
      const draft=randomUUID();assert.equal((await request('/api/live/replays',admin,{...body,id:draft,replayUrl:null})).status,201);
      assert.equal((await request('/api/live/'+draft+'/replay',admin,{replayKey:`live-replays/${draft}/manual.mp4`},'PATCH')).status,200);
      const edit={title:'Titre corrigé',courseId:c1,startTime:'2025-10-01T18:30:00+01:00',durationMinutes:75,description:'<b>Description texte</b>'};
      assert.equal((await request('/api/live/'+id+'/details',guest,edit,'PATCH')).status,403);
      assert.equal((await request('/api/live/'+id+'/details',admin,{...edit,startTime:'2099-01-01T00:00:00Z'},'PATCH')).status,409);
      assert.equal((await request('/api/live/'+id+'/details',admin,edit,'PATCH')).status,200);
      const updated=(await db.query('SELECT * FROM live_sessions WHERE id=$1',[id])).rows[0];
      assert.equal(updated.title,edit.title);assert.equal(updated.scheduled_at.toISOString(),'2025-10-01T17:30:00.000Z');assert.equal(updated.course_id,c1);assert.equal(updated.replay_url,body.replayUrl);assert.equal(updated.description,edit.description);
      assert.ok(!(await(await request('/api/live/course/'+c2,enrolled)).json()).some(row=>row.id===id));
      assert.equal((await request('/api/live/'+mixed+'/details',admin,edit,'PATCH')).status,409,'Zoom metadata cannot be silently desynchronized');
    });
    await t.test('finished Zoom replay metadata and local removal preserve recording identity',async()=>{
      const id=await schedule({courseIds:[c1,c2],offerIds:[o1],grantedStudentIds:[guest]});
      await db.query("UPDATE live_sessions SET scheduled_at=NOW()-interval '2 days',status='completed',replay_url='live-replays/preserved.mp4' WHERE id=$1",[id]);
      const original=(await db.query('SELECT * FROM live_sessions WHERE id=$1',[id])).rows[0];
      const edit={title:'Replay corrigé',courseIds:[c2],startTime:'2025-10-01T18:30:00+01:00',durationMinutes:75,description:'Description corrigée'};
      assert.equal((await request('/api/live/'+id+'/details',guest,edit,'PATCH')).status,403);
      assert.equal((await request('/api/live/'+id+'/details',admin,{...edit,zoom_meeting_id:'changed'},'PATCH')).status,400);
      assert.equal((await request('/api/live/'+id+'/details',admin,{...edit,courseIds:[randomUUID()]},'PATCH')).status,400);
      assert.equal((await request('/api/live/'+id+'/details',admin,edit,'PATCH')).status,200);
      const saved=(await db.query('SELECT * FROM live_sessions WHERE id=$1',[id])).rows[0];
      assert.equal(saved.title,edit.title);assert.equal(saved.course_id,null);assert.equal(saved.zoom_meeting_id,original.zoom_meeting_id);assert.equal(saved.replay_url,original.replay_url);
      assert.deepEqual((await db.query('SELECT course_id FROM live_session_courses WHERE session_id=$1',[id])).rows.map(r=>r.course_id),[c2]);
      assert.equal((await request('/api/live/session/'+id,guest)).status,200);
      assert.ok((await(await request('/api/live/course/'+c2,enrolled)).json()).some(r=>r.id===id));
      const beforeDeletes=zoomDeletes,beforeStorage=storageDeletes.length;
      assert.equal((await request('/api/live/'+id,admin,undefined,'DELETE')).status,200);
      assert.equal(zoomDeletes,beforeDeletes);assert.equal(storageDeletes.length,beforeStorage);
      assert.equal((await request('/api/live/session/'+id,guest)).status,404);
      assert.ok(!(await(await request('/api/live/course/'+c2,enrolled)).json()).some(r=>r.id===id));
      assert.ok(!(await(await request('/api/live/replays',enrolled)).json()).some(r=>r.id===id));
      assert.equal((await db.query('SELECT replay_url FROM live_sessions WHERE id=$1',[id])).rows[0].replay_url,original.replay_url);
      assert.equal((await request('/api/live/'+id,admin,undefined,'DELETE')).status,200);
    });
    await t.test('one five-minute timing rule gates metadata and joining, including manual completion',async boundary=>{
      boundary.after(()=>{routeNow=null;});
      const id=await schedule({courseIds:[c2]});
      // Define exact boundaries on the same clock used by the route, rather than
      // assuming independent PostgreSQL and Node wall clocks agree to a millisecond.
      const start=Date.now()+20*60*1000;routeNow=start-20*60*1000;
      await db.query('UPDATE live_sessions SET scheduled_at=$2 WHERE id=$1',[id,new Date(start)]);
      let detail=await(await request('/api/live/session/'+id,enrolled)).json();
      assert.equal(detail.join_url,null);assert.equal(Date.parse(detail.scheduled_at)-Date.parse(detail.join_opens_at),300000);
      assert.equal((await request('/api/live/'+id+'/join',enrolled)).status,403);
      routeNow=start-300000-1;
      detail=await(await request('/api/live/session/'+id,enrolled)).json();
      assert.equal(Date.parse(detail.server_now),routeNow);assert.equal(detail.join_url,null);
      assert.equal((await request('/api/live/'+id+'/join',enrolled)).status,403);
      routeNow=start-300000;
      detail=await(await request('/api/live/session/'+id,enrolled)).json();assert.equal(detail.join_url,'/api/live/'+id+'/join');
      assert.equal(Date.parse(detail.server_now),Date.parse(detail.join_opens_at));
      assert.equal((await request('/api/live/'+id+'/join',enrolled)).status,302);
      routeNow=null;
      await db.query("UPDATE live_sessions SET scheduled_at=NOW()-interval '1 minute' WHERE id=$1",[id]);
      assert.equal((await request('/api/live/'+id+'/finish',admin,{},'PATCH')).status,200);
      assert.equal((await request('/api/live/'+id+'/join',enrolled)).status,410);
      assert.equal((await(await request('/api/live/session/'+id,enrolled)).json()).join_url,null);
      assert.ok(!(await(await request('/api/live/upcoming',enrolled)).json()).some(row=>row.id===id));
    });
    if(process.env.TIMED_QA_CHROME) await t.test('desktop and mobile searchable selectors create one session',async()=>{
      await db.query("UPDATE live_sessions SET status='completed' WHERE id=$1",[mixed]);
      await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until,errors,screenshot})=>{
        for(const width of [1440,390]) {
          await open('/admin/pages/sessions.html',token(admin),width);
          await until(()=>evaluate("document.querySelector('#multi-offers-search') && allCourses.length===2"),'multi selectors');
          await evaluate(`openSessionManager('${mixed}')`);
          await until(()=>evaluate("document.querySelector('[data-refresh]').disabled===false"),'multi audience manager loaded');
          await evaluate("document.querySelector('[data-tab=details]').click()");
          const details=await evaluate("document.getElementById('manager-details').textContent");
          for(const label of ['Python','Cours indépendant','Mensuel','Révision','Guest'])assert.ok(details.includes(label),label);
          await evaluate("document.querySelector('.session-manager').close()");
          await evaluate("openCreateModal(); document.getElementById('multi-courses-search').value='indépendant';document.getElementById('multi-courses-search').dispatchEvent(new Event('input')); document.querySelector('#multi-courses input[type=checkbox]').click();");
          assert.equal(await evaluate('selectedSessionCourses.size'),1);
          assert.equal(await evaluate("document.querySelector('#f-course').closest('.form-group').hidden"),true);
          await evaluate("document.getElementById('granted-search').value='Guest';searchGrantedStudents();");
          await until(()=>evaluate("document.querySelector('#granted-options input')"),'student search');
          await evaluate("document.querySelector('#granted-options input').click(); document.getElementById('f-title').value='Browser synthetic';document.getElementById('f-datetime').value='2030-06-01T18:00';");
          if(process.env.LIVE_QA_SCREENSHOTS) {
            await until(()=>evaluate("getComputedStyle(document.querySelector('#createModal .modal')).opacity==='1'"),'modal animation');
            await screenshot(process.env.LIVE_QA_SCREENSHOTS+'-admin-'+width+'.png');
          }
          await evaluate('createSession()');
          await until(()=>evaluate("document.getElementById('createBtn').disabled===false"),'schedule response');
          assert.ok(!await evaluate("document.getElementById('toast').textContent.includes('❌')"));
          assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
        }
        await db.query("UPDATE live_sessions SET status='completed' WHERE id=$1",[mixed]);
        for(const width of [1440,390]) {
          await open('/app/calendar',token(guest),width);
          await evaluate(`location.href='/app/calendar?replay=${mixed}'`);
          try {
            await until(()=>evaluate("document.querySelector('#event-modal.is-open .modal-actions button')?.textContent==='Regarder le replay'"),'invited replay');
          } catch(error) {
            throw new Error(error.message+' '+JSON.stringify(await evaluate("({url:location.href,text:document.body.textContent.slice(-1800),scripts:[...document.scripts].map(s=>s.src)})"))+' '+errors.join(' | '));
          }
          assert.ok(await evaluate("document.querySelector('#event-modal a[href^=\"https://storage.example.invalid/\"]')!==null"));
          await evaluate("document.querySelector('#event-modal .modal-actions button').click()");
          assert.equal(await evaluate("document.querySelectorAll('.calendar-replay-frame video').length"),1);
          assert.equal(await evaluate("document.querySelector('.calendar-replay-frame').scrollWidth > document.querySelector('.calendar-replay-frame').clientWidth"),false);
          await evaluate('closeModal()');
          assert.equal(await evaluate("document.querySelectorAll('.calendar-replay-frame').length"),0);
        }
        await db.query('UPDATE live_sessions SET replay_url=NULL WHERE id=$1',[mixed]);
        await open('/app/calendar',token(guest),390);
        await evaluate(`location.href='/app/calendar?replay=${mixed}'`);
        await until(()=>evaluate("document.querySelector('#event-modal.is-open a[href^=\"https://storage.example.invalid/\"]')!==null"),'resources before replay publication');
        assert.ok(!await evaluate("[...document.querySelectorAll('#event-modal button')].some(button=>button.textContent==='Regarder le replay')"));
        assert.deepEqual(errors,[]);
      });
      assert.equal((await db.query("SELECT COUNT(*)::int n FROM live_sessions WHERE title='Browser synthetic'")).rows[0].n,2);
    });
  } finally {
    access.setMultiLiveAccess(false);access.setExtendedLiveAccess(false);
    features.liveFeatures.multiAudience=false;
    if(originalSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=originalSecret;
    if(server)await new Promise(resolve=>server.close(resolve));
    await db?.end();await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH(FORCE)`).catch(()=>{});await maintenance.end();
  }
});
