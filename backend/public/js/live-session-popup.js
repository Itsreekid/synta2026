(() => {
if(window.syntaLiveReminders)return;
let modalEvent=null,automatic=false,opener=null,clockOffset=0,countdownInterval=null;
const clock=()=>Date.now()+clockOffset;
function ensureModal(){
 let modal=document.getElementById('event-modal');
 if(!modal){modal=document.createElement('dialog');modal.id='event-modal';modal.className='modal synta-popup';modal.innerHTML='<div class="modal-content"><button type="button" class="close" aria-label="Fermer">×</button><div id="modal-body"></div></div>';document.body.append(modal);modal.querySelector('.close').onclick=()=>window.closeModal();modal.addEventListener('cancel',e=>{e.preventDefault();window.closeModal();});}
 return modal;
}
function getSessionEndTime(event,start){return new Date(event.ends_at||start.getTime()+Number(event.duration_minutes||60)*60000);}
// Decorative SVGs use a fixed path allowlist; no external icon dependency.
function popupIcon(kind){
 const paths={clock:'M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',video:'M15 8l6-3v14l-6-3M3 6h12v12H3V6Z',calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2m7 9v5m-2.5-2.5h5',play:'m10 8 6 4-6 4V8Zm11 4a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'};
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','popup-inline-icon');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[kind]||paths.clock);svg.append(path);return svg;
}
function button(label,primary,action){const b=document.createElement('button');b.type='button';b.className='modal-btn '+(primary?'modal-btn-primary':'modal-btn-secondary');b.textContent=label;const kind={'Rejoindre la séance':'video','Ajouter à calendrier':'calendar','Regarder le replay':'play','Plus tard':'clock'}[label];if(kind)b.prepend(popupIcon(kind));b.onclick=action;return b;}
function showEventDetails(event,date,options={}){
 const modal=ensureModal();opener=document.activeElement;modalEvent=event;automatic=options.automatic===true;
 const body=modal.querySelector('#modal-body');body.replaceChildren();
 const start=event.scheduled_at?new Date(event.scheduled_at):event.date&&event.time?new Date(event.date+'T'+event.time+':00'):new Date(date),end=getSessionEndTime(event,start);
 const icon=document.createElement('div');icon.className='modal-event-icon';icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2m3 10h3m-3 3h6"/></svg>';
 const title=document.createElement('h2');title.className='modal-event-title';title.id='live-popup-title';title.textContent=String(event.title||'Séance').replace(/^\s*(?:🔴\s*)?LIVE\s*[|:–-]\s*/i,'');modal.setAttribute('aria-labelledby',title.id);
 const timer=document.createElement('div');timer.className='countdown-timer';timer.id='countdown-timer';
 const line=document.createElement('div');line.className='modal-event-details';line.textContent=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Tunis',weekday:'long',day:'numeric',month:'long'}).format(start)+' · '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Tunis',hour:'2-digit',minute:'2-digit'}).format(start);line.prepend(popupIcon('clock'));
 const description=document.createElement('div');description.className='modal-event-description';description.textContent=automatic?'':typeof event.description==='object'?[event.description?.line1,event.description?.line2].filter(Boolean).join(' '):event.description||'';
 const actions=document.createElement('div');actions.className='modal-actions';
 if(event.replay_url){const play=button('Regarder le replay',true,()=>{
  let player;try{player=window.createSessionReplayPlayer(event.replay_url,event.title);}catch(error){play.textContent=error.message;return;}
  const frame=document.createElement('div');frame.className='calendar-replay-frame';frame.append(player);body.querySelector('.calendar-replay-frame')?.remove();body.prepend(frame);modal.classList.add('has-replay');
  if(player instanceof HTMLVideoElement)window.enhanceLearningPlayer?.(player,{autoplay:true,storageKey:event.id?event.id+':0':''});
 });actions.append(play);}
 for(const resource of event.resources||[]){try{if(!resource.url)continue;const url=new URL(resource.url,location.href);if(!['http:','https:'].includes(url.protocol))continue;const link=document.createElement('a');link.href=url.href;link.textContent=resource.file_name||resource.title;link.className='modal-btn modal-btn-secondary';link.target='_blank';link.rel='noopener';actions.append(link);}catch{}}
 let join=null;
 if(event.has_join_link||event.join_url||event.zoomLink){join=button('Rejoindre la séance',true,()=>joinZoomSession(event.join_url||event.zoomLink||'/api/live/'+encodeURIComponent(event.id)+'/join'));join.id='join-btn';actions.append(join);}
 if(!automatic)actions.append(button('Ajouter à calendrier',false,()=>addToCalendar(event.title,start,end)));
 actions.append(button(automatic?'Plus tard':'Fermer',false,()=>window.closeModal()));
 body.append(icon,title,timer,line,description,actions);
 clearInterval(countdownInterval);
 const update=()=>{
  const now=clock(),ended=['completed','cancelled'].includes(event.status)||now>=end.getTime(),live=now>=start.getTime();
  if(join)join.disabled=ended||now<Date.parse(event.join_opens_at||event.scheduled_at);
  if(ended||live){timer.innerHTML='<div class="event-live-badge"></div>';timer.firstChild.textContent=ended?'Séance terminée':'Séance en direct';timer.firstChild.prepend(popupIcon(ended?'clock':'video'));if(automatic)description.textContent=ended?'Cette séance est terminée.':'Votre séance a commencé. Rejoignez votre cours !';}
  else{const seconds=Math.max(0,Math.ceil((start-now)/1000));timer.innerHTML='<div class="countdown-title">Début de la séance dans</div><div class="countdown-display">'+[[Math.floor(seconds/3600),'h'],[Math.floor(seconds/60)%60,'min'],[seconds%60,'s']].map(([n,u])=>'<div class="countdown-unit"><span class="countdown-value">'+String(n).padStart(2,'0')+'</span><span class="countdown-label">'+u+'</span></div>').join('')+'</div>';timer.querySelector('.countdown-title').prepend(popupIcon('clock'));if(automatic)description.textContent='Votre séance commence bientôt. Vous pouvez déjà la rejoindre.';}
 };update();countdownInterval=setInterval(update,1000);
 modal.classList.add('is-open');if(!modal.open)modal.showModal();modal.querySelector('button:not(:disabled)')?.focus();
}
window.closeModal=function(){
 if(automatic)markDismissed();clearInterval(countdownInterval);countdownInterval=null;
 const modal=document.getElementById('event-modal');if(modal){modal.querySelector('video')?.pause();modal.querySelector('.calendar-replay-frame')?.remove();modal.classList.remove('has-replay','is-open');if(modal.open)modal.close();}
 automatic=false;opener?.isConnected&&opener.focus();
};
function addToCalendar(title,start,end){
 const fmt=d=>d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
 const text=String(title).replace(/\r?\n/g,' ').replace(/([,;\\])/g,'\\$1');
 const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Synta Academy//Calendar//FR','BEGIN:VEVENT','UID:'+Date.now()+'@syntaacademy.com','DTSTAMP:'+fmt(new Date()),'DTSTART:'+fmt(start),'DTEND:'+fmt(end),'SUMMARY:'+text,'DESCRIPTION:Événement Synta Academy','END:VEVENT','END:VCALENDAR'].join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/calendar'})),link=document.createElement('a');link.href=url;link.download='event.ics';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
}
let sessions=[],request=null,wake=null,releaseLock=null,activeKey=null,validUntil=0;
let profileId=window.__SYNTA_PROFILE__?.id||null;
const tabId=crypto.randomUUID(),memorySeen=new Set();
const phase=event=>clock()>=Date.parse(event.scheduled_at)?'live':'upcoming';
const key=event=>'synta-live:'+profileId+':'+event.id+':'+event.scheduled_at+':'+phase(event);
const seen=k=>{try{return localStorage.getItem(k)==='seen'||memorySeen.has(k);}catch{return memorySeen.has(k);}};
function markDismissed(){if(activeKey){memorySeen.add(activeKey);try{localStorage.setItem(activeKey,'seen');}catch{}}}
function blocked(){
 if(document.activeElement?.closest('form,input,textarea,[contenteditable=true]'))return true;
 return [...document.querySelectorAll('dialog[open]:not(#event-modal):not(.important-notification),.quiz-modal,.video-modal,[role=dialog][aria-modal=true]:not(#event-modal),.modal:not(#event-modal),.modal-overlay,.modal-backdrop,form[aria-busy=true],#run-btn:disabled')].some(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&e.getAttribute('aria-hidden')!=='true');
}
function eligible(event){return !['completed','cancelled'].includes(event.status)&&event.has_join_link&&clock()>=Date.parse(event.join_opens_at)&&clock()<Date.parse(event.ends_at);}
function candidates(){return sessions.filter(e=>eligible(e)&&!seen(key(e))).sort((a,b)=>(phase(a)==='live'?0:1)-(phase(b)==='live'?0:1)||Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at));}
function release(){releaseLock?.();releaseLock=null;try{const lease=JSON.parse(localStorage.getItem('synta-live-lock:'+profileId)||'null');if(lease?.owner===tabId)localStorage.removeItem('synta-live-lock:'+profileId);}catch{}}
async function claim(){
 if(releaseLock)return true;
 if(navigator.locks){return new Promise(resolve=>{navigator.locks.request('synta-live-popup:'+profileId,{ifAvailable:true},async lock=>{if(!lock){resolve(false);return;}resolve(true);await new Promise(r=>releaseLock=r);}).catch(()=>resolve(false));});}
 try{
 const name='synta-live-lock:'+profileId,old=JSON.parse(localStorage.getItem(name)||'null');if(old&&old.expires>Date.now()&&old.owner!==tabId)return false;
 localStorage.setItem(name,JSON.stringify({owner:tabId,expires:Date.now()+45000}));await new Promise(r=>setTimeout(r,30));
 return JSON.parse(localStorage.getItem(name)||'null')?.owner===tabId;
 }catch{return false;} // No cross-tab storage/locking: prefer no automatic interruption to duplicates.
}
function closeAutomatic(){if(automatic){automatic=false;window.closeModal();activeKey=null;release();}}
let presenting=false;
async function present(){
 if(presenting)return;presenting=true;try{
 if(document.visibilityState==='hidden'||blocked()||Date.now()>validUntil)return;
 const modal=document.getElementById('event-modal');
 if(modal?.open&&!automatic)return;
 const event=candidates()[0];if(!event)return;
 if(!await claim())return;
 if(blocked()||seen(key(event))){release();return;}
 if(window.syntaImportantPopupController?.pause()===false){release();return;}
 closeAutomatic();
 // closeAutomatic releases a previous claim; acquire again when changing phases.
 if(!await claim())return;
 activeKey=key(event);showEventDetails(event,new Date(event.scheduled_at),{automatic:true});markDismissed();
 }finally{presenting=false;}
}
function schedule(){
 clearTimeout(wake);if(document.visibilityState==='hidden'||!profileId)return;
 let delay=sessions.some(eligible)?15000:60000;
 for(const event of sessions){for(const boundary of [event.join_opens_at,event.scheduled_at,event.ends_at]){const distance=Date.parse(boundary)-clock();if(distance>0)delay=Math.min(delay,distance);}}
 wake=setTimeout(()=>refresh(),Math.max(50,delay));
}
async function refresh(){
 if(request)return request;
 if(document.visibilityState==='hidden')return;
 const hydrated=window.__SYNTA_PROFILE__?.id;if(hydrated&&hydrated!==profileId){closeAutomatic();release();sessions=[];profileId=hydrated;}
 request=(async()=>{
 try{
 if(!profileId){const response=await fetch('/api/user/me',{credentials:'include',cache:'no-store'});if(!response.ok)return;const data=await response.json();if(data.user?.role!=='user')return;profileId=data.user.id;}
 const response=await fetch('/api/live/upcoming',{credentials:'include',cache:'no-store'});
 if(!response.ok){sessions=[];closeAutomatic();return;}
 sessions=await response.json();if(!Array.isArray(sessions)){sessions=[];return;}
 const serverTime=Date.parse(sessions[0]?.server_now||response.headers.get('Date'));if(Number.isFinite(serverTime))clockOffset=serverTime-Date.now();
 validUntil=Date.now()+45000;
 document.dispatchEvent(new CustomEvent('synta:live-sessions',{detail:sessions}));
 if(modalEvent&&document.getElementById('event-modal')?.open){
 const latest=sessions.find(e=>e.id===modalEvent.id);
 if(automatic&&(!latest||!eligible(latest)||latest.scheduled_at!==modalEvent.scheduled_at)){closeAutomatic();}
 else if(!automatic&&latest&&latest.scheduled_at!==modalEvent.scheduled_at){showEventDetails({...modalEvent,...latest},new Date(latest.scheduled_at));}
 else if(!automatic&&!latest&&!modalEvent.replay_url){modalEvent.status='completed';document.getElementById('join-btn')?.setAttribute('disabled','');const badge=document.querySelector('#event-modal .event-live-badge');if(badge)badge.textContent='Séance terminée';}
 }
 if(!navigator.locks){try{const name='synta-live-lock:'+profileId,lease=JSON.parse(localStorage.getItem(name)||'null');if(lease?.owner===tabId)localStorage.setItem(name,JSON.stringify({owner:tabId,expires:Date.now()+45000}));}catch{}}
 await present();
 }catch{sessions=[];closeAutomatic();}finally{request=null;schedule();}
 })();return request;
}
function joinZoomSession(link){
 try{const url=new URL(link,location.href);if(url.origin!==location.origin||!/^\/api\/live\/[0-9a-f-]+\/join$/i.test(url.pathname))return;window.open(url.href,'_blank','noopener');window.closeModal();}catch{}
}
const closePrevious=window.closeModal;
window.closeModal=function(){closePrevious();release();activeKey=null;document.dispatchEvent(new Event('synta:popup-available'));setTimeout(()=>present(),100);};
window.showEventDetails=showEventDetails;window.addToCalendar=addToCalendar;
window.syntaLiveReminders={refresh,hasPriority:()=>automatic||candidates().length>0,close:closeAutomatic};
const start=()=>refresh();
document.addEventListener('DOMContentLoaded',start);document.addEventListener('turbo:load',start);
window.addEventListener('pagehide',()=>{clearTimeout(wake);closeAutomatic();release();});
window.addEventListener('pageshow',start);window.addEventListener('online',start);window.addEventListener('focus',start);
document.addEventListener('focusout',()=>setTimeout(()=>present(),100));
document.addEventListener('close',()=>setTimeout(()=>present(),100),true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){clearTimeout(wake);closeAutomatic();release();}else refresh();});
document.addEventListener('turbo:before-cache',()=>{clearTimeout(wake);closeAutomatic();release();});
window.addEventListener('storage',event=>{if(event.key===activeKey&&event.newValue==='seen')closeAutomatic();});
if(document.readyState!=='loading')start();
})();
