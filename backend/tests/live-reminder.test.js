
import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {fileURLToPath} from 'node:url';import {withTimedOfferBrowser} from './timed-offer-browser.js';
test('shared LIVE popup timing, phases, persistence, conflicts and responsive identity',{skip:!process.env.TIMED_QA_CHROME,timeout:90000},async()=>{
 const app=express();let start=Date.now()+1200000,shift=0,status='scheduled',authorized=true,notice=false,generation=0,acks=0;
 const id='10000000-0000-4000-8000-000000000001';
 const event=()=>({id,title:'🔴 LIVE | Cours Matrice',scheduled_at:new Date(start).toISOString(),join_opens_at:new Date(start-300000).toISOString(),ends_at:new Date(start+5400000).toISOString(),server_now:new Date(Date.now()+shift).toISOString(),duration_minutes:90,status,has_join_link:true,join_url:Date.now()+shift>=start-300000?'/api/live/'+id+'/join':null});
 app.get('/api/live/upcoming',(req,res)=>res.json(authorized&&status!=='completed'?[event()]:[]));
 app.get('/api/user/me',(req,res)=>res.json({user:{id:'student-'+generation,role:'user'}}));
 app.get('/api/user/notifications',(req,res)=>res.json({notifications:[]}));
 app.get('/api/user/notifications/important',(req,res)=>res.json({notifications:notice?[{id:'notice',message:'Séance reportée : Cours Matrice',link:'/app/calendar'}]:[]}));
 app.post('/api/user/notifications/:id/acknowledge',(req,res)=>{notice=false;acks++;res.json({success:true});});
 app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
 app.get('/app/test',(req,res)=>res.send('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/user.css"><link rel="stylesheet" href="/css/popups.css"><script>window.__SYNTA_PROFILE__={id:"student-'+generation+'"};</script><script defer src="/js/live-session-popup.js"></script><div id="app-header-top"></div><script src="/js/user.js"></script></html>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,pressKey,errors,screenshot})=>{
 for(const width of [320,375,390,430,768,1440]){
 generation++;start=Date.now()+1200000;shift=0;status='scheduled';authorized=true;notice=false;
 await open('/app/test','synthetic',width);await evaluate('window.syntaLiveReminders.refresh()');
 assert.equal(await evaluate("Boolean(document.querySelector('#event-modal[open]'))"),false,'20 minutes before');
 // Learn a server time just outside the opening boundary. The scheduled wake opens without navigation/reload.
 shift=start-300000-Date.now()-150;
 await evaluate('window.syntaLiveReminders.refresh()');
 await until(()=>evaluate("Boolean(document.querySelector('#event-modal[open]'))"),'automatic opening at boundary');
 assert.equal(await evaluate("document.querySelector('#join-btn').disabled"),false);
 assert.equal(await evaluate("document.querySelector('.modal-event-title').textContent"),'Cours Matrice');
 assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"),1);
 if(process.env.LIVE_REMINDER_SCREENSHOTS&&[390,1440].includes(width)){await evaluate('new Promise(r=>setTimeout(r,220))');await screenshot(process.env.LIVE_REMINDER_SCREENSHOTS+'-'+width+'.png');}
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.countdown-unit')).flexDirection"),'row');
 assert.ok(await evaluate("document.querySelector('#event-modal').getBoundingClientRect().right<=innerWidth"));
 assert.ok(await evaluate("document.querySelector('#event-modal').scrollWidth<=document.querySelector('#event-modal').clientWidth"));
 await evaluate("document.querySelector('#event-modal .modal-btn-secondary').click()");await evaluate('window.syntaLiveReminders.refresh()');
 assert.equal(await evaluate("Boolean(document.querySelector('#event-modal[open]'))"),false,'upcoming dismissed');
 await open('/app/test','synthetic',width);await evaluate('window.syntaLiveReminders.refresh()');assert.equal(await evaluate("Boolean(document.querySelector('#event-modal[open]'))"),false,'refresh persisted');
 shift=start-Date.now()+1000;await evaluate('window.syntaLiveReminders.refresh()');await until(()=>evaluate("Boolean(document.querySelector('#event-modal[open]'))"),'live reminder');
 assert.match(await evaluate("document.querySelector('#countdown-timer').textContent"),/Séance en direct/);
 await pressKey('Escape',27);await evaluate('window.syntaLiveReminders.refresh()');assert.equal(await evaluate("Boolean(document.querySelector('#event-modal[open]'))"),false,'live dismissed');
 await evaluate('showEventDetails('+JSON.stringify(event())+',new Date())');assert.match(await evaluate("document.querySelector('#modal-body').textContent"),/Ajouter à calendrier/);await evaluate('closeModal()');
 // Updated schedule creates a distinct reminder; ended status closes it and reveals pending important notice.
 start=Date.now()+180000;shift=0;notice=true;await evaluate('new Promise(r=>setTimeout(r,150))');await evaluate('window.syntaLiveReminders.refresh()');try{await until(()=>evaluate("Boolean(document.querySelector('#event-modal[open]'))"),'new occurrence');}catch(error){throw Error(error.message+' '+JSON.stringify(await evaluate("({html:document.body.innerHTML,priority:window.syntaLiveReminders.hasPriority(),focus:document.activeElement?.outerHTML,keys:Object.keys(localStorage)})"))+' '+errors.join('|'));}
 assert.equal(await evaluate("Boolean(document.querySelector('.important-notification[open]'))"),false,'LIVE priority');
 status='completed';await evaluate('window.syntaLiveReminders.refresh()');await until(()=>evaluate("Boolean(document.querySelector('.important-notification[open]'))"),'deferred notification');
 assert.equal(await evaluate("Boolean(document.querySelector('#event-modal[open]'))"),false,'manual ending closes reminder');
 await evaluate("document.querySelector('.important-understood').click()");await until(()=>evaluate("!document.querySelector('.important-notification')"),'notice acknowledged');
 authorized=false;status='scheduled';start=Date.now()+60000;await evaluate('window.syntaLiveReminders.refresh()');assert.equal(await evaluate("Boolean(document.querySelector('#event-modal[open]'))"),false,'unauthorized');
 }
 assert.equal(acks,6);
 // An already open critical dialog defers the existing reminder, rather than stacking.
 authorized=false;await evaluate('window.syntaLiveReminders.refresh()');
 await evaluate("(()=>{const d=document.createElement('dialog');d.id='critical-test';d.innerHTML='<button>Continuer</button>';document.body.append(d);d.showModal();})()");
 authorized=true;status='scheduled';start=Date.now()+120000;shift=0;await evaluate('window.syntaLiveReminders.refresh()');
 assert.equal(await evaluate("Boolean(document.querySelector('#event-modal[open]'))"),false);
 await evaluate("document.querySelector('#critical-test').close();document.querySelector('#critical-test').remove()");
 await until(()=>evaluate("Boolean(document.querySelector('#event-modal[open]'))"),'deferred critical dialog');
 await evaluate("(()=>{const frame=document.createElement('iframe');frame.id='peer-tab';frame.src='/app/test?frame=1';document.body.append(frame);})()");
 await until(()=>evaluate("Boolean(document.querySelector('#peer-tab')?.contentWindow?.syntaLiveReminders)"),'same-origin peer');
 await evaluate("document.querySelector('#peer-tab').contentWindow.syntaLiveReminders.refresh()");
 assert.equal(await evaluate("Number(Boolean(document.querySelector('#event-modal[open]')))+Number(Boolean(document.querySelector('#peer-tab').contentDocument.querySelector('#event-modal[open]')))"),1,'shared-origin dismissal prevents duplicate reminder');
 await evaluate("document.querySelector('#peer-tab').remove();closeModal()");
 assert.deepEqual(errors,[]);
 });}finally{await new Promise(r=>server.close(r));}
});
