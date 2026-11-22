import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import ejs from 'ejs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('safe course Markdown, compatible plain text and responsive card/detail layouts', {
    skip: !process.env.TIMED_QA_CHROME, timeout: 60000,
}, async () => {
    const description='**Python pour tous** et *pratique* en français.\n\nتعلم **البرمجة** و _التطبيق_\n\n- Variables\n- **Boucles**\n\n1. Observer\n2. Pratiquer\n\n'+ 'Description complète. '.repeat(35);
    const course={id:'synthetic',title:'Informatique',description,lessons_count:4,quizzes_count:1,lives_count:2};
    const app=express();
    app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
    app.get('/api/courses',(_req,res)=>res.json([course,{...course,id:'plain',title:'Texte simple',description:'Une description existante, sans formatage.'},{...course,id:'empty',description:''}]));
    app.get('/api/courses/user/my-courses',(_req,res)=>res.json([]));
    for(const [path,view] of [['/preview-courses','index'],['/preview-details','details']]) app.get(path,async(_req,res)=>{
        const html=await ejs.renderFile(fileURLToPath(new URL(`../views/pages/courses/${view}.ejs`,import.meta.url)),{user:{id:'synthetic'},profile:null});
        res.send(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,script=>
            /src="\/js\/(course-markdown|course-image|courses|course-details)\.js/.test(script)?script:'')
            .replace('<body>','<body><style>#global-hydration-overlay{display:none!important}</style>'));
    });
    const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
    try {
        await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors,screenshot})=>{
            for(const width of [1440,360,390]) {
                await open('/preview-courses','synthetic',width);
                await until(()=>evaluate("document.querySelectorAll('.course-card-description').length===3"),'plain previews');
                assert.equal(await evaluate("document.querySelector('.course-card-description').children.length"),0);
                assert.ok(await evaluate("document.querySelector('.course-card-description').textContent.startsWith('Python pour tous et pratique en français.')"));
                assert.ok(await evaluate("!/[\\n*]/.test(document.querySelector('.course-card-description').textContent)"));
                assert.equal(await evaluate("getComputedStyle(document.querySelector('.course-card-description')).webkitLineClamp"),'3');
                assert.ok(await evaluate("(()=>{const el=document.querySelector('.course-card-description');return el.clientHeight<=parseFloat(getComputedStyle(el).lineHeight)*3+1;})()"));
                assert.ok(await evaluate("(()=>{const heights=[...document.querySelectorAll('.course-card-link')].map(el=>el.getBoundingClientRect().height);return Math.max(...heights)-Math.min(...heights)<1;})()"));
                assert.equal(await evaluate("document.querySelectorAll('.course-card-description')[1].textContent"),'Une description existante, sans formatage.');
                assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
                if(process.env.COURSE_MARKDOWN_SCREENSHOTS)await screenshot(process.env.COURSE_MARKDOWN_SCREENSHOTS+'-cards-'+width+'.png');
                await open('/preview-details','synthetic',width);
                await evaluate(`positionCourseHero();renderCourseInfo(${JSON.stringify(course)},4,false,null,2)`);
                const result=await evaluate("({strong:document.querySelectorAll('#course-description strong').length,em:document.querySelectorAll('#course-description em').length,p:document.querySelectorAll('#course-description p').length,lists:document.querySelectorAll('#course-description ul,#course-description ol').length,length:document.getElementById('course-description').textContent.length,overflow:document.documentElement.scrollWidth>innerWidth})");
                assert.equal(result.strong,3); assert.equal(result.em,2); assert.equal(result.lists,2);assert.ok(result.p>=3);assert.ok(result.length>700);assert.equal(result.overflow,false);
                // Match a course viewer who can try preview lessons but has no paid enrollment.
                await evaluate(`window.SyntaAPI={fetchCourseDetails:async()=>(${JSON.stringify({...course,modules:[],replay_previews:[{id:'old-replay',title:'Séance octobre',scheduled_at:'2025-10-15T19:00:00Z',duration_minutes:90}]})}),checkCourseAccess:async()=>false};loadCourseDetails('synthetic')`);
                assert.equal(await evaluate("document.getElementById('live-tab').hidden"),false);
                assert.equal(await evaluate("document.getElementById('chapters-tab').hidden"),true);
                assert.match(await evaluate("document.getElementById('course-live-list').textContent"),/octobre 2025.*Séance octobre/s);
                assert.equal(await evaluate("document.querySelector('#course-live-list a').getAttribute('href')"),'/app/offers');
                assert.equal(await evaluate("document.querySelector('#course-live-list [data-replay-url]')"),null);
                assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
                if(process.env.COURSE_MARKDOWN_SCREENSHOTS)await screenshot(process.env.COURSE_MARKDOWN_SCREENSHOTS+'-details-'+width+'.png');
            }
            const attacks=['<script>window.markdownAttack=1</script>','<img src=x onerror="window.markdownAttack=1">','<svg onload="window.markdownAttack=1"></svg>','[clic](javascript:alert(1))','**<iframe srcdoc="attack"></iframe>**','&lt;img src=x onerror=alert(1)&gt;'];
            assert.equal(await evaluate("CourseMarkdown.preview('\\\\*\\\\*Gras\\\\*\\\\*\\n- Un\\n- Deux\\n\\n  Texte   simple')"),'Gras Un Deux Texte simple');
            for(const input of attacks) {
                const result=await evaluate(`(()=>{const target=document.getElementById('course-description');target.replaceChildren(CourseMarkdown.render(${JSON.stringify(input)}));return {bad:!!target.querySelector('script,img,svg,iframe,a'),attributes:[...target.querySelectorAll('*')].some(el=>el.attributes.length),executed:!!window.markdownAttack};})()`);
                assert.deepEqual(result,{bad:false,attributes:false,executed:false});
                assert.equal(await evaluate(`(()=>{const el=document.getElementById('course-description');el.textContent=CourseMarkdown.preview(${JSON.stringify(input)});return el.children.length;})()`),0);
            }
            assert.deepEqual(errors,[]);
        });
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
