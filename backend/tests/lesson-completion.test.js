import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import ejs from 'ejs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('90% completion persists once, refreshes active/cached progress and retries failed saves', {skip:!process.env.TIMED_QA_CHROME,timeout:45000},async()=>{
    const completed=new Set(),calls=[];let fail=false;
    const course={id:'course',title:'Python',modules:[{id:'module',title:'Variables',lessons:[{id:'first',title:'Première',type:'video'},{id:'second',title:'Deuxième',type:'video'},{id:'quiz',title:'Quiz',type:'quiz',content:{questions:Array.from({length:3},()=>({type:'true_false',text:'Question',answer:true}))}}]}]};
    const app=express();app.use(express.json());
    app.get('/qa-completion',async(_req,res)=>{
        const html=await ejs.renderFile(fileURLToPath(new URL('../views/pages/courses/details.ejs',import.meta.url)),{user:{id:'synthetic'},profile:null});
        res.send(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,script=>/src="\/js\/(course-markdown|course-image|course-details)\.js/.test(script)?script:'').replaceAll('course-details-page-marker','qa-marker').replace(/<link\b[^>]*href="https?:[^>]*>/g,''));
    });
    app.get('/api/live/course/course',(_req,res)=>res.json([]));
    app.get('/api/courses/course/resource-types',(_req,res)=>res.json({types:[]}));
    app.get('/api/content/lesson/:id/resources',(_req,res)=>res.json({resources:[]}));
    app.get('/api/tracking/course-progress/course',(_req,res)=>res.json({total:2,completed:completed.size,percentage:completed.size*50,completedIds:[...completed]}));
    app.post('/api/tracking/progress',(req,res)=>{
        calls.push(req.body);if(fail)return res.status(503).json({error:'synthetic unavailable'});
        completed.add(req.body.lessonId);res.json({success:true});
    });
    app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    try{
        await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors})=>{
            const setup=async()=>{
                await evaluate(`window.qaPosition=0;window.qaDuration=100;window.prepareCourseVideo=(v)=>Object.defineProperties(v,{duration:{get:()=>qaDuration},currentTime:{get:()=>qaPosition},readyState:{get:()=>4}});
                    window.SyntaAPI={fetchCourseDetails:async()=>(${JSON.stringify(course)}),checkCourseAccess:async()=>true,getContentUrl:async id=>({lesson:${JSON.stringify(course.modules[0].lessons)}.find(l=>l.id===id),videoUrl:'/synthetic.mp4'}),updateVideoPosition:async()=>{},markLessonComplete:async(lessonId,progress)=>{const response=await fetch('/api/tracking/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lessonId,progress})});if(!response.ok)throw new Error('synthetic failed save');return response.json();}};
                    loadCourseDetails('course')`);
                await until(()=>evaluate('!!document.querySelector(".lesson-item")'),'course');
            };
            await open('/qa-completion','synthetic',390);await setup();
            await evaluate('playLesson("first",{autoplay:false})');
            await until(()=>evaluate('!!document.getElementById("current-lesson-video")'),'lesson');
            await evaluate('for(const duration of [0,NaN,Infinity]){qaDuration=duration;qaPosition=99;document.querySelector("video").dispatchEvent(new Event("timeupdate"));}qaDuration=100;qaPosition=89.9;document.querySelector("video").dispatchEvent(new Event("timeupdate"))');
            assert.equal(calls.length,0,'invalid durations and <90% never complete');
            await evaluate('qaPosition=90;document.querySelector("video").dispatchEvent(new Event("timeupdate"))');
            await until(()=>evaluate('document.querySelector(".course-sidebar [data-lesson-id=first] .completed")!==null'),'active sidebar checked');
            assert.deepEqual(calls,[{lessonId:'first',progress:100}]);
            await evaluate('for(let i=0;i<5;i++){document.querySelector("video").dispatchEvent(new Event("timeupdate"));document.querySelector("video").dispatchEvent(new Event("pause"));}document.querySelector("video").dispatchEvent(new Event("ended"))');
            await new Promise(r=>setTimeout(r,50));assert.equal(calls.length,1,'end/pause/time updates do not duplicate completion');
            await evaluate('switchCoursePlayerTo("chapters",false)');
            assert.equal(await evaluate('document.getElementById("progress-percentage-text").textContent'),'50%');
            assert.equal(await evaluate('document.getElementById("progress-completed-text").textContent'),'1 / 2 leçons');
            assert.match(await evaluate('document.querySelector(".module-meta").textContent'),/1\/2/);
            await open('/qa-completion','synthetic',1440);await setup();
            assert.equal(await evaluate('document.querySelector("[data-lesson-id=first] .lesson-icon").getAttribute("aria-label")'),'Terminée','reload reads saved completion');
            fail=true;
            await evaluate('playLesson("second",{autoplay:false})');
            await until(()=>evaluate('document.querySelector("video")?.dataset.lessonId==="second"'),'second lesson');
            await evaluate('qaPosition=90;document.querySelector("video").dispatchEvent(new Event("timeupdate"))');
            await until(()=>calls.length===2,'failed save attempted');await new Promise(r=>setTimeout(r,50));
            assert.equal(await evaluate('!!document.querySelector(".course-sidebar [data-lesson-id=second] .completed")'),false,'failed save must not show completed');
            await evaluate('document.querySelector("video").dispatchEvent(new Event("timeupdate"))');
            assert.equal(calls.length,2,'failed save retry is throttled');
            fail=false;
            // End retries immediately even when the 90% save failed recently.
            await evaluate('qaPosition=100;document.querySelector("video").dispatchEvent(new Event("ended"))');
            await until(()=>evaluate('!!document.querySelector(".course-sidebar [data-lesson-id=second] .completed")'),'retry completes');
            await evaluate('switchCoursePlayerTo("chapters",false)');
            assert.equal(await evaluate('document.getElementById("progress-percentage-text").textContent'),'100%');
            assert.equal(await evaluate('document.getElementById("progress-completed-text").textContent'),'2 / 2 leçons');
            assert.equal(calls.length,3);assert.equal(errors.filter(error=>error.includes('synthetic failed save')).length,1);assert.deepEqual(errors.filter(error=>!error.includes('synthetic failed save')),[]);
        });
    }finally{await new Promise(resolve=>server.close(resolve));}
});
