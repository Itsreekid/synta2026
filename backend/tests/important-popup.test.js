
import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {fileURLToPath} from 'node:url';import {withTimedOfferBrowser} from './timed-offer-browser.js';
test('important popup mobile widths, safe text, acknowledgment, retry and persistent dismissal',{skip:!process.env.TIMED_QA_CHROME,timeout:60000},async()=>{
 const app=express();let pending=true,fail=false,acks=0;
 app.get('/api/user/notifications',(req,res)=>res.json({notifications:[]}));
 app.get('/api/user/notifications/important',(req,res)=>res.json({notifications:pending?[{id:'synthetic',message:'La séance « <b>Cours Matrice</b> » est reportée au mercredi 25 novembre 2026 à 20:00.',link:'/app/calendar?session=synthetic'}]:[]}));
 app.post('/api/user/notifications/:id/acknowledge',(req,res)=>{if(fail)return res.sendStatus(503);pending=false;acks++;res.json({success:true});});
 app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
 app.get('/app/test',(req,res)=>res.send('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/user.css"><link rel="stylesheet" href="/css/popups.css"><div id="app-header-top"></div><script src="/js/user.js"></script></html>'));
 app.get('/app/calendar',(req,res)=>res.send('Calendrier'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,pressKey,errors})=>{
 for(const width of [320,375,390,430,768,1440]){
 pending=true;await open('/app/test','synthetic',width);await until(()=>evaluate("Boolean(document.querySelector('.important-notification[open]'))"),'popup');
 assert.ok(await evaluate("document.querySelector('.important-notification').getBoundingClientRect().right<=innerWidth"));
 assert.ok(await evaluate("document.querySelector('.important-notification').scrollWidth<=document.querySelector('.important-notification').clientWidth"));
 assert.equal(await evaluate("document.querySelector('#important-notification-message b')===null"),true);
 assert.ok(await evaluate("Math.round(document.querySelector('.important-calendar').getBoundingClientRect().height)>=48"));
 fail=true;await evaluate("document.querySelector('.important-understood').click()");await until(()=>evaluate("document.querySelector('.important-error').textContent.length>0"),'failure');
 assert.equal(pending,true);fail=false;
 await pressKey('Escape',27);await until(()=>evaluate("!document.querySelector('.important-notification')"),'acknowledged');
 await open('/app/test','synthetic',width);await evaluate("new Promise(r=>setTimeout(r,150))");assert.equal(await evaluate("Boolean(document.querySelector('.important-notification[open]'))"),false);
 }
 pending=true;await open('/app/test','synthetic',390);await until(()=>evaluate("Boolean(document.querySelector('.important-notification[open]'))"),'calendar popup');await evaluate("document.querySelector('.important-calendar').click()");await until(()=>evaluate("location.pathname==='/app/calendar'"),'calendar navigation');
 assert.equal(pending,false);assert.equal(acks,7);assert.deepEqual(errors,[]);
 });}finally{await new Promise(resolve=>server.close(resolve));}
});
