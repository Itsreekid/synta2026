import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import * as sessions from '../services/sessions.js';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('30-day renewal works across actual HTTP requests and PostgreSQL, and requires the held migration',{
    skip:!process.env.BUGI_QA_POSTGRES_PORT,timeout:60000,
},async()=>{
    const connection={host:'127.0.0.1',port:Number(process.env.BUGI_QA_POSTGRES_PORT),user:'bugi_qa',password:'bugi-synthetic-local-only',ssl:false};
    const maintenance=new pg.Pool({...connection,database:'postgres'}),name='session_qa_'+randomUUID().replaceAll('-','');
    const previous=process.env.JWT_SECRET;process.env.JWT_SECRET='synthetic-session-renewal-only';
    let db,server;
    const jar=()=>({cookies:{},cookie(name,value,options){this.cookies[name]={value,options};},clearCookie(name){this.cookies[name]={cleared:true};}});
    try{
        await maintenance.query(`CREATE DATABASE "${name}"`);db=new pg.Pool({...connection,database:name});
        await db.query(await readFile(new URL('../../database/schema_postgres.sql',import.meta.url),'utf8'));
        const user=(await db.query("INSERT INTO users(email,name,password_hash,role) VALUES('synthetic@example.invalid','Synthetic','not-a-real-hash','user') RETURNING id,email,name,role")).rows[0];
        assert.equal(await sessions.sessionRenewalReady(db),false);
        const fallback=jar();await sessions.startSession(db,fallback,user);
        assert.equal(fallback.cookies.synta_refresh.cleared,true);
        const access=jwt.verify(fallback.cookies.synta_access.value,process.env.JWT_SECRET);assert.equal(access.exp-access.iat,3600);
        await db.query(await readFile(new URL('../../database/migrations/202611200001_create_refresh_tokens.sql',import.meta.url),'utf8'));
        assert.equal(await sessions.sessionRenewalReady(db),true);
        const login=jar();await sessions.startSession(db,login,user);
        assert.ok(Math.abs(login.cookies.synta_refresh.options.maxAge-30*24*60*60*1000)<5000);
        const {sessionRenewal,authApiMiddleware}=await import('../middleware/requireAuth.js');
        const app=express();app.use(cookieParser());app.use(sessionRenewal(db));
        app.get('/api/activity',authApiMiddleware,(req,res)=>res.json({id:req.user.id}));
        server=app.listen(0,'127.0.0.1');await once(server,'listening');
        const expired=jwt.sign({id:user.id},process.env.JWT_SECRET,{expiresIn:-1});
        const activity=refresh=>fetch('http://127.0.0.1:'+server.address().port+'/api/activity',{headers:{cookie:`synta_access=${expired}; synta_refresh=${refresh}`}});
        const first=login.cookies.synta_refresh.value;
        const responses=await Promise.all(Array.from({length:5},()=>activity(first)));
        assert.ok(responses.every(response=>response.status===200),'parallel page/API calls should silently renew');
        const renewedCookie=responses.flatMap(response=>response.headers.getSetCookie()).find(cookie=>cookie.startsWith('synta_refresh='));
        assert.ok(renewedCookie);const next=renewedCookie.split(';')[0].slice('synta_refresh='.length);
        const row=(await db.query('SELECT expires_at,family_expires_at FROM refresh_tokens WHERE token_hash=$1',[sessions.hashToken(next)])).rows[0];
        assert.ok(Math.abs(row.expires_at.getTime()-Date.now()-30*24*60*60*1000)<5000);
        assert.equal((await activity(next)).status,200,'continued browsing renews again without a login prompt');
        const latest=(await db.query('SELECT token_hash FROM refresh_tokens WHERE used_at IS NULL AND revoked_at IS NULL')).rows;
        assert.equal(latest.length,1);
        await sessions.revokeRefreshToken(db,next);
        assert.equal((await activity(next)).status,401,'logout/revocation still prevents renewal');
        const idle=jar();await sessions.startSession(db,idle,user);
        await db.query("UPDATE refresh_tokens SET expires_at=NOW()-interval '1 second' WHERE token_hash=$1",[sessions.hashToken(idle.cookies.synta_refresh.value)]);
        assert.equal((await activity(idle.cookies.synta_refresh.value)).status,401,'an expired inactivity window still requires login');
    }finally{
        if(server)await new Promise(resolve=>server.close(resolve));await db?.end();
        await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH(FORCE)`).catch(()=>{});await maintenance.end();
        if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;
    }
});

test('a stale fixed-session countdown is cleared on renewable navigation, while true 401 still prompts',{
    skip:!process.env.TIMED_QA_CHROME,timeout:30000,
},async()=>{
    const script=await readFile(new URL('../public/js/session-guard.js',import.meta.url),'utf8');
    const app=express();app.get('/guard.js',(_req,res)=>res.type('js').send(script));app.get('/api/private',(_req,res)=>res.sendStatus(401));
    app.get('/page',(_req,res)=>res.send(`<!doctype html><meta name="synta-session-expires-in" content="60"><body><script>window.__SYNTA_PROFILE__={id:'synthetic'};window.pendingTimers=new Map();let timerId=0;window.setTimeout=fn=>{pendingTimers.set(++timerId,fn);return timerId};window.clearTimeout=id=>pendingTimers.delete(id);</script><script src="/guard.js"></script></body>`));
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    try{await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors})=>{
        await open('/page','synthetic',390);await until(()=>evaluate("!!document.getElementById('session-banner')"),'fixed-session warning');
        await evaluate("document.querySelector('meta').remove();document.dispatchEvent(new Event('turbo:load'))");
        assert.equal(await evaluate('pendingTimers.size'),0);assert.equal(await evaluate("!!document.getElementById('session-banner')"),false);
        await evaluate("fetch('/api/private')");await until(()=>evaluate("!!document.querySelector('[role=alertdialog]')"),'real expiration remains protected');
        assert.deepEqual(errors,[]);
    });}finally{await new Promise(resolve=>server.close(resolve));}
});
