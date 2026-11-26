import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { runMigrations } from './migration-runner-fixture.js';

const root = new URL('../../database/', import.meta.url);
const originalFile = '202611250002_free_session_campaigns.sql';
const repairFile = '202611260001_live_session_shape_compatibility.sql';
const customFile = '202611250003_custom_installment_amounts.sql';
const funnelFile = '202611250004_free_session_funnel.sql';
const aliasFile = '202611260002_free_session_slug_aliases.sql';
const digest = sql => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

test('session compatibility: historical ledgers, strict shapes, atomic failure and exact supersession', {
  skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 90000
}, async t => {
  const connection = { host: '127.0.0.1', port: Number(process.env.BUGI_QA_POSTGRES_PORT),
    user: 'bugi_qa', password: 'bugi-synthetic-local-only', ssl: false };
  const maintenance = new pg.Pool({ ...connection, database: 'postgres' });
  const files = new Map();
  for (const file of (await readdir(new URL('migrations/', root))).sort()) {
    if (file.endsWith('.sql')) files.set(file, await readFile(new URL('migrations/' + file, root), 'utf8'));
  }
  const held = new Map();
  for (const file of ['202611200002_extend_live_session_access.sql',
    '202611200004_live_session_multi_audience.sql', funnelFile]) {
    held.set(file, await readFile(new URL('pending-migrations/' + file, root), 'utf8'));
  }
  // Promoted 2026-11-26 after the production ledger snapshot, so production has not applied it yet.
  const refreshFile = '202611200001_create_refresh_tokens.sql';
  // Promoted 2026-11-26 (owner approval) after the ledger snapshot as well.
  const deactivationFile = '202611260003_user_account_deactivation.sql';
  const bugiUsageFile = '202611260004_bugi_daily_usage.sql';
  const before = new Map([...files].filter(([file]) => ![originalFile, repairFile, customFile, refreshFile, aliasFile, deactivationFile, bugiUsageFile].includes(file)));
  const withoutAliases = new Map([...files].filter(([file]) => file !== aliasFile));
  const full = new Map([...files, ...held]);
  async function isolated(run) {
    const name = 'session_compat_' + randomUUID().replaceAll('-', '');
    await maintenance.query(`CREATE DATABASE "${name}"`);
    const db = new pg.Pool({ ...connection, database: name });
    try {
      await db.query(await readFile(new URL('schema_postgres.sql', root), 'utf8'));
      const result = await runMigrations(db, before);
      assert.equal(result.code, 0, result.logs.join('\n'));
      await run(db);
    } finally {
      await db.end();
      await maintenance.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
  }
  async function recordOriginal(db) {
    // Model a previously deployed exact file, not a checksum override.
    await db.query('BEGIN');
    try {
      await db.query(files.get(originalFile));
      await db.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',
        [originalFile, digest(files.get(originalFile))]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }
  async function standard(db) {
    const course = (await db.query("INSERT INTO courses(title) VALUES('Legacy paid course') RETURNING id")).rows[0].id;
    const session = (await db.query(`INSERT INTO live_sessions(course_id,title,scheduled_at,zoom_meeting_id,replay_url)
      VALUES($1,'Existing Zoom session',now(),'123456789','private-existing-replay') RETURNING id`, [course])).rows[0].id;
    return { course, session };
  }
  try {
    await t.test('owner-supplied 20-file ledger matches; only approved pending files run and old receipts remain unchanged', () => isolated(async db => {
      const supplied = JSON.parse(await readFile(new URL('fixtures/production-migration-ledger-20261126.json', import.meta.url), 'utf8'));
      assert.equal(supplied.migrations.length, 20);
      for (const { filename, checksum } of supplied.migrations) assert.equal(digest(files.get(filename)), checksum, filename);
      await recordOriginal(db);
      const historicalFiles = new Map(supplied.migrations.map(({ filename }) => [filename, files.get(filename)]));
      // Complete the exact historical chain without invoking the new supersession runner.
      await db.query('BEGIN');
      await db.query(files.get(customFile));
      await db.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)', [customFile, digest(files.get(customFile))]);
      await db.query('COMMIT');
      assert.equal(historicalFiles.size, (await db.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n);
      const ledger = (await db.query('SELECT * FROM schema_migrations ORDER BY filename')).rows;
      const { session } = await standard(db);
      const campaign = (await db.query('SELECT id FROM free_sessions WHERE is_default')).rows[0].id;
      const free = (await db.query("INSERT INTO live_sessions(title,scheduled_at,free_session_id,zoom_meeting_id,status) VALUES('Production-shaped free history',now()-interval '1 day',$1,'444555666','completed') RETURNING id", [campaign])).rows[0].id;
      const history = (await db.query('SELECT to_jsonb(ls) row FROM live_sessions ls ORDER BY id')).rows;
      const result = await runMigrations(db, files);
      assert.equal(result.code, 0, result.logs.join('\n'));
      assert.deepEqual(result.logs.filter(line => line.startsWith('[migrate] applied:')), [refreshFile, repairFile, aliasFile, deactivationFile, bugiUsageFile].map(file => '[migrate] applied: ' + file));
      assert.deepEqual((await db.query('SELECT * FROM schema_migrations WHERE filename<>ALL($1) ORDER BY filename', [[repairFile, refreshFile, aliasFile, deactivationFile, bugiUsageFile]])).rows, ledger);
      assert.deepEqual((await db.query('SELECT to_jsonb(ls) row FROM live_sessions ls ORDER BY id')).rows, history);
      assert.equal((await db.query('SELECT zoom_meeting_id FROM live_sessions WHERE id=$1', [free])).rows[0].zoom_meeting_id, '444555666');
      assert.equal((await db.query('SELECT replay_url FROM live_sessions WHERE id=$1', [session])).rows[0].replay_url, 'private-existing-replay');
      assert.equal((await db.query("SELECT to_regclass('free_session_reservations') t")).rows[0].t, null, 'held funnel is not auto-promoted');
      assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='live_sessions' AND column_name='access_policy'")).rows[0].n, 0, 'held audience migration is not auto-promoted');
    }));

    await t.test('unapplied original with existing OR records and text legacy values; all held dependencies together', () => isolated(async db => {
      // Production-shaped legacy storage differences, without any student data.
      await db.query('ALTER TABLE session_config ALTER COLUMN session_date TYPE text USING session_date::text');
      await db.query('ALTER TABLE session_registrations ALTER COLUMN score TYPE text USING score::text');
      const { course, session } = await standard(db);
      const access = new Map([...before, ...[...held].filter(([file]) => ![funnelFile,aliasFile].includes(file))]);
      assert.equal((await runMigrations(db, access)).code, 0);
      await db.query('BEGIN');
      const or = (await db.query("INSERT INTO live_sessions(title,scheduled_at,access_policy,zoom_meeting_id) VALUES('Existing OR',now(),'any_selected','987654321') RETURNING id")).rows[0].id;
      await db.query('INSERT INTO live_session_courses(session_id,course_id) VALUES($1,$2)', [or, course]);
      await db.query('COMMIT');
      const previous = (await db.query('SELECT id,title,scheduled_at,course_id,access_policy,zoom_meeting_id,replay_url FROM live_sessions ORDER BY id')).rows;
      const runs = await Promise.all([runMigrations(db, full), runMigrations(db, full)]);
      assert.ok(runs.every(result => result.code === 0), JSON.stringify(runs));
      assert.equal(runs.flatMap(result => result.logs).filter(line => line === '[migrate] applied: ' + repairFile).length, 1);
      assert.deepEqual((await db.query('SELECT id,title,scheduled_at,course_id,access_policy,zoom_meeting_id,replay_url FROM live_sessions ORDER BY id')).rows, previous);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1', [originalFile])).rows[0].n, 0);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1', [repairFile])).rows[0].n, 1);
      assert.equal((await db.query('SELECT count(*)::int n FROM live_session_courses WHERE session_id=$1', [or])).rows[0].n, 1);
      assert.equal((await db.query('SELECT replay_url FROM live_sessions WHERE id=$1', [session])).rows[0].replay_url, 'private-existing-replay');
      assert.equal((await runMigrations(db, full)).code, 0);
      assert.ok((await db.query("SELECT to_regclass('free_session_reservations') t")).rows[0].t);
    }));

    await t.test('already-applied original ledger stays byte-identical; later audience migration and strict shape checks', () => isolated(async db => {
      const { course } = await standard(db);
      await recordOriginal(db);
      const ledger = (await db.query('SELECT * FROM schema_migrations WHERE filename=$1', [originalFile])).rows;
      const campaign = (await db.query('SELECT id FROM free_sessions WHERE is_default')).rows[0].id;
      const free = (await db.query("INSERT INTO live_sessions(title,scheduled_at,free_session_id,zoom_meeting_id) VALUES('Original free',now(),$1,'111222333') RETURNING id", [campaign])).rows[0].id;
      assert.equal((await runMigrations(db, files)).code, 0);
      assert.deepEqual((await db.query('SELECT * FROM schema_migrations WHERE filename=$1', [originalFile])).rows, ledger);
      assert.equal((await runMigrations(db, full)).code, 0);
      assert.equal((await db.query('SELECT zoom_meeting_id FROM live_sessions WHERE id=$1', [free])).rows[0].zoom_meeting_id, '111222333');
      await assert.rejects(db.query("INSERT INTO live_sessions(title,scheduled_at) VALUES('No audience',now())"), { code: '23514' });
      await assert.rejects(db.query("INSERT INTO live_sessions(title,scheduled_at,access_policy) VALUES('Empty OR',now(),'any_selected')"), /Select at least one/);
      await assert.rejects(db.query("INSERT INTO live_sessions(title,scheduled_at,course_id,free_session_id) VALUES('Mixed course/free',now(),$1,$2)", [course, campaign]), { code: '23514' });
      await assert.rejects(db.query("UPDATE live_sessions SET access_policy='any_selected' WHERE id=$1", [free]), { code: '23514' });
    }));

    await t.test('unrecognized original checksum, missing or modified replacement fail before pending changes', () => isolated(async db => {
      await recordOriginal(db);
      await db.query("UPDATE schema_migrations SET checksum=repeat('0',64) WHERE filename=$1", [originalFile]);
      const pending = '202611240099_must_not_run.sql';
      const unknown = new Map([...files, [pending, 'CREATE TABLE must_not_run(id integer);']]);
      assert.equal((await runMigrations(db, unknown)).code, 1);
      assert.equal((await db.query("SELECT to_regclass('must_not_run') t")).rows[0].t, null);
      await db.query('UPDATE schema_migrations SET checksum=$2 WHERE filename=$1', [originalFile, digest(files.get(originalFile))]);
      const missing = new Map(files); missing.delete(repairFile);
      assert.equal((await runMigrations(db, missing)).code, 1);
      const changed = new Map(files); changed.set(repairFile, files.get(repairFile) + '\n-- unreviewed');
      assert.equal((await runMigrations(db, changed)).code, 1);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1', [repairFile])).rows[0].n, 0);
    }));

    await t.test('incomplete original schema fails closed without a false replacement receipt', () => isolated(async db => {
      await recordOriginal(db);
      await db.query('ALTER TABLE users RENAME COLUMN signup_free_session_id TO damaged_signup_reference');
      const result = await runMigrations(db, files);
      assert.equal(result.code, 1);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1', [repairFile])).rows[0].n, 0);
    }));

    await t.test('manually created untracked schema is not silently baselined', () => isolated(async db => {
      await db.query(files.get(originalFile));
      assert.equal((await runMigrations(db, files)).code, 1);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=ANY($1)', [[originalFile, repairFile]])).rows[0].n, 0);
    }));

    await t.test('an applied receipt with missing schema is never treated as a fresh install', () => isolated(async db => {
      await db.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)', [originalFile, digest(files.get(originalFile))]);
      assert.equal((await runMigrations(db, files)).code, 1);
      assert.equal((await db.query("SELECT to_regclass('free_sessions') t")).rows[0].t, null);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1', [repairFile])).rows[0].n, 0);
    }));

    await t.test('invalid mixed campaign/OR historical data aborts repair and restores the old CHECK', () => isolated(async db => {
      await recordOriginal(db);
      const access = new Map([...before, [originalFile, files.get(originalFile)], [repairFile, files.get(repairFile)]]);
      // Apply the old audience files directly to model an older deployment, before repair.
      for (const file of ['202611200002_extend_live_session_access.sql', '202611200004_live_session_multi_audience.sql']) await db.query(held.get(file));
      const { course } = await standard(db);
      const campaign = (await db.query('SELECT id FROM free_sessions WHERE is_default')).rows[0].id;
      await db.query('BEGIN');
      const mixed = (await db.query("INSERT INTO live_sessions(title,scheduled_at,free_session_id,access_policy) VALUES('Mixed old row',now(),$1,'any_selected') RETURNING id", [campaign])).rows[0].id;
      await db.query('INSERT INTO live_session_courses(session_id,course_id) VALUES($1,$2)', [mixed, course]);
      await db.query('COMMIT');
      const constraint = async () => (await db.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='live_sessions'::regclass AND conname='live_sessions_course_or_free_session'")).rows;
      const previous = await constraint();
      assert.equal((await runMigrations(db, access)).code, 1);
      assert.deepEqual(await constraint(), previous);
      assert.equal((await db.query('SELECT free_session_id FROM live_sessions WHERE id=$1', [mixed])).rows[0].free_session_id, campaign);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1', [repairFile])).rows[0].n, 0);
    }));

    await t.test('failed replacement bootstrap rolls back schema, backfill and ledger; safe retry succeeds', () => isolated(async db => {
      // Force a real late bootstrap DDL failure without modifying reviewed SQL.
      await db.query('CREATE TABLE idx_session_registrations_free_session(id integer)');
      const result = await runMigrations(db, files);
      assert.equal(result.code, 1);
      assert.equal((await db.query("SELECT to_regclass('free_sessions') t")).rows[0].t, null);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=ANY($1)', [[originalFile, repairFile]])).rows[0].n, 0);
      await db.query('ALTER TABLE idx_session_registrations_free_session RENAME TO retained_failure_probe');
      assert.equal((await runMigrations(db, files)).code, 0);
    }));

    await t.test('held aliases work without funnel promotion and preserve existing campaign rows on repeats', () => isolated(async db => {
      assert.equal((await runMigrations(db,withoutAliases)).code,0);
      // Model exactly the columns reported by the owner, not an invented replacement
      // for either repository registrations or the optional held reservation table.
      await db.query(`CREATE TABLE free_session_registrations (
        id UUID NOT NULL,user_id UUID NOT NULL,academic_level TEXT,assigned_group TEXT,
        quiz_score INTEGER,quiz_details JSONB,registered_at TIMESTAMPTZ)`);
      const legacyUser=(await db.query("INSERT INTO users(email,password_hash,name,class,branch) VALUES('legacy-alias@example.invalid','synthetic','Legacy','3eme','informatique') RETURNING id")).rows[0].id;
      await db.query(`INSERT INTO free_session_registrations(id,user_id,academic_level,assigned_group,quiz_score,quiz_details,registered_at)
        VALUES($1,$2,'3eme','legacy-group',7,'{"historical":true}',now()-interval '20 days')`,[randomUUID(),legacyUser]);
      await db.query("UPDATE free_sessions SET slug='3eme-info',target_class='3eme',target_branch='informatique' WHERE is_default");
      const legacy=(await db.query('SELECT to_jsonb(r) row FROM free_session_registrations r')).rows;
      const previous=(await db.query('SELECT to_jsonb(f) row FROM free_sessions f ORDER BY id')).rows;
      const withAliases=new Map([...files,[aliasFile,files.get(aliasFile)]]);
      assert.equal((await runMigrations(db,withAliases)).code,0);
      assert.equal((await runMigrations(db,withAliases)).code,0);
      assert.deepEqual((await db.query('SELECT to_jsonb(f) row FROM free_sessions f ORDER BY id')).rows,previous);
      assert.deepEqual((await db.query('SELECT to_jsonb(r) row FROM free_session_registrations r')).rows,legacy);
      assert.equal((await db.query("SELECT count(*)::int n FROM free_session_slug_aliases WHERE slug='3eme-info'")).rows[0].n,1);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1',[aliasFile])).rows[0].n,1);
      assert.equal((await db.query("SELECT to_regclass('free_session_reservations') t")).rows[0].t,null);
      await assert.rejects(db.query("UPDATE free_sessions SET target_branch='informatique,sciences' WHERE is_default"),{code:'23514'});
      await db.query('UPDATE free_sessions SET target_branch=NULL WHERE is_default');
      assert.equal((await db.query('SELECT target_branch FROM free_sessions WHERE is_default')).rows[0].target_branch,null,'Toutes uses NULL, not an array');
    }));

    await t.test('alias foreign-key creation protects backfill and trigger installation from an in-flight writer', ()=>isolated(async db=>{
      // PostgreSQL locks the referenced parent when creating the foreign key,
      // before the backfill. Verify that actual behavior; no extra lock is needed.
        assert.equal((await runMigrations(db,withoutAliases)).code,0);
        const writer=await db.connect();let migration,settled=false;
        try{
          await writer.query('BEGIN');
          const campaign=(await writer.query("INSERT INTO free_sessions(slug,title) VALUES('during-alias-migration','Concurrent campaign') RETURNING id")).rows[0].id;
          migration=runMigrations(db,new Map([...files,[aliasFile,files.get(aliasFile)]])).finally(()=>{settled=true;});
          const deadline=Date.now()+5000;let waiting=false;
          while(Date.now()<deadline&&!settled){
            waiting=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='free_sessions'::regclass AND mode='ShareRowExclusiveLock' AND NOT granted) waiting")).rows[0].waiting;
            if(waiting)break;
            await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'migration waits for the in-flight campaign transaction');
          await writer.query('COMMIT');
          const result=await migration;assert.equal(result.code,0,result.logs.join('\n'));
          const alias=(await db.query('SELECT free_session_id FROM free_session_slug_aliases WHERE slug=$1',['during-alias-migration'])).rows[0];
          assert.equal(alias?.free_session_id,campaign,'every committed canonical slug is reserved');
            await db.query("UPDATE free_sessions SET slug='during-alias-migration-renamed' WHERE id=$1",[campaign]);
            assert.equal((await db.query("SELECT free_session_id FROM free_session_slug_aliases WHERE slug='during-alias-migration'")).rows[0].free_session_id,campaign);
        }finally{
          await writer.query('ROLLBACK');writer.release();
          if(migration&&!settled)await migration;
        }
    }));

    await t.test('alias promotion rehearsal preserves populated quiz, registration, reservation and Zoom history under concurrent runs', () => isolated(async db => {
      const beforeAliases=new Map([...full].filter(([file])=>file!==aliasFile));
      const initial=await runMigrations(db,beforeAliases);assert.equal(initial.code,0,initial.logs.join('\n'));
      const campaign=(await db.query("INSERT INTO free_sessions(slug,title,target_class,target_branch) VALUES('promotion-history','History','3eme','informatique') RETURNING id")).rows[0].id;
      const user=(await db.query("INSERT INTO users(email,password_hash,name,class,branch,balance,email_verified) VALUES('alias-history@example.invalid','synthetic-hash','Synthetic','3eme','informatique',123.45,true) RETURNING id")).rows[0].id;
      const registration=(await db.query(`INSERT INTO session_registrations(full_name,email,phone,free_session_id,track,filier,completed,account_activated,auth_user_id,score,quiz_total)
        VALUES('Synthetic','alias-history@example.invalid','22123456',$1,'3eme','informatique',true,true,$2,1,1) RETURNING id`,[campaign,user])).rows[0].id;
      const question=(await db.query(`INSERT INTO session_questions(text,type,options,correct_answer,free_session_id)
        VALUES('Historical question','multiple_choice','["a","b"]','"a"',$1) RETURNING id`,[campaign])).rows[0].id;
      await db.query(`INSERT INTO session_submissions(registration_id,question_id,answer,is_correct) VALUES($1,$2,'"a"',true)`,[registration,question]);
      await db.query(`INSERT INTO free_session_participants(free_session_id,user_id,source,registration_id,score,total)
        VALUES($1,$2,'new_signup',$3,1,1)`,[campaign,user,registration]);
      const attempt=(await db.query(`INSERT INTO free_session_attempts(campaign_id,token_hash,user_id,registration_id,question_snapshot,answers,score,total,level,created_at,expires_at,claim_expires_at,submitted_at,claimed_at)
        VALUES($1,repeat('c',64),$2,$3,$4,$5,1,1,'advanced',now()-interval '10 days',now()-interval '9 days',now()-interval '8 days',now()-interval '10 days'+interval '1 hour',now()-interval '10 days'+interval '2 hours') RETURNING id`,
        [campaign,user,registration,JSON.stringify([{id:question,text:'Historical question',type:'multiple_choice',options:['a','b'],correct_answer:'a'}]),JSON.stringify({[question]:'a'})])).rows[0].id;
      for(const completed of [true,false]){
        const session=(await db.query(`INSERT INTO live_sessions(free_session_id,title,scheduled_at,status,zoom_meeting_id,replay_url,free_reservation_required)
          VALUES($1,'Historical occurrence',now()+make_interval(days=>$2),$3,$4,$5,$6) RETURNING id`,
          [campaign,completed?-10:2,completed?'completed':'scheduled',completed?'historical-zoom-id':'future-zoom-id',completed?'private-replay-key':null,!completed])).rows[0].id;
        await db.query('INSERT INTO free_session_reservations(live_session_id,user_id,attempt_id) VALUES($1,$2,$3)',[session,user,attempt]);
        await db.query(`INSERT INTO free_session_occurrence_events(live_session_id,actor_id,event_type,next_details) VALUES($1,$2,'created','{"synthetic":true}')`,[session,user]);
      }
      const snapshot=async()=>{
        const state={};
        for(const table of ['users','free_sessions','session_questions','session_registrations','session_submissions','free_session_participants','free_session_attempts','free_session_reservations','free_session_occurrence_events','live_sessions']){
          state[table]=(await db.query(`SELECT to_jsonb(t) row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
        }
        state.ledger=(await db.query('SELECT * FROM schema_migrations WHERE filename<>$1 ORDER BY filename',[aliasFile])).rows;
        return state;
      };
      const original=await snapshot();
      // Validate the production evidence query itself locally; it contains no DDL/DML.
      await db.query(await readFile(new URL('checks/free-session-alias-readiness.sql',root),'utf8'));
      assert.deepEqual(await snapshot(),original);
      const concurrent=await Promise.all([runMigrations(db,full),runMigrations(db,full)]);
      assert.ok(concurrent.every(result=>result.code===0),JSON.stringify(concurrent));
      assert.equal(concurrent.flatMap(result=>result.logs).filter(line=>line==='[migrate] applied: '+aliasFile).length,1);
      assert.deepEqual(await snapshot(),original);
      const once=(await db.query('SELECT * FROM free_session_slug_aliases ORDER BY slug')).rows;
      const rerun=await runMigrations(db,full);assert.equal(rerun.code,0);
      assert.deepEqual((await db.query('SELECT * FROM free_session_slug_aliases ORDER BY slug')).rows,once);
      assert.deepEqual(await snapshot(),original);
    }));

    await t.test('legacy newly-reserved login slug aborts alias migration atomically instead of rewriting history', () => isolated(async db => {
      assert.equal((await runMigrations(db,withoutAliases)).code,0);
      const old=(await db.query("INSERT INTO free_sessions(slug,title) VALUES('login','Legacy reserved slug') RETURNING *")).rows[0];
      const result=await runMigrations(db,new Map([...files,[aliasFile,files.get(aliasFile)]]));
      assert.equal(result.code,1);
      assert.equal((await db.query("SELECT to_regclass('free_session_slug_aliases') t")).rows[0].t,null);
      assert.deepEqual((await db.query('SELECT * FROM free_sessions WHERE id=$1',[old.id])).rows[0],old);
      assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations WHERE filename=$1',[aliasFile])).rows[0].n,0);
    }));
  } finally { await maintenance.end(); }
});
