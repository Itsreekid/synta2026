import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { createOfferQuote, buyTimedOffer } from '../services/timed-offers.js';
import { liveSessionAccess, setExtendedLiveAccess } from '../utils/offerAccess.js';

test('annual and monthly grants share course lives while expiry, audience and cancellation remain enforced', {
  skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 45000
}, async () => {
  const connection = { host: '127.0.0.1', port: Number(process.env.BUGI_QA_POSTGRES_PORT),
    user: 'bugi_qa', password: 'bugi-synthetic-local-only', ssl: false };
  const maintenance = new pg.Pool({ ...connection, database: 'postgres' });
  const name = 'shared_course_' + randomUUID().replaceAll('-', '');
  const keys = ['DATABASE_URL', 'DB_SSL', 'JWT_SECRET', 'TIMED_OFFER_SALES_ENABLED',
    'CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let db, routePool, server;
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
    db = new pg.Pool({ ...connection, database: name });
    await db.query(await readFile(new URL('../../database/schema_postgres.sql', import.meta.url), 'utf8'));
    const databaseUrl = `postgresql://${connection.user}:${connection.password}@127.0.0.1:${connection.port}/${name}`;
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/migrate.js', import.meta.url))], {
      env: { ...process.env, DATABASE_URL: databaseUrl, DB_SSL: 'false' }, timeout: 30000
    });
    Object.assign(process.env, { DATABASE_URL: databaseUrl, DB_SSL: 'false', JWT_SECRET: 'synthetic-shared-course',
      TIMED_OFFER_SALES_ENABLED: 'true', CLOUDFLARE_ACCOUNT_ID: 'synthetic', R2_ACCESS_KEY: 'synthetic',
      R2_SECRET_KEY: 'synthetic', R2_BUCKET: 'synthetic' });
    const user = async label => (await db.query("INSERT INTO users(email,password_hash,name,balance) VALUES($1,'synthetic',$1,300) RETURNING id", [label + '@example.invalid'])).rows[0].id;
    const annualBuyer = await user('annual'), monthlyBuyer = await user('monthly'), legacyAnnualBuyer = await user('legacy-annual');
    const stranger = await user('stranger'), otherBuyer = await user('other-course');
    const course = (await db.query("INSERT INTO courses(title) VALUES('Info Progress') RETURNING id")).rows[0].id;
    const otherCourse = (await db.query("INSERT INTO courses(title) VALUES('Unrelated') RETURNING id")).rows[0].id;
    const offer = async (mode, courseId) => {
      const row = (await db.query(`WITH term AS (SELECT current_date+180 AS cutoff)
        INSERT INTO offers(title,fixed_price,access_mode,academic_year_start,access_cutoff_date)
        SELECT $1,55,$1,CASE WHEN $1='academic_year' THEN EXTRACT(YEAR FROM cutoff)::int-(EXTRACT(MONTH FROM cutoff)<9)::int END,
          CASE WHEN $1='academic_year' THEN cutoff END FROM term RETURNING id`, [mode])).rows[0];
      await db.query('INSERT INTO offer_courses(offer_id,course_id) VALUES($1,$2)', [row.id, courseId]);
      return row.id;
    };
    const annual = await offer('academic_year', course), monthly = await offer('monthly', course);
    const unrelated = await offer('academic_year', otherCourse);
    const buy = async (id, offerId) => {
      const quote = await createOfferQuote(db, id, offerId);
      return buyTimedOffer(db, id, { offerId, quote: quote.quote, requestId: quote.requestId });
    };
    const annualGrant = await buy(annualBuyer, annual);
    await buy(monthlyBuyer, monthly); await buy(otherBuyer, unrelated);
    await db.query('INSERT INTO enrollments(user_id,course_id,offer_id) VALUES($1,$2,$3)', [legacyAnnualBuyer, course, annual]);
    await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,55,'wallet_completed')", [legacyAnnualBuyer, annual]);
    const session = (await db.query(`INSERT INTO live_sessions(course_id,offer_id,title,scheduled_at,duration_minutes,zoom_join_url,zoom_start_url,replay_url)
      VALUES($1,$2,'Shared live',now()+interval '1 minute',90,'https://zoom.us/j/synthetic','PRIVATE-HOST-URL','https://drive.google.com/file/d/synthetic/preview') RETURNING id`, [course, monthly])).rows[0].id;
    const resource = (await db.query(`INSERT INTO learning_resources(live_session_id,title,file_name,object_key,content_type,file_size)
      VALUES($1,'PDF','exercise.pdf','synthetic/exercise.pdf','application/pdf',100) RETURNING id`, [session])).rows[0].id;
    const check = async id => (await db.query(`SELECT ${liveSessionAccess('$2')} AS allowed FROM live_sessions ls WHERE ls.id=$1`, [session, id])).rows[0].allowed;
    for (const id of [annualBuyer, monthlyBuyer, legacyAnnualBuyer]) assert.equal(await check(id), true);
    for (const id of [stranger, otherBuyer]) assert.equal(await check(id), false);

    routePool = (await import('../config/db.js')).default;
    const app = express(); app.use(express.json(), cookieParser());
    app.use((await import('../routes/user-api.js')).default);
    app.use('/api/live', (await import('../routes/live.js')).default);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const call = (path, id) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      redirect: 'manual', headers: id ? { Cookie: 'synta_access=' + jwt.sign({ id, role: 'user' }, process.env.JWT_SECRET) } : {}
    });
    for (const id of [annualBuyer, monthlyBuyer, legacyAnnualBuyer]) {
      for (const path of ['/api/live/upcoming', '/api/live/course/' + course]) {
        const response = await call(path, id); assert.equal(response.status, 200);
        const rows = await response.json(); assert.equal(rows.filter(row => row.id === session).length, 1);
        assert.ok(!JSON.stringify(rows).includes('PRIVATE-HOST-URL'));
      }
      const events = await (await call('/api/events', id)).json();
      assert.equal(events.events.filter(event => event.id === session).length, 1);
      const detail = await (await call('/api/live/session/' + session, id)).json();
      assert.equal(detail.resources[0].id, resource); assert.ok(detail.resources[0].url);
      assert.equal((await call('/api/live/' + session + '/join', id)).status, 302);
    }
    assert.equal((await call('/api/live/session/' + session)).status, 401);
    for (const id of [stranger, otherBuyer]) {
      assert.equal((await call('/api/live/session/' + session, id)).status, 404);
      assert.equal((await call('/api/live/' + session + '/join', id)).status, 404);
      assert.equal((await (await call('/api/live/upcoming?userId=' + annualBuyer, id)).json()).length, 0);
      assert.equal((await call('/api/live/resources/' + resource + '/code', id)).status, 404);
    }
    await db.query("UPDATE live_sessions SET scheduled_at=now()-interval '2 hours',status='completed' WHERE id=$1", [session]);
    const replays = await (await call('/api/live/replays', annualBuyer)).json();
    assert.equal(replays.filter(row => row.id === session).length, 1);
    await db.query('UPDATE live_sessions SET audience_student_ids=$2 WHERE id=$1', [session, [monthlyBuyer]]);
    assert.equal(await check(annualBuyer), false); assert.equal(await check(monthlyBuyer), true);
    await db.query('UPDATE live_sessions SET audience_student_ids=NULL WHERE id=$1', [session]);
    await db.query("UPDATE offer_access_grants SET starts_at=now()+interval '1 day',expires_at=now()+interval '2 days' WHERE id=$1",[annualGrant.grantId]);
    assert.equal(await check(annualBuyer),false);
    await db.query("UPDATE offer_access_grants SET starts_at=now()-interval '3 days',expires_at=now()-interval '1 day' WHERE id=$1", [annualGrant.grantId]);
    assert.equal(await check(annualBuyer), false);
    assert.equal((await call('/api/live/session/' + session, annualBuyer)).status, 404);
    await db.query("UPDATE offer_access_grants SET expires_at=now()+interval '1 day',revoked_at=now() WHERE id=$1", [annualGrant.grantId]);
    assert.equal(await check(annualBuyer), false);
    await db.query('UPDATE offer_access_grants SET revoked_at=NULL WHERE id=$1', [annualGrant.grantId]);
    // Original course snapshots survive later offer-link edits.
    await db.query('DELETE FROM offer_courses WHERE offer_id=$1', [annual]);
    assert.equal(await check(annualBuyer), true);
    await db.query(await readFile(new URL('../../database/pending-migrations/202611200002_extend_live_session_access.sql', import.meta.url), 'utf8'));
    setExtendedLiveAccess(true);
    assert.equal(await check(annualBuyer), true);
    await db.query('UPDATE live_sessions SET audience_student_ids=$2 WHERE id=$1', [session, [monthlyBuyer]]);
    assert.equal(await check(annualBuyer), false);
    await db.query("UPDATE live_sessions SET audience_student_ids=NULL,status='cancelled' WHERE id=$1", [session]);
    for (const id of [annualBuyer, monthlyBuyer]) assert.equal(await check(id), false);
    const balances = (await db.query('SELECT balance FROM users WHERE id=ANY($1::uuid[])', [[annualBuyer, monthlyBuyer, otherBuyer]])).rows;
    assert.ok(balances.every(row => row.balance === '245.00'));
  } finally {
    setExtendedLiveAccess(false);
    if (server) await new Promise(resolve => server.close(resolve));
    await routePool?.end(); await db?.end();
    await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await maintenance.end();
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
