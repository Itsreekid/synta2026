import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import ejs from 'ejs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('educational player and lesson quiz flow work on desktop/mobile without extra next-answer clicks', {
    skip: !process.env.TIMED_QA_CHROME, timeout: 90000,
}, async () => {
    const app = express(); app.use(express.json());
    let media;
    app.post('/qa-media',express.raw({type:'video/webm',limit:'2mb'}),(req,res)=>{media=req.body;res.sendStatus(204);});
    app.get('/qa-media',(_req,res)=>res.type('webm').send(media));
    const responses = [];
    app.post('/api/tracking/response', (req,res)=>{responses.push(req.body);res.json({success:true});});
    app.post('/api/tracking/progress', (_req,res)=>res.json({success:true}));
    app.get('/api/content/lesson/:id/resources', (_req,res)=>res.json({resources:[]}));
    app.get('/qa-player', async (_req,res)=>{
        const html = await ejs.renderFile(fileURLToPath(new URL('../views/pages/courses/details.ejs',import.meta.url)),{user:{id:'synthetic'},profile:null});
        res.send(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,script=>/src="\/js\/(learning-player|replay-player|course-markdown|course-image|course-details)\.js/.test(script)?script:'')
            .replace(/<link\b[^>]*href="https?:[^>]*>/g,'').replaceAll('course-details-page-marker','qa-page-marker')
            .replace('<body>','<body><style>#global-hydration-overlay{display:none!important}</style>'));
    });
    app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
    const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
    try {
        await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors,screenshot,pressKey})=>{
            for (const width of [1440,390,360]) {
                await open('/qa-player','synthetic',width);
                await evaluate(`(async()=>{
                    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
                    const context=canvas.getContext('2d');context.fillStyle='#102d43';context.fillRect(0,0,320,180);context.fillStyle='#f97316';context.font='24px sans-serif';context.fillText('Synta · Python',50,95);
                    const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
                    recorder.ondataavailable=event=>chunks.push(event.data);
                    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();await new Promise(r=>setTimeout(r,1800));recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
                    await fetch('/qa-media',{method:'POST',headers:{'Content-Type':'video/webm'},body:new Blob(chunks,{type:'video/webm'})});window.qaMedia='/qa-media';
                    const lesson={id:'video',title:'Variables — المتغيّرات',type:'video',is_preview:true};
                    const quiz={id:'quiz',title:'Pratique',type:'quiz',is_preview:true,content:{timeLimitSeconds:90,questions:[
                        {type:'multiple_choice',text:'Une variable ?',options:['A','B'],answer:'A'},
                        {type:'true_false',text:'المتغيّر يخزّن قيمة',answer:true},
                        {type:'multiple_choice',text:'La valeur ?',options:['C','D'],answer:'C'}]}};
                    window.qaLessons={video:lesson,quiz,next:{id:'next',title:'Boucles',type:'video',is_preview:true}};
                    window.SyntaAPI={fetchCourseDetails:async()=>({id:'qa',title:'Python',modules:[{id:'module',title:'Variables',lessons:Object.values(qaLessons)}]}),checkCourseAccess:async()=>false,
                        getContentUrl:async id=>({lesson:qaLessons[id],videoUrl:qaLessons[id].type==='video'?qaMedia:null}),markLessonComplete:async()=>{},updateVideoPosition:async()=>{}};
                    window.__SYNTA_PROFILE__={id:'synthetic'};await loadCourseDetails('qa');await playLesson('video',{autoplay:false});
                })()`);
                await until(()=>evaluate('document.querySelector("video").readyState>=2'),'real synthetic media');
                assert.equal(await evaluate('document.querySelector("video").controls'),false);
                assert.equal(await evaluate('document.querySelector("video").paused'),true);
                assert.match(await evaluate('document.querySelector(".btn-complete-next").textContent'),/Passer au quiz/);
                await evaluate('document.querySelector(".learning-player-controls select").value="1.5";document.querySelector(".learning-player-controls select").dispatchEvent(new Event("change"))');
                assert.equal(await evaluate('document.querySelector("video").playbackRate'),1.5);
                assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
                assert.equal(await evaluate('(()=>{const p=document.querySelector(".learning-player"),c=p.querySelector(".learning-player-controls");return c.getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom+1;})()'),true,'controls fit within player');
                if(process.env.PLAYER_QA_SCREENSHOTS)await screenshot(process.env.PLAYER_QA_SCREENSHOTS+'-'+width+'.png');
                // Actual decoded playback reaches its end and opens the quiz without navigation.
                await evaluate('document.querySelector(".learning-player-start").focus()');
                await pressKey(' ',32);
                await until(()=>evaluate('!!document.querySelector(".quiz-modal")'),'quiz at video end');
                assert.equal(await evaluate('!!document.querySelector(".learning-player")'),true,'lesson remains behind quiz');
                const before=responses.length;
                await evaluate('document.querySelector("[data-choice=A]").click();document.getElementById("quiz-check-button").click()');
                await until(()=>evaluate('document.querySelector(".quiz-step-label").textContent==="Question 2/3"'),'correct answer auto-advances');
                await evaluate('document.querySelector("[data-choice=false]").click();document.getElementById("quiz-check-button").click()');
                await new Promise(resolve=>setTimeout(resolve,1400));
                assert.equal(await evaluate('document.querySelector(".quiz-step-label").textContent'),'Question 2/3','wrong-answer correction must remain visible');
                await evaluate('document.getElementById("quiz-check-button").click();document.querySelector("[data-choice=C]").click();document.getElementById("quiz-check-button").click()');
                await until(()=>evaluate('!!document.getElementById("quiz-finish") && !document.getElementById("quiz-finish").disabled'),'last answer auto-results');
                assert.equal(responses.length-before,3,'one tracking request per answer');
                await evaluate('document.getElementById("quiz-finish").click()');
                await until(()=>evaluate('document.querySelector("video")?.dataset.lessonId==="next"'),'next lesson in same page');
                await until(()=>evaluate('document.querySelector("video").readyState>=2'),'next media loaded');
                assert.equal(await evaluate('document.querySelector("video").paused'),true,'next lesson waits for student');
                // Exercise resume and seek boundaries without a long media download.
                assert.deepEqual(await evaluate(`(async()=>{
                    const v=document.createElement('video');document.querySelector('.course-main').append(v);
                    let position=0;Object.defineProperties(v,{duration:{get:()=>60},readyState:{get:()=>1},currentTime:{get:()=>position,set:value=>position=value}});
                    v.play=()=>Promise.reject(new DOMException('Synthetic autoplay policy','NotAllowedError'));
                    const key='synta:video:synthetic:qa-replay';localStorage.setItem(key,'25');
                    const wrapper=enhanceLearningPlayer(v,{autoplay:true,storageKey:'qa-replay'});
                    v.dispatchEvent(new Event('loadedmetadata'));await Promise.resolve();
                    const resumed=v.currentTime;
                    wrapper.querySelector('[aria-label="Avancer de 10 secondes"]').click();const forward=v.currentTime;
                    wrapper.querySelector('[aria-label="Reculer de 10 secondes"]').click();const backward=v.currentTime;
                    v.dispatchEvent(new Event('pause'));const saved=localStorage.getItem(key);
                    const fallback=!wrapper.querySelector('.learning-player-start').hidden;wrapper.remove();
                    return {resumed,forward,backward,saved,fallback};
                })()`),{resumed:25,forward:35,backward:25,saved:'25',fallback:true});
                // Closing a quiz during correct-answer feedback must cancel pending advancement.
                await evaluate('(async()=>{await playLesson("quiz");document.querySelector("[data-choice=A]").click();document.getElementById("quiz-check-button").click();document.querySelector(".quiz-close-button").click();})()');
                await new Promise(resolve=>setTimeout(resolve,1400));
                assert.equal(await evaluate('!!document.querySelector(".quiz-modal")'),false);
                // Drive remains a provider embed rather than fake custom controls.
                assert.deepEqual(await evaluate('(()=>{const p=createSessionReplayPlayer("https://drive.google.com/file/d/synthetic/preview","Drive");return {tag:p.tagName,src:p.src};})()'),{tag:'IFRAME',src:'https://drive.google.com/file/d/synthetic/preview'});
                await evaluate('currentLiveSessions=[{id:"replay",title:"Replay",scheduled_at:"2026-10-01T18:00:00Z",replay_url:qaMedia}];openReplayPlayer(qaMedia,"Replay",[],"replay")');
                await until(()=>evaluate('!!document.querySelector(".learning-player video.course-replay-player")'),'same custom controls on replay');
                assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
                await evaluate('openReplayPlayer("https://drive.google.com/file/d/synthetic/preview","Drive",[],"drive")');
                assert.equal(await evaluate('!!document.querySelector("iframe.course-replay-player") && !document.querySelector(".learning-player")'),true,'Drive preserves its provider controls');
            }
            assert.deepEqual(errors,[]);
        });
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
