import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('admin lesson free switch saves both states and restores a failed save', {skip:!process.env.TIMED_QA_CHROME}, async()=>{
    const app=express();app.use(express.json());
    let free=false, fail=false; const changes=[];
    const html=(await readFile(new URL('../public/admin/pages/courses.html',import.meta.url),'utf8'))
        .replace(/<script[^>]+src="[^\"]*(?:authentication|admin-auth)\.js"[^>]*><\/script>/g,'')
        .replace('<body>','<body><script>window.auth={};</script>');
    app.get('/admin/pages/courses.html',(_req,res)=>res.send(html));
    app.get(['/api/admin/courses','/api/admin/offers','/api/admin/modules/library'],(_req,res)=>res.json({success:true,data:[]}));
    app.get('/api/admin/courses/course/modules',(_req,res)=>res.json({success:true,data:[{id:'chapter',title:'Python',order_index:0,lessons:[{id:'lesson',title:'Variables',type:'video',is_preview:free,order_index:0,resources:[]}]}]}));
    app.patch('/api/admin/lessons/lesson',(req,res)=>{
        changes.push(req.body);
        if(fail)return res.status(503).json({success:false,error:'Enregistrement indisponible'});
        free=req.body.isPreview;res.json({success:true});
    });
    app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    try {await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors})=>{
        for(const width of [1440,390,360]) {
            await open('/admin/pages/courses.html','synthetic',width);
            await evaluate("openChapterManager('course')");
            await until(()=>evaluate("!!document.querySelector('.lesson-preview-control input')"),'switch loaded');
            assert.equal(await evaluate("document.querySelector('.lesson-preview-control input').checked"),false);
            await evaluate("document.querySelector('.lesson-preview-control input').click()");
            await until(()=>evaluate("document.querySelector('.lesson-preview-control')?.textContent==='Gratuit'"),'free saved');
            assert.deepEqual(changes.at(-1),{isPreview:true});
            await evaluate("document.querySelector('.lesson-preview-control input').click()");
            await until(()=>evaluate("document.querySelector('.lesson-preview-control')?.textContent==='Payant'"),'paid saved');
            assert.deepEqual(changes.at(-1),{isPreview:false});
        }
        fail=true;
        await evaluate("document.querySelector('.lesson-preview-control input').click()");
        await until(()=>evaluate("!document.querySelector('.lesson-preview-control input').disabled"),'failed save restored');
        assert.equal(await evaluate("document.querySelector('.lesson-preview-control input').checked"),false);
        assert.equal(free,false);assert.deepEqual(errors,[]);
    });} finally {await new Promise(resolve=>server.close(resolve));}
});
