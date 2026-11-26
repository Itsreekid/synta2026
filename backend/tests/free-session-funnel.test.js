import {runMigrations} from './migration-runner-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import ejs from 'ejs';
import * as access from '../utils/offerAccess.js';
import { safeReturnPath } from '../utils/returnPath.js';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('campaign return paths remain restricted to local known URLs', () => {
  for (const value of ['/session', '/session/3eme-info', '/session/bac-sciences']) assert.equal(safeReturnPath(value), value);
  for (const value of ['//evil.test', '/session/../admin', '/session/admin', '/session/login', '/session/register', '/session/api', '/session/admin/questions', '/session/slug#evil', '/session/%2fadmin']) assert.equal(safeReturnPath(value), null);
});

test('aborted visual transitions are handled on outgoing and incoming navigation', async () => {
  const listeners = {};
  vm.runInNewContext(await readFile(new URL('../public/js/auth-transitions.js', import.meta.url), 'utf8'), {
    window: { addEventListener: (name, handler) => { listeners[name] = handler; } },
    location: { origin: 'https://synthetic.test' }, URL
  });
  for (const name of ['pageswap', 'pagereveal']) {
    let handled = 0, skipped = 0;
    listeners[name]({ viewTransition: { ready: { catch: () => { handled++; } }, skipTransition: () => { skipped++; } },
      activation: { entry: { url: 'https://synthetic.test/session/3eme-info' } } });
    assert.ok(handled > 0);
    assert.equal(skipped, name === 'pageswap' ? 1 : 0);
  }
});

test('free funnel on disposable PostgreSQL: guest proof, ownership, occurrences and public UI', {
  skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 120000
}, async t => {
  const connection = { host: '127.0.0.1', port: Number(process.env.BUGI_QA_POSTGRES_PORT), user: 'bugi_qa', password: 'bugi-synthetic-local-only', ssl: false };
  const maintenance = new pg.Pool({ ...connection, database: 'postgres' });
  const name = 'free_funnel_' + randomUUID().replaceAll('-', '');
  const keys = ['DATABASE_URL', 'DB_SSL', 'JWT_SECRET', 'CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET'];
  const beforeEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let db, server, routePool;
  const emails = [], zoomCalls = [], zoomDeletes = [], zoomUpdates = [];
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
    db = new pg.Pool({ ...connection, database: name });
    await db.query(await readFile(new URL('../../database/schema_postgres.sql', import.meta.url), 'utf8'));
    const databaseUrl = `postgresql://${connection.user}:${connection.password}@127.0.0.1:${connection.port}/${name}`;
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/migrate.js', import.meta.url))], {
      env: { ...process.env, DATABASE_URL: databaseUrl, DB_SSL: 'false' }, timeout: 30000
    });
    const oldUser=(await db.query("INSERT INTO users(email,name,password_hash,email_verified,balance) VALUES('old-free@example.invalid','Historical','old-hash',true,123.45) RETURNING id")).rows[0].id;
    const oldCampaign=(await db.query('SELECT id FROM free_sessions WHERE is_default')).rows[0].id;
    const oldSession=(await db.query("INSERT INTO live_sessions(free_session_id,title,scheduled_at,status) VALUES($1,'Old session',now()-interval '10 days','completed') RETURNING id",[oldCampaign])).rows[0].id;
    await db.query("INSERT INTO free_session_participants(free_session_id,user_id,source,score,total) VALUES($1,$2,'existing_student',1,2)",[oldCampaign,oldUser]);
    const beforeLegacy=(await db.query('SELECT to_jsonb(p) AS row FROM free_session_participants p WHERE user_id=$1',[oldUser])).rows;
    const files=new Map();for(const file of await readdir(new URL('../../database/migrations/',import.meta.url)))if(file.endsWith('.sql'))files.set(file,await readFile(new URL('../../database/migrations/'+file,import.meta.url),'utf8'));
    const missingDependency=new Map(files);
    missingDependency.set('202611260005_free_campaign_public_occurrence.sql',await readFile(new URL('../../database/pending-migrations/202611260005_free_campaign_public_occurrence.sql',import.meta.url),'utf8'));
    assert.notEqual((await runMigrations(db,missingDependency)).code,0,'publication migration refuses missing guest/reservation dependency');
    assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='free_sessions' AND column_name='published_occurrence_id'")).rows[0].n,0);
    const funnelFile='202611250004_free_session_funnel.sql';files.set(funnelFile,await readFile(new URL('../../database/pending-migrations/'+funnelFile,import.meta.url),'utf8'));
    const aliasFile='202611260002_free_session_slug_aliases.sql';files.set(aliasFile,await readFile(new URL('../../database/migrations/'+aliasFile,import.meta.url),'utf8'));
    const applied=await runMigrations(db,files);assert.equal(applied.code,0,applied.logs.join('\n'));
    const repeated=await runMigrations(db,files);assert.equal(repeated.code,0);assert.ok(repeated.logs.some(line=>line==='[migrate] already applied: '+funnelFile));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM schema_migrations WHERE filename=$1',[funnelFile])).rows[0].n,1);
    assert.deepEqual((await db.query('SELECT to_jsonb(p) AS row FROM free_session_participants p WHERE user_id=$1',[oldUser])).rows,beforeLegacy);
    assert.equal((await db.query('SELECT free_reservation_required FROM live_sessions WHERE id=$1',[oldSession])).rows[0].free_reservation_required,false);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_attempts')).rows[0].n,0);
    await db.query(await readFile(new URL('../../database/pending-migrations/202611200002_extend_live_session_access.sql',import.meta.url),'utf8'));
    Object.assign(process.env, { DATABASE_URL: databaseUrl, DB_SSL: 'false', JWT_SECRET: 'synthetic-free-funnel',
      CLOUDFLARE_ACCOUNT_ID: 'synthetic', R2_ACCESS_KEY: 'synthetic', R2_SECRET_KEY: 'synthetic', R2_BUCKET: 'synthetic' });
    const createUser = async (email, role = 'user', verified = true) => (await db.query(`INSERT INTO users(email,name,password_hash,role,email_verified,phone,class,branch,balance)
      VALUES($1,'Student','original-password-hash',$2,$3,'22123456','bac','sciences',300) RETURNING *`, [email, role, verified])).rows[0];
    const admin = await createUser('admin@example.invalid', 'admin'), existing = await createUser('existing@example.invalid');
    const stranger = await createUser('stranger@example.invalid');
    const campaign = (await db.query("UPDATE free_sessions SET title='Découvre ton informatique',subject='Informatique' WHERE is_default RETURNING *")).rows[0];
    const mc = (await db.query(`INSERT INTO session_questions(text,type,options,correct_answer,explanation,free_session_id)
      VALUES('Une question en français et بالعربية','multiple_choice','[{"id":"a","label":"Choix A"},{"id":"b","label":"Choix B"}]','"a"','SECRET EXPLANATION',$1) RETURNING id`, [campaign.id])).rows[0].id;
    const ordering = (await db.query(`INSERT INTO session_questions(text,type,options,correct_answer,free_session_id,order_index)
      VALUES('Mets ces étapes dans le bon ordre','drag_drop','[{"id":"1","label":"Étape un"},{"id":"2","label":"Étape deux"}]','["2","1"]',$1,1) RETURNING id`, [campaign.id])).rows[0].id;
    let failCreate=false,failReschedule=false;
    const zoom = {
      createZoomMeeting: async input => { if(failCreate)throw new Error('synthetic Zoom outage');zoomCalls.push(input); return { zoom_meeting_id: String(1000 + zoomCalls.length), zoom_join_url: 'https://zoom.us/j/synthetic', zoom_start_url: 'PRIVATE-HOST', zoom_password: 'synthetic' }; },
      deleteZoomMeeting: async id => zoomDeletes.push(id), rescheduleZoomMeeting: async (...args) => {if(failReschedule)throw new Error('synthetic Zoom outage');zoomUpdates.push(args);}
    };
    let googlePayload = { sub: 'google-new', email: 'google-new@gmail.com', email_verified: true, name: 'Google Student' };
    async function loadRoute(file) {
      const context = vm.createContext({ process: { env: { ...process.env, GOOGLE_CLIENT_ID: 'synthetic-client' } }, console, Buffer });
      const source = new vm.SourceTextModule(await readFile(new URL('../routes/' + file + '.js', import.meta.url), 'utf8'), { context, initializeImportMeta:meta=>{meta.url=new URL('../routes/'+file+'.js',import.meta.url).href;} });
      await source.link(async specifier => {
        const values = specifier === '../config/db.js' ? { default: db }
          : specifier === '../services/email.js' ? { sendPlacementVerificationEmail: async (email, token) => emails.push({ email, token }) }
          : specifier === '../services/sessions.js' ? { startSession: async (_db, res, user) => res.cookie('synta_access', jwt.sign(user, process.env.JWT_SECRET)) }
          : specifier === '../utils/zoomClient.js' ? zoom
          : specifier === 'google-auth-library' ? { OAuth2Client: class { async verifyIdToken() { return { getPayload: () => googlePayload }; } } }
          : await import(specifier.startsWith('.') ? new URL(specifier, new URL('../routes/' + file + '.js', import.meta.url)).href : specifier);
        return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
      });
      await source.evaluate(); return source.namespace.default;
    }
    const app = express(); app.set('trust proxy','loopback'); app.set('views',fileURLToPath(new URL('../views',import.meta.url)));app.set('view engine','ejs');app.locals.googleClientId='synthetic-client'; app.use(express.json({ limit: '128kb' }), cookieParser());
    app.use('/api/session', await loadRoute('session')); app.use(await loadRoute('google-auth'));
    routePool = (await import('../config/db.js')).default;
    await (await import('../services/live-features.js')).detectLiveFeatures(db);
    app.use((await import('../routes/auth-api.js')).default);
    app.use('/api/live', (await import('../routes/live.js')).default);
    app.use((await import('../routes/user-api.js')).default);
    app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
    app.use(await loadRoute('pages'));
    app.use('/api/offers',(await import('../routes/offers.js')).default);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    const token = user => jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
    const jar = user => new Map(user ? [['synta_access', token(user)]] : []);
    const visitorIps=new WeakMap();let visitorNumber=0;
    async function call(path, cookies = new Map(), body, method = body ? 'POST' : 'GET') {
      // Separate synthetic visitors keep the real rate limiter enabled without
      // treating every independent test student as one loopback attacker.
      if(!visitorIps.has(cookies))visitorIps.set(cookies,'192.0.2.'+(++visitorNumber));
      const response = await fetch(origin + path, { method, redirect: 'manual', headers: { 'X-Forwarded-For':visitorIps.get(cookies), Cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; '), 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
      for (const value of response.headers.getSetCookie()) { const pair = value.split(';')[0], index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
      return response;
    }
    const adminJar = jar(admin), existingJar = jar(existing), visitor = jar();
    const independentCampaigns=[];
    const startPath = '/api/session/guest/start', submitPath = '/api/session/guest/submit';
    const firstStart = new Date(Date.now() + 86400000).toISOString(), secondStart = new Date(Date.now() + 172800000).toISOString();
    const createOccurrence = async startTime => {
      const id = randomUUID(), input = { id, startTime, duration: 60 };
      const path = '/api/session/admin/campaigns/' + campaign.id + '/occurrences';
      assert.equal((await call(path, existingJar, input)).status, 403);
      const response = await call(path, adminJar, input); assert.equal(response.status, 201, await response.clone().text());
      assert.equal((await call(path, adminJar, input)).status, 201); return (await response.json()).session;
    };
    const one = await createOccurrence(firstStart), two = await createOccurrence(secondStart);
    assert.equal((await call('/api/live/session/'+oldSession,jar({id:oldUser,role:'user'}))).status,200);
    await db.query('UPDATE live_sessions SET granted_student_ids=$2 WHERE id=$1',[one.id,[stranger.id]]);
    assert.equal((await call('/api/live/session/'+one.id,jar(stranger))).status,404,'invitations cannot bypass free-occurrence reservations');
    await db.query('UPDATE live_sessions SET granted_student_ids=NULL WHERE id=$1',[one.id]);
    assert.equal(zoomCalls.length, 2);

    await t.test('guest scoring is private, snapshotted, resumable and immutable', async () => {
      const response = await call(startPath, visitor, { slug: campaign.slug }); assert.equal(response.status, 200);
      const data = await response.json(); assert.equal(data.questions.length, 2);
      assert.ok(!JSON.stringify(data).includes('correct_answer')); assert.ok(!JSON.stringify(data).includes('SECRET EXPLANATION'));
      assert.equal((await (await call(startPath, visitor, { slug: campaign.slug })).json()).attempt.id, data.attempt.id);
      await db.query('UPDATE session_questions SET correct_answer=$2 WHERE id=$1', [mc, '"b"']);
      const submitted = await (await call(submitPath, visitor, { slug: campaign.slug, answers: { [mc]: 'a', [ordering]: ['2', '1'] }, score: 999 })).json();
      assert.equal(submitted.attempt.score, 2); assert.equal(submitted.attempt.level, 'advanced');
      assert.equal((await (await call(submitPath, visitor, { slug: campaign.slug, answers: {} })).json()).attempt.score, 2);
      await assert.rejects(db.query('UPDATE free_session_attempts SET score=0 WHERE id=$1', [data.attempt.id]), { code: '23514' });
      const anonymous = await call('/api/session/guest/claim', visitor, { slug: campaign.slug, occurrenceId: one.id }); assert.equal(anonymous.status, 401);
      assert.equal((await call('/api/live/session/' + one.id, jar(stranger))).status, 404);
    });

    let created;
    await t.test('result survives email proof and exactly-once account activation on another device', async () => {
      const response = await call('/api/session/register', visitor, { slug: campaign.slug, full_name: 'New student', email: 'new@example.invalid', phone: '22123456', track: '2eme', branch: 'informatique', occurrenceId: one.id });
      assert.equal(response.status, 202, await response.clone().text()); assert.equal(emails.length, 1);
      const anotherDevice = jar();
      assert.equal((await call('/api/session/verify', anotherDevice, { token: emails[0].token })).status, 200);
      assert.equal((await call('/api/session/verify', anotherDevice, { token: emails[0].token })).status, 400);
      const results = await Promise.all([1, 2].map(() => call('/api/session/set-password', anotherDevice, { password: 'secure-test-password' })));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      created = (await db.query("SELECT * FROM users WHERE email='new@example.invalid'")).rows[0];
      assert.equal(created.class, '2eme'); assert.equal(created.branch, 'informatique'); assert.equal(created.signup_source, 'free_session');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_reservations WHERE user_id=$1', [created.id])).rows[0].n, 1);
      assert.equal((await call('/api/live/session/' + one.id, jar(created))).status, 200);
      assert.equal((await call('/api/live/session/' + two.id, jar(created))).status, 404);
      assert.equal((await call('/api/live/' + one.id + '/join', jar(created))).status, 403);
      await db.query("UPDATE live_sessions SET scheduled_at=now()+interval '4 minutes' WHERE id=$1", [one.id]);
      assert.equal((await call('/api/live/' + one.id + '/join', jar(created))).status, 302);
      await db.query('UPDATE live_sessions SET scheduled_at=$2 WHERE id=$1', [one.id, firstStart]);
      const stolenJar = new Map(visitor); stolenJar.set('synta_access', token(existing));
      assert.equal((await call('/api/session/guest/claim', stolenJar, { slug: campaign.slug, occurrenceId: one.id, userId: created.id })).status, 403);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM enrollments WHERE user_id=$1', [created.id])).rows[0].n, 0);
    });

    await t.test('per-date duplicate protection, reuse policy and occurrence audit preserve history', async () => {
      const userJar = jar(created), reservePath = '/api/session/member/reserve';
      assert.equal((await call(reservePath, userJar, { slug: campaign.slug, occurrenceId: two.id })).status, 409);
      const settingsPath = '/api/session/admin/campaigns/' + campaign.id + '/funnel-settings';
      assert.equal((await call(settingsPath, adminJar, { reuse: true, intermediate: 50, advanced: 80 }, 'PUT')).status, 200);
      const results = await Promise.all([1, 2].map(() => call(reservePath, userJar, { slug: campaign.slug, occurrenceId: two.id })));
      assert.ok(results.every(result => result.status === 200));
      assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_reservations WHERE user_id=$1', [created.id])).rows[0].n, 2);
      const changePath = '/api/session/admin/campaigns/' + campaign.id + '/occurrences/' + two.id;
      const changedTime = new Date(Date.now() + 259200000).toISOString();
      failReschedule=true;assert.equal((await call(changePath,adminJar,{action:'rescheduled',expectedStartTime:secondStart,startTime:changedTime},'PATCH')).status,500);failReschedule=false;
      assert.equal((await db.query('SELECT scheduled_at FROM live_sessions WHERE id=$1',[two.id])).rows[0].scheduled_at.toISOString(),secondStart);
      assert.equal((await call(changePath, adminJar, { action: 'rescheduled', expectedStartTime: secondStart, startTime: changedTime }, 'PATCH')).status, 200);
      assert.equal(zoomUpdates.length, 1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1', [created.id])).rows[0].n, 1);
      assert.equal((await call(changePath, adminJar, { action: 'cancelled', expectedStartTime: changedTime }, 'PATCH')).status, 200);
      assert.equal((await call('/api/live/session/' + two.id, userJar)).status, 404);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_occurrence_events WHERE live_session_id=$1', [two.id])).rows[0].n, 3);
      await assert.rejects(db.query("UPDATE free_session_occurrence_events SET event_type='created' WHERE live_session_id=$1", [two.id]), { code: '23514' });
      assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_reservations WHERE user_id=$1', [created.id])).rows[0].n, 2);
    });

    await t.test('Google refuses unverified email/account linking and retains verified identity safeguards', async () => {
      const vulnerable = await createUser('unverified@gmail.com', 'user', false);
      googlePayload = { sub: 'google-unverified', email: vulnerable.email, email_verified: true, name: 'Google' };
      assert.equal((await call('/api/auth/google', jar(), { credential: 'mock-google-token' })).status, 409);
      assert.equal((await db.query('SELECT google_id FROM users WHERE id=$1', [vulnerable.id])).rows[0].google_id, null);
      googlePayload.email_verified = false;
      assert.equal((await call('/api/auth/google', jar(), { credential: 'mock-google-token' })).status, 400);
      await db.query('UPDATE users SET email_verified=true WHERE id=$1', [vulnerable.id]); googlePayload.email_verified = true;
      assert.equal((await call('/api/auth/google', jar(), { credential: 'mock-google-token' })).status, 200);
      googlePayload.sub = 'different-google-owner';
      assert.equal((await call('/api/auth/google', jar(), { credential: 'mock-google-token' })).status, 409);
      assert.equal((await db.query('SELECT password_hash FROM users WHERE id=$1', [vulnerable.id])).rows[0].password_hash, vulnerable.password_hash);
    });

    await t.test('mocked Google registration saves the guest result after normal profile completion',async()=>{
      const googleCampaign=(await db.query("INSERT INTO free_sessions(slug,title,target_class,target_branch) VALUES('google-3eme','Google 3ème','3eme','informatique') RETURNING *")).rows[0];
      const q=(await db.query(`INSERT INTO session_questions(text,type,options,correct_answer,free_session_id) VALUES('Google question','multiple_choice','["a","b"]','"a"',$1) RETURNING id`,[googleCampaign.id])).rows[0].id;
      const googleGuest=jar();await call(startPath,googleGuest,{slug:googleCampaign.slug});
      await call(submitPath,googleGuest,{slug:googleCampaign.slug,answers:{[q]:'a'}});
      googlePayload={sub:'google-funnel-new',email:'google-funnel-new@gmail.com',email_verified:true,name:'Google new student'};
      const signed=await call('/api/auth/google',googleGuest,{credential:'mock-google-token'});assert.equal(signed.status,200);assert.equal((await signed.json()).needsOnboarding,true);
      assert.equal((await call('/api/session/guest/claim',googleGuest,{slug:googleCampaign.slug})).status,409);
      if(process.env.TIMED_QA_CHROME)await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until,command,errors})=>{
        for(const [name,value]of googleGuest)if(name.startsWith('synta_free_'))await command('Network.setCookie',{name,value,url:origin,path:'/api/session',httpOnly:true});
        await open('/auth/complete-profile',googleGuest.get('synta_access'),390);
        await command('Page.navigate',{url:origin+'/auth/complete-profile?next='+encodeURIComponent('/session/'+googleCampaign.slug)});
        await until(()=>evaluate("document.querySelector('#completeProfileForm')?.dataset.next==='/session/google-3eme' && Boolean(document.querySelector('[data-campaign-profile]'))"),'Google campaign profile');
        assert.equal(await evaluate("document.querySelector('#userClass').disabled && document.querySelector('#userClass').value==='3eme'"),true);
        assert.equal(await evaluate("document.querySelector('#userBranch').disabled && document.querySelector('#userBranch').value==='informatique'"),true);
        assert.equal(await evaluate("document.querySelector('#userClass').closest('.form-group').hidden && document.querySelector('#userBranch').closest('.form-group').hidden"),true);
        assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
        assert.deepEqual(errors,[]);
      });
      assert.equal((await call('/api/session/member/profile',jar(),{slug:googleCampaign.slug,phone:'22123456'})).status,401);
      assert.equal((await call('/api/session/member/profile',googleGuest,{slug:googleCampaign.slug,phone:'22123456',user_class:'bac',user_branch:'sciences',userId:existing.id})).status,200);
      assert.equal((await call('/api/session/guest/claim',googleGuest,{slug:googleCampaign.slug})).status,200);
      assert.equal((await call('/api/session/guest/claim',googleGuest,{slug:googleCampaign.slug})).status,200);
      const user=(await db.query('SELECT signup_source,signup_free_session_id,class,branch FROM users WHERE email=$1',[googlePayload.email])).rows[0];
      assert.deepEqual(user,{signup_source:'free_session',signup_free_session_id:googleCampaign.id,class:'3eme',branch:'informatique'});
      await call('/api/auth/google',googleGuest,{credential:'mock-google-token'});
      assert.equal((await db.query('SELECT count(*)::int AS n FROM users WHERE email=$1',[googlePayload.email])).rows[0].n,1);
    });
    await t.test('provider creation failure leaves no occurrence or audit row',async()=>{
      const id=randomUUID();failCreate=true;
      assert.equal((await call('/api/session/admin/campaigns/'+campaign.id+'/occurrences',adminJar,{id,startTime:new Date(Date.now()+345600000).toISOString(),duration:60})).status,500);
      failCreate=false;assert.equal((await db.query('SELECT count(*)::int AS n FROM live_sessions WHERE id=$1',[id])).rows[0].n,0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_occurrence_events WHERE live_session_id=$1',[id])).rows[0].n,0);
    });

    await t.test('guest expiry and existing-member participation across campaigns preserve identity',async()=>{
      const memberGuest=jar(existing);
      const started=await (await call(startPath,memberGuest,{slug:campaign.slug})).json();
      await call(submitPath,memberGuest,{slug:campaign.slug,answers:{[mc]:'b',[ordering]:['2','1']}});
      assert.equal((await call('/api/session/guest/claim',memberGuest,{slug:campaign.slug,occurrenceId:one.id})).status,200);
      const original=(await db.query('SELECT * FROM users WHERE id=$1',[existing.id])).rows[0];
      const targeted=(await db.query("INSERT INTO free_sessions(slug,title,target_class,target_branch) VALUES('2eme-info','Découverte 2ème','2eme','informatique') RETURNING *")).rows[0];
      const q=(await db.query(`INSERT INTO session_questions(text,type,options,correct_answer,free_session_id) VALUES('Choix','multiple_choice','["a","b"]','"a"',$1) RETURNING id`,[targeted.id])).rows[0].id;
      await call(startPath,memberGuest,{slug:targeted.slug});await call(submitPath,memberGuest,{slug:targeted.slug,answers:{[q]:'a'}});
      assert.equal((await call('/api/session/guest/claim',memberGuest,{slug:targeted.slug})).status,200);
      assert.deepEqual((await db.query('SELECT * FROM users WHERE id=$1',[existing.id])).rows[0],original);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_participants WHERE user_id=$1',[existing.id])).rows[0].n,2);
      const newVisitor=jar();await call(startPath,newVisitor,{slug:targeted.slug});await call(submitPath,newVisitor,{slug:targeted.slug,answers:{[q]:'a'}});
      assert.equal((await call('/api/session/register',newVisitor,{slug:targeted.slug,full_name:'Targeted student',email:'targeted@example.invalid',phone:'22123456',track:'bac',branch:'sciences'})).status,202);
      const targetMail=emails.find(mail=>mail.email==='targeted@example.invalid');await call('/api/session/verify',newVisitor,{token:targetMail.token});
      assert.equal((await call('/api/session/set-password',newVisitor,{password:'secure-test-password'})).status,200);
      const profile=(await db.query("SELECT class,branch FROM users WHERE email='targeted@example.invalid'")).rows[0];assert.deepEqual(profile,{class:'2eme',branch:'informatique'});
      const expired=jar();const prior=(await (await call(startPath,expired,{slug:campaign.slug})).json()).attempt;
      await db.query("UPDATE free_session_attempts SET created_at=now()-interval '3 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[prior.id]);
      assert.equal((await call('/api/session/guest/status?slug='+campaign.slug,expired)).status,401);
      assert.equal((await call('/api/session/guest/submit',expired,{slug:campaign.slug,answers:{}})).status,401);
      assert.notEqual((await (await call(startPath,expired,{slug:campaign.slug})).json()).attempt.id,prior.id);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_attempts WHERE id=$1',[prior.id])).rows[0].n,1);
    });

    await t.test('unlimited same-class campaigns keep URLs, questions, profiles, offers and dated reservations independent',async()=>{
      const create=async(slug,targetClass,targetBranch)=>{
        const body={slug,title:'Découverte '+slug,subject:'Informatique',description:'Révision indépendante',target_class:targetClass,target_branch:targetBranch,scheduled_at:null,duration_minutes:60,is_active:true,is_default:false};
        assert.equal((await call('/api/session/admin/campaigns',existingJar,body)).status,403);
        const response=await call('/api/session/admin/campaigns',adminJar,body);assert.equal(response.status,201,await response.clone().text());
        const row=(await response.json()).campaign;independentCampaigns.push(row);return row;
      };
      for(const slug of ['3eme-info-weekend','3eme-info-revision','3eme-info-introduction'])await create(slug,'3eme','informatique');
      await create('bac-sciences-weekend','bac','sciences');
      const allSections=await create('3eme-toutes-sections','3eme',null);
      assert.equal(allSections.target_branch,null);
      assert.equal(independentCampaigns.filter(row=>row.target_class==='3eme').length,4);
      const questionIds=[];
      for(const row of independentCampaigns){
        const response=await call('/api/session/admin/questions',adminJar,{campaignId:row.id,text:'Question '+row.slug,type:'multiple_choice',options:['a','b'],correct_answer:'a',order_index:0});
        assert.equal(response.status,201,await response.clone().text());
        const questions=(await(await call('/api/session/questions?slug='+row.slug)).json()).questions;
        assert.equal(questions.length,1);assert.equal(questions[0].text,'Question '+row.slug);questionIds.push(questions[0].id);
        const page=await call('/session/'+row.slug);assert.equal(page.status,200);assert.ok((await page.text()).includes(row.title));
      }
      assert.equal(new Set(questionIds).size,independentCampaigns.length);
      const first=independentCampaigns[0],second=independentCampaigns[1],guest=jar(existing);
      const firstAttempt=(await(await call(startPath,guest,{slug:first.slug})).json()).attempt;
      const secondAttempt=(await(await call(startPath,guest,{slug:second.slug})).json()).attempt;
      assert.notEqual(firstAttempt.id,secondAttempt.id);
      assert.equal((await call(submitPath,guest,{slug:first.slug,answers:{[questionIds[1]]:'a'}})).status,400);
      assert.equal((await call(submitPath,guest,{slug:first.slug,answers:{[questionIds[0]]:'a'}})).status,200);
      assert.equal((await db.query('SELECT submitted_at FROM free_session_attempts WHERE id=$1',[secondAttempt.id])).rows[0].submitted_at,null);
      const profileBefore=(await db.query('SELECT * FROM users WHERE id=$1',[existing.id])).rows[0];
      assert.equal((await call('/api/session/member/profile',guest,{slug:first.slug,phone:'99123456',user_class:'1ere',user_branch:'lettres'})).status,200);
      assert.deepEqual((await db.query('SELECT * FROM users WHERE id=$1',[existing.id])).rows[0],profileBefore);
      const date=new Date(Date.now()+5*86400000).toISOString();
      const occurrence=async row=>{
        const response=await call('/api/session/admin/campaigns/'+row.id+'/occurrences',adminJar,{id:randomUUID(),startTime:date,duration:60});
        assert.equal(response.status,201,await response.clone().text());return(await response.json()).session;
      };
      const firstDate=await occurrence(first),secondDate=await occurrence(second);
      assert.notEqual(firstDate.id,secondDate.id);
      const meetings=(await db.query('SELECT zoom_meeting_id FROM live_sessions WHERE id=ANY($1)',[[firstDate.id,secondDate.id]])).rows;
      assert.equal(new Set(meetings.map(row=>row.zoom_meeting_id)).size,2);
      assert.equal((await call('/api/session/guest/claim',guest,{slug:first.slug,occurrenceId:secondDate.id})).status,409);
      assert.equal((await call('/api/session/guest/claim',guest,{slug:first.slug,occurrenceId:firstDate.id})).status,200);
      assert.equal((await call('/api/live/session/'+secondDate.id,guest)).status,404);
      const history=(await db.query('SELECT to_jsonb(a) row FROM free_session_attempts a WHERE id=$1',[firstAttempt.id])).rows;
      await db.query("UPDATE live_sessions SET status='completed' WHERE id=$1",[firstDate.id]);
      const future=await occurrence(first);assert.notEqual(future.id,firstDate.id);
      assert.deepEqual((await db.query('SELECT to_jsonb(a) row FROM free_session_attempts a WHERE id=$1',[firstAttempt.id])).rows,history);
      assert.equal((await db.query('SELECT count(*)::int n FROM free_session_reservations WHERE live_session_id=$1',[firstDate.id])).rows[0].n,1);
      assert.equal((await call('/api/session/register',jar(),{slug:campaign.slug,full_name:'Missing profile',email:'missing-profile@example.invalid',phone:'22123456'})).status,400);
      assert.equal((await db.query("SELECT count(*)::int n FROM session_registrations WHERE email='missing-profile@example.invalid'")).rows[0].n,0);
      assert.equal((await call('/api/session/register',jar(),{slug:allSections.slug,full_name:'Open section',email:'open-section@example.invalid',phone:'22123456',branch:'sciences'})).status,202);
      assert.deepEqual((await db.query("SELECT track,filier FROM session_registrations WHERE email='open-section@example.invalid'")).rows[0],{track:'3eme',filier:'sciences'});
      // Existing offer targeting consumes the exact saved users.class/users.branch fields.
      const eligible=(await db.query("INSERT INTO offers(title,fixed_price,target_classes,target_branches) VALUES('2ème Info compatible',60,ARRAY['2eme'],ARRAY['informatique']) RETURNING id")).rows[0].id;
      const other=(await db.query("INSERT INTO offers(title,fixed_price,target_classes,target_branches) VALUES('Bac only',60,ARRAY['bac'],ARRAY['sciences']) RETURNING id")).rows[0].id;
      const targeted=(await db.query("SELECT id FROM users WHERE email='targeted@example.invalid'")).rows[0];
      const {offers}=await(await call('/api/offers',jar({...targeted,role:'user'}))).json();
      assert.ok(offers.some(row=>row.id===eligible));assert.ok(!offers.some(row=>row.id===other));
      assert.equal((await db.query('SELECT count(*)::int n FROM enrollments WHERE user_id=$1',[targeted.id])).rows[0].n,0);
    });

    await t.test('historical slugs redirect directly, cannot be hijacked and survive concurrent admin renames',async()=>{
      const first=independentCampaigns[0],other=independentCampaigns[1];
      const update=(row,slug,is_active=true)=>call('/api/session/admin/campaigns/'+row.id,adminJar,{slug,title:row.title,description:row.description,subject:row.subject,target_class:row.target_class,target_branch:row.target_branch,scheduled_at:null,duration_minutes:60,is_active,is_default:false},'PUT');
      const before=(await db.query('SELECT to_jsonb(a) row FROM free_session_attempts a WHERE campaign_id=$1 ORDER BY id',[first.id])).rows;
      for(const slug of ['3eme-info-weekend-v2','3eme-info-weekend-v3'])assert.equal((await update(first,slug)).status,200);
      for(const old of [first.slug,'3eme-info-weekend-v2']){
        const response=await call('/session/'+old+'?utm_source=advert&next=https%3A%2F%2Fevil.invalid');
        assert.equal(response.status,302);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('location'),'/session/3eme-info-weekend-v3?utm_source=advert&next=https%3A%2F%2Fevil.invalid');
        const meta=await(await call('/api/session/campaign?slug='+old)).json();assert.equal(meta.campaign.id,first.id);
      }
      assert.equal((await update(other,first.slug)).status,409);
      assert.equal((await update(first,first.slug)).status,200,'rename back to own old slug is allowed');
      const concurrent=await Promise.all([update(first,'3eme-info-concurrent-one'),update(first,'3eme-info-concurrent-two')]);
      assert.ok(concurrent.every(response=>response.status===200));
      const current=(await db.query('SELECT slug FROM free_sessions WHERE id=$1',[first.id])).rows[0].slug;
      for(const old of [first.slug,'3eme-info-weekend-v2','3eme-info-weekend-v3','3eme-info-concurrent-one','3eme-info-concurrent-two']){
        const response=await call('/session/'+old);assert.equal(response.status,old===current?200:302);
        if(old!==current)assert.equal(response.headers.get('location'),'/session/'+current);
      }
      const collisions=await Promise.all([update(other,'unique-shared-alias'),update(independentCampaigns[2],'unique-shared-alias')]);
      assert.deepEqual(collisions.map(response=>response.status).sort(),[200,409]);
      for(const slug of ['admin','api','login','register','//evil.invalid','https://evil.invalid'])assert.equal((await update(first,slug)).status,400);
      const multiBranch=await call('/api/session/admin/campaigns/'+first.id,adminJar,{slug:current,title:first.title,target_class:'3eme',target_branch:['informatique','sciences'],scheduled_at:null,duration_minutes:60,is_active:true,is_default:false},'PUT');
      assert.equal(multiBranch.status,400,'specific branch lists cannot be silently stored in target_branch TEXT');
      for(const slug of ['admin','api','login','register'])await assert.rejects(db.query('UPDATE free_sessions SET slug=$2 WHERE id=$1',[first.id,slug]),{code:'23514'});
      await assert.rejects(db.query('UPDATE free_session_slug_aliases SET free_session_id=$2 WHERE slug=$1',[first.slug,other.id]),{code:'23514'});
      assert.deepEqual((await db.query('SELECT to_jsonb(a) row FROM free_session_attempts a WHERE campaign_id=$1 ORDER BY id',[first.id])).rows,before);
      assert.equal((await update(first,current,false)).status,200);
      assert.equal((await update(other,first.slug)).status,409,'inactive campaigns keep their historical namespace');
      assert.equal((await call('/session/'+first.slug)).status,404);
      assert.equal((await call('/api/session/questions?slug='+first.slug)).status,404);
      assert.equal((await update(first,current,true)).status,200);
    });

    if(process.env.TIMED_QA_CHROME)await t.test('existing admin campaign editor includes responsive occurrence controls',async()=>{
      await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until,errors,screenshot})=>{
        for(const width of [360,390,1440]){
          await open('/admin/pages/free-session.html',token(admin),width);
          await until(()=>evaluate("typeof campaigns!=='undefined' && campaigns.length>0 && typeof loadCampaignFunnel==='function'"),'admin campaigns');
          await evaluate("selectCampaign('"+campaign.id+"')");
          await until(()=>evaluate("!document.querySelector('#campaign-funnel-manager').hidden && document.querySelector('#campaign-funnel-manager h2')"),'occurrence manager');
          assert.equal(await evaluate("document.querySelector('#campaign-funnel-manager').scrollWidth>document.querySelector('#campaign-funnel-manager').clientWidth+1"),false);
          await evaluate("document.querySelector('#campaign-funnel-manager').scrollIntoView({block:'start'})");
          if(process.env.FREE_QA_SCREENSHOTS)await screenshot(process.env.FREE_QA_SCREENSHOTS+'-admin-'+width+'.png');
        }
        assert.deepEqual(errors,[]);
      });
    });

    if (process.env.TIMED_QA_CHROME) await t.test('empty campaign shows preparation instead of an endless loading cursor', async () => {
      const response=await call('/api/session/admin/campaigns',adminJar,{slug:'empty-challenge',title:'Défi en préparation',subject:'Informatique',target_class:'3eme',target_branch:'informatique',scheduled_at:null,duration_minutes:90,is_active:true,is_default:false});
      assert.equal(response.status,201,await response.clone().text());
      assert.equal((await(await call('/api/session/campaign?slug=empty-challenge')).json()).count,0);
      await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until,errors})=>{
        for(const width of [320,390,1440]){
          await open('/session/empty-challenge','',width);
          await until(()=>evaluate("document.querySelector('#challenge-start').textContent==='Défi bientôt disponible'"),'empty campaign ready');
          assert.equal(await evaluate("document.querySelector('#challenge-start').disabled"),true);
          assert.equal(await evaluate("getComputedStyle(document.querySelector('#challenge-start')).cursor"),'not-allowed');
          assert.match(await evaluate("document.querySelector('#guest-note').textContent"),/questions.*préparation/);
          assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
        }
        assert.deepEqual(errors,[]);
      });
    });

    if (process.env.TIMED_QA_CHROME) await t.test('public quiz at 320/375/390/430/768/1440px with keyboard ordering and resume', async () => {
      await withTimedOfferBrowser(process.env.TIMED_QA_CHROME, origin, async ({ open, evaluate, until, errors, screenshot,pressKey,command }) => {
        await open('/session/' + campaign.slug, '', 390);
        await until(() => evaluate("document.querySelector('#challenge-start').textContent==='Commencer le défi gratuit'"), 'campaign ready');
        assert.equal(await evaluate("performance.getEntriesByType('resource').some(r=>new URL(r.name).pathname==='/api/session/status')"),false,'new guest does not probe protected placement status');
        await evaluate("document.querySelector('#challenge-start').click()");
        await until(() => evaluate("document.querySelectorAll('.option-card').length===2"), 'question cards');
        await evaluate("document.querySelector('.option-card input').click();document.querySelector('#btn-next').click()");
        for (const width of [320, 375, 390, 430, 768, 1440]) {
          await open('/session/' + campaign.slug, '', width);
          await until(() => evaluate("document.querySelectorAll('.order-row').length===2"), 'resumed ordering question');
          assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false);
          if (process.env.FREE_QA_SCREENSHOTS) await screenshot(process.env.FREE_QA_SCREENSHOTS + '-' + width + '.png');
        }
        const renamed='decouverte-renamed';
        assert.equal((await call('/api/session/admin/campaigns/'+campaign.id,adminJar,{slug:renamed,title:campaign.title,description:campaign.description,subject:campaign.subject,target_class:null,target_branch:null,scheduled_at:null,duration_minutes:60,is_active:true,is_default:true},'PUT')).status,200);
        await command('Page.navigate',{url:origin+'/session/'+campaign.slug});
        await until(()=>evaluate("location.pathname==='/session/decouverte-renamed' && document.querySelectorAll('.order-row').length===2"),'quiz survives slug rename');
        await evaluate("document.querySelector('.order-row button:not(:disabled)').focus()");
        await pressKey("ArrowDown",40);
        assert.equal(await evaluate("document.querySelector('#btn-submit').disabled"),false,"keyboard ordering confirms an answer");
        await evaluate("document.querySelector('#btn-submit').click()");
        await until(() => evaluate("!document.querySelector('#result-panel').hidden || document.querySelector('#quiz-error').textContent"), 'server result');
        assert.equal(await evaluate("document.querySelector('#result-panel').hidden"),false,await evaluate("document.querySelector('#quiz-error').textContent"));
        assert.ok(!await evaluate("document.querySelector('#result-panel').textContent.includes('20%')"));
        await evaluate("document.querySelector('#save-result').click()");
        assert.equal(await evaluate("document.querySelector('#identity-panel').hidden"), false);
        assert.equal(await evaluate("document.querySelector('#profile-class').closest('label').hidden"),false,'open campaign retains normal selection');
        await open('/session/2eme-info','',390);
        await until(()=>evaluate("document.querySelector('#challenge-start').disabled===false"),'targeted landing');
        await evaluate("document.querySelector('#challenge-start').click()");
        await until(()=>evaluate("document.querySelector('.option-card input')!==null"),'targeted quiz');
        await evaluate("document.querySelector('.option-card input').click();document.querySelector('#btn-submit').click()");
        await until(()=>evaluate("document.querySelector('#result-panel').hidden===false"),'targeted result');
        await evaluate("document.querySelector('#save-result').click()");
        assert.equal(await evaluate("document.querySelector('#profile-class').closest('label').hidden && document.querySelector('#profile-branch').closest('label').hidden"),true);
        assert.match(await evaluate("document.querySelector('#campaign-profile-info').textContent"),/2ème.*Informatique/);
        assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
        assert.deepEqual(errors, []);
      });
    });
    await t.test('published occurrence migration, server-owned reservations and final registration journey',async()=>{
      const publicationFile='202611260005_free_campaign_public_occurrence.sql';
      const beforeHistory=(await db.query('SELECT to_jsonb(r) AS row FROM free_session_reservations r ORDER BY live_session_id,user_id')).rows;
      files.set(publicationFile,await readFile(new URL('../../database/pending-migrations/'+publicationFile,import.meta.url),'utf8'));
      const runs=await Promise.all([runMigrations(db,files),runMigrations(db,files)]);
      runs.forEach(result=>assert.equal(result.code,0,result.logs.join('\n')));
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1',[publicationFile])).rows[0].n,1);
      assert.deepEqual((await db.query('SELECT to_jsonb(r) AS row FROM free_session_reservations r ORDER BY live_session_id,user_id')).rows,beforeHistory);
      const response=await call('/api/session/admin/campaigns',adminJar,{slug:'published-flow',title:'Algorithmique — 3ème',subject:'Informatique',target_class:'3eme',target_branch:'informatique',scheduled_at:null,duration_minutes:90,is_active:true,is_default:false});
      assert.equal(response.status,201);const c=(await response.json()).campaign;
      const question=(await db.query(`INSERT INTO session_questions(text,type,options,correct_answer,free_session_id) VALUES('Quelle réponse ?','multiple_choice','["a","b"]','"a"',$1) RETURNING id`,[c.id])).rows[0].id;
      const occurrence=async days=>{const res=await call('/api/session/admin/campaigns/'+c.id+'/occurrences',adminJar,{id:randomUUID(),startTime:new Date(Date.now()+days*86400000).toISOString(),duration:90});assert.equal(res.status,201);return(await res.json()).session;};
      const first=await occurrence(7),second=await occurrence(14),third=await occurrence(21);
      const publication='/api/session/admin/campaigns/'+c.id+'/public-occurrence';
      const metadata=async()=> (await(await call('/api/session/campaign?slug='+c.slug)).json());
      assert.equal((await metadata()).session,null,'no implicit earliest date');
      assert.equal((await call(publication,jar(existing),{occurrenceId:first.id},'PUT')).status,403);
      assert.equal((await call(publication,adminJar,{occurrenceId:one.id},'PUT')).status,409,'other campaign rejected');
      await assert.rejects(db.query('UPDATE free_sessions SET published_occurrence_id=$2 WHERE id=$1',[c.id,one.id]),error=>error.code==='23503');
      assert.equal((await call(publication,adminJar,{occurrenceId:first.id},'PUT')).status,200);
      assert.equal((await metadata()).session.id,first.id);
      assert.equal((await call('/api/session/register',jar(),{slug:c.slug,full_name:'Too early',email:'before-quiz@example.invalid',phone:'22112236'})).status,401,'registration requires submitted owned result');
      const submit=async visitor=>{assert.equal((await call(startPath,visitor,{slug:c.slug})).status,200);assert.equal((await call(submitPath,visitor,{slug:c.slug,answers:{[question]:'a'}})).status,200);};
      const member=jar(existing),profile=(await db.query('SELECT to_jsonb(u) AS row FROM users u WHERE id=$1',[existing.id])).rows;
      await submit(member);
      const confirmations=await Promise.all([1,2].map(()=>call('/api/session/guest/claim',member,{slug:c.slug,occurrenceId:third.id})));
      for(const res of confirmations){assert.equal(res.status,200);assert.equal((await res.json()).session.id,first.id,'client cannot choose a date');}
      assert.deepEqual((await db.query('SELECT to_jsonb(u) AS row FROM users u WHERE id=$1',[existing.id])).rows,profile);
      assert.equal((await db.query('SELECT count(*)::int n FROM free_session_reservations WHERE live_session_id=$1 AND user_id=$2',[first.id,existing.id])).rows[0].n,1);
      await call(publication,adminJar,{occurrenceId:second.id},'PUT');
      assert.equal((await(await call('/api/session/guest/claim',member,{slug:c.slug})).json()).session.id,first.id,'confirmed reservation never moved');
      const newcomer=jar();await submit(newcomer);
      await call(publication,adminJar,{occurrenceId:third.id},'PUT');
      const mailBefore=emails.length;
      const registration=await call('/api/session/register',newcomer,{slug:c.slug,full_name:'Final student',email:'final-flow@example.invalid',phone:'22112233',occurrenceId:first.id,track:'1ere',branch:'lettres'});
      assert.equal(registration.status,202,await registration.clone().text());assert.equal(emails.length,mailBefore+1);
      const verifiedJar=jar();assert.equal((await call('/api/session/verify',verifiedJar,{token:emails.at(-1).token})).status,200);
      await call(publication,adminJar,{occurrenceId:second.id},'PUT');
      const activations=await Promise.all([1,2].map(()=>call('/api/session/set-password',verifiedJar,{password:'final-test-password'})));
      assert.deepEqual(activations.map(res=>res.status).sort(),[200,409],'concurrent registration creates one account');
      const activated=activations.find(res=>res.status===200);
      const confirmation=await activated.json();assert.equal(confirmation.reserved,true);assert.equal(confirmation.session.id,second.id,'finalization uses latest publication');
      const finalUser=(await db.query("SELECT * FROM users WHERE email='final-flow@example.invalid'")).rows[0];assert.equal(finalUser.class,'3eme');assert.equal(finalUser.branch,'informatique');
      assert.equal((await call('/api/live/session/'+second.id,jar(finalUser))).status,200);
      assert.equal((await call('/api/live/session/'+third.id,jar(finalUser))).status,404);
      assert.equal((await db.query('SELECT count(*)::int n FROM enrollments WHERE user_id=$1',[finalUser.id])).rows[0].n,0);
      const loggedOut=jar();await submit(loggedOut);
      const signed=await call('/api/auth/login',loggedOut,{email:'final-flow@example.invalid',password:'final-test-password'});assert.equal(signed.status,200,await signed.clone().text());
      assert.equal((await call('/api/session/guest/claim',loggedOut,{slug:c.slug})).status,200,'guest result survives existing-account login');
      assert.equal((await db.query("SELECT count(*)::int n FROM users WHERE email='final-flow@example.invalid'")).rows[0].n,1);
      const sections='/api/session/admin/campaigns/'+c.id+'/target-sections';
      assert.equal((await call(sections,adminJar,{sections:['informatique','sciences']},'PUT')).status,200);
      assert.deepEqual((await metadata()).campaign.target_branches,['informatique','sciences']);
      const branchGuest=jar();await submit(branchGuest);
      const payload={slug:c.slug,full_name:'Section student',email:'section-flow@example.invalid',phone:'22112234',track:'1ere'};
      assert.equal((await call('/api/session/register',branchGuest,{...payload,branch:'lettres'})).status,400);
      assert.equal((await call('/api/session/register',branchGuest,{...payload,branch:'sciences'})).status,202);
      const branchVerified=jar();await call('/api/session/verify',branchVerified,{token:emails.at(-1).token});
      assert.equal((await call('/api/session/set-password',branchVerified,{password:'section-test-password'})).status,200);
      assert.deepEqual((await db.query("SELECT class,branch FROM users WHERE email='section-flow@example.invalid'")).rows[0],{class:'3eme',branch:'sciences'});
      const googleSections=jar();await submit(googleSections);
      googlePayload={sub:'google-subset-final',email:'google-subset-final@gmail.com',email_verified:true,name:'Google section student'};
      assert.equal((await call('/api/auth/google',googleSections,{credential:'mock-google-token'})).status,200);
      assert.equal((await call('/api/session/member/profile',googleSections,{slug:c.slug,phone:'22112235',user_class:'1ere',user_branch:'lettres'})).status,400);
      assert.equal((await call('/api/session/member/profile',googleSections,{slug:c.slug,phone:'22112235',user_class:'1ere',user_branch:'sciences'})).status,200);
      assert.equal((await call('/api/session/guest/claim',googleSections,{slug:c.slug})).status,200);
      assert.deepEqual((await db.query('SELECT class,branch FROM users WHERE email=$1',[googlePayload.email])).rows[0],{class:'3eme',branch:'sciences'});
      await assert.rejects(db.query("UPDATE free_sessions SET target_branches=ARRAY['forged'] WHERE id=$1",[c.id]),error=>error.code==='23514');
      if(process.env.TIMED_QA_CHROME)await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until,errors,command})=>{
        for(const width of [320,375,390,430,768,1440]){
          await open('/session/'+c.slug,'',width);await until(()=>evaluate("document.querySelector('#challenge-start').disabled===false"),'published card');
          assert.equal(await evaluate("document.querySelector('#occurrence-select')"),null);
          assert.match(await evaluate("document.querySelector('#public-session-duration').textContent"),/90 min/);
          assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
        }
        await evaluate("document.querySelector('#challenge-start').click()");await until(()=>evaluate("!!document.querySelector('.option-card input')"),'anonymous first quiz');
        assert.equal(await evaluate("document.querySelector('#identity-panel').hidden"),true);
        await evaluate("document.querySelector('.option-card input').click();document.querySelector('#btn-submit').click()");await until(()=>evaluate("!document.querySelector('#result-panel').hidden"),'result before identity');
        assert.equal(await evaluate("document.querySelector('#identity-panel').hidden"),true);
        await evaluate("document.querySelector('#save-result').click()");
        assert.equal(await evaluate("document.querySelector('#profile-class').closest('label').hidden"),true);
        assert.equal(await evaluate("[...document.querySelector('#profile-branch').options].filter(o=>o.value&&!o.disabled).map(o=>o.value).join(',')"),'informatique,sciences');
        await command('Network.deleteCookies',{name:'synta_free_'+c.id.replaceAll('-',''),url:origin+'/api/session'});
        await open('/session/'+c.slug,token(stranger),390);await until(()=>evaluate("document.querySelector('#challenge-start').disabled===false"),'member landing');
        await evaluate("document.querySelector('#challenge-start').click()");await until(()=>evaluate("!!document.querySelector('.option-card input')"),'member quiz');
        await evaluate("document.querySelector('.option-card input').click();document.querySelector('#btn-submit').click()");await until(()=>evaluate("document.querySelector('#reservation-confirmation').textContent.includes('Ta place est réservée')"),'automatic member reservation');
        assert.equal(await evaluate("document.querySelector('#identity-panel').hidden"),true);
        assert.equal(await evaluate("document.querySelector('#save-result').hidden"),true);
        assert.deepEqual(errors,[]);
      });
      if(process.env.TIMED_QA_CHROME)await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until,command,errors})=>{
        await open('/session/'+c.slug,'',390);await until(()=>evaluate("!document.querySelector('#challenge-start').disabled"),'new student landing');
        await evaluate("document.querySelector('#challenge-start').click()");await until(()=>evaluate("!!document.querySelector('.option-card input')"),'new student quiz');
        await evaluate("document.querySelector('.option-card input').click();document.querySelector('#btn-submit').click()");await until(()=>evaluate("!document.querySelector('#result-panel').hidden"),'new student result');
        await evaluate("document.querySelector('#save-result').click();document.querySelector('#full_name').value='Browser student';document.querySelector('#email').value='browser-final@example.invalid';document.querySelector('#phone').value='22112236';document.querySelector('#profile-branch').value='sciences';document.querySelector('#identity-form').requestSubmit()");
        await until(()=>evaluate("document.querySelector('#identity-notice').textContent.includes('confirmation')"),'verification email sent');
        assert.equal(emails.at(-1).email,'browser-final@example.invalid');
        await command('Page.navigate',{url:origin+'/session/'+c.slug+'#placement='+encodeURIComponent(emails.at(-1).token)});
        await until(()=>evaluate("!document.querySelector('#result-panel').hidden || document.querySelector('#experience-error').textContent"),'email preserves result');
        assert.equal(await evaluate("document.querySelector('#result-panel').hidden"),false,await evaluate("JSON.stringify({error:document.querySelector('#experience-error').textContent,identity:document.querySelector('#identity-panel').hidden,url:location.pathname,errors:document.querySelector('#identity-error').textContent})"));
        await command('Page.reload');
        await until(()=>evaluate("!document.querySelector('#result-panel').hidden && document.querySelector('#save-result').textContent.includes('Créer mon compte')"),'verified recovery after refresh');
        await evaluate("document.querySelector('#save-result').click();document.querySelector('#modal-password').value='browser-final-password';document.querySelector('#modal-password-confirm').value='browser-final-password';document.querySelector('#password-form').requestSubmit()");
        await until(()=>evaluate("document.querySelector('#reservation-confirmation').textContent.includes('réservée')"),'email account automatically reserved');
        assert.equal(await evaluate("document.querySelector('#identity-panel').hidden"),true);
        assert.deepEqual(errors,[]);
      });
      if(process.env.TIMED_QA_CHROME)await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until,command,errors})=>{
        await open('/session/'+c.slug,'',390);await until(()=>evaluate("!document.querySelector('#challenge-start').disabled"),'logged-out landing');
        await evaluate("document.querySelector('#challenge-start').click()");await until(()=>evaluate("!!document.querySelector('.option-card input')"),'logged-out quiz');
        await evaluate("document.querySelector('.option-card input').click();document.querySelector('#btn-submit').click()");await until(()=>evaluate("!document.querySelector('#result-panel').hidden"),'logged-out result');
        await command('Page.navigate',{url:origin+'/login?next='+encodeURIComponent('/session/'+c.slug)});
        await until(()=>evaluate("!!document.querySelector('#loginForm')"),'normal login');
        await evaluate("document.querySelector('#email').value='final-flow@example.invalid';document.querySelector('#password').value='final-test-password';document.querySelector('#loginForm').requestSubmit()");
        await until(()=>evaluate("location.pathname==='/session/published-flow' && document.querySelector('#reservation-confirmation')?.textContent.includes('Ta place est réservée')"),'login claims guest result without registration');
        assert.equal(await evaluate("document.querySelector('#identity-panel').hidden"),true);
        assert.deepEqual(errors,[]);
      });
      if(process.env.TIMED_QA_CHROME)await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until,errors})=>{
        for(const width of [360,390,1440]){
          await open('/admin/pages/free-session.html',token(admin),width);
          await until(()=>evaluate("typeof loadCampaignFunnel==='function' && typeof campaigns!=='undefined' && campaigns.length>0"),'admin publication loaded');
          await evaluate('selectCampaign('+JSON.stringify(c.id)+')');
          await until(()=>evaluate("document.querySelector('#campaign-funnel-manager').dataset.campaignId==="+JSON.stringify(c.id)+" && !!document.querySelector('.campaign-sections-form')"),'allowed section controls');
          assert.equal(await evaluate("document.querySelectorAll('.campaign-sections-form input:checked').length"),2);
          assert.equal(await evaluate("[...document.querySelectorAll('#campaign-funnel-manager button')].some(b=>b.textContent==='Date publiée sur le lien public')"),true);
          assert.equal(await evaluate("document.querySelector('#campaign-funnel-manager').scrollWidth>document.querySelector('#campaign-funnel-manager').clientWidth+1"),false);
        }
        await evaluate("[...document.querySelectorAll('#campaign-funnel-manager button')].find(b=>b.textContent==='Ne publier aucune date').click()");
        await until(()=>evaluate("[...document.querySelectorAll('#campaign-funnel-manager button')].some(b=>b.textContent==='Ne publier aucune date'&&b.disabled)"),'unpublish works');
        await evaluate("[...document.querySelectorAll('#campaign-funnel-manager button')].find(b=>b.textContent==='Publier cette date').click()");
        await until(()=>evaluate("[...document.querySelectorAll('#campaign-funnel-manager button')].some(b=>b.textContent==='Date publiée sur le lien public')"),'publish works');
        assert.deepEqual(errors,[]);
      });
      await call(publication,adminJar,{occurrenceId:second.id},'PUT');
      const raceGuest=jar();await submit(raceGuest);raceGuest.set('synta_access',token(created));
      const raced=await Promise.all([call(publication,adminJar,{occurrenceId:first.id},'PUT'),call('/api/session/guest/claim',raceGuest,{slug:c.slug,occurrenceId:third.id})]);
      raced.forEach(res=>assert.equal(res.status,200));const racedResult=await raced[1].json();assert.ok([first.id,second.id].includes(racedResult.session.id));
      const cancel='/api/session/admin/campaigns/'+c.id+'/occurrences/'+first.id;
      const cancellationStudent=await createUser('cancel-race@example.invalid'),cancellationGuest=jar(cancellationStudent);await submit(cancellationGuest);
      const cancelled=await Promise.all([call(publication,adminJar,{occurrenceId:first.id},'PUT'),call(cancel,adminJar,{action:'cancelled',expectedStartTime:new Date(first.scheduled_at).toISOString()},'PATCH'),call('/api/session/guest/claim',cancellationGuest,{slug:c.slug})]);
      assert.equal(cancelled[1].status,200);assert.ok([200,409].includes(cancelled[0].status));assert.equal((await metadata()).session,null);
      assert.equal(cancelled[2].status,200);
      assert.equal((await db.query("SELECT count(*)::int n FROM free_session_reservations WHERE live_session_id=$1 AND status='reserved'",[first.id])).rows[0].n,0,'cancellation leaves no active reservations regardless of claim order');
      assert.equal((await call(publication,adminJar,{occurrenceId:first.id},'PUT')).status,409);
      await db.query("UPDATE live_sessions SET scheduled_at=now()-interval '1 day' WHERE id=$1",[third.id]);
      assert.equal((await call(publication,adminJar,{occurrenceId:third.id},'PUT')).status,409);
      assert.equal((await call(publication,adminJar,{occurrenceId:null},'PUT')).status,200);
      const noDate=jar();await submit(noDate);noDate.set('synta_access',token(admin));assert.equal((await call('/api/session/guest/claim',noDate,{slug:c.slug})).status,403);
      noDate.set('synta_access',token(finalUser));const absent=await call('/api/session/guest/claim',noDate,{slug:c.slug});assert.equal(absent.status,200);assert.equal((await absent.json()).reserved,false);
      const undatedGuest=jar();await submit(undatedGuest);
      assert.equal((await call('/api/session/register',undatedGuest,{slug:c.slug,full_name:'No date student',email:'no-date-final@example.invalid',phone:'22112237',branch:'sciences'})).status,202);
      const undatedVerified=jar();await call('/api/session/verify',undatedVerified,{token:emails.at(-1).token});
      const undatedActivation=await call('/api/session/set-password',undatedVerified,{password:'no-date-final-password'});assert.equal(undatedActivation.status,200);
      const undatedResult=await undatedActivation.json();assert.equal(undatedResult.reserved,false);assert.equal(undatedResult.session,null,'unpublished dates never leak through activation response');
      if(process.env.TIMED_QA_CHROME)await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,origin,async({open,evaluate,until})=>{await open('/session/'+c.slug,'',390);await until(()=>evaluate("document.querySelector('#upcoming-date').textContent.includes('annoncée bientôt')"),'no published date');assert.equal(await evaluate("document.querySelector('#occurrence-select')"),null);});
    });
    assert.equal((await db.query('SELECT balance FROM users WHERE id=$1', [existing.id])).rows[0].balance, '300.00');
    assert.equal((await db.query('SELECT signup_source FROM users WHERE id=$1', [existing.id])).rows[0].signup_source, null);
  } finally {
    access.setFreeReservationAccess(false); access.setFreeSessionAccess(false);
    if (server) await new Promise(resolve => server.close(resolve));
    await routePool?.end(); await db?.end(); await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await maintenance.end();
    for (const key of keys) { if (beforeEnv[key] === undefined) delete process.env[key]; else process.env[key] = beforeEnv[key]; }
  }
});
