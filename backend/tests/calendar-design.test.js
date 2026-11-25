
import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import ejs from 'ejs';import {fileURLToPath} from 'node:url';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {withTimedOfferBrowser} from './timed-offer-browser.js';

test('calendar status uses timestamps and explicit completion rather than title text',async()=>{
 const source=await readFile(new URL('../public/js/calendar.js',import.meta.url),'utf8');
 const context=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function calendarSessionState('),source.indexOf('// FIX #7: Build event elements')),context);
 const now=Date.parse('2026-11-25T17:00:00Z'),session={title:'🔴 LIVE | Cours Matrice',scheduled_at:'2026-11-25T18:00:00Z',duration_minutes:90,status:'scheduled'};
 assert.equal(context.calendarSessionState(session,now).key,'upcoming');
 assert.equal(context.calendarSessionState({...session,scheduled_at:'2026-11-25T16:30:00Z'},now).key,'live');
 assert.equal(context.calendarSessionState({...session,status:'completed'},now).key,'ended');
 assert.equal(context.calendarSessionState({...session,scheduled_at:'2026-11-25T14:00:00Z'},now).key,'ended');
});

test('calendar premium desktop timetable and familiar mobile agenda preserve interactions',{skip:!process.env.TIMED_QA_CHROME,timeout:90000},async()=>{
 const app=express();const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Tunis',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const make=(n,time,duration,title,status='scheduled')=>({id:'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),title,scheduled_at:new Date(day+'T'+time+':00+01:00').toISOString(),duration_minutes:duration,status,description:'',course:{title:'Info Progress – Apprendre et Progresser'},has_join_link:true});
 const sessions=[make(1,'18:30',90,'🔴 LIVE | Cours Matrice'),make(2,'19:00',60,'Algorithmes : <b>texte synthétique</b> et un titre long pour tester la lisibilité'),make(3,'20:30',45,'Exercices corrigés'),make(4,'15:00',90,'Séance terminée manuellement','completed')];
 sessions.push({...make(5,'10:00',60,'Atelier en cours','scheduled'),scheduled_at:new Date(Date.now()-600000).toISOString()});
 for(const s of sessions){s.ends_at=new Date(Date.parse(s.scheduled_at)+s.duration_minutes*60000).toISOString();s.join_opens_at=new Date(Date.parse(s.scheduled_at)-300000).toISOString();s.join_url='/api/live/'+s.id+'/join';}
 app.get('/api/live/upcoming',(req,res)=>res.json(sessions));app.get('/api/live/session/:id',(req,res)=>res.json({...sessions.find(s=>s.id===req.params.id),resources:[]}));
 app.get('/api/user/me',(req,res)=>res.json({user:{id:'calendar-qa',role:'user'}}));
 app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
 app.get('/app/calendar',async(req,res)=>{
 let html=await ejs.renderFile(fileURLToPath(new URL('../views/pages/calendar/index.ejs',import.meta.url)),{user:{},profile:{id:'calendar-qa',full_name:'Synthetic student',balance:'0.00'}});
 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,script=>/src="\/js\/(calendar|live-session-popup|replay-player)\.js/.test(script)?script:'');
 const seed='window.__SYNTA_PROFILE__={id:"calendar-qa"};'+JSON.stringify(sessions).replace(/</g,'\u003c')+'.forEach(e=>["upcoming","live"].forEach(p=>localStorage.setItem("synta-live:calendar-qa:"+e.id+":"+e.scheduled_at+":"+p,"seen")));';
 res.send(html.replace('<body>','<body><script>'+seed+'</script><style>#global-hydration-overlay{display:none!important}</style>'));
 });
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,pressKey,command,errors,screenshot})=>{
 await command('Emulation.setTimezoneOverride',{timezoneId:'Africa/Tunis'});
 for(const width of [320,375,390,430,768,1024,1280,1440]){
 await open('/app/calendar','synthetic',width);try{await until(()=>evaluate("document.querySelectorAll('.calendar-grid>.day-column').length===7 && Boolean(window.calendarDaysData)"),'calendar');}catch(error){throw Error(error.message+' '+JSON.stringify(await evaluate("({text:document.body.textContent,scripts:[...document.scripts].map(s=>s.src)})"))+' '+errors.join('|'));}
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'page overflow '+width);
 assert.match(await evaluate("document.querySelector('#event-count-text').textContent"),/5 événements/);
 const index=await evaluate('new Date().getDay()===0?6:new Date().getDay()-1');
 if(width<700){assert.equal(await evaluate("getComputedStyle(document.querySelector('#expanded-card')).display"),'block');assert.equal(await evaluate("getComputedStyle(document.querySelector('.calendar-grid>.day-column .day-events')).display"),'none');
 const other=(index+1)%7;await evaluate('document.querySelector('+JSON.stringify('[data-day-index="'+other+'"] .day-header')+').focus()');await pressKey('Enter',13);
 assert.equal(await evaluate("document.querySelector('#expanded-card-events .empty-state-card')!==null"),true);
 await evaluate('updateExpandedCard('+index+')');assert.equal(await evaluate("document.querySelectorAll('#expanded-card-events .calendar-event').length"),5);
 }
 if(width>=1200){assert.ok(await evaluate("document.querySelector('.main-section').scrollHeight<=document.querySelector('.main-section').clientHeight+1"),'single calendar scroller');assert.equal(await evaluate("getComputedStyle(document.querySelector('.calendar-grid')).gridTemplateColumns.split(' ').length"),8);
 const selector=n=>JSON.stringify('.calendar-grid [data-day-index="'+index+'"] [data-session-id="'+sessions[n].id+'"]');
 const positions=await evaluate('(()=>{const a=document.querySelector('+selector(0)+'),b=document.querySelector('+selector(1)+');return a&&b?{topA:parseFloat(a.style.getPropertyValue("--event-top")),topB:parseFloat(b.style.getPropertyValue("--event-top")),leftA:a.style.getPropertyValue("--event-left"),leftB:b.style.getPropertyValue("--event-left")}:null;})()');
 assert.ok(positions);assert.equal(positions.topB-positions.topA,45);assert.notEqual(positions.leftA,positions.leftB);
 }
 assert.ok(await evaluate("Boolean(document.querySelector('.state-live'))"));assert.ok(await evaluate("Boolean(document.querySelector('.state-ended'))"));
 const eventSelector=(width<700?'#expanded-card':'.calendar-grid')+' .calendar-event[data-session-id="'+sessions[0].id+'"]';
 await evaluate('document.querySelector('+JSON.stringify(eventSelector)+').click()');await until(()=>evaluate("Boolean(document.querySelector('#event-modal[open]'))"),'existing popup');
 assert.match(await evaluate("document.querySelector('#modal-body').textContent"),/Ajouter à calendrier/);await evaluate('closeModal()');
 const range=await evaluate("document.querySelector('#current-week-range').textContent");await evaluate('nextWeek()');assert.notEqual(await evaluate("document.querySelector('#current-week-range').textContent"),range);assert.match(await evaluate("document.querySelector('#event-count-text').textContent"),/Aucun événement/);await evaluate('previousWeek()');assert.equal(await evaluate("document.querySelector('#current-week-range').textContent"),range);await evaluate('goToToday()');
 const refreshed=sessions.filter(row=>row.id!==sessions[3].id).map(row=>row.id===sessions[0].id?{...row,scheduled_at:new Date(Date.parse(row.scheduled_at)+2700000).toISOString()}:row);
 await evaluate('document.dispatchEvent(new CustomEvent("synta:live-sessions",{detail:'+JSON.stringify(refreshed)+'}))');
 assert.equal(await evaluate('document.querySelector('+JSON.stringify('.calendar-event[data-session-id="'+sessions[0].id+'"] .event-time')+').textContent'),'19:15');
 assert.equal(await evaluate('document.querySelector('+JSON.stringify('.calendar-event[data-session-id="'+sessions[3].id+'"]')+')===null'),true,'ended session removed from fresh authorized list');
 await evaluate('document.dispatchEvent(new CustomEvent("synta:live-sessions",{detail:'+JSON.stringify(sessions)+'}))');
 if(process.env.CALENDAR_DESIGN_SCREENSHOTS&&[390,1440].includes(width)){if(width>=1200)await evaluate("document.querySelector('.week-calendar').style.scrollBehavior='auto';document.querySelector('.week-calendar').scrollTo({top:1530,behavior:'instant'})");await evaluate('new Promise(r=>setTimeout(r,250))');await screenshot(process.env.CALENDAR_DESIGN_SCREENSHOTS+'-'+width+'.png');}
 }assert.deepEqual(errors,[]);
 });}finally{await new Promise(r=>server.close(r));}
});
