import {runMigrations} from './migration-runner-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { once } from 'node:events';
import { enrollmentAccess } from '../utils/offerAccess.js';

const root = new URL('../../database/', import.meta.url);

// Execute the actual runner against a disposable pool. The virtual file inventory lets
// us validate held files without promoting them or editing the deployment manifest.
test('production readiness: migration compatibility, financial preservation and runner failure safety', {
  skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 90000
}, async t => {
  const connection = { host: '127.0.0.1', port: Number(process.env.BUGI_QA_POSTGRES_PORT),
    user: 'bugi_qa', password: 'bugi-synthetic-local-only', ssl: false };
  const maintenance = new pg.Pool({ ...connection, database: 'postgres' });
  const approved = new Map();
  for (const file of (await readdir(new URL('migrations/', root))).sort()) {
    if (file.endsWith('.sql')) approved.set(file, await readFile(new URL('migrations/' + file, root), 'utf8'));
  }
  const held = new Map();
  for (const file of ['202611200002_extend_live_session_access.sql','202611200004_live_session_multi_audience.sql']) {
    if (file.endsWith('.sql')) held.set(file, await readFile(new URL('pending-migrations/' + file, root), 'utf8'));
  }
  const freeFile = '202611250002_free_session_campaigns.sql';
  const customFile = '202611250003_custom_installment_amounts.sql';
  const compatibilityFile = '202611260001_live_session_shape_compatibility.sql';
  const aliasFile = '202611260002_free_session_slug_aliases.sql';
  try {
    for (const heldFirst of [true, false]) {
      await t.test(heldFirst ? 'held access migrations before free/custom' : 'free/custom before held access migrations', async () => {
        const name = 'readiness_' + randomUUID().replaceAll('-', '');
        await maintenance.query(`CREATE DATABASE "${name}"`);
        const db = new pg.Pool({ ...connection, database: name });
        try {
          await db.query(await readFile(new URL('schema_postgres.sql', root), 'utf8'));
          const before = new Map([...approved].filter(([file]) => ![freeFile, customFile, compatibilityFile, aliasFile,'202611250004_free_session_funnel.sql','202611260005_free_campaign_public_occurrence.sql'].includes(file)));
          assert.equal((await runMigrations(db, before)).code, 0);
          const user = (await db.query("INSERT INTO users(email,password_hash,name,balance) VALUES('readiness@example.invalid','synthetic','Readiness',123.45) RETURNING id")).rows[0].id;
          const course = (await db.query("INSERT INTO courses(title) VALUES('Readiness') RETURNING id")).rows[0].id;
          const offer = (await db.query(`WITH term AS (SELECT current_date+180 AS cutoff)
            INSERT INTO offers(title,fixed_price,access_mode,academic_year_start,access_cutoff_date)
            SELECT 'Annual',390,'academic_year',EXTRACT(YEAR FROM cutoff)::int-(EXTRACT(MONTH FROM cutoff)<9)::int,cutoff FROM term RETURNING id`)).rows[0].id;
          await db.query('INSERT INTO offer_courses(offer_id,course_id) VALUES($1,$2)', [offer, course]);
          await db.query('INSERT INTO enrollments(user_id,course_id,offer_id,progress) VALUES($1,$2,$3,42)', [user, course, offer]);
          const payment = (await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,100,'timed_wallet_completed') RETURNING id", [user, offer])).rows[0].id;
          const transaction = (await db.query("INSERT INTO transactions(user_id,amount,type,status) VALUES($1,100,'purchase','completed') RETURNING id", [user])).rows[0].id;
          const grant = (await db.query(`INSERT INTO offer_access_grants
            (user_id,offer_id,payment_id,request_id,request_fingerprint,access_mode,starts_at,expires_at)
            SELECT $1,$2,$3,$4,repeat('a',64),'academic_year',now()-interval '10 days',((access_cutoff_date+1)::timestamp AT TIME ZONE 'Africa/Tunis') FROM offers WHERE id=$2 RETURNING id`,
          [user, offer, payment, randomUUID()])).rows[0].id;
          await db.query('INSERT INTO offer_access_grant_courses(grant_id,course_id) VALUES($1,$2)', [grant, course]);
          const arrangement = (await db.query(`INSERT INTO offer_installment_arrangements
            (user_id,offer_id,quoted_price,required_initial_payment,quoted_access_mode,quoted_academic_year_start,quoted_cutoff_date,grant_id,paid_total)
            SELECT $1,$2,390,100,'academic_year',academic_year_start,access_cutoff_date,$3,100 FROM offers WHERE id=$2 RETURNING id`, [user, offer, grant])).rows[0].id;
          await db.query('INSERT INTO offer_installment_schedule(arrangement_id,position,amount,due_date) VALUES($1,1,100,current_date),($1,2,100,NULL),($1,3,190,current_date+90)', [arrangement]);
          await db.query(`INSERT INTO offer_installment_payments(arrangement_id,request_id,request_fingerprint,transaction_id,amount,source)
            VALUES($1,$2,repeat('b',64),$3,100,'wallet')`, [arrangement, randomUUID(), transaction]);
          const moduleId=(await db.query("INSERT INTO modules(course_id,title) VALUES($1,'Progress module') RETURNING id",[course])).rows[0].id;
          const lessonId=(await db.query("INSERT INTO lessons(module_id,title,type) VALUES($1,'Progress lesson','video') RETURNING id",[moduleId])).rows[0].id;
          await db.query('INSERT INTO lesson_progress(user_id,lesson_id,completed,progress_percentage,last_position) VALUES($1,$2,true,95,120)',[user,lessonId]);
          const snapshot = async () => {
            const result = {};
            // Fixed internal table names only. Compare complete financial rows, not just totals.
            for (const table of ['lesson_progress', 'enrollments', 'payments', 'transactions', 'offer_access_grants', 'offer_access_grant_courses',
              'offer_installment_arrangements', 'offer_installment_schedule', 'offer_installment_payments']) {
              result[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
            }
            result.balances = (await db.query('SELECT id,balance,password_hash FROM users ORDER BY id')).rows;
            result.access = (await db.query(`SELECT ${enrollmentAccess('e')} AS allowed FROM enrollments e WHERE user_id=$1`, [user])).rows;
            return result;
          };
          const original = await snapshot();
          if (heldFirst) {
            assert.equal((await runMigrations(db, new Map([...before, ...held]))).code, 0);
            const client=await db.connect();let existing;
            try{
              await client.query('BEGIN');
              existing=(await client.query("INSERT INTO live_sessions(title,scheduled_at,access_policy) VALUES('Existing OR',now(),'any_selected') RETURNING id")).rows[0].id;
              await client.query('INSERT INTO live_session_courses(session_id,course_id) VALUES($1,$2)',[existing,course]);
              await client.query('COMMIT');
            }finally{client.release();}
            const sessionBefore=(await db.query('SELECT to_jsonb(ls) AS row FROM live_sessions ls WHERE id=$1',[existing])).rows[0].row;
            const compatible=await runMigrations(db,new Map([...approved,...held]));
            assert.equal(compatible.code,0,compatible.logs.join('\n'));
            assert.ok((await db.query("SELECT to_regclass('free_sessions') AS value")).rows[0].value);
            const sessionAfter=(await db.query('SELECT to_jsonb(ls) AS row FROM live_sessions ls WHERE id=$1',[existing])).rows[0].row;
            assert.deepEqual(sessionAfter,{...sessionBefore,free_session_id:null,free_reservation_required:false});
            assert.equal((await db.query('SELECT count(*)::int AS n FROM live_session_courses WHERE session_id=$1',[existing])).rows[0].n,1);
            assert.deepEqual(await snapshot(),original);
          }
          const all = new Map([...approved, ...held]);
          assert.equal((await runMigrations(db, all)).code, 0);
          assert.deepEqual(await snapshot(), original);
          const onceFile='299901010000_once_probe.sql';
          all.set(onceFile,'CREATE TABLE readiness_once_probe(id INTEGER PRIMARY KEY); INSERT INTO readiness_once_probe VALUES(1);');
          const concurrent = await Promise.all([runMigrations(db, all), runMigrations(db, all)]);
          assert.ok(concurrent.every(result => result.code === 0));
          assert.equal(concurrent.flatMap(result=>result.logs).filter(line=>line==='[migrate] applied: '+onceFile).length,1);
          assert.equal((await db.query('SELECT count(*)::int AS n FROM readiness_once_probe')).rows[0].n,1);
          const repeated=await runMigrations(db,all);assert.equal(repeated.code,0);
          assert.equal(repeated.logs.some(line=>line.startsWith('[migrate] applied:')),false);
          assert.equal((await db.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, all.size-1); // original is superseded, never falsely recorded as executed
          assert.deepEqual(await snapshot(), original);

          // Valid OR rows now pass; deferred authorization-shape checks still reject no audience.
          await assert.rejects(db.query(`INSERT INTO live_sessions(title,scheduled_at,access_policy)
            VALUES('Missing OR audience',now(),'any_selected')`), /Select at least one course or offer/);
          const valid=await db.connect();
          try {await valid.query('BEGIN');
            const id=(await valid.query(`INSERT INTO live_sessions(title,scheduled_at,access_policy)
              VALUES('New OR',now(),'any_selected') RETURNING id`)).rows[0].id;
            await valid.query('INSERT INTO live_session_courses(session_id,course_id) VALUES($1,$2)',[id,course]);
            await valid.query('COMMIT');
          } finally {valid.release();}

          const failing = new Map([...all, ['299901010001_probe.sql', 'CREATE TABLE readiness_probe(id INT); SELECT 1/0;']]);
          assert.equal((await runMigrations(db, failing)).code, 1);
          assert.equal((await db.query("SELECT to_regclass('readiness_probe') AS value")).rows[0].value, null);
          assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE filename='299901010001_probe.sql'")).rows[0].n, 0);
          const changed = new Map(all); changed.set(customFile, all.get(customFile) + '\n-- edited applied file');
          assert.equal((await runMigrations(db, changed)).code, 1);
          assert.equal((await runMigrations(db, new Map([...all, ['299901010002_destructive.sql', 'DROP TABLE users;']]))).code, 1);
          assert.deepEqual(await snapshot(), original);
        } finally {
          await db.end();
          await maintenance.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        }
      });
    }
  } finally { await maintenance.end(); }
});

test('readiness: real campaign API preserves credentials, rejects replayed proofs and preserves open-campaign profile choices', {
  skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 45000
}, async () => {
  const connection = { host: '127.0.0.1', port: Number(process.env.BUGI_QA_POSTGRES_PORT),
    user: 'bugi_qa', password: 'bugi-synthetic-local-only', ssl: false };
  const maintenance = new pg.Pool({ ...connection, database: 'postgres' });
  const name = 'readiness_free_' + randomUUID().replaceAll('-', '');
  const secret = 'synthetic-readiness-only';
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  let db, server;
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
    db = new pg.Pool({ ...connection, database: name });
    await db.query(await readFile(new URL('schema_postgres.sql', root), 'utf8'));
    const files = new Map();
    for (const file of await readdir(new URL('migrations/', root))) {
      if (file.endsWith('.sql')&&!['202611250004_free_session_funnel.sql','202611260005_free_campaign_public_occurrence.sql'].includes(file)) files.set(file, await readFile(new URL('migrations/' + file, root), 'utf8'));
    }
    assert.equal((await runMigrations(db, files)).code, 0);
    const campaign = (await db.query('SELECT id FROM free_sessions WHERE is_default')).rows[0].id;
    const question = (await db.query(`INSERT INTO session_questions(text,type,options,correct_answer,free_session_id)
      VALUES('Question','multiple_choice','["A","B"]','"A"',$1) RETURNING id`, [campaign])).rows[0].id;
    const existing = (await db.query(`INSERT INTO users(email,password_hash,name,class,branch,balance)
      VALUES('existing-readiness@example.invalid','original-hash','Existing','bac','sciences',123.45) RETURNING *`)).rows[0];
    const emails = [];
    const context = vm.createContext({ process: { env: { JWT_SECRET: secret } }, console, Buffer });
    const source = new vm.SourceTextModule(await readFile(new URL('../routes/session.js', import.meta.url), 'utf8'), { context });
    await source.link(async specifier => {
      const values = specifier === '../config/db.js' ? { default: db }
        : specifier === '../services/email.js' ? { sendPlacementVerificationEmail: async (email, token) => emails.push({ email, token }) }
        : specifier === '../services/sessions.js' ? { startSession: async (_db, res, user) => res.cookie('synta_access', jwt.sign(user, secret)) }
        : specifier === '../utils/zoomClient.js' ? {
          createZoomMeeting: async () => { throw new Error('Zoom not expected in this security test'); },
          deleteZoomMeeting: async () => {}, rescheduleZoomMeeting: async () => {}
        } : await import(specifier.startsWith('../') ? new URL(specifier, new URL('../routes/session.js', import.meta.url)).href : specifier);
      return new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context });
    });
    await source.evaluate();
    const app = express(); app.use(express.json(), cookieParser()); app.use('/api/session', source.namespace.default);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const call = (path, body, cookie = '') => fetch(`http://127.0.0.1:${server.address().port}/api/session${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body)
    });
    const register = email => call('/register', { email, full_name: 'New learner', phone: '22123456', track:'2eme', branch:'informatique' });
    assert.equal((await register(existing.email)).status, 202);
    assert.equal(emails.length, 0);
    assert.equal((await call('/set-password', { password: 'new-password' })).status, 401);
    assert.equal((await call('/admin/campaigns')).status, 401);
    const studentCookie = 'synta_access=' + jwt.sign({ id: existing.id, role: 'user' }, secret);
    assert.equal((await call('/admin/campaigns', null, studentCookie)).status, 403);
    const publicQuestions = await (await call('/questions')).json();
    assert.equal(Object.hasOwn(publicQuestions.questions[0], 'correct_answer'), false);
    await register('fresh-readiness@example.invalid'); assert.equal(emails.length, 1);
    const verification = await call('/verify', { token: emails[0].token });
    assert.equal(verification.status, 200);
    assert.equal((await call('/verify', { token: emails[0].token })).status, 400);
    const placement = verification.headers.getSetCookie().find(value => value.startsWith('synta_placement=')).split(';')[0];
    assert.equal((await call('/set-password', { password: 'new-password' }, placement)).status, 409);
    const submitted = await call('/submit', { answers: { [question]: 'A' }, track: '2eme', branch: 'informatique' }, placement);
    assert.equal(submitted.status, 200); assert.equal((await submitted.json()).score, 1);
    const activations = await Promise.all([1, 2].map(() => call('/set-password', { password: 'new-password' }, placement)));
    assert.deepEqual(activations.map(response => response.status).sort(), [200, 409]);
    const registration = (await db.query("SELECT track,filier,auth_user_id FROM session_registrations WHERE email='fresh-readiness@example.invalid'")).rows[0];
    assert.equal(registration.track, '2eme'); assert.equal(registration.filier, 'informatique');
    const created = (await db.query('SELECT id,class,branch,password_hash FROM users WHERE id=$1', [registration.auth_user_id])).rows[0];
    assert.notEqual(created.password_hash, 'new-password');
    // Account activation must preserve the verified registration’s chosen school profile.
    assert.equal(created.class, '2eme'); assert.equal(created.branch, 'informatique');
    const member = await call('/member/submit', { answers: { [question]: 'A' }, userId: created.id }, studentCookie);
    assert.equal(member.status, 200);
    assert.equal((await call('/member/submit', { answers: { [question]: 'A' } }, studentCookie)).status, 409);
    assert.deepEqual((await db.query('SELECT * FROM users WHERE id=$1', [existing.id])).rows[0], existing);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM free_session_participants WHERE user_id=$1', [existing.id])).rows[0].n, 1);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db?.end(); await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await maintenance.end();
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  }
});
